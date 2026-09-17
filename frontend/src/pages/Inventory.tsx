import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Product, ProductComponent } from '../lib/types';
import { formatIDR } from '../lib/format';
import { Modal } from '../components/Modal';
import { CurrencyInput } from '../components/CurrencyInput';
import { SearchableSelect } from '../components/SearchableSelect';

const emptyForm = {
  name: '',
  type: 'single' as 'single' | 'custom',
  hpp: 0,
  selling_price: 0,
  stock: 0,
  min_stock: 0,
  deskripsi: '',
  items: [] as ProductComponent[],
};

const Inventory: React.FC = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [sortBy, setSortBy] = useState('low');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('products').select('*').eq('user_id', user.id).order('name');
    setProducts((data as Product[]) || []);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => {
    let rows = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    const low = (p: Product) => Number(p.stock) <= Number(p.min_stock);
    switch (sortBy) {
      case 'low':
        rows = [...rows].sort((a, b) => Number(low(b)) - Number(low(a)) || a.name.localeCompare(b.name));
        break;
      case 'stock-asc':
        rows = [...rows].sort((a, b) => a.stock - b.stock);
        break;
      case 'stock-desc':
        rows = [...rows].sort((a, b) => b.stock - a.stock);
        break;
      case 'name-desc':
        rows = [...rows].sort((a, b) => b.name.localeCompare(a.name));
        break;
      default:
        rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    }
    return rows;
  }, [products, sortBy, search]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      type: p.type,
      hpp: p.hpp || 0,
      selling_price: p.selling_price || 0,
      stock: p.stock || 0,
      min_stock: p.min_stock || 0,
      deskripsi: p.deskripsi || '',
      items: (p.items as ProductComponent[]) || [],
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!user) return toast.error('User not authenticated');
    if (!form.name.trim()) return toast.error('Harap isi semua field wajib');
    setSaving(true);
    const payload = { ...form, name: form.name.trim(), user_id: user.id };
    const { error } = editing
      ? await supabase.from('products').update(payload).eq('id', editing.id)
      : await supabase.from('products').insert(payload);
    setSaving(false);
    if (error) return toast.error('Gagal menyimpan produk: ' + error.message);
    toast.success(editing ? 'Produk berhasil diupdate' : 'Produk berhasil ditambahkan');
    setModalOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('products').delete().eq('id', deleteTarget.id);
    if (error) toast.error('Gagal menghapus: ' + error.message);
    else toast.success('Produk dihapus');
    setDeleteTarget(null);
    load();
  };

  const lowCount = products.filter((p) => Number(p.stock) <= Number(p.min_stock)).length;

  return (
    <div className="space-y-5" data-testid="inventory-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-brand text-3xl font-bold text-[#2e3b34]">Inventory</h1>
          <p className="text-sm text-[#5c6f64]">Stok produk jadi &amp; bahan baku</p>
        </div>
        <button onClick={openAdd} className="btn-primary" data-testid="add-product-button">
          <Plus size={18} /> Tambah Produk
        </button>
      </div>

      {lowCount > 0 && (
        <div
          className="flex items-center gap-3 rounded-lg border border-[#ffcdd2] bg-[#ffebee] px-4 py-3 text-sm font-medium text-[#c62828]"
          data-testid="low-stock-banner"
        >
          <AlertTriangle size={18} />
          {lowCount} produk berada di bawah stok minimum — segera restock.
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          className="input-base sm:max-w-xs"
          placeholder="Cari produk…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="inventory-search-input"
        />
        <select
          className="input-base sm:max-w-xs"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          data-testid="inventory-sort-select"
        >
          <option value="low">Stok rendah dulu ⚠️</option>
          <option value="stock-asc">Stok: sedikit → banyak</option>
          <option value="stock-desc">Stok: banyak → sedikit</option>
          <option value="name-asc">Nama A–Z</option>
          <option value="name-desc">Nama Z–A</option>
        </select>
      </div>

      {/* Tabel desktop */}
      <div className="card hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e2e8e4] bg-[#f6f8f6] text-left text-xs uppercase tracking-wide text-[#5c6f64]">
              <th className="px-4 py-3">Produk</th>
              <th className="px-4 py-3">Tipe</th>
              <th className="px-4 py-3 text-right">HPP</th>
              <th className="px-4 py-3 text-right">Harga Jual</th>
              <th className="px-4 py-3 text-right">Stok</th>
              <th className="px-4 py-3 text-right">Min. Stok</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const isLow = Number(p.stock) <= Number(p.min_stock);
              return (
                <tr
                  key={p.id}
                  className={`border-b border-[#eef2ef] ${isLow ? 'bg-[#ffebee]' : 'hover:bg-[#f6f8f6]'}`}
                  data-testid={`inventory-row-${p.id}`}
                >
                  <td className="px-4 py-3 font-medium">
                    {p.name} {isLow && <span title="Stok di bawah minimum">⚠️</span>}
                    {p.type === 'custom' && Array.isArray(p.items) && p.items.length > 0 && (
                      <div className="text-xs font-normal text-[#93a298]">
                        {p.items.length} komponen
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[#edf3f0] px-2 py-0.5 text-xs font-semibold text-[#6f8f7f]">
                      {p.type === 'custom' ? 'Custom' : 'Single'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{formatIDR(p.hpp)}</td>
                  <td className="px-4 py-3 text-right">{formatIDR(p.selling_price)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${isLow ? 'text-[#c62828]' : ''}`}>{p.stock}</td>
                  <td className="px-4 py-3 text-right">{p.min_stock}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openEdit(p)}
                        className="flex h-11 w-11 items-center justify-center rounded-lg text-[#6f8f7f] hover:bg-[#edf3f0]"
                        data-testid={`edit-product-${p.id}`}
                        aria-label="Edit"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="flex h-11 w-11 items-center justify-center rounded-lg text-[#c62828] hover:bg-[#ffebee]"
                        data-testid={`delete-product-${p.id}`}
                        aria-label="Hapus"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!sorted.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[#5c6f64]">
                  Belum ada produk
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Card list mobile */}
      <div className="space-y-3 md:hidden">
        {sorted.map((p) => {
          const isLow = Number(p.stock) <= Number(p.min_stock);
          return (
            <div
              key={p.id}
              className={`card p-4 ${isLow ? 'border-[#ffcdd2] bg-[#ffebee]' : ''}`}
              data-testid={`inventory-card-${p.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-[#2e3b34]">
                    {p.name} {isLow && '⚠️'}
                  </div>
                  <div className="text-xs text-[#5c6f64]">{p.type === 'custom' ? 'Custom' : 'Single'}</div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(p)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-[#6f8f7f] hover:bg-white"
                    data-testid={`edit-product-mobile-${p.id}`}
                    aria-label="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(p)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-[#c62828] hover:bg-white"
                    data-testid={`delete-product-mobile-${p.id}`}
                    aria-label="Hapus"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-white/70 p-2">
                  <div className="text-[#5c6f64]">Stok</div>
                  <div className={`text-base font-bold ${isLow ? 'text-[#c62828]' : 'text-[#2e3b34]'}`}>{p.stock}</div>
                </div>
                <div className="rounded-lg bg-white/70 p-2">
                  <div className="text-[#5c6f64]">HPP</div>
                  <div className="font-bold text-[#2e3b34]">{formatIDR(p.hpp)}</div>
                </div>
                <div className="rounded-lg bg-white/70 p-2">
                  <div className="text-[#5c6f64]">Jual</div>
                  <div className="font-bold text-[#2e3b34]">{formatIDR(p.selling_price)}</div>
                </div>
              </div>
            </div>
          );
        })}
        {!sorted.length && <div className="card p-8 text-center text-sm text-[#5c6f64]">Belum ada produk</div>}
      </div>

      {/* Modal tambah/edit */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Produk' : 'Tambah Produk'} wide data-testid="product-modal">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label-base">Nama Produk *</label>
            <input
              className="input-base"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Mis. Wrapping Paper"
              data-testid="product-name-input"
            />
          </div>
          <div>
            <label className="label-base">Tipe</label>
            <select
              className="input-base"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as 'single' | 'custom' })}
              data-testid="product-type-select"
            >
              <option value="single">Single (produk/bahan satuan)</option>
              <option value="custom">Custom (komposit, punya komponen)</option>
            </select>
          </div>
          <div>
            <label className="label-base">Stok</label>
            <input
              type="number"
              inputMode="numeric"
              className="input-base"
              value={form.stock || ''}
              onChange={(e) => setForm({ ...form, stock: Number(e.target.value) || 0 })}
              data-testid="product-stock-input"
            />
          </div>
          <div>
            <label className="label-base">HPP (Modal)</label>
            <CurrencyInput value={form.hpp} onChange={(v) => setForm({ ...form, hpp: v })} data-testid="product-hpp-input" />
          </div>
          <div>
            <label className="label-base">Harga Jual</label>
            <CurrencyInput
              value={form.selling_price}
              onChange={(v) => setForm({ ...form, selling_price: v })}
              data-testid="product-price-input"
            />
          </div>
          <div>
            <label className="label-base">Stok Minimum</label>
            <input
              type="number"
              inputMode="numeric"
              className="input-base"
              value={form.min_stock || ''}
              onChange={(e) => setForm({ ...form, min_stock: Number(e.target.value) || 0 })}
              data-testid="product-min-stock-input"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label-base">Deskripsi</label>
            <textarea
              className="input-base h-20 resize-none py-2"
              value={form.deskripsi}
              onChange={(e) => setForm({ ...form, deskripsi: e.target.value })}
              data-testid="product-description-input"
            />
          </div>

          {form.type === 'custom' && (
            <div className="sm:col-span-2">
              <label className="label-base">Komponen Produk Custom</label>
              <div className="space-y-2">
                {form.items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex-1 rounded-lg border border-[#dfe7e1] bg-[#f6f8f6] px-3 py-2 text-sm">
                      {it.productName}
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="input-base w-20"
                      value={it.quantity || ''}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[idx] = { ...it, quantity: Number(e.target.value) || 0 };
                        setForm({ ...form, items });
                      }}
                      data-testid={`component-qty-${idx}`}
                    />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-[#c62828] hover:bg-[#ffebee]"
                      data-testid={`component-remove-${idx}`}
                      aria-label="Hapus komponen"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <SearchableSelect
                  options={products
                    .filter((p) => p.id !== editing?.id && !form.items.some((i) => i.productId === p.id))
                    .map((p) => ({ value: p.id, label: p.name, hint: `stok ${p.stock}` }))}
                  value=""
                  onChange={(v, label) =>
                    setForm({
                      ...form,
                      items: [...form.items, { productId: v, productName: label || '', quantity: 1 }],
                    })
                  }
                  placeholder="+ Tambah komponen…"
                  data-testid="component-add-select"
                />
              </div>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setModalOpen(false)} className="btn-secondary" data-testid="product-cancel-button">
            Batal
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary" data-testid="product-save-button">
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </Modal>

      {/* Konfirmasi hapus */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Hapus Produk" data-testid="product-delete-modal">
        <p className="text-sm text-[#2e3b34]">
          Hapus produk <strong>{deleteTarget?.name}</strong>? Tindakan ini tidak bisa dibatalkan.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary" data-testid="product-delete-cancel">
            Batal
          </button>
          <button onClick={handleDelete} className="btn-danger" data-testid="product-delete-confirm">
            Hapus
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Inventory;
