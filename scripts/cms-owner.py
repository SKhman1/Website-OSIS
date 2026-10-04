"""Infrastructure-only bootstrap/recovery. Never imported or bundled by the GUI.

Requires the operator's Wrangler authorization. Database selection is explicit.
Recovery resets the password AND MFA and revokes sessions/invitations; it is a
separate operation, never an upsert hidden behind ordinary account creation.
"""
import argparse
import getpass
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

def encode_password(password, salt=None):
    if not 15 <= len(password) <= 128 or len(password.encode('utf-8')) > 512:
        raise ValueError('Password harus 15–128 karakter.')
    salt = salt or secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode(), salt=salt, n=32768, r=8, p=3, maxmem=64*1024*1024, dklen=32)
    return f'$scrypt$32768$8$3${salt.hex()}${key.hex()}'

def enrollment_sql(username, activation):
    if not re.fullmatch(r'[a-z0-9][a-z0-9_.-]{2,63}',username) or not re.fullmatch(r'[a-f0-9]{64}',activation):raise ValueError('Username/kode aktivasi tidak valid.')
    digest=hashlib.sha256(activation.encode()).hexdigest()
    return ("INSERT INTO cms_mfa_enrollments(account_id,token_hash,auth_epoch,expires_at) "
            f"SELECT a.id,'{digest}',a.auth_epoch,{int(time.time())+86400} FROM cms_accounts a LEFT JOIN cms_account_security s ON s.account_id=a.id WHERE a.username='{username}' AND a.role='owner' AND a.enabled=1 AND s.secret IS NULL "
            "ON CONFLICT(account_id) DO UPDATE SET token_hash=excluded.token_hash,auth_epoch=excluded.auth_epoch,expires_at=excluded.expires_at;\nSELECT changes() AS changed;\n"
            f"INSERT INTO cms_access_audit(actor_id,action,target,created_at) SELECT 'infrastructure','mfa-activation-authorized',a.username,{int(time.time())} FROM cms_accounts a JOIN cms_mfa_enrollments e ON e.account_id=a.id WHERE a.username='{username}' AND e.token_hash='{digest}';\n")

def account_sql(mode, username, password, activation=None):
    if mode not in ('bootstrap', 'recover') or not re.fullmatch(r'[a-z0-9][a-z0-9_.-]{2,63}', username):
        raise ValueError('Operasi atau username tidak valid.')
    encoded, timestamp = encode_password(password), int(time.time())
    activation=activation or secrets.token_hex(32)
    if mode == 'bootstrap':
        return ("INSERT INTO cms_accounts(id,username,password_hash,role,enabled,auth_epoch,created_at) "
                f"SELECT '{uuid.uuid4()}','{username}','{encoded}','owner',1,1,{timestamp} "
                "WHERE NOT EXISTS(SELECT 1 FROM cms_accounts);\n"
                "SELECT changes() AS changed;\n"
                # Grant only if this operation actually inserted the unique new verifier.
                f"INSERT INTO cms_mfa_enrollments(account_id,token_hash,auth_epoch,expires_at) SELECT id,'{hashlib.sha256(activation.encode()).hexdigest()}',auth_epoch,{timestamp+86400} FROM cms_accounts WHERE username='{username}' AND password_hash='{encoded}';\n")
    return (f"UPDATE cms_accounts SET password_hash='{encoded}',enabled=1,auth_epoch=auth_epoch+1 WHERE username='{username}' AND role='owner';\n"
            "SELECT changes() AS changed;\n"
            f"DELETE FROM cms_sessions WHERE account_id IN(SELECT id FROM cms_accounts WHERE username='{username}' AND role='owner');\n"
            f"DELETE FROM cms_recovery_codes WHERE account_id IN(SELECT id FROM cms_accounts WHERE username='{username}' AND role='owner');\n"
            f"DELETE FROM cms_account_security WHERE account_id IN(SELECT id FROM cms_accounts WHERE username='{username}' AND role='owner');\n"
            f"UPDATE cms_invitations SET revoked=1 WHERE issuer_id IN(SELECT id FROM cms_accounts WHERE username='{username}' AND role='owner');\n"
            f"INSERT INTO cms_access_audit(actor_id,action,target,created_at) SELECT 'infrastructure','owner-recovered',username,{timestamp} FROM cms_accounts WHERE username='{username}' AND role='owner';\n"+enrollment_sql(username,activation))

