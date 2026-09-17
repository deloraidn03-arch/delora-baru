import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Account, ACCOUNT_LABELS, ExpenseAccount, Transaction } from '../lib/types';
import { formatIDR, formatDate, todayISO } from '../lib/format';
import { Modal } from '../components/Modal';
import { CurrencyInput } from '../components/CurrencyInput';
import { SearchableSelect } from '../components/SearchableSelect';
import { adjustAccountBalance, fetchTransactionFresh, reverseTransactionEffects } from '../lib/balances';

const monthKey = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};

const Expenses: React.FC = () => {
  const { user } = useAuth();
  const [expenseAccounts, setExpenseAccounts] = useState<ExpenseAccount[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [period, setPeriod] = useState(monthKey());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [newAccountName, setNewAccountName] = useState('');
  const [form, setForm] = useState({ expenseAccount: '', amount: 0, sourceAccount: 'cash', description: '', date: todayISO() });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [y, m] = period.split('-').map(Number);
    const start = new Date(y, m - 1, 1).toISOString();
    const end = new Date(y, m, 1).toISOString();
    const [eaRes, accRes, txRes] = await Promise.all([
      supabase.from('expense_accounts').select('*').eq('user_id', user.id).order('name'),
      supabase.from('accounts').select('*').eq('user_id', user.id),
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'expense')
        .gte('date', start)
        .lt('date', end)
        .order('date', { ascending: false }),
    ]);
    setExpenseAccounts((eaRes.data as ExpenseAccount[]) || []);
    setAccounts((accRes.data as Account[]) || []);
    setRows((txRes.data as Transaction[]) || []);
  }, [user, period]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(
    () => ({ count: rows.length, total: rows.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0) }),
    [rows]
  );

  const addExpenseAccount = async () => {
    if (!user || !newAccountName.trim()) return;
    const { error } = await supabase.from('expense_accounts').insert({ user_id: user.id, name: newAccountName.trim() });
    if (error) return toast.error('Gagal menambah akun biaya: ' + error.message);
    setForm((f) => ({ ...f, expenseAccount: newAccountName.trim() }));
    setNewAccountName('');
    load();
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ expenseAccount: expenseAccounts[0]?.name || '', amount: 0, sourceAccount: 'cash', description: '', date: todayISO() });
    setModalOpen(true);
  };

  const openEdit = (t: Transaction) => {
    setEditing(t);
    setForm({
      expenseAccount: t.metadata?.expenseAccount || '',
      amount: Math.abs(Number(t.amount) || 0),
      sourceAccount: t.metadata?.sourceAccount || t.metadata?.paymentAccount || 'cash',
      description: t.metadata?.description || '',
      date: (t.date || '').slice(0, 10),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!user) return toast.error('User not authenticated');
    if (!form.expenseAccount || !form.amount) return toast.error('Harap isi semua field wajib');
    setSaving(true);
    if (editing) {
      // Aturan lintas-menu #3: reverse saldo lama dari DB dulu
      const old = await fetchTransactionFresh(editing.id);
      if (old) await reverseTransactionEffects(user.id, old);
      const { error } = await supabase
        .from('transactions')
        .update({
          amount: -Math.abs(form.amount),
          date: new Date(form.date).toISOString(),
          metadata: { expenseAccount: form.expenseAccount, description: form.description, sourceAccount: form.sourceAccount, paymentAccount: form.sourceAccount },
        })
        .eq('id', editing.id);
      if (error) {
        setSaving(false);
        return toast.error('Gagal mengupdate biaya: ' + error.message);
      }
      await adjustAccountBalance(user.id, form.sourceAccount, -Math.abs(form.amount));
      toast.success('Biaya berhasil diupdate');
    } else {
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        type: 'expense',
        amount: -Math.abs(form.amount),
        date: new Date(form.date).toISOString(),
        metadata: { expenseAccount: form.expenseAccount, description: form.description, sourceAccount: form.sourceAccount, paymentAccount: form.sourceAccount },
      });
      if (error) {
        setSaving(false);
        return toast.error('Gagal menyimpan biaya: ' + error.message);
      }
      await adjustAccountBalance(user.id, form.sourceAccount, -Math.abs(form.amount));
      toast.success('Biaya berhasil dicatat');
    }
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!user || !deleteTarget) return;
    const old = await fetchTransactionFresh(deleteTarget.id);
    if (old) await reverseTransactionEffects(user.id, old);
    const { error } = await supabase.from('transactions').delete().eq('id', deleteTarget.id);
    if (error) toast.error('Gagal menghapus: ' + error.message);
    else toast.success('Biaya dihapus');
    setDeleteTarget(null);
    load();
  };

  return (
    <div className="space-y-5" data-testid="expenses-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-brand text-3xl font-bold text-[#2e3b34]">Biaya</h1>
          <p className="text-sm text-[#5c6f64]">Pengeluaran operasional non-produksi</p>
        </div>
        <div className="flex gap-2">
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value || monthKey())}
            className="input-base w-40"
            data-testid="expense-period-filter"
          />
          <button onClick={openAdd} className="btn-primary" data-testid="add-expense-button">
            <Plus size={18} /> Tambah Biaya
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5" data-testid="expense-summary-count">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">Total Transaksi</div>
          <div className="mt-1 text-2xl font-bold text-[#2e3b34]">{summary.count}</div>
        </div>
        <div className="card p-5" data-testid="expense-summary-total">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">Total Nominal</div>
          <div className="mt-1 text-2xl font-bold text-[#c62828]">{formatIDR(summary.total)}</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e2e8e4] bg-[#f6f8f6] text-left text-xs uppercase tracking-wide text-[#5c6f64]">
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Akun Biaya</th>
                <th className="px-4 py-3">Deskripsi</th>
                <th className="px-4 py-3">Sumber Dana</th>
                <th className="px-4 py-3 text-right">Nominal</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-[#eef2ef] hover:bg-[#f6f8f6]" data-testid={`expense-row-${t.id}`}>
                  <td className="px-4 py-3">{formatDate(t.date)}</td>
                  <td className="px-4 py-3 font-medium">{t.metadata?.expenseAccount}</td>
                  <td className="px-4 py-3 text-[#5c6f64]">{t.metadata?.description || '-'}</td>
                  <td className="px-4 py-3">{ACCOUNT_LABELS[t.metadata?.sourceAccount] || t.metadata?.sourceAccount}</td>
                  <td className="px-4 py-3 text-right font-bold text-[#c62828]">− {formatIDR(Math.abs(t.amount))}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(t)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#6f8f7f] hover:bg-[#edf3f0]" data-testid={`edit-expense-${t.id}`} aria-label="Edit">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => setDeleteTarget(t)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#c62828] hover:bg-[#ffebee]" data-testid={`delete-expense-${t.id}`} aria-label="Hapus">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#5c6f64]">
                    Belum ada biaya periode ini
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-[#eef2ef] md:hidden">
          {rows.map((t) => (
            <div key={t.id} className="p-4" data-testid={`expense-card-${t.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-[#2e3b34]">{t.metadata?.expenseAccount}</div>
                  <div className="text-xs text-[#5c6f64]">
                    {formatDate(t.date)} • {ACCOUNT_LABELS[t.metadata?.sourceAccount] || t.metadata?.sourceAccount}
                  </div>
                  {t.metadata?.description && <div className="mt-1 text-xs text-[#93a298]">{t.metadata.description}</div>}
                </div>
                <div className="text-right">
                  <div className="font-bold text-[#c62828]">− {formatIDR(Math.abs(t.amount))}</div>
                  <div className="mt-1 flex justify-end gap-1">
                    <button onClick={() => openEdit(t)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#6f8f7f]" data-testid={`edit-expense-mobile-${t.id}`} aria-label="Edit">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => setDeleteTarget(t)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#c62828]" data-testid={`delete-expense-mobile-${t.id}`} aria-label="Hapus">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {!rows.length && <div className="p-8 text-center text-sm text-[#5c6f64]">Belum ada biaya periode ini</div>}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Biaya' : 'Tambah Biaya'} data-testid="expense-modal">
        <div className="space-y-4">
          <div>
            <label className="label-base">Akun Biaya *</label>
            <SearchableSelect
              options={expenseAccounts.map((a) => ({ value: a.name, label: a.name }))}
              value={form.expenseAccount}
              onChange={(v) => setForm({ ...form, expenseAccount: v })}
              placeholder="Pilih akun biaya…"
              data-testid="expense-account-select"
            />
            <div className="mt-2 flex gap-2">
              <input
                className="input-base"
                placeholder="Akun biaya baru (mis. Listrik, Gaji, Sewa)"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                data-testid="new-expense-account-input"
              />
              <button type="button" onClick={addExpenseAccount} className="btn-secondary shrink-0" data-testid="add-expense-account-button">
                <Plus size={16} /> Akun
              </button>
            </div>
          </div>
          <div>
            <label className="label-base">Nominal *</label>
            <CurrencyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} data-testid="expense-amount-input" />
          </div>
          <div>
            <label className="label-base">Sumber Dana</label>
            <select
              className="input-base"
              value={form.sourceAccount}
              onChange={(e) => setForm({ ...form, sourceAccount: e.target.value })}
              data-testid="expense-source-select"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.name}>
                  {ACCOUNT_LABELS[a.name] || a.name} — {formatIDR(a.balance)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-base">Deskripsi</label>
            <input
              className="input-base"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Keterangan biaya"
              data-testid="expense-description-input"
            />
          </div>
          <div>
            <label className="label-base">Tanggal</label>
            <input
              type="date"
              className="input-base"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              data-testid="expense-date-input"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setModalOpen(false)} className="btn-secondary" data-testid="expense-cancel-button">
            Batal
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary" data-testid="expense-save-button">
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Hapus Biaya" data-testid="expense-delete-modal">
        <p className="text-sm text-[#2e3b34]">Hapus biaya ini? Saldo akun sumber dana akan dikembalikan.</p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary" data-testid="expense-delete-cancel">
            Batal
          </button>
          <button onClick={handleDelete} className="btn-danger" data-testid="expense-delete-confirm">
            Hapus
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Expenses;
