import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp, TrendingDown, Wallet, Landmark } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Account, ACCOUNT_LABELS, Transaction } from '../lib/types';
import { formatIDR, formatDate } from '../lib/format';

type PeriodPreset = 'hari_ini' | 'minggu_ini' | 'bulan_ini' | 'tahun_ini' | 'semua';

const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'hari_ini', label: 'Hari Ini' },
  { id: 'minggu_ini', label: 'Minggu Ini' },
  { id: 'bulan_ini', label: 'Bulan Ini' },
  { id: 'tahun_ini', label: 'Tahun Ini' },
  { id: 'semua', label: 'Semua' },
];

// Rentang [start, end) — end eksklusif (besok 00:00 waktu lokal)
const getRange = (preset: PeriodPreset): { start: Date | null; end: Date | null } => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  switch (preset) {
    case 'hari_ini':
      return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end };
    case 'minggu_ini': {
      const day = (now.getDay() + 6) % 7; // Senin = awal minggu
      return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - day), end };
    }
    case 'bulan_ini':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
    case 'tahun_ini':
      return { start: new Date(now.getFullYear(), 0, 1), end };
    case 'semua':
      return { start: null, end: null };
  }
};

const INCOME_TYPES = ['sale_product', 'sale_custom', 'sale_topup', 'investment'];
const OUTFLOW_TYPES = ['purchase_material', 'purchase_custom', 'expense'];

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [preset, setPreset] = useState<PeriodPreset>('hari_ini');
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [depRows, setDepRows] = useState<any[]>([]);
  const [assetValue, setAssetValue] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { start, end } = getRange(preset);
    let txQuery = supabase.from('transactions').select('*').eq('user_id', user.id);
    if (start) txQuery = txQuery.gte('date', start.toISOString());
    if (end) txQuery = txQuery.lt('date', end.toISOString());
    const [txRes, recentRes, accRes, depRes, assetRes] = await Promise.all([
      txQuery,
      supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(10),
      supabase.from('accounts').select('*').eq('user_id', user.id),
      supabase.from('asset_depreciations').select('*').eq('user_id', user.id),
      supabase.from('assets').select('current_value').eq('user_id', user.id).eq('status', 'aktif'),
    ]);
    setTxs((txRes.data as Transaction[]) || []);
    setRecent((recentRes.data as Transaction[]) || []);
    setAccounts((accRes.data as Account[]) || []);
    setDepRows(depRes.data || []);
    setAssetValue((assetRes.data || []).reduce((s: number, a: any) => s + (Number(a.current_value) || 0), 0));
    setLoading(false);
  }, [user, preset]);

  useEffect(() => {
    load();
  }, [load]);

  // Penyusutan yang masuk rentang periode terpilih
  const depInRange = useMemo(() => {
    const { start, end } = getRange(preset);
    return depRows
      .filter((r) => {
        if (!start || !end) return true;
        const d = new Date(r.period_year, r.period_month - 1, 1);
        return d >= new Date(start.getFullYear(), start.getMonth(), 1) && d < end;
      })
      .reduce((s, r) => s + (Number(r.depreciation_amount) || 0), 0);
  }, [depRows, preset]);

  // Kartu "Penyusutan Bulan Ini" selalu bulan berjalan (tidak ikut filter)
  const depThisMonth = useMemo(() => {
    const now = new Date();
    return depRows
      .filter((r) => r.period_month === now.getMonth() + 1 && r.period_year === now.getFullYear())
      .reduce((s, r) => s + (Number(r.depreciation_amount) || 0), 0);
  }, [depRows]);

  const kpis = useMemo(() => {
    // Total Penjualan
    const sales = txs
      .filter((t) => ['sale_product', 'sale_custom', 'sale_topup'].includes(t.type))
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
    // Biaya Produksi — WAJIB kecualikan is_asset
    const prodCost = txs
      .filter(
        (t) =>
          ['purchase_material', 'purchase_custom'].includes(t.type) &&
          t.metadata?.is_asset !== true &&
          t.metadata?.is_asset !== 'true'
      )
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
    const opex = txs
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
    const dep = depInRange;
    return { sales, prodCost, opex, dep, net: sales - prodCost - dep - opex };
  }, [txs, depInRange]);

  const totalKas = accounts
    .filter((a) => ['cash', 'atm', 'tabungan'].includes(a.name))
    .reduce((s, a) => s + (Number(a.balance) || 0), 0);

  const chartData = useMemo(() => {
    const isSale = (t: Transaction) => ['sale_product', 'sale_custom', 'sale_topup'].includes(t.type);
    const isCost = (t: Transaction) =>
      ((['purchase_material', 'purchase_custom'].includes(t.type) &&
        t.metadata?.is_asset !== true &&
        t.metadata?.is_asset !== 'true') ||
        t.type === 'expense');
    const { start, end } = getRange(preset);
    const rangeDays = start && end ? Math.ceil((end.getTime() - start.getTime()) / 86400000) : Infinity;
    const rows: { day: string; penjualan: number; biaya: number }[] = [];
    if (start && end && rangeDays <= 62) {
      // Granularitas harian untuk rentang pendek
      const cursor = new Date(start);
      while (cursor < end) {
        const dayTxs = txs.filter((t) => {
          const td = new Date(t.date);
          return (
            td.getFullYear() === cursor.getFullYear() &&
            td.getMonth() === cursor.getMonth() &&
            td.getDate() === cursor.getDate()
          );
        });
        rows.push({
          day: cursor.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
          penjualan: dayTxs.filter(isSale).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0),
          biaya: dayTxs.filter(isCost).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0),
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      return rows;
    }
    // Granularitas bulanan untuk Tahun Ini / Semua
    const map = new Map<string, { day: string; penjualan: number; biaya: number }>();
    for (const t of txs) {
      const td = new Date(t.date);
      const key = `${td.getFullYear()}-${String(td.getMonth()).padStart(2, '0')}`;
      if (!map.has(key)) {
        map.set(key, {
          day: td.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
          penjualan: 0,
          biaya: 0,
        });
      }
      const row = map.get(key)!;
      if (isSale(t)) row.penjualan += Math.abs(Number(t.amount) || 0);
      if (isCost(t)) row.biaya += Math.abs(Number(t.amount) || 0);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, v]) => v);
  }, [txs, preset]);

  const txLabel = (t: Transaction): string => {
    const mta = t.metadata || {};
    const cust = mta.customerName || t.customer_name || '';
    switch (t.type) {
      case 'sale_product':
        return `Penjualan ${mta.productName || 'produk'}${cust ? ' — ' + cust : ''}`;
      case 'sale_custom':
        return `Penjualan custom${cust ? ' — ' + cust : ''}`;
      case 'sale_topup':
        return `Top Up / Pulsa${cust ? ' — ' + cust : ''}`;
      case 'purchase_material':
        return mta.is_asset === true || mta.is_asset === 'true'
          ? `Pembelian aset ${mta.productName || ''}`
          : `Pembelian bahan ${mta.productName || ''}`;
      case 'purchase_custom':
        return `Pembelian custom ${mta.productName || ''}`;
      case 'expense':
        return `Biaya ${mta.expenseAccount || ''}`;
      case 'transfer':
        return `Transfer ${ACCOUNT_LABELS[mta.fromAccount] || mta.fromAccount} → ${ACCOUNT_LABELS[mta.toAccount] || mta.toAccount}`;
      case 'investment':
        return 'Modal masuk';
      default:
        return t.type;
    }
  };

  const txColor = (t: Transaction): string => {
    if (INCOME_TYPES.includes(t.type)) return 'text-[#2e7d32]';
    if (OUTFLOW_TYPES.includes(t.type)) return 'text-[#c62828]';
    return 'text-[#5c6f64]';
  };

  const txAmountDisplay = (t: Transaction): string => {
    if (t.type === 'transfer') return formatIDR(t.metadata?.transferAmount || 0);
    const amt = Math.abs(Number(t.amount) || 0);
    if (INCOME_TYPES.includes(t.type)) return '+ ' + formatIDR(amt);
    if (OUTFLOW_TYPES.includes(t.type)) return '− ' + formatIDR(amt);
    return formatIDR(amt);
  };

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-brand text-3xl font-bold tracking-tight text-[#2e3b34] sm:text-4xl">Dashboard</h1>
          <p className="text-sm text-[#5c6f64]">Ringkasan keuangan &amp; metrik bisnis</p>
        </div>
        <div className="w-full sm:w-auto">
          <label className="label-base">Periode</label>
          <div className="flex gap-1.5 overflow-x-auto rounded-2xl bg-[#F2F7F4] p-1.5" data-testid="dashboard-period-filter">
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={`min-h-[40px] whitespace-nowrap rounded-xl px-3.5 text-xs font-semibold transition-all duration-200 sm:text-sm ${
                  preset === p.id ? 'bg-white text-[#2E3B34] shadow-sm' : 'text-[#5C6E64] hover:text-[#2E3B34]'
                }`}
                data-testid={`period-${p.id.replace(/_/g, '-')}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
        <div
          className="card group relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-4px_rgba(46,59,52,0.09)]"
          data-testid="kpi-total-penjualan"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#8CAA9A] to-[#E8D9B8]" />
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F2F7F4] text-[#6F8F7F]">
              <TrendingUp size={18} />
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-[#85978C]">Total Penjualan</div>
          </div>
          <div className="num mt-3 text-2xl font-bold tracking-tight text-[#2E3B34]">{formatIDR(kpis.sales)}</div>
        </div>
        <div
          className="card group relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-4px_rgba(46,59,52,0.09)]"
          data-testid="kpi-biaya-produksi"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#E8D9B8] to-[#F3E9D2]" />
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FAF6ED] text-[#C9A227]">
              <TrendingDown size={18} />
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-[#85978C]">Biaya Produksi</div>
          </div>
          <div className="num mt-3 text-2xl font-bold tracking-tight text-[#2E3B34]">{formatIDR(kpis.prodCost)}</div>
          <div className="mt-1 text-[11px] text-[#A6B4AA]">Tidak termasuk pembelian aset</div>
        </div>
        <div
          className="card group relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-4px_rgba(46,59,52,0.09)]"
          data-testid="kpi-biaya-operasional"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#A9C3B4] to-[#8CAA9A]" />
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F2F7F4] text-[#8CAA9A]">
              <Wallet size={18} />
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-[#85978C]">Biaya Operasional</div>
          </div>
          <div className="num mt-3 text-2xl font-bold tracking-tight text-[#2E3B34]">{formatIDR(kpis.opex)}</div>
        </div>
        <div
          className="card relative overflow-hidden border-0 bg-gradient-to-br from-[#8CAA9A] to-[#6F8F7F] p-5 text-white shadow-[0_12px_32px_-4px_rgba(111,143,127,0.4)]"
          data-testid="kpi-laba-bersih"
        >
          <div className="text-[11px] font-semibold uppercase tracking-widest text-white/75">Laba Bersih</div>
          <div className="num mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{formatIDR(kpis.net)}</div>
          <div className="mt-1 text-[11px] text-white/70">
            Penjualan − Produksi − Penyusutan ({formatIDR(kpis.dep)}) − Operasional
          </div>
        </div>
      </div>

      {/* Kas & Saldo */}
      <div className="card p-5" data-testid="panel-kas-saldo">
        <h2 className="font-brand text-xl font-semibold text-[#2e3b34]">Kas &amp; Saldo</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {['cash', 'atm', 'tabungan', 'brilink_cash', 'brilink_bank'].map((name) => {
            const acc = accounts.find((a) => a.name === name);
            return (
              <div
                key={name}
                className="rounded-xl border border-[#E8D9B8]/70 bg-[#FAF6ED]/50 p-3.5 transition-all duration-200 hover:border-[#E8D9B8] hover:shadow-sm"
                data-testid={`saldo-${name}`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-widest text-[#85978C]">{ACCOUNT_LABELS[name]}</div>
                <div className="num mt-1 text-sm font-bold text-[#2E3B34]">{formatIDR(acc?.balance || 0)}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[#F2F7F4] p-4" data-testid="total-kas-card">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">Total Kas (Cash+ATM+Tabungan)</div>
            <div className="num mt-1 text-xl font-bold text-[#2E3B34]">{formatIDR(totalKas)}</div>
          </div>
          <div className="rounded-xl bg-[#F2F7F4] p-4" data-testid="nilai-aset-card">
            <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">
              <Landmark size={13} /> Nilai Aset Tetap
            </div>
            <div className="num mt-1 text-xl font-bold text-[#2E3B34]">{formatIDR(assetValue)}</div>
          </div>
          <div className="rounded-xl bg-[#F2F7F4] p-4" data-testid="penyusutan-bulan-ini-card">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">Penyusutan Bulan Ini</div>
            <div className="num mt-1 text-xl font-bold text-[#2E3B34]">{formatIDR(depThisMonth)}</div>
          </div>
        </div>
      </div>

      {/* Grafik */}
      <div className="card p-5" data-testid="dashboard-chart">
        <h2 className="font-brand text-xl font-semibold text-[#2e3b34]">Penjualan vs Biaya</h2>
        <p className="text-xs text-[#93a298]">Grafik tidak menyertakan pembelian aset</p>
        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8caa9a" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#8caa9a" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c62828" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#c62828" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e4" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#5c6f64' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#5c6f64' }}
                tickFormatter={(v: number) => (v >= 1000000 ? `${v / 1000000}jt` : v >= 1000 ? `${v / 1000}rb` : String(v))}
              />
              <Tooltip formatter={(v: any) => formatIDR(Number(v))} />
              <Area type="monotone" dataKey="penjualan" name="Penjualan" stroke="#6f8f7f" fill="url(#gSales)" strokeWidth={2} />
              <Area type="monotone" dataKey="biaya" name="Biaya" stroke="#c62828" fill="url(#gCost)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Riwayat transaksi terbaru */}
      <div className="card p-5" data-testid="recent-transactions">
        <h2 className="font-brand text-xl font-semibold text-[#2e3b34]">Riwayat Transaksi Terbaru</h2>
        <div className="mt-3 divide-y divide-[#eef2ef]">
          {loading && <div className="py-6 text-center text-sm text-[#5c6f64]">Memuat…</div>}
          {!loading && !recent.length && (
            <div className="py-6 text-center text-sm text-[#5c6f64]">Belum ada transaksi</div>
          )}
          {recent.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 py-3" data-testid={`recent-tx-${t.id}`}>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-[#2e3b34]">{txLabel(t)}</div>
                <div className="text-xs text-[#93a298]">{formatDate(t.date)}</div>
              </div>
              <div className={`shrink-0 text-sm font-bold ${txColor(t)}`}>{txAmountDisplay(t)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
