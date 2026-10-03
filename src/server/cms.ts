import { scrypt, timingSafeEqual, randomBytes, createHash } from 'node:crypto';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { validateContent, contentPhotos, type CmsContent } from '../lib/cms-content';
import { validateWebp } from './cms-media';

export interface CmsEnv { CMS_DB?: D1Database; CMS_MEDIA?: R2Bucket; CMS_ENABLED?: string; }
interface Account { id: string; username: string; password_hash: string; role: 'owner' | 'editor'; auth_epoch: number; }
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
  const user=await db.prepare('SELECT a.id,a.username,a.role,a.auth_epoch FROM cms_sessions s JOIN cms_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>? AND a.enabled=1 AND a.auth_epoch=s.auth_epoch').bind(hash(token),now()).first<Account>();
  if (!user) error(401,'Sesi berakhir atau akses dicabut. Silakan login kembali.'); return user;
}
async function state(db: D1Database): Promise<State> { const row=await db.prepare('SELECT version,draft,published,published_version,updated_at FROM cms_state WHERE id=1').first<State>(); if (!row) error(503,'Konten awal belum disiapkan.'); return row; }
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
  const update=action==='publish'
    ? db.prepare('UPDATE cms_state SET published=draft,published_version=version+1,version=version+1,updated_at=?,last_operation=? WHERE id=1 AND version=?').bind(timestamp,operation,expected)
    : db.prepare('UPDATE cms_state SET draft=?,version=version+1,updated_at=?,last_operation=? WHERE id=1 AND version=?').bind(serialized,timestamp,operation,expected);
  const result=await db.batch([
    update,
    db.prepare('INSERT INTO cms_revisions(version,action,account_id,content,created_at) SELECT version,?,?,draft,? FROM cms_state WHERE id=1 AND last_operation=?').bind(action,user.id,timestamp,operation),
    db.prepare('DELETE FROM cms_revisions WHERE id NOT IN (SELECT id FROM cms_revisions ORDER BY id DESC LIMIT 50)'),
  ]);
  if (result[0].meta.changes!==1) error(409,'Draft sudah berubah di perangkat lain. Muat ulang sebelum menyimpan.');
  return json({ok:true,version:expected+1});
}
export async function handleCms(request: Request, env: CmsEnv): Promise<Response> {
  try {
    if (env.CMS_ENABLED!=='true' || !env.CMS_DB) error(503,'Pengelolaan konten belum diaktifkan.');
    const db=env.CMS_DB, path=new URL(request.url).pathname.replace(/\/$/,'');
    // Native clients send no Origin. Reject browser requests, including same-origin scripts.
    if (request.headers.has('origin') || request.headers.get('sec-fetch-site')) error(403,'Gunakan aplikasi pengelola desktop.');
    if (path==='/api/manage/login') {
      if (request.method!=='POST') error(405,'Metode tidak diizinkan.');
      const data=await body(request,2048);
      if (typeof data.username!=='string' || !/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(data.username) || typeof data.password!=='string' || data.password.length>128 || new TextEncoder().encode(data.password).length>512) error(401,'Username atau password salah.');
      const ip=request.headers.get('cf-connecting-ip')??'local';
      await limit(db,`login-ip:${hash(ip)}`,30,900);
      await limit(db,`login-user:${hash(data.username)}`,10,900);
      const user=await db.prepare('SELECT id,username,password_hash,role,auth_epoch FROM cms_accounts WHERE username=? AND enabled=1').bind(data.username).first<Account>();
      if (!user || !await verifyPassword(data.password,user.password_hash)) error(401,'Username atau password salah.');
      const token=randomBytes(32).toString('hex');
      await db.batch([
        db.prepare('DELETE FROM cms_sessions WHERE expires_at<=?').bind(now()),
        db.prepare('DELETE FROM cms_login_limits WHERE expires_at<=?').bind(now()),
        db.prepare('INSERT INTO cms_sessions(token_hash,account_id,auth_epoch,expires_at) VALUES(?,?,?,?)').bind(hash(token),user.id,user.auth_epoch,now()+SESSION_SECONDS),
      ]);
      return json({ok:true,token,expiresAt:now()+SESSION_SECONDS,user:{username:user.username,role:user.role}});
    }
    const user=await account(request,db);
    if (request.method!=='GET') await limit(db,`write:${user.id}`,120,60);
    if (path==='/api/manage/logout' && request.method==='POST') {
      await db.prepare('DELETE FROM cms_sessions WHERE token_hash=?').bind(hash(request.headers.get('authorization')!.slice(7))).run(); return json({ok:true});
    }
    if (path==='/api/manage/content' && request.method==='GET') { const s=await state(db); return json({ok:true,version:s.version,publishedVersion:s.published_version,content:JSON.parse(s.draft)}); }
    if (path==='/api/manage/content' && request.method==='PUT') { const data=await body(request); const value=content(data.content); await mediaExist(value,env); return await mutate(db,user,version(data.version),'save',value); }
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
      if (typeof data.current!=='string' || data.current.length>128 || typeof data.next!=='string' || data.next.length<15 || data.next.length>128 || data.next===data.current) error(400,'Password baru harus 15–128 karakter dan berbeda dari sebelumnya.');
      const row=await db.prepare('SELECT password_hash FROM cms_accounts WHERE id=?').bind(user.id).first<{password_hash:string}>();
      if (!row || !await verifyPassword(data.current,row.password_hash)) error(401,'Password saat ini salah.');
      const encoded=await passwordHash(data.next); await db.batch([db.prepare('UPDATE cms_accounts SET password_hash=?,auth_epoch=auth_epoch+1 WHERE id=?').bind(encoded,user.id),db.prepare('DELETE FROM cms_sessions WHERE account_id=?').bind(user.id)]); return json({ok:true});
    }
    if (path==='/api/manage/media' && request.method==='POST') {
      if (request.headers.get('content-type')!=='image/webp') error(415,'Foto harus WebP.');
      const bytes=await readLimited(request,1024*1024);
      try { validateWebp(bytes); } catch(e) { error(400,e instanceof Error?e.message:'File foto tidak valid.'); }
      const key=`${crypto.randomUUID()}.webp`;
      if (env.CMS_MEDIA) await env.CMS_MEDIA.put(key,bytes,{httpMetadata:{contentType:'image/webp'}});
      else {
        const uploaded=await db.prepare('INSERT INTO cms_assets(key,bytes,created_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM cms_assets)<200').bind(key,bytes.buffer,now()).run();
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
      await account(request,env.CMS_DB); if (!contentPhotos(validateContent(JSON.parse(s.draft))).has(path)) error(404,'Foto tidak ditemukan.');
    }
    let bytes: BodyInit;
    if (env.CMS_MEDIA) { const item=await env.CMS_MEDIA.get(key); if (!item) error(404,'Foto tidak ditemukan.'); bytes=item.body as unknown as ReadableStream; }
    else { const item=await env.CMS_DB.prepare('SELECT bytes FROM cms_assets WHERE key=?').bind(key).first<{bytes:number[]}>(); if(!item) error(404,'Foto tidak ditemukan.'); bytes=new Uint8Array(item.bytes); }
    return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':'image/webp','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  } catch(e) { return json({ok:false,error:'Foto tidak ditemukan.'},e instanceof HttpError&&e.status===405?405:404); }
}
