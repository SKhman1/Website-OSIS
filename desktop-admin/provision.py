"""Owner-only account provisioning via the existing local Wrangler authorization.

There is intentionally no registration/bootstrap API. Passwords never leave this
process: only a salted scrypt verifier is written through Wrangler to D1.
"""
import hashlib
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
    if not 15 <= len(password) <= 128 or len(password.encode("utf-8")) > 512:
        raise ValueError("Password harus 15–128 karakter.")
    salt = salt or secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=32768, r=8, p=3, maxmem=64 * 1024 * 1024, dklen=32)
    return f"$scrypt$32768$8$3${salt.hex()}${key.hex()}"

def provision_account(project, username, password, role="owner", local=False):
    if not re.fullmatch(r"[a-z0-9][a-z0-9_.-]{2,63}", username) or role not in ("owner", "editor"):
        raise ValueError("Username harus 3–64 karakter: huruf kecil, angka, titik, _ atau -.")
    project = Path(project).resolve()
    entry = project / "node_modules" / "wrangler" / "bin" / "wrangler.js"
    node = shutil.which("node")
    if not node or not entry.is_file() or not (project / "wrangler.jsonc").is_file():
        raise ValueError("Pilih folder Website-OSIS yang sudah memiliki Node dan Wrangler.")
    encoded = encode_password(password)
    sql = ("INSERT INTO cms_accounts(id,username,password_hash,role,enabled,auth_epoch,created_at) "
           f"VALUES('{uuid.uuid4()}','{username}','{encoded}','{role}',1,1,{int(time.time())}) "
           "ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash,role=excluded.role,enabled=1,auth_epoch=auth_epoch+1;\n"
           f"DELETE FROM cms_sessions WHERE account_id IN (SELECT id FROM cms_accounts WHERE username='{username}');\n")
    # Never put password/verifier on the command line or in tracked project files.
    fd, filename = tempfile.mkstemp(prefix="osis-account-", suffix=".sql")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(sql)
        command = [node, str(entry), "d1", "execute", "vnd-smkdipo1-content", "--file", filename]
        command += ["--local"] if local else ["--remote"]
        result = subprocess.run(command, cwd=project, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=90,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        if result.returncode:
            raise RuntimeError("Setup akun gagal. Periksa otorisasi Wrangler dan migrasi database; detail dapat dilihat di log Wrangler lokal.")
    finally:
        Path(filename).unlink(missing_ok=True)

if __name__ == "__main__":
    import argparse
    import getpass
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", default=str(Path(__file__).resolve().parent.parent))
    parser.add_argument("--local", action="store_true")
    parser.add_argument("--role", choices=("owner", "editor"), default="owner")
    args = parser.parse_args()
    username = input("Username: ").strip()
    password = getpass.getpass("Password (minimal 15 karakter): ")
    if password != getpass.getpass("Ulangi password: "):
        raise SystemExit("Password tidak cocok.")
    provision_account(args.project, username, password, args.role, args.local)
    print("Akun berhasil disiapkan. Login lewat VND Console.")
