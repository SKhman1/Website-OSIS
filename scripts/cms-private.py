"""Private infrastructure files, outside repository and GUI distribution."""
import os
import subprocess
from pathlib import Path

def private_directory():
    folder=Path(os.environ['LOCALAPPDATA'])/'VND-Console-Infrastructure' if os.name=='nt' else Path.home()/'.local/share/vnd-console-infrastructure'
    folder.mkdir(parents=True,exist_ok=True)
    if os.name=='nt':
        identity=subprocess.check_output(['whoami'],text=True).strip()
        result=subprocess.run(['icacls',str(folder),'/inheritance:r','/grant:r',identity+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],capture_output=True)
        if result.returncode:raise RuntimeError('Tidak dapat membatasi izin folder privat.')
    else:folder.chmod(0o700)
    return folder

def write_private(name,text):
    if Path(name).name!=name:raise ValueError('Gunakan nama file saja.')
    path=private_directory()/name
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as stream:stream.write(text)
    return path
