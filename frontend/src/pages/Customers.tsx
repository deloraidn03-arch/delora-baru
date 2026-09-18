import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Customer } from '../lib/types';
import { Modal } from '../components/Modal';

const emptyForm = { name: '', whatsapp_number: '', address: '', notes: '' };

const Customers: React.FC = () => {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('customers').select('*').eq('user_id', user.id).order('name');
    setCustomers((data as Customer[]) || []);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ name: c.name, whatsapp_number: c.whatsapp_number || '', address: c.address || '', notes: c.notes || '' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!user) return toast.error('User not authenticated');
    if (!form.name.trim()) return toast.error('Harap isi semua field wajib');
    setSaving(true);
    const payload = { ...form, name: form.name.trim(), user_id: user.id };
    const { error } = editing
      ? await supabase.from('customers').update(payload).eq('id', editing.id)
      : await supabase.from('customers').insert(payload);
    setSaving(false);
    if (error) return toast.error('Gagal menyimpan customer: ' + error.message);
    toast.success(editing ? 'Customer berhasil diupdate' : 'Customer berhasil ditambahkan');
    setModalOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('customers').delete().eq('id', deleteTarget.id);
    if (error) toast.error('Gagal menghapus: ' + error.message);
    else toast.success('Customer dihapus');
    setDeleteTarget(null);
    load();
  };

  return (
    <div className="space-y-5" data-testid="customers-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-brand text-3xl font-bold tracking-tight text-[#2e3b34] sm:text-4xl">Customer</h1>
          <p className="text-sm text-[#5c6f64]">Basis data pelanggan — dipakai lintas menu (Penjualan &amp; Pesanan)</p>
        </div>
        <button onClick={openAdd} className="btn-primary" data-testid="add-customer-button">
          <Plus size={18} /> Tambah Customer
        </button>
      </div>

      <input
        className="input-base sm:max-w-xs"
        placeholder="Cari customer…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        data-testid="customer-search-input"
      />

      <div className="card hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e2e8e4] bg-[#f6f8f6] text-left text-xs uppercase tracking-wide text-[#5c6f64]">
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">WhatsApp</th>
              <th className="px-4 py-3">Alamat</th>
              <th className="px-4 py-3">Catatan</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-[#eef2ef] hover:bg-[#f6f8f6]" data-testid={`customer-row-${c.id}`}>
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3">
                  {c.whatsapp_number ? (
                    <a
                      href={`https://wa.me/${c.whatsapp_number.replace(/[^\d]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[#2e7d32] hover:underline"
                      data-testid={`customer-wa-${c.id}`}
                    >
                      <MessageCircle size={14} /> {c.whatsapp_number}
                    </a>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-4 py-3 text-[#5c6f64]">{c.address || '-'}</td>
                <td className="px-4 py-3 text-[#5c6f64]">{c.notes || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openEdit(c)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#6f8f7f] hover:bg-[#edf3f0]" data-testid={`edit-customer-${c.id}`} aria-label="Edit">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => setDeleteTarget(c)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#c62828] hover:bg-[#ffebee]" data-testid={`delete-customer-${c.id}`} aria-label="Hapus">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[#5c6f64]">
                  Belum ada customer
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {filtered.map((c) => (
          <div key={c.id} className="card p-4" data-testid={`customer-card-${c.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-[#2e3b34]">{c.name}</div>
                {c.whatsapp_number && <div className="text-xs text-[#5c6f64]">{c.whatsapp_number}</div>}
                {c.address && <div className="mt-0.5 text-xs text-[#5c6f64]">{c.address}</div>}
                {c.notes && <div className="mt-1 text-xs text-[#93a298]">{c.notes}</div>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(c)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#6f8f7f]" data-testid={`edit-customer-mobile-${c.id}`} aria-label="Edit">
                  <Pencil size={16} />
                </button>
                <button onClick={() => setDeleteTarget(c)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#c62828]" data-testid={`delete-customer-mobile-${c.id}`} aria-label="Hapus">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
        {!filtered.length && <div className="card p-8 text-center text-sm text-[#5c6f64]">Belum ada customer</div>}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Customer' : 'Tambah Customer'} data-testid="customer-modal">
        <div className="space-y-4">
          <div>
            <label className="label-base">Nama *</label>
            <input
              className="input-base"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              data-testid="customer-name-input"
            />
          </div>
          <div>
            <label className="label-base">Nomor WhatsApp</label>
            <input
              type="tel"
              inputMode="tel"
              className="input-base"
              placeholder="08xxxxxxxxxx"
              value={form.whatsapp_number}
              onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
              data-testid="customer-wa-input"
            />
          </div>
          <div>
            <label className="label-base">Alamat</label>
            <textarea
              className="input-base h-20 resize-none py-2"
              placeholder="Alamat lengkap customer"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              data-testid="customer-address-input"
            />
          </div>
          <div>
            <label className="label-base">Catatan</label>
            <textarea
              className="input-base h-20 resize-none py-2"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              data-testid="customer-notes-input"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setModalOpen(false)} className="btn-secondary" data-testid="customer-cancel-button">
            Batal
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary" data-testid="customer-save-button">
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Hapus Customer" data-testid="customer-delete-modal">
        <p className="text-sm text-[#2e3b34]">
          Hapus customer <strong>{deleteTarget?.name}</strong>?
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary" data-testid="customer-delete-cancel">
            Batal
          </button>
          <button onClick={handleDelete} className="btn-danger" data-testid="customer-delete-confirm">
            Hapus
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Customers;
