import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContent, contentPhotos, defaultIdentity, defaultStatistics, type CmsContent } from '../src/lib/cms-content';
import { verifyPassword, passwordHash, handleCms, publicContent } from '../src/server/cms';
import { validateWebp } from '../src/server/cms-media';
const seed:CmsContent={schemaVersion:2,identity:defaultIdentity,statistics:defaultStatistics,vision:'Visi sekolah',missions:['Misi sekolah'],events:[],programs:[{id:'program-1',title:'Program',description:'Deskripsi',frequency:'Bulanan',details:[],goals:[]}],
  people:['ketua','wakil-ketua','sekretaris','bendahara'].map(id=>({id,group:'core',role:id,name:null,classLabel:'',introduction:'Perkenalan',photo:'/_astro/test.webp',photoAlt:'Foto',photoIsPlaceholder:true,programIds:[],results:[]})),
  departments:Array.from({length:10},(_,i)=>{const number=String(i+1).padStart(2,'0');return {id:`sekbid-${number}`,number,name:`Bidang ${number}`,description:'Deskripsi',photo:'/_astro/test.webp',photoAlt:'Foto',photoIsPlaceholder:true,memberIds:[],programIds:[],results:[]};})};
test('content preserves all four core roles and ten fields; rejects unknown fields and external images',()=>{
  assert.equal(validateContent(seed).people.filter(p=>p.group==='core').length,4);
  for(const mutate of [c=>{c.secret='private';},c=>{c.people.pop();},c=>{c.people[0].photo='https://evil.test/a.svg';},c=>{c.departments.pop();},c=>{c.people[0].programIds=['missing'];}] as ((c:any)=>void)[]){const c=structuredClone(seed);mutate(c);assert.throws(()=>validateContent(c));}
});
test('rundowns reject invalid dates, unsorted slots, and times outside the event',()=>{
  const event={id:'trip-observasi',title:'Trip Observasi',description:'Deskripsi',date:'2026-10-10',location:'Sekolah',start:'07:00',end:'10:00',notify:false,rundown:[{start:'07:00',end:'08:00',agenda:'Registrasi',location:'Aula'}]};
  const c=structuredClone(seed);c.events=[event];assert.equal(validateContent(c).events.length,1);
  for(const mutate of [e=>{e.date='2026-02-30';},e=>{e.rundown[0].start='06:59';},e=>{e.rundown.push({...e.rundown[0],start:'06:59'});}] as ((e:any)=>void)[]){const bad=structuredClone(c);mutate(bad.events[0]);assert.throws(()=>validateContent(bad));}
});
test('parallel, overnight and milestone rundown rows retain credits and strict bounds',()=>{
  const c=structuredClone(seed);c.events=[{id:'night',title:'Night',description:'Schedule',date:'2026-10-14',location:'Village',start:'05:30',end:'04:00',endNextDay:true,notify:true,rundown:[
    {start:'21:30',end:'04:00',endNextDay:true,agenda:'Participant rest',location:'Home',speaker:'Teacher',coordinator:'Mentor'},
    {start:'21:30',end:'22:30',agenda:'Committee evaluation',location:'Hall'},
    {start:'22:30',end:'',agenda:'Committee rest',location:'Home'},
  ]}];
  assert.deepEqual(validateContent(c).events[0],c.events[0]);
  for(const change of [e=>e.endNextDay=false,e=>e.rundown[0].endNextDay=false,e=>e.rundown[0].end='05:00',e=>e.rundown[1].end='',e=>e.rundown[2].endNextDay=true,e=>e.endNextDay='yes'] as ((e:any)=>void)[]){
    const bad=structuredClone(c);change(bad.events[0] as any);
    if(bad.events[0].rundown[1].end==='') assert.doesNotThrow(()=>validateContent(bad));else assert.throws(()=>validateContent(bad));
  }
});
test('password verifiers are salted scrypt and cannot match a wrong or malformed verifier',async()=>{
  const value=await passwordHash('Only a disposable test password.');
  assert.equal(await verifyPassword('Only a disposable test password.',value),true);
  assert.equal(await verifyPassword('Wrong password',value),false);
  assert.equal(await verifyPassword('anything','$scrypt$1$1$1$a$b'),false);
});
test('unconfigured administration and public content fail closed without reading request bodies',async()=>{
  const request=new Request('https://example.test/api/manage/login',{method:'POST',body:'not JSON'});
  assert.equal((await handleCms(request,{})).status,503);assert.equal(request.bodyUsed,false);
  assert.equal((await publicContent(new Request('https://example.test/api/content'),{})).status,503);
});

