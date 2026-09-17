import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Account, ACCOUNT_LABELS, Transaction } from '../lib/types';
import { formatIDR, formatDate } from '../lib/format';
import { CurrencyInput } from '../components/CurrencyInput';
import { adjustAccountBalance } from '../lib/balances';

const CashBank: React.FC = () => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transfers, setTransfers] = useState<Transaction[]>([]);
  const [transferForm, setTransferForm] = useState({ from: 'cash', to: 'atm', amount: 0 });
  const [investForm, setInvestForm] = useState({ account: 'cash', amount: 0, note: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [aRes, tRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id),
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .in('type', ['transfer', 'investment'])
        .order('date', { ascending: false })
        .limit(20),
    ]);
    setAccounts((aRes.data as Account[]) || []);
    setTransfers((tRes.data as Transaction[]) || []);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleTransfer = async () => {
    if (!user) return toast.error('User not authenticated');
    if (!transferForm.amount || transferForm.from === transferForm.to)
      return toast.error('Harap isi nominal dan pilih akun berbeda');
    setSaving(true);
    // Transaksi transfer: amount 0 — tidak memengaruhi laba, dikecualikan dari semua metrik
    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'transfer',
      amount: 0,
      date: new Date().toISOString(),
      metadata: {
        fromAccount: transferForm.from,
        toAccount: transferForm.to,
        transferAmount: transferForm.amount,
      },
    });
    if (error) {
      setSaving(false);
      return toast.error('Gagal transfer: ' + error.message);
    }
    await adjustAccountBalance(user.id, transferForm.from, -transferForm.amount);
    await adjustAccountBalance(user.id, transferForm.to, transferForm.amount);
    setSaving(false);
    toast.success('Transfer berhasil');
    setTransferForm({ ...transferForm, amount: 0 });
    load();
  };

  const handleInvest = async () => {
    if (!user) return toast.error('User not authenticated');
    if (!investForm.amount) return toast.error('Harap isi nominal');
    setSaving(true);
    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'investment',
      amount: Math.abs(investForm.amount),
      date: new Date().toISOString(),
      metadata: { paymentAccount: investForm.account, description: investForm.note || 'Modal masuk' },
    });
    if (error) {
      setSaving(false);
      return toast.error('Gagal mencatat modal: ' + error.message);
    }
    await adjustAccountBalance(user.id, investForm.account, Math.abs(investForm.amount));
    setSaving(false);
    toast.success('Modal masuk dicatat');
    setInvestForm({ account: 'cash', amount: 0, note: '' });
    load();
  };

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
    <div className="space-y-5" data-testid="cashbank-page">
      <div>
        <h1 className="font-brand text-3xl font-bold text-[#2e3b34]">Kas &amp; Bank</h1>
        <p className="text-sm text-[#5c6f64]">Saldo akun, transfer antar akun, dan modal masuk</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {['cash', 'atm', 'tabungan', 'brilink_cash', 'brilink_bank'].map((name) => {
          const acc = accounts.find((a) => a.name === name);
          return (
            <div key={name} className="card p-4" data-testid={`cashbank-${name}`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">
                {ACCOUNT_LABELS[name]}
              </div>
              <div className="mt-1 text-lg font-bold text-[#2e3b34]">{formatIDR(acc?.balance || 0)}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Transfer antar akun */}
        <div className="card p-5" data-testid="transfer-card">
          <h2 className="flex items-center gap-2 font-brand text-xl font-semibold text-[#2e3b34]">
            <ArrowLeftRight size={18} /> Transfer Antar Akun
          </h2>
          <p className="mb-4 mt-1 text-xs text-[#93a298]">
            Transfer dicatat dengan amount 0 — tidak memengaruhi laba, dikecualikan dari semua metrik.
          </p>
          <div className="space-y-4">
            <div>
              <label className="label-base">Dari Akun</label>
              {accountSelect(transferForm.from, (v) => setTransferForm({ ...transferForm, from: v }), 'transfer-from-select')}
            </div>
            <div>
              <label className="label-base">Ke Akun</label>
              {accountSelect(transferForm.to, (v) => setTransferForm({ ...transferForm, to: v }), 'transfer-to-select')}
            </div>
            <div>
              <label className="label-base">Nominal</label>
              <CurrencyInput value={transferForm.amount} onChange={(v) => setTransferForm({ ...transferForm, amount: v })} data-testid="transfer-amount-input" />
            </div>
            <button onClick={handleTransfer} disabled={saving} className="btn-primary w-full" data-testid="transfer-submit">
              Transfer
            </button>
          </div>
        </div>

        {/* Modal masuk */}
        <div className="card p-5" data-testid="investment-card">
          <h2 className="flex items-center gap-2 font-brand text-xl font-semibold text-[#2e3b34]">
            <PlusCircle size={18} /> Modal Masuk
          </h2>
          <p className="mb-4 mt-1 text-xs text-[#93a298]">Menambah saldo akun sebagai pemasukan investasi/modal.</p>
          <div className="space-y-4">
            <div>
              <label className="label-base">Ke Akun</label>
              {accountSelect(investForm.account, (v) => setInvestForm({ ...investForm, account: v }), 'investment-account-select')}
            </div>
            <div>
              <label className="label-base">Nominal</label>
              <CurrencyInput value={investForm.amount} onChange={(v) => setInvestForm({ ...investForm, amount: v })} data-testid="investment-amount-input" />
            </div>
            <div>
              <label className="label-base">Catatan</label>
              <input
                className="input-base"
                value={investForm.note}
                onChange={(e) => setInvestForm({ ...investForm, note: e.target.value })}
                placeholder="Mis. Setoran modal awal"
                data-testid="investment-note-input"
              />
            </div>
            <button onClick={handleInvest} disabled={saving} className="btn-primary w-full" data-testid="investment-submit">
              Catat Modal Masuk
            </button>
          </div>
        </div>
      </div>

      <div className="card p-5" data-testid="transfer-history">
        <h2 className="font-brand text-xl font-semibold text-[#2e3b34]">Riwayat Transfer &amp; Modal</h2>
        <div className="mt-3 divide-y divide-[#eef2ef]">
          {transfers.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 py-3" data-testid={`transfer-row-${t.id}`}>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-[#2e3b34]">
                  {t.type === 'transfer'
                    ? `Transfer ${ACCOUNT_LABELS[t.metadata?.fromAccount] || ''} → ${ACCOUNT_LABELS[t.metadata?.toAccount] || ''}`
                    : `Modal masuk ke ${ACCOUNT_LABELS[t.metadata?.paymentAccount] || ''}`}
                </div>
                <div className="text-xs text-[#93a298]">{formatDate(t.date)}</div>
              </div>
              <div className="shrink-0 text-sm font-bold text-[#5c6f64]">
                {formatIDR(t.type === 'transfer' ? t.metadata?.transferAmount || 0 : t.amount)}
              </div>
            </div>
          ))}
          {!transfers.length && <div className="py-6 text-center text-sm text-[#5c6f64]">Belum ada riwayat</div>}
        </div>
      </div>
    </div>
  );
};

export default CashBank;
