"""Exercise real HTTP + GUI callbacks against a disposable loopback test server.

Never reads real passwords, uses Cloudflare, saves settings, or publishes content.
Included in the frozen self-test to exercise the exact packaged event loop.
"""
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from PySide6.QtCore import QTimer

class MemorySettings:
    def __init__(self): self.values = {}
    def setValue(self, key, value): self.values[key] = value

def begin_login_check(app, window):
    content = dict(schemaVersion=1, vision='Disposable GUI HTTP test', missions=['Test only'], people=[], departments=[], programs=[], events=[])
    password = 'Only a disposable local GUI test password.'
    token = 'a' * 64
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def respond(self, data, status=200):
            payload=json.dumps(data).encode(); self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(payload))); self.end_headers(); self.wfile.write(payload)
        def do_POST(self):
            data=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))))
            if self.path == '/api/manage/login':
                if data.get('username') == 'qa-gui' and data.get('password') == password:
                    self.respond(dict(ok=True,token=token,user=dict(username='qa-gui',role='editor')))
                else: self.respond(dict(ok=False,error='Username atau password salah.'),401)
            elif self.path == '/api/manage/logout': self.respond(dict(ok=True))
            else: self.respond(dict(ok=False,error='Unknown test route'),404)
        def do_GET(self):
            if self.headers.get('Authorization') != 'Bearer '+token: self.respond(dict(error='Login required'),401)
            elif self.path == '/api/manage/content': self.respond(dict(ok=True,version=0,publishedVersion=0,content=content))
            elif self.path == '/api/manage/history': self.respond(dict(ok=True,items=[]))
            else: self.respond(dict(error='Unknown test route'),404)
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    thread=threading.Thread(target=lambda:server.serve_forever(poll_interval=.05),daemon=True);thread.start()
    window.settings=MemorySettings()
    window.url.setText(f'http://127.0.0.1:{server.server_port}')
    window.username.setText('qa-gui')
    module=sys.modules[window.__class__.__module__]
    original_message=module.message; messages=[]
    module.message=lambda *args,**kwargs:messages.append(args[1]) or False
    state={'step':0,'passed':False,'error':None}
    timer=QTimer(window);timer.setInterval(20)
    timeout=QTimer(window);timeout.setSingleShot(True)
    def finish(code):
        timer.stop();timeout.stop();app.exit(code)
    def tick():
        if window.busy: return
        try:
            step=state['step']
            if step==0:
                window.password.setText(password);window.login()
            elif step==1:
                assert window.root.currentIndex()==1 and window.content['vision']==content['vision']
                assert not window.publish_button.isEnabled() and window.isVisible()
                window.load_content()
            elif step==2:
                assert window.content['vision']==content['vision'];window.nav.setCurrentRow(5)
            elif step==3:
                assert window.history==[];window.logout()
            elif step==4:
                assert window.root.currentIndex()==0 and not window.client.token
                window.password.setText('Wrong disposable password');window.login()
            elif step==5:
                assert messages and window.root.currentIndex()==0 and window.login_page.isEnabled() and window.isVisible()
                window.password.setText(password);window.login()
            elif step==6:
                assert window.root.currentIndex()==1 and window.content and window.isVisible()
                assert set(window.settings.values)=={'apiUrl','username'}
                window.logout()
            else:
                assert window.root.currentIndex()==0 and not window.client.token
                state['passed']=True;finish(0);return
            state['step']+=1
        except Exception as exc:
            state['error']=type(exc).__name__;finish(1)
    timeout.timeout.connect(lambda:finish(1));timeout.start(8000);timer.timeout.connect(tick);timer.start()
    def cleanup():
        timer.stop();timeout.stop();module.message=original_message
        server.shutdown();server.server_close();thread.join(timeout=1)
    return state, cleanup
