"""Read-only OSV check of installed desktop runtime packages. No credentials sent."""
import importlib.metadata
import json
import urllib.request
packages=['PySide6-Essentials','shiboken6','Pillow','openpyxl','et-xmlfile','defusedxml']
queries=[dict(package=dict(name=name,ecosystem='PyPI'),version=importlib.metadata.version(name)) for name in packages]
request=urllib.request.Request('https://api.osv.dev/v1/querybatch',data=json.dumps(dict(queries=queries)).encode(),headers={'Content-Type':'application/json'},method='POST')
with urllib.request.urlopen(request,timeout=30) as response:result=json.load(response)
findings=[]
for name,item in zip(packages,result['results']):
    for vuln in item.get('vulns',[]):findings.append((name,vuln['id']))
for name,id in findings:print(name,id)
print('OSV desktop runtime packages:',len(packages),'known advisories:',len(findings))
raise SystemExit(1 if findings else 0)
