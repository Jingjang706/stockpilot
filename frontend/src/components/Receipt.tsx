import type { Sale } from '../lib/types'
import { formatDateTime, formatMoney, titleCase } from '../lib/format'

/** Printable receipt. Wrap in an element with class `print-area` (the Modal body + print CSS handle the rest). */
export function Receipt({ sale }: { sale: Sale }) {
  return (
    <div className="print-area mx-auto w-full max-w-sm rounded-lg border bg-white p-5 font-mono text-[13px] leading-relaxed text-black">
      <div className="text-center">
        <p className="text-base font-bold tracking-wide">STOCKPILOT</p>
        <p className="text-xs">Sales receipt</p>
      </div>
      <div className="my-3 border-t border-dashed border-black/40" />
      <div className="space-y-0.5 text-xs">
        <div className="flex justify-between"><span>Receipt</span><span>{sale.receiptNumber}</span></div>
        <div className="flex justify-between"><span>Date</span><span>{formatDateTime(sale.createdAt)}</span></div>
        <div className="flex justify-between"><span>Cashier</span><span>{sale.cashierName}</span></div>
        {sale.status !== 'COMPLETED' && <div className="flex justify-between font-bold"><span>Status</span><span>{sale.status}</span></div>}
      </div>
      <div className="my-3 border-t border-dashed border-black/40" />
      <table className="w-full">
        <tbody>
          {sale.items.map(i => (
            <tr key={i.productId} className="align-top">
              <td className="pr-2">{i.productName}<div className="text-[11px] text-black/60">{i.quantity} x {formatMoney(i.unitPrice)}</div></td>
              <td className="text-right">{formatMoney(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="my-3 border-t border-dashed border-black/40" />
      <div className="space-y-0.5">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(sale.subtotal)}</span></div>
        {sale.discountAmount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{formatMoney(sale.discountAmount)}</span></div>}
        <div className="flex justify-between text-base font-bold"><span>TOTAL</span><span>{formatMoney(sale.total)}</span></div>
        {sale.payments.map((p, i) => (
          <div key={i} className="flex justify-between text-xs"><span>Paid by {titleCase(p.method)}{p.reference ? ` (${p.reference})` : ''}</span><span>{formatMoney(p.amount)}</span></div>
        ))}
      </div>
      <div className="my-3 border-t border-dashed border-black/40" />
      <p className="text-center text-xs">Thank you for your purchase!</p>
    </div>
  )
}
