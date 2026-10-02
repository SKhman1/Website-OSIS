export const site = {
  name: 'OSIS Dipo 1',
  school: 'SMK Diponegoro 1 Jakarta',
  term: '2026/2027',
  description: 'Ruang informasi, kegiatan, dan aspirasi siswa SMK Diponegoro 1 Jakarta.',
  instagram: 'https://www.instagram.com/osis_smkdipo1/',
};

export const navigation = [
  { href: '/#tentang', label: 'Tentang' },
  { href: '/#visi-misi', label: 'Visi & misi' },
  { href: '/anggota', label: 'Pengurus' },
  { href: '/#kegiatan', label: 'Kegiatan' },
];

export interface Member {
  id: string;
  name: string;
  role: string;
  department: string;
  photo?: string;
}

// Publish only the approved 2026/2027 roster. Do not invent student identities.
export const members: Member[] = [];
export const vision: string | null = null;
export const missions: string[] = [];

export interface Program {
  id: string;
  title: string;
  description: string;
}
export const programs: Program[] = [];

export interface Activity {
  id: string;
  title: string;
  description: string;
  date: string;
}
export const activities: Activity[] = [];

// null means not verified. Preview values demonstrate the requested animation,
// and must remain explicitly labelled as examples until official data arrives.
export const statistics: {
  label: string; value: number | null; previewValue: number; description: string;
}[] = [
  { label: 'Anggota OSIS', value: null, previewValue: 24, description: 'Bekerja bersama dalam satu kepengurusan.' },
  { label: 'Program kerja', value: null, previewValue: 8, description: 'Ruang untuk ide, karya, dan kolaborasi.' },
  { label: 'Kegiatan', value: null, previewValue: 12, description: 'Pertemuan, pengalaman, dan cerita bersama.' },
];
