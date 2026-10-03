# VND Console

Aplikasi desktop native Qt Widgets untuk OSIS SMK Diponegoro 01. Tidak ada WebView,
server web lokal, atau halaman admin pada website. Python hanya diperlukan untuk
pengembangan; build Windows sudah menyertakan runtime.

## Buka di Windows

Jalankan `dist-portable/VND-Console/VND-Console.exe`, atau `start-admin.ps1` dari folder ini.
Pertahankan seluruh folder `VND-Console`, termasuk `_internal`; jangan memindahkan
EXE sendirian. Alamat website: `https://vnd-smkdipo1.pages.dev`.

Pertama kali, pada laptop pemilik:

1. Klik **Setup akun di komputer pemilik**. Pilih folder proyek Website-OSIS.
2. Isi username huruf kecil, password minimal 15 karakter, ulangi password, dan
   pilih `owner`. Biarkan pilihan database lokal **tidak dicentang**.
3. Klik **Siapkan akun**. Setelah berhasil, tutup dialog dan login.

Setup menggunakan otorisasi Wrangler yang sudah ada di komputer pemilik. Folder
proyek harus memiliki Node.js dan `node_modules/wrangler` (`npm ci` jika belum ada).
Password diketik sendiri di aplikasi; tidak perlu diberikan melalui chat.
Reset akun lewat setup juga mencabut semua sesi akun tersebut.

Pemilik dapat membuat akun `editor` untuk pengurus lainnya. Berikan paket aplikasi
kepada mereka, lalu mereka login dengan akun masing-masing. Mereka tidak perlu
Wrangler, token Cloudflare, atau akses repositori untuk mengedit konten.

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

ID program dan anggota terlihat di daftar sebelah kiri. Masukkan ID tersebut,
satu per baris, pada profil/bidang yang menjalankannya. ID profil/program lama
dan nomor bidang tetap untuk menjaga tautan. Anggota baru dapat diberi kelompok
`member`, pembina baru `advisor`, sedangkan empat peran inti memakai `core`.
Setiap hasil kerja memiliki ID unik, judul, deskripsi, dan tanggal `YYYY-MM-DD`.
Foto hasil kerja opsional; pilih baris hasil sebelum menekan tombol unggah foto.

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
