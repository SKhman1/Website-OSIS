/** Custodian-only import using existing Wrangler authorization; no GUI credentials.
 * Default is a dry run. Draft and published documents are merged independently,
 * so this never publishes unrelated pending edits. No source workbook is uploaded.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {validateContent, type CmsEvent} from '../src/lib/cms-content';
const args=process.argv.slice(2),flag=(key:string)=>args[args.indexOf(key)+1];
const input=flag('--input'),database=flag('--database');
if(!args.includes('--input')||!args.includes('--database')||!input||!database)throw new Error('Provide --input normalized-events.json and --database explicitly; add --apply to publish.');
function execute(options:string[]) {
  try{return execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute',database,'--remote',...options,'--json'],{encoding:'utf8',maxBuffer:8*1024*1024});}
  catch{throw new Error('Cloudflare database operation failed. Output suppressed to protect draft content.');}
}
const read=()=>JSON.parse(execute(['--command','SELECT version,published_version,draft,published FROM cms_state WHERE id=1']))[0].results[0];
const state=read();if(!state)throw new Error('Content has not been initialized.');
const incoming=JSON.parse(fs.readFileSync(input,'utf8')) as CmsEvent[];
if(!Array.isArray(incoming)||!incoming.length)throw new Error('Provide at least one event.');
const merge=(raw:string)=>{const content=JSON.parse(raw),ids=new Set(incoming.map(e=>e.id));
  const result={...content,events:[...content.events.filter((e:CmsEvent)=>!ids.has(e.id)),...incoming]};
  validateContent(result);return JSON.stringify(result);};
const draft=merge(state.draft),published=merge(state.published);
const incomingIds=new Set(incoming.map(e=>e.id));
if(incomingIds.size!==incoming.length)throw new Error('Duplicate event IDs.');
const operation=randomUUID(),stamp=Math.floor(Date.now()/1000),q=(s:string)=>`'${s.replaceAll("'","''")}'`;
console.log(JSON.stringify({mode:args.includes('--apply')?'publish':'dry-run',expectedVersion:state.version,days:incoming.length,sessions:incoming.reduce((n,e)=>n+e.rundown.length,0),unrelatedDraftChangesPreserved:true}));
if(args.includes('--apply')){
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'vnd-agenda-')),file=path.join(folder,'import.sql');
  try{
    const sql=`UPDATE cms_state SET draft=${q(draft)},published=${q(published)},version=version+1,published_version=version+1,updated_at=${stamp},last_operation=${q(operation)} WHERE id=1 AND version=${state.version};
INSERT INTO cms_revisions(version,action,account_id,content,created_at) SELECT version,'save','cloudflare-custodian',draft,${stamp} FROM cms_state WHERE id=1 AND last_operation=${q(operation)};
INSERT INTO cms_revisions(version,action,account_id,content,created_at) SELECT version,'publish','cloudflare-custodian',published,${stamp} FROM cms_state WHERE id=1 AND last_operation=${q(operation)};
DELETE FROM cms_revisions WHERE id NOT IN (SELECT id FROM cms_revisions ORDER BY id DESC LIMIT 50);`;
    fs.writeFileSync(file,sql,{mode:0o600});execute(['--file',file]);
    const after=read();
    if(after.version!==state.version+1||after.draft!==draft||after.published!==published||after.published_version!==state.version+1)throw new Error('Concurrent content change detected. Inspect current content before retrying.');
    console.log(JSON.stringify({publishedVersion:after.published_version,verified:true}));
  }finally{fs.rmSync(file,{force:true});fs.rmdirSync(folder);}
}
