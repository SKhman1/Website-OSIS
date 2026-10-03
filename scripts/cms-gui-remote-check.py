"""GUI event-loop integration with real Cloudflare, using a disposable editor.

No real user's password is read; no content is saved or published. The temporary
account and sessions are removed even if the test fails.
"""
import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
import secrets
import subprocess
import sys
import tempfile
from pathlib import Path
root=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'desktop-admin'))
import main
from login_check import MemorySettings
from provision import provision_account
from PySide6.QtCore import QTimer
from PySide6.QtWidgets import QApplication

username='qa-gui-'+secrets.token_hex(8)
password=secrets.token_urlsafe(32)
try:
    provision_account(root,username,password,'editor')
    app=QApplication([]);window=main.Window(root,main.BASE_URL)
    window.settings=MemorySettings();window.url.setText(main.BASE_URL);window.username.setText(username);window.password.setText(password);window.show()
    state={'step':0,'passed':False,'error':None}
    def failure(*args,**kwargs): state['error']='GUI request failed';app.exit(1);return False
    main.message=failure
    timer=QTimer();timer.setInterval(30)
    def tick():
        if window.busy:return
        try:
            step=state['step']
            if step==0:window.login()
            elif step==1:
                assert window.root.currentIndex()==1 and len(window.content['departments'])==10 and window.isVisible()
                window.load_content()
            elif step==2:window.nav.setCurrentRow(5)
            elif step==3:
                assert isinstance(window.history,list);window.logout()
            else:
                assert window.root.currentIndex()==0 and not window.client.token and window.isVisible()
                state['passed']=True;app.exit(0);return
            state['step']+=1
        except Exception:
            state['error']='GUI state assertion failed';app.exit(1)
    timeout=QTimer();timeout.setSingleShot(True);timeout.timeout.connect(lambda:app.exit(1));timeout.start(45000)
    timer.timeout.connect(tick);timer.start()
    code=app.exec();timer.stop();timeout.stop()
    if code or not state['passed']:raise RuntimeError(state['error'] or 'GUI check timed out')
    print('PASS real Cloudflare GUI login, content loading, refresh, history and logout; window stays open')
finally:
    password=''
    sql=(f"DELETE FROM cms_sessions WHERE account_id IN (SELECT id FROM cms_accounts WHERE username='{username}');\n"
         f"DELETE FROM cms_accounts WHERE username='{username}';\n")
    with tempfile.TemporaryDirectory() as folder:
        file=Path(folder)/'cleanup.sql';file.write_text(sql,encoding='utf-8')
        result=subprocess.run(['node',str(root/'node_modules/wrangler/bin/wrangler.js'),'d1','execute','vnd-smkdipo1-content','--remote','--file',str(file)],cwd=root,capture_output=True)
        if result.returncode:raise RuntimeError('Disposable GUI account cleanup failed')
    print('PASS disposable GUI account removed')
