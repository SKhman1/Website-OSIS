# VND Console

Aplikasi desktop native Qt Widgets untuk OSIS SMK Diponegoro 01. Tidak ada WebView,
server web lokal, atau halaman admin pada website. Python hanya diperlukan untuk
pengembangan; build Windows sudah menyertakan runtime.

## Buka di Windows

Jalankan `VND-Console.exe` atau `start-admin.ps1` dari folder utama proyek
`Website-OSIS`. Folder `_internal` harus tetap berada di samping EXE;
jangan memindahkan EXE sendirian. Launcher di folder `desktop-admin` juga
mengarah ke EXE yang sama. Alamat website: `https://vnd-smkdipo1.pages.dev`.

Control panel tidak lagi menyediakan setup/reset akun lokal. Konfigurasi Cloudflare,
domain, database, dan deployment tetap dipegang pemilik infrastruktur. Pengurus
berikutnya hanya mengelola konten melalui akun yang diundang owner panel.

1. Owner yang sudah ada login memakai password. Kosongkan kode saat aktivasi MFA pertama.
2. Pada dialog keamanan, masukkan kode aktivasi owner dari pemilik infrastruktur
   (atau kode dari hasil penerimaan undangan owner), password saat ini, buat kunci autentikator, lalu
   tambahkan secara manual ke aplikasi authenticator (TOTP, 6 digit, 30 detik).
3. Masukkan kode yang cocok dan password baru yang berbeda. Simpan sepuluh kode
   pemulihan secara pribadi; kode hanya ditampilkan sekali. Login lagi dengan
   password baru dan kode authenticator berikutnya, setelah pergantian 30 detik.
4. Owner membuka **Akses pengurus** untuk membuat undangan sekali pakai, berlaku
   24 jam. Penerima memakai **Saya memiliki undangan pengurus** dan membuat password
   sendiri. Tidak ada pilihan role/username pada formulir penerima.
5. Editor menyimpan draft; owner panel menerbitkan konten dan mengelola akses akun.
   Owner panel tidak mendapat token atau akses Cloudflare. Pengelolaan akun meminta
   password dan kode baru. Akun lama dinonaktifkan setelah serah terima.

Paket ini tidak membutuhkan Node/Wrangler atau folder source untuk digunakan.
Gunakan alamat HTTPS milik sekolah yang dipercaya. Jangan memasukkan password
ke server dari fork yang tidak dipercaya. Password/key/kode tidak perlu diberikan
melalui chat. Pemilik infrastruktur menjalankan bootstrap/recovery terpisah bila
perlu; lihat `../SECURITY.md`. Owner yang belum aktif MFA tidak dapat membuka draft.

## Alur kerja

- Edit visi/misi, pengurus/pembina, sepuluh seksi bidang, program, hasil kerja,
  kegiatan, dan rundown pada menu kiri.
- **Simpan draft ke server** belum mengubah website siswa.
- **Preview publikasi** menampilkan isi yang akan diterbitkan. **Preview foto**
  membuka gambar yang sudah tersimpan dalam draft.
- Akun `owner` menekan **Publikasikan** setelah memeriksa draft. Akun `editor`
  hanya dapat menyimpan draft; server tetap menolak publikasi walaupun klien diubah.
- Website memperbarui konten dalam sekitar 30 detik pada tab aktif, tanpa build.
- **Riwayat perubahan** menyimpan 50 versi terakhir. Pemilik dapat mengembalikan
  versi sebagai draft, memeriksa, lalu menerbitkannya.

Pilih ketua seksi bidang, anggota, dan program melalui daftar nama. Ketua dipisahkan
dari anggota; nama/program baru dapat ditambahkan langsung lewat pemilih. ID tetap
untuk menjaga tautan. Profil baru memakai kelompok member, pembina advisor, dan
empat peran inti core. Setiap hasil kerja memiliki ID, judul, deskripsi, dan tanggal.

Foto JPG/PNG/WebP diproses lokal menjadi WebP statis, sisi maksimal 1600 piksel,
tanpa metadata. Input maksimal 15 MB/24 megapiksel; hasil maksimal 1 MB. Setelah
memilih foto, isi deskripsi foto dan simpan draft. Foto draft tidak dapat dibuka
publik sebelum diterbitkan. D1 menampung maksimal 200 unggahan pada versi awal.

