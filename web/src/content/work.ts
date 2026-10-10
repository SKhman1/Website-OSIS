import type { ImageMetadata } from 'astro';

export interface WorkProgram {
  id: string;
  title: string;
  description: string;
  frequency: string;
  details: string[];
  goals: string[];
}
export interface WorkResult {
  id: string;
  title: string;
  description: string;
  date: string;
  photo?: ImageMetadata | string;
  photoAlt?: string;
}

// Source: the three owner-supplied presentations, read on 3 October 2026.
// Quiz and D-LOTM cadence follows the owner's explicit correction: monthly.
// These are plans, not reports of completed events or active payment services.
export const mainPrograms: WorkProgram[] = [
  {
    id: 'dipo-coc', title: 'Dipo Clean of Class', frequency: 'Harian',
    description: 'Dipo COC mengajak setiap kelas menjaga kebersihan lewat piket setelah bel pulang, dengan penilaian dari OSIS.',
    details: ['Petugas piket membersihkan kelas sesuai kriteria yang disusun OSIS.', 'Pengurus mengamati dan menilai kebersihan kelas. Tindak lanjut mengikuti ketentuan pengurus dan guru pembina.', 'Satu kelas terbaik dari tiga angkatan mendapatkan penghargaan pada akhir semester.'],
    goals: ['Membiasakan tanggung jawab bersama terhadap kebersihan kelas.'],
  },
  {
    id: 'dipo-quotes', title: 'Dipo Quotes', frequency: 'Mingguan',
    description: 'Konten motivasi mingguan untuk siswa sekaligus menghidupkan akun Instagram OSIS secara rutin.',
    details: ['Pesan motivasi dibagikan satu kali setiap minggu melalui akun OSIS.'],
    goals: ['Memberi semangat kepada siswa.', 'Menjaga akun OSIS tetap aktif dan dapat dikenal warga sekolah maupun masyarakat.'],
  },
  {
    id: 'dipo-eval', title: 'Dipo Eval', frequency: 'Bulanan',
    description: 'Setiap kelas memberi evaluasi kegiatan OSIS melalui sticky notes sebagai bahan perbaikan bulan berikutnya.',
    details: ['OSIS membagikan satu lembar sticky notes ke setiap kelas pada awal bulan.', 'Kelas mengisi evaluasi bulan sebelumnya dengan bahasa yang santun.', 'Lembaran dikumpulkan kembali pada hari Jumat di awal bulan untuk dibahas pengurus.'],
    goals: ['Memberi ruang masukan dari kelas untuk meningkatkan kerja OSIS.'],
  },
  {
    id: 'dipo-quiz', title: 'Dipo Quiz', frequency: 'Bulanan',
    description: 'Kuis berisi lima pertanyaan pengetahuan umum untuk siswa dari tiga angkatan.',
    details: ['Pertanyaan dapat mencakup pengetahuan Islami dan mata pelajaran umum.', 'Pemilihan dua juara dilakukan dari tiga angkatan, bukan per kelas.'],
    goals: ['Mengajak siswa mengembangkan pengetahuan melalui kegiatan yang menyenangkan.'],
  },
  {
    id: 'dipo-lotm', title: 'Dipo Legend of the Month', frequency: 'Bulanan',
    description: 'Dipo D-LOTM memberi apresiasi kepada siswa kelas X–XII berdasarkan adab, keaktifan, dan prestasi.',
    details: ['Pengurus memperhatikan perkembangan siswa dari tiga angkatan.', 'Pemilihan siswa berprestasi dilakukan bersama guru BK dan wali kelas.'],
    goals: ['Mengapresiasi perilaku dan prestasi yang dapat menjadi motivasi bagi siswa lain.'],
  },
];