test('photo container rejects large dimensions, animation, malformed sizes and arbitrary chunks',()=>{
  const image=Buffer.alloc(30);image.write('RIFF');image.writeUInt32LE(22,4);image.write('WEBPVP8 ',8);image.writeUInt32LE(10,16);
  image[23]=0x9d;image[24]=1;image[25]=0x2a;image.writeUInt16LE(100,26);image.writeUInt16LE(100,28);
  assert.doesNotThrow(()=>validateWebp(image));
  for(const change of [(b:Buffer)=>b.writeUInt16LE(2000,26),(b:Buffer)=>b.write('ANIM',12),(b:Buffer)=>b.writeUInt32LE(999,4),(b:Buffer)=>b.write('EXIF',12)]){
    const invalid=Buffer.from(image);change(invalid);assert.throws(()=>validateWebp(invalid));
  }
});

test('legacy drafts and revisions gain settings while preserving school content',()=>{
  const {identity,statistics,...old}=structuredClone(seed); const normalized=validateContent({...old,schemaVersion:1});
  assert.deepEqual(normalized.identity,defaultIdentity);assert.deepEqual(normalized.statistics,defaultStatistics);
  assert.deepEqual(normalized.people,old.people); assert.deepEqual(validateContent(normalized),normalized);
});
test('identity and statistics validate boundaries and include cabinet logo in publication media',()=>{
  const c=structuredClone(seed);c.statistics={members:0,programs:99999,activities:null};c.identity.logo='/api/media/11111111-1111-4111-8111-111111111111.webp';
  assert.equal(validateContent(c).statistics.members,0);assert.ok(contentPhotos(validateContent(c)).has(c.identity.logo));
  for(const mutate of [c=>{c.identity.term='2026/2028';},c=>{c.identity.logo='https://evil.test/logo.svg';},c=>{c.statistics.members=-1;},c=>{c.statistics.programs=1.5;},c=>{c.statistics.activities='2';},c=>{delete c.identity;},c=>{c.identity.secret='no';}] as ((c:any)=>void)[]){const bad=structuredClone(c);mutate(bad);assert.throws(()=>validateContent(bad));}
});

test('field chair and members stay separate, accept legacy fields, reject invalid roles and duplicates',()=>{
  const c=structuredClone(seed);c.people.push({...c.people[0],id:'chair-1',group:'member',name:'Ketua Bidang'}, {...c.people[0],id:'member-1',group:'member',name:'Anggota Bidang'});
  c.departments[0].chairId='chair-1';c.departments[0].memberIds=['member-1'];assert.equal(validateContent(c).departments[0].chairId,'chair-1');
  const old=structuredClone(c);delete old.departments[0].chairId;assert.equal(validateContent(old).departments[0].chairId,null);
  for(const change of [d=>d.chairId='ketua',d=>d.chairId='missing',d=>d.memberIds=['chair-1'],d=>d.memberIds=['member-1','member-1']] as ((d:any)=>void)[]){const bad=structuredClone(c);change(bad.departments[0]);assert.throws(()=>validateContent(bad));}
  const invalid=structuredClone(c);invalid.departments[0].memberIds=['KETUA: MOCHAMAD GILANG'];assert.throws(()=>validateContent(invalid),/ID/);
});
