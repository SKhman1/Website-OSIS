export interface CmsProgram { id: string; title: string; description: string; frequency: string; details: string[]; goals: string[]; }
export interface CmsResult { id: string; title: string; description: string; date: string; photo?: string; photoAlt?: string; }
export interface CmsPerson {
  id: string; group: 'core' | 'advisor' | 'member'; role: string; name: string | null;
  classLabel: string; introduction: string; photo: string; photoAlt: string;
  photoIsPlaceholder: boolean; programIds: string[]; results: CmsResult[];
}
export interface CmsDepartment {
  id: string; number: string; name: string; description: string; photo: string;
  photoAlt: string; photoIsPlaceholder: boolean; chairId?: string | null; memberIds: string[]; programIds: string[]; results: CmsResult[];
}
export interface CmsRundown { start: string; end: string; agenda: string; location: string; endNextDay?: boolean; speaker?: string; coordinator?: string; }
export interface CmsEvent {
  id: string; title: string; description: string; date: string; location: string;
  start: string; end: string; rundown: CmsRundown[]; notify: boolean; endNextDay?: boolean;
}
export interface CmsIdentity { cabinetName: string; term: string; logo: string; logoAlt: string; }
export interface CmsStatistics { members: number | null; programs: number | null; activities: number | null; }
export const defaultIdentity: CmsIdentity = { cabinetName: 'Vimsati Natta Darsa', term: '2026/2027', logo: '/images/brand/cabinet-default.webp', logoAlt: 'Logo angkatan OSIS SMK Diponegoro 01' };
export const defaultStatistics: CmsStatistics = { members: null, programs: null, activities: null };
export interface CmsContent {
  schemaVersion: 2; identity: CmsIdentity; statistics: CmsStatistics; vision: string; missions: string[];
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
function photo(value: unknown): string { const result = text(value, 'Foto', 200); if (result !== defaultIdentity.logo && !localPhoto.test(result)) fail('Foto harus berasal dari aset website.'); return result; }
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
  const c = object(value, ['schemaVersion','identity','statistics','vision','missions','people','departments','programs','events']);
  if (c.schemaVersion !== 1 && c.schemaVersion !== 2) fail('Versi format tidak didukung.');
  // Stored v1 documents and historical revisions retain their approved content.
  // Only missing v1 settings receive the original defaults; v2 writes are strict.
  if (c.schemaVersion === 1 && ('identity' in c || 'statistics' in c)) fail('Format pengaturan tidak valid.');
  const i = object(c.schemaVersion === 1 ? defaultIdentity : c.identity, ['cabinetName','term','logo','logoAlt']);
  const term = text(i.term, 'Tahun ajaran', 9);
  if (!/^\d{4}\/\d{4}$/.test(term) || Number(term.slice(5)) !== Number(term.slice(0,4)) + 1) fail('Tahun ajaran harus berurutan, misalnya 2026/2027.');
  const identity = {cabinetName: text(i.cabinetName,'Nama angkatan',80), term, logo: photo(i.logo), logoAlt: text(i.logoAlt,'Deskripsi logo',250)};
  const st = object(c.schemaVersion === 1 ? defaultStatistics : c.statistics, ['members','programs','activities']);
  function count(value: unknown): number | null { if (value === null) return null; if (!Number.isSafeInteger(value) || Number(value)<0 || Number(value)>99999) fail('Jumlah harus bilangan bulat 0–99999 atau belum dikonfirmasi.'); return Number(value); }
  const statistics = {members: count(st.members), programs: count(st.programs), activities: count(st.activities)};
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
    const d = object(item, ['id','number','name','description','photo','photoAlt','photoIsPlaceholder','chairId','memberIds','programIds','results']);
    const number = text(d.number,'Nomor bidang',2); if (!/^(?:0[1-9]|10)$/.test(number)) fail('Nomor bidang harus 01–10.');
    if (d.id !== `sekbid-${number}`) fail('ID dan nomor bidang tetap agar tautan profil tidak berubah.');
    return {id: identifier(d.id), number, name: text(d.name,'Nama bidang',160), description: text(d.description,'Deskripsi',3000), photo: photo(d.photo), photoAlt: text(d.photoAlt,'Deskripsi foto',250), photoIsPlaceholder: boolean(d.photoIsPlaceholder), chairId: d.chairId == null ? null : identifier(d.chairId), memberIds: ids(d.memberIds), programIds: ids(d.programIds), results: results(d.results)};
  });
  const events = list(c.events, 100, item => {
    const e = object(item, ['id','title','description','date','location','start','end','rundown','notify','endNextDay']);
    const start = time(e.start), end = time(e.end), endNextDay = e.endNextDay === undefined ? false : boolean(e.endNextDay);
    const minutes = (s: string) => Number(s.slice(0,2))*60+Number(s.slice(3));
    const eventEnd = minutes(end) + (endNextDay ? 1440 : 0);
    if (minutes(start) >= eventEnd || eventEnd-minutes(start)>1440) fail('Durasi acara harus positif dan maksimal 24 jam.');
    const rundown = list(e.rundown, 200, row => {
      const r = object(row, ['start','end','agenda','location','endNextDay','speaker','coordinator']);
      const a = time(r.start), b = r.end === '' ? '' : time(r.end), nextDay = r.endNextDay === undefined ? false : boolean(r.endNextDay);
      const finish = b ? minutes(b)+(nextDay?1440:0) : minutes(a);
      if ((!b && nextDay) || (b && finish<=minutes(a)) || finish-minutes(a)>1440 || a<start || finish>eventEnd) fail('Jam rundown harus di dalam waktu acara. Kosongkan selesai untuk penanda waktu.');
      return {start:a,end:b,agenda:text(r.agenda,'Agenda',300),location:text(r.location,'Lokasi',200,true),
        ...(r.endNextDay !== undefined ? {endNextDay:nextDay} : {}),
        ...(r.speaker !== undefined ? {speaker:text(r.speaker,'Narasumber',200,true)} : {}),
        ...(r.coordinator !== undefined ? {coordinator:text(r.coordinator,'Penanggung jawab',200,true)} : {})};
    });
    // Parallel participant/committee sessions are real schedule entries, not conflicts.
    for (let i=1; i<rundown.length; i++) if (rundown[i].start < rundown[i-1].start) fail('Rundown harus berurutan menurut jam mulai.');
    return {id: identifier(e.id), title: text(e.title,'Nama acara',160), description: text(e.description,'Deskripsi',3000), date: date(e.date), location: text(e.location,'Lokasi',200), start, end, rundown, notify: boolean(e.notify), ...(e.endNextDay !== undefined ? {endNextDay} : {})};
  });
  for (const [items,name] of [[people,'pengurus'],[departments,'bidang'],[programs,'program'],[events,'acara']] as const) unique(items,name);
  if (people.filter(p => p.group === 'core').length !== 4 || coreIds.some(id => !people.some(p => p.id === id && p.group === 'core'))) fail('Keempat peran pengurus inti harus tersedia.');
  if (departments.length !== 10 || new Set(departments.map(d => d.number)).size !== 10) fail('Sepuluh seksi bidang harus tersedia.');
  const reserved = ['pembina','seksi-bidang','profil-template'];
  if (people.some(p => reserved.includes(p.id))) fail('ID ini dipakai direktori.');
  for (const item of [...people,...departments]) if (item.programIds.some(id => !programs.some(p => p.id === id))) fail(`Program untuk ${'number' in item ? `seksi bidang ${item.number}` : item.role} tidak ditemukan. Pilih program yang sudah dibuat di console.`);
  for (const d of departments) {
    if (d.chairId && !people.some(p => p.id === d.chairId && p.group === 'member')) fail(`Ketua seksi bidang ${d.number} harus dari daftar anggota seksi bidang.`);
    if (d.chairId && d.memberIds.includes(d.chairId)) fail(`Ketua seksi bidang ${d.number} sudah dipisahkan dari daftar anggota.`);
    if (new Set(d.memberIds).size !== d.memberIds.length) fail(`Anggota seksi bidang ${d.number} tidak boleh dipilih dua kali.`);
    if (d.memberIds.some(id => !people.some(p => p.id === id && p.group === 'member'))) fail(`Anggota seksi bidang ${d.number} tidak ditemukan. Tambahkan profil anggota lalu pilih namanya.`);
  }
  return {schemaVersion: 2, identity, statistics, vision: text(c.vision,'Visi',3000), missions: strings(c.missions,30), people, departments, programs, events};
}
export function contentPhotos(content: CmsContent): Set<string> {
  const items = [...content.people, ...content.departments];
  return new Set([content.identity.logo, ...items.flatMap(item => [item.photo, ...item.results.flatMap(result => result.photo ? [result.photo] : [])])]);
}
export function personPath(person: CmsPerson) { return person.group === 'advisor' ? `/anggota/pembina/${person.id}` : `/anggota/${person.id}`; }
