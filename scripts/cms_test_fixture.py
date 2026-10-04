"""Disposable integration accounts only. Requires infrastructure authorization.

Not part of the desktop application. No upsert/reset, arbitrary usernames or
roles. Real owner provisioning belongs to cms-owner.py, invitations to the API.
"""
import importlib
import re
import time
import uuid
owner=importlib.import_module('cms-owner')

def create_test_account(project, username, password, role='editor', local=False):
    if not re.fullmatch(r'qa-[a-z0-9-]{8,60}',username) or role!='editor':
        raise ValueError('Only disposable qa-* editor fixtures are permitted.')
    encoded=owner.encode_password(password)
    sql=f"INSERT INTO cms_accounts(id,username,password_hash,role,enabled,auth_epoch,created_at) VALUES('{uuid.uuid4()}','{username}','{encoded}','editor',1,1,{int(time.time())});"
    owner.execute_sql(project,'vnd-smkdipo1-content',sql,local)
