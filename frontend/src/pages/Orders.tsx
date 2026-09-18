import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Eye,
  Pencil,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Banknote,
  ListPlus,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Customer,
  MONEY_DENOMINATIONS,
  MoneyItem,
  Order,
  OrderType,
  ORDER_TYPE_LABELS,
  Product,
  RequestItem,
} from '../lib/types';
import { formatIDR, formatDate, todayISO } from '../lib/format';
import {
  calculateGroupTotal,
  calculateOrderTotal,
  computeMainPaymentFields,
  getRequestItemSubtotal,
  PaymentStatusInput,
} from '../lib/orderCalculations';
import { groupIdOf, groupStatus, paymentStatusOf, STATUS_COLORS, syncOrderRequestItems } from '../lib/orders';
import { getOrCreateCustomer } from '../lib/customers';
import { Modal } from '../components/Modal';
import { CurrencyInput } from '../components/CurrencyInput';
import { SearchableSelect } from '../components/SearchableSelect';
import { CustomerCombobox } from '../components/CustomerCombobox';
import OrderQuickViewModal from '../components/orders/OrderQuickViewModal';
import OrderCompletionModal from '../components/orders/OrderCompletionModal';

interface OrderDetail {
  moneyItems: MoneyItem[];
  customRequests: RequestItem[];
  serviceFee: number;
  discount: number;
  description: string;
  bouquetType: string;
  productType: string;
  inventoryProductId: string;
}

const emptyDetail = (): OrderDetail => ({
  moneyItems: [{ nominal: 50000, quantity: 0 }],
  customRequests: [],
  serviceFee: 0,
  discount: 0,
  description: '',
  bouquetType: '',
  productType: '',
  inventoryProductId: '',
});

const detailFromOrder = (o: Order): OrderDetail => ({
  moneyItems: o.metadata?.moneyItems?.length ? o.metadata.moneyItems : [{ nominal: 50000, quantity: 0 }],
  customRequests: (o.metadata?.customRequests || []).map((it) => ({ ...it })),
  serviceFee: Number(o.metadata?.serviceFee) || 0,
  discount: Number(o.metadata?.discount) || 0,
  description: o.notes || '',
  bouquetType: o.metadata?.bouquetType || '',
  productType: o.metadata?.productType || '',
  inventoryProductId: o.metadata?.inventoryProductId || '',
});

const detailToMetadata = (type: OrderType, d: OrderDetail) => ({
  serviceFee: d.serviceFee,
  discount: d.discount,
  customRequests: d.customRequests.filter((it) => (it.itemName || '').trim()),
  ...(type === 'money_bouquet'
    ? { moneyItems: d.moneyItems.filter((m) => m.nominal && m.quantity) }
    : {}),
  ...(type === 'flower_bouquet' ? { bouquetType: d.bouquetType } : {}),
  ...(type === 'custom_product'
    ? { productType: d.productType, inventoryProductId: d.inventoryProductId || undefined }
    : {}),
});

const ORDER_TABS: { id: OrderType; label: string }[] = [
  { id: 'money_bouquet', label: 'Money Bouquet' },
  { id: 'bouquet_custom', label: 'Bouquet Custom' },
  { id: 'flower_bouquet', label: 'Flower Bouquet' },
  { id: 'custom_product', label: 'Custom Product' },
];

// --- Editor baris Item Request: 5 kolom wajib ---
const RequestItemsEditor: React.FC<{
  items: RequestItem[];
  onChange: (items: RequestItem[]) => void;
  testidPrefix: string;
}> = ({ items, onChange, testidPrefix }) => (
  <div className="space-y-2">
    <div className="hidden grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wide text-[#5c6f64] sm:grid">
      <div className="col-span-4">Nama Item</div>
      <div className="col-span-1">Qty</div>
      <div className="col-span-3">Harga Invoice (ke customer)</div>
      <div className="col-span-3">Harga Asli (modal)</div>
      <div className="col-span-1 text-right">Subtotal</div>
    </div>
    {items.map((it, idx) => (
      <div key={idx} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-[#e2e8e4] p-2 sm:grid-cols-12 sm:border-0 sm:p-0">
        <div className="col-span-2 sm:col-span-4">
          <label className="mb-0.5 block text-[10px] font-semibold uppercase text-[#5c6f64] sm:hidden">Nama Item</label>
          <input
            className="input-base"
            placeholder="Nama item"
            value={it.itemName}
            onChange={(e) => {
              const list = [...items];
              list[idx] = { ...it, itemName: e.target.value };
              onChange(list);
            }}
            data-testid={`${testidPrefix}-item-name-${idx}`}
          />
        </div>
        <div className="sm:col-span-1">
          <label className="mb-0.5 block text-[10px] font-semibold uppercase text-[#5c6f64] sm:hidden">Qty</label>
          <input
            type="number"
            inputMode="numeric"
            className="input-base"
            placeholder="1"
            value={it.qty || ''}
            onChange={(e) => {
              const list = [...items];
              list[idx] = { ...it, qty: Number(e.target.value) || 1 };
              onChange(list);
            }}
            data-testid={`${testidPrefix}-item-qty-${idx}`}
          />
        </div>
        <div className="sm:col-span-3">
          <label className="mb-0.5 block text-[10px] font-semibold uppercase text-[#5c6f64] sm:hidden">Harga Invoice</label>
          <CurrencyInput
            value={Number(it.harga_invoice) || 0}
            onChange={(v) => {
              const list = [...items];
              list[idx] = { ...it, harga_invoice: v };
              onChange(list);
            }}
            data-testid={`${testidPrefix}-item-harga-invoice-${idx}`}
          />
        </div>
        <div className="sm:col-span-3">
          <label className="mb-0.5 block text-[10px] font-semibold uppercase text-[#5c6f64] sm:hidden">Harga Asli (modal)</label>
          <CurrencyInput
            value={Number(it.harga_asli) || 0}
            onChange={(v) => {
              const list = [...items];
              list[idx] = { ...it, harga_asli: v };
              onChange(list);
            }}
            data-testid={`${testidPrefix}-item-harga-asli-${idx}`}
          />
        </div>
        <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
          <span className="text-sm font-semibold text-[#2e3b34]">{formatIDR(getRequestItemSubtotal(it))}</span>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== idx))}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[#c62828] hover:bg-[#ffebee]"
            data-testid={`${testidPrefix}-item-remove-${idx}`}
            aria-label="Hapus baris"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    ))}
    <button
      type="button"
      onClick={() => onChange([...items, { itemName: '', qty: 1, harga_invoice: 0, harga_asli: 0 }])}
      className="btn-secondary w-full"
      data-testid={`${testidPrefix}-item-add`}
    >
      <Plus size={16} /> Tambah Baris Item
    </button>
  </div>
);

