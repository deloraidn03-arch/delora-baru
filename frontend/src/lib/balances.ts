import { supabase } from './supabase';
import { Transaction } from './types';

// Saldo akun dikelola manual oleh kode aplikasi (prinsip akuntansi inti #3).
// Selalu fetch saldo terbaru dari DB sebelum menyesuaikan.
export async function adjustAccountBalance(userId: string, accountName: string, delta: number): Promise<void> {
  if (!accountName || !delta) return;
  const { data, error } = await supabase
    .from('accounts')
    .select('id, balance')
    .eq('user_id', userId)
    .eq('name', accountName)
    .maybeSingle();
  if (error || !data) return;
  await supabase
    .from('accounts')
    .update({ balance: (Number(data.balance) || 0) + delta })
    .eq('id', data.id);
}

export interface BalanceEffect {
  account: string;
  delta: number;
}

// Efek saldo dari sebuah transaksi
export function transactionEffects(tx: Transaction): BalanceEffect[] {
  const m = tx.metadata || {};
  const amt = Math.abs(Number(tx.amount) || 0);
  switch (tx.type) {
    case 'sale_product':
    case 'sale_custom':
      return [{ account: m.paymentAccount || 'cash', delta: amt }];
    case 'sale_topup':
      return [{ account: m.paymentMethod === 'Transfer' ? 'atm' : 'cash', delta: Number(m.sellPrice ?? amt) }];
    case 'purchase_material':
    case 'purchase_custom':
    case 'expense':
      return [{ account: m.paymentAccount || m.sourceAccount || 'cash', delta: -amt }];
    case 'transfer': {
      const tAmt = Number(m.transferAmount) || 0;
      return [
        { account: m.fromAccount, delta: -tAmt },
        { account: m.toAccount, delta: tAmt },
      ];
    }
    case 'investment':
    case 'brilink_capital':
      return [{ account: m.paymentAccount || m.account || 'cash', delta: amt }];
    case 'brilink':
      return [{ account: m.paymentMethod === 'Transfer' ? 'brilink_bank' : 'brilink_cash', delta: amt }];
    default:
      return [];
  }
}

export async function applyTransactionEffects(userId: string, tx: Transaction): Promise<void> {
  for (const e of transactionEffects(tx)) {
    await adjustAccountBalance(userId, e.account, e.delta);
  }
}

// Edit/hapus: reverse saldo lama dari DB terlebih dahulu (aturan lintas-menu #3)
export async function reverseTransactionEffects(userId: string, tx: Transaction): Promise<void> {
  for (const e of transactionEffects(tx)) {
    await adjustAccountBalance(userId, e.account, -e.delta);
  }
}

export interface StockEffect {
  productId: string;
  delta: number;
}

export function stockEffects(tx: Transaction): StockEffect[] {
  const m = tx.metadata || {};
  if (tx.type === 'sale_product' && m.productId) {
    return [{ productId: m.productId, delta: -(Number(m.quantity) || 0) }];
  }
  // purchase_material menambah stok — kecuali pembelian aset (tidak menyentuh inventory)
  if (tx.type === 'purchase_material' && m.productId && m.is_asset !== true && m.is_asset !== 'true') {
    return [{ productId: m.productId, delta: Number(m.quantity) || 0 }];
  }
  return [];
}

export async function adjustProductStock(productId: string, delta: number): Promise<void> {
  if (!productId || !delta) return;
  const { data } = await supabase.from('products').select('id, stock').eq('id', productId).maybeSingle();
  if (!data) return;
  await supabase
    .from('products')
    .update({ stock: (Number(data.stock) || 0) + delta })
    .eq('id', data.id);
}

export async function applyStockEffects(tx: Transaction): Promise<void> {
  for (const e of stockEffects(tx)) await adjustProductStock(e.productId, e.delta);
}

export async function reverseStockEffects(tx: Transaction): Promise<void> {
  for (const e of stockEffects(tx)) await adjustProductStock(e.productId, -e.delta);
}

// Helper edit transaksi: fetch transaksi lama fresh dari DB, reverse, lalu terapkan yang baru
export async function fetchTransactionFresh(id: string): Promise<Transaction | null> {
  const { data } = await supabase.from('transactions').select('*').eq('id', id).maybeSingle();
  return (data as Transaction) || null;
}
