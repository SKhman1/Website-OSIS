# Keamanan dan serah terima

Cloudflare, domain, secret, database dan deployment dipegang pemilik infrastruktur.
Akun owner Console hanya mengelola konten dan akun pengurus. Editor hanya
menyimpan draft dan foto; pemeriksaan izin selalu dilakukan server.

## Akun

- Tidak ada registrasi publik, akun bawaan atau endpoint bootstrap di website.
- Owner memakai password dan TOTP. Sebelum MFA aktif, sesi setup tidak dapat
  membaca draft/foto atau mengubah konten.
- Aktivasi membutuhkan grant sekali pakai, password saat ini, kode dari HP dan
  password baru. Grant berlaku 24 jam dan terikat akun/epoch.
- TOTP dienkripsi AES-256-GCM memakai secret server `CMS_MFA_KEY` (32 byte hex).
  Backup secara privat; jangan menggantinya saat deployment rutin.
- Password memakai scrypt dengan salt acak. Token sesi hanya disimpan server
  sebagai hash; GUI tidak menyimpan password, token atau key.
- Kode pemulihan dan langkah TOTP hanya dapat dipakai sekali. Simpan sepuluh
  kode pemulihan yang ditampilkan saat aktivasi.
- Sesi berlaku satu jam; GUI terkunci setelah 15 menit tanpa aktivitas.
  Perubahan akses mencabut sesi melalui epoch akun.

## Setup dan pemulihan

`setup-owner.ps1` default-nya `bootstrap`: hanya membuat owner jika tabel akun
kosong. Tidak mengganti akun yang ada. `-Mode authorize-mfa` mengaktifkan MFA
owner yang sudah ada; ditolak jika MFA sudah aktif.

Tools infrastruktur memerlukan izin Wrangler/D1, tidak masuk paket GUI.
Perintah dari folder utama:

```powershell
.\console\.venv\Scripts\python.exe .\console\tools\cms-owner.py bootstrap --database NAMA_DATABASE --enroll
.\console\.venv\Scripts\python.exe .\console\tools\cms-owner.py authorize-mfa --database NAMA_DATABASE --enroll
.\console\.venv\Scripts\python.exe .\console\tools\cms-owner.py recover --database NAMA_DATABASE --enroll
```

Password diminta secara privat. Recovery meminta konfirmasi username,
mengganti password/MFA, mencabut sesi/undangan dan mencatat audit.
Fork menentukan `--url` sendiri; setup database lokal memakai `--local` dan URL localhost.
QR dan kunci hanya ada dalam memori dialog lokal selama maksimal 10 menit.

## Angkatan berikutnya

Owner membuka **Akses pengurus**, membuat undangan sekali pakai, dan memberikannya
secara pribadi. Penerima membuat password sendiri; owner baru juga mengaktifkan MFA.
Uji akun pengganti, lalu nonaktifkan akun lama. Owner aktif terakhir tidak dapat
dinonaktifkan. Jangan berbagi satu akun antarangkatan atau memberikan akses
Cloudflare/D1 kepada pengurus Console.

## Open source

Source publik tidak memberikan akses server. Fork memakai database, URL,
secret dan akun Cloudflare sendiri. Pemilik hak tulis Cloudflare/D1 tetap
dapat mengubah database langsung; MFA Console tidak membatasi hak infrastruktur.

Jangan publikasikan `.env`, `.dev.vars`, backup/ekspor data siswa atau draft,
password/verifier, token, undangan, kunci MFA dan kode pemulihan.
Gitignore tidak menghapus secret dari riwayat Git. Periksa riwayat dan izin
foto/logo sebelum membuka repository; lisensi ikon ada pada direktori aset.

Pengujian tidak menjamin bebas celah. Laporkan kerentanan kepada maintainer
secara privat tanpa menyertakan data siswa atau kredensial.
