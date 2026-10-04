"""Read-only deployed API checks with a disposable editor, removed in finally.

No student submissions, publishing, or real account passwords are involved.
"""
import json
import secrets
import subprocess
import sys
import tempfile
from pathlib import Path
root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / 'desktop-admin'))
from client import Client, ApiError
from cms_test_fixture import create_test_account as provision_account

base = sys.argv[1]
username = 'qa-' + secrets.token_hex(8)
password = secrets.token_urlsafe(32)
try:
    provision_account(root, username, password, 'editor')
    client = Client(base)
    public = client.request('GET', '/api/content')
    assert len(public['content']['departments']) == 10
    try: client.request('GET', '/api/manage/content')
    except ApiError as exc: assert exc.status == 401
    else: raise AssertionError('Unauthenticated read accepted')
    client.login(username, password)
    draft = client.request('GET', '/api/manage/content')
    assert client.user['role'] == 'editor' and draft['version'] >= 0
    try: client.request('POST', '/api/manage/publish', {'version': draft['version']})
    except ApiError as exc: assert exc.status == 403
    else: raise AssertionError('Editor publish accepted')
    client.logout()
    print('PASS remote D1 binding, public read, password login, private draft, editor restrictions, logout')
finally:
    password = ''
    sql = (f"DELETE FROM cms_sessions WHERE account_id IN (SELECT id FROM cms_accounts WHERE username='{username}');\n"
           f"DELETE FROM cms_accounts WHERE username='{username}';\n")
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / 'cleanup.sql'; path.write_text(sql, encoding='utf-8')
        result = subprocess.run(['node', str(root/'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'vnd-smkdipo1-content', '--remote', '--file', str(path)], cwd=root, capture_output=True)
        if result.returncode: raise RuntimeError('Disposable account cleanup failed; remove ' + username)
    print('PASS disposable account removed')
