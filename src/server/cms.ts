import { scrypt, timingSafeEqual, randomBytes, createHash } from 'node:crypto';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { validateContent, contentPhotos, type CmsContent } from '../lib/cms-content';
import { validateWebp } from './cms-media';
import { newTotpSecret, sealSecret, openSecret, totpStep } from './cms-security';

export interface CmsEnv { CMS_DB?: D1Database; CMS_MEDIA?: R2Bucket; CMS_ENABLED?: string; CMS_MFA_KEY?: string; }
interface Account { id: string; username: string; password_hash: string; role: 'owner' | 'editor'; auth_epoch: number; mfa_verified?: number; }
interface Security { secret: string|null; pending_secret: string|null; pending_expires: number; last_step: number; }
interface State { version: number; draft: string; published: string; published_version: number; updated_at: number; }
const SESSION_SECONDS = 3600;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const now = () => Math.floor(Date.now() / 1000);
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Type': 'application/json; charset=utf-8' };
function json(value: unknown, status = 200, extra: Record<string,string> = {}) { return new Response(JSON.stringify(value), { status, headers: {...headers,...extra} }); }
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function error(status: number, message: string): never { throw new HttpError(status,message); }
export async function readLimited(request: Request, max: number): Promise<Uint8Array> {
  const size = request.headers.get('content-length');
  if (size && (!/^\d+$/.test(size) || Number(size) > max)) error(413,'Data terlalu besar.');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(); const parts: Uint8Array[] = []; let length=0;
  try { while (true) { const {value,done}=await reader.read(); if (done) break; length+=value.length; if (length>max) { await reader.cancel(); error(413,'Data terlalu besar.'); } parts.push(value); } } finally { reader.releaseLock(); }
  const output=new Uint8Array(length); let offset=0; for(const part of parts) {output.set(part,offset);offset+=part.length;} return output;
}
async function body(request: Request, max = 512_000): Promise<Record<string,unknown>> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) error(415,'Gunakan JSON.');
  try { const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readLimited(request,max))); if (!value || typeof value!=='object' || Array.isArray(value)) error(400,'Data tidak valid.'); return value; }
  catch(e) { if (e instanceof HttpError) throw e; error(400,'Data JSON tidak valid.'); }
}
export async function passwordHash(password: string, salt = randomBytes(16).toString('hex')): Promise<string> {
  const result=await new Promise<Buffer>((resolve,reject)=>scrypt(password,Buffer.from(salt,'hex'),32,{N:32768,r:8,p:3,maxmem:64*1024*1024},(e,key)=>e?reject(e):resolve(key)));
  return `$scrypt$32768$8$3$${salt}$${result.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const match=/^\$scrypt\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(encoded);
  if (!match) return false;
  const expected=Buffer.from(match[2],'hex'), actual=Buffer.from((await passwordHash(password,match[1])).split('$').at(-1)!,'hex');
  return timingSafeEqual(expected,actual);
}
async function limit(db: D1Database, bucket: string, cap: number, window: number) {
  const timestamp=now();
  const row=await db.prepare('INSERT INTO cms_login_limits(bucket,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts').bind(bucket,timestamp+window,timestamp,timestamp).first<{attempts:number}>();
  if (!row || row.attempts>cap) error(429,'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.');
}
async function account(request: Request, db: D1Database): Promise<Account> {
  const token=/^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization')??'')?.[1];
  if (!token) error(401,'Silakan login.');
  const user=await db.prepare('SELECT a.id,a.username,a.role,a.auth_epoch,s.mfa_verified FROM cms_sessions s JOIN cms_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>? AND a.enabled=1 AND a.auth_epoch=s.auth_epoch').bind(hash(token),now()).first<Account>();
  if (!user) error(401,'Sesi berakhir atau akses dicabut. Silakan login kembali.'); return user;
}
async function state(db: D1Database): Promise<State> { const row=await db.prepare('SELECT version,draft,published,published_version,updated_at FROM cms_state WHERE id=1').first<State>(); if (!row) error(503,'Konten awal belum disiapkan.'); return row; }
const usernameValid = (value: unknown): value is string => typeof value==='string' && /^[a-z0-9][a-z0-9_.-]{2,63}$/.test(value);
const passwordValid = (value: unknown): value is string => typeof value==='string' && value.length>=15 && value.length<=128 && Buffer.byteLength(value,'utf8')<=512;
async function security(db: D1Database, id: string) { return db.prepare('SELECT secret,pending_secret,pending_expires,last_step FROM cms_account_security WHERE account_id=?').bind(id).first<Security>(); }
function audit(db: D1Database, actor: string, action: string, target: string) {
  return db.prepare('INSERT INTO cms_access_audit(actor_id,action,target,created_at) VALUES(?,?,?,?)').bind(actor,action,target,now());
}
async function verifyFactor(db: D1Database, user: Account, code: unknown, env: CmsEnv) {
  const s=await security(db,user.id); if(!s?.secret) error(403,'Aktifkan autentikasi dua langkah terlebih dahulu.');
  if(typeof code!=='string')error(401,'Kode autentikator atau pemulihan tidak valid.');
  // Consume a factor atomically: concurrent requests cannot reuse a time step/code.
  if(/^[a-f0-9]{24}$/.test(code)) {
    const result=await db.prepare('DELETE FROM cms_recovery_codes WHERE account_id=? AND code_hash=?').bind(user.id,hash(code)).run();
    if(result.meta.changes!==1)error(401,'Kode autentikator atau pemulihan tidak valid.');
    await audit(db,user.id,'recovery-code-used',user.username).run(); return;
  }
  const step=totpStep(openSecret(s.secret,user.id,env.CMS_MFA_KEY),code,now(),s.last_step);
  if(step===null)error(401,'Kode autentikator tidak valid atau sudah digunakan. Tunggu kode berikutnya.');
  const result=await db.prepare('UPDATE cms_account_security SET last_step=? WHERE account_id=? AND secret=? AND last_step<?').bind(step,user.id,s.secret,step).run();
  if(result.meta.changes!==1)error(401,'Kode sudah digunakan. Tunggu kode berikutnya.');
}
async function reauthenticate(db: D1Database, user: Account, env: CmsEnv, data: Record<string,unknown>) {
  await limit(db,`reauth:${user.id}`,10,900);
  const row=await db.prepare('SELECT password_hash FROM cms_accounts WHERE id=? AND enabled=1 AND auth_epoch=?').bind(user.id,user.auth_epoch).first<{password_hash:string}>();
  if(typeof data.current!=='string'||data.current.length>128||Buffer.byteLength(data.current)>512||!row||!await verifyPassword(data.current,row.password_hash))error(401,'Password saat ini salah.');
  if(user.role==='owner')await verifyFactor(db,user,data.code,env);
}
async function createSession(db: D1Database, user: Account, mfaVerified: boolean, enrollment=false) {
  const token=randomBytes(32).toString('hex'), expiresAt=now()+(enrollment?600:SESSION_SECONDS);
  await db.batch([
    db.prepare('DELETE FROM cms_sessions WHERE expires_at<=?').bind(now()),
    db.prepare('DELETE FROM cms_login_limits WHERE expires_at<=?').bind(now()),
    // A reset/disable occurring during password verification cannot mint a valid session.
    db.prepare('INSERT INTO cms_sessions(token_hash,account_id,auth_epoch,expires_at,mfa_verified) SELECT ?,id,auth_epoch,?,? FROM cms_accounts WHERE id=? AND enabled=1 AND auth_epoch=?').bind(hash(token),expiresAt,mfaVerified?1:0,user.id,user.auth_epoch),
    db.prepare('DELETE FROM cms_sessions WHERE account_id=? AND token_hash NOT IN (SELECT token_hash FROM cms_sessions WHERE account_id=? ORDER BY expires_at DESC LIMIT 10)').bind(user.id,user.id),
  ]);
  return json({ok:true,token,expiresAt,mfaPending:enrollment,user:{username:user.username,role:user.role}});
}
async function acceptInvite(request: Request, db: D1Database) {
  const data=await body(request,2048);
  await limit(db,`invite-ip:${hash(request.headers.get('cf-connecting-ip')??'local')}`,20,900);
  if(typeof data.invitation!=='string'||!/^[a-f0-9]{64}$/.test(data.invitation)||!passwordValid(data.password)||Object.keys(data).some(k=>!['invitation','password'].includes(k)))error(400,'Undangan atau password tidak valid. Password harus 15–128 karakter.');
  const id=crypto.randomUUID(),encoded=await passwordHash(data.password),timestamp=now(),invitationHash=hash(data.invitation),activation=randomBytes(32).toString('hex');
  const results=await db.batch([
    db.prepare("INSERT INTO cms_accounts(id,username,password_hash,role,enabled,auth_epoch,created_at) SELECT ?,i.username,?,i.role,1,1,? FROM cms_invitations i JOIN cms_accounts a ON a.id=i.issuer_id JOIN cms_account_security m ON m.account_id=a.id WHERE i.token_hash=? AND i.used_at IS NULL AND i.revoked=0 AND i.expires_at>? AND a.enabled=1 AND a.role='owner' AND a.auth_epoch=i.issuer_epoch AND m.secret IS NOT NULL AND NOT EXISTS(SELECT 1 FROM cms_accounts existing WHERE existing.username=i.username)").bind(id,encoded,timestamp,invitationHash,timestamp),
    db.prepare('UPDATE cms_invitations SET used_at=? WHERE token_hash=? AND EXISTS(SELECT 1 FROM cms_accounts WHERE id=?)').bind(timestamp,invitationHash,id),
    db.prepare("INSERT INTO cms_mfa_enrollments(account_id,token_hash,auth_epoch,expires_at) SELECT id,?,auth_epoch,? FROM cms_accounts WHERE id=? AND role='owner'").bind(hash(activation),timestamp+86400,id),
    db.prepare("INSERT INTO cms_access_audit(actor_id,action,target,created_at) SELECT id,'invitation-accepted',username,? FROM cms_accounts WHERE id=?").bind(timestamp,id),
  ]);
  if(results[0].meta.changes!==1)error(400,'Undangan tidak berlaku, sudah dipakai, atau akun sudah ada. Hubungi owner panel.');
  const row=await db.prepare('SELECT username,role FROM cms_accounts WHERE id=?').bind(id).first<{username:string;role:string}>();
  return json({ok:true,username:row!.username,...(row!.role==='owner'?{activation}:{} )});
}
async function enrollmentGrant(db:D1Database,user:Account,data:Record<string,unknown>) {
  if(typeof data.activation!=='string'||!/^[a-f0-9]{64}$/.test(data.activation))error(403,'Kode aktivasi owner diperlukan. Minta kepada pemilik infrastruktur atau gunakan kode dari undangan owner.');
  const digest=hash(data.activation);
  if(!await db.prepare('SELECT account_id FROM cms_mfa_enrollments WHERE account_id=? AND token_hash=? AND auth_epoch=? AND expires_at>?').bind(user.id,digest,user.auth_epoch,now()).first())error(403,'Kode aktivasi owner tidak berlaku atau kedaluwarsa.');
  return digest;
}
async function handleAccess(request: Request, env: CmsEnv, db: D1Database, user: Account, path: string): Promise<Response|null> {
  const s=await security(db,user.id);
  const full=user.role==='editor'||(user.mfa_verified===1&&!!s?.secret);
  if(path==='/api/manage/security'&&request.method==='GET')return json({ok:true,mfaEnabled:!!s?.secret,mfaRequired:user.role==='owner',restricted:!full});
  if(path==='/api/manage/mfa/begin'&&request.method==='POST') {
    if(user.role!=='owner'||s?.secret)error(403,'Setup hanya untuk owner yang belum mengaktifkan autentikator.');
    const data=await body(request,2048);await reauthenticate(db,{...user,role:'editor'},env,data);
    await enrollmentGrant(db,user,data);
    const secret=newTotpSecret(),sealed=sealSecret(secret,user.id,env.CMS_MFA_KEY);
    await db.prepare('INSERT INTO cms_account_security(account_id,pending_secret,pending_expires) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET pending_secret=excluded.pending_secret,pending_expires=excluded.pending_expires WHERE secret IS NULL').bind(user.id,sealed,now()+600).run();
    return json({ok:true,secret,uri:`otpauth://totp/${encodeURIComponent('OSIS:'+user.username)}?secret=${secret}&issuer=OSIS&algorithm=SHA1&digits=6&period=30`});
  }
  if(path==='/api/manage/mfa/confirm'&&request.method==='POST') {
    if(user.role!=='owner'||s?.secret||!s?.pending_secret||s.pending_expires<=now())error(403,'Setup tidak tersedia atau sudah kedaluwarsa.');
    const data=await body(request,2048);await reauthenticate(db,{...user,role:'editor'},env,data);
    const grant=await enrollmentGrant(db,user,data);
    if(!passwordValid(data.next)||data.current===data.next)error(400,'Gunakan password baru 15–128 karakter, berbeda dari sebelumnya.');
    const step=totpStep(openSecret(s.pending_secret,user.id,env.CMS_MFA_KEY),data.code,now());
    if(step===null)error(400,'Kode autentikator tidak cocok.');
    const codes=Array.from({length:10},()=>randomBytes(12).toString('hex')),encoded=await passwordHash(data.next),timestamp=now();
    const results=await db.batch([
      db.prepare('UPDATE cms_account_security SET secret=pending_secret,pending_secret=NULL,pending_expires=0,last_step=? WHERE account_id=? AND secret IS NULL AND pending_secret=? AND pending_expires>? AND EXISTS(SELECT 1 FROM cms_accounts WHERE id=? AND enabled=1 AND auth_epoch=?) AND EXISTS(SELECT 1 FROM cms_mfa_enrollments WHERE account_id=? AND token_hash=? AND auth_epoch=? AND expires_at>?)').bind(step,user.id,s.pending_secret,timestamp,user.id,user.auth_epoch,user.id,grant,user.auth_epoch,timestamp),
      db.prepare('UPDATE cms_accounts SET password_hash=?,auth_epoch=auth_epoch+1 WHERE id=? AND auth_epoch=? AND EXISTS(SELECT 1 FROM cms_account_security WHERE account_id=? AND secret=? AND last_step=?)').bind(encoded,user.id,user.auth_epoch,user.id,s.pending_secret,step),
      ...codes.map(code=>db.prepare('INSERT INTO cms_recovery_codes(account_id,code_hash) SELECT ?,? WHERE EXISTS(SELECT 1 FROM cms_accounts WHERE id=? AND password_hash=?)').bind(user.id,hash(code),user.id,encoded)),
      db.prepare('DELETE FROM cms_mfa_enrollments WHERE account_id=? AND EXISTS(SELECT 1 FROM cms_accounts WHERE id=? AND password_hash=?)').bind(user.id,user.id,encoded),
      db.prepare('DELETE FROM cms_sessions WHERE account_id=?').bind(user.id),
      db.prepare("INSERT INTO cms_access_audit(actor_id,action,target,created_at) SELECT id,'mfa-enabled',username,? FROM cms_accounts WHERE id=? AND password_hash=?").bind(timestamp,user.id,encoded),
    ]);
    if(results[0].meta.changes!==1||results[1].meta.changes!==1)error(409,'Akun atau setup berubah. Login ulang.');
    return json({ok:true,recoveryCodes:codes});
  }
  if(!full)error(403,'Aktifkan autentikasi dua langkah lewat VND Console terbaru sebelum mengelola konten.');
  if(!path.startsWith('/api/manage/accounts')&&!path.startsWith('/api/manage/invitations')&&path!=='/api/manage/audit')return null;
  if(user.role!=='owner')error(403,'Hanya owner panel yang dapat mengelola akses pengurus.');
  if(path==='/api/manage/accounts'&&request.method==='GET') {
    const rows=await db.prepare('SELECT a.id,a.username,a.role,a.enabled,a.created_at,CASE WHEN s.secret IS NULL THEN 0 ELSE 1 END AS mfaEnabled FROM cms_accounts a LEFT JOIN cms_account_security s ON s.account_id=a.id ORDER BY a.created_at,a.username').all();return json({ok:true,items:rows.results});
  }
  if(path==='/api/manage/invitations'&&request.method==='GET') {
    const rows=await db.prepare('SELECT username,role,created_at,expires_at FROM cms_invitations WHERE issuer_id=? AND issuer_epoch=? AND revoked=0 AND used_at IS NULL AND expires_at>? ORDER BY created_at DESC LIMIT 50').bind(user.id,user.auth_epoch,now()).all();return json({ok:true,items:rows.results});
  }
  if(path==='/api/manage/invitations'&&request.method==='POST') {
    const data=await body(request,2048);await reauthenticate(db,user,env,data);
    if(!usernameValid(data.username)||!['owner','editor'].includes(String(data.role)))error(400,'Username atau izin tidak valid.');
    if(await db.prepare('SELECT id FROM cms_accounts WHERE username=?').bind(data.username).first())error(409,'Username sudah ada. Ubah status akun tersebut tanpa membuat ulang.');
    const token=randomBytes(32).toString('hex'),timestamp=now();
    await db.batch([
      db.prepare('UPDATE cms_invitations SET revoked=1 WHERE username=? AND used_at IS NULL').bind(data.username),
      db.prepare('INSERT INTO cms_invitations(token_hash,username,role,issuer_id,issuer_epoch,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').bind(hash(token),data.username,data.role,user.id,user.auth_epoch,timestamp,timestamp+86400),
      audit(db,user.id,'invitation-created',String(data.username)),
    ]);return json({ok:true,invitation:token,expiresAt:timestamp+86400});
  }
  if(path==='/api/manage/invitations/revoke'&&request.method==='POST') {
    const data=await body(request,2048);await reauthenticate(db,user,env,data);if(!usernameValid(data.username))error(400,'Username tidak valid.');
    await db.batch([db.prepare('UPDATE cms_invitations SET revoked=1 WHERE username=? AND used_at IS NULL').bind(data.username),audit(db,user.id,'invitation-revoked',data.username)]);return json({ok:true});
  }
  if(path==='/api/manage/accounts/status'&&request.method==='POST') {
    const data=await body(request,2048);await reauthenticate(db,user,env,data);
    if(typeof data.id!=='string'||data.id.length>64||typeof data.enabled!=='boolean'||data.id===user.id)error(400,'Pilih akun lain dan status yang valid.');
    const result=await db.batch([
      // Check the last owner inside the same write statement, including concurrent disables.
      db.prepare("UPDATE cms_accounts SET enabled=?,auth_epoch=auth_epoch+1 WHERE id=? AND (?=1 OR role!='owner' OR enabled=0 OR NOT EXISTS(SELECT 1 FROM cms_account_security own_mfa WHERE own_mfa.account_id=cms_accounts.id AND own_mfa.secret IS NOT NULL) OR EXISTS(SELECT 1 FROM cms_accounts other JOIN cms_account_security m ON m.account_id=other.id WHERE other.id!=cms_accounts.id AND other.role='owner' AND other.enabled=1 AND m.secret IS NOT NULL))").bind(data.enabled?1:0,data.id,data.enabled?1:0),
      db.prepare('DELETE FROM cms_sessions WHERE account_id=?').bind(data.id),
      db.prepare('UPDATE cms_invitations SET revoked=1 WHERE issuer_id=? AND used_at IS NULL').bind(data.id),
      audit(db,user.id,data.enabled?'account-enabled-request':'account-disabled-request',data.id),
    ]);if(result[0].meta.changes!==1)error(409,'Akun tidak ditemukan atau merupakan owner aktif terakhir.');return json({ok:true});
  }
  if(path==='/api/manage/accounts/revoke-sessions'&&request.method==='POST') {
    const data=await body(request,2048);await reauthenticate(db,user,env,data);if(typeof data.id!=='string'||data.id.length>64)error(400,'Akun tidak valid.');
    await db.batch([db.prepare('UPDATE cms_accounts SET auth_epoch=auth_epoch+1 WHERE id=?').bind(data.id),db.prepare('DELETE FROM cms_sessions WHERE account_id=?').bind(data.id),db.prepare('UPDATE cms_invitations SET revoked=1 WHERE issuer_id=?').bind(data.id),audit(db,user.id,'sessions-revoked',data.id)]);return json({ok:true});
  }
  if(path==='/api/manage/audit'&&request.method==='GET') {
    const rows=await db.prepare('SELECT l.id,l.action,l.target,l.created_at,a.username AS actor FROM cms_access_audit l LEFT JOIN cms_accounts a ON a.id=l.actor_id ORDER BY l.id DESC LIMIT 200').all();return json({ok:true,items:rows.results});
  }
  error(404,'Endpoint tidak ditemukan.');
}
function version(value: unknown): number { if (!Number.isSafeInteger(value) || Number(value)<0) error(400,'Versi draft tidak valid.'); return Number(value); }
function content(value: unknown): CmsContent { try { return validateContent(value); } catch(e) { error(400,e instanceof Error?e.message:'Konten tidak valid.'); } }
async function mediaExist(c: CmsContent, env: CmsEnv) {
  const keys=[...contentPhotos(c)].filter(path=>path.startsWith('/api/media/')).map(path=>path.slice('/api/media/'.length));
  if(!keys.length)return;
  if(env.CMS_MEDIA){for(const key of keys)if(!await env.CMS_MEDIA.head(key))error(400,'Foto belum diunggah atau tidak tersedia.');}
  else {
    // The D1 fallback has a 200-photo quota: one bounded query avoids one query
    // per portrait and the per-request D1 limit when a large roster is saved.
    const rows=await env.CMS_DB!.prepare('SELECT key FROM cms_assets').all<{key:string}>();
    const stored=new Set(rows.results.map(row=>row.key));
    if(keys.some(key=>!stored.has(key)))error(400,'Foto belum diunggah atau tidak tersedia.');
  }
}
async function mutate(db: D1Database, user: Account, expected: number, action: 'save'|'publish'|'restore', value?: CmsContent) {
  const operation=crypto.randomUUID(), timestamp=now(), serialized=value?JSON.stringify(value):null;
  // Recheck the actor inside the write, after body/media work and any revocation.
  const allowed=" AND EXISTS(SELECT 1 FROM cms_accounts actor WHERE actor.id=? AND actor.enabled=1 AND actor.auth_epoch=? AND (actor.role='editor' OR EXISTS(SELECT 1 FROM cms_account_security m WHERE m.account_id=actor.id AND m.secret IS NOT NULL)) AND (?='save' OR actor.role='owner'))";
  const update=action==='publish'
    ? db.prepare('UPDATE cms_state SET published=draft,published_version=version+1,version=version+1,updated_at=?,last_operation=? WHERE id=1 AND version=?'+allowed).bind(timestamp,operation,expected,user.id,user.auth_epoch,action)
    : db.prepare('UPDATE cms_state SET draft=?,version=version+1,updated_at=?,last_operation=? WHERE id=1 AND version=?'+allowed).bind(serialized,timestamp,operation,expected,user.id,user.auth_epoch,action);
  const result=await db.batch([
    update,
    db.prepare('INSERT INTO cms_revisions(version,action,account_id,content,created_at) SELECT version,?,?,draft,? FROM cms_state WHERE id=1 AND last_operation=?').bind(action,user.id,timestamp,operation),
    db.prepare('DELETE FROM cms_revisions WHERE id NOT IN (SELECT id FROM cms_revisions ORDER BY id DESC LIMIT 50)'),
  ]);
  if (result[0].meta.changes!==1) error(409,'Draft atau akses akun sudah berubah. Muat ulang atau login kembali sebelum menyimpan.');
  return json({ok:true,version:expected+1});
}
export async function handleCms(request: Request, env: CmsEnv): Promise<Response> {
  try {
    if (env.CMS_ENABLED!=='true' || !env.CMS_DB) error(503,'Pengelolaan konten belum diaktifkan.');
    const db=env.CMS_DB, path=new URL(request.url).pathname.replace(/\/$/,'');
    // Native clients send no Origin. Reject browser requests, including same-origin scripts.
    if (request.headers.has('origin') || request.headers.get('sec-fetch-site')) error(403,'Gunakan aplikasi pengelola desktop.');
    if(path==='/api/manage/invitations/accept'&&request.method==='POST')return await acceptInvite(request,db);
    if (path==='/api/manage/login') {
      if (request.method!=='POST') error(405,'Metode tidak diizinkan.');
      const data=await body(request,2048);
      if (typeof data.username!=='string' || !/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(data.username) || typeof data.password!=='string' || data.password.length>128 || new TextEncoder().encode(data.password).length>512) error(401,'Username atau password salah.');
      const ip=request.headers.get('cf-connecting-ip')??'local';
      await limit(db,`login-ip:${hash(ip)}`,30,900);
      await limit(db,`login-user:${hash(data.username)}`,10,900);
      const user=await db.prepare('SELECT id,username,password_hash,role,auth_epoch FROM cms_accounts WHERE username=? AND enabled=1').bind(data.username).first<Account>();
      const verified=await verifyPassword(data.password,user?.password_hash??`$scrypt$32768$8$3$${'0'.repeat(32)}$${'0'.repeat(64)}`);
      if (!user || !verified) error(401,'Username atau password salah.');
      const s=await security(db,user.id);
      if(user.role==='owner'&&s?.secret)await verifyFactor(db,user,data.code,env);
      return await createSession(db,user,user.role==='owner'&&!!s?.secret,user.role==='owner'&&!s?.secret);
    }
    const user=await account(request,db);
    if (request.method!=='GET') await limit(db,`write:${user.id}`,120,60);
    if (path==='/api/manage/logout' && request.method==='POST') {
      await db.prepare('DELETE FROM cms_sessions WHERE token_hash=?').bind(hash(request.headers.get('authorization')!.slice(7))).run(); return json({ok:true});
    }
    const access=await handleAccess(request,env,db,user,path);if(access)return access;
    if (path==='/api/manage/content' && request.method==='GET') { const s=await state(db); return json({ok:true,version:s.version,publishedVersion:s.published_version,content:content(JSON.parse(s.draft))}); }
    if (path==='/api/manage/content' && request.method==='PUT') { const data=await body(request); if ((data.content as {schemaVersion?:number})?.schemaVersion !== 2) error(409,'Perbarui aplikasi desktop sebelum menyimpan pengaturan.'); const value=content(data.content); await mediaExist(value,env); return await mutate(db,user,version(data.version),'save',value); }
    if (path==='/api/manage/publish' && request.method==='POST') {
      if (user.role!=='owner') error(403,'Hanya pemilik yang dapat menerbitkan konten.');
      const data=await body(request,1024); const s=await state(db); await mediaExist(content(JSON.parse(s.draft)),env); return await mutate(db,user,version(data.version),'publish');
    }
    if (path==='/api/manage/history' && request.method==='GET') {
      const rows=await db.prepare('SELECT r.id,r.version,r.action,r.created_at,a.username FROM cms_revisions r LEFT JOIN cms_accounts a ON a.id=r.account_id ORDER BY r.id DESC LIMIT 50').all(); return json({ok:true,items:rows.results});
    }
    if (path==='/api/manage/restore' && request.method==='POST') {
      if (user.role!=='owner') error(403,'Hanya pemilik yang dapat mengembalikan versi.');
      const data=await body(request,1024); const id=version(data.revisionId);
      const row=await db.prepare('SELECT content FROM cms_revisions WHERE id=?').bind(id).first<{content:string}>(); if (!row) error(404,'Versi tidak ditemukan.');
      const value=content(JSON.parse(row.content)); await mediaExist(value,env); return await mutate(db,user,version(data.version),'restore',value);
    }
    if (path==='/api/manage/password' && request.method==='POST') {
      const data=await body(request,2048);
      if(!passwordValid(data.next)||data.next===data.current)error(400,'Password baru harus 15–128 karakter dan berbeda dari sebelumnya.');
      await reauthenticate(db,user,env,data);
      const encoded=await passwordHash(data.next); await db.batch([db.prepare('UPDATE cms_accounts SET password_hash=?,auth_epoch=auth_epoch+1 WHERE id=? AND auth_epoch=?').bind(encoded,user.id,user.auth_epoch),db.prepare('DELETE FROM cms_sessions WHERE account_id=?').bind(user.id),db.prepare('UPDATE cms_invitations SET revoked=1 WHERE issuer_id=?').bind(user.id),audit(db,user.id,'password-changed',user.username)]); return json({ok:true});
    }
    if (path==='/api/manage/media' && request.method==='POST') {
      if (request.headers.get('content-type')!=='image/webp') error(415,'Foto harus WebP.');
      const bytes=await readLimited(request,1024*1024);
      try { validateWebp(bytes); } catch(e) { error(400,e instanceof Error?e.message:'File foto tidak valid.'); }
      const key=`${crypto.randomUUID()}.webp`;
      if (env.CMS_MEDIA) await env.CMS_MEDIA.put(key,bytes,{httpMetadata:{contentType:'image/webp'}});
      else {
        const uploaded=await db.prepare("INSERT INTO cms_assets(key,bytes,created_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM cms_assets)<200 AND EXISTS(SELECT 1 FROM cms_accounts WHERE id=? AND enabled=1 AND auth_epoch=?)").bind(key,bytes.buffer,now(),user.id,user.auth_epoch).run();
        if (uploaded.meta.changes!==1) error(409,'Batas 200 foto tercapai. Hubungi pemilik untuk arsip atau aktivasi R2.');
      }
      return json({ok:true,path:`/api/media/${key}`});
    }
    error(404,'Endpoint tidak ditemukan.');
  } catch(e) { if(e instanceof HttpError) return json({ok:false,error:e.message},e.status); console.error('CMS_REQUEST_FAILED'); return json({ok:false,error:'Pengelolaan sedang tidak tersedia. Coba lagi.'},503); }
}
export async function publicContent(request: Request, env: CmsEnv): Promise<Response> {
  if (request.method!=='GET') return json({ok:false,error:'Metode tidak diizinkan.'},405);
  if (env.CMS_ENABLED!=='true' || !env.CMS_DB) return json({ok:false,error:'Konten belum tersedia.'},503);
  try { const s=await state(env.CMS_DB); const c=validateContent(JSON.parse(s.published)); return json({version:s.published_version,content:c},200,{'Cache-Control':'public, max-age=15, must-revalidate'}); }
  catch { return json({ok:false,error:'Konten belum tersedia.'},503); }
}
export async function publicMedia(request: Request, env: CmsEnv): Promise<Response> {
  try {
    if (!['GET','HEAD'].includes(request.method)) error(405,'Metode tidak diizinkan.');
    if (env.CMS_ENABLED!=='true' || !env.CMS_DB) error(404,'Foto tidak ditemukan.');
    const path=new URL(request.url).pathname, key=path.slice('/api/media/'.length);
    if (!/^[a-f0-9-]{36}\.webp$/.test(key)) error(404,'Foto tidak ditemukan.');
    const s=await state(env.CMS_DB);
    if (!contentPhotos(validateContent(JSON.parse(s.published))).has(path)) {
      const user=await account(request,env.CMS_DB);if(user.role==='owner'&&(user.mfa_verified!==1||!(await security(env.CMS_DB,user.id))?.secret))error(404,'Foto tidak ditemukan.');
      if (!contentPhotos(validateContent(JSON.parse(s.draft))).has(path)) error(404,'Foto tidak ditemukan.');
    }
    let bytes: BodyInit;
    if (env.CMS_MEDIA) { const item=await env.CMS_MEDIA.get(key); if (!item) error(404,'Foto tidak ditemukan.'); bytes=item.body as unknown as ReadableStream; }
    else { const item=await env.CMS_DB.prepare('SELECT bytes FROM cms_assets WHERE key=?').bind(key).first<{bytes:number[]}>(); if(!item) error(404,'Foto tidak ditemukan.'); bytes=new Uint8Array(item.bytes); }
    return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':'image/webp','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  } catch(e) { return json({ok:false,error:'Foto tidak ditemukan.'},e instanceof HttpError&&e.status===405?405:404); }
}
