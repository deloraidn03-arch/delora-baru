import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Modal } from '../Modal';
import { CurrencyInput } from '../CurrencyInput';
import { SearchableSelect } from '../SearchableSelect';
import { Order, ORDER_TYPE_LABELS, Product, RequestItem } from '../../lib/types';
import { formatIDR } from '../../lib/format';
import { calculatePostingNominal, getRequestItemSubtotal } from '../../lib/orderCalculations';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { adjustAccountBalance, adjustProductStock } from '../../lib/balances';

interface Props {
  orders: Order[] | null; // satu group
  mode: 'edit' | 'posting' | 'review';
  onClose: () => void;
  onDone: () => void;
}

interface InvRow {
  product_id: string;
  quantity: number;
}

const PAYMENT_VIA: Record<string, string> = {
  Cash: 'cash',
  'ATM/Bank': 'atm',
  Tabungan: 'tabungan',
  BRILINK: 'brilink_cash',
};

const OrderCompletionModal: React.FC<Props> = ({ orders, mode, onClose, onDone }) => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, RequestItem[]>>({});
  const [invRows, setInvRows] = useState<InvRow[]>([]);
  const [paymentVia, setPaymentVia] = useState('Cash');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!orders?.length || !user) return;
    setItemsByOrder(
      Object.fromEntries(orders.map((o) => [o.id, (o.metadata?.customRequests || []).map((it) => ({ ...it }))]))
    );
    (async () => {
      const ids = orders.map((o) => o.id);
      const [pRes, invRes] = await Promise.all([
        supabase.from('products').select('*').eq('user_id', user.id).order('name'),
        supabase.from('order_inventory_items').select('*').in('order_id', ids),
      ]);
      setProducts((pRes.data as Product[]) || []);
      setInvRows(
        (invRes.data || []).map((r: any) => ({ product_id: r.product_id, quantity: Number(r.quantity) || 0 }))
      );
    })();
  }, [orders, user]);

  const summary = useMemo(() => {
    if (!orders?.length) return null;
    // Gunakan harga_asli yang sudah diedit user di modal
    const patched = orders.map((o) => ({
      ...o,
      metadata: { ...o.metadata, customRequests: itemsByOrder[o.id] || o.metadata?.customRequests || [] },
    }));
    return calculatePostingNominal(patched as Order[]);
  }, [orders, itemsByOrder]);

  if (!orders || !summary) return null;
  const readOnly = mode === 'review';

  const setItem = (orderId: string, idx: number, patch: Partial<RequestItem>) => {
    setItemsByOrder((prev) => {
      const list = [...(prev[orderId] || [])];
      list[idx] = { ...list[idx], ...patch };
      return { ...prev, [orderId]: list };
    });
  };

  // Simpan draft item (harga_asli dsb) tanpa mengubah status
  const handleSaveSementara = async () => {
    if (!user) return toast.error('User not authenticated');
    setSaving(true);
    for (const o of orders) {
      const items = itemsByOrder[o.id] || [];
      const metadata = { ...o.metadata, customRequests: items };
      await supabase.from('orders').update({ metadata }).eq('id', o.id);
      await supabase.from('order_request_items').delete().eq('order_id', o.id);
      const valid = items.filter((it) => (it.itemName || '').trim());
      if (valid.length) {
        await supabase.from('order_request_items').insert(
          valid.map((it) => ({
            order_id: o.id,
            user_id: user.id,
            item_name: it.itemName.trim(),
            qty: Number(it.qty) || 1,
            harga_invoice: Number(it.harga_invoice ?? it.price) || 0,
            harga_asli: Number(it.harga_asli) || 0,
          }))
        );
      }
    }
    setSaving(false);
    toast.success('Draft item berhasil disimpan');
    onDone();
  };

  // Simpan pemakaian bahan ke order_inventory_items
  const handleSaveToInventory = async () => {
    if (!user) return toast.error('User not authenticated');
    setSaving(true);
    const ids = orders.map((o) => o.id);
    await supabase.from('order_inventory_items').delete().in('order_id', ids);
    const valid = invRows.filter((r) => r.product_id && r.quantity > 0);
    if (valid.length) {
      // Pemakaian bahan dicatat pada pesanan pertama dalam group
      await supabase.from('order_inventory_items').insert(
        valid.map((r) => ({ order_id: ids[0], user_id: user.id, product_id: r.product_id, quantity: r.quantity }))
      );
    }
    setSaving(false);
    toast.success('Pemakaian bahan disimpan ke inventory pesanan');
    onDone();
  };

  // Selesai TANPA potong stok: hanya set status, tanpa transaksi
  const handleSelesai = async () => {
    setSaving(true);
    const ids = orders.map((o) => o.id);
    const { error } = await supabase.from('orders').update({ status: 'Selesai' }).in('id', ids);
    setSaving(false);
    if (error) return toast.error('Gagal mengubah status: ' + error.message);
    toast.success('Pesanan ditandai Selesai (stok TIDAK dipotong)');
    onDone();
    onClose();
  };

  // Post ke Penjualan: transaksi sale_custom + saldo + potong stok + set Lunas
  const handlePost = async () => {
    if (!user) return toast.error('User not authenticated');
    if (!paymentVia) return toast.error('Pilih metode Terima Pembayaran Via');
    setSaving(true);
    const ids = orders.map((o) => o.id);

    // 1. Simpan item terbaru dulu agar harga_asli terkini
    for (const o of orders) {
      const items = itemsByOrder[o.id] || [];
      await supabase.from('orders').update({ metadata: { ...o.metadata, customRequests: items } }).eq('id', o.id);
    }
    // Simpan juga pemakaian inventory
    await supabase.from('order_inventory_items').delete().in('order_id', ids);
    const validInv = invRows.filter((r) => r.product_id && r.quantity > 0);
    if (validInv.length) {
      await supabase.from('order_inventory_items').insert(
        validInv.map((r) => ({ order_id: ids[0], user_id: user.id, product_id: r.product_id, quantity: r.quantity }))
      );
    }

    // 2. Buat transaksi sale_custom
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        type: 'sale_custom',
        amount: summary.nominal,
        date: new Date().toISOString(),
        customer_name: orders[0].customer_name,
        metadata: {
          subType: 'bouquet',
          grouped: orders.length > 1,
          source_order_ids: ids,
          total_biaya_request: summary.costTotal,
          customerName: orders[0].customer_name,
          paymentAccount: PAYMENT_VIA[paymentVia],
        },
      })
      .select()
      .single();
    if (txErr || !tx) {
      setSaving(false);
      return toast.error('Gagal posting ke penjualan: ' + (txErr?.message || ''));
    }

    // 3. Tambah saldo akun sesuai Terima Pembayaran Via
    await adjustAccountBalance(user.id, PAYMENT_VIA[paymentVia], summary.nominal);

    // 4. Kurangi stok dari order_inventory_items
    for (const r of validInv) {
      await adjustProductStock(r.product_id, -r.quantity);
    }
    // Untuk custom product: kurangi juga komponen produk inventory yang dipilih
    for (const o of orders) {
      if (o.type === 'custom_product' && o.metadata?.inventoryProductId) {
        const p = products.find((x) => x.id === o.metadata?.inventoryProductId);
        if (p) {
          if (p.type === 'custom' && Array.isArray(p.items) && p.items.length) {
            for (const comp of p.items) await adjustProductStock(comp.productId, -(Number(comp.quantity) || 0));
          } else {
            await adjustProductStock(p.id, -1);
          }
        }
      }
    }

    // 5. Set pesanan Lunas + isi penjualan_id
    for (const o of orders) {
      await supabase
        .from('orders')
        .update({
          jumlah_dp: o.total_price,
          sisa_pembayaran: 0,
          penjualan_id: tx.id,
          metadata: { ...o.metadata, customRequests: itemsByOrder[o.id] || o.metadata?.customRequests || [], paymentStatus: 'Lunas' },
        })
        .eq('id', o.id);
    }

    setSaving(false);
    toast.success(`Pesanan di-post ke Penjualan: ${formatIDR(summary.nominal)}`);
    onDone();
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${mode === 'posting' ? 'Selesaikan / Posting' : mode === 'edit' ? 'Edit Penyelesaian' : 'Review'} — ${orders[0].customer_name}`}
      wide
      data-testid="order-completion-modal"
    >
      <div className="space-y-5">
        {mode !== 'review' && (
          <div className="flex items-start gap-2 rounded-lg border border-[#ffe082] bg-[#fff8e1] px-3 py-2 text-xs text-[#8a6d00]" data-testid="completion-stock-warning">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Tombol <strong>&quot;Selesai (tanpa potong stok)&quot;</strong> hanya mengubah status — tidak membuat
              transaksi dan tidak mengurangi stok. Stok hanya berkurang lewat <strong>&quot;Post ke Penjualan&quot;</strong>.
            </span>
          </div>
        )}

        {/* 1. Item by Request — harga_asli bisa diubah sebelum posting */}
        <div>
          <h3 className="label-base">Item by Request</h3>
          <div className="space-y-3">
            {orders.map((o) => (
              <div key={o.id} className="rounded-lg border border-[#e2e8e4] p-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#6f8f7f]">
                  {ORDER_TYPE_LABELS[o.type]}
                </div>
                {(itemsByOrder[o.id] || []).length === 0 && (
                  <div className="text-xs text-[#93a298]">Tidak ada item request</div>
                )}
                <div className="space-y-2">
                  {(itemsByOrder[o.id] || []).map((it, idx) => (
                    <div key={idx} className="grid grid-cols-2 gap-2 rounded-lg bg-[#f6f8f6] p-2 sm:grid-cols-4">
                      <div className="col-span-2 sm:col-span-1">
                        <div className="text-sm font-medium">{it.itemName} × {it.qty}</div>
                        <div className="text-xs text-[#5c6f64]">Invoice: {formatIDR(getRequestItemSubtotal(it))}</div>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase text-[#5c6f64]">Harga Asli (modal)</label>
                        <CurrencyInput
                          value={Number(it.harga_asli) || 0}
                          onChange={(v) => setItem(o.id, idx, { harga_asli: v })}
                          disabled={readOnly}
                          data-testid={`completion-harga-asli-${o.id}-${idx}`}
                        />
                      </div>
                      <div className="flex items-end text-xs text-[#5c6f64]">
                        Modal total: {formatIDR((Number(it.harga_asli) || 0) * (Number(it.qty) || 1))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Item dari Inventory (pengurangan stok) */}
        {!readOnly && (
          <div>
            <h3 className="label-base">Item dari Inventory (pengurangan stok)</h3>
            <div className="space-y-2">
              {invRows.map((r, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-1">
                    <SearchableSelect
                      options={products.map((p) => ({ value: p.id, label: p.name, hint: `stok ${p.stock}` }))}
                      value={r.product_id}
                      onChange={(v) => {
                        const rows = [...invRows];
                        rows[idx] = { ...r, product_id: v };
                        setInvRows(rows);
                      }}
                      placeholder="Pilih produk"
                      data-testid={`completion-inv-product-${idx}`}
                    />
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="input-base w-20"
                    placeholder="Qty"
                    value={r.quantity || ''}
                    onChange={(e) => {
                      const rows = [...invRows];
                      rows[idx] = { ...r, quantity: Number(e.target.value) || 0 };
                      setInvRows(rows);
                    }}
                    data-testid={`completion-inv-qty-${idx}`}
                  />
                  <button
                    type="button"
                    onClick={() => setInvRows(invRows.filter((_, i) => i !== idx))}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#c62828] hover:bg-[#ffebee]"
                    data-testid={`completion-inv-remove-${idx}`}
                    aria-label="Hapus baris"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setInvRows([...invRows, { product_id: '', quantity: 1 }])}
                className="btn-secondary w-full"
                data-testid="completion-inv-add-row"
              >
                + Tambah Baris Inventory
              </button>
            </div>
          </div>
        )}

        {/* 3. Terima Pembayaran Via (wajib saat posting) */}
        {mode === 'posting' && (
          <div>
            <h3 className="label-base">Terima Pembayaran Via *</h3>
            <select
              className="input-base"
              value={paymentVia}
              onChange={(e) => setPaymentVia(e.target.value)}
              data-testid="completion-payment-via"
            >
              {Object.keys(PAYMENT_VIA).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Ringkasan nominal ke penjualan — tiap komponen baris terpisah */}
        <div className="space-y-1 rounded-lg bg-[#edf3f0] p-4 text-sm" data-testid="completion-summary">
          <div className="flex justify-between">
            <span>Harga Jasa (setelah diskon)</span>
            <span>{formatIDR(summary.serviceFee)}</span>
          </div>
          <div className="flex justify-between">
            <span>Total H.Invoice Request (+)</span>
            <span>{formatIDR(summary.invoiceTotal)}</span>
          </div>
          <div className="flex justify-between text-[#c62828]">
            <span>Total Harga Asli Request (−)</span>
            <span>− {formatIDR(summary.costTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Ongkir (+)</span>
            <span>{formatIDR(summary.ongkir)}</span>
          </div>
          <div className="flex justify-between border-t border-[#d8e0da] pt-1 text-base font-bold">
            <span>Nominal ke Penjualan</span>
            <span data-testid="completion-nominal">{formatIDR(summary.nominal)}</span>
          </div>
        </div>

        {!readOnly && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button onClick={handleSaveSementara} disabled={saving} className="btn-secondary" data-testid="completion-save-draft">
              Simpan Sementara
            </button>
            <button onClick={handleSaveToInventory} disabled={saving} className="btn-secondary" data-testid="completion-save-inventory">
              Simpan ke Inventory
            </button>
            <button onClick={handleSelesai} disabled={saving} className="btn-secondary" data-testid="completion-mark-done">
              Selesai (tanpa potong stok)
            </button>
            {mode === 'posting' && (
              <button onClick={handlePost} disabled={saving} className="btn-primary" data-testid="completion-post-button">
                {saving ? 'Memproses…' : 'Post ke Penjualan'}
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default OrderCompletionModal;
