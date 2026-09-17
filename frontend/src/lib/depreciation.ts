import { supabase } from './supabase';
import { Asset, AssetDepreciation } from './types';

// Aturan lintas-menu #9: metode SALDO MENURUN (declining balance), BUKAN garis lurus.

export const monthlyRate = (ratePctPerYear: number): number => ratePctPerYear / 100 / 12;

export const usefulLifeMonths = (ratePctPerYear: number): number =>
  ratePctPerYear > 0 ? Math.round((100 / ratePctPerYear) * 12) : 0;

export interface DepScheduleRow {
  period_month: number;
  period_year: number;
  depreciation_amount: number;
  book_value_before: number;
  book_value_after: number;
}

const round2 = (n: number) => Math.round(n);

/**
 * Hitung jadwal penyusutan dari bulan SETELAH pembelian sampai periode `until` (inklusif).
 * Penyusutan di-cap agar nilai buku tidak pernah turun di bawah nilai sisa.
 */
export function computeSchedule(
  asset: Pick<Asset, 'purchase_date' | 'purchase_price' | 'residual_value' | 'depreciation_rate'>,
  until: { month: number; year: number } // month 1-12, inklusif
): DepScheduleRow[] {
  const rows: DepScheduleRow[] = [];
  const residual = Number(asset.residual_value) || 0;
  let bv = Number(asset.purchase_price) || 0;
  const r = monthlyRate(Number(asset.depreciation_rate) || 0);
  if (r <= 0 || bv <= 0) return rows;

  const d = new Date(asset.purchase_date);
  if (isNaN(d.getTime())) return rows;
  let m = d.getMonth() + 1; // 1-12 bulan pembelian
  let y = d.getFullYear();
  // Periode pertama = bulan SETELAH pembelian
  m += 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }

  while (y < until.year || (y === until.year && m <= until.month)) {
    if (bv <= residual) break; // berhenti total saat nilai buku <= nilai sisa
    let dep = bv * r;
    if (bv - dep < residual) dep = bv - residual; // cap tepat di nilai sisa
    const after = bv - dep;
    rows.push({
      period_month: m,
      period_year: y,
      depreciation_amount: round2(dep),
      book_value_before: round2(bv),
      book_value_after: round2(after),
    });
    bv = after;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return rows;
}

const thisMonth = () => {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
};

const lastMonth = () => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
};

async function insertDepreciationRows(userId: string, assetId: string, rows: DepScheduleRow[]): Promise<void> {
  if (!rows.length) return;
  await supabase.from('asset_depreciations').insert(
    rows.map((r) => ({ ...r, asset_id: assetId, user_id: userId }))
  );
}

async function finalizeAsset(assetId: string, purchasePrice: number, residual: number, rows: DepScheduleRow[]): Promise<void> {
  const finalBv = rows.length ? rows[rows.length - 1].book_value_after : purchasePrice;
  const status = finalBv <= residual ? 'habis' : 'aktif';
  await supabase.from('assets').update({ current_value: finalBv, status }).eq('id', assetId);
}

/** Trigger 1: dipanggil saat halaman Aset dibuka — catat periode yang tertinggal sampai bulan berjalan. */
export async function runMonthlyDepreciation(userId: string): Promise<void> {
  const { data: assets } = await supabase
    .from('assets')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'aktif');
  if (!assets?.length) return;
  const until = thisMonth();
  for (const asset of assets as Asset[]) {
    const { data: existing } = await supabase
      .from('asset_depreciations')
      .select('period_month, period_year')
      .eq('asset_id', asset.id);
    const have = new Set((existing || []).map((e: any) => `${e.period_year}-${e.period_month}`));
    const full = computeSchedule(asset, until);
    const missing = full.filter((r) => !have.has(`${r.period_year}-${r.period_month}`));
    if (missing.length) await insertDepreciationRows(userId, asset.id, missing);
    await finalizeAsset(asset.id, Number(asset.purchase_price), Number(asset.residual_value) || 0, full);
  }
}

/** Trigger 2: aset baru — bila tanggal beli mundur, hitung sampai BULAN LALU. */
export async function recordInitialDepreciation(userId: string, asset: Asset): Promise<void> {
  const rows = computeSchedule(asset, lastMonth());
  await insertDepreciationRows(userId, asset.id, rows);
  await finalizeAsset(asset.id, Number(asset.purchase_price), Number(asset.residual_value) || 0, rows);
}

/** Trigger 3: edit aset — hapus semua riwayat lalu hitung ulang sampai bulan lalu. */
export async function recomputeDepreciation(userId: string, asset: Asset): Promise<void> {
  await supabase.from('asset_depreciations').delete().eq('asset_id', asset.id);
  const rows = computeSchedule(asset, lastMonth());
  await insertDepreciationRows(userId, asset.id, rows);
  await finalizeAsset(asset.id, Number(asset.purchase_price), Number(asset.residual_value) || 0, rows);
}

/** Preview penyusutan tahunan untuk form Tambah/Edit aset. */
export function yearlyPreview(
  asset: Pick<Asset, 'purchase_date' | 'purchase_price' | 'residual_value' | 'depreciation_rate'>
): { year: number; depreciation: number; book_value_end: number }[] {
  const residual = Number(asset.residual_value) || 0;
  let bv = Number(asset.purchase_price) || 0;
  const r = monthlyRate(Number(asset.depreciation_rate) || 0);
  if (!bv || r <= 0) return [];
  const startYear = new Date(asset.purchase_date || new Date()).getFullYear();
  const out: { year: number; depreciation: number; book_value_end: number }[] = [];
  for (let year = 0; year < 8 && bv > residual; year++) {
    let depYear = 0;
    for (let mo = 0; mo < 12 && bv > residual; mo++) {
      let dep = bv * r;
      if (bv - dep < residual) dep = bv - residual;
      bv -= dep;
      depYear += dep;
    }
    out.push({ year: startYear + year + 1, depreciation: round2(depYear), book_value_end: round2(bv) });
    if (bv <= residual) break;
  }
  return out;
}

export const getDepreciationForPeriod = (rows: AssetDepreciation[], month: number, year: number): number =>
  rows
    .filter((r) => r.period_month === month && r.period_year === year)
    .reduce((s, r) => s + (Number(r.depreciation_amount) || 0), 0);