## Import rundown

File **RUNDOWN TO (2).xlsx** menjadi preset untuk acara berikutnya. Pertahankan
judul **RUNDOWN KEGIATAN**, nama acara, tanggal lengkap (contoh `14 Oktober 2026`),
dan enam kolom **NO, WAKTU, KEGIATAN, TEMPAT, NARASUMBER, PENANGGUNG JAWAB**
pada setiap blok hari. Beberapa blok hari dapat berada dalam satu atau beberapa
sheet. Nomor hari di website mengikuti urutan tanggal, bukan label hari yang
mungkin tersalin dari blok sebelumnya.

Di **Kegiatan & rundown**, gunakan **Import agenda Excel…** untuk mengimpor
beberapa hari. Preview memiliki pilihan hari dan centang **Impor hari ini**.
Periksa/perbaiki jam di tabel sebelum menerima. Import ulang judul acara dan
tanggal yang sama memperbarui jadwal tanpa membuat duplikat; deskripsi dan pilihan
notifikasi yang sudah diatur tetap tersimpan. Untuk mengganti satu acara, gunakan
**Import rundown Excel / CSV…** di formulir acara dan pilih satu hari.

Jam `07:30` maupun `07.30` diterima. Rentang `21:30 - 04:00` berarti selesai
esok hari; preview menyediakan centang untuk mengubahnya. Waktu tunggal seperti
`13:45` menjadi penanda waktu tanpa durasi, bukan sesi yang terus berlangsung.
Sesi peserta dan panitia boleh berjalan paralel. Sel narasumber/penanggung jawab
yang benar-benar digabung diwariskan sesuai area gabungannya. Sheet panitia,
nomor telepon, perlengkapan, dan gambar tidak ikut dikirim ke server.

Batas file 2 MB, isi ZIP 20 MB, 20 sheet, 2000 baris fisik dan 64 kolom per sheet,
100.000 sel tersimpan, 100 hari dan 200 sesi per hari. Formula pada sheet rundown,
macro, tautan eksternal, file terenkripsi, dan area gabungan terlalu besar ditolak.
Formula sheet lain tidak dievaluasi atau diimpor.

Format sederhana CSV UTF-8 / Excel tetap mendukung empat kolom
**Mulai, Selesai, Agenda, Lokasi**. Format ini satu hari dan tidak bertumpuk:

```csv
Mulai,Selesai,Agenda,Lokasi
07:00,07:30,Registrasi,Aula
07:30,08:00,Pembukaan,Aula
```

Import mengubah draft lokal. Isi deskripsi/lokasi, aktifkan **Notifikasi selama
sesi terjadwal** jika disetujui, simpan draft, lalu owner mempublikasikan.
Jadwal baru otomatis tampil tanpa build/deploy. Island hanya muncul dalam
rentang sesi yang memiliki durasi; jeda dan penanda waktu tidak memicu notifikasi.
Website menunjukkan sesi menurut jam WIB, bukan konfirmasi kehadiran langsung.

## Password dan sesi

Password dan token sesi tidak disimpan ke disk. Aplikasi hanya mengingat alamat
website dan username. Sesi server berlaku satu jam; GUI terkunci setelah 15 menit
tanpa aktivitas. Perubahan lokal yang belum disimpan hilang ketika terkunci.
Mengganti/reset password mencabut seluruh sesi akun. Gunakan penyimpanan password
pribadi yang sesuai. Paket aplikasi tidak mengandung kredensial hosting.

## Build dari source

Windows yang sudah dibangun dan diuji:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-build.txt
powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1
```

macOS/Linux memakai source yang sama, tetapi paketnya harus dibangun pada OS
masing-masing; binary untuk kedua OS tersebut belum diuji pada perangkat nyata.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-build.txt
sh build.sh
```

Ketergantungan Qt menggunakan PySide6-Essentials; Qt WebEngine tidak disertakan.
Informasi API, database, dan pengujian pengembang ada di `../CMS.md`.

