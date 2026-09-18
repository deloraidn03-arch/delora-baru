import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, History } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Asset, AssetDepreciation, ASSET_CATEGORIES } from '../lib/types';
import { formatIDR, formatDate, todayISO, currentMonthYear } from '../lib/format';
import { Modal } from '../components/Modal';
import { CurrencyInput } from '../components/CurrencyInput';
import {
  recomputeDepreciation,
  recordInitialDepreciation,
  runMonthlyDepreciation,
  usefulLifeMonths,
  yearlyPreview,
} from '../lib/depreciation';

const emptyForm = {
  name: '',
  category: ASSET_CATEGORIES[0],
  purchase_price: 0,
  purchase_date: todayISO(),
  residual_value: 0,
  depreciation_rate: 25,
  notes: '',
};

const Assets: React.FC = () => {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [depRows, setDepRows] = useState<AssetDepreciation[]>([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Asset | null>(null);
  const [editRecomputeConfirm, setEditRecomputeConfirm] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [aRes, dRes] = await Promise.all([
      supabase.from('assets').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('asset_depreciations').select('*').eq('user_id', user.id),
    ]);
    setAssets((aRes.data as Asset[]) || []);
    setDepRows((dRes.data as AssetDepreciation[]) || []);
  }, [user]);

  // Trigger 1: buka halaman Aset → catat penyusutan yang tertinggal sampai bulan berjalan
  useEffect(() => {
    if (!user) return;
    (async () => {
      await runMonthlyDepreciation(user.id);
      load();
    })();
  }, [user, load]);

  const { month: cm, year: cy } = currentMonthYear();

  const summary = useMemo(() => {
    const aktif = assets.filter((a) => a.status === 'aktif');
    return {
      count: aktif.length,
      totalPerolehan: assets.reduce((s, a) => s + (Number(a.purchase_price) || 0), 0),
      totalBuku: aktif.reduce((s, a) => s + (Number(a.current_value) || 0), 0),
      depBulanIni: depRows
        .filter((r) => r.period_month === cm && r.period_year === cy)
        .reduce((s, r) => s + (Number(r.depreciation_amount) || 0), 0),
    };
  }, [assets, depRows, cm, cy]);

  const filtered = assets.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.category.toLowerCase().includes(search.toLowerCase())
  );

  const preview = useMemo(
    () =>
      yearlyPreview({
        purchase_date: form.purchase_date,
        purchase_price: form.purchase_price,
        residual_value: form.residual_value,
        depreciation_rate: form.depreciation_rate,
      }),
    [form.purchase_date, form.purchase_price, form.residual_value, form.depreciation_rate]
  );

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (a: Asset) => {
    setEditing(a);
    setForm({
      name: a.name,
      category: a.category,
      purchase_price: a.purchase_price,
      purchase_date: (a.purchase_date || '').slice(0, 10),
      residual_value: a.residual_value,
      depreciation_rate: a.depreciation_rate,
      notes: a.notes || '',
    });
    setModalOpen(true);
  };

  const doSave = async () => {
    if (!user) return toast.error('User not authenticated');
    if (!form.name.trim() || !form.purchase_price || !form.depreciation_rate)
      return toast.error('Harap isi semua field wajib');
    setSaving(true);
    if (editing) {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        purchase_price: form.purchase_price,
        purchase_date: form.purchase_date,
        residual_value: form.residual_value,
        depreciation_rate: form.depreciation_rate,
        useful_life_months: usefulLifeMonths(form.depreciation_rate),
        notes: form.notes,
      };
      const { error } = await supabase.from('assets').update(payload).eq('id', editing.id);
      if (error) {
        setSaving(false);
        return toast.error('Gagal mengupdate aset: ' + error.message);
      }
      // Trigger 3: hapus semua riwayat penyusutan lalu hitung ulang
      await recomputeDepreciation(user.id, { ...editing, ...payload } as Asset);
      toast.success('Aset diupdate & penyusutan dihitung ulang');
    } else {
      const { data, error } = await supabase
        .from('assets')
        .insert({
          user_id: user.id,
          name: form.name.trim(),
          category: form.category,
          purchase_price: form.purchase_price,
          purchase_date: form.purchase_date,
          residual_value: form.residual_value,
          depreciation_rate: form.depreciation_rate,
          useful_life_months: usefulLifeMonths(form.depreciation_rate),
          current_value: form.purchase_price,
          status: 'aktif',
          notes: form.notes,
        })
        .select()
        .single();
      if (error || !data) {
        setSaving(false);
        return toast.error('Gagal menyimpan aset: ' + (error?.message || ''));
      }
      // Trigger 2: tanggal beli mundur → hitung sampai bulan lalu
      await recordInitialDepreciation(user.id, data as Asset);
      toast.success('Aset berhasil ditambahkan');
    }
    setSaving(false);
    setModalOpen(false);
    setEditRecomputeConfirm(false);
    load();
  };

  const handleSaveClick = () => {
    if (editing) {
      // Konfirmasi: riwayat penyusutan akan dihapus & dihitung ulang
      setEditRecomputeConfirm(true);
    } else {
      doSave();
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('asset_depreciations').delete().eq('asset_id', deleteTarget.id);
    const { error } = await supabase.from('assets').delete().eq('id', deleteTarget.id);
    if (error) toast.error('Gagal menghapus: ' + error.message);
    else toast.success('Aset dihapus');
    setDeleteTarget(null);
    load();
  };

  const assetHistory = (a: Asset) =>
    depRows
      .filter((r) => r.asset_id === a.id)
      .sort((x, y) => y.period_year - x.period_year || y.period_month - x.period_month);

  return (
    <div className="space-y-5" data-testid="assets-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-brand text-3xl font-bold tracking-tight text-[#2e3b34] sm:text-4xl">Aset Tetap</h1>
          <p className="text-sm text-[#5c6f64]">Penyusutan otomatis per bulan — metode saldo menurun</p>
        </div>
        <button onClick={openAdd} className="btn-primary" data-testid="add-asset-button">
          <Plus size={18} /> Tambah Aset
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4" data-testid="asset-summary-count">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">Total Aset (aktif)</div>
          <div className="mt-1 text-2xl font-bold text-[#2e3b34]">{summary.count}</div>
        </div>
        <div className="card p-4" data-testid="asset-summary-purchase">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">Total Nilai Perolehan</div>
          <div className="mt-1 text-2xl font-bold text-[#2e3b34]">{formatIDR(summary.totalPerolehan)}</div>
        </div>
        <div className="card p-4" data-testid="asset-summary-book">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">Total Nilai Buku</div>
          <div className="mt-1 text-2xl font-bold text-[#6f8f7f]">{formatIDR(summary.totalBuku)}</div>
        </div>
        <div className="card p-4" data-testid="asset-summary-dep">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">Penyusutan Bulan Ini</div>
          <div className="mt-1 text-2xl font-bold text-[#c62828]">{formatIDR(summary.depBulanIni)}</div>
        </div>
      </div>

      <input
        className="input-base sm:max-w-xs"
        placeholder="Cari nama / kategori aset…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        data-testid="asset-search-input"
      />

      <div className="card hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e2e8e4] bg-[#FAF8F3] text-left text-xs uppercase tracking-wide text-[#5c6f64]">
              <th className="px-4 py-3">Aset</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3 text-right">Harga Perolehan</th>
              <th className="px-4 py-3 text-right">Rate</th>
              <th className="px-4 py-3 text-right">Nilai Buku</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const lowValue = Number(a.current_value) < 0.2 * Number(a.purchase_price);
              return (
                <tr key={a.id} className="border-b border-[#eef2ef] hover:bg-[#FAF8F3]" data-testid={`asset-row-${a.id}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-[#93a298]">Beli {formatDate(a.purchase_date)}</div>
                  </td>
                  <td className="px-4 py-3">{a.category}</td>
                  <td className="px-4 py-3 text-right">{formatIDR(a.purchase_price)}</td>
                  <td className="px-4 py-3 text-right">{a.depreciation_rate}%/th</td>
                  <td className={`px-4 py-3 text-right font-bold ${lowValue ? 'text-[#c62828]' : 'text-[#2e3b34]'}`}>
                    {formatIDR(a.current_value)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        a.status === 'aktif'
                          ? 'border border-[#a5d6a7] bg-[#e8f5e9] text-[#2e7d32]'
                          : 'border border-[#cfd8dc] bg-[#eceff1] text-[#607d8b]'
                      }`}
                    >
                      {a.status === 'aktif' ? 'Aktif' : 'Habis'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setHistoryTarget(a)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#1565c0] hover:bg-[#e3f2fd]" title="Riwayat penyusutan" data-testid={`asset-history-${a.id}`}>
                        <History size={16} />
                      </button>
                      <button onClick={() => openEdit(a)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#6f8f7f] hover:bg-[#F2F7F4]" title="Edit" data-testid={`edit-asset-${a.id}`}>
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => setDeleteTarget(a)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#c62828] hover:bg-[#ffebee]" title="Hapus" data-testid={`delete-asset-${a.id}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[#5c6f64]">
                  Belum ada aset
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {filtered.map((a) => {
          const lowValue = Number(a.current_value) < 0.2 * Number(a.purchase_price);
          return (
            <div key={a.id} className="card p-4" data-testid={`asset-card-${a.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-[#2e3b34]">{a.name}</div>
                  <div className="text-xs text-[#5c6f64]">
                    {a.category} • {a.depreciation_rate}%/th
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    a.status === 'aktif' ? 'bg-[#e8f5e9] text-[#2e7d32]' : 'bg-[#eceff1] text-[#607d8b]'
                  }`}
                >
                  {a.status === 'aktif' ? 'Aktif' : 'Habis'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-lg bg-[#FAF8F3] p-2">
                  <div className="text-[#5c6f64]">Perolehan</div>
                  <div className="font-bold">{formatIDR(a.purchase_price)}</div>
                </div>
                <div className="rounded-lg bg-[#FAF8F3] p-2">
                  <div className="text-[#5c6f64]">Nilai Buku</div>
                  <div className={`font-bold ${lowValue ? 'text-[#c62828]' : ''}`}>{formatIDR(a.current_value)}</div>
                </div>
              </div>
              <div className="mt-3 flex gap-1">
                <button onClick={() => setHistoryTarget(a)} className="btn-secondary flex-1 text-xs" data-testid={`asset-history-mobile-${a.id}`}>
                  <History size={14} /> Riwayat
                </button>
                <button onClick={() => openEdit(a)} className="btn-secondary flex-1 text-xs" data-testid={`edit-asset-mobile-${a.id}`}>
                  <Pencil size={14} /> Edit
                </button>
                <button onClick={() => setDeleteTarget(a)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#c62828]" data-testid={`delete-asset-mobile-${a.id}`} aria-label="Hapus">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
        {!filtered.length && <div className="card p-8 text-center text-sm text-[#5c6f64]">Belum ada aset</div>}
      </div>

      {/* Form tambah/edit + preview penyusutan tahunan */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Aset' : 'Tambah Aset'} wide data-testid="asset-modal">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label-base">Nama Aset *</label>
            <input className="input-base" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="asset-name-input" />
          </div>
          <div>
            <label className="label-base">Kategori</label>
            <select className="input-base" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="asset-category-select">
              {ASSET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-base">Harga Perolehan *</label>
            <CurrencyInput value={form.purchase_price} onChange={(v) => setForm({ ...form, purchase_price: v })} data-testid="asset-price-input" />
          </div>
          <div>
            <label className="label-base">Tanggal Beli</label>
            <input type="date" className="input-base" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} data-testid="asset-date-input" />
          </div>
          <div>
            <label className="label-base">Rate Penyusutan (% / tahun) *</label>
            <input
              type="number"
              inputMode="numeric"
              className="input-base"
              value={form.depreciation_rate || ''}
              onChange={(e) => setForm({ ...form, depreciation_rate: Number(e.target.value) || 0 })}
              data-testid="asset-rate-input"
            />
            <div className="mt-1 text-xs text-[#93a298]">
              Masa manfaat otomatis: {form.depreciation_rate ? usefulLifeMonths(form.depreciation_rate) : '-'} bulan.
              Periode pertama = bulan setelah pembelian.
            </div>
          </div>
          <div>
            <label className="label-base">Nilai Sisa</label>
            <CurrencyInput value={form.residual_value} onChange={(v) => setForm({ ...form, residual_value: v })} data-testid="asset-residual-input" />
          </div>
          <div>
            <label className="label-base">Catatan</label>
            <input className="input-base" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="asset-notes-input" />
          </div>
        </div>

        {form.purchase_price > 0 && form.depreciation_rate > 0 && preview.length > 0 && (
          <div className="mt-5" data-testid="asset-preview-table">
            <h3 className="label-base">Preview Penyusutan Tahunan (saldo menurun)</h3>
            <div className="overflow-hidden rounded-lg border border-[#e2e8e4]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#FAF8F3] text-left text-xs uppercase tracking-wide text-[#5c6f64]">
                    <th className="px-3 py-2">Tahun</th>
                    <th className="px-3 py-2 text-right">Penyusutan</th>
                    <th className="px-3 py-2 text-right">Nilai Buku Akhir</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.year} className="border-t border-[#eef2ef]">
                      <td className="px-3 py-2">{r.year}</td>
                      <td className="px-3 py-2 text-right text-[#c62828]">{formatIDR(r.depreciation)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatIDR(r.book_value_end)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setModalOpen(false)} className="btn-secondary" data-testid="asset-cancel-button">
            Batal
          </button>
          <button onClick={handleSaveClick} disabled={saving} className="btn-primary" data-testid="asset-save-button">
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </Modal>

      {/* Konfirmasi edit: riwayat dihitung ulang */}
      <Modal open={editRecomputeConfirm} onClose={() => setEditRecomputeConfirm(false)} title="Hitung Ulang Penyusutan" data-testid="asset-recompute-modal">
        <p className="text-sm text-[#2e3b34]">
          Mengedit aset akan <strong>menghapus seluruh riwayat penyusutan</strong> aset ini lalu menghitung ulang dari
          tanggal beli sampai bulan lalu. Lanjutkan?
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setEditRecomputeConfirm(false)} className="btn-secondary" data-testid="recompute-cancel">
            Batal
          </button>
          <button onClick={doSave} disabled={saving} className="btn-primary" data-testid="recompute-confirm">
            {saving ? 'Memproses…' : 'Ya, Hitung Ulang'}
          </button>
        </div>
      </Modal>

      {/* Riwayat penyusutan */}
      <Modal open={!!historyTarget} onClose={() => setHistoryTarget(null)} title={`Riwayat Penyusutan — ${historyTarget?.name || ''}`} wide data-testid="asset-history-modal">
        {historyTarget && (
          <div>
            <div className="overflow-hidden rounded-lg border border-[#e2e8e4]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#FAF8F3] text-left text-xs uppercase tracking-wide text-[#5c6f64]">
                    <th className="px-3 py-2">Periode</th>
                    <th className="px-3 py-2 text-right">Penyusutan</th>
                    <th className="px-3 py-2 text-right">Nilai Buku Sebelum</th>
                    <th className="px-3 py-2 text-right">Sesudah</th>
                  </tr>
                </thead>
                <tbody>
                  {assetHistory(historyTarget).map((r) => (
                    <tr key={`${r.period_year}-${r.period_month}`} className="border-t border-[#eef2ef]">
                      <td className="px-3 py-2">
                        {String(r.period_month).padStart(2, '0')}/{r.period_year}
                      </td>
                      <td className="px-3 py-2 text-right text-[#c62828]">{formatIDR(r.depreciation_amount)}</td>
                      <td className="px-3 py-2 text-right">{formatIDR(r.book_value_before)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatIDR(r.book_value_after)}</td>
                    </tr>
                  ))}
                  {!assetHistory(historyTarget).length && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-[#5c6f64]">
                        Belum ada penyusutan tercatat
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-between rounded-lg bg-[#F2F7F4] px-4 py-3 text-sm font-semibold" data-testid="asset-history-total">
              <span>Total Akumulasi Penyusutan</span>
              <span>{formatIDR(assetHistory(historyTarget).reduce((s, r) => s + (Number(r.depreciation_amount) || 0), 0))}</span>
            </div>
          </div>
        )}
      </Modal>

      {/* Hapus aset */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Hapus Aset" data-testid="asset-delete-modal">
        <p className="text-sm text-[#2e3b34]">
          Hapus aset <strong>{deleteTarget?.name}</strong> beserta seluruh riwayat penyusutannya?
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary" data-testid="asset-delete-cancel">
            Batal
          </button>
          <button onClick={handleDelete} className="btn-danger" data-testid="asset-delete-confirm">
            Hapus
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Assets;
