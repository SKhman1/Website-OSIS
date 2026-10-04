# Rencana control panel untuk proyek open source

Status: diperbarui 4 Oktober 2026. Pemisahan provisioning, undangan, MFA owner,
kode aktivasi pertama, pencabutan akses/sesi, dan audit telah diimplementasikan.
Cloudflare/domain/configuration tetap dipegang pemilik infrastruktur; owner panel
mengelola konten dan akses pengurus. Lihat SECURITY.md untuk alur operasional.
Dokumen ini bukan audit keamanan lengkap atau persetujuan publikasi repository.

## Temuan sebelum perbaikan

- GUI membuka dialog setup sebelum login. `desktop-admin/provision.py` membuat
  atau mereset akun melalui Wrangler langsung ke D1, bukan lewat API registrasi.
- Operasi tersebut membutuhkan otorisasi Cloudflare dengan hak ke database.
  Menyalin source, binary, URL API, atau ID database tidak memberi otorisasi itu.
- Pada komputer yang telah terotorisasi, dialog setup bisa mereset akun tanpa
  memverifikasi password CMS. Komputer dan sesi Cloudflare menjadi batas kepercayaan.
- API sudah memeriksa password, sesi, akun aktif, dan peran. Editor menyimpan draft;
  owner menerbitkan dan memulihkan versi. Pembatasan login dan pencabutan sesi sudah ada.
- Penolakan header browser membantu membatasi penggunaan biasa, tetapi header,
  binary, dan GUI dapat diubah. Ketiganya bukan bukti identitas atau izin.
- Pemeriksaan nama file sensitif yang terlacak tidak menemukan `.env`, `.dev.vars`,
  database lokal, atau ekspor draft pada daftar yang diperiksa. Ini tidak menggantikan
  pemindaian isi seluruh riwayat Git dan pemeriksaan artefak rilis.

## Alur yang dituju

1. **GUI harian hanya login.** Hapus dialog setup dan impor provisioning dari aplikasi.
   Paket GUI tidak membawa token Cloudflare, akses SQL, password bawaan, atau kunci
   bersama untuk membuktikan bahwa aplikasi tersebut resmi.
2. **Bootstrap terpisah.** Operator infrastruktur menjalankan perintah deployment
   untuk membuat owner pertama pada database kosong miliknya. Perintah menolak
   database yang sudah memiliki akun; tidak memakai upsert yang mereset akun lama.
   Pemulihan darurat menjadi perintah terpisah dengan otorisasi Cloudflare, target
   database eksplisit, pencabutan sesi, dan catatan audit.
3. **Kelola pengguna setelah login.** Owner dapat membuat undangan editor, menonaktifkan
   akun, dan mencabut sesi dari GUI. Server memeriksa peran dan autentikasi ulang
   untuk operasi ini. Undangan berlaku singkat, hanya sekali, token disimpan sebagai
   hash, dan peran ditentukan oleh owner. Tidak ada registrasi bebas atau pilihan
   menjadi owner di layar masuk.
4. **MFA untuk owner.** Login owner menggunakan password dan TOTP. Aktivasi, pergantian,
   serta pemulihan MFA membutuhkan pemeriksaan identitas; recovery code sekali pakai
   disimpan sebagai hash. Rahasia TOTP dienkripsi menggunakan kunci server terpisah.
   Jangan membuat mekanisme pemulihan yang lebih lemah daripada login.
5. **Hak sederhana dan terpisah dari cloud.** Editor mengedit draft; owner mengelola
   publikasi, riwayat, dan pengguna. Hak Cloudflare tetap pada penanggung jawab
   infrastruktur, tidak dibagikan kepada editor untuk mengelola konten.

Pemilik akun Cloudflare atau pihak yang memiliki hak tulis D1 tetap dapat mengubah
database langsung. MFA CMS dan penghapusan tombol GUI tidak membatasi hak cloud
tersebut. Gunakan MFA Cloudflare, hak minimum, dan akun individual.

## Fleksibilitas antarangkatan dan sekolah

- Sekolah mempertahankan deployment dan database yang sama. Serah terima dilakukan
  dengan membuat akun pengurus baru, menguji aksesnya, lalu menonaktifkan akun dan
  sesi angkatan lama. Jangan membagikan satu password bergantian.
- Owner sebaiknya memiliki penanggung jawab sekolah/pembina dan prosedur recovery
  agar akses tidak hilang ketika satu siswa lulus. Jangan menonaktifkan owner terakhir.
- Nama angkatan, logo, tahun ajaran, roster, program, statistik, dan agenda tetap
  dikelola sebagai konten. Perubahan tahun ajaran tidak otomatis mencabut akun;
  pencabutan akses dilakukan sebagai langkah serah terima yang eksplisit.
- Fork untuk sekolah lain menggunakan URL server, Cloudflare, database, secret,
  dan akun owner sendiri. Konfigurasi contoh tidak menunjuk produksi Dipo secara default.
- Nama proyek dan database yang kini hardcoded pada script dipindahkan ke konfigurasi
  deployment. Pengelola tidak perlu mengubah source untuk memakai instance sendiri.

## Persiapan repositori publik

- Pisahkan template/example dari deployment sekolah. Isi contoh memakai data fiktif
  yang jelas ditandai; aspirasi, draft, ekspor, verifier password, dan kredensial tidak
  menjadi bagian dari repo atau paket rilis.
- Audit asset dan lisensi: lisensi source code tidak otomatis berlaku untuk foto,
  logo sekolah, atau gambar berita. Gunakan placeholder yang boleh didistribusikan
  untuk template; dokumentasikan izin asset sekolah secara terpisah.
- Pindai isi seluruh riwayat Git serta artefak rilis untuk secret. Jika ditemukan,
  cabut/rotasi secret sebelum membersihkan riwayat. `.gitignore` saja tidak cukup.
- CI dari kontribusi publik menjalankan pengujian lokal dengan data dummy dan tidak
  menerima kredensial produksi. Deployment produksi membutuhkan hak maintainer.
- Sediakan contoh konfigurasi, panduan instalasi, panduan serah terima, kebijakan
  pelaporan kerentanan, dan langkah backup/pemulihan yang telah diuji.

## Tahapan dan kriteria selesai

**Tahap 1 — pisahkan setup.** GUI login-only, bootstrap/recovery terpisah, konfigurasi
instance, paket bersih. Uji bahwa copy/fork dan client yang dimodifikasi tetap ditolak
oleh server tanpa akun sah; bootstrap kedua tidak bisa mereset owner.

**Tahap 2 — akses pengurus.** Undangan, penonaktifan akun, MFA owner, audit, dan
pencabutan sesi. Uji editor tidak bisa menerbitkan, membuat owner, atau mengelola
pengguna walaupun ia memanggil API secara langsung. Undangan kedaluwarsa/dipakai ulang
dan sesi akun nonaktif harus ditolak; proses tidak boleh menghapus owner terakhir.

**Tahap 3 — rilis open source.** Audit secret/asset, isolasi contoh, CI aman, dan
simulasi fork serta serah terima pada database uji. Repositori produksi tidak diubah
menjadi public sebelum pemeriksaan ini selesai.

## Rujukan

- [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
  — hak minimum, penolakan akses secara default, dan pemeriksaan izin setiap request.
- [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
  — MFA, autentikasi ulang untuk tindakan sensitif, dan pemulihan akun.
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
  — pemisahan, pembatasan hak, dan siklus hidup kredensial.
