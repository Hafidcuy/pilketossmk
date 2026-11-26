# Pilketos SMK Krian 1 — Vercel + Supabase

Web voting Pilketos dengan **backend serverless di Vercel** dan **database Supabase**. Berbeda dari versi statis sebelumnya, semua data dan keamanan (captcha, identitas pemilih, PIN admin, izin leaderboard) **diverifikasi di server**, bukan di browser.

## Arsitektur

```
public/            → frontend statis (HTML/CSS/JS)
api/               → Vercel serverless functions (Node.js)
  state.js         → data publik + hasil yang sudah diterbitkan
  captcha.js       → captcha SVG yang ditandatangani server
  vote.js          → kirim suara (verifikasi captcha + anti duplikat)
  admin/login.js   → login PIN + captcha + rate limit
  admin/*.js       → kelola paslon, pengaturan, publish, reset, ekspor
lib/               → helper Supabase, crypto, session, captcha
supabase/schema.sql→ skema tabel & RLS
```

## Keamanan yang diterapkan (server-side)

- **CAPTCHA diverifikasi server**: token bertanda tangan HMAC, kedaluwarsa 5 menit, dan **hanya bisa dipakai sekali** (dicatat di tabel `captcha_used`).
- **Anti duplikat lintas perangkat**: `voter_key` = hash dari nama+kelas+jurusan dengan pepper server, `UNIQUE` di database.
- **Login admin**: PIN di-hash dengan `scrypt` + salt unik; `timingSafeEqual`; rate-limit 5 gagal / 10 menit per IP; sesi httpOnly + Secure + SameSite=Lax berlaku 15 menit.
- **CSRF**: header `X-Requested-With` + pengecekan Origin pada semua endpoint admin.
- **Sanitasi & batas input** di server; semua output di-escape di frontend.
- **Upload foto**: hanya `data:image/png|jpeg|webp`, **tanpa batas ukuran**.
- **RLS aktif** di semua tabel Supabase; frontend tidak pernah memakai service role key.
- **Header keamanan** dari Vercel: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy.

> Catatan: untuk keamanan maksimal, sebaiknya tetap memakai domain/HTTPS resmi sekolah dan membatasi akses panel admin hanya ke panitia.

## Menyiapkan Supabase

1. Buat project di https://supabase.com/dashboard.
2. Buka **SQL Editor → New query**, tempel seluruh isi `supabase/schema.sql`, jalankan.
3. Buka **Project Settings → API**, salin:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**rahasia, jangan pernah taruh di frontend**)
   - `anon` key → `SUPABASE_ANON_KEY` (opsional)

## Environment Variables di Vercel

| Nama | Nilai |
|---|---|
| `SUPABASE_URL` | URL project Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `SESSION_SECRET` | String acak minimal 32 karakter |
| `ADMIN_INITIAL_PIN` | PIN pertama kali yang kamu tentukan sendiri (rahasia), ubah lewat panel |

## Deploy

```bash
npm install
npx vercel link
npx vercel env add SUPABASE_URL
npx vercel env add SUPABASE_SERVICE_ROLE_KEY
npx vercel env add SESSION_SECRET
npx vercel env add ADMIN_INITIAL_PIN
npx vercel --prod
```

Atau import repository ini ke Vercel Dashboard dan isi Environment Variables di Project Settings.

## Alur penggunaan

1. Buka menu **Admin**, login dengan PIN awal + captcha.
2. Ubah paslon, judul/periode, dan **PIN baru**.
3. Aktifkan **Leaderboard dapat dilihat publik** jika hasil boleh dilihat siswa.
4. Setelah voting, tekan **Terbitkan / Perbarui Hasil**.
5. Siswa mengisi nama lengkap, kelas, jurusan + captcha, memilih paslon, mengonfirmasi.
6. Hasil publik menampilkan snapshot terakhir yang diterbitkan admin.

## Lokal development

```bash
npm install
cp .env.example .env.local   # isi nilainya
npx vercel dev
```

Buka `http://localhost:3000`.
