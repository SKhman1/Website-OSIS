"""Disposable native GUI MFA/invitation workflow against LOCAL Wrangler only.

No real account, remote request, content write or saved settings. Secrets are not printed.
"""
import hashlib
import hmac
import importlib
import os
import re
import secrets
import sys
import time
import base64
from pathlib import Path
os.environ['QT_QPA_PLATFORM']='offscreen'
root=Path(__file__).resolve().parent.parent;sys.path.insert(0,str(root/'desktop-admin'))
owner=importlib.import_module('cms-owner')
from main import Window,STYLE
from login_check import MemorySettings
from security_ui import EnrollmentDialog,AccessDialog,InvitationDialog
import security_ui, main
from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QTimer

name='qa-gui-owner-'+secrets.token_hex(5);invitee='qa-gui-invite-'+secrets.token_hex(5)
password=secrets.token_urlsafe(30);next_password=secrets.token_urlsafe(30);editor_password=secrets.token_urlsafe(30);activation=secrets.token_hex(32)
sql=f"INSERT INTO cms_accounts VALUES('{name}','{name}','{owner.encode_password(password)}','owner',1,1,0);\n"+owner.enrollment_sql(name,activation)
owner.execute_sql(root,'vnd-smkdipo1-content',sql,local=True)
state=dict(step=0,passed=False,codes=[],invitation='',error=None)
try:
    app=QApplication([]);app.setStyleSheet(STYLE);window=Window(root,'http://127.0.0.1:8791');window.settings=MemorySettings();window.show();window.username.setText(name)
    main.message=lambda *args,**kwargs:False
    security_ui.notice=lambda *args,**kwargs:None
    timer=QTimer();timer.setInterval(25);timeout=QTimer();timeout.setSingleShot(True)
    def code(secret):
        counter=int(time.time()/30).to_bytes(8,'big');mac=hmac.new(base64.b32decode(secret),counter,hashlib.sha1).digest();offset=mac[-1]&15
        return str((int.from_bytes(mac[offset:offset+4],'big')&0x7fffffff)%1000000).zfill(6)
    def finish(result):timer.stop();timeout.stop();app.exit(result)
    def tick():
        if window.busy:return
        dialog=QApplication.activeModalWidget()
        if dialog and getattr(dialog,'busy',False):return
        try:
            step=state['step']
            if os.environ.get('CMS_QA_TRACE'):print('GUI QA stage',step,flush=True)
            if step==0:window.password.setText(password);window.login()
            elif step==1:
                if not isinstance(dialog,EnrollmentDialog):return
                assert window.root.currentIndex()==0 and window.content is None
                dialog.activation.setText(activation);dialog.current.setText(password);dialog.begin_setup()
            elif step==2:
                if not dialog or not dialog.finish.isEnabled():return
                secret=re.search(r'Kunci manual: ([A-Z2-7]{32})',dialog.output.toPlainText())[1]
                dialog.code.setText(code(secret));dialog.next.setText(next_password);dialog.confirm.setText(next_password);dialog.confirm_setup()
            elif step==3:
                if not dialog or not dialog.completed:return
                state['codes']=re.findall(r'(?m)^[a-f0-9]{24}$',dialog.output.toPlainText());assert len(state['codes'])==10;dialog.accept()
            elif step==4:
                if dialog:return
                assert window.root.currentIndex()==0
                window.password.setText(next_password);window.code.setText(state['codes'][0]);window.login()
            elif step==5:
                assert window.root.currentIndex()==1 and window.content and window.access_button.isVisible();QTimer.singleShot(0,window.manage_access)
            elif step==6:
                if not isinstance(dialog,AccessDialog) or not dialog.accounts:return
                dialog.username.setText(invitee);dialog.password.setText(next_password);dialog.code.setText(state['codes'][1]);dialog.invite()
            elif step==7:
                match=re.search(r'(?m)^[a-f0-9]{64}$',dialog.output.toPlainText())
                if not match:return
                state['invitation']=match[0];dialog.reject()
            elif step==8:
                if dialog:return
                window.logout()
            elif step==9:
                assert window.root.currentIndex()==0;QTimer.singleShot(0,window.accept_invitation)
            elif step==10:
                if not isinstance(dialog,InvitationDialog):return
                dialog.invitation.setText(state['invitation']);dialog.password.setText(editor_password);dialog.confirm.setText(editor_password);dialog.submit()
            elif step==11:
                if dialog:return
                window.username.setText(invitee);window.password.setText(editor_password);window.code.clear();window.login()
            elif step==12:
                assert window.root.currentIndex()==1 and not window.publish_button.isEnabled() and not window.access_button.isVisible();window.logout()
            else:
                assert window.root.currentIndex()==0 and not window.client.token
                state['passed']=True;finish(0);return
            state['step']+=1
        except Exception as exc:state['error']=type(exc).__name__;finish(1)
    timeout.timeout.connect(lambda:finish(1));timeout.start(60000);timer.timeout.connect(tick);timer.start();app.exec()
    if not state['passed']:raise RuntimeError('GUI security workflow failed at step '+str(state['step'])+' ('+str(state['error'])+'). No secrets printed.')
    print('PASS native GUI: restricted owner, activation, MFA/password rotation, recovery login, owner invitation, recipient activation, editor restrictions, logout.')
finally:
    ids=f"SELECT id FROM cms_accounts WHERE username IN('{name}','{invitee}')"
    sql=''
    for table,field in [('cms_mfa_enrollments','account_id'),('cms_recovery_codes','account_id'),('cms_account_security','account_id'),('cms_sessions','account_id'),('cms_invitations','issuer_id'),('cms_access_audit','actor_id')]:sql+=f'DELETE FROM {table} WHERE {field} IN({ids});\n'
    sql+=f"DELETE FROM cms_accounts WHERE username IN('{name}','{invitee}');"
    owner.execute_sql(root,'vnd-smkdipo1-content',sql,local=True)
