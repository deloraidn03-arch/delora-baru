import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Account, ACCOUNT_LABELS, ASSET_CATEGORIES, Product, Transaction } from '../lib/types';
import { formatIDR, formatDate, todayISO } from '../lib/format';
import { Modal } from '../components/Modal';
import { CurrencyInput } from '../components/CurrencyInput';
import { SearchableSelect } from '../components/SearchableSelect';
import {
  adjustAccountBalance,
  adjustProductStock,
  fetchTransactionFresh,
  reverseStockEffects,
  reverseTransactionEffects,
} from '../lib/balances';
import { recordInitialDepreciation, usefulLifeMonths } from '../lib/depreciation';
import { Asset } from '../lib/types';

type PurchaseTab = 'material' | 'custom' | 'asset';

const emptyMaterial = { productId: '', newProductName: '', quantity: 1, totalPayment: 0, storeName: '', paymentAccount: 'cash', date: todayISO() };
const emptyCustom = { productName: '', totalPayment: 0, storeName: '', paymentAccount: 'cash', date: todayISO() };
const emptyAsset = {
  name: '',
  category: ASSET_CATEGORIES[0],
  purchase_price: 0,
  purchase_date: todayISO(),
  residual_value: 0,
  depreciation_rate: 25,
  paymentAccount: 'cash',
  notes: '',
};

