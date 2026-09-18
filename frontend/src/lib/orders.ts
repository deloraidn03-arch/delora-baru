import { supabase } from './supabase';
import { Order, RequestItem } from './types';

// Sinkronisasi baris item request: hapus semua baris lama untuk order tsb, lalu insert ulang
export async function syncOrderRequestItems(orderId: string, userId: string, items: RequestItem[]): Promise<void> {
  await supabase.from('order_request_items').delete().eq('order_id', orderId);
  const valid = (items || []).filter((it) => (it.itemName || '').trim());
  if (valid.length) {
    await supabase.from('order_request_items').insert(
      valid.map((it) => ({
        order_id: orderId,
        user_id: userId,
        item_name: it.itemName.trim(),
        qty: Number(it.qty) || 1,
        harga_invoice: Number(it.harga_invoice) || 0,
        harga_asli: Number(it.harga_asli) || 0,
      }))
    );
  }
}

// Agregasi status group: semua Selesai → Selesai; campuran → Setengah; semua Belum → Belum
export function groupStatus(orders: Order[]): 'Belum' | 'Setengah' | 'Selesai' {
  if (orders.every((o) => o.status === 'Selesai')) return 'Selesai';
  if (orders.every((o) => o.status === 'Belum')) return 'Belum';
  return 'Setengah';
}

// Status bayar derived: Lunas bila sisa = 0; DP bila dp > 0; selain itu Belum
export function paymentStatusOf(order: Order): 'Lunas' | 'DP' | 'Belum' {
  if (Number(order.sisa_pembayaran) === 0 && Number(order.total_price) > 0) return 'Lunas';
  if (Number(order.sisa_pembayaran) === 0 && Number(order.jumlah_dp) === 0 && Number(order.total_price) === 0) return 'Lunas';
  if (Number(order.jumlah_dp) > 0) return 'DP';
  return 'Belum';
}

export const STATUS_COLORS: Record<string, string> = {
  Selesai: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  Lunas: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  Setengah: 'bg-amber-100 text-amber-800 border border-amber-200',
  DP: 'bg-amber-100 text-amber-800 border border-amber-200',
  Belum: 'bg-red-100 text-red-800 border border-red-200',
};

export const groupIdOf = (o: Order): string => o.metadata?.groupId || o.id;
