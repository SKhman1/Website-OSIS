"""Synthetic live Groq check with a disposable editor; never publishes content."""
import json,secrets,subprocess,sys,tempfile
from pathlib import Path
root=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'desktop-admin'))
from client import Client,ApiError
from cms_test_fixture import create_test_account
base=sys.argv[1];username='qa-ai-'+secrets.token_hex(8);password=secrets.token_urlsafe(32)
try:
    create_test_account(root,username,password,'editor')
    client=Client(base);before=client.request('GET','/api/content')
    grid=dict(sheet='Synthetic QA rundown',range='A1:E6',cells=[dict(ref='A1',value='Agenda uji sintetis'),dict(ref='A2',value='14 Oktober 2026'),dict(ref='A4',value='No'),dict(ref='B4',value='Waktu'),dict(ref='C4',value='Kegiatan'),dict(ref='D4',value='Tempat'),dict(ref='E4',value='PIC'),dict(ref='A5',value='1'),dict(ref='B5',value='07:00–08:00'),dict(ref='C5',value='Registrasi'),dict(ref='D5',value='Aula'),dict(ref='E5',value='Panitia'),dict(ref='A6',value='2'),dict(ref='B6',value='08:00–09:00'),dict(ref='C6',value='Pembukaan'),dict(ref='D6',value='Aula'),dict(ref='E6',value='Panitia')])
    try:client.request('POST','/api/manage/agenda-ai',grid)
    except ApiError as exc:assert exc.status==401
    else:raise AssertionError('Anonymous AI access accepted')
    client.login(username,password)
    result=client.request('POST','/api/manage/agenda-ai',grid)
    from agenda_mapping import mapped_blocks
    blocks=mapped_blocks(grid,result['plan']);assert result['model']=='openai/gpt-oss-20b';assert len(blocks)==1 and len(blocks[0]['rundown'])==2;assert blocks[0]['rundown'][0]['agenda']=='Registrasi';assert blocks[0]['rundown'][1]['start']=='08:00'
    assert before==client.request('GET','/api/content'),'AI changed published content'
    client.logout();print('PASS production Groq GPT-OSS 20B, source mapping, unauthenticated denial, no publication changes')
finally:
    password=''
    sql=f"DELETE FROM cms_sessions WHERE account_id IN (SELECT id FROM cms_accounts WHERE username='{username}');\nDELETE FROM cms_login_limits WHERE bucket IN (SELECT 'agenda-ai:'||id FROM cms_accounts WHERE username='{username}') OR bucket IN (SELECT 'write:'||id FROM cms_accounts WHERE username='{username}');\nDELETE FROM cms_accounts WHERE username='{username}';\n"
    with tempfile.TemporaryDirectory() as folder:
        path=Path(folder)/'cleanup.sql';path.write_text(sql,encoding='utf-8')
        result=subprocess.run(['node',str(root/'node_modules/wrangler/bin/wrangler.js'),'d1','execute','vnd-smkdipo1-content','--remote','--file',str(path)],cwd=root,capture_output=True)
        if result.returncode:raise RuntimeError('Disposable QA cleanup failed; remove '+username)
    print('PASS disposable AI test account removed')
