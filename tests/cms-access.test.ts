import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import type { D1Database } from '@cloudflare/workers-types';
import { handleCms, passwordHash, type CmsEnv } from '../src/server/cms';
import { sealSecret, openSecret, totp, totpStep } from '../src/server/cms-security';
import { defaultIdentity, defaultStatistics, type CmsContent } from '../src/lib/cms-content';

const key='a'.repeat(64),secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',password='Disposable local security test password.';
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const encoded=await passwordHash(password);
// Real SQLite SQL semantics, D1 shape. batch rollback is transactional as on D1.
class LocalD1 {
  sqlite=new DatabaseSync(':memory:');
  beforeBatch?:()=>void;
  constructor() { for(const name of ['0001_content.sql','0002_access.sql','0003_enrollment.sql'])this.sqlite.exec(fs.readFileSync('migrations/cms/'+name,'utf8')); }
  prepare(sql:string) {
    let values:any[]=[];const self=this;
    const statement={bind(...args:any[]){values=args;return statement;},async first(){return self.sqlite.prepare(sql).get(...values)??null;},async all(){return {results:self.sqlite.prepare(sql).all(...values)};},runSync(){const result=self.sqlite.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}};},async run(){return statement.runSync();}};return statement;
  }
  async batch(statements:any[]) {const before=this.beforeBatch;this.beforeBatch=undefined;before?.();this.sqlite.exec('BEGIN');try {const results=[];for(const statement of statements)results.push(statement.runSync());this.sqlite.exec('COMMIT');return results;}catch(e){this.sqlite.exec('ROLLBACK');throw e;} }
  add(id:string,role='owner',enabled=1,mfa=true) {
    this.sqlite.prepare('INSERT INTO cms_accounts VALUES(?,?,?,?,?,1,?)').run(id,id,encoded,role,enabled,Math.floor(Date.now()/1000));
    if(!mfa && role==='owner')this.sqlite.prepare('INSERT INTO cms_mfa_enrollments VALUES(?,?,1,?)').run(id,sha('b'.repeat(64)),Math.floor(Date.now()/1000)+86400);
    if(mfa)this.sqlite.prepare('INSERT INTO cms_account_security(account_id,secret) VALUES(?,?)').run(id,sealSecret(secret,id,key));
  }
  session(id:string,verified=true){const token=sha(id+' session');this.sqlite.prepare('INSERT INTO cms_sessions(token_hash,account_id,auth_epoch,expires_at,mfa_verified) VALUES(?,?,1,?,?)').run(sha(token),id,Math.floor(Date.now()/1000)+3600,verified?1:0);return token;}
  recovery(id:string,label='factor'){const code=sha(id+label).slice(0,24);this.sqlite.prepare('INSERT INTO cms_recovery_codes VALUES(?,?)').run(id,sha(code));return code;}
  env():CmsEnv{return {CMS_DB:this as unknown as D1Database,CMS_ENABLED:'true',CMS_MFA_KEY:key};}
}
async function call(db:LocalD1,path:string,method='GET',data?:any,token?:string){
  const response=await handleCms(new Request('https://local.test/api/manage/'+path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined}),db.env());
  return {status:response.status,data:await response.json() as any};
}
test('RFC 6238 vectors; encrypted secret is bound to account/key and tamper detection',()=>{
  assert.equal(totp(secret,1),'287082');assert.equal(totp(secret,37037036),'081804');
  assert.equal(totpStep(secret,'287082',59),1);assert.equal(totpStep(secret,'287082',59,1),null);
  const sealed=sealSecret(secret,'owner',key);assert.equal(openSecret(sealed,'owner',key),secret);
  assert.ok(!sealed.includes(secret));assert.throws(()=>openSecret(sealed,'other',key));assert.throws(()=>openSecret(sealed,'owner','b'.repeat(64)));assert.throws(()=>openSecret(sealed.slice(0,-1)+'z','owner',key));assert.throws(()=>sealSecret(secret,'owner',undefined));
});
test('no registration/bootstrap, forged sessions denied; editor cannot administer users via direct API',async()=>{
  const db=new LocalD1();db.add('editor','editor',1,false);const token=db.session('editor');
  for(const endpoint of ['accounts','audit','invitations'])assert.equal((await call(db,endpoint)).status,401);
  assert.equal((await call(db,'accounts','GET',undefined,'0'.repeat(64))).status,401);
  for(const endpoint of ['accounts','audit','invitations'])assert.equal((await call(db,endpoint,'GET',undefined,token)).status,403);
  for(const endpoint of ['publish','restore','accounts/status','accounts/revoke-sessions','invitations','mfa/begin'])assert.equal((await call(db,endpoint,'POST',{role:'owner'},token)).status,403);
  for(const endpoint of ['register','bootstrap'])assert.equal((await call(db,endpoint,'POST',{})).status,401);
  db.sqlite.close();
});
test('old/password-only owner sessions cannot access content, history, publish, accounts or media upload',async()=>{
  const db=new LocalD1();db.add('owner','owner',1,false);const token=db.session('owner',false);
  for(const endpoint of ['content','history','accounts','audit'])assert.equal((await call(db,endpoint,'GET',undefined,token)).status,403);
  for(const endpoint of ['publish','restore','content','media','password'])assert.equal((await call(db,endpoint,'POST',{},token)).status,403);
  const login=await call(db,'login','POST',{username:'owner',password});assert.equal(login.status,200);assert.equal(login.data.mfaPending,true);
  assert.equal((await call(db,'accounts','GET',undefined,login.data.token)).status,403);db.sqlite.close();
});
test('owner enrollment requires password, matching factor and password rotation; codes issued once; no reenrollment',async()=>{
  const db=new LocalD1();db.add('owner','owner',1,false);const token=db.session('owner',false);
  assert.equal((await call(db,'mfa/begin','POST',{current:'wrong'},token)).status,401);
  assert.equal((await call(db,'mfa/begin','POST',{current:password},token)).status,403,'password alone cannot authorize first enrollment');
  const begin=await call(db,'mfa/begin','POST',{current:password,activation:'b'.repeat(64)},token);assert.equal(begin.status,200);
  const code=totp(begin.data.secret,Math.floor(Date.now()/30000)),next=password+' changed';
  assert.equal((await call(db,'mfa/confirm','POST',{current:password,next:password,code,activation:'b'.repeat(64)},token)).status,400);
  const confirm=await call(db,'mfa/confirm','POST',{current:password,next,code,activation:'b'.repeat(64)},token);assert.equal(confirm.status,200);assert.equal(confirm.data.recoveryCodes.length,10);assert.equal((db.sqlite.prepare('SELECT COUNT(*) AS n FROM cms_mfa_enrollments').get() as any).n,0);
  assert.equal((await call(db,'security','GET',undefined,token)).status,401);
  assert.equal((await call(db,'login','POST',{username:'owner',password:next,code})).status,401,'enrollment factor cannot be replayed');
  const recovery=confirm.data.recoveryCodes[0],login=await call(db,'login','POST',{username:'owner',password:next,code:recovery});assert.equal(login.status,200);
  assert.equal((await call(db,'login','POST',{username:'owner',password:next,code:recovery})).status,401);
  assert.equal((await call(db,'mfa/begin','POST',{current:next},login.data.token)).status,403);
  const row=db.sqlite.prepare('SELECT secret FROM cms_account_security').get() as any;assert.ok(!row.secret.includes(begin.data.secret));
  const stored=db.sqlite.prepare('SELECT code_hash FROM cms_recovery_codes').all();assert.ok(!JSON.stringify(stored).includes(recovery));db.sqlite.close();
});
test('owner login requires MFA; TOTP step/recovery code cannot be reused or raced',async()=>{
  const db=new LocalD1();db.add('owner');assert.equal((await call(db,'login','POST',{username:'owner',password})).status,401);
  const code=totp(secret,Math.floor(Date.now()/30000));const results=await Promise.all([call(db,'login','POST',{username:'owner',password,code}),call(db,'login','POST',{username:'owner',password,code})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,401]);
  const recovery=db.recovery('owner');assert.equal((await call(db,'login','POST',{username:'owner',password:'wrong',code:recovery})).status,401);assert.equal((await call(db,'login','POST',{username:'owner',password,code:recovery})).status,200);
  assert.equal((await call(db,'login','POST',{username:'owner',password,code:recovery})).status,401);db.sqlite.close();
});
test('invitations require reauthentication, role comes from DB, token is hashed, redemption is single use',async()=>{
  const db=new LocalD1();db.add('owner');const token=db.session('owner');
  assert.equal((await call(db,'invitations','POST',{username:'new-editor',role:'editor',current:'wrong',code:db.recovery('owner','wrong')},token)).status,401);
  const invite=await call(db,'invitations','POST',{username:'new-editor',role:'editor',current:password,code:db.recovery('owner','invite')},token);assert.equal(invite.status,200);
  assert.ok(!JSON.stringify(db.sqlite.prepare('SELECT * FROM cms_invitations').all()).includes(invite.data.invitation));
  assert.equal((await call(db,'invitations/accept','POST',{invitation:invite.data.invitation,password,role:'owner'})).status,400);
  assert.equal((await call(db,'invitations/accept','POST',{invitation:invite.data.invitation,password})).status,200);
  assert.equal((await call(db,'invitations/accept','POST',{invitation:invite.data.invitation,password})).status,400);
  assert.equal((db.sqlite.prepare("SELECT role FROM cms_accounts WHERE username='new-editor'").get() as any).role,'editor');
  const accounts=await call(db,'accounts','GET',undefined,token);assert.ok(!JSON.stringify(accounts.data).match(/password_hash|secret|token_hash|code_hash/));db.sqlite.close();
});
test('expired/revoked invites and invites from disabled/reset owners fail closed',async()=>{
  for(const reason of ['expired','revoked','disabled','epoch']) {
    const db=new LocalD1();db.add('owner');const token=db.session('owner');
    const invite=await call(db,'invitations','POST',{username:'new-editor',role:'editor',current:password,code:db.recovery('owner')},token);
    if(reason==='expired')db.sqlite.exec('UPDATE cms_invitations SET expires_at=0');
    if(reason==='revoked')db.sqlite.exec('UPDATE cms_invitations SET revoked=1');
    if(reason==='disabled')db.sqlite.exec('UPDATE cms_accounts SET enabled=0');
    if(reason==='epoch')db.sqlite.exec('UPDATE cms_accounts SET auth_epoch=auth_epoch+1');
    assert.equal((await call(db,'invitations/accept','POST',{invitation:invite.data.invitation,password})).status,400,reason);db.sqlite.close();
  }
});
test('disable invalidates sessions/invites; no self-disable; server protects last owner',async()=>{
  const db=new LocalD1();db.add('owner');db.add('old-editor','editor',1,false);const owner=db.session('owner'),editor=db.session('old-editor');
  assert.equal((await call(db,'accounts/status','POST',{id:'owner',enabled:false,current:password,code:db.recovery('owner','self')},owner)).status,400);
  assert.equal((await call(db,'accounts/status','POST',{id:'old-editor',enabled:false,current:password,code:db.recovery('owner','disable')},owner)).status,200);
  assert.equal((await call(db,'security','GET',undefined,editor)).status,401);
  db.add('owner-two');const second=db.session('owner-two');
  const race=await Promise.all([
    call(db,'accounts/status','POST',{id:'owner-two',enabled:false,current:password,code:db.recovery('owner','race')},owner),
    call(db,'accounts/status','POST',{id:'owner',enabled:false,current:password,code:db.recovery('owner-two','race')},second),
  ]);
  assert.equal((db.sqlite.prepare("SELECT COUNT(*) AS total FROM cms_accounts WHERE role='owner' AND enabled=1").get() as any).total,1);
  assert.equal(race.filter(r=>r.status===200).length,1);assert.ok(race.some(r=>[401,409].includes(r.status)));
  // Create a session for the remaining owner only to inspect non-secret audit metadata.
  const remaining=(db.sqlite.prepare("SELECT id FROM cms_accounts WHERE role='owner' AND enabled=1").get() as any).id;
  db.sqlite.prepare('DELETE FROM cms_sessions WHERE account_id=?').run(remaining);const auditToken=db.session(remaining);
  const audit=await call(db,'audit','GET',undefined,auditToken);assert.ok(audit.data.items.some((r:any)=>r.action==='account-disabled-request'));assert.ok(!JSON.stringify(audit.data).includes(password));db.sqlite.close();
});
test('revocation during body/media processing cannot commit a draft or publication',async()=>{
  const seed:CmsContent={schemaVersion:2,identity:defaultIdentity,statistics:defaultStatistics,vision:'Baseline',missions:['Baseline'],programs:[],events:[],
    people:['ketua','wakil-ketua','sekretaris','bendahara'].map(id=>({id,group:'core',role:id,name:null,classLabel:'',introduction:'QA',photo:'/_astro/qa.webp',photoAlt:'QA',photoIsPlaceholder:true,programIds:[],results:[]})),
    departments:Array.from({length:10},(_,i)=>({id:'sekbid-'+String(i+1).padStart(2,'0'),number:String(i+1).padStart(2,'0'),name:'QA field',description:'QA',photo:'/_astro/qa.webp',photoAlt:'QA',photoIsPlaceholder:true,memberIds:[],programIds:[],results:[]}))};
  for(const action of ['save','publish']) {
    const db=new LocalD1();db.add('owner');const token=db.session('owner');
    db.sqlite.prepare('INSERT INTO cms_state(id,version,draft,published,published_version,updated_at) VALUES(1,0,?,?,0,0)').run(JSON.stringify(seed),JSON.stringify(seed));
    db.beforeBatch=()=>db.sqlite.exec("UPDATE cms_accounts SET enabled=0,auth_epoch=auth_epoch+1 WHERE id='owner'");
    const response=await call(db,action==='save'?'content':'publish',action==='save'?'PUT':'POST',{version:0,...(action==='save'?{content:{...seed,vision:'Attempted revoked write'}}:{})},token);
    assert.equal(response.status,409);
    assert.equal((db.sqlite.prepare('SELECT version FROM cms_state').get() as any).version,0);
    assert.equal((db.sqlite.prepare('SELECT COUNT(*) AS n FROM cms_revisions').get() as any).n,0);db.sqlite.close();
  }
});
