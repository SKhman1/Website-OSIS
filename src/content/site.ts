import type { ImageMetadata } from 'astro';
import purbayaPhoto from '../assets/placeholders/purbaya.png';
import advisorPhoto from '../assets/placeholders/purbaya-advisor.png';
import { mainPrograms, secretaryPrograms, treasurerPrograms, type WorkProgram, type WorkResult } from './work';

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
  { href: '/sekbid', label: 'Sekbid' },
  { href: '/#kegiatan', label: 'Kegiatan' },
];

export interface LeadershipMember {
  id: string;
  role: string;
  name: string | null;
  classLabel?: string;
  introduction: string;
  photo: ImageMetadata;
  photoAlt: string;
  photoIsPlaceholder: boolean;
  programIds: string[];
  results: WorkResult[];
}
export type Member = LeadershipMember;
// Additional member profiles are added here when names and roles are supplied.
export const members: Member[] = [];

// The supplied Purbaya images demonstrate the layout, not real school staff.
export const advisors: LeadershipMember[] = [{
  id: 'pembina-osis', role: 'Pembina OSIS', name: null,
  introduction: 'Mendampingi pengurus dalam menjalankan kegiatan dan program kerja OSIS.',
  photo: advisorPhoto,
  photoAlt: 'Purbaya sebagai gambar sementara untuk pembina OSIS',
  photoIsPlaceholder: true, programIds: [], results: [],
}];

// Names come from the owner-supplied 2026/2027 program presentations.
export const coreLeadership: LeadershipMember[] = [
  { id: 'ketua', role: 'Ketua', name: 'Naufal Haris', classLabel: 'XI DKV',
    introduction: 'Bersama Wakil Ketua, menjalankan lima program utama kepengurusan 2026/2027.',
    programIds: mainPrograms.map(program => program.id) },
  { id: 'wakil-ketua', role: 'Wakil Ketua', name: 'Alief Zemma A.', classLabel: 'X DKV',
    introduction: 'Bersama Ketua, menjalankan program utama yang mendukung kebersihan, motivasi, evaluasi, dan apresiasi siswa.',
    programIds: mainPrograms.map(program => program.id) },
  { id: 'sekretaris', role: 'Sekretaris', name: 'Alinda Alazar',
    introduction: 'Mengelola program mading, administrasi panitia, daftar piket, dan ruang permintaan lagu siswa.',
    programIds: secretaryPrograms.map(program => program.id) },
  { id: 'bendahara', role: 'Bendahara', name: 'Naurah Khansa Z.',
    introduction: 'Mengelola rencana kas, iuran, laporan keuangan, dan kegiatan penggalangan dana OSIS.',
    programIds: treasurerPrograms.map(program => program.id) },
].map(person => ({
  ...person, photo: purbayaPhoto,
  photoAlt: `Purbaya sebagai gambar sementara untuk ${person.name}`,
  photoIsPlaceholder: true, results: [],
}));
export const profiles = [...advisors, ...coreLeadership, ...members];

export interface Department {
  id: string;
  number: string;
  name: string;
  description: string;
  photo?: string | ImageMetadata;
  photoAlt?: string;
  photoIsPlaceholder?: boolean;
  memberIds: string[];
  programIds: string[];
  results: WorkResult[];
}

// Names, responsibilities, and photos await the approved school content.
export const departments: Department[] = Array.from({ length: 10 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0');
  return {
    id: `sekbid-${number}`,
    number,
    name: `Seksi Bidang ${number}`,
    description: 'Nama dan deskripsi bidang segera diumumkan.',
    photo: purbayaPhoto,
    photoAlt: `Purbaya sebagai foto contoh untuk Seksi Bidang ${number}`,
    photoIsPlaceholder: true,
    memberIds: [], programIds: [], results: [],
  };
});
// Main Ketua/Wakil presentation, slide 2. Render vision/mission on the homepage only.
export const vision: string | null = 'Mewujudkan Sekolah Sehat, Menginspirasi, dan Mengapresiasi';
export const missions: string[] = [
  'Mengembangkan potensi siswa lewat wadah minat & bakat yang aktif',
];

export type Program = WorkProgram;
export const programs: Program[] = mainPrograms;

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
