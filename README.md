# OSIS SMK Diponegoro 01

Website publik dan VND Console untuk pengelolaan konten.

## Folder

- `web/`: Astro, Pages Functions/API, database migrations, aset dan integrasi Google Forms.
- `console/`: aplikasi desktop Qt, build, tools khusus pemilik Cloudflare dan tests.
- `VND-Console.exe` + `_internal/`: paket Windows lokal; tidak masuk Git.

## Website

Jalankan dari folder `web`:

```powershell
cd web
npm ci
npm run dev
```

`npm run check` memeriksa source. `npm test` menguji API dan validasi.
`npm run build:pages` membuat website; `npm run preview:pages` menjalankan Pages lokal.
`npm run deploy:pages` menerbitkan ke Cloudflare setelah login Wrangler.
Konfigurasi dan secret lokal berada di `web/.env` serta `web/.dev.vars`, diabaikan Git.

Deployment baru memakai `web/wrangler.example.jsonc`, database dan secrets sendiri.
Dari `web/`, terapkan migrasi:
`npx wrangler d1 migrations apply NAMA_DATABASE --remote`.
Lalu build, jalankan `npx tsx scripts/seed-cms.ts`, dan masukkan seed dengan
`npx wrangler d1 execute NAMA_DATABASE --remote --file data/cms-seed.sql`.
Seed tidak menimpa konten yang sudah ada.

Google Forms: [petunjuk integrasi](web/integrations/google-forms/SETUP.md).
Konten awal/static fallback ada di `web/src/content/`; perubahan live memakai Console.

## Console

Buka `VND-Console.exe` atau `./start-admin.ps1` dari folder utama.
EXE selalu memerlukan `_internal/` di sampingnya. Akun pengurus berasal dari undangan owner.
Editor menyimpan draft; owner menerbitkan konten dan mengelola akses.
Foto, identitas angkatan, favicon, statistik, visi/misi, anggota, program dan rundown dapat diedit.

Import Excel tersedia di Kegiatan & rundown. Periksa hasil sebelum menyimpan.
Preset dan pemetaan kolom mendukung format berbeda; bantuan Groq opsional.
Hanya grid pilihan dikirim untuk inferensi, bukan seluruh file.

Untuk pengembangan Console:

```powershell
cd console
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-build.txt
.\.venv\Scripts\python.exe main.py
.\build.ps1
```

Linux/macOS memakai `.venv/bin/python` dan `./build.sh`; paket dibangun di OS tujuannya.
Build tetap menghasilkan executable di folder utama proyek.

## Setup owner pertama

Pemilik Cloudflare login Wrangler dari `web/`. Kembali ke folder utama:

```powershell
.\setup-owner.ps1 -Database vnd-smkdipo1-content -Username skhmandev
```

Default `bootstrap` hanya bekerja saat database akun kosong. Buat password minimal
15 karakter, lalu scan QR lokal dengan Google Authenticator. Konfirmasikan kode
6 digit dan password baru yang berbeda; simpan kode pemulihan secara pribadi.
Tidak ada password, kode aktivasi atau MFA bawaan.

Untuk akun yang sudah ada tetapi MFA belum aktif, tambahkan `-Mode authorize-mfa`.
Fork wajib memakai `-Url https://DOMAIN-SENDIRI`.
Pemulihan owner merupakan operasi terpisah; lihat [keamanan](SECURITY.md).

## Pemeriksaan

Dari `web/`: `npm run check`, `npm test`, `npm run build:pages`,
`npm run test:cms-dom`, `npm run test:agenda-dom`.

Setelah build website, dari folder utama:
`./console/.venv/Scripts/python.exe -m unittest discover -s console/tests`.
Paket Windows menyediakan `VND-Console.exe --self-test`, tanpa kredensial produksi.
Pemeriksaan dependency: `console/tools/audit-desktop-deps.py`.
Pemindaian pola secret dan riwayat Git: `console/tools/check-secrets.py` dari folder utama.
