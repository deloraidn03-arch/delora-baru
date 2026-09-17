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

const monthKey = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};

const INCOME_TYPES = ['sale_product', 'sale_custom', 'sale_topup', 'investment'];
const OUTFLOW_TYPES = ['purchase_material', 'purchase_custom', 'expense'];

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [period, setPeriod] = useState(monthKey());
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [depRows, setDepRows] = useState<any[]>([]);
  const [assetValue, setAssetValue] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [y, m] = period.split('-').map(Number);
    const start = new Date(y, m - 1, 1).toISOString();
    const end = new Date(y, m, 1).toISOString();
    const [txRes, recentRes, accRes, depRes, assetRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', user.id).gte('date', start).lt('date', end),
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
  }, [user, period]);

  useEffect(() => {
    load();
  }, [load]);

  const [y, m] = period.split('-').map(Number);

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
    const dep = depRows
      .filter((r) => r.period_month === m && r.period_year === y)
      .reduce((s, r) => s + (Number(r.depreciation_amount) || 0), 0);
    return { sales, prodCost, opex, dep, net: sales - prodCost - dep - opex };
  }, [txs, depRows, m, y]);

  const totalKas = accounts
    .filter((a) => ['cash', 'atm', 'tabungan'].includes(a.name))
    .reduce((s, a) => s + (Number(a.balance) || 0), 0);

  const chartData = useMemo(() => {
    const days = new Date(y, m, 0).getDate();
    const rows: { day: string; penjualan: number; biaya: number }[] = [];
    for (let d = 1; d <= days; d++) {
      const dayTxs = txs.filter((t) => new Date(t.date).getDate() === d);
      const penjualan = dayTxs
        .filter((t) => ['sale_product', 'sale_custom', 'sale_topup'].includes(t.type))
        .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
      const biaya = dayTxs
        .filter(
          (t) =>
            (['purchase_material', 'purchase_custom'].includes(t.type) &&
              t.metadata?.is_asset !== true &&
              t.metadata?.is_asset !== 'true') ||
            t.type === 'expense'
        )
        .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
      rows.push({ day: String(d), penjualan, biaya });
    }
    return rows;
  }, [txs, y, m]);

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
          <h1 className="font-brand text-3xl font-bold text-[#2e3b34]">Dashboard</h1>
          <p className="text-sm text-[#5c6f64]">Ringkasan keuangan &amp; metrik bisnis</p>
        </div>
        <div>
          <label className="label-base">Periode</label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value || monthKey())}
            className="input-base w-full sm:w-48"
            data-testid="dashboard-period-filter"
          />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5" data-testid="kpi-total-penjualan">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">
            <TrendingUp size={14} className="text-[#2e7d32]" /> Total Penjualan
          </div>
          <div className="mt-2 text-2xl font-bold text-[#2e3b34]">{formatIDR(kpis.sales)}</div>
        </div>
        <div className="card p-5" data-testid="kpi-biaya-produksi">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">
            <TrendingDown size={14} className="text-[#c62828]" /> Biaya Produksi
          </div>
          <div className="mt-2 text-2xl font-bold text-[#2e3b34]">{formatIDR(kpis.prodCost)}</div>
          <div className="mt-1 text-[11px] text-[#93a298]">Tidak termasuk pembelian aset</div>
        </div>
        <div className="card p-5" data-testid="kpi-biaya-operasional">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">
            <Wallet size={14} className="text-[#f57f17]" /> Biaya Operasional
          </div>
          <div className="mt-2 text-2xl font-bold text-[#2e3b34]">{formatIDR(kpis.opex)}</div>
        </div>
        <div className="card bg-[#8caa9a] p-5 text-white" data-testid="kpi-laba-bersih">
          <div className="text-xs font-semibold uppercase tracking-wide text-white/80">Laba Bersih</div>
          <div className="mt-2 text-2xl font-bold">{formatIDR(kpis.net)}</div>
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
              <div key={name} className="rounded-lg border border-[#e2e8e4] bg-[#f6f8f6] p-3" data-testid={`saldo-${name}`}>
                <div className="text-xs font-medium text-[#5c6f64]">{ACCOUNT_LABELS[name]}</div>
                <div className="mt-1 text-sm font-bold text-[#2e3b34]">{formatIDR(acc?.balance || 0)}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-[#edf3f0] p-4" data-testid="total-kas-card">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">Total Kas (Cash+ATM+Tabungan)</div>
            <div className="mt-1 text-xl font-bold text-[#2e3b34]">{formatIDR(totalKas)}</div>
          </div>
          <div className="rounded-lg bg-[#edf3f0] p-4" data-testid="nilai-aset-card">
            <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">
              <Landmark size={13} /> Nilai Aset Tetap
            </div>
            <div className="mt-1 text-xl font-bold text-[#2e3b34]">{formatIDR(assetValue)}</div>
          </div>
          <div className="rounded-lg bg-[#edf3f0] p-4" data-testid="penyusutan-bulan-ini-card">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">Penyusutan Bulan Ini</div>
            <div className="mt-1 text-xl font-bold text-[#2e3b34]">{formatIDR(kpis.dep)}</div>
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
