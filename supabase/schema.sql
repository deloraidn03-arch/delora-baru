-- =============================================================
-- DELORA — Bloom & Gift : Skema Database Lengkap (v3)
-- Jalankan di Supabase SQL Editor (atau: supabase db push)
-- Multi-tenant: setiap baris punya user_id, RLS: auth.uid() = user_id
-- =============================================================

-- ---------- PROFILES (registry username → email untuk login) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Cek ketersediaan username saat registrasi (dipanggil sebelum signUp)
create or replace function public.username_available(p_username text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  return not exists (select 1 from public.profiles where lower(username) = lower(p_username));
end $$;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------- ACCOUNTS (akun kas) ----------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,                 -- cash | atm | tabungan | brilink_cash | brilink_bank
  balance numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.accounts enable row level security;
create policy "accounts_all_own" on public.accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- PRODUCTS (inventory) ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'single' check (type in ('single', 'custom')),
  hpp numeric not null default 0,
  selling_price numeric not null default 0,
  stock numeric not null default 0,
  min_stock numeric not null default 0,
  deskripsi text,
  items jsonb,                        -- komponen produk custom: [{productId, productName, quantity}]
  created_at timestamptz not null default now()
);
create index if not exists products_user_idx on public.products (user_id);

alter table public.products enable row level security;
create policy "products_all_own" on public.products for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- CUSTOMERS ----------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  whatsapp_number text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists customers_user_idx on public.customers (user_id);

alter table public.customers enable row level security;
create policy "customers_all_own" on public.customers for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- TRANSACTIONS (jurnal keuangan utama) ----------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in (
    'sale_product','sale_custom','sale_topup',
    'purchase_material','purchase_custom',
    'expense','brilink','brilink_capital','transfer','investment'
  )),
  amount numeric not null default 0,   -- transfer selalu 0
  date timestamptz not null default now(),
  customer_name text,                  -- top-level (bot Telegram); fallback metadata.customerName
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);
create index if not exists transactions_user_type_idx on public.transactions (user_id, type);

alter table public.transactions enable row level security;
create policy "transactions_all_own" on public.transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- ORDERS (pesanan) ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('money_bouquet','bouquet_custom','flower_bouquet','custom_product')),
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  order_date timestamptz not null default now(),
  delivery_date date not null,
  notes text,
  status text not null default 'Belum' check (status in ('Belum','Setengah','Selesai')),
  total_price numeric not null default 0,
  jumlah_dp numeric not null default 0,
  sisa_pembayaran numeric not null default 0,
  penjualan_id uuid references public.transactions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,   -- discount, ongkir, groupId, paymentStatus, serviceFee, moneyItems, customRequests, bouquetType, productType, inventoryProductId
  created_at timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders (user_id);
create index if not exists orders_group_idx on public.orders ((metadata->>'groupId'));

alter table public.orders enable row level security;
create policy "orders_all_own" on public.orders for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- ORDER REQUEST ITEMS ----------
create table if not exists public.order_request_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  item_name text not null,
  qty numeric not null default 1,
  harga_invoice numeric not null default 0,      -- harga ke customer
  harga_asli numeric not null default 0,         -- modal / biaya beli
  created_at timestamptz not null default now()
);
create index if not exists order_request_items_order_idx on public.order_request_items (order_id);

alter table public.order_request_items enable row level security;
create policy "order_request_items_all_own" on public.order_request_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- ORDER INVENTORY ITEMS (pemakaian bahan untuk potong stok) ----------
create table if not exists public.order_inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists order_inventory_items_order_idx on public.order_inventory_items (order_id);

alter table public.order_inventory_items enable row level security;
create policy "order_inventory_items_all_own" on public.order_inventory_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- ASSETS (aset tetap) ----------
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'Lainnya',
  purchase_price numeric not null default 0,
  purchase_date date not null,
  residual_value numeric not null default 0,
  depreciation_rate numeric not null default 0,  -- % per tahun (saldo menurun)
  useful_life_months integer not null default 0, -- derived: round(100/rate*12)
  current_value numeric not null default 0,
  status text not null default 'aktif' check (status in ('aktif','habis')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists assets_user_idx on public.assets (user_id);

alter table public.assets enable row level security;
create policy "assets_all_own" on public.assets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- ASSET DEPRECIATIONS (riwayat penyusutan per periode) ----------
create table if not exists public.asset_depreciations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  period_month integer not null check (period_month between 1 and 12),
  period_year integer not null,
  depreciation_amount numeric not null default 0,
  book_value_before numeric not null default 0,
  book_value_after numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (asset_id, period_month, period_year)
);
create index if not exists asset_depreciations_asset_idx on public.asset_depreciations (asset_id);
create index if not exists asset_depreciations_period_idx on public.asset_depreciations (user_id, period_year, period_month);

alter table public.asset_depreciations enable row level security;
create policy "asset_depreciations_all_own" on public.asset_depreciations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- EXPENSE ACCOUNTS (kategori biaya) ----------
create table if not exists public.expense_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.expense_accounts enable row level security;
create policy "expense_accounts_all_own" on public.expense_accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================================
-- TRIGGER: user baru → profile + 5 akun kas default
-- (cash, atm, tabungan, brilink_cash, brilink_bank)
-- =============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;

  insert into public.accounts (user_id, name) values
    (new.id, 'cash'),
    (new.id, 'atm'),
    (new.id, 'tabungan'),
    (new.id, 'brilink_cash'),
    (new.id, 'brilink_bank')
  on conflict (user_id, name) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
