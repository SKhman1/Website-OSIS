import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContent, type CmsContent } from '../src/lib/cms-content';
import { verifyPassword, passwordHash, handleCms, publicContent } from '../src/server/cms';
import { validateWebp } from '../src/server/cms-media';
const seed:CmsContent={schemaVersion:1,vision:'Visi sekolah',missions:['Misi sekolah'],events:[],programs:[{id:'program-1',title:'Program',description:'Deskripsi',frequency:'Bulanan',details:[],goals:[]}],
  people:['ketua','wakil-ketua','sekretaris','bendahara'].map(id=>({id,group:'core',role:id,name:null,classLabel:'',introduction:'Perkenalan',photo:'/_astro/test.webp',photoAlt:'Foto',photoIsPlaceholder:true,programIds:[],results:[]})),
  departments:Array.from({length:10},(_,i)=>{const number=String(i+1).padStart(2,'0');return {id:`sekbid-${number}`,number,name:`Bidang ${number}`,description:'Deskripsi',photo:'/_astro/test.webp',photoAlt:'Foto',photoIsPlaceholder:true,memberIds:[],programIds:[],results:[]};})};
test('content preserves all four core roles and ten fields; rejects unknown fields and external images',()=>{
  assert.equal(validateContent(seed).people.filter(p=>p.group==='core').length,4);
  for(const mutate of [c=>{c.secret='private';},c=>{c.people.pop();},c=>{c.people[0].photo='https://evil.test/a.svg';},c=>{c.departments.pop();},c=>{c.people[0].programIds=['missing'];}] as ((c:any)=>void)[]){const c=structuredClone(seed);mutate(c);assert.throws(()=>validateContent(c));}
});
test('rundowns reject invalid dates, overlapping slots, and times outside the event',()=>{
  const event={id:'trip-observasi',title:'Trip Observasi',description:'Deskripsi',date:'2026-10-10',location:'Sekolah',start:'07:00',end:'10:00',notify:false,rundown:[{start:'07:00',end:'08:00',agenda:'Registrasi',location:'Aula'}]};
  const c=structuredClone(seed);c.events=[event];assert.equal(validateContent(c).events.length,1);
  for(const mutate of [e=>{e.date='2026-02-30';},e=>{e.rundown[0].start='06:59';},e=>{e.rundown.push({...e.rundown[0],start:'07:30'});}] as ((e:any)=>void)[]){const bad=structuredClone(c);mutate(bad.events[0]);assert.throws(()=>validateContent(bad));}
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
