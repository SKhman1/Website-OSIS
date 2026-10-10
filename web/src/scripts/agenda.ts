import type { CmsEvent } from '../lib/cms-content';
import type { Announcement } from '../content/announcements';
import { agendaState, atWib, eventBounds, preferredEvent, rundownTime, sessionBounds } from '../lib/agenda';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', copy?: string) {
  const result=document.createElement(tag);result.className=cls;if(copy!==undefined)result.textContent=copy;return result;
}
const mounts = new WeakMap<Element,{signature:string;dispose:()=>void;following:()=>boolean}>();
const dateLabel=(value:string)=>new Intl.DateTimeFormat('id-ID',{weekday:'short',day:'numeric',month:'short',timeZone:'Asia/Jakarta'}).format(new Date(atWib(value,'00:00')));
const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
function arrive(target:HTMLElement, direction=1, duration=320) {
  if(reduced())return;
  target.getAnimations?.().forEach(animation=>animation.cancel());
  target.animate?.([{transform:`translateX(${direction*16}px)`,opacity:.35},{transform:'translateX(0)',opacity:1}],{duration,easing:'cubic-bezier(.2,0,0,1)'});
}

/** Schedule windows, including overnight sessions, drive the existing navbar island. */
export function agendaNotices(events:CmsEvent[]):Announcement[] {
  return events.filter(e=>e.notify).flatMap<Announcement>(event=>{
    const rows=event.rundown.filter(row=>row.end);
    if(!rows.length){const bounds=eventBounds(event);return [{id:`cms-${event.id}`,kind:'event' as const,title:event.title,message:`${event.description}\n${event.location}\n${event.start}–${event.end} WIB${event.endNextDay?' (+1 hari)':''}`,href:`/#acara-${event.id}`,linkLabel:'Lihat rundown',startsAt:new Date(bounds.start).toISOString(),endsAt:new Date(bounds.end).toISOString()}];}
    return rows.map((row,index)=>{const bounds=sessionBounds(event,row);return {
      id:`cms-${event.id}-${index}`,kind:'live' as const,title:row.agenda.split('\n')[0],
      message:`${event.title}\nSesi sesuai jadwal: ${rundownTime(row)}\n${row.agenda}\n${row.location}${row.speaker?`\nNarasumber: ${row.speaker}`:''}${row.coordinator?`\nPenanggung jawab: ${row.coordinator}`:''}`,
      href:`/#acara-${event.id}`,linkLabel:'Lihat rundown',startsAt:new Date(bounds.start).toISOString(),endsAt:new Date(bounds.end).toISOString(),
    };});
  });
}

