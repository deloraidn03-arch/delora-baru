import React, { useMemo } from 'react';
import { toast } from 'sonner';
import { Copy, Printer } from 'lucide-react';
import { Modal } from '../Modal';
import { Order, ORDER_TYPE_LABELS } from '../../lib/types';
import { formatIDR, formatDate } from '../../lib/format';
import {
  calculateOrderTotal,
  getDiscountedServiceFee,
  getMoneyTotal,
  getRequestItemSubtotal,
} from '../../lib/orderCalculations';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  orders: Order[] | null; // seluruh pesanan dalam satu group
  onClose: () => void;
}

const OrderQuickViewModal: React.FC<Props> = ({ orders, onClose }) => {
  const { user } = useAuth();

  const agg = useMemo(() => {
    if (!orders?.length) return null;
    const grandTotal = orders.reduce((s, o) => s + calculateOrderTotal(o), 0);
    const totalDp = orders.reduce((s, o) => s + (Number(o.jumlah_dp) || 0), 0);
    const ongkir = orders.reduce((s, o) => s + (Number(o.metadata?.ongkir) || 0), 0);
    // Sisa pembayaran dihitung reaktif dari props — jangan menjumlah kolom DB (bisa basi setelah edit)
    const sisa = Math.max(0, grandTotal - totalDp);
    return { grandTotal, totalDp, ongkir, sisa };
  }, [orders]);

  if (!orders || !agg) return null;
  const first = orders[0];

  const buildWhatsAppMessage = (): string => {
    const lines: string[] = [];
    lines.push('*DELORA — Bloom & Gift*');
    lines.push('Invoice Pesanan');
    lines.push(`Customer: ${first.customer_name}`);
    lines.push(`Deadline: ${formatDate(first.delivery_date)}`);
    lines.push('——————————————');
    orders.forEach((o, i) => {
      lines.push(`*${i + 1}. ${ORDER_TYPE_LABELS[o.type]}*`);
      if (o.type === 'money_bouquet' && o.metadata?.moneyItems?.length) {
        for (const m of o.metadata.moneyItems) {
          lines.push(`   Uang ${formatIDR(m.nominal)} × ${m.quantity} lbr = ${formatIDR(m.nominal * m.quantity)}`);
        }
      }
      for (const it of o.metadata?.customRequests || []) {
        lines.push(`   - ${it.itemName} × ${it.qty} @ ${formatIDR(it.harga_invoice ?? it.price ?? 0)} = ${formatIDR(getRequestItemSubtotal(it))}`);
      }
      if (o.type === 'flower_bouquet' && o.metadata?.bouquetType) lines.push(`   Jenis: ${o.metadata.bouquetType}`);
      if (o.type === 'custom_product' && o.metadata?.productType) lines.push(`   Produk: ${o.metadata.productType}`);
      if (Number(o.metadata?.serviceFee)) lines.push(`   Harga Jasa: ${formatIDR(o.metadata.serviceFee)}`);
      if (Number(o.metadata?.discount)) lines.push(`   Diskon jasa: ${o.metadata.discount}% (−${formatIDR((Number(o.metadata?.serviceFee) || 0) - getDiscountedServiceFee(o))})`);
      lines.push(`   Subtotal: ${formatIDR(calculateOrderTotal(o) - (Number(o.metadata?.ongkir) || 0))}`);
    });
    lines.push('——————————————');
    lines.push(`Ongkir (Pengiriman): ${formatIDR(agg.ongkir)}`);
    lines.push(`*Grand Total: ${formatIDR(agg.grandTotal)}*`);
    lines.push(`Total DP: ${formatIDR(agg.totalDp)}`);
    lines.push(`*Sisa Pembayaran: ${formatIDR(agg.sisa)}*`);
    lines.push('——————————————');
    lines.push('Pembayaran:');
    lines.push('BRI');
    lines.push('a.n. Pemilik Delora');
    lines.push('No Rek: -');
    lines.push('');
    lines.push('BCA');
    lines.push('I Nyoman Tri Adnyana');
    lines.push('No Rek: 3950716265');
    return lines.join('\n');
  };

  const handleCopy = async () => {
    const text = buildWhatsAppMessage();
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Pesan WhatsApp disalin');
    } catch {
      // Fallback untuk konteks tanpa Clipboard API (http/iframe/headless)
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast.success('Pesan WhatsApp disalin');
      } catch {
        toast.error('Gagal menyalin pesan');
      }
    }
  };

  const invoiceHtml = (rows: Order[]): string => {
    const g = rows.reduce((s, o) => s + calculateOrderTotal(o), 0);
    const dp = rows.reduce((s, o) => s + (Number(o.jumlah_dp) || 0), 0);
    const ongkir = rows.reduce((s, o) => s + (Number(o.metadata?.ongkir) || 0), 0);
    const sisa = Math.max(0, g - dp);
    const body = rows
      .map((o, i) => {
        const items: string[] = [];
        if (o.type === 'money_bouquet') {
          for (const m of o.metadata?.moneyItems || []) {
            items.push(
              `<tr><td>Uang pecahan ${formatIDR(m.nominal)}</td><td class="r">${m.quantity} lbr</td><td class="r">${formatIDR(m.nominal * m.quantity)}</td></tr>`
            );
          }
        }
        for (const it of o.metadata?.customRequests || []) {
          items.push(
            `<tr><td>${it.itemName}</td><td class="r">${it.qty} × ${formatIDR(it.harga_invoice ?? it.price ?? 0)}</td><td class="r">${formatIDR(getRequestItemSubtotal(it))}</td></tr>`
          );
        }
        if (Number(o.metadata?.serviceFee)) {
          items.push(
            `<tr><td>Harga Jasa${Number(o.metadata?.discount) ? ` (diskon ${o.metadata.discount}%)` : ''}</td><td class="r"></td><td class="r">${formatIDR(getDiscountedServiceFee(o))}</td></tr>`
          );
        }
        return `<tr class="sec"><td colspan="3">${i + 1}. ${ORDER_TYPE_LABELS[o.type]}${
          o.notes ? ` — ${o.notes}` : ''
        }</td></tr>${items.join('')}`;
      })
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice Delora</title><style>
      body{font-family:Arial,sans-serif;font-size:9pt;color:#2e3b34;margin:16px;}
      .bar{height:4px;background:#8caa9a;margin-bottom:8px;}
      h1{font-size:14pt;margin:0;letter-spacing:2px;} .sub{font-size:8pt;color:#5c6f64;margin-bottom:10px;}
      table{width:100%;border-collapse:collapse;} td{padding:3px 4px;border-bottom:1px solid #eee;vertical-align:top;}
      .sec td{background:#edf3f0;font-weight:bold;} .r{text-align:right;white-space:nowrap;}
      .tot td{font-weight:bold;border-top:2px solid #8caa9a;} .foot{margin-top:14px;font-size:8pt;white-space:pre-wrap;}
      @media print { body { margin: 8px; } }
    </style></head><body>
      <div class="bar"></div>
      <h1>DELORA</h1><div class="sub">Bloom &amp; Gift — Invoice Pesanan</div>
      <div style="font-size:9pt;margin-bottom:8px;">Customer: <b>${first.customer_name}</b><br>Deadline: ${formatDate(first.delivery_date)}<br>Tanggal cetak: ${formatDate(new Date().toISOString())}</div>
      <table>${body}
      <tr><td>Ongkir (Pengiriman)</td><td class="r"></td><td class="r">${formatIDR(ongkir)}</td></tr>
      <tr class="tot"><td>Grand Total</td><td class="r"></td><td class="r">${formatIDR(g)}</td></tr>
      <tr><td>Total DP</td><td class="r"></td><td class="r">${formatIDR(dp)}</td></tr>
      <tr class="tot"><td>Sisa Pembayaran</td><td class="r"></td><td class="r">${formatIDR(sisa)}</td></tr>
      </table>
      <div class="foot">Pembayaran:\nBRI — a.n. Pemilik Delora — No Rek: -\n\nBCA — I Nyoman Tri Adnyana — No Rek: 3950716265</div>
      <script>window.onload=function(){window.print();}</script>
    </body></html>`;
  };

  // Multi-order: re-fetch berdasarkan groupId agar isi PDF sinkron
  const handlePrint = async () => {
    let rows = orders;
    const gid = first.metadata?.groupId;
    if (gid && user) {
      const { data } = await supabase.from('orders').select('*').eq('user_id', user.id).contains('metadata', { groupId: gid });
      if (data?.length) rows = data as Order[];
    }
    const w = window.open('', '_blank');
    if (!w) return toast.error('Popup diblokir browser — izinkan popup untuk mencetak PDF');
    w.document.write(invoiceHtml(rows));
    w.document.close();
  };

  return (
    <Modal open onClose={onClose} title={`Detail Pesanan — ${first.customer_name}`} wide data-testid="order-quickview-modal">
      <div className="space-y-4">
        {orders.map((o, i) => (
          <div key={o.id} className="rounded-lg border border-[#e2e8e4] p-3" data-testid={`quickview-order-${o.id}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-[#2e3b34]">
                {i + 1}. {ORDER_TYPE_LABELS[o.type]}
              </span>
              <span className="text-xs text-[#5c6f64]">{formatDate(o.delivery_date)}</span>
            </div>
            <div className="space-y-1 text-sm">
              {o.type === 'money_bouquet' &&
                (o.metadata?.moneyItems || []).map((m, j) => (
                  <div key={j} className="flex justify-between">
                    <span>
                      Uang {formatIDR(m.nominal)} × {m.quantity} lbr
                    </span>
                    <span className="font-medium">{formatIDR(m.nominal * m.quantity)}</span>
                  </div>
                ))}
              {(o.metadata?.customRequests || []).map((it, j) => (
                <div key={j} className="flex justify-between">
                  <span>
                    {it.itemName} × {it.qty}
                  </span>
                  <span className="font-medium">{formatIDR(getRequestItemSubtotal(it))}</span>
                </div>
              ))}
              {o.type === 'flower_bouquet' && o.metadata?.bouquetType && (
                <div className="text-[#5c6f64]">Jenis bouquet: {o.metadata.bouquetType}</div>
              )}
              {o.type === 'custom_product' && o.metadata?.productType && (
                <div className="text-[#5c6f64]">Jenis produk: {o.metadata.productType}</div>
              )}
              {Number(o.metadata?.serviceFee) > 0 && (
                <div className="flex justify-between">
                  <span>Harga Jasa{Number(o.metadata?.discount) ? ` (diskon ${o.metadata.discount}%)` : ''}</span>
                  <span className="font-medium">{formatIDR(getDiscountedServiceFee(o))}</span>
                </div>
              )}
              {o.notes && <div className="text-xs italic text-[#93a298]">{o.notes}</div>}
            </div>
            <div className="mt-2 flex justify-between border-t border-[#eef2ef] pt-2 text-sm font-semibold">
              <span>Subtotal</span>
              <span>{formatIDR(calculateOrderTotal(o) - (Number(o.metadata?.ongkir) || 0))}</span>
            </div>
            {o.type === 'money_bouquet' && getMoneyTotal(o) > 0 && (
              <div className="text-right text-[11px] text-[#93a298]">
                (termasuk uang tunai {formatIDR(getMoneyTotal(o))})
              </div>
            )}
          </div>
        ))}

        <div className="space-y-1 rounded-lg bg-[#edf3f0] p-4 text-sm">
          <div className="flex justify-between">
            <span>Ongkir (Pengiriman)</span>
            <span>{formatIDR(agg.ongkir)}</span>
          </div>
          <div className="flex justify-between border-t border-[#d8e0da] pt-1 text-base font-bold" data-testid="quickview-grand-total">
            <span>Grand Total</span>
            <span>{formatIDR(agg.grandTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Total DP</span>
            <span>{formatIDR(agg.totalDp)}</span>
          </div>
          <div className="flex justify-between font-bold text-[#c62828]" data-testid="quickview-sisa">
            <span>Sisa Pembayaran</span>
            <span>{formatIDR(agg.sisa)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button onClick={handleCopy} className="btn-secondary" data-testid="quickview-copy-wa">
            <Copy size={16} /> Salin Pesan WhatsApp
          </button>
          <button onClick={handlePrint} className="btn-primary" data-testid="quickview-print-pdf">
            <Printer size={16} /> Cetak PDF Invoice
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default OrderQuickViewModal;
