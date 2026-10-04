"""Authorized Cloudflare security smoke test, temporary accounts only.

Never resets real users or writes/publishes school content. No secrets printed.
"""
import base64
import hashlib
import hmac
import importlib
import secrets
import sys
import time
from pathlib import Path
root=Path(__file__).resolve().parent.parent;sys.path.insert(0,str(root/'desktop-admin'))
from client import Client,ApiError
owner=importlib.import_module('cms-owner')
name='qa-security-'+secrets.token_hex(7);invitee='qa-invited-'+secrets.token_hex(7)
password=secrets.token_urlsafe(32);replacement=secrets.token_urlsafe(32);activation=secrets.token_hex(32)
def denied(fn,status):
    try:fn()
    except ApiError as exc:assert exc.status==status;return
    raise AssertionError('Request was not rejected.')
try:
    sql=f"INSERT INTO cms_accounts VALUES('{name}','{name}','{owner.encode_password(password)}','owner',1,1,0);\n"+owner.enrollment_sql(name,activation)
    owner.execute_sql(root,'vnd-smkdipo1-content',sql,local=False)
    client=Client('https://vnd-smkdipo1.pages.dev');public=client.request('GET','/api/content')
    result=client.login(name,password);assert result['mfaPending']
    denied(lambda:client.request('GET','/api/manage/content'),403)
    denied(lambda:client.request('POST','/api/manage/mfa/begin',dict(current=password)),403)
    setup=client.request('POST','/api/manage/mfa/begin',dict(current=password,activation=activation))
    counter=int(time.time()/30).to_bytes(8,'big');mac=hmac.new(base64.b32decode(setup['secret']),counter,hashlib.sha1).digest();offset=mac[-1]&15
    code=str((int.from_bytes(mac[offset:offset+4],'big')&0x7fffffff)%1000000).zfill(6)
    done=client.request('POST','/api/manage/mfa/confirm',dict(current=password,next=replacement,activation=activation,code=code))
    denied(lambda:client.request('GET','/api/manage/security'),401)
    client.token='';denied(lambda:client.login(name,replacement),401)
    client.login(name,replacement,done['recoveryCodes'][0])
    assert not client.request('GET','/api/manage/security')['restricted']
    invite=client.request('POST','/api/manage/invitations',dict(username=invitee,role='editor',current=replacement,code=done['recoveryCodes'][1]))
    recipient=Client(client.base_url);recipient.request('POST','/api/manage/invitations/accept',dict(invitation=invite['invitation'],password=password))
    denied(lambda:recipient.request('POST','/api/manage/invitations/accept',dict(invitation=invite['invitation'],password=password)),400)
    recipient.login(invitee,password);denied(lambda:recipient.request('GET','/api/manage/accounts'),403);denied(lambda:recipient.request('POST','/api/manage/publish',dict(version=0)),403)
    users=client.request('GET','/api/manage/accounts')['items'];id=next(row['id'] for row in users if row['username']==invitee)
    assert all('password_hash' not in row and 'secret' not in row for row in users)
    client.request('POST','/api/manage/accounts/status',dict(id=id,enabled=False,current=replacement,code=done['recoveryCodes'][2]))
    denied(lambda:recipient.request('GET','/api/manage/content'),401)
    client.logout();denied(lambda:client.request('GET','/api/manage/content'),401)
    after=Client(client.base_url).request('GET','/api/content');assert after==public
    print('PASS Cloudflare: activation grant, AES/TOTP MFA, password replacement, owner invitation, replay denial, editor restrictions, disable/session revocation, public content unchanged.')
finally:
    ids=f"SELECT id FROM cms_accounts WHERE username IN('{name}','{invitee}')";sql=''
    for table,field in [('cms_mfa_enrollments','account_id'),('cms_recovery_codes','account_id'),('cms_account_security','account_id'),('cms_sessions','account_id'),('cms_invitations','issuer_id'),('cms_access_audit','actor_id')]:sql+=f'DELETE FROM {table} WHERE {field} IN({ids});\n'
    sql+=f"DELETE FROM cms_accounts WHERE username IN('{name}','{invitee}');"
    owner.execute_sql(root,'vnd-smkdipo1-content',sql,local=False)
    print('Temporary Cloudflare security accounts removed.')