/** Keep navigation, focus and open disclosures intact when unrelated CMS fields change. */
export function mountAgenda(host:Element, source:CmsEvent[]) {
  const signature=JSON.stringify(source),previous=mounts.get(host);if(previous?.signature===signature)return;
  const former=host.querySelector<HTMLElement>('[aria-pressed="true"]')?.dataset.eventId;
  const wasOpen=host.querySelector<HTMLDetailsElement>('details')?.open??false;
  const focusWasSummary=document.activeElement?.tagName==='SUMMARY';
  const hadFocus=host.contains(document.activeElement);previous?.dispose();
  const events=[...source].sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start));
  if(!events.length){host.replaceChildren(node('div','empty-state','Jadwal dan rundown kegiatan OSIS akan dibagikan setelah diumumkan.'));return;}
  const root=node('div','agenda'),nav=node('nav','agenda-days'),track=node('div','agenda-day-track'),indicator=node('span','agenda-day-indicator');
  nav.setAttribute('aria-label','Pilih hari kegiatan');indicator.setAttribute('aria-hidden','true');
  const panel=node('article','agenda-panel');panel.id='agenda-panel';
  const buttons=events.map(event=>{const button=node('button','agenda-day');button.type='button';button.dataset.eventId=event.id;button.id=`acara-${event.id}`;
    button.setAttribute('aria-controls','agenda-panel');button.append(node('span','',dateLabel(event.date)),node('small','',event.title));track.append(button);return button;});
  const follow=node('button','agenda-follow text-link','Kembali ke jadwal saat ini');follow.type='button';follow.hidden=true;
  track.append(indicator);nav.append(track);root.append(nav,follow,panel);host.replaceChildren(root);
  let selected=-1,statusKey='',status:HTMLElement,rows:HTMLElement[]=[],open=wasOpen;
  let following=previous?.following()??true;
  function revealSelected(animate=false) {
    const button=buttons[selected];if(!button)return;
    if(button.offsetLeft<nav.scrollLeft||button.offsetLeft+button.offsetWidth>nav.scrollLeft+nav.clientWidth){
      const left=Math.max(0,button.offsetLeft-(nav.clientWidth-button.offsetWidth)/2);
      if(animate&&!reduced())nav.scrollTo?.({left,behavior:'smooth'});else nav.scrollLeft=left;
    }
  }
  function positionIndicator(animate=false) {
    const button=buttons[selected];if(!button)return;
    const before=indicator.style.transform;
    const transform=`translateX(${button.offsetLeft}px) scaleX(${button.offsetWidth})`;
    indicator.style.transform=transform;
    indicator.getAnimations?.().forEach(animation=>animation.cancel());
    if(animate&&!reduced()&&before)indicator.animate?.([{transform:before},{transform}],{duration:320,easing:'cubic-bezier(.2,0,0,1)'});
  }
  function updateSession(animate=true) {
    if(selected<0)return;const event=events[selected],now=Date.now(),state=agendaState(event,now);
    rows.forEach((row,index)=>{const b=sessionBounds(event,event.rundown[index]);const current=state.active.includes(index);
      row.dataset.state=current?'active':now>=b.end?'past':'future';
      if(current)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current');
      const label=row.querySelector<HTMLElement>('.rundown-state');if(label)label.textContent=current?'Sesi saat ini':now>=b.end?'Selesai':event.rundown[index].end?'Terjadwal':'Penanda waktu';
    });
    const key=JSON.stringify([event.id,state.phase,state.active,state.next]);if(key===statusKey)return;statusKey=key;
    const label=state.phase==='active'?'Sesi saat ini, sesuai jadwal':state.phase==='finished'?'Rangkaian hari ini selesai':state.phase==='gap'?'Jeda antar sesi':'Kegiatan mendatang';
    const copy=node('div','agenda-session-copy'),stateLabel=node('p','agenda-session-label',label);stateLabel.setAttribute('role','status');stateLabel.setAttribute('aria-live','polite');copy.append(stateLabel);
    const shown=state.active.length?state.active:state.phase==='upcoming'&&state.next>=0?[state.next]:[];
    shown.forEach(index=>{const row=event.rundown[index],session=node('div','agenda-session');session.append(node('h4','',row.agenda),node('p','',`${rundownTime(row)}${row.location?` · ${row.location}`:''}`));copy.append(session);});
    if(state.next>=0&&state.phase!=='upcoming'){const row=event.rundown[state.next];copy.append(node('p','agenda-next',`Berikutnya ${row.start} WIB · ${row.agenda.split('\n')[0]}`));}
    if(state.phase==='finished')copy.append(node('p','',`Rundown lengkap tetap tersedia di bawah.`));
    if(state.phase==='upcoming')copy.append(node('p','agenda-next',`${dateLabel(event.date)} · Waktu Indonesia Barat`));
    const clock=node('time','agenda-clock',`${event.start}–${event.end}`);clock.dateTime=new Date(eventBounds(event).start).toISOString();clock.append(node('small','',`WIB${event.endNextDay?' · hingga esok hari':''}`));
    status.dataset.phase=state.phase;status.replaceChildren(copy,clock);if(animate)arrive(copy,1,240);
  }
  function select(index:number, animate=true, focus=false) {
    if(index===selected){if(focus)buttons[index].focus();return;}
    const old=selected;selected=index;
    buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
    panel.setAttribute('aria-labelledby',buttons[index].id);
    const event=events[index],heading=node('header','agenda-heading');heading.append(node('h3','',event.title),node('p','',event.description),node('p','agenda-location',event.location));
    status=node('div','agenda-current');
    const details=node('details','work-details agenda-details');details.open=open;
    details.addEventListener('toggle',()=>{open=details.open;});
    const summary=node('summary','',`Lihat rundown lengkap (${event.rundown.length} sesi)`),list=node('ol','event-rundown');
    rows=event.rundown.map(row=>{const item=node('li'),time=node('div','rundown-time',rundownTime(row)),body=node('div','rundown-body');time.append(node('span','rundown-state'));
      body.append(node('strong','',row.agenda));if(row.location)body.append(node('p','',row.location));
      if(row.speaker)body.append(node('p','rundown-credit',`Narasumber: ${row.speaker}`));
      if(row.coordinator)body.append(node('p','rundown-credit',`Penanggung jawab: ${row.coordinator}`));item.append(time,body);list.append(item);return item;});
    details.append(summary,list);panel.replaceChildren(heading,status,details);panel.dataset.eventId=event.id;
    statusKey='';updateSession(false);positionIndicator(animate);revealSelected(animate);
    if(animate)arrive(panel,index>old?1:-1);if(focus)buttons[index].focus();
  }
  buttons.forEach((button,index)=>{
    button.addEventListener('click',()=>{following=false;select(index);updateFollow();});
    button.addEventListener('keydown',e=>{const key=e.key;const next=key==='ArrowRight'?(index+1)%events.length:key==='ArrowLeft'?(index+events.length-1)%events.length:key==='Home'?0:key==='End'?events.length-1:-1;
      if(next>=0){e.preventDefault();following=false;select(next,true,true);updateFollow();}});
  });
  function updateFollow(){follow.hidden=following||events[selected]?.id===preferredEvent(events)?.id;}
  function tick(){if(document.hidden)return;
    const next=events.findIndex(event=>event.id===preferredEvent(events)?.id);
    if(following&&next>=0&&next!==selected&&!panel.contains(document.activeElement))select(next);else updateSession();updateFollow();
  }
  follow.addEventListener('click',()=>{following=true;tick();});
  const fromHash=()=>events.findIndex(event=>location.hash===`#acara-${event.id}`);
  const hashChange=()=>{const index=fromHash();if(index>=0){following=false;select(index);updateFollow();}};
  const anchorClick=(e:Event)=>{const target=e.target instanceof Element?e.target.closest<HTMLAnchorElement>('a[href]'):null;
    if(target?.pathname==='/'&&target.hash.startsWith('#acara-')){const index=events.findIndex(event=>target.hash===`#acara-${event.id}`);if(index>=0){following=false;select(index);updateFollow();}}};
  const hashIndex=fromHash(),initial=hashIndex>=0?hashIndex:events.findIndex(event=>event.id===(former??preferredEvent(events)?.id));
  if(hashIndex>=0)following=false;
  select(Math.max(0,initial),false,hadFocus&&!focusWasSummary);updateFollow();
  if(hadFocus&&focusWasSummary)panel.querySelector('summary')?.focus();
  if(!previous&&(hashIndex>=0||location.hash==='#kegiatan'))window.requestAnimationFrame(()=>root.closest('#kegiatan')?.scrollIntoView({block:'start'}));
  const timer=window.setInterval(tick,15_000);
  const visibility=tick;
  const resize=()=>{positionIndicator();revealSelected();};const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):undefined;observer?.observe(nav);
  window.addEventListener('hashchange',hashChange);window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);document.addEventListener('click',anchorClick);
  const dispose=()=>{window.clearInterval(timer);observer?.disconnect();window.removeEventListener('hashchange',hashChange);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('click',anchorClick);window.removeEventListener('pagehide',pageHide);};
  const pageHide=(e:PageTransitionEvent)=>{if(!e.persisted)dispose();};window.addEventListener('pagehide',pageHide);
  mounts.set(host,{signature,dispose,following:()=>following});
}