export const secretaryPrograms: WorkProgram[] = [
  {
    id: 'mate', title: 'MATE · Mading Tema Estetik', frequency: 'Momen hari besar',
    description: 'Memperbarui mading sekolah dengan tampilan modern, estetik, dan interaktif pada hari nasional atau internasional.',
    details: ['Mading terbit mengikuti momen seperti Sumpah Pemuda, Hari Guru, dan Hari Pahlawan.'],
    goals: ['Meningkatkan estetika sekolah.', 'Menjadikan mading media informasi yang menarik.'],
  },
  {
    id: 'tugas-panitia', title: 'Pembagian tugas panitia', frequency: 'Setiap kegiatan',
    description: 'Sekretaris mendampingi administrasi panitia agar setiap pengurus memahami tugas dan tanggung jawabnya.',
    details: ['Pendampingan dilakukan pada kegiatan dan program kerja, seperti Hari Guru, pameran, dan Dignites.'],
    goals: ['Memperjelas tanggung jawab panitia.', 'Menghindari tugas yang tumpang tindih.'],
  },
  {
    id: 'list-piket', title: 'Penyusunan daftar piket', frequency: 'Harian · jadwal mingguan',
    description: 'Mengatur piket harian untuk menyambut siswa dan guru SMK Diponegoro 01.',
    details: ['Daftar petugas diperbarui setiap minggu untuk pelaksanaan piket setiap hari.'],
    goals: ['Membiasakan budaya 5S: senyum, salam, sapa, sopan, dan santun.', 'Meningkatkan kedisiplinan siswa.'],
  },
  {
    id: 'songquest', title: 'SONGQUEST', frequency: 'Mingguan',
    description: 'Wadah permintaan lagu, pesan, dan salam dari siswa melalui NGL di story Instagram OSIS.',
    details: ['Story NGL dibagikan satu kali setiap minggu untuk menerima permintaan lagu dan pesan.'],
    goals: ['Memfasilitasi selera musik warga sekolah.', 'Menyalurkan pesan atau salam dari siswa.'],
  },
];

export const treasurerPrograms: WorkProgram[] = [
  {
    id: 'kas-iuran', title: 'Pengelolaan kas & iuran', frequency: 'Rutin',
    description: 'Mengelola kas dan iuran anggota untuk mendukung kebutuhan serta kegiatan OSIS.',
    details: ['Dalam rencana program, pembayaran dapat dilakukan secara tunai maupun QRIS.', 'Dana yang terkumpul dikelola sesuai kebutuhan organisasi.'],
    goals: ['Membuat pengelolaan kas lebih teratur, praktis, dan efisien.'],
  },
  {
    id: 'laporan-keuangan', title: 'Laporan keuangan berkala', frequency: 'Berkala',
    description: 'Mencatat pemasukan, pengeluaran, dan saldo kas, disertai pemeriksaan rutin terhadap pencatatan.',
    details: ['Laporan dibuat secara rutin dan diperiksa kembali untuk mengurangi kesalahan pencatatan.'],
    goals: ['Menjaga catatan yang rapi, akurat, transparan, dan dapat dipertanggungjawabkan kepada anggota.'],
  },
  {
    id: 'confession-gift', title: 'OSIS Confession & Gift', frequency: 'Momen tertentu',
    description: 'Rencana penjualan paket hadiah seperti cokelat, bunga, atau hadiah kecil untuk diberikan kepada orang yang dituju.',
    details: ['Kegiatan direncanakan pada momen tertentu, seperti Hari Guru dan hari perayaan lainnya.', 'Transaksi dikelola dengan tertib untuk menambah pemasukan OSIS.', 'Rencana kegiatan menyediakan pilihan identitas anonim atau terbuka sesuai keinginan pembeli.'],
    goals: ['Menciptakan momen yang menyenangkan bagi warga sekolah.', 'Menambah pemasukan untuk mendukung kegiatan OSIS.'],
  },
];

export const allPrograms = [...mainPrograms, ...secretaryPrograms, ...treasurerPrograms];
export function programsFor(ids: string[]) {
  return ids.map(id => allPrograms.find(program => program.id === id)).filter((program): program is WorkProgram => Boolean(program));
}
export const mainProgramNote = 'Penghargaan untuk program kerja direncanakan diumumkan pada akhir semester ganjil dan genap sebagai apresiasi dan motivasi bagi siswa.';
