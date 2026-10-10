// Offline behavioral checks of the actual browser module, with a controlled WIB clock.
import {Window} from 'happy-dom';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
const transform=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
let now=Date.parse('2026-10-14T21:45:00+07:00');
class Clock extends Date {static now(){return now;}}
const window=new Window({url:'https://offline.invalid/'}),document=window.document;
const ticks=[];window.setInterval=callback=>{ticks.push(callback);return ticks.length;};window.clearInterval=()=>{};
let motions=[];window.HTMLElement.prototype.animate=function(frames,options){motions.push({frames,options});return {cancel(){}};};
window.matchMedia=()=>({matches:false});
const context={Date:Clock,Intl,window,document,location:window.location,Element:window.Element};
const lib={};vm.runInNewContext(transform('src/lib/agenda.ts'),{...context,exports:lib});
const ui={};vm.runInNewContext(transform('src/scripts/agenda.ts'),{...context,exports:ui,require:()=>lib});
const event={id:'night',title:'Trip <test>',description:'Public schedule',date:'2026-10-14',location:'Village',start:'05:30',end:'04:00',endNextDay:true,notify:true,rundown:[
  {start:'21:30',end:'04:00',endNextDay:true,agenda:'Participant rest',location:'Home',speaker:'Teacher',coordinator:'Mentor'},
  {start:'21:30',end:'22:30',agenda:'Committee evaluation',location:'Hall'},
  {start:'22:30',end:'',agenda:'Committee rest',location:'Home'},
]};
const source=[event,{...event,id:'next',date:'2026-10-15',title:'Next day'}];
const host=document.createElement('div');document.body.append(host);ui.mountAgenda(host,source);
assert.equal(host.querySelector('[aria-pressed="true"]').dataset.eventId,'night');
assert.equal(host.querySelectorAll('.agenda-session').length,2);
assert.equal(host.querySelectorAll('[aria-current="true"]').length,2);
assert.match(host.textContent,/Narasumber: Teacher/);assert.equal(host.querySelector('test'),null);
const detail=host.querySelector('details');detail.open=true;
const first=host.querySelector('button');first.focus();ui.mountAgenda(host,structuredClone(source));
assert.equal(host.querySelector('details'),detail);assert.equal(document.activeElement,first);
now=Date.parse('2026-10-14T22:30:00+07:00');ticks.forEach(fn=>fn());
assert.equal(host.querySelectorAll('.agenda-session').length,1);assert.equal(host.querySelectorAll('[aria-current="true"]').length,1);
assert.ok(motions.some(m=>m.options.duration===240));
const second=host.querySelectorAll('button')[1];second.click();assert.equal(second.getAttribute('aria-pressed'),'true');
assert.ok(motions.some(m=>m.options.duration===320));
second.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(document.activeElement,first);
window.matchMedia=()=>({matches:true});motions=[];second.click();assert.equal(motions.length,0);
window.location.hash='#acara-night';window.dispatchEvent(new window.Event('hashchange'));assert.equal(first.getAttribute('aria-pressed'),'true');
now=Date.parse('2026-10-15T04:00:00+07:00');ticks.forEach(fn=>fn());assert.equal(host.querySelector('.agenda-current').dataset.phase,'finished');
const notices=ui.agendaNotices(source);assert.equal(notices.length,4);assert.match(notices[0].message,/Sesi sesuai jadwal/);
assert.equal(notices[0].endsAt,'2026-10-14T21:00:00.000Z');assert.ok(notices.every(n=>!n.title.includes('Committee rest')));
source[0].notify=false;assert.equal(ui.agendaNotices(source).length,2);
window.location.hash='';now=Date.parse('2026-10-14T21:45:00+07:00');
const auto=document.createElement('div');document.body.append(auto);ui.mountAgenda(auto,source);
assert.equal(auto.querySelector('.agenda-panel').dataset.eventId,'night');
now=Date.parse('2026-10-15T04:00:00+07:00');ticks.forEach(fn=>fn());
assert.equal(auto.querySelector('.agenda-panel').dataset.eventId,'next');
auto.querySelector('button').click();ticks.forEach(fn=>fn());assert.equal(auto.querySelector('.agenda-panel').dataset.eventId,'night');
assert.equal(auto.querySelector('.agenda-follow').hidden,false);auto.querySelector('.agenda-follow').click();assert.equal(auto.querySelector('.agenda-panel').dataset.eventId,'next');
console.log('PASS parallel/overnight live states, milestones, date and keyboard switches, animation interruption, reduced motion, hash routing, credits, escaping and poll focus preservation');
await window.happyDOM.abort();
