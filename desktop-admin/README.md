# VND Console

Aplikasi desktop native Qt Widgets untuk OSIS SMK Diponegoro 01. Tidak ada WebView,
server web lokal, atau halaman admin pada website. Python hanya diperlukan untuk
pengembangan; build Windows sudah menyertakan runtime.

## Buka di Windows

Jalankan `dist-secure/VND-Console/VND-Console.exe`, atau `start-admin.ps1` dari folder ini.
Pertahankan seluruh folder `VND-Console`, termasuk `_internal`; jangan memindahkan
EXE sendirian. Alamat website: `https://vnd-smkdipo1.pages.dev`.

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

Gunakan CSV UTF-8 atau `.xlsx` satu sheet, maksimal 2 MB dan 200 baris.
Empat judul kolom wajib: **Mulai, Selesai, Agenda, Lokasi**. Contoh:

```csv
Mulai,Selesai,Agenda,Lokasi
07:00,07:30,Registrasi,Aula
07:30,08:00,Pembukaan,Aula
```

Jam menggunakan `HH:MM` WIB. Import membuka preview yang dapat diperbaiki;
penerimaan preview mengganti rundown draft, bukan langsung menerbitkan acara.
Isi nama, tanggal, deskripsi, dan lokasi acara. Jadwal harus berurutan tanpa
tumpang tindih. Formula, macro, tautan eksternal, dan file terenkripsi ditolak.
Centang **Notifikasi selama acara berlangsung** hanya untuk acara yang disetujui;
island tetap tersembunyi sebelum/sesudah waktu acara.

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
Build Windows terbaru ada di `desktop-admin/dist-secure/VND-Console/`;
launcher `start-admin.ps1` membuka versi ini. Folder versi lama dipertahankan agar
jendela yang sedang digunakan dan perubahan lokal tidak terganggu.