def execute_sql(project, database, sql, local=False):
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', database): raise ValueError('Nama database tidak valid.')
    project=Path(project).resolve(); node=shutil.which('node'); entry=project/'node_modules/wrangler/bin/wrangler.js'
    if not node or not entry.is_file(): raise ValueError('Jalankan npm ci di folder proyek terlebih dahulu.')
    fd, filename=tempfile.mkstemp(prefix='osis-infrastructure-',suffix='.sql')
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as stream: stream.write(sql)
        result=subprocess.run([node,str(entry),'d1','execute',database,'--file',filename,'--local' if local else '--remote','--json'],cwd=project,capture_output=True,text=True,encoding='utf-8',timeout=90,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        if result.returncode: raise RuntimeError('Operasi gagal. Periksa otorisasi Wrangler, target database, dan migrasi. Output berisi data sensitif tidak ditampilkan.')
        # Remote --file uses D1 bulk import and may emit progress rather than JSON;
        # do not echo it (it may contain SQL/verifiers). Confirm account operations
        # separately through a bounded metadata-only query.
        try:return json.loads(result.stdout)
        except json.JSONDecodeError:return []
    finally: Path(filename).unlink(missing_ok=True)

def activation_exists(project,database,username,activation,local=False):
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',database) or not re.fullmatch(r'[a-z0-9][a-z0-9_.-]{2,63}',username) or not re.fullmatch(r'[a-f0-9]{64}',activation):raise ValueError('Target aktivasi tidak valid.')
    # Only a digest appears in this read-only query; never a password/raw token.
    digest=hashlib.sha256(activation.encode()).hexdigest()
    sql=f"SELECT COUNT(*) AS changed FROM cms_mfa_enrollments e JOIN cms_accounts a ON a.id=e.account_id WHERE a.username='{username}' AND e.token_hash='{digest}' AND e.auth_epoch=a.auth_epoch AND a.enabled=1 AND e.expires_at>{int(time.time())}"
    project=Path(project).resolve();entry=project/'node_modules/wrangler/bin/wrangler.js'
    result=subprocess.run([shutil.which('node'),str(entry),'d1','execute',database,'--command',sql,'--local' if local else '--remote','--json'],cwd=project,capture_output=True,text=True,encoding='utf-8',timeout=90,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    if result.returncode:raise RuntimeError('Tidak dapat memverifikasi aktivasi. Jangan membagikan kode sebelum berhasil.')
    results=json.loads(result.stdout)
    return any(row.get('changed')==1 for item in results for row in item.get('results',[]))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode',choices=['bootstrap','recover','authorize-mfa'])
    parser.add_argument('--database',required=True)
    parser.add_argument('--project',default=str(Path(__file__).resolve().parent.parent))
    parser.add_argument('--local',action='store_true')
    args=parser.parse_args()
    print('Target:',args.database,'LOCAL' if args.local else 'CLOUDFLARE')
    username=input('Username owner: ').strip()
    if args.mode=='recover' and input('Untuk mencabut sesi dan mereset password/MFA, ketik username sekali lagi: ').strip()!=username: raise SystemExit('Pemulihan dibatalkan.')
    activation=secrets.token_hex(32)
    if args.mode=='authorize-mfa':sql=enrollment_sql(username,activation)
    else:
        password=getpass.getpass('Password baru (minimal 15 karakter): ')
        if password!=getpass.getpass('Ulangi password: '): raise SystemExit('Password tidak cocok.')
        sql=account_sql(args.mode,username,password,activation)
    execute_sql(args.project,args.database,sql,args.local)
    changed=activation_exists(args.project,args.database,username,activation,args.local)
    if not changed: raise SystemExit('Tidak ada akun diubah. Bootstrap hanya untuk database kosong; recovery hanya untuk owner yang sudah ada.')
    print('Selesai. Login memakai Console terbaru dan aktifkan autentikator. Tidak ada konfigurasi Cloudflare yang diberikan ke pengurus.')
    print('Kode aktivasi owner (24 jam, jangan bagikan / commit):',activation)

if __name__=='__main__': main()
