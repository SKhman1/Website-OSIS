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
import sys
import tempfile
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit

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
        result=run_wrangler(project,[node,str(entry),'d1','execute',database,'--file',filename,'--local' if local else '--remote','--json'])
        # Remote --file uses D1 bulk import and may emit progress rather than JSON;
        # do not echo it (it may contain SQL/verifiers). Confirm account operations
        # separately through a bounded metadata-only query.
        try:return json.loads(result.stdout)
        except json.JSONDecodeError:return []
    finally: Path(filename).unlink(missing_ok=True)

def wrangler_failure(result):
    # Classify locally; never echo provider output, SQL, verifiers or tokens.
    detail=(result.stderr+'\n'+result.stdout).lower()
    if any(word in detail for word in ('authentication error','not logged in','authenticate','unauthorized','not authorized','forbidden','permission','10000','9109')):
        return ('Wrangler belum terotorisasi atau izin Cloudflare tidak cukup. Jalankan '
                'node node_modules/wrangler/bin/wrangler.js login dari folder proyek, '
                'lalu ulangi setup. Jika memakai CLOUDFLARE_API_TOKEN, periksa izin token '
                'atau hapus variabel itu dari terminal untuk memakai login Wrangler pribadi.')
    if 'no such table' in detail or 'no such column' in detail:
        return 'Skema database belum lengkap. Pemilik infrastruktur perlu menerapkan migrasi CMS ke database yang dipilih.'
    if any(word in detail for word in ('fetch failed','failed to fetch','econn','etimedout','enotfound','timed out','network','proxy','certificate')):
        return 'Koneksi Wrangler ke Cloudflare gagal. Periksa koneksi/proxy dan jam komputer, lalu ulangi perintah. Data rahasia tidak ditampilkan.'
    if any(word in detail for word in ('database not found','could not find','couldn\'t find','does not exist')):
        return 'Database tidak ditemukan dalam akun Cloudflare yang aktif. Periksa nama database dan akun Wrangler.'
    if 'syntax error' in detail or 'sqlite_error' in detail:
        return 'D1 menolak query setup. Periksa versi script dan migrasi database; query dan data rahasia tidak ditampilkan.'
    return 'Wrangler gagal menjalankan operasi D1 (exit '+str(result.returncode)+'). Jalankan kembali dari terminal yang sudah login Cloudflare. Output mentah tidak ditampilkan karena dapat memuat data rahasia.'

