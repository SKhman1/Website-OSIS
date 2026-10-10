# Menghubungkan aspirasi website ke Google Forms

Form tujuan: https://forms.gle/oX6GDK8YqjM5HfzW7

Pertanyaan yang sudah diperiksa dari tautan responden pada 3 Oktober 2026:

| Judul persis | Jenis | Wajib |
| --- | --- | --- |
| Kategori aspirasi | Kotak centang | Ya |
| Judul aspirasi | Jawaban singkat | Tidak |
| Sampaikan aspirasi | Paragraf | Ya |

Kategori: Kegiatan sekolah, Fasilitas, OSIS, serta opsi bawaan **Yang lain**
yang menerima keterangan. Website mengikuti pilihan beberapa kategori ini.

## 1. Pasang script di akun pemilik form

1. Buka **editor** Google Form dengan akun pemilik, lalu buka menu **Apps Script**.
2. Ganti isi `Code.gs` dengan file `Code.gs` di folder ini. Simpan.
3. Jalankan fungsi `configureIntegration` sekali di editor. Berikan izin akses
   Forms yang diperlukan. Fungsi ini memeriksa jenis pertanyaan, menyimpan ID,
   dan membuat secret. Tidak mengubah pertanyaan atau mengirim respons contoh.
4. Buka **Project Settings → Script Properties**. Pastikan ada `FORM_ID`,
   tiga `*_ITEM_ID`, `SHARED_SECRET`, dan `INTEGRATION_ENABLED`.
5. Setelah memeriksa pengaturan privasi form, ubah `INTEGRATION_ENABLED`
   menjadi `true`. Jangan mengirim `SHARED_SECRET` melalui chat/GitHub.
6. Pilih **Deploy → New deployment → Web app**. Jalankan sebagai pemilik
   (**Execute as: Me**), akses **Anyone**. Endpoint perlu bisa dipanggil server
   Cloudflare tanpa login browser; setiap POST tetap membutuhkan tanda tangan
   HMAC yang hanya bisa dibuat server. Jika akun sekolah melarang web app
   publik, konsultasikan ke admin sekolah; jangan mencoba melewati kebijakan.
7. Salin URL deployment berakhiran `/exec`. URL `/dev` hanya untuk pengujian
   editor dan tidak digunakan website. Kirim **URL `/exec` saja** ke pengembang.

Jika mengubah kode script, edit deployment dan pilih versi baru. Menjalankan
`configureIntegration` ulang akan menutup integrasi; aktifkan lagi setelah siap.

## 2. Periksa Google Forms

- Publikasikan form dan aktifkan penerimaan respons.
- Matikan pengumpulan email dan batas satu respons untuk alur tanpa login.
  Pengiriman script berjalan sebagai pemilik, bukan sesi Google siswa;
  jangan mengklaim email pengirim sudah terverifikasi lewat form native.
- Matikan **Lihat ringkasan hasil** dan izin mengedit respons jika tidak diperlukan.
- Bagikan akses editor/hasil hanya kepada pengurus/pembina yang berwenang.
- Opsional: tab **Respons → Tautkan ke Spreadsheet** untuk melihat di Sheets.
- Pertahankan judul, jenis, dan pilihan pertanyaan. Jika mengubah struktur,
  jalankan ulang konfigurasi dan uji pemetaan sebelum membuka pengiriman.

## 3. Konfigurasi Cloudflare

Buat widget **Turnstile** untuk `vnd-smkdipo1.pages.dev` (tambahkan hostname
lain jika website pindah). Action website adalah `aspirasi`.

Simpan nilai runtime berikut di **Pages → vnd-smkdipo1 → Settings → Variables
and Secrets**. Secret disimpan sebagai secret, bukan variabel publik:

| Nama | Nilai |
| --- | --- |
| `GOOGLE_FORMS_SCRIPT_URL` | URL Apps Script `/exec` |
| `GOOGLE_FORMS_SHARED_SECRET` | Nilai `SHARED_SECRET` dari Script Properties; secret |
| `TURNSTILE_SECRET_KEY` | Secret key widget; secret |
| `ASPIRATIONS_ENABLED` | `true` setelah pengujian berhasil |

