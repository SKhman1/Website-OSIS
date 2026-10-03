import { validateContent, personPath, type CmsContent, type CmsPerson, type CmsDepartment, type CmsProgram, type CmsResult, type CmsEvent } from '../lib/cms-content';
import type { Announcement } from '../content/announcements';

// Public content only. No administrator token or private endpoints in this bundle.
let version = -1;
let loading = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if(className) node.className=className; if(text!==undefined) node.textContent=text; return node;
}
function image(src: string, alt: string, eager = false) {
  const node=el('img'); node.src=src;node.alt=alt;node.width=666;node.height=500;node.loading=eager?'eager':'lazy';node.decoding='async';return node;
}
function empty(title: string, description: string) {
  const root=el('div','empty-state fucknutcard'), copy=el('div'); root.append(el('span','empty-dot'));copy.append(el('h3','',title),el('p','',description));root.append(copy);return root;
}
function card(item: CmsPerson | CmsDepartment, heading = 'h3') {
  const person='group' in item;
  const root=el('a',`department-card fucknutcard department-preview-card${person?' leadership-card':''}`);
  root.href=person?personPath(item):`/anggota/seksi-bidang/${item.id}`; root.id=item.id;
  if(person)root.dataset.leadership=item.id;else root.dataset.department=item.id;
  const frame=el('div',`department-photo${item.photoIsPlaceholder?' department-photo-example':''}`);frame.append(image(item.photo,item.photoAlt));
  if(item.photoIsPlaceholder)frame.append(el('span','department-example-label','Foto contoh · Purbaya'));
  if(!person)frame.append(el('span','department-number-badge',item.number));
  const body=el('div','department-card-body');const title=el(heading==='h4'?'h4':'h3',person?'leadership-card-title':'',person?item.role:item.name);
  title.id=`preview-${item.id}-title`;root.setAttribute('aria-labelledby',title.id);
  body.append(title,el('p','',person?item.name??'Nama akan diumumkan.':item.description),el('span','department-card-link',person?'Kenali pengurus ↗':'Lihat bidang ↗'));
  root.append(frame,body);return root;
}
function programs(ids: string[], content: CmsContent) {
  const selected=ids.map(id=>content.programs.find(p=>p.id===id)).filter((p):p is CmsProgram=>Boolean(p));
  if(!selected.length)return empty('Program kerja belum tersedia','Rencana kerja akan ditampilkan setelah informasinya tersedia.');
  const root=el('div','work-program-list');selected.forEach((program,index)=>{
    const article=el('article','work-program');article.id=`program-${program.id}`;article.append(el('span','work-number',String(index+1).padStart(2,'0')));
    const body=el('div','work-program-body'),meta=el('div','work-program-meta');meta.append(el('span','program-frequency',program.frequency),el('span','work-status','Rencana kerja'));
    body.append(meta,el('h3','',program.title),el('p','',program.description));const details=el('details','work-details'),summary=el('summary','',`Rincian program ${program.title}`),plus=el('span','','+');plus.setAttribute('aria-hidden','true');summary.append(plus);details.append(summary);
    const copy=el('div','work-details-body');for(const [caption,items] of [['Pelaksanaan',program.details],['Tujuan',program.goals]] as const){copy.append(el('h4','',caption));const list=el('ul');items.forEach(item=>list.append(el('li','',item)));copy.append(list);}details.append(copy);body.append(details);article.append(body);root.append(article);
  });return root;
}
function results(items: CmsResult[]) {
  if(!items.length)return empty('Cerita hasil kerja segera hadir','Dokumentasi dan hasil pelaksanaan akan ditampilkan setelah laporannya tersedia.');
  const root=el('div','work-results-grid');for(const item of items){const article=el('article','work-result'),copy=el('div'),time=el('time','',date(item.date));time.dateTime=item.date;
    if(item.photo)article.append(image(item.photo,item.photoAlt??item.title));copy.append(time,el('h3','',item.title),el('p','',item.description));article.append(copy);root.append(article);}return root;
}
function date(value: string) { return new Intl.DateTimeFormat('id-ID',{dateStyle:'long',timeZone:'Asia/Jakarta'}).format(new Date(`${value}T00:00:00+07:00`)); }
function events(items: CmsEvent[]) {
  if(!items.length)return empty('Agenda kegiatan segera hadir','Jadwal dan rundown kegiatan OSIS akan dibagikan di sini setelah diumumkan.');
  const root=el('div','content-list');for(const event of [...items].sort((a,b)=>b.date.localeCompare(a.date)||a.start.localeCompare(b.start))){
    const article=el('article');article.id=`acara-${event.id}`;const time=el('time','',`${date(event.date)} · ${event.start}–${event.end} WIB`);time.dateTime=`${event.date}T${event.start}:00+07:00`;
    article.append(time,el('h3','',event.title),el('p','',event.description),el('p','',event.location));
    if(event.rundown.length){const details=el('details','work-details');details.append(el('summary','','Lihat rundown ↘'));const list=el('ol','event-rundown');
      for(const row of event.rundown){const item=el('li'),clock=el('span','rundown-time',`${row.start}–${row.end} WIB`),body=el('div');body.append(el('strong','',row.agenda));if(row.location)body.append(el('p','',row.location));item.append(clock,body);list.append(item);}details.append(list);article.append(details);}
    root.append(article);
  }return root;
}
function photoUpdate(root: Element, source: string, alt: string, placeholder: boolean) {
  const img=root.querySelector<HTMLImageElement>('img');if(img){img.removeAttribute('srcset');img.removeAttribute('sizes');img.src=source;img.alt=alt;}
  const caption=root.querySelector<HTMLElement>('figcaption');if(caption)caption.hidden=!placeholder;
}
export function renderContent(content: CmsContent) {
  const {cabinetName,term,logo,logoAlt}=content.identity;
  document.querySelectorAll('[data-cms-cabinet]').forEach(node=>node.textContent=cabinetName);
  document.querySelectorAll<HTMLElement>('[data-cms-term]').forEach(node=>node.textContent=`${node.dataset.cmsTerm}${term}`);
  document.querySelectorAll('[data-cms-cabinet-term]').forEach(node=>node.textContent=`${cabinetName} · ${term}`);
  const hero=document.querySelector('#hero-title');
  if(hero){const words=cabinetName.split(/\s+/);hero.replaceChildren(document.createTextNode(words.shift()??''),el('br'),el('span','',words.join(' ')));}
  document.querySelectorAll<HTMLImageElement>('[data-cms-logo]').forEach(img=>{img.removeAttribute('srcset');img.src=logo;img.alt=logoAlt;img.closest('.brand-cabinet-frame')?.classList.toggle('brand-logo-custom',logo!=='/images/brand/cabinet-default.webp');});
  let statsChanged=false;
  for(const [key,preview] of [['members',24],['programs',8],['activities',12]] as const){
    const node=document.querySelector<HTMLElement>(`[data-cms-stat="${key}"]`);if(!node)continue;
    const value=content.statistics[key], target=value??preview;node.dataset.countDigits=String(String(target).length);const counter=node.querySelector<HTMLElement>('[data-counter]');
    if(counter){if(counter.dataset.value!==String(target)){statsChanged=true;counter.dataset.value=String(target);}if(node.closest<HTMLElement>('[data-stats]')?.dataset.counterState!=='running')counter.textContent=String(target).padStart(2,'0');}
    const accessible=node.querySelector('[data-stat-accessible]');if(accessible)accessible.textContent=value===null?`Contoh: ${preview}`:String(value);
    const badge=node.querySelector<HTMLElement>('.preview-badge');if(badge)badge.hidden=value!==null;
  }
  const note=document.querySelector<HTMLElement>('.statistics-note');if(note){note.hidden=Object.values(content.statistics).every(value=>value!==null);note.textContent=`Angka contoh untuk pratinjau desain. Data resmi kepengurusan ${term} akan diperbarui setelah dikonfirmasi.`;}
  if(statsChanged)window.dispatchEvent(new CustomEvent('osis:statistics'));

  document.querySelectorAll('[data-cms-vision]').forEach(node=>node.textContent=content.vision);
  document.querySelectorAll('[data-cms-missions]').forEach(node=>node.replaceChildren(...content.missions.map(m=>el('li','',m))));
  document.querySelectorAll<HTMLElement>('[data-cms-people]').forEach(node=>node.replaceChildren(...content.people.filter(p=>p.group===node.dataset.cmsPeople).map(p=>card(p,node.dataset.cmsHeading))));
  document.querySelectorAll<HTMLElement>('[data-cms-departments]').forEach(node=>node.replaceChildren(...content.departments.slice(0,Number(node.dataset.cmsLimit)||10).map(d=>card(d,node.dataset.cmsHeading))));
  document.querySelectorAll('[data-cms-events]').forEach(node=>node.replaceChildren(events(content.events)));
  const personRoot=document.querySelector<HTMLElement>('[data-cms-person]');
  if(personRoot){const path=location.pathname.replace(/\/$/,'').split('/');const id=path.at(-1);const person=content.people.find(p=>p.id===id);
    if(!person){personRoot.replaceChildren(empty('Profil tidak tersedia','Profil ini belum diterbitkan atau sudah diarsipkan.'));return;}
    const title=personRoot.querySelector('#profile-title');if(title)title.textContent=person.name??person.role;
    const intro=personRoot.querySelector('.profile-introduction');if(intro)intro.textContent=person.introduction;
    let subtitle=personRoot.querySelector('.profile-subtitle');if(!subtitle&&person.classLabel){subtitle=el('p','profile-subtitle');title?.after(subtitle);}if(subtitle){subtitle.textContent=person.classLabel;(subtitle as HTMLElement).hidden=!person.classLabel;}
    const label=personRoot.querySelector('.profile-hero .section-label');if(label){const span=label.querySelector('span:last-child');if(span)span.textContent=`${person.role} · ${term}`;}
    const photo=personRoot.querySelector('.profile-photo');if(photo)photoUpdate(photo,person.photo,person.photoAlt,person.photoIsPlaceholder);
    const work=personRoot.querySelector('[data-cms-programs]');if(work)work.replaceChildren(programs(person.programIds,content));
    const result=personRoot.querySelector('[data-cms-results]');if(result)result.replaceChildren(results(person.results));
    const mainRole=['ketua','wakil-ketua'].includes(person.id);
    const note=personRoot.querySelector<HTMLElement>('.work-program-note');if(note)note.hidden=!mainRole;
    const planDescription=personRoot.querySelector('#program-kerja .roster-note');if(planDescription)planDescription.textContent=mainRole?'Program utama dijalankan bersama oleh Ketua dan Wakil Ketua.':`Program kerja ${person.role.toLowerCase()} untuk periode ${term}.`;
    const peers=personRoot.querySelector<HTMLElement>('[data-cms-peers]');if(peers){const list=content.people.filter(p=>p.id!==person.id&&p.group===person.group);peers.classList.toggle('profile-peers-grid',list.length===3);peers.replaceChildren(...list.map(p=>card(p)));}
    const directory=person.group==='advisor'?'/anggota/pembina':person.group==='member'?'/anggota/seksi-bidang':'/anggota';
    const groupLabel=person.group==='advisor'?'Guru pembina':person.group==='member'?'Seksi bidang':'Pengurus inti';
    const crumb=personRoot.querySelector('.profile-breadcrumb a:nth-of-type(2)');if(crumb instanceof HTMLAnchorElement){crumb.href=directory;crumb.textContent=groupLabel;}
    const current=personRoot.querySelector('[aria-current="page"]');if(current)current.textContent=person.role;
    const peerTitle=personRoot.querySelector('#profile-peers-title');if(peerTitle)peerTitle.textContent=person.group==='advisor'?'Kenali tim pembina.':'Kenali pengurus lainnya.';
    const peerBack=personRoot.querySelector<HTMLAnchorElement>('#profile-peers-title')?.closest('header')?.querySelector<HTMLAnchorElement>('a');if(peerBack){peerBack.href=directory;peerBack.textContent=person.group==='advisor'?'Lihat semua guru pembina ↗':'Lihat semua pengurus inti ↗';}
    document.title=`${person.name??person.role} · ${person.role} | SMK Diponegoro 01 Jakarta`;
  }
  const departmentRoot=document.querySelector<HTMLElement>('[data-cms-department]');
  if(departmentRoot){const d=content.departments.find(d=>d.id===departmentRoot.dataset.cmsDepartment);
    if(d){const label=departmentRoot.querySelector('.profile-hero .section-label span:last-child');if(label)label.textContent=`Seksi bidang ${d.number} · ${term}`;const title=departmentRoot.querySelector('#profile-title');if(title)title.textContent=d.name;const intro=departmentRoot.querySelector('.profile-introduction');if(intro)intro.textContent=d.description;
      const photo=departmentRoot.querySelector('.profile-photo');if(photo)photoUpdate(photo,d.photo,d.photoAlt,d.photoIsPlaceholder);
      const work=departmentRoot.querySelector('[data-cms-programs]');if(work)work.replaceChildren(programs(d.programIds,content));
      const result=departmentRoot.querySelector('[data-cms-results]');if(result)result.replaceChildren(results(d.results));
      const team=departmentRoot.querySelector('[data-cms-team]');if(team){const people=content.people.filter(p=>d.memberIds.includes(p.id));const grid=el('div','leadership-grid');grid.append(...people.map(p=>card(p)));team.replaceChildren(people.length?grid:empty('Anggota segera diperkenalkan','Daftar anggota bidang akan ditampilkan setelah tersedia.'));}
      document.title=`${d.name} | SMK Diponegoro 01 Jakarta`;
      departmentRoot.querySelectorAll<HTMLAnchorElement>('.profile-neighbors a').forEach(link=>{const id=link.pathname.split('/').filter(Boolean).at(-1);const peer=content.departments.find(item=>item.id===id);if(peer)link.textContent=peer.name+' ↗';});
    }
  }
  const notices: Announcement[]=content.events.filter(e=>e.notify).map(e=>({id:`cms-${e.id}`,kind:'live',title:e.title,message:`${e.description}\n${e.location}\n${e.start}–${e.end} WIB`,href:`/#acara-${e.id}`,linkLabel:'Lihat rundown',startsAt:`${e.date}T${e.start}:00+07:00`,endsAt:`${e.date}T${e.end}:00+07:00`}));
  // Retain the latest public schedule if the island module initializes later.
  const island=document.querySelector<HTMLElement>('[data-notification-island]');if(island)island.dataset.announcements=JSON.stringify(notices);
  window.dispatchEvent(new CustomEvent('osis:announcements',{detail:notices}));
}
async function refresh() {
  if(loading||document.hidden)return; loading=true;
  try{const response=await fetch('/api/content',{credentials:'omit',headers:{Accept:'application/json'}});if(!response.ok)return;const value=await response.json();if(value.version===version)return;
    const content=validateContent(value.content);renderContent(content);version=value.version;
  }catch{/* The existing static page stays usable when the content service is unavailable. */}finally{loading=false;}
}
void refresh();
let timer=window.setInterval(()=>void refresh(),15_000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
window.addEventListener('pagehide',()=>{clearInterval(timer);timer=0;});
window.addEventListener('pageshow',()=>{if(!timer)timer=window.setInterval(()=>void refresh(),15_000);void refresh();});