def run_wrangler(project, command):
    try:
        result=subprocess.run(command,cwd=project,capture_output=True,text=True,encoding='utf-8',timeout=90,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    except subprocess.TimeoutExpired:
        raise RuntimeError('Cloudflare tidak merespons dalam 90 detik. Periksa koneksi lalu ulangi setup; jangan membagikan kode yang belum terverifikasi.') from None
    except OSError:
        raise RuntimeError('Node/Wrangler tidak dapat dijalankan. Periksa instalasi Node dan jalankan npm ci di folder proyek.') from None
    if result.returncode:raise RuntimeError(wrangler_failure(result))
    return result

def owner_state(project,database,username,local=False):
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',database) or not re.fullmatch(r'[a-z0-9][a-z0-9_.-]{2,63}',username):raise ValueError('Nama database/username tidak valid.')
    project=Path(project).resolve();node=shutil.which('node');entry=project/'node_modules/wrangler/bin/wrangler.js'
    if not node or not entry.is_file():raise ValueError('Jalankan npm ci di folder proyek terlebih dahulu.')
    sql=f"SELECT a.role,a.enabled,(s.secret IS NOT NULL) AS mfa_enabled FROM cms_accounts a LEFT JOIN cms_account_security s ON s.account_id=a.id WHERE a.username='{username}'"
    result=run_wrangler(project,[node,str(entry),'d1','execute',database,'--command',sql,'--local' if local else '--remote','--json'])
    try:rows=[row for item in json.loads(result.stdout) for row in item.get('results',[])]
    except (ValueError,TypeError,AttributeError):raise RuntimeError('Respons status akun tidak dapat dibaca. Tidak ada kode aktivasi diterbitkan.') from None
    return rows[0] if rows else None

def activation_exists(project,database,username,activation,local=False):
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',database) or not re.fullmatch(r'[a-z0-9][a-z0-9_.-]{2,63}',username) or not re.fullmatch(r'[a-f0-9]{64}',activation):raise ValueError('Target aktivasi tidak valid.')
    # Only a digest appears in this read-only query; never a password/raw token.
    digest=hashlib.sha256(activation.encode()).hexdigest()
    sql=f"SELECT COUNT(*) AS changed FROM cms_mfa_enrollments e JOIN cms_accounts a ON a.id=e.account_id WHERE a.username='{username}' AND e.token_hash='{digest}' AND e.auth_epoch=a.auth_epoch AND a.enabled=1 AND e.expires_at>{int(time.time())}"
    project=Path(project).resolve();entry=project/'node_modules/wrangler/bin/wrangler.js'
    result=run_wrangler(project,[shutil.which('node'),str(entry),'d1','execute',database,'--command',sql,'--local' if local else '--remote','--json'])
    results=json.loads(result.stdout)
    return any(row.get('changed')==1 for item in results for row in item.get('results',[]))

def show_activation(username, activation):
    # Infrastructure-only display; the GUI package never imports this module.
    # Keep the raw activation out of tool output and files.
    from PySide6.QtCore import Qt
    from PySide6.QtGui import QFont
    from PySide6.QtWidgets import QApplication,QDialog,QVBoxLayout,QLabel,QPlainTextEdit,QPushButton
    app=QApplication.instance() or QApplication([])
    app.setFont(QFont('Segoe UI' if os.name=='nt' else 'Sans Serif',10))
    dialog=QDialog();dialog.setWindowTitle('Kode aktivasi owner · '+username);dialog.resize(620,330)
    layout=QVBoxLayout(dialog)
    info=QLabel('Akun '+username+' siap untuk aktivasi. Salin kode di bawah ke kolom Kode aktivasi owner pada VND Console. Kode dari HP dikosongkan sampai kunci autentikator dibuat. Berlaku 24 jam; jangan bagikan kode ini.');info.setTextFormat(Qt.TextFormat.PlainText);info.setWordWrap(True);layout.addWidget(info)
    output=QPlainTextEdit();output.setReadOnly(True);output.setPlainText(activation);layout.addWidget(output)
    copy=QPushButton('Salin kode aktivasi');copy.clicked.connect(lambda:app.clipboard().setText(output.toPlainText()));layout.addWidget(copy)
    close=QPushButton('Tutup setelah kode disalin');close.clicked.connect(dialog.accept);layout.addWidget(close)
    dialog.exec();output.clear()

def launch_enrollment(project, username, password, activation, base_url='https://vnd-smkdipo1.pages.dev'):
    # This privileged helper stays in scripts/ and requires the custodian's
    # Wrangler login. The distributable panel cannot issue its own grants.
    sys.path.insert(0,str(Path(project).resolve()/'desktop-admin'))
    from client import Client,ApiError
    from main import Window,STYLE
    from security_ui import EnrollmentDialog
    from PySide6.QtGui import QFont
    from PySide6.QtWidgets import QApplication
    client=Client(base_url)
    try:
        result=client.login(username,password)
        if not result.get('mfaPending'):raise ValueError('MFA sudah aktif. Gunakan login biasa di VND Console.')
        setup=client.request('POST','/api/manage/mfa/begin',dict(current=password,activation=activation))
    except ApiError as exc:raise RuntimeError(str(exc)) from None
    app=QApplication.instance() or QApplication([]);app.setApplicationName('VND Console');app.setOrganizationName('VimsatiNattaDarsa');app.setFont(QFont('Segoe UI' if os.name=='nt' else 'Sans Serif',10));app.setStyleSheet(STYLE)
    window=Window(Path(project),base_url);window.client=client
    dialog=EnrollmentDialog(None,client);dialog.activation.setText(activation);dialog.current.setText(password);dialog.started(setup)
    password=activation='';setup.clear()
    print('QR aktivasi ditampilkan hanya di dialog lokal. Scan dengan Google Authenticator dan konfirmasi dari HP.',flush=True)
    dialog.exec()
    completed=dialog.completed
    dialog.clear_sensitive()
    if not completed:
        client.logout();window.lock();print('Aktivasi belum selesai. Akun tetap terlindungi dan memerlukan MFA.',flush=True);return
    window.lock();window.username.setText(username);window.show()
    print('PASS autentikator owner aktif. Simpan kode pemulihan dan login dengan password baru serta kode HP berikutnya.',flush=True)
    app.exec()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode',choices=['bootstrap','recover','authorize-mfa'])
    parser.add_argument('--database',required=True)
    parser.add_argument('--project',default=str(Path(__file__).resolve().parent.parent))
    parser.add_argument('--local',action='store_true')
    parser.add_argument('--username',help='Username owner (opsional; jika kosong ditanyakan secara interaktif).')
    parser.add_argument('--show-activation',action='store_true',help='Tampilkan kode secara lokal dalam dialog native, tanpa mencetak ke terminal.')
    parser.add_argument('--enroll',action='store_true',help='Buka setup native langsung pada QR Google Authenticator; membutuhkan password akun.')
    parser.add_argument('--url',default='https://vnd-smkdipo1.pages.dev',help='Alamat website untuk --enroll; ganti untuk deployment sekolah lain.')
    args=parser.parse_args()
    if args.enroll and args.local and urlsplit(args.url).hostname not in ('127.0.0.1','localhost','::1'):
        raise ValueError('Untuk setup database lokal, tentukan --url localhost agar password pengujian tidak dikirim ke website publik.')
    print('Target:',args.database,'LOCAL' if args.local else 'CLOUDFLARE')
    username=args.username.strip() if args.username else input('Username owner: ').strip()
    if args.mode=='recover' and input('Untuk mencabut sesi dan mereset password/MFA, ketik username sekali lagi: ').strip()!=username: raise SystemExit('Pemulihan dibatalkan.')
    activation=secrets.token_hex(32)
    if args.mode=='authorize-mfa':
        state=owner_state(args.project,args.database,username,args.local)
        if not state:raise ValueError('Username tidak ditemukan. Bootstrap hanya dipakai saat database belum mempunyai akun.')
        if state['role']!='owner' or not state['enabled']:raise ValueError('Akun ini bukan owner aktif. Tidak ada kode aktivasi diterbitkan.')
        if state['mfa_enabled']:raise ValueError('Autentikator sudah aktif. Login dengan kode dari HP; pemulihan MFA adalah operasi recover yang terpisah.')
        sql=enrollment_sql(username,activation)
        if args.enroll:password=getpass.getpass('Password akun saat ini: ')
    else:
        password=getpass.getpass('Password baru (minimal 15 karakter): ')
        if password!=getpass.getpass('Ulangi password: '): raise SystemExit('Password tidak cocok.')
        sql=account_sql(args.mode,username,password,activation)
    execute_sql(args.project,args.database,sql,args.local)
    changed=activation_exists(args.project,args.database,username,activation,args.local)
    if not changed: raise SystemExit('Tidak ada akun diubah. Bootstrap hanya untuk database kosong; recovery hanya untuk owner yang sudah ada.')
    if args.enroll:launch_enrollment(args.project,username,password,activation,args.url);return
    print('Selesai. Login memakai Console terbaru dan aktifkan autentikator. Tidak ada konfigurasi Cloudflare yang diberikan ke pengurus.')
    if args.show_activation:show_activation(username,activation)
    else:print('Kode aktivasi owner (24 jam, jangan bagikan / commit):',activation)

if __name__=='__main__':
    try:main()
    except (ValueError,RuntimeError) as exc:print('Setup belum selesai:',str(exc),file=sys.stderr);raise SystemExit(1)
