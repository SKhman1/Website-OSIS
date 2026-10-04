"""Targeted credential scan: working files + all local Git history, values never printed.

This is a limited pattern scan, not a comprehensive secret detector or asset audit.
"""
import io
import re
import subprocess
from pathlib import Path
rules={
    'password-verifier':re.compile(rb'\$scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{64}'),
    'github-token':re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})'),
    'private-key':re.compile(rb'(?m)^-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'literal-env-secret':re.compile(rb'(?mi)^[ \t]*(?:CMS_MFA_KEY|CLOUDFLARE_API_TOKEN|CF_API_TOKEN|GOOGLE_FORMS_SHARED_SECRET|TURNSTILE_SECRET_KEY|DATABASE_AUTH_TOKEN)[ \t]*=[ \t]*["\']?[a-zA-Z0-9_./+=-]{20,}'),
}
def git(*args):return subprocess.check_output(['git',*args])
findings=set();scanned=0
def scan(data,label):
    global scanned
    scanned+=1
    for rule,pattern in rules.items():
        if pattern.search(data):findings.add((label,rule))
files=git('ls-files','--cached','--others','--exclude-standard','-z').decode().split('\0')
for name in files:
    if not name:continue
    p=Path(name)
    if p.is_file():scan(p.read_bytes(),name)
objects={}
for line in git('rev-list','--objects','--all').decode().splitlines():
    oid,_,label=line.partition(' ');objects[oid]=label or oid
response=subprocess.run(['git','cat-file','--batch'],input=('\n'.join(objects)+'\n').encode(),capture_output=True,check=True)
stream=io.BytesIO(response.stdout)
while header:=stream.readline():
    oid,kind,length=header.decode().split();data=stream.read(int(length));stream.read(1)
    if kind=='blob':scan(data,'history:'+objects[oid])
for label,rule in sorted(findings):print('REVIEW',rule,label)
print('Targeted credential scan:',scanned,'files/blobs;',len(findings),'findings. Secret values not printed.')
raise SystemExit(1 if findings else 0)
