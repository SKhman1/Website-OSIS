// Loopback-only visual QA. Never included in the Pages bundle.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist-pages'),content=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1:8793');
  if(url.pathname==='/api/content'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(content));return;}
  let name=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(name!==root&&!name.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  if(!path.extname(name))name=path.join(name,'index.html');
  let bytes=await fs.readFile(name);res.setHeader('Content-Type',types[path.extname(name)]??'application/octet-stream');
  const stamp=Date.parse(url.searchParams.get('now')??'');
  if(path.extname(name)==='.html'&&Number.isFinite(stamp))bytes=Buffer.from(bytes.toString().replace('<head>',`<head><script>Date.now=()=>${stamp};</script>`));
  res.end(bytes);
}catch{res.writeHead(404).end();}});
server.listen(8793,'127.0.0.1',()=>console.log('Local agenda visual preview ready on 127.0.0.1:8793'));
