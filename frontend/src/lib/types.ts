export type TxType =
  | 'sale_product'
  | 'sale_custom'
  | 'sale_topup'
  | 'purchase_material'
  | 'purchase_custom'
  | 'expense'
  | 'brilink'
  | 'brilink_capital'
  | 'transfer'
  | 'investment';

export interface Account {
  id: string;
  user_id: string;
  name: 'cash' | 'atm' | 'tabungan' | 'brilink_cash' | 'brilink_bank' | string;
  balance: number;
}

export const ACCOUNT_LABELS: Record<string, string> = {
  cash: 'Cash',
  atm: 'ATM / Bank',
  tabungan: 'Tabungan',
  brilink_cash: 'BRILINK Cash',
  brilink_bank: 'BRILINK Bank',
};

export interface ProductComponent {
  productId: string;
  productName: string;
  quantity: number;
}

export interface Product {
  id: string;
  user_id: string;
  name: string;
  type: 'single' | 'custom';
  hpp: number;
  selling_price: number;
  stock: number;
  min_stock: number;
  deskripsi?: string;
  items?: ProductComponent[];
}

export interface Customer {
  id: string;
  user_id: string;
  name: string;
  whatsapp_number?: string;
  notes?: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: TxType;
  amount: number;
  date: string;
  customer_name?: string | null;
  metadata: Record<string, any>;
  created_at?: string;
}

export type OrderType = 'money_bouquet' | 'bouquet_custom' | 'flower_bouquet' | 'custom_product';

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  money_bouquet: 'Money Bouquet',
  bouquet_custom: 'Bouquet Custom',
  flower_bouquet: 'Flower Bouquet',
  custom_product: 'Custom Product',
};

export interface RequestItem {
  id?: string;
  itemName: string;
  qty: number;
  harga_invoice: number;
  harga_asli: number;
  price?: number;
}

export interface MoneyItem {
  nominal: number;
  quantity: number;
}

export type OrderStatus = 'Belum' | 'Setengah' | 'Selesai';

export interface OrderMetadata {
  discount?: number;
  ongkir?: number;
  groupId?: string;
  paymentStatus?: string;
  serviceFee?: number;
  moneyItems?: MoneyItem[];
  customRequests?: RequestItem[];
  bouquetType?: string;
  productType?: string;
  inventoryProductId?: string;
  [key: string]: any;
}

export interface Order {
  id: string;
  user_id: string;
  type: OrderType;
  customer_id?: string | null;
  customer_name: string;
  order_date: string;
  delivery_date: string;
  notes?: string;
  status: OrderStatus;
  total_price: number;
  jumlah_dp: number;
  sisa_pembayaran: number;
  penjualan_id?: string | null;
  metadata: OrderMetadata;
}

export interface OrderInventoryItem {
  id?: string;
  order_id: string;
  user_id?: string;
  product_id: string;
  quantity: number;
}

export interface Asset {
  id: string;
  user_id: string;
  name: string;
  category: string;
  purchase_price: number;
  purchase_date: string;
  residual_value: number;
  depreciation_rate: number;
  useful_life_months: number;
  current_value: number;
  status: 'aktif' | 'habis';
  notes?: string;
}

export interface AssetDepreciation {
  id?: string;
  asset_id: string;
  user_id?: string;
  period_month: number;
  period_year: number;
  depreciation_amount: number;
  book_value_before: number;
  book_value_after: number;
}

export interface ExpenseAccount {
  id: string;
  user_id: string;
  name: string;
}

export const ASSET_CATEGORIES = [
  'Peralatan Produksi',
  'Perlengkapan Toko',
  'Kendaraan',
  'Elektronik',
  'Furnitur',
  'Lainnya',
];

export const MONEY_DENOMINATIONS = [1000, 2000, 5000, 10000, 20000, 50000, 100000];
