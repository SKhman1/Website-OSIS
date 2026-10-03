import type { CmsEnv } from '../../src/server/cms';
import { validateContent, personPath } from '../../src/lib/cms-content';
interface Context { request: Request; env: CmsEnv; next: (request?: Request|string) => Promise<Response>; }
// Static directories and known profiles keep their original fallback HTML.
// Newly published advisors/members use the same profile shell without rebuilding.
export async function onRequest(context: Context) {
  const {request,env}=context;const path=new URL(request.url).pathname.replace(/\/$/,'');
  if(request.method!=='GET'||!/^\/anggota\/(?:pembina\/)?[a-z0-9-]+$/.test(path)||['/anggota/pembina','/anggota/seksi-bidang','/anggota/profil-template'].includes(path))return context.next();
  if(env.CMS_ENABLED!=='true'||!env.CMS_DB)return context.next();
  try {
    const state=await env.CMS_DB.prepare('SELECT published FROM cms_state WHERE id=1').first<{published:string}>();
    if(!state)return context.next();const content=validateContent(JSON.parse(state.published));
    if(!content.people.some(person=>personPath(person)===path))return new Response('Profil tidak ditemukan.',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
    if(['/anggota/ketua','/anggota/wakil-ketua','/anggota/sekretaris','/anggota/bendahara','/anggota/pembina/pembina-osis'].includes(path))return context.next();
    return context.next(new Request(new URL('/anggota/profil-template/',request.url),request));
  } catch { return context.next(); }
}