Untuk **build**, set `PUBLIC_TURNSTILE_SITE_KEY` ke site key widget (boleh
publik) dan `PUBLIC_ASPIRATIONS_ENABLED=true`. Saat Direct Upload memakai build
lokal, kedua nilai `PUBLIC_*` harus tersedia pada mesin yang menjalankan
`npm run deploy:pages`; mengubah environment build di dashboard saja tidak
mengubah HTML yang sudah dibangun lokal. Jangan memakai awalan `PUBLIC_` untuk
URL script, shared secret, atau Turnstile secret key.

Untuk lokal, gunakan `.env` dan pastikan variabel server tersedia ke proses
Node (contoh `node --env-file=.env dist/server/entry.mjs`). Pages preview memakai
`.dev.vars` untuk runtime dan `.env` untuk build. File tersebut diabaikan Git.

## 4. Uji sebelum menerima aspirasi siswa

1. Biarkan kedua flag pengiriman mati sampai script, secret, dan Turnstile siap.
2. Setelah konfigurasi lengkap, kirim satu respons yang jelas berlabel **UJI
   INTEGRASI — bukan aspirasi siswa**. Periksa Google Forms menerima tepat satu
   jawaban dan pemetaan kategori, judul opsional, serta isi sudah benar.
3. Coba beberapa kategori dan kategori **Yang lain**. Periksa data di Forms.
4. Coba judul kosong. Periksa respons tetap masuk.
5. Tutup penerimaan respons Google Forms dan pastikan website tidak menampilkan
   pesan sukses. Buka lagi setelah uji. Hapus respons uji melalui akun pemilik.
6. Pastikan GET `/api/aspirasi` tetap 405 dan tidak ada endpoint pembaca jawaban.

## Perilaku dan batasan

- Backend memvalidasi ukuran/isi, Origin, honeypot, serta token Turnstile di
  server beserta hostname/action. Google hanya dipanggil setelah validasi lolos.
- Website tidak membaca jawaban; script HTTP juga tidak memiliki operasi baca.
  Google Forms sendiri menyediakan pembacaan kepada akun pemilik/pengurus.
- Isian tidak dihapus ketika gagal; sukses hanya ditampilkan setelah Google
  mengonfirmasi. Browser menyimpan isian dalam memori halaman, bukan database
  atau localStorage; menutup/memuat ulang halaman dapat menghilangkannya.
- ID kiriman yang sama dengan isi yang sama diingat di Script Properties
  selama **24 jam**. Tidak ada janji tepat satu kiriman lintas layanan secara
  transaksional. Marker `pending` mencegah pengiriman ulang otomatis saat hasil
  ambigu; pemilik perlu memeriksa Forms sebelum menangani marker yang macet.
  Jangan menghapus marker pending tanpa memastikan kiriman belum tersimpan.
- Ada batas 100 upaya simpan baru per hari WIB melalui script ini untuk
  melindungi kuota pada volume kecil. Turnstile bukan jaminan bebas spam.
- Tautan Google Form responden tetap bisa diisi langsung sesuai izin Google.
- Respons yang dikirim programmatically tidak menjalankan trigger `onFormSubmit`
  seperti kiriman manual. Jangan mengandalkan trigger/notifikasi bawaan sebelum
  menguji perilakunya. Tidak ada bot atau laporan bulanan otomatis pada fase ini.
- Nama/kelas/email tidak diminta; platform tetap dapat memproses metadata
  jaringan. Kesepakatan pengurus tentang akses dan masa simpan tetap diperlukan.

Rujukan: [Apps Script web apps](https://developers.google.com/apps-script/guides/web),
[FormResponse.submit](https://developers.google.com/apps-script/reference/forms/form-response#submit()),
[CheckboxItem.createResponse](https://developers.google.com/apps-script/reference/forms/checkbox-item#createResponse(String)),
[Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