Uji paket Windows dapat dijalankan dengan `VND-Console.exe --self-test`.
Tes ini menjalankan alur login, memuat konten, riwayat, logout, penolakan password,
dan percobaan ulang lewat server lokal sementara. Tidak menggunakan akun asli,
mengubah pengaturan tersimpan, atau menerbitkan konten.
Identitas angkatan dan statistik dapat diubah melalui menu **Identitas angkatan**
dan **Statistik beranda**. Isi nama angkatan, tahun ajaran berurutan (misalnya
2027/2028), unggah logo angkatan, lalu isi angka yang sudah dikonfirmasi.
Angka kosong berarti belum dikonfirmasi; angka 0 tetap ditampilkan sebagai 0.
Pilih **Simpan draft ke server**, periksa **Preview publikasi**, lalu
**Publikasikan**. Website mengikuti perubahan dalam sekitar 30 detik tanpa build.
Logo OSIS resmi tetap terpisah dari logo angkatan. Logo PNG transparan berbentuk
persegi dianjurkan; preview tersedia sebelum publikasi. Gunakan versi GUI terbaru
untuk menyimpan pengaturan ini; versi lama akan diminta diperbarui.

Ketua seksi bidang sekarang dipilih terpisah dari anggotanya. Menu **Seksi bidang**
menampilkan pilihan nama; gunakan **Tambah ketua…**, **Tambah anggota…**, atau
**Tambah program…** untuk membuat profil/program langsung dari bidang tersebut.
Tidak perlu mengetik ID. Ketua otomatis dikeluarkan dari pilihan anggota agar
namanya tidak muncul dua kali. Preview publikasi menampilkan nama dan judul
program. Simpan draft terlebih dahulu, lalu publikasikan setelah diperiksa.
Build Windows terbaru ada langsung di folder utama proyek: `VND-Console.exe`
dan `_internal/`. Build berikutnya memperbarui lokasi yang sama; tutup aplikasi
sebelum build. Paket `dist`, `dist-members`, `dist-portable`, dan `dist-secure`
lama dipindahkan ke arsip terpisah di luar proyek. Source, pengaturan login,
dan preset lokal tetap disimpan.

## Excel berbeda format dan bantuan AI

Di **Kegiatan & rundown**, pilih **Import fleksibel / AI…**, pilih sheet dan area
seperti `A1:H60`, lalu **Baca area lokal**. Kolom umum dideteksi otomatis. Periksa
baris isi, sel judul/tanggal dan pilihan kolom; **Tambah tabel manual** tersedia
untuk susunan lainnya. Pemetaan bisa disimpan sebagai preset lokal untuk dipakai
ulang; preset menyimpan koordinat, bukan isi Excel. Periksa preset setiap kali
baris/kolom berubah. Maksimal satu area 200 baris × 20 kolom, 12 tabel.

Jika perlu, periksa preview dan centang izin pengiriman area tersebut, lalu pilih
**Bantu baca dengan AI**. Hanya sel pada preview dikirim melalui API terautentikasi
ke Groq. Nomor telepon/email yang dikenali disamarkan. Pilih hanya rundown publik;
jangan sertakan kontak atau informasi privat. AI memakai GPT-OSS 20B untuk menunjuk
sel sumber, tanpa menulis ulang jadwal. Tidak ada API key dalam aplikasi.

Pilih **Periksa hasil pemetaan**, lengkapi tanggal/judul yang kosong dan periksa
setiap jam di preview. Tooltip sel agenda menunjukkan baris sumber. Hasil baru
masuk draft lokal; lanjutkan **Simpan draft ke server → Preview publikasi →
Publikasikan** sesuai izin akun. Impor manual tetap bekerja saat Groq tidak tersedia.
Formula di area terpilih harus diganti dengan salinan nilai biasa terlebih dahulu.

## Favicon setiap angkatan

Menu **Identitas angkatan** memuat **Ikon tab / favicon**. Kosongkan atau pilih
**Ikuti logo** untuk mengikuti logo angkatan secara otomatis. **Pilih ikon…**
mengunggah ikon khusus, dikonversi menjadi WebP transparan 256 × 256 tanpa metadata.
Preview ikon tersedia. Simpan draft, periksa preview dan publikasikan; website
mengikuti perubahan tanpa build ulang. Paket ZIP harus diekstrak seluruhnya;
folder `_internal` tetap berada bersama `VND-Console.exe`.
