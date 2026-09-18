# Delora — Bloom & Gift : PRD

## Problem Statement (ringkasan)
Web app pembukuan UMKM bouquet & custom product sesuai dokumen kerja v3, stack React 18 + Vite + TS + Tailwind + Supabase (PostgreSQL + RLS multi-tenant), auth username/password via Edge Function `login-with-username` (email wajib terverifikasi), target deploy Vercel. Tema: sage green #8CAA9A, cream/gold #E8D9B8, teks #2E3B34, serif brand + sans UI. Mobile-first responsive. 9 aturan lintas-menu wajib dipertahankan.

## User Persona
- Pemilik usaha bouquet/gift (single tenant per akun), input transaksi harian dari HP & desktop.

## Arsitektur
- Frontend-only Vite + TS di /app/frontend (dev server port 3000 via supervisor `yarn start` → vite).
- Supabase: schema SQL di /app/supabase/schema.sql (11 tabel + RLS + trigger akun kas default + RPC username_available).
- Edge Function: /app/supabase/functions/login-with-username/index.ts (dideploy user via CLI).
- Util bisnis: src/lib/orderCalculations.ts (satu-satunya sumber rumus pesanan), src/lib/depreciation.ts (saldo menurun), src/lib/balances.ts (manajemen saldo manual + reverse), src/lib/orders.ts, src/lib/customers.ts.

## Yang Sudah Diimplementasikan (2026-09-17)
- Skema DB lengkap: accounts, products, customers, transactions, orders, order_request_items, order_inventory_items, assets, asset_depreciations, expense_accounts, profiles + RLS semua tabel + trigger handle_new_user (profile + 5 akun kas default).
- Auth: halaman Login/Daftar, RPC username_available, login via Edge Function (403 bila email belum verifikasi).
- Layout responsif: sidebar desktop gelap, top bar + bottom nav + drawer mobile, tap target ≥44px.
- 9 halaman: Dashboard (KPI, kas & saldo, grafik recharts, riwayat berwarna), Inventory (stok min ⚠️, sort, komponen custom), Biaya (akun biaya, ringkasan, reverse saldo saat edit/hapus), Penjualan (4 tab: Produk/Custom/Bouquet/TopUp + riwayat + edit reverse), Pembelian (3 tab: Bahan Baku +stok / Custom Request tanpa stok / Aset Tetap is_asset), Pesanan (5 tab, batch pending orders, groupId expand/collapse, Quick View WA+PDF, Completion Modal posting+potong stok, hapus item/group, bulk delete by status, popover pecahan uang), Customer, Aset Tetap (3 trigger penyusutan, preview tahunan, riwayat), Kas & Bank (transfer amount 0 + modal masuk).
- Terverifikasi: build Vite sukses, halaman login render desktop+mobile tanpa overflow.

## Status Integrasi (2026-09-18)
- VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY SUDAH diisi (project arjbgfddplivkhzootzr) — warning config hilang, login page OK desktop+mobile.
- Skema DB SUDAH jalan di Supabase user (semua 11 tabel + RPC username_available terverifikasi via REST 200).
- Akun owner didaftarkan: username `delora` / delora.idn03@gmail.com — email verifikasi terkirim (confirmation_sent_at 2026-09-18).
- Edge Function `login-with-username` BELUM di-deploy (404) — menunggu user menjalankan `supabase functions deploy login-with-username`.
- Login E2E terblokir sampai: (1) email diverifikasi user, (2) edge function ter-deploy.

## Backlog (P0/P1/P2)
- P0: User verifikasi email + deploy edge function → testing agent E2E (login→semua menu→9 aturan lintas-menu).
- P1: Menu pendukung bagian 9 — Laporan Laba Rugi & Inventory (PDF/Excel), BRILink, Kalkulator Harga, Catatan (financial_notes).
- P2: Code splitting bundle (869 kB), filter periode custom range di Dashboard, edit pembelian (saat ini hanya hapus), integrasi bot Telegram (di luar scope web).

## Next Tasks
1. Tunggu user: klik link verifikasi di inbox + deploy edge function.
2. Panggil testing agent untuk seluruh alur 8 menu + 9 aturan lintas-menu.