const Purchases: React.FC = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<PurchaseTab>('material');
  const [formMaterial, setFormMaterial] = useState(emptyMaterial);
  const [formCustom, setFormCustom] = useState(emptyCustom);
  const [formAsset, setFormAsset] = useState(emptyAsset);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [pRes, aRes, tRes] = await Promise.all([
      supabase.from('products').select('*').eq('user_id', user.id).order('name'),
      supabase.from('accounts').select('*').eq('user_id', user.id),
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .in('type', ['purchase_material', 'purchase_custom'])
        .order('date', { ascending: false })
        .limit(100),
    ]);
    setProducts((pRes.data as Product[]) || []);
    setAccounts((aRes.data as Account[]) || []);
    setHistory((tRes.data as Transaction[]) || []);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const openModal = () => {
    setFormMaterial(emptyMaterial);
    setFormCustom(emptyCustom);
    setFormAsset(emptyAsset);
    setTab('material');
    setModalOpen(true);
  };

  const ensureProduct = async (name: string): Promise<Product | null> => {
    if (!user) return null;
    const existing = products.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing;
    const { data, error } = await supabase
      .from('products')
      .insert({ user_id: user.id, name: name.trim(), type: 'single', hpp: 0, selling_price: 0, stock: 0, min_stock: 0 })
      .select()
      .single();
    if (error) {
      toast.error('Gagal membuat produk: ' + error.message);
      return null;
    }
    return data as Product;
  };

  const handleSubmitMaterial = async () => {
    if (!user) return toast.error('User not authenticated');
    let product = products.find((p) => p.id === formMaterial.productId);
    if (!product && formMaterial.newProductName.trim()) product = await ensureProduct(formMaterial.newProductName);
    if (!product || !formMaterial.quantity || !formMaterial.totalPayment) return toast.error('Harap isi semua field wajib');
    setSaving(true);
    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'purchase_material',
      amount: -Math.abs(formMaterial.totalPayment),
      date: new Date(formMaterial.date).toISOString(),
      metadata: {
        productId: product.id,
        productName: product.name,
        quantity: formMaterial.quantity,
        totalPayment: formMaterial.totalPayment,
        storeName: formMaterial.storeName,
        paymentAccount: formMaterial.paymentAccount,
      },
    });
    if (error) {
      setSaving(false);
      return toast.error('Gagal menyimpan pembelian: ' + error.message);
    }
    await adjustAccountBalance(user.id, formMaterial.paymentAccount, -Math.abs(formMaterial.totalPayment));
    await adjustProductStock(product.id, formMaterial.quantity); // stok bahan BERTAMBAH
    // Bahan baru: derive HPP otomatis dari totalPayment/qty bila belum ada
    if (!(product.hpp > 0) && formMaterial.quantity > 0) {
      await supabase
        .from('products')
        .update({ hpp: Math.round(formMaterial.totalPayment / formMaterial.quantity) })
        .eq('id', product.id);
    }
    toast.success('Pembelian bahan baku dicatat — stok bertambah');
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const handleSubmitCustom = async () => {
    if (!user) return toast.error('User not authenticated');
    if (!formCustom.productName || !formCustom.totalPayment) return toast.error('Harap isi semua field wajib');
    setSaving(true);
    // purchase_custom: TIDAK menyentuh stok
    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'purchase_custom',
      amount: -Math.abs(formCustom.totalPayment),
      date: new Date(formCustom.date).toISOString(),
      metadata: {
        productName: formCustom.productName,
        totalPayment: formCustom.totalPayment,
        storeName: formCustom.storeName,
        paymentAccount: formCustom.paymentAccount,
      },
    });
    if (error) {
      setSaving(false);
      return toast.error('Gagal menyimpan pembelian: ' + error.message);
    }
    await adjustAccountBalance(user.id, formCustom.paymentAccount, -Math.abs(formCustom.totalPayment));
    toast.success('Pembelian custom request dicatat (tanpa menambah stok)');
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const handleSubmitAsset = async () => {
    if (!user) return toast.error('User not authenticated');
    if (!formAsset.name || !formAsset.purchase_price || !formAsset.depreciation_rate) return toast.error('Harap isi semua field wajib');
    setSaving(true);
    // 1. Entri aset
    const { data: asset, error: assetErr } = await supabase
      .from('assets')
      .insert({
        user_id: user.id,
        name: formAsset.name,
        category: formAsset.category,
        purchase_price: formAsset.purchase_price,
        purchase_date: formAsset.purchase_date,
        residual_value: formAsset.residual_value,
        depreciation_rate: formAsset.depreciation_rate,
        useful_life_months: usefulLifeMonths(formAsset.depreciation_rate),
        current_value: formAsset.purchase_price,
        status: 'aktif',
        notes: formAsset.notes,
      })
      .select()
      .single();
    if (assetErr || !asset) {
      setSaving(false);
      return toast.error('Gagal menyimpan aset: ' + (assetErr?.message || ''));
    }
    // 2. Transaksi pembelian dengan is_asset='true' → dikecualikan dari Biaya Produksi
    const { error: txErr } = await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'purchase_material',
      amount: -Math.abs(formAsset.purchase_price),
      date: new Date(formAsset.purchase_date).toISOString(),
      metadata: {
        is_asset: 'true',
        asset_id: asset.id,
        productName: formAsset.name,
        totalPayment: formAsset.purchase_price,
        paymentAccount: formAsset.paymentAccount,
      },
    });
    if (txErr) {
      setSaving(false);
      return toast.error('Gagal mencatat transaksi aset: ' + txErr.message);
    }
    await adjustAccountBalance(user.id, formAsset.paymentAccount, -Math.abs(formAsset.purchase_price));
    // 3. Bila tanggal beli mundur, hitung penyusutan sampai bulan lalu
    await recordInitialDepreciation(user.id, asset as Asset);
    toast.success('Aset tetap dicatat (dikecualikan dari Biaya Produksi)');
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!user || !deleteTarget) return;
    const isAsset = deleteTarget.metadata?.is_asset === true || deleteTarget.metadata?.is_asset === 'true';
    const old = await fetchTransactionFresh(deleteTarget.id);
    if (old) {
      await reverseTransactionEffects(user.id, old);
      await reverseStockEffects(old);
    }
    const { error } = await supabase.from('transactions').delete().eq('id', deleteTarget.id);
    if (error) toast.error('Gagal menghapus: ' + error.message);
    else {
      if (isAsset && deleteTarget.metadata?.asset_id) {
        await supabase.from('asset_depreciations').delete().eq('asset_id', deleteTarget.metadata.asset_id);
        await supabase.from('assets').delete().eq('id', deleteTarget.metadata.asset_id);
      }
      toast.success('Pembelian dihapus');
    }
    setDeleteTarget(null);
    load();
  };

  const tabs: { id: PurchaseTab; label: string }[] = [
    { id: 'material', label: 'Bahan Baku' },
    { id: 'custom', label: 'Custom Request' },
    { id: 'asset', label: 'Aset Tetap' },
  ];

  const accountSelect = (value: string, onChange: (v: string) => void, testid: string) => (
    <select className="input-base" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid}>
      {accounts.map((a) => (
        <option key={a.id} value={a.name}>
          {ACCOUNT_LABELS[a.name] || a.name} — {formatIDR(a.balance)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-5" data-testid="purchases-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-brand text-3xl font-bold tracking-tight text-[#2e3b34] sm:text-4xl">Pembelian</h1>
          <p className="text-sm text-[#5c6f64]">Pembelian bahan, kebutuhan pesanan, dan aset</p>
        </div>
        <button onClick={openModal} className="btn-primary" data-testid="add-purchase-button">
          <Plus size={18} /> Tambah Pembelian
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e2e8e4] bg-[#FAF8F3] text-left text-xs uppercase tracking-wide text-[#5c6f64]">
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3">Toko</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Nominal</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {history.map((t) => {
                const isAsset = t.metadata?.is_asset === true || t.metadata?.is_asset === 'true';
                return (
                  <tr key={t.id} className="border-b border-[#eef2ef] hover:bg-[#FAF8F3]" data-testid={`purchase-row-${t.id}`}>
                    <td className="px-4 py-3">{formatDate(t.date)}</td>
                    <td className="px-4 py-3 font-medium">{t.metadata?.productName}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          isAsset
                            ? 'bg-[#e8d9b8] text-[#6b5a2e]'
                            : t.type === 'purchase_custom'
                            ? 'bg-[#e3f2fd] text-[#1565c0]'
                            : 'bg-[#F2F7F4] text-[#6f8f7f]'
                        }`}
                      >
                        {isAsset ? 'Aset Tetap' : t.type === 'purchase_custom' ? 'Custom Request' : 'Bahan Baku'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#5c6f64]">{t.metadata?.storeName || '-'}</td>
                    <td className="px-4 py-3 text-right">{t.metadata?.quantity || '-'}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#c62828]">− {formatIDR(Math.abs(t.amount))}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button onClick={() => setDeleteTarget(t)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#c62828] hover:bg-[#ffebee]" data-testid={`delete-purchase-${t.id}`} aria-label="Hapus">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!history.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#5c6f64]">
                    Belum ada pembelian
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-[#eef2ef] md:hidden">
          {history.map((t) => {
            const isAsset = t.metadata?.is_asset === true || t.metadata?.is_asset === 'true';
            return (
              <div key={t.id} className="p-4" data-testid={`purchase-card-${t.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[#2e3b34]">{t.metadata?.productName}</div>
                    <div className="text-xs text-[#5c6f64]">
                      {formatDate(t.date)} • {isAsset ? 'Aset Tetap' : t.type === 'purchase_custom' ? 'Custom Request' : 'Bahan Baku'}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-bold text-[#c62828]">− {formatIDR(Math.abs(t.amount))}</div>
                    <button onClick={() => setDeleteTarget(t)} className="mt-1 flex h-11 w-11 items-center justify-center rounded-lg text-[#c62828]" data-testid={`delete-purchase-mobile-${t.id}`} aria-label="Hapus">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {!history.length && <div className="p-8 text-center text-sm text-[#5c6f64]">Belum ada pembelian</div>}
        </div>
      </div>

      {/* Modal Tambah Pembelian — 3 tab */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Tambah Pembelian" wide data-testid="purchase-modal">
        <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-[#F2F7F4] p-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-[44px] rounded-xl text-xs font-semibold transition-all duration-200 sm:text-sm ${
                tab === t.id ? 'bg-white text-[#2e3b34] shadow-sm' : 'text-[#5c6f64]'
              }`}
              data-testid={`purchase-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'material' && (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label-base">Produk / Bahan *</label>
              <SearchableSelect
                options={products.map((p) => ({ value: p.id, label: p.name, hint: `stok ${p.stock}` }))}
                value={formMaterial.productId}
                onChange={(v) => setFormMaterial({ ...formMaterial, productId: v, newProductName: '' })}
                allowCreate
                onCreate={(text) => setFormMaterial({ ...formMaterial, productId: '', newProductName: text })}
                placeholder="Pilih atau buat bahan baru…"
                data-testid="purchase-product-select"
              />
              {formMaterial.newProductName && (
                <div className="mt-1 text-xs text-[#6f8f7f]">
                  Bahan baru akan dibuat: <strong>{formMaterial.newProductName}</strong>
                </div>
              )}
            </div>
            <div>
              <label className="label-base">Qty *</label>
              <input
                type="number"
                inputMode="numeric"
                className="input-base"
                value={formMaterial.quantity || ''}
                onChange={(e) => setFormMaterial({ ...formMaterial, quantity: Number(e.target.value) || 0 })}
                data-testid="purchase-qty-input"
              />
            </div>
            <div>
              <label className="label-base">Total Harga *</label>
              <CurrencyInput value={formMaterial.totalPayment} onChange={(v) => setFormMaterial({ ...formMaterial, totalPayment: v })} data-testid="purchase-total-input" />
            </div>
            <div>
              <label className="label-base">Nama Toko</label>
              <input
                className="input-base"
                value={formMaterial.storeName}
                onChange={(e) => setFormMaterial({ ...formMaterial, storeName: e.target.value })}
                data-testid="purchase-store-input"
              />
            </div>
            <div>
              <label className="label-base">Tanggal</label>
              <input
                type="date"
                className="input-base"
                value={formMaterial.date}
                onChange={(e) => setFormMaterial({ ...formMaterial, date: e.target.value })}
                data-testid="purchase-date-input"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label-base">Sumber Dana</label>
              {accountSelect(formMaterial.paymentAccount, (v) => setFormMaterial({ ...formMaterial, paymentAccount: v }), 'purchase-account-select')}
            </div>
            <div className="rounded-lg bg-[#F2F7F4] px-4 py-3 text-xs text-[#5c6f64] sm:col-span-2">
              Stok bahan akan <strong>bertambah</strong> sebesar qty pembelian.
            </div>
            <div className="sm:col-span-2">
              <button onClick={handleSubmitMaterial} disabled={saving} className="btn-primary w-full sm:w-auto" data-testid="purchase-material-submit">
                Simpan Pembelian Bahan
              </button>
            </div>
          </div>
        )}

        {tab === 'custom' && (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label-base">Nama Item / Bahan (bebas) *</label>
              <input
                className="input-base"
                value={formCustom.productName}
                onChange={(e) => setFormCustom({ ...formCustom, productName: e.target.value })}
                placeholder="Mis. Bunga mawar untuk pesanan Bu Sari"
                data-testid="purchase-custom-name-input"
              />
            </div>
            <div>
              <label className="label-base">Total Harga *</label>
              <CurrencyInput value={formCustom.totalPayment} onChange={(v) => setFormCustom({ ...formCustom, totalPayment: v })} data-testid="purchase-custom-total-input" />
            </div>
            <div>
              <label className="label-base">Nama Toko</label>
              <input
                className="input-base"
                value={formCustom.storeName}
                onChange={(e) => setFormCustom({ ...formCustom, storeName: e.target.value })}
                data-testid="purchase-custom-store-input"
              />
            </div>
            <div>
              <label className="label-base">Tanggal</label>
              <input
                type="date"
                className="input-base"
                value={formCustom.date}
                onChange={(e) => setFormCustom({ ...formCustom, date: e.target.value })}
                data-testid="purchase-custom-date-input"
              />
            </div>
            <div>
              <label className="label-base">Sumber Dana</label>
              {accountSelect(formCustom.paymentAccount, (v) => setFormCustom({ ...formCustom, paymentAccount: v }), 'purchase-custom-account-select')}
            </div>
            <div className="rounded-lg bg-[#fff8e1] px-4 py-3 text-xs text-[#8a6d00] sm:col-span-2">
              Pembelian custom request <strong>tidak menambah stok</strong> (bahan langsung untuk pesanan).
            </div>
            <div className="sm:col-span-2">
              <button onClick={handleSubmitCustom} disabled={saving} className="btn-primary w-full sm:w-auto" data-testid="purchase-custom-submit">
                Simpan Pembelian Custom
              </button>
            </div>
          </div>
        )}

        {tab === 'asset' && (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label-base">Nama Aset *</label>
              <input
                className="input-base"
                value={formAsset.name}
                onChange={(e) => setFormAsset({ ...formAsset, name: e.target.value })}
                placeholder="Mis. Printer Canon"
                data-testid="purchase-asset-name-input"
              />
            </div>
            <div>
              <label className="label-base">Kategori</label>
              <select
                className="input-base"
                value={formAsset.category}
                onChange={(e) => setFormAsset({ ...formAsset, category: e.target.value })}
                data-testid="purchase-asset-category-select"
              >
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-base">Harga Perolehan *</label>
              <CurrencyInput value={formAsset.purchase_price} onChange={(v) => setFormAsset({ ...formAsset, purchase_price: v })} data-testid="purchase-asset-price-input" />
            </div>
            <div>
              <label className="label-base">Tanggal Beli</label>
              <input
                type="date"
                className="input-base"
                value={formAsset.purchase_date}
                onChange={(e) => setFormAsset({ ...formAsset, purchase_date: e.target.value })}
                data-testid="purchase-asset-date-input"
              />
            </div>
            <div>
              <label className="label-base">Rate Penyusutan (% / tahun) *</label>
              <input
                type="number"
                inputMode="numeric"
                className="input-base"
                value={formAsset.depreciation_rate || ''}
                onChange={(e) => setFormAsset({ ...formAsset, depreciation_rate: Number(e.target.value) || 0 })}
                data-testid="purchase-asset-rate-input"
              />
              <div className="mt-1 text-xs text-[#93a298]">
                Umum: Elektronik 50%, Kendaraan/Furnitur 25%. Masa manfaat otomatis:{' '}
                {formAsset.depreciation_rate ? usefulLifeMonths(formAsset.depreciation_rate) : '-'} bulan
              </div>
            </div>
            <div>
              <label className="label-base">Nilai Sisa</label>
              <CurrencyInput value={formAsset.residual_value} onChange={(v) => setFormAsset({ ...formAsset, residual_value: v })} data-testid="purchase-asset-residual-input" />
            </div>
            <div>
              <label className="label-base">Sumber Dana</label>
              {accountSelect(formAsset.paymentAccount, (v) => setFormAsset({ ...formAsset, paymentAccount: v }), 'purchase-asset-account-select')}
            </div>
            <div className="rounded-lg bg-[#F2F7F4] px-4 py-3 text-xs text-[#5c6f64] sm:col-span-2">
              Pembelian aset <strong>dikecualikan dari Biaya Produksi</strong>; bebannya masuk laba lewat penyusutan
              bulanan (saldo menurun).
            </div>
            <div className="sm:col-span-2">
              <button onClick={handleSubmitAsset} disabled={saving} className="btn-primary w-full sm:w-auto" data-testid="purchase-asset-submit">
                Simpan Aset Tetap
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Hapus Pembelian" data-testid="purchase-delete-modal">
        <p className="text-sm text-[#2e3b34]">
          Hapus pembelian ini? Saldo akun akan dikembalikan
          {deleteTarget?.metadata?.is_asset === 'true' || deleteTarget?.metadata?.is_asset === true
            ? ' dan entri aset ikut dihapus'
            : deleteTarget?.type === 'purchase_material'
            ? ' dan stok bahan dikurangi kembali'
            : ''}
          .
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary" data-testid="purchase-delete-cancel">
            Batal
          </button>
          <button onClick={handleDelete} className="btn-danger" data-testid="purchase-delete-confirm">
            Hapus
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Purchases;
