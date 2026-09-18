import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Account, ACCOUNT_LABELS, Customer, Product, Transaction } from '../lib/types';
import { formatIDR, formatDate, todayISO } from '../lib/format';
import { Modal } from '../components/Modal';
import { CurrencyInput } from '../components/CurrencyInput';
import { SearchableSelect } from '../components/SearchableSelect';
import { CustomerCombobox } from '../components/CustomerCombobox';
import { getOrCreateCustomer } from '../lib/customers';
import {
  adjustAccountBalance,
  adjustProductStock,
  applyStockEffects,
  applyTransactionEffects,
  fetchTransactionFresh,
  reverseStockEffects,
  reverseTransactionEffects,
} from '../lib/balances';

type SaleTab = 'produk' | 'custom' | 'bouquet' | 'topup';

const emptyProduk = { productId: '', quantity: 1, sellingPrice: 0, customerName: '', paymentAccount: 'cash' };
const emptyCustom = { itemName: '', amount: 0, hpp: 0, customerName: '', paymentAccount: 'cash' };
const emptyTopup = { hpp: 0, sellPrice: 0, paymentMethod: 'Cash', customerName: '' };

const Sales: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<SaleTab>('produk');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [formProduk, setFormProduk] = useState(emptyProduk);
  const [formCustom, setFormCustom] = useState(emptyCustom);
  const [formTopup, setFormTopup] = useState(emptyTopup);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editForm, setEditForm] = useState({ customerName: '', amount: 0, quantity: 1, paymentAccount: 'cash', date: '' });
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [pRes, cRes, aRes, tRes] = await Promise.all([
      supabase.from('products').select('*').eq('user_id', user.id).order('name'),
      supabase.from('customers').select('*').eq('user_id', user.id).order('name'),
      supabase.from('accounts').select('*').eq('user_id', user.id),
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .in('type', ['sale_product', 'sale_custom', 'sale_topup'])
        .order('date', { ascending: false })
        .limit(100),
    ]);
    setProducts((pRes.data as Product[]) || []);
    setCustomers((cRes.data as Customer[]) || []);
    setAccounts((aRes.data as Account[]) || []);
    setHistory((tRes.data as Transaction[]) || []);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === formProduk.productId),
    [products, formProduk.productId]
  );

  const saveSale = async (payload: Omit<Transaction, 'id'>, stockDelta?: { productId: string; delta: number }) => {
    const { error } = await supabase.from('transactions').insert(payload);
    if (error) return toast.error('Gagal menyimpan penjualan: ' + error.message);
    await applyTransactionEffects(user!.id, payload as Transaction);
    if (stockDelta) await adjustProductStock(stockDelta.productId, stockDelta.delta);
    toast.success('Penjualan berhasil dicatat');
    load();
  };

  const handleSubmitProduk = async () => {
    if (!user) return toast.error('User not authenticated');
    const p = selectedProduct;
    if (!p || !formProduk.quantity) return toast.error('Harap isi semua field wajib');
    const price = formProduk.sellingPrice || p.selling_price || 0;
    const total = price * formProduk.quantity;
    const hpp = (p.hpp || 0) * formProduk.quantity;
    setSaving(true);
    let customerId: string | null = null;
    if (formProduk.customerName.trim()) customerId = await getOrCreateCustomer(user.id, formProduk.customerName);
    void customerId;
    await saveSale(
      {
        user_id: user.id,
        type: 'sale_product',
        amount: total,
        date: new Date().toISOString(),
        customer_name: formProduk.customerName || null,
        metadata: {
          productId: p.id,
          productName: p.name,
          quantity: formProduk.quantity,
          hpp,
          sellingPrice: price,
          totalPayment: total,
          profit: total - hpp,
          customerName: formProduk.customerName,
          paymentAccount: formProduk.paymentAccount,
        },
      },
      { productId: p.id, delta: -formProduk.quantity } // stok berkurang
    );
    setFormProduk(emptyProduk);
    setSaving(false);
  };

  const handleSubmitCustom = async (subType: 'custom' | 'bouquet') => {
    if (!user) return toast.error('User not authenticated');
    if (!formCustom.itemName || !formCustom.amount) return toast.error('Harap isi semua field wajib');
    setSaving(true);
    if (formCustom.customerName.trim()) await getOrCreateCustomer(user.id, formCustom.customerName);
    await saveSale({
      user_id: user.id,
      type: 'sale_custom',
      amount: formCustom.amount,
      date: new Date().toISOString(),
      customer_name: formCustom.customerName || null,
      metadata: {
        subType,
        sale_type: subType,
        productName: formCustom.itemName,
        hpp: formCustom.hpp,
        totalPayment: formCustom.amount,
        profit: formCustom.amount - (formCustom.hpp || 0),
        customerName: formCustom.customerName,
        paymentAccount: formCustom.paymentAccount,
      },
    });
    setFormCustom(emptyCustom);
    setSaving(false);
  };

  const handleSubmitTopup = async () => {
    if (!user) return toast.error('User not authenticated');
    if (!formTopup.sellPrice) return toast.error('Harap isi semua field wajib');
    setSaving(true);
    if (formTopup.customerName.trim()) await getOrCreateCustomer(user.id, formTopup.customerName);
    // Routing saldo: Cash → cash, Transfer → bank (atm). Profit = sellPrice − hpp.
    await saveSale({
      user_id: user.id,
      type: 'sale_topup',
      amount: formTopup.sellPrice,
      date: new Date().toISOString(),
      customer_name: formTopup.customerName || null,
      metadata: {
        hpp: formTopup.hpp,
        sellPrice: formTopup.sellPrice,
        profit: formTopup.sellPrice - (formTopup.hpp || 0),
        paymentMethod: formTopup.paymentMethod,
        customerName: formTopup.customerName,
        paymentAccount: formTopup.paymentMethod === 'Transfer' ? 'atm' : 'cash',
      },
    });
    setFormTopup(emptyTopup);
    setSaving(false);
  };

  const openEdit = (t: Transaction) => {
    setEditing(t);
    setEditForm({
      customerName: t.metadata?.customerName || t.customer_name || '',
      amount: Math.abs(Number(t.amount) || 0),
      quantity: Number(t.metadata?.quantity) || 1,
      paymentAccount: t.metadata?.paymentAccount || (t.metadata?.paymentMethod === 'Transfer' ? 'atm' : 'cash'),
      date: (t.date || '').slice(0, 10),
    });
  };

  const handleEditSave = async () => {
    if (!user || !editing) return;
    setSaving(true);
    // Aturan lintas-menu #3: fetch saldo/efek lama dari DB, reverse, baru terapkan yang baru
    const old = await fetchTransactionFresh(editing.id);
    if (old) {
      await reverseTransactionEffects(user.id, old);
      await reverseStockEffects(old);
    }
    const newTx: Transaction = {
      ...old!,
      amount: editForm.amount,
      date: new Date(editForm.date || todayISO()).toISOString(),
      customer_name: editForm.customerName || null,
      metadata: {
        ...old!.metadata,
        customerName: editForm.customerName,
        quantity: editForm.quantity,
        totalPayment: editForm.amount,
        sellPrice: old!.type === 'sale_topup' ? editForm.amount : old!.metadata?.sellPrice,
        paymentAccount: editForm.paymentAccount,
      },
    };
    const { error } = await supabase
      .from('transactions')
      .update({ amount: newTx.amount, date: newTx.date, customer_name: newTx.customer_name, metadata: newTx.metadata })
      .eq('id', editing.id);
    if (error) {
      setSaving(false);
      return toast.error('Gagal mengupdate: ' + error.message);
    }
    await applyTransactionEffects(user.id, newTx);
    await applyStockEffects(newTx);
    toast.success('Penjualan berhasil diupdate');
    setSaving(false);
    setEditing(null);
    load();
  };

  const handleDelete = async () => {
    if (!user || !deleteTarget) return;
    const old = await fetchTransactionFresh(deleteTarget.id);
    if (old) {
      await reverseTransactionEffects(user.id, old);
      await reverseStockEffects(old);
    }
    const { error } = await supabase.from('transactions').delete().eq('id', deleteTarget.id);
    if (error) toast.error('Gagal menghapus: ' + error.message);
    else toast.success('Penjualan dihapus');
    setDeleteTarget(null);
    load();
  };

  const tabs: { id: SaleTab; label: string }[] = [
    { id: 'produk', label: 'Produk' },
    { id: 'custom', label: 'Custom' },
    { id: 'bouquet', label: 'Bouquet' },
    { id: 'topup', label: 'Top Up / Pulsa' },
  ];

  const accountOptions = (
    <select
      className="input-base"
      value={tab === 'topup' ? undefined : tab === 'produk' ? formProduk.paymentAccount : formCustom.paymentAccount}
      onChange={(e) =>
        tab === 'produk'
          ? setFormProduk({ ...formProduk, paymentAccount: e.target.value })
          : setFormCustom({ ...formCustom, paymentAccount: e.target.value })
      }
      data-testid="sale-account-select"
    >
      {accounts.map((a) => (
        <option key={a.id} value={a.name}>
          {ACCOUNT_LABELS[a.name] || a.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-5" data-testid="sales-page">
      <div>
        <h1 className="font-brand text-3xl font-bold tracking-tight text-[#2e3b34] sm:text-4xl">Penjualan</h1>
        <p className="text-sm text-[#5c6f64]">Catat penjualan langsung (di luar pesanan)</p>
      </div>

      <div className="card p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-[#F2F7F4] p-1.5 sm:grid-cols-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-[44px] rounded-xl text-xs font-semibold transition-all duration-200 sm:text-sm ${
                tab === t.id ? 'bg-white text-[#2e3b34] shadow-sm' : 'text-[#5c6f64]'
              }`}
              data-testid={`sale-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {tab === 'produk' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label-base">Produk *</label>
                <SearchableSelect
                  options={products.map((p) => ({ value: p.id, label: p.name, hint: `stok ${p.stock}` }))}
                  value={formProduk.productId}
                  onChange={(v) => {
                    const p = products.find((x) => x.id === v);
                    setFormProduk({ ...formProduk, productId: v, sellingPrice: p?.selling_price || 0 });
                  }}
                  placeholder="Pilih produk…"
                  data-testid="sale-product-select"
                />
              </div>
              <div>
                <label className="label-base">Qty *</label>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input-base"
                  value={formProduk.quantity || ''}
                  onChange={(e) => setFormProduk({ ...formProduk, quantity: Number(e.target.value) || 0 })}
                  data-testid="sale-qty-input"
                />
                {selectedProduct && (
                  <div className="mt-1 text-xs text-[#5c6f64]">Stok tersedia: {selectedProduct.stock}</div>
                )}
              </div>
              <div>
                <label className="label-base">Harga Jual / pcs</label>
                <CurrencyInput
                  value={formProduk.sellingPrice}
                  onChange={(v) => setFormProduk({ ...formProduk, sellingPrice: v })}
                  data-testid="sale-price-input"
                />
              </div>
              <div>
                <label className="label-base">Customer</label>
                <CustomerCombobox
                  customers={customers}
                  value={formProduk.customerName}
                  onChange={(v) => setFormProduk({ ...formProduk, customerName: v })}
                  data-testid="sale-customer-input"
                />
              </div>
              <div>
                <label className="label-base">Terima Pembayaran Via</label>
                {accountOptions}
              </div>
              <div className="sm:col-span-2">
                <div className="mb-3 rounded-lg bg-[#F2F7F4] px-4 py-3 text-sm">
                  Total: <strong>{formatIDR((formProduk.sellingPrice || 0) * (formProduk.quantity || 0))}</strong>
                  {selectedProduct ? (
                    <span className="ml-3 text-[#5c6f64]">
                      Estimasi profit: {formatIDR(((formProduk.sellingPrice || 0) - (selectedProduct.hpp || 0)) * (formProduk.quantity || 0))}
                    </span>
                  ) : null}
                </div>
                <button onClick={handleSubmitProduk} disabled={saving} className="btn-primary w-full sm:w-auto" data-testid="sale-produk-submit">
                  Simpan Penjualan
                </button>
              </div>
            </div>
          )}

          {(tab === 'custom' || tab === 'bouquet') && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label-base">{tab === 'bouquet' ? 'Nama / Jenis Bouquet *' : 'Nama Item Custom *'}</label>
                <input
                  className="input-base"
                  value={formCustom.itemName}
                  onChange={(e) => setFormCustom({ ...formCustom, itemName: e.target.value })}
                  placeholder={tab === 'bouquet' ? 'Mis. Bouquet mawar merah' : 'Mis. Hampers custom'}
                  data-testid="sale-custom-name-input"
                />
              </div>
              <div>
                <label className="label-base">Harga Jual *</label>
                <CurrencyInput value={formCustom.amount} onChange={(v) => setFormCustom({ ...formCustom, amount: v })} data-testid="sale-custom-amount-input" />
              </div>
              <div>
                <label className="label-base">HPP (Modal)</label>
                <CurrencyInput value={formCustom.hpp} onChange={(v) => setFormCustom({ ...formCustom, hpp: v })} data-testid="sale-custom-hpp-input" />
              </div>
              <div>
                <label className="label-base">Customer</label>
                <CustomerCombobox
                  customers={customers}
                  value={formCustom.customerName}
                  onChange={(v) => setFormCustom({ ...formCustom, customerName: v })}
                  data-testid="sale-customer-input"
                />
              </div>
              <div>
                <label className="label-base">Terima Pembayaran Via</label>
                {accountOptions}
              </div>
              <div className="sm:col-span-2">
                <button
                  onClick={() => handleSubmitCustom(tab === 'bouquet' ? 'bouquet' : 'custom')}
                  disabled={saving}
                  className="btn-primary w-full sm:w-auto"
                  data-testid="sale-custom-submit"
                >
                  Simpan Penjualan
                </button>
              </div>
            </div>
          )}

          {tab === 'topup' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label-base">HPP (Modal) *</label>
                <CurrencyInput value={formTopup.hpp} onChange={(v) => setFormTopup({ ...formTopup, hpp: v })} data-testid="topup-hpp-input" />
              </div>
              <div>
                <label className="label-base">Harga Jual *</label>
                <CurrencyInput value={formTopup.sellPrice} onChange={(v) => setFormTopup({ ...formTopup, sellPrice: v })} data-testid="topup-sell-input" />
              </div>
              <div>
                <label className="label-base">Metode Pembayaran</label>
                <select
                  className="input-base"
                  value={formTopup.paymentMethod}
                  onChange={(e) => setFormTopup({ ...formTopup, paymentMethod: e.target.value })}
                  data-testid="topup-method-select"
                >
                  <option value="Cash">Cash (masuk akun Cash)</option>
                  <option value="Transfer">Transfer (masuk akun ATM/Bank)</option>
                </select>
              </div>
              <div>
                <label className="label-base">Customer</label>
                <CustomerCombobox
                  customers={customers}
                  value={formTopup.customerName}
                  onChange={(v) => setFormTopup({ ...formTopup, customerName: v })}
                  data-testid="sale-customer-input"
                />
              </div>
              <div className="sm:col-span-2">
                <div className="mb-3 rounded-lg bg-[#F2F7F4] px-4 py-3 text-sm">
                  Profit: <strong>{formatIDR((formTopup.sellPrice || 0) - (formTopup.hpp || 0))}</strong>
                </div>
                <button onClick={handleSubmitTopup} disabled={saving} className="btn-primary w-full sm:w-auto" data-testid="topup-submit">
                  Simpan Top Up
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Riwayat penjualan */}
      <div className="card overflow-hidden" data-testid="sales-history">
        <div className="border-b border-[#e2e8e4] px-4 py-3">
          <h2 className="font-brand text-xl font-semibold text-[#2e3b34]">Riwayat Penjualan</h2>
        </div>
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e2e8e4] bg-[#FAF8F3] text-left text-xs uppercase tracking-wide text-[#5c6f64]">
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Produk</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Harga</th>
                <th className="px-4 py-3 text-right">Profit</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {history.map((t) => {
                const cust = t.metadata?.customerName || t.customer_name || '-';
                return (
                  <tr key={t.id} className="border-b border-[#eef2ef] hover:bg-[#FAF8F3]" data-testid={`sale-row-${t.id}`}>
                    <td className="px-4 py-3">{formatDate(t.date)}</td>
                    <td className="px-4 py-3 font-medium">{cust}</td>
                    <td className="px-4 py-3">{t.metadata?.productName || (t.type === 'sale_topup' ? 'Top Up / Pulsa' : '-')}</td>
                    <td className="px-4 py-3 text-right">{t.metadata?.quantity || 1}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#2e7d32]">+ {formatIDR(Math.abs(t.amount))}</td>
                    <td className="px-4 py-3 text-right">{formatIDR(t.metadata?.profit || 0)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(t)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#6f8f7f] hover:bg-[#F2F7F4]" data-testid={`edit-sale-${t.id}`} aria-label="Edit">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => setDeleteTarget(t)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#c62828] hover:bg-[#ffebee]" data-testid={`delete-sale-${t.id}`} aria-label="Hapus">
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
                    Belum ada penjualan
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-[#eef2ef] md:hidden">
          {history.map((t) => (
            <div key={t.id} className="p-4" data-testid={`sale-card-${t.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-[#2e3b34]">
                    {t.metadata?.productName || (t.type === 'sale_topup' ? 'Top Up / Pulsa' : 'Penjualan')}
                  </div>
                  <div className="text-xs text-[#5c6f64]">
                    {t.metadata?.customerName || t.customer_name || '-'} • {formatDate(t.date)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-bold text-[#2e7d32]">+ {formatIDR(Math.abs(t.amount))}</div>
                  <div className="mt-1 flex justify-end gap-1">
                    <button onClick={() => openEdit(t)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#6f8f7f]" data-testid={`edit-sale-mobile-${t.id}`} aria-label="Edit">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => setDeleteTarget(t)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#c62828]" data-testid={`delete-sale-mobile-${t.id}`} aria-label="Hapus">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {!history.length && <div className="p-8 text-center text-sm text-[#5c6f64]">Belum ada penjualan</div>}
        </div>
      </div>

      {/* Modal edit */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Penjualan" data-testid="sale-edit-modal">
        <div className="space-y-4">
          <div>
            <label className="label-base">Customer</label>
            <CustomerCombobox customers={customers} value={editForm.customerName} onChange={(v) => setEditForm({ ...editForm, customerName: v })} data-testid="edit-sale-customer" />
          </div>
          <div>
            <label className="label-base">Nominal Total</label>
            <CurrencyInput value={editForm.amount} onChange={(v) => setEditForm({ ...editForm, amount: v })} data-testid="edit-sale-amount" />
          </div>
          {editing?.type === 'sale_product' && (
            <div>
              <label className="label-base">Qty</label>
              <input
                type="number"
                inputMode="numeric"
                className="input-base"
                value={editForm.quantity || ''}
                onChange={(e) => setEditForm({ ...editForm, quantity: Number(e.target.value) || 0 })}
                data-testid="edit-sale-qty"
              />
            </div>
          )}
          <div>
            <label className="label-base">Akun Penerima</label>
            <select
              className="input-base"
              value={editForm.paymentAccount}
              onChange={(e) => setEditForm({ ...editForm, paymentAccount: e.target.value })}
              data-testid="edit-sale-account"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.name}>
                  {ACCOUNT_LABELS[a.name] || a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-base">Tanggal</label>
            <input
              type="date"
              className="input-base"
              value={editForm.date}
              onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
              data-testid="edit-sale-date"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setEditing(null)} className="btn-secondary" data-testid="edit-sale-cancel">
            Batal
          </button>
          <button onClick={handleEditSave} disabled={saving} className="btn-primary" data-testid="edit-sale-save">
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Hapus Penjualan" data-testid="sale-delete-modal">
        <p className="text-sm text-[#2e3b34]">Hapus penjualan ini? Saldo akun dan stok (jika penjualan produk) akan dikembalikan.</p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary" data-testid="delete-sale-cancel">
            Batal
          </button>
          <button onClick={handleDelete} className="btn-danger" data-testid="delete-sale-confirm">
            Hapus
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Sales;
