export interface CmsProgram { id: string; title: string; description: string; frequency: string; details: string[]; goals: string[]; }
export interface CmsResult { id: string; title: string; description: string; date: string; photo?: string; photoAlt?: string; }
export interface CmsPerson {
  id: string; group: 'core' | 'advisor' | 'member'; role: string; name: string | null;
  classLabel: string; introduction: string; photo: string; photoAlt: string;
  photoIsPlaceholder: boolean; programIds: string[]; results: CmsResult[];
}
export interface CmsDepartment {
  id: string; number: string; name: string; description: string; photo: string;
  photoAlt: string; photoIsPlaceholder: boolean; memberIds: string[]; programIds: string[]; results: CmsResult[];
}
export interface CmsRundown { start: string; end: string; agenda: string; location: string; }
export interface CmsEvent {
  id: string; title: string; description: string; date: string; location: string;
  start: string; end: string; rundown: CmsRundown[]; notify: boolean;
}
export interface CmsContent {
  schemaVersion: 1; vision: string; missions: string[];
  people: CmsPerson[]; departments: CmsDepartment[]; programs: CmsProgram[]; events: CmsEvent[];
}
export const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const localPhoto = /^(?:\/_astro\/[a-zA-Z0-9_.-]+\.(?:webp|png|jpe?g)|\/api\/media\/[a-f0-9-]{36}\.webp)$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const coreIds = ['ketua', 'wakil-ketua', 'sekretaris', 'bendahara'];
function fail(message: string): never { throw new Error(message); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Data harus berupa objek.');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.includes(key))) fail('Kolom tidak dikenal.');
  return result;
}
function text(value: unknown, name: string, max: number, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(`${name} tidak valid.`);
  return value.trim();
}
function list<T>(value: unknown, max: number, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > max) fail('Jumlah item tidak valid.');
  return value.map(parse);
}
function identifier(value: unknown): string {
  const id = text(value, 'ID', 64); if (!idPattern.test(id)) fail('ID hanya huruf kecil, angka, dan tanda hubung.'); return id;
}
function strings(value: unknown, max = 30, length = 1200): string[] { return list(value, max, item => text(item, 'Teks', length)); }
function ids(value: unknown): string[] { return list(value, 50, identifier); }
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') fail('Nilai pilihan tidak valid.'); return value; }
function photo(value: unknown): string { const result = text(value, 'Foto', 200); if (!localPhoto.test(result)) fail('Foto harus berasal dari aset website.'); return result; }
function date(value: unknown): string {
  const result = text(value, 'Tanggal', 10);
  if (!datePattern.test(result) || new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10) !== result) fail('Tanggal tidak valid.'); return result;
}
function time(value: unknown): string { const result = text(value, 'Jam', 5); if (!timePattern.test(result)) fail('Jam harus HH:MM.'); return result; }
function results(value: unknown): CmsResult[] {
  return list(value, 50, item => {
    const r = object(item, ['id','title','description','date','photo','photoAlt']);
    return { id: identifier(r.id), title: text(r.title,'Judul',160), description: text(r.description,'Deskripsi',3000), date: date(r.date), ...(r.photo ? {photo: photo(r.photo), photoAlt: text(r.photoAlt,'Deskripsi foto',250)} : {}) };
  });
}
function unique(items: {id: string}[], name: string) { if (new Set(items.map(item => item.id)).size !== items.length) fail(`ID ${name} tidak boleh sama.`); }
export function validateContent(value: unknown): CmsContent {
  const c = object(value, ['schemaVersion','vision','missions','people','departments','programs','events']);
  if (c.schemaVersion !== 1) fail('Versi format tidak didukung.');
  const programs = list(c.programs, 100, item => {
    const p = object(item, ['id','title','description','frequency','details','goals']);
    return {id: identifier(p.id), title: text(p.title,'Judul',160), description: text(p.description,'Deskripsi',3000), frequency: text(p.frequency,'Frekuensi',100), details: strings(p.details), goals: strings(p.goals)};
  });
  const people = list(c.people, 150, item => {
    const p = object(item, ['id','group','role','name','classLabel','introduction','photo','photoAlt','photoIsPlaceholder','programIds','results']);
    if (!['core','advisor','member'].includes(p.group as string)) fail('Kelompok pengurus tidak valid.');
    return {id: identifier(p.id), group: p.group as CmsPerson['group'], role: text(p.role,'Peran',100), name: p.name === null ? null : text(p.name,'Nama',160), classLabel: text(p.classLabel,'Kelas',100,true), introduction: text(p.introduction,'Perkenalan',3000), photo: photo(p.photo), photoAlt: text(p.photoAlt,'Deskripsi foto',250), photoIsPlaceholder: boolean(p.photoIsPlaceholder), programIds: ids(p.programIds), results: results(p.results)};
  });
  const departments = list(c.departments, 10, item => {
    const d = object(item, ['id','number','name','description','photo','photoAlt','photoIsPlaceholder','memberIds','programIds','results']);
    const number = text(d.number,'Nomor bidang',2); if (!/^(?:0[1-9]|10)$/.test(number)) fail('Nomor bidang harus 01–10.');
    if (d.id !== `sekbid-${number}`) fail('ID dan nomor bidang tetap agar tautan profil tidak berubah.');
    return {id: identifier(d.id), number, name: text(d.name,'Nama bidang',160), description: text(d.description,'Deskripsi',3000), photo: photo(d.photo), photoAlt: text(d.photoAlt,'Deskripsi foto',250), photoIsPlaceholder: boolean(d.photoIsPlaceholder), memberIds: ids(d.memberIds), programIds: ids(d.programIds), results: results(d.results)};
  });
  const events = list(c.events, 100, item => {
    const e = object(item, ['id','title','description','date','location','start','end','rundown','notify']);
    const start = time(e.start), end = time(e.end); if (start >= end) fail('Jam selesai harus setelah jam mulai.');
    const rundown = list(e.rundown, 200, row => {
      const r = object(row, ['start','end','agenda','location']); const a = time(r.start), b = time(r.end);
      if (a >= b || a < start || b > end) fail('Jam rundown harus di dalam waktu acara.');
      return {start: a, end: b, agenda: text(r.agenda,'Agenda',300), location: text(r.location,'Lokasi',200,true)};
    });
    for (let i=1; i<rundown.length; i++) if (rundown[i].start < rundown[i-1].end) fail('Rundown harus berurutan tanpa jam bertumpuk.');
    return {id: identifier(e.id), title: text(e.title,'Nama acara',160), description: text(e.description,'Deskripsi',3000), date: date(e.date), location: text(e.location,'Lokasi',200), start, end, rundown, notify: boolean(e.notify)};
  });
  for (const [items,name] of [[people,'pengurus'],[departments,'bidang'],[programs,'program'],[events,'acara']] as const) unique(items,name);
  if (people.filter(p => p.group === 'core').length !== 4 || coreIds.some(id => !people.some(p => p.id === id && p.group === 'core'))) fail('Keempat peran pengurus inti harus tersedia.');
  if (departments.length !== 10 || new Set(departments.map(d => d.number)).size !== 10) fail('Sepuluh seksi bidang harus tersedia.');
  const reserved = ['pembina','seksi-bidang','profil-template'];
  if (people.some(p => reserved.includes(p.id))) fail('ID ini dipakai direktori.');
  for (const item of [...people,...departments]) if (item.programIds.some(id => !programs.some(p => p.id === id))) fail('Program yang dirujuk tidak ditemukan.');
  for (const d of departments) if (d.memberIds.some(id => !people.some(p => p.id === id && p.group === 'member'))) fail('Anggota bidang harus dari kelompok anggota.');
  return {schemaVersion: 1, vision: text(c.vision,'Visi',3000), missions: strings(c.missions,30), people, departments, programs, events};
}
export function contentPhotos(content: CmsContent): Set<string> {
  const items = [...content.people, ...content.departments];
  return new Set(items.flatMap(item => [item.photo, ...item.results.flatMap(result => result.photo ? [result.photo] : [])]));
}
export function personPath(person: CmsPerson) { return person.group === 'advisor' ? `/anggota/pembina/${person.id}` : `/anggota/${person.id}`; }
