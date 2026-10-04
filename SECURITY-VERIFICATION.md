# Pemeriksaan keamanan control panel — 4 Oktober 2026

Ini catatan pengujian implementasi, bukan sertifikasi atau penetration test
independen. Source boleh dibaca/diubah publik; otorisasi tetap diperiksa server.

## Hasil

- TypeScript/Astro check tanpa error, warning, atau hint; build Pages berhasil.
- 36 tes TypeScript mencakup autentikasi, konten, aspirasi, replay, enkripsi,
  undangan kedaluwarsa/dicabut, role yang dimanipulasi, owner terakhir, dan
  pencabutan akses di sela pemrosesan sebelum commit konten.
- 14 tes Qt dan 3 tes bootstrap/recovery SQLite berhasil. Bootstrap kedua tidak
  mereset akun, recovery tidak mengangkat editor menjadi owner, dan pemulihan
  owner mencabut sesi/MFA/undangan.
- 42 pemeriksaan HTTP pada runtime Wrangler lokal berhasil: MFA/aktivasi, undangan,
  akun nonaktif, draft privat, konflik versi, upload, publikasi, dan password/sesi.
- Alur native GUI terhadap Wrangler lokal berhasil: owner terbatas, aktivasi,
  MFA/password baru, login memakai faktor pemulihan, undangan, penerimaan undangan,
  login editor, dan logout. Crash penutupan dialog undangan ditemukan saat QA dan
  diperbaiki dengan menunda penutupan sampai receiver asynchronous selesai.
- Frozen Windows EXE self-test berhasil untuk HTTP login, refresh, logout,
  kesalahan password, dan retry. Modul provisioning, konfigurasi Cloudflare,
  file SQL/database/environment tidak ditemukan pada paket yang dibangun.
- Smoke test terhadap Cloudflare menggunakan owner/editor sementara berhasil
  untuk aktivasi, AES/TOTP, password baru, undangan/replay, izin editor, akun nonaktif,
  dan sesi. Akun sementara dibersihkan; konten publik tidak ditulis oleh tes.
- npm audit (termasuk dependency pengembangan) nol advisori setelah memperbarui
  `http-cache-semantics`. OSV untuk enam paket runtime desktop yang terpasang
  memberikan nol advisori yang diketahui pada saat pemeriksaan.
- Pemindaian pola kredensial pada working files dan seluruh objek riwayat Git
  lokal memberikan nol temuan. Pemeriksaan ini terbatas pada pola yang disebut
  di `scripts/check-secrets.py`, bukan detektor secret menyeluruh.

## Operasional

Cloudflare/domain/configuration tetap dipegang pemilik infrastruktur. Pengurus
menerima paket GUI dan undangan; tidak menerima Wrangler/token Cloudflare.
Owner lama wajib menyelesaikan aktivasi MFA dengan kode privat dan password baru
sebelum memakai konten. Kode aktivasi disimpan di luar repository, berlaku 24 jam,
sekali pakai; backup encryption key juga berada di folder privat pemilik.

Jangan unggah folder kerja mentah sebagai source publik: gunakan file yang
terlacak Git, periksa ulang staging/history, dan jangan menyertakan `.env`,
`.dev.vars`, data lokal, backup, atau file aktivasi. Foto/logo sekolah dan placeholder
berita masih memerlukan pemeriksaan izin distribusi sebelum rilis open source.

## Batas

Tidak ada jaminan 100% tanpa celah. Pemeriksaan belum mencakup pentest independen,
perangkat terinfeksi, konfigurasi IAM/GitHub/Cloudflare di luar source, seluruh pola
secret, atau izin lisensi aset. Paket macOS/Linux belum dibangun/diuji di OS tersebut.
MFA TOTP tidak kebal phishing; masukkan kredensial hanya ke server sekolah yang
dipercaya. Pemilik akses tulis Cloudflare/D1 tetap dapat mengubah database langsung.

Repository tetap private. Perubahan ini tidak otomatis menyelesaikan persiapan
publikasi repository atau memberikan hak hosting kepada owner control panel.