// --- Form detail per tipe pesanan ---
const OrderDetailForm: React.FC<{
  type: OrderType;
  detail: OrderDetail;
  onChange: (d: OrderDetail) => void;
  products: Product[];
}> = ({ type, detail, onChange, products }) => {
  const set = (patch: Partial<OrderDetail>) => onChange({ ...detail, ...patch });
  return (
    <div className="space-y-4">
      {type === 'money_bouquet' && (
        <div>
          <label className="label-base">Nominal Uang *</label>
          <div className="space-y-2">
            {detail.moneyItems.map((m, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  className="input-base flex-1"
                  value={m.nominal}
                  onChange={(e) => {
                    const list = [...detail.moneyItems];
                    list[idx] = { ...m, nominal: Number(e.target.value) };
                    set({ moneyItems: list });
                  }}
                  data-testid={`mb-money-nominal-${idx}`}
                >
                  {MONEY_DENOMINATIONS.map((n) => (
                    <option key={n} value={n}>
                      {n.toLocaleString('id-ID')}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input-base w-28"
                  placeholder="Jumlah lembar"
                  value={m.quantity || ''}
                  onChange={(e) => {
                    const list = [...detail.moneyItems];
                    list[idx] = { ...m, quantity: Number(e.target.value) || 0 };
                    set({ moneyItems: list });
                  }}
                  data-testid={`mb-money-qty-${idx}`}
                />
                <button
                  type="button"
                  onClick={() => set({ moneyItems: detail.moneyItems.filter((_, i) => i !== idx) })}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#c62828] hover:bg-[#ffebee]"
                  data-testid={`mb-money-remove-${idx}`}
                  aria-label="Hapus pecahan"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => set({ moneyItems: [...detail.moneyItems, { nominal: 50000, quantity: 0 }] })}
              className="btn-secondary w-full"
              data-testid="mb-money-add"
            >
              <Plus size={16} /> Tambah Pecahan
            </button>
          </div>
        </div>
      )}

      {type === 'flower_bouquet' && (
        <div>
          <label className="label-base">Jenis Bouquet *</label>
          <input
            className="input-base"
            placeholder="Mis. Bouquet mawar segar"
            value={detail.bouquetType}
            onChange={(e) => set({ bouquetType: e.target.value })}
            data-testid="fb-bouquet-type-input"
          />
        </div>
      )}

      {type === 'custom_product' && (
        <>
          <div>
            <label className="label-base">Jenis Product *</label>
            <input
              className="input-base"
              placeholder="Mis. Bloom box custom"
              value={detail.productType}
              onChange={(e) => set({ productType: e.target.value })}
              data-testid="cp-product-type-input"
            />
          </div>
          <div>
            <label className="label-base">Produk Inventory (opsional — untuk potong stok)</label>
            <SearchableSelect
              options={products.map((p) => ({ value: p.id, label: p.name, hint: `stok ${p.stock}` }))}
              value={detail.inventoryProductId}
              onChange={(v) => set({ inventoryProductId: v })}
              placeholder="Pilih produk"
              data-testid="cp-inventory-product-select"
            />
          </div>
        </>
      )}

      <div>
        <label className="label-base">{type === 'money_bouquet' ? 'Request Tambahan' : 'Item Request'}</label>
        <RequestItemsEditor
          items={detail.customRequests}
          onChange={(items) => set({ customRequests: items })}
          testidPrefix={`order-${type}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label-base">Harga Jasa</label>
          <CurrencyInput value={detail.serviceFee} onChange={(v) => set({ serviceFee: v })} data-testid={`${type}-service-fee-input`} />
        </div>
        <div>
          <label className="label-base">Diskon (%) — hanya memotong Harga Jasa</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            className="input-base"
            value={detail.discount || ''}
            onChange={(e) => set({ discount: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
            data-testid={`${type}-discount-input`}
          />
        </div>
      </div>

      <div>
        <label className="label-base">Deskripsi</label>
        <textarea
          className="input-base h-20 resize-none py-2"
          value={detail.description}
          onChange={(e) => set({ description: e.target.value })}
          data-testid={`${type}-description-input`}
        />
      </div>
    </div>
  );
};

// ================= Halaman Pesanan =================
const Orders: React.FC = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<'all_orders' | OrderType>('all_orders');

  // Shared fields (dipakai ulang antar tab untuk batch multi-order)
  const [sharedCustomerName, setSharedCustomerName] = useState('');
  const [sharedDeadline, setSharedDeadline] = useState('');
  const [sharedOngkir, setSharedOngkir] = useState(0);
  const [sharedPaymentStatus, setSharedPaymentStatus] = useState<PaymentStatusInput>('Belum Bayar');
  const [sharedJumlahDp, setSharedJumlahDp] = useState(0);

  const [details, setDetails] = useState<Record<OrderType, OrderDetail>>({
    money_bouquet: emptyDetail(),
    bouquet_custom: emptyDetail(),
    flower_bouquet: emptyDetail(),
    custom_product: emptyDetail(),
  });
  const [pendingOrders, setPendingOrders] = useState<{ type: OrderType; detail: OrderDetail }[]>([]);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [addToGroup, setAddToGroup] = useState<{ groupId: string; customerName: string; deadline: string } | null>(null);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'name' | 'order_date' | 'deadline'>('deadline');
  const [filterText, setFilterText] = useState('');
  const [quickView, setQuickView] = useState<Order[] | null>(null);
  const [completion, setCompletion] = useState<{ orders: Order[]; mode: 'edit' | 'posting' | 'review' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ order: Order; group: Order[] } | null>(null);
  const [addItemTarget, setAddItemTarget] = useState<{ order: Order; group: Order[] } | null>(null);
  const [banknoteOpen, setBanknoteOpen] = useState(false);
  const [bulkDeleteStatus, setBulkDeleteStatus] = useState<'Belum' | 'Setengah' | 'Selesai'>('Selesai');
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const refreshData = useCallback(async () => {
    if (!user) return;
    const [oRes, cRes, pRes] = await Promise.all([
      supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('customers').select('*').eq('user_id', user.id).order('name'),
      supabase.from('products').select('*').eq('user_id', user.id).order('name'),
    ]);
    setOrders((oRes.data as Order[]) || []);
    setCustomers((cRes.data as Customer[]) || []);
    setProducts((pRes.data as Product[]) || []);
  }, [user]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const currentDetail = activeTab === 'all_orders' ? details.money_bouquet : details[activeTab];
  const setCurrentDetail = (d: OrderDetail) => {
    if (activeTab !== 'all_orders') setDetails({ ...details, [activeTab]: d });
  };

  const pendingTotal = useMemo(
    () =>
      pendingOrders.reduce(
        (s, p, idx) =>
          s +
          calculateOrderTotal({
            type: p.type,
            metadata: { ...detailToMetadata(p.type, p.detail), ongkir: idx === 0 ? sharedOngkir : 0 },
          } as Order),
        0
      ),
    [pendingOrders, sharedOngkir]
  );

  const validateDetail = (type: OrderType, d: OrderDetail): boolean => {
    if (type === 'money_bouquet') return d.moneyItems.some((m) => m.nominal && m.quantity > 0);
    if (type === 'flower_bouquet') return !!d.bouquetType.trim();
    if (type === 'custom_product') return !!d.productType.trim();
    return true;
  };

  // Tambah pesanan ke daftar pending (atau langsung insert bila mode "Tambah Item" ke group berjalan)
  const handleAddPending = async () => {
    if (!user) return toast.error('User not authenticated');
    if (activeTab === 'all_orders') return;
    const custName = addToGroup ? addToGroup.customerName : sharedCustomerName;
    const deadline = addToGroup ? addToGroup.deadline : sharedDeadline;
    if (!custName.trim() || !deadline) return toast.error('Harap isi semua field wajib');
    if (!validateDetail(activeTab, currentDetail)) return toast.error('Harap isi semua field wajib');

    if (addToGroup) {
      // Tambah item ke pesanan berjalan: groupId, customer, deadline sama
      setSaving(true);
      const customerId = await getOrCreateCustomer(user.id, custName);
      const meta = {
        ...detailToMetadata(activeTab, currentDetail),
        groupId: addToGroup.groupId,
        paymentStatus: 'Belum Bayar',
        ongkir: 0,
      };
      const total = calculateOrderTotal({ type: activeTab, metadata: meta } as Order);
      const { data, error } = await supabase
        .from('orders')
        .insert({
          user_id: user.id,
          type: activeTab,
          customer_name: custName,
          customer_id: customerId,
          order_date: new Date().toISOString(),
          delivery_date: deadline,
          notes: currentDetail.description,
          status: 'Belum',
          total_price: total,
          jumlah_dp: 0,
          sisa_pembayaran: total,
          metadata: meta,
        })
        .select()
        .single();
      setSaving(false);
      if (error) return toast.error('Gagal menyimpan pesanan: ' + error.message);
      await syncOrderRequestItems(data.id, user.id, currentDetail.customRequests);
      toast.success('Item pesanan ditambahkan ke group');
      setDetails({ ...details, [activeTab]: emptyDetail() });
      setAddToGroup(null);
      setActiveTab('all_orders');
      refreshData();
      return;
    }

    setPendingOrders([...pendingOrders, { type: activeTab, detail: currentDetail }]);
    setDetails({ ...details, [activeTab]: emptyDetail() }); // reset detail, shared fields tetap (auto-fill)
    toast.success('Pesanan ditambahkan ke daftar pending');
  };

  const handleSaveBatch = async () => {
    if (!user) return toast.error('User not authenticated');
    if (!sharedCustomerName.trim() || !sharedDeadline) return toast.error('Harap isi semua field wajib');
    if (!pendingOrders.length) return toast.error('Belum ada pesanan di daftar pending');
    setSaving(true);
    const customerId = await getOrCreateCustomer(user.id, sharedCustomerName);
    const groupId = 'group_' + Date.now();
    const rows = pendingOrders.map((p, idx) => {
      const meta = {
        ...detailToMetadata(p.type, p.detail),
        groupId,
        // Ongkir & pembayaran hanya pada pesanan PERTAMA dalam group
        ongkir: idx === 0 ? sharedOngkir : 0,
        paymentStatus: idx === 0 ? sharedPaymentStatus : 'Belum Bayar',
      };
      const total = calculateOrderTotal({ type: p.type, metadata: meta } as Order);
      const pay =
        idx === 0
          ? computeMainPaymentFields(total, sharedPaymentStatus, sharedJumlahDp)
          : { jumlah_dp: 0, sisa_pembayaran: total };
      return {
        user_id: user.id,
        type: p.type,
        customer_name: sharedCustomerName.trim(),
        customer_id: customerId,
        order_date: new Date().toISOString(),
        delivery_date: sharedDeadline,
        notes: p.detail.description,
        status: 'Belum',
        total_price: total,
        ...pay,
        metadata: meta,
      };
    });
    const { data, error } = await supabase.from('orders').insert(rows).select();
    if (error) {
      setSaving(false);
      return toast.error('Gagal menyimpan pesanan: ' + error.message);
    }
    for (let i = 0; i < (data?.length || 0); i++) {
      await syncOrderRequestItems(data[i].id, user.id, pendingOrders[i].detail.customRequests);
    }
    setSaving(false);
    toast.success(`${data?.length || 0} pesanan berhasil disimpan`);
    setPendingOrders([]);
    setSharedOngkir(0);
    setSharedJumlahDp(0);
    setSharedPaymentStatus('Belum Bayar');
    refreshData();
    setActiveTab('all_orders');
  };

  const handleEdit = (o: Order) => {
    setEditingOrder(o);
    setSharedCustomerName(o.customer_name);
    setSharedDeadline((o.delivery_date || '').slice(0, 10));
    setSharedOngkir(Number(o.metadata?.ongkir) || 0);
    setSharedPaymentStatus((o.metadata?.paymentStatus as PaymentStatusInput) || 'Belum Bayar');
    setSharedJumlahDp(Number(o.jumlah_dp) || 0);
    setDetails({ ...details, [o.type]: detailFromOrder(o) });
    setActiveTab(o.type);
    // Auto-scroll ke form edit
    setTimeout(() => {
      document.getElementById('order-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleUpdate = async () => {
    if (!user) return toast.error('User not authenticated');
    if (!editingOrder) return;
    if (!sharedCustomerName.trim() || !sharedDeadline) return toast.error('Harap isi semua field wajib');
    const d = details[editingOrder.type];
    if (!validateDetail(editingOrder.type, d)) return toast.error('Harap isi semua field wajib');
    setSaving(true);
    const customerId = await getOrCreateCustomer(user.id, sharedCustomerName);
    const meta = {
      ...detailToMetadata(editingOrder.type, d),
      groupId: editingOrder.metadata?.groupId, // groupId lama dipertahankan
      paymentStatus: sharedPaymentStatus,
      ongkir: sharedOngkir,
    };
    const total = calculateOrderTotal({ type: editingOrder.type, metadata: meta } as Order);
    const pay = computeMainPaymentFields(total, sharedPaymentStatus, sharedJumlahDp, editingOrder.jumlah_dp);
    const { error } = await supabase
      .from('orders')
      .update({
        customer_name: sharedCustomerName.trim(),
        customer_id: customerId,
        delivery_date: sharedDeadline,
        notes: d.description,
        total_price: total,
        ...pay,
        metadata: meta,
      })
      .eq('id', editingOrder.id);
    if (error) {
      setSaving(false);
      return toast.error('Gagal menyimpan pesanan: ' + error.message);
    }
    await syncOrderRequestItems(editingOrder.id, user.id, d.customRequests);
    setSaving(false);
    toast.success('Pesanan berhasil diupdate');
    setEditingOrder(null);
    setDetails({ ...details, [editingOrder.type]: emptyDetail() });
    setActiveTab('all_orders');
    refreshData(); // wajib: Quick View & pesan WhatsApp memakai angka baru
  };

  const handleStatusChange = async (o: Order, status: Order['status']) => {
    await supabase.from('orders').update({ status }).eq('id', o.id);
    setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, status } : x)));
    // Peringatan eksplisit: status TIDAK memotong stok
    toast.warning('Status diubah. Perubahan status TIDAK mengurangi stok — gunakan "Post ke Penjualan" untuk potong stok.');
  };

  const deleteOrderAndItems = async (ids: string[]) => {
    await supabase.from('order_request_items').delete().in('order_id', ids);
    await supabase.from('order_inventory_items').delete().in('order_id', ids);
    await supabase.from('orders').delete().in('id', ids);
  };

  const handleDelete = async (scope: 'item' | 'group') => {
    if (!deleteTarget) return;
    // Hapus satu item TIDAK PERNAH cascade ke group
    const ids = scope === 'item' ? [deleteTarget.order.id] : deleteTarget.group.map((o) => o.id);
    await deleteOrderAndItems(ids);
    toast.success(scope === 'item' ? 'Pesanan dihapus' : 'Seluruh group pesanan dihapus');
    setDeleteTarget(null);
    refreshData();
  };

  const handleBulkDelete = async () => {
    if (!user) return toast.error('User not authenticated');
    // Baca status terbaru langsung dari DB (per-order, bukan level group)
    const { data } = await supabase.from('orders').select('id, status').eq('user_id', user.id);
    const targets = (data || []).filter((o: any) => o.status === bulkDeleteStatus);
    if (!targets.length) {
      setBulkConfirm(false);
      return toast.error('Tidak ada pesanan dengan status tersebut');
    }
    await deleteOrderAndItems(targets.map((o: any) => o.id));
    toast.success(`${targets.length} pesanan berstatus "${bulkDeleteStatus}" dihapus`);
    setBulkConfirm(false);
    refreshData();
  };

  // Grouping per groupId (bukan nama customer), filter, dan sorting stabil
  const groups = useMemo(() => {
    const filtered = orders.filter((o) =>
      o.customer_name.toLowerCase().includes(filterText.toLowerCase())
    );
    const withIndex = filtered.map((o, i) => ({ o, i }));
    const keyOf = (o: Order) => {
      if (sortBy === 'name') return o.customer_name.toLowerCase();
      if (sortBy === 'order_date') return o.order_date;
      return o.delivery_date || '';
    };
    // stable sort
    withIndex.sort((a, b) => {
      const ka = keyOf(a.o);
      const kb = keyOf(b.o);
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return a.i - b.i;
    });
    const map = new Map<string, Order[]>();
    for (const { o } of withIndex) {
      const gid = groupIdOf(o);
      if (!map.has(gid)) map.set(gid, []);
      map.get(gid)!.push(o);
    }
    // Urutkan pesanan dalam group by created_at: order pertama (pemegang ongkir/DP) selalu group[0]
    const entries = Array.from(map.entries());
    for (const [, g] of entries) {
      g.sort((a, b) =>
        String((a as any).created_at || a.order_date).localeCompare(String((b as any).created_at || b.order_date))
      );
    }
    return entries;
  }, [orders, filterText, sortBy]);

  // Popover ringkasan pecahan uang untuk money bouquet yang masih aktif (belum di-post)
  const banknoteSummary = useMemo(() => {
    const agg = new Map<number, number>();
    for (const o of orders) {
      if (o.type !== 'money_bouquet' || o.penjualan_id) continue;
      for (const m of o.metadata?.moneyItems || []) {
        agg.set(m.nominal, (agg.get(m.nominal) || 0) + (Number(m.quantity) || 0));
      }
    }
    return Array.from(agg.entries()).sort((a, b) => b[0] - a[0]);
  }, [orders]);

  const activeCount = orders.filter((o) => o.status !== 'Selesai').length;

  const paymentBadge = (o: Order) => {
    const st = paymentStatusOf(o);
    const label = st === 'DP' ? 'DP/Setengah' : st === 'Belum' ? 'Belum' : 'Lunas';
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[st]}`}>{label}</span>
    );
  };

  const orderActions = (o: Order, group: Order[], compact?: boolean) => (
    <div className={`flex ${compact ? 'flex-wrap gap-1' : 'justify-end gap-1'}`}>
      <button
        onClick={() => setQuickView(group)}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-[#1565c0] hover:bg-[#e3f2fd]"
        title="Quick View"
        data-testid={`order-quickview-${o.id}`}
      >
        <Eye size={16} />
      </button>
      <button
        onClick={() => handleEdit(o)}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-[#6f8f7f] hover:bg-[#F2F7F4]"
        title="Edit"
        data-testid={`order-edit-${o.id}`}
      >
        <Pencil size={16} />
      </button>
      <button
        onClick={() => setAddItemTarget({ order: o, group })}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-[#f57f17] hover:bg-[#fff8e1]"
        title="Tambah Item"
        data-testid={`order-add-item-${o.id}`}
      >
        <ListPlus size={16} />
      </button>
      <button
        onClick={() => setCompletion({ orders: group, mode: 'posting' })}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-[#2e7d32] hover:bg-[#e8f5e9]"
        title="Selesaikan / Post"
        data-testid={`order-complete-${o.id}`}
      >
        <CheckCircle2 size={16} />
      </button>
      <button
        onClick={() => setDeleteTarget({ order: o, group })}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-[#c62828] hover:bg-[#ffebee]"
        title="Hapus"
        data-testid={`order-delete-${o.id}`}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );

  const statusSelect = (o: Order) => (
    <select
      className={`h-11 rounded-lg px-2 text-xs font-semibold ${STATUS_COLORS[o.status]}`}
      value={o.status}
      onChange={(e) => handleStatusChange(o, e.target.value as Order['status'])}
      data-testid={`order-status-${o.id}`}
    >
      <option value="Belum">Belum Selesai</option>
      <option value="Setengah">Setengah Jadi</option>
      <option value="Selesai">Selesai</option>
    </select>
  );

  return (
    <div className="space-y-5" data-testid="orders-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-brand text-3xl font-bold tracking-tight text-[#2e3b34] sm:text-4xl">Pesanan</h1>
          <p className="text-sm text-[#5c6f64]">Input pesanan → produksi → pelunasan → post ke penjualan</p>
        </div>
        <div className="relative">
          <button onClick={() => setBanknoteOpen((v) => !v)} className="btn-secondary" data-testid="banknote-summary-button">
            <Banknote size={16} /> Ringkasan Pecahan
          </button>
          {banknoteOpen && (
            <div className="absolute right-0 z-40 mt-2 w-64 rounded-lg border border-[#dfe7e1] bg-white p-4 shadow-lg" data-testid="banknote-popover">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#5c6f64]">
                Kebutuhan uang (money bouquet aktif)
              </div>
              {!banknoteSummary.length && <div className="text-sm text-[#93a298]">Tidak ada</div>}
              {banknoteSummary.map(([nominal, qty]) => (
                <div key={nominal} className="flex justify-between py-1 text-sm">
                  <span>{formatIDR(nominal)}</span>
                  <span className="font-semibold">{qty} lembar</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Kartu ringkasan — jumlah pesanan dihitung PER ITEM, bukan per group */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4" data-testid="orders-summary-total">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">Total Item Pesanan</div>
          <div className="mt-1 text-2xl font-bold text-[#2e3b34]">{orders.length}</div>
        </div>
        <div className="card p-4" data-testid="orders-summary-active">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">Aktif (belum selesai)</div>
          <div className="mt-1 text-2xl font-bold text-[#f57f17]">{activeCount}</div>
        </div>
        <div className="card p-4" data-testid="orders-summary-groups">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">Total Group</div>
          <div className="mt-1 text-2xl font-bold text-[#2e3b34]">{new Set(orders.map(groupIdOf)).size}</div>
        </div>
        <div className="card p-4" data-testid="orders-summary-value">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#5c6f64]">Nilai Pesanan Aktif</div>
          <div className="mt-1 text-2xl font-bold text-[#6f8f7f]">
            {formatIDR(orders.filter((o) => o.status !== 'Selesai').reduce((s, o) => s + (Number(o.total_price) || 0), 0))}
          </div>
        </div>
      </div>

      {/* Tabs: Semua Pesanan + 4 tipe form */}
      <div className="card p-4 sm:p-6" id="order-form-section">
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-[#F2F7F4] p-1.5 sm:grid-cols-5">
          <button
            onClick={() => setActiveTab('all_orders')}
            className={`min-h-[44px] rounded-xl text-xs font-semibold transition-all duration-200 sm:text-sm ${
              activeTab === 'all_orders' ? 'bg-white text-[#2e3b34] shadow-sm' : 'text-[#5c6f64]'
            }`}
            data-testid="order-tab-all-orders"
          >
            Semua Pesanan
          </button>
          {ORDER_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`min-h-[44px] rounded-xl text-xs font-semibold transition-all duration-200 sm:text-sm ${
                activeTab === t.id ? 'bg-white text-[#2e3b34] shadow-sm' : 'text-[#5c6f64]'
              }`}
              data-testid={`order-tab-${t.id.replace(/_/g, '-')}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'all_orders' ? (
          <div className="mt-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className="input-base sm:max-w-xs"
                placeholder="Filter by nama customer…"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                data-testid="orders-filter-input"
              />
              <select
                className="input-base sm:max-w-xs"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                data-testid="orders-sort-select"
              >
                <option value="deadline">Urutkan by Deadline</option>
                <option value="name">Urutkan by Nama</option>
                <option value="order_date">Urutkan by Tanggal Pesan</option>
              </select>
              <div className="flex gap-2 sm:ml-auto">
                <select
                  className="input-base w-36"
                  value={bulkDeleteStatus}
                  onChange={(e) => setBulkDeleteStatus(e.target.value as any)}
                  data-testid="orders-bulk-status-select"
                >
                  <option value="Belum">Belum</option>
                  <option value="Setengah">Setengah</option>
                  <option value="Selesai">Selesai</option>
                </select>
                <button onClick={() => setBulkConfirm(true)} className="btn-danger whitespace-nowrap" data-testid="orders-bulk-delete-button">
                  Hapus by Status
                </button>
              </div>
            </div>
            <p className="rounded-lg bg-[#fff8e1] px-3 py-2 text-xs text-[#8a6d00]" data-testid="orders-stock-note">
              Mengubah status order TIDAK mengurangi stok. Stok hanya berkurang lewat tombol &quot;Post ke
              Penjualan&quot;.
            </p>

            {/* Tabel desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8e4] bg-[#FAF8F3] text-left text-xs uppercase tracking-wide text-[#5c6f64]">
                    <th className="px-3 py-3">Customer / Pesanan</th>
                    <th className="px-3 py-3">Deadline</th>
                    <th className="px-3 py-3">Status Order</th>
                    <th className="px-3 py-3">Status Bayar</th>
                    <th className="px-3 py-3 text-right">Total</th>
                    <th className="px-3 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(([gid, group]) => {
                    const expanded = expandedGroups.has(gid);
                    const gStatus = groupStatus(group);
                    return (
                      <React.Fragment key={gid}>
                        <tr
                          className="cursor-pointer border-b border-[#dfe7e1] bg-[#F2F7F4] hover:bg-[#e3ece6]"
                          onClick={() =>
                            setExpandedGroups((prev) => {
                              const next = new Set(prev);
                              if (next.has(gid)) next.delete(gid);
                              else next.add(gid);
                              return next;
                            })
                          }
                          data-testid={`order-group-${gid}`}
                        >
                          <td className="px-3 py-3 font-bold text-[#2e3b34]">
                            <span className="mr-1 inline-flex items-center">
                              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </span>
                            {group[0].customer_name}
                            <span className="ml-2 text-xs font-normal text-[#5c6f64]">{group.length} item</span>
                          </td>
                          <td className="px-3 py-3">{formatDate(group[0].delivery_date)}</td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[gStatus]}`}>
                              {gStatus === 'Belum' ? 'Belum Selesai' : gStatus === 'Setengah' ? 'Setengah Jadi' : 'Selesai'}
                            </span>
                          </td>
                          <td className="px-3 py-3">{paymentBadge(group[0])}</td>
                          <td className="px-3 py-3 text-right font-bold">{formatIDR(calculateGroupTotal(group))}</td>
                          <td className="px-3 py-3 text-right text-xs text-[#93a298]">klik untuk expand</td>
                        </tr>
                        {expanded &&
                          group.map((o) => (
                            <tr key={o.id} className="border-b border-[#eef2ef] hover:bg-[#FAF8F3]" data-testid={`order-row-${o.id}`}>
                              <td className="px-3 py-3 pl-9">
                                <div className="font-medium">{ORDER_TYPE_LABELS[o.type]}</div>
                                <div className="text-xs text-[#93a298]">Pesan: {formatDate(o.order_date)}</div>
                              </td>
                              <td className="px-3 py-3">{formatDate(o.delivery_date)}</td>
                              <td className="px-3 py-3">{statusSelect(o)}</td>
                              <td className="px-3 py-3">{paymentBadge(o)}</td>
                              <td className="px-3 py-3 text-right font-semibold">{formatIDR(o.total_price)}</td>
                              <td className="px-3 py-3">{orderActions(o, group)}</td>
                            </tr>
                          ))}
                      </React.Fragment>
                    );
                  })}
                  {!groups.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-[#5c6f64]">
                        Belum ada pesanan
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Card list mobile */}
            <div className="space-y-3 md:hidden">
              {groups.map(([gid, group]) => {
                const expanded = expandedGroups.has(gid);
                const gStatus = groupStatus(group);
                return (
                  <div key={gid} className="card overflow-hidden" data-testid={`order-group-card-${gid}`}>
                    <button
                      className="flex w-full items-center justify-between gap-2 bg-[#F2F7F4] px-4 py-3 text-left"
                      onClick={() =>
                        setExpandedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(gid)) next.delete(gid);
                          else next.add(gid);
                          return next;
                        })
                      }
                      data-testid={`order-group-toggle-${gid}`}
                    >
                      <div>
                        <div className="font-bold text-[#2e3b34]">{group[0].customer_name}</div>
                        <div className="text-xs text-[#5c6f64]">
                          {group.length} item • Deadline {formatDate(group[0].delivery_date)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[gStatus]}`}>
                          {gStatus === 'Belum' ? 'Belum' : gStatus}
                        </span>
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>
                    </button>
                    {expanded && (
                      <div className="divide-y divide-[#eef2ef]">
                        {group.map((o) => (
                          <div key={o.id} className="p-4" data-testid={`order-card-${o.id}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-semibold">{ORDER_TYPE_LABELS[o.type]}</div>
                                <div className="text-xs text-[#5c6f64]">
                                  Pesan {formatDate(o.order_date)} • Deadline {formatDate(o.delivery_date)}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold">{formatIDR(o.total_price)}</div>
                                {paymentBadge(o)}
                              </div>
                            </div>
                            <div className="mt-2">{statusSelect(o)}</div>
                            <div className="mt-2">{orderActions(o, group, true)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {!groups.length && <div className="card p-8 text-center text-sm text-[#5c6f64]">Belum ada pesanan</div>}
            </div>
          </div>
        ) : (
          /* Form input per tipe pesanan */
          <div className="mt-5 space-y-5">
            {addToGroup && (
              <div className="flex items-center justify-between rounded-lg border border-[#90caf9] bg-[#e3f2fd] px-3 py-2 text-sm text-[#1565c0]" data-testid="add-to-group-banner">
                <span>
                  Menambah item ke group <strong>{addToGroup.customerName}</strong>
                </span>
                <button onClick={() => setAddToGroup(null)} className="font-semibold underline" data-testid="add-to-group-cancel">
                  Batal
                </button>
              </div>
            )}
            {editingOrder && (
              <div className="flex items-center justify-between rounded-lg border border-[#ffe082] bg-[#fff8e1] px-3 py-2 text-sm text-[#8a6d00]" data-testid="editing-order-banner">
                <span>
                  Mode edit: <strong>{ORDER_TYPE_LABELS[editingOrder.type]}</strong> — {editingOrder.customer_name}
                </span>
                <button
                  onClick={() => {
                    setEditingOrder(null);
                    setDetails({ ...details, [editingOrder.type]: emptyDetail() });
                  }}
                  className="font-semibold underline"
                  data-testid="edit-order-cancel"
                >
                  Batal Edit
                </button>
              </div>
            )}

            {/* Field bersama */}
            {!addToGroup && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="label-base">Nama Customer *</label>
                  <CustomerCombobox customers={customers} value={sharedCustomerName} onChange={setSharedCustomerName} data-testid="order-customer-input" />
                </div>
                <div>
                  <label className="label-base">Tanggal Deadline *</label>
                  <input
                    type="date"
                    className="input-base"
                    value={sharedDeadline}
                    onChange={(e) => setSharedDeadline(e.target.value)}
                    data-testid="order-deadline-input"
                  />
                </div>
              </div>
            )}

            <OrderDetailForm type={activeTab} detail={currentDetail} onChange={setCurrentDetail} products={products} />

            {editingOrder ? (
              <div className="flex justify-end">
                <button onClick={handleUpdate} disabled={saving} className="btn-primary w-full sm:w-auto" data-testid="order-update-button">
                  {saving ? 'Menyimpan…' : 'Simpan Perubahan Pesanan'}
                </button>
              </div>
            ) : (
              <div className="flex justify-end">
                <button onClick={handleAddPending} disabled={saving} className="btn-primary w-full sm:w-auto" data-testid="order-add-pending-button">
                  <Plus size={16} /> {addToGroup ? 'Tambah ke Group' : 'Tambah Pesanan'}
                </button>
              </div>
            )}

            {/* Daftar pending orders + ongkir + status bayar */}
            {pendingOrders.length > 0 && !addToGroup && (
              <div className="space-y-4 rounded-xl border border-[#dfe7e1] bg-[#FAF8F3] p-4" data-testid="pending-orders-section">
                <h3 className="font-brand text-lg font-semibold text-[#2e3b34]">
                  Pending Orders ({pendingOrders.length})
                </h3>
                <div className="space-y-2">
                  {pendingOrders.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm" data-testid={`pending-order-${idx}`}>
                      <div>
                        <span className="font-semibold">{ORDER_TYPE_LABELS[p.type]}</span>
                        <span className="ml-2 text-xs text-[#5c6f64]">
                          {p.detail.customRequests.filter((i) => i.itemName).length} item request
                          {idx === 0 && sharedOngkir ? ' • + ongkir' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {formatIDR(
                            calculateOrderTotal({
                              type: p.type,
                              metadata: { ...detailToMetadata(p.type, p.detail), ongkir: idx === 0 ? sharedOngkir : 0 },
                            } as Order)
                          )}
                        </span>
                        <button
                          onClick={() => setPendingOrders(pendingOrders.filter((_, i) => i !== idx))}
                          className="flex h-11 w-11 items-center justify-center rounded-lg text-[#c62828] hover:bg-[#ffebee]"
                          data-testid={`pending-order-remove-${idx}`}
                          aria-label="Hapus pending"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="label-base">Ongkir (Pengiriman) — sekali untuk semua</label>
                    <CurrencyInput value={sharedOngkir} onChange={setSharedOngkir} data-testid="order-ongkir-input" />
                  </div>
                  <div>
                    <label className="label-base">Status Bayar</label>
                    <select
                      className="input-base"
                      value={sharedPaymentStatus}
                      onChange={(e) => setSharedPaymentStatus(e.target.value as PaymentStatusInput)}
                      data-testid="order-payment-status-select"
                    >
                      <option value="Belum Bayar">Belum Bayar</option>
                      <option value="DP">DP</option>
                      <option value="Lunas">Lunas</option>
                    </select>
                  </div>
                  {sharedPaymentStatus === 'DP' && (
                    <div>
                      <label className="label-base">Jumlah DP</label>
                      <CurrencyInput value={sharedJumlahDp} onChange={setSharedJumlahDp} data-testid="order-dp-input" />
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="text-sm">
                    Total semua pesanan: <strong className="text-lg">{formatIDR(pendingTotal)}</strong>
                  </div>
                  <button onClick={handleSaveBatch} disabled={saving} className="btn-primary" data-testid="order-save-batch-button">
                    {saving ? 'Menyimpan…' : `Simpan ${pendingOrders.length} Pesanan`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick View */}
      {quickView && <OrderQuickViewModal orders={quickView} onClose={() => setQuickView(null)} />}

      {/* Completion / Posting */}
      {completion && (
        <OrderCompletionModal
          orders={completion.orders}
          mode={completion.mode}
          onClose={() => setCompletion(null)}
          onDone={refreshData}
        />
      )}

      {/* Dialog hapus: item ini saja ATAU seluruh group */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Hapus Pesanan" data-testid="order-delete-modal">
        <p className="text-sm text-[#2e3b34]">
          Pilih cakupan penghapusan. Menghapus satu item <strong>tidak pernah</strong> menghapus pesanan lain dalam
          group.
        </p>
        <div className="mt-4 rounded-lg bg-[#FAF8F3] p-3 text-sm">
          <div>
            Item: <strong>{deleteTarget ? ORDER_TYPE_LABELS[deleteTarget.order.type] : ''}</strong>
          </div>
          <div className="text-xs text-[#5c6f64]">
            Group berisi {deleteTarget?.group.length} item pesanan
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary" data-testid="order-delete-cancel">
            Batal
          </button>
          <button onClick={() => handleDelete('item')} className="btn-danger" data-testid="order-delete-item-only">
            Hapus Item Ini Saja
          </button>
          {deleteTarget && deleteTarget.group.length > 1 && (
            <button onClick={() => handleDelete('group')} className="btn-danger" data-testid="order-delete-whole-group">
              Hapus Seluruh Group
            </button>
          )}
        </div>
      </Modal>

      {/* Dialog tambah item ke pesanan berjalan */}
      <Modal open={!!addItemTarget} onClose={() => setAddItemTarget(null)} title="Tambah Item ke Pesanan" data-testid="order-add-item-modal">
        <p className="mb-4 text-sm text-[#2e3b34]">
          Pilih tipe pesanan baru. Item akan memakai <strong>groupId</strong>, nama customer, dan deadline yang sama
          dengan group <strong>{addItemTarget?.order.customer_name}</strong>.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ORDER_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                if (!addItemTarget) return;
                setAddToGroup({
                  groupId: groupIdOf(addItemTarget.order),
                  customerName: addItemTarget.order.customer_name,
                  deadline: (addItemTarget.order.delivery_date || '').slice(0, 10),
                });
                setAddItemTarget(null);
                setActiveTab(t.id);
                setTimeout(() => {
                  document.getElementById('order-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
              }}
              className="btn-secondary justify-start"
              data-testid={`add-item-type-${t.id.replace(/_/g, '-')}`}
            >
              <Plus size={16} /> {t.label}
            </button>
          ))}
        </div>
      </Modal>

      {/* Konfirmasi bulk delete by status */}
      <Modal open={bulkConfirm} onClose={() => setBulkConfirm(false)} title="Hapus Pesanan by Status" data-testid="orders-bulk-delete-modal">
        <p className="text-sm text-[#2e3b34]">
          Hapus <strong>SEMUA</strong> pesanan berstatus{' '}
          <strong>
            {bulkDeleteStatus === 'Belum' ? 'Belum Selesai' : bulkDeleteStatus === 'Setengah' ? 'Setengah Jadi' : 'Selesai'}
          </strong>
          ? Tindakan ini tidak bisa dibatalkan.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setBulkConfirm(false)} className="btn-secondary" data-testid="bulk-delete-cancel">
            Batal
          </button>
          <button onClick={handleBulkDelete} className="btn-danger" data-testid="bulk-delete-confirm">
            Hapus Semua
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Orders;
