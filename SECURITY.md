# Keamanan dan serah terima pengelolaan

## Batas wewenang

Pemilik infrastruktur tetap memegang Cloudflare, domain, binding database, secret,
backup, dan deployment. Angkatan berikutnya meminta perubahan tersebut kepada
pemilik infrastruktur. Akun **owner panel** bukan akun Cloudflare: hanya mengelola
konten dan akses pengurus. Editor hanya menyimpan draft dan mengunggah foto.

Control panel adalah klien publik. Menyalin atau mengubah binary/source tidak
memberi izin server. Tidak ada secret aplikasi bersama, registrasi umum, akun
bawaan, atau endpoint bootstrap. Header browser bukan batas autentikasi.

## Akun dan MFA

- Owner wajib memakai password dan TOTP. Login owner yang belum memiliki MFA
  menghasilkan sesi setup 10 menit yang tidak dapat membaca draft/foto atau menulis
  konten. Setup memerlukan kode aktivasi owner sekali pakai (24 jam), password saat ini,
  kode autentikator, dan password baru. Kode aktivasi diterbitkan pemilik
  infrastruktur atau sebagai hasil penerimaan undangan owner yang sah.
- TOTP disimpan terenkripsi AES-256-GCM, terikat ke ID akun, dengan key terpisah
  pada secret server `CMS_MFA_KEY`. Key harus 64 karakter hex (32 byte), dibuat
  sekali, dibackup secara privat, dan tidak diubah saat deploy rutin. Kehilangan
  key memerlukan pemulihan MFA oleh pemilik infrastruktur.
- Sepuluh kode pemulihan acak ditampilkan sekali; server hanya menyimpan hash.
  Setiap kode dan langkah waktu TOTP hanya dapat dipakai sekali, termasuk ketika
  permintaan bersamaan. Jika kode baru dipakai untuk login, tunggu kode berikutnya
  sebelum tindakan sensitif, atau gunakan satu kode pemulihan yang belum dipakai.
- Pengelolaan undangan/akun dan perubahan password membutuhkan autentikasi ulang;
  owner memasukkan password dan faktor baru. Pengguna tidak bisa mengubah perannya
  sendiri. Tidak ada pemulihan akun anonim dari aplikasi.
- Password di-hash scrypt N=32768, r=8, p=3, salt acak 16 byte. Sesi acak disimpan
  sebagai hash pada server, berlaku satu jam. Password/token tidak disimpan GUI.
  GUI terkunci setelah 15 menit tanpa aktivitas. Pemeriksaan izin dilakukan pada
  setiap request; epoch akun mencabut semua sesi dan undangan yang diterbitkannya.

## Mengundang dan pergantian angkatan

1. Owner login dan membuka **Akses pengurus**. Pilih username dan editor atau owner
   panel. Untuk menerbitkan dan mengelola pengurus berikutnya, gunakan owner panel.
2. Berikan kode undangan secara pribadi, bukan commit, issue publik, atau URL.
   Kode acak disimpan server sebagai hash, berlaku 24 jam, sekali pakai, dan dapat
   dicabut. Role/username ditentukan server; penerima membuat password sendiri.
3. Penerima membuka **Saya memiliki undangan pengurus** pada Console, dengan URL
   website sekolah yang benar. Owner baru juga mengaktifkan MFA sebelum akses konten.
4. Uji login owner angkatan baru, publikasi, dan akses akun. Simpan kode pemulihan
   secara pribadi. Sediakan owner cadangan yang bertanggung jawab (misalnya pembina).
5. Owner baru menonaktifkan akun lama. Server mencabut sesi/undangan secara langsung.
   Perubahan tahun ajaran saja tidak mencabut akun. Owner aktif terakhir tidak boleh
   dinonaktifkan; pengurus tidak boleh berbagi satu akun/password antarangkatan.

Domain/konfigurasi Cloudflare tidak tersedia pada API atau GUI. Jangan berikan
otorisasi Wrangler, token API Cloudflare, atau akses tulis D1 kepada pengurus panel.
Siapa pun yang memiliki hak tulis infrastruktur dapat mengubah database langsung;
MFA control panel tidak dapat membatasi pemilik hak tersebut.

## Bootstrap dan pemulihan: pemilik infrastruktur saja

Sesudah seluruh migrasi D1, gunakan Python pada laptop yang Wrangler-nya terotorisasi:

```powershell
python scripts/cms-owner.py bootstrap --database NAMA_DATABASE
python scripts/cms-owner.py recover --database NAMA_DATABASE
python scripts/cms-owner.py authorize-mfa --database NAMA_DATABASE
```

Tambahkan `--local` untuk database pengujian. Target database wajib disebut.
Password diketik melalui getpass, tidak lewat argumen. Bootstrap hanya membuat
owner pertama jika tabel akun kosong; tidak pernah mereset akun lama. Recovery
hanya owner yang sudah ada, meminta konfirmasi username, mengganti password,
mereset MFA, mencabut sesi/undangan, dan menulis audit. Gunakan akun Cloudflare
pribadi dengan MFA; otorisasi tersebut tidak masuk paket GUI.

Jika password owner pernah diberikan melalui chat atau saluran publik, lakukan
pemulihan dengan password baru secara pribadi sebelum menyerahkan aplikasi.
Aktivasi MFA pertama tidak dapat dilakukan memakai password saja. Kode aktivasi
hanya disimpan sebagai hash, terikat akun/epoch, berlaku 24 jam, dan dikonsumsi
ketika MFA aktif. `authorize-mfa` menerbitkan kode baru untuk owner yang belum
aktif MFA; kode lama otomatis tidak berlaku. Jangan menunda aktivasi owner.

## Fork dan rilis publik

Sekolah lain membuat deployment, database, key, dan owner sendiri. Gunakan
`wrangler.example.jsonc`, pilih URL sendiri melalui `--url`, dan jangan memakai
database/otorisasi produksi Dipo. Paket resmi ini tetap menunjuk domain sekolah;
fork harus mengganti default URL sebelum mendistribusikan aplikasinya.

Jangan memasukkan `.env`, `.dev.vars`, backup D1, ekspor draft/aspirasi, token,
kode undangan, verifier password, kode pemulihan, atau SQL akun ke repository/rilis.
`.gitignore` tidak membersihkan riwayat yang sudah telanjur berisi secret.
Pisahkan lisensi source dari izin distribusi foto/logo sekolah. Repositori tidak
otomatis diubah public oleh perubahan keamanan ini.

Audit akses tersedia untuk owner; ia memuat aktor, tindakan, target, dan waktu,
bukan password/kode/token. Saat melaporkan kerentanan, hubungi maintainer secara
privat dan jangan mempublikasikan data siswa atau kredensial. Sebelum rilis public,
tetap diperlukan pemeriksaan seluruh riwayat, izin aset, dan konfigurasi GitHub.

## Validasi dan batas

Pengujian mencakup API langsung, sesi palsu/nonaktif, pemisahan role, sesi owner
sebelum MFA, replay faktor/undangan, enkripsi, konflik draft, dan client native.
Pemindaian dependensi hanya mendeteksi kerentanan yang diketahui. Pengujian bukan
jaminan tidak ada celah; perangkat yang terinfeksi, phishing URL server, atau akun
Cloudflare yang diambil alih berada di luar perlindungan aplikasi.

Rujukan: [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html),
[OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).
