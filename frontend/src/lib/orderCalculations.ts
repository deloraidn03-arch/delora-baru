import { MoneyItem, Order, RequestItem } from './types';

// Aturan lintas-menu #2: semua perhitungan pesanan HANYA lewat util ini.

// Subtotal item request = qty × harga_invoice (fallback field legacy `price`)
export const getRequestItemSubtotal = (item: RequestItem): number =>
  (Number(item.qty) || 0) * (Number(item.harga_invoice ?? item.price) || 0);

export const getRequestItemsTotal = (items?: RequestItem[]): number =>
  (items || []).reduce((sum, it) => sum + getRequestItemSubtotal(it), 0);

export const getRequestItemsCostTotal = (items?: RequestItem[]): number =>
  (items || []).reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.harga_asli) || 0), 0);

// Diskon HANYA mengurangi Harga Jasa
export const getDiscountedServiceFee = (order: Pick<Order, 'metadata'>): number => {
  const fee = Number(order.metadata?.serviceFee) || 0;
  const disc = Number(order.metadata?.discount) || 0;
  return fee - (fee * disc) / 100;
};

export const getMoneyTotal = (order: Pick<Order, 'metadata'>): number =>
  (order.metadata?.moneyItems || []).reduce(
    (sum: number, m: MoneyItem) => sum + (Number(m.nominal) || 0) * (Number(m.quantity) || 0),
    0
  );

export const getOngkir = (order: Pick<Order, 'metadata'>): number => Number(order.metadata?.ongkir) || 0;

export const calculateOrderTotal = (order: Pick<Order, 'type' | 'metadata'>): number => {
  const base = getRequestItemsTotal(order.metadata?.customRequests) + getDiscountedServiceFee(order) + getOngkir(order);
  return order.type === 'money_bouquet' ? getMoneyTotal(order) + base : base;
};

// Revenue untuk Post ke Penjualan: sama seperti total TANPA moneyTotal
// (uang di dalam bouquet bukan pendapatan)
export const calculateOrderRevenue = (order: Pick<Order, 'metadata'>): number =>
  getRequestItemsTotal(order.metadata?.customRequests) + getDiscountedServiceFee(order) + getOngkir(order);

export const calculateGroupTotal = (orders: Order[]): number =>
  orders.reduce((sum, o) => sum + calculateOrderTotal(o), 0);

export const calculateGroupRevenue = (orders: Order[]): number =>
  orders.reduce((sum, o) => sum + calculateOrderRevenue(o), 0);

export type PaymentStatusInput = 'Lunas' | 'DP' | 'Belum Bayar';

// Dipakai semua form pesanan (create batch & edit)
export function computeMainPaymentFields(
  total: number,
  status: PaymentStatusInput,
  dpInput?: number,
  oldDp?: number
): { jumlah_dp: number; sisa_pembayaran: number } {
  if (status === 'Lunas') return { jumlah_dp: total, sisa_pembayaran: 0 };
  if (status === 'DP') {
    const dp = Number(dpInput ?? oldDp ?? 0) || 0;
    return { jumlah_dp: dp, sisa_pembayaran: Math.max(0, total - dp) };
  }
  return { jumlah_dp: 0, sisa_pembayaran: total };
}

// Nominal ke Penjualan (formula final, bagian 6.10):
// Harga Jasa (setelah diskon) + Total Harga Invoice Item Request − Total Harga Asli Item Request + Ongkir
export function calculatePostingNominal(orders: Order[]): {
  serviceFee: number;
  invoiceTotal: number;
  costTotal: number;
  ongkir: number;
  nominal: number;
} {
  let serviceFee = 0;
  let invoiceTotal = 0;
  let costTotal = 0;
  let ongkir = 0;
  for (const o of orders) {
    serviceFee += getDiscountedServiceFee(o);
    invoiceTotal += getRequestItemsTotal(o.metadata?.customRequests);
    costTotal += getRequestItemsCostTotal(o.metadata?.customRequests);
    ongkir += getOngkir(o);
  }
  const nominal = Math.max(0, serviceFee + invoiceTotal - costTotal) + ongkir;
  return { serviceFee, invoiceTotal, costTotal, ongkir, nominal };
}
