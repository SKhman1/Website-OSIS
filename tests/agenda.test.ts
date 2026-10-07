import test from 'node:test';
import assert from 'node:assert/strict';
import { agendaState, atWib, eventBounds, preferredEvent } from '../src/lib/agenda';
import type { CmsEvent } from '../src/lib/cms-content';
const event:CmsEvent={id:'trip',title:'Trip',description:'Schedule',date:'2026-10-14',location:'Village',start:'05:30',end:'04:00',endNextDay:true,notify:true,rundown:[
  {start:'05:30',end:'06:00',agenda:'Registration',location:'School'},
  {start:'06:30',end:'07:00',agenda:'Assembly',location:'School'},
  {start:'21:30',end:'04:00',endNextDay:true,agenda:'Participant rest',location:'Home'},
  {start:'21:30',end:'22:30',agenda:'Committee evaluation',location:'Hall'},
  {start:'22:30',end:'',agenda:'Committee rest',location:'Home'},
]};
test('WIB exact boundaries, gaps, and milestone timestamps never become fabricated live sessions',()=>{
  assert.equal(atWib(event.date,'05:30'),Date.parse('2026-10-13T22:30:00Z'));
  assert.equal(agendaState(event,atWib(event.date,'05:29')).phase,'upcoming');
  assert.deepEqual(agendaState(event,atWib(event.date,'05:30')).active,[0]);
  assert.equal(agendaState(event,atWib(event.date,'06:00')).phase,'gap');
  assert.equal(agendaState(event,atWib(event.date,'06:00')).next,1);
  assert.deepEqual(agendaState(event,atWib(event.date,'22:30')).active,[2]);
});
test('parallel sessions and overnight windows remain active until their actual end',()=>{
  assert.deepEqual(agendaState(event,atWib(event.date,'22:00')).active,[2,3]);
  assert.deepEqual(agendaState(event,atWib('2026-10-15','03:59')).active,[2]);
  assert.equal(agendaState(event,atWib('2026-10-15','04:00')).phase,'finished');
  assert.equal(eventBounds(event).end,atWib('2026-10-15','04:00'));
});
test('default selection follows current, next, then most recent archived date',()=>{
  const next={...event,id:'next',date:'2026-10-16'};
  assert.equal(preferredEvent([event,next],atWib('2026-10-14','22:00'))?.id,'trip');
  assert.equal(preferredEvent([event,next],atWib('2026-10-15','12:00'))?.id,'next');
  assert.equal(preferredEvent([event,next],atWib('2026-10-18','12:00'))?.id,'next');
  assert.equal(preferredEvent([]),undefined);
});
