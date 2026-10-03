import { getImage } from 'astro:assets';
import { advisors, coreLeadership, members, departments, vision, missions } from '../content/site';
import { allPrograms } from '../content/work';
import { defaultIdentity, defaultStatistics, type CmsContent, type CmsPerson } from '../lib/cms-content';
export const prerender = true;
export async function GET() {
  const people = await Promise.all([...advisors,...coreLeadership,...members].map(async p => ({...p,
    group: (advisors.some(a=>a.id===p.id)?'advisor':coreLeadership.some(a=>a.id===p.id)?'core':'member') as CmsPerson['group'],
    classLabel:p.classLabel??'',photo:(await getImage({src:p.photo,width:666,format:'webp'})).src,results:[],
  })));
  const fields = await Promise.all(departments.map(async d=>({...d,chairId:null,photo:typeof d.photo==='string'?d.photo:(await getImage({src:d.photo!,width:666,format:'webp'})).src,photoAlt:d.photoAlt??d.name,photoIsPlaceholder:d.photoIsPlaceholder??true,results:[]})));
  const content: CmsContent={schemaVersion:2,identity:defaultIdentity,statistics:defaultStatistics,vision:vision??'',missions,people,departments:fields,programs:allPrograms,events:[]};
  return new Response(JSON.stringify(content),{headers:{'Content-Type':'application/json'}});
}
