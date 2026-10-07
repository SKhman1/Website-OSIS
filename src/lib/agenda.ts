import type { CmsEvent, CmsRundown } from './cms-content';

const day = 86_400_000;
export function atWib(date: string, time: string, nextDay = false) {
  return Date.parse(`${date}T${time}:00+07:00`) + (nextDay ? day : 0);
}
export function eventBounds(event: CmsEvent) {
  return {start:atWib(event.date,event.start),end:atWib(event.date,event.end,event.endNextDay)};
}
export function sessionBounds(event: CmsEvent, row: CmsRundown) {
  const start=atWib(event.date,row.start);
  return {start,end:row.end?atWib(event.date,row.end,row.endNextDay):start};
}
export function agendaState(event: CmsEvent, now = Date.now()) {
  const bounds=eventBounds(event);
  const active=event.rundown.flatMap((row,index)=>{const b=sessionBounds(event,row);return b.start<=now&&now<b.end?[index]:[];});
  const next=event.rundown.findIndex(row=>sessionBounds(event,row).start>now);
  const phase = now<bounds.start?'upcoming':now>=bounds.end?'finished':active.length?'active':'gap';
  return {active,next,phase} as const;
}
export function preferredEvent(events: CmsEvent[], now = Date.now()) {
  return events.find(e=>{const b=eventBounds(e);return b.start<=now&&now<b.end;})
    ??events.find(e=>eventBounds(e).start>now)??events.at(-1);
}
export function rundownTime(row: Pick<CmsRundown,'start'|'end'|'endNextDay'>) {
  return `${row.start}${row.end?`–${row.end}${row.endNextDay?' (+1 hari)':''}`:''} WIB`;
}
