# Delora — Panduan Setup Supabase & Deploy

## 1. Skema Database

Jalankan isi file `schema.sql` di **Supabase Dashboard → SQL Editor → New query → Run**.
Ini membuat semua tabel, RLS policy (multi-tenant `auth.uid() = user_id`), trigger akun kas
default, dan fungsi `username_available`.

## 2. Aktifkan Verifikasi Email (wajib)

Supabase Dashboard → **Authentication → Sign In / Providers** → Email → pastikan
**Confirm email** aktif. Login akan ditolak (403) bila email belum terverifikasi.

## 3. Deploy Edge Function `login-with-username`

```bash
# instal CLI (sekali)
npm install -g supabase          # atau: brew install supabase/tap/supabase

supabase login
supabase link --project-ref <PROJECT_REF_ANDA>
supabase functions deploy login-with-username
```

Fungsi membaca `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
yang otomatis tersedia di environment Edge Function — tidak perlu set manual.

## 4. Environment Variables Frontend

Isi di `frontend/.env` (lokal) dan **Vercel → Project → Settings → Environment Variables** (production):

```
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

Ambil dari Supabase Dashboard → **Project Settings → API**. Jangan pernah menaruh
`service_role` key di frontend — key itu hanya dipakai di Edge Function (server-side).

## 5. Deploy Frontend ke Vercel

```bash
cd frontend
vercel          # atau hubungkan repo di dashboard Vercel
```

Build command: `vite build` • Output directory: `dist` • Root directory: `frontend`.

Setelah deploy, tambahkan domain Vercel Anda ke
Supabase → **Authentication → URL Configuration → Redirect URLs**.
