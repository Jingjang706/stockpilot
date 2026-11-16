import { useEffect, useState } from 'react'
import { Eye, Printer, Search } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { Page, Sale, SaleStatus, SaleSummary } from '../lib/types'
import { formatDateTime, formatMoney, titleCase } from '../lib/format'
import { useAsync, useDebounced } from '../lib/useAsync'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { FilterInput, FilterSelect, Textarea } from '../components/ui/Form'
import { Modal } from '../components/ui/Modal'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, Spinner, tableClass, tdClass, theadClass, thClass, trClass } from '../components/ui/Display'
import { SaleStatusBadge } from '../components/ui/StatusBadges'
import { Receipt } from '../components/Receipt'

function SaleDetail({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { hasRole } = useAuth()
  const toast = useToast()
  const canReverse = hasRole('ADMIN', 'MANAGER')
  const { data: sale, error, reload } = useAsync(() => api.get<Sale>(`/api/sales/${id}`), [id])
  const [action, setAction] = useState<'void' | 'refund' | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (reason.trim().length < 3) { toast.error('Please give a reason (min 3 characters)'); return }
    setBusy(true)
    try {
      await api.post(`/api/sales/${id}/${action}`, { reason: reason.trim() })
      toast.success(action === 'void' ? 'Sale voided and stock restored' : 'Sale refunded and stock restored')
      setAction(null); setReason(''); reload(); onChanged()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Action failed') } finally { setBusy(false) }
  }

  return (
    <Modal open title={sale ? `Sale ${sale.receiptNumber}` : 'Sale'} onClose={onClose}
      footer={sale && <>
        {canReverse && sale.status === 'COMPLETED' && !action && <>
          <Button variant="danger" onClick={() => setAction('void')}>Void</Button>
          <Button onClick={() => setAction('refund')}>Refund</Button>
        </>}
        {action && <>
          <Button onClick={() => { setAction(null); setReason('') }}>Back</Button>
          <Button variant="danger" loading={busy} onClick={submit}>Confirm {action}</Button>
        </>}
        {!action && <Button variant="primary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>}
      </>}>
      {error ? <ErrorState message={error} onRetry={reload} /> : !sale ? <Spinner /> : (
        <div className="space-y-4">
          {action ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">{action === 'void'
                ? 'Voiding cancels a mistaken sale made today and returns every item to stock.'
                : 'Refunding returns every item to stock and marks the sale as refunded. This cannot be undone.'}</p>
              <Textarea label="Reason (recorded in the audit log)" value={reason} onChange={e => setReason(e.target.value)} maxLength={255} autoFocus />
            </div>
          ) : (
            <>
              <div className="no-print flex flex-wrap items-center gap-3 text-sm">
                <SaleStatusBadge status={sale.status} />
                {sale.cogs !== null && <span className="text-muted">Cost of goods: <span className="tabular font-medium text-ink">{formatMoney(sale.cogs)}</span> - Gross profit: <span className="tabular font-medium text-ink">{formatMoney(sale.total - sale.cogs)}</span></span>}
              </div>
              {sale.reversalReason && (
                <div className="no-print rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm">
                  {titleCase(sale.status)} by {sale.reversedBy} on {formatDateTime(sale.reversedAt)}: <span className="font-medium">{sale.reversalReason}</span>
                </div>
              )}
              <Receipt sale={sale} />
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

export default function SalesPage() {
  const { hasRole } = useAuth()
  const isCashier = hasRole('CASHIER')
  const [receipt, setReceipt] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<number | null>(null)
  const search = useDebounced(receipt)
  useEffect(() => { setPage(0) }, [search, status, from, to])

  const { data, error, loading, reload } = useAsync(() => api.get<Page<SaleSummary>>('/api/sales', { receipt: search, status, from, to, page, size: 15 }), [search, status, from, to, page])

  return (
    <>
      <PageHeader title={isCashier ? 'My sales' : 'Sales'} subtitle={isCashier ? 'Transactions you have processed' : 'All transactions, with void and refund controls'} />
      <Card padded={false}>
        <div className="no-print flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <FilterInput className="pl-9" placeholder="Search receipt number" aria-label="Search by receipt number" value={receipt} onChange={e => setReceipt(e.target.value)} />
          </div>
          <FilterSelect aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value as SaleStatus | '')}>
            <option value="">All statuses</option>{(['COMPLETED', 'VOIDED', 'REFUNDED'] as SaleStatus[]).map(s => <option key={s} value={s}>{titleCase(s)}</option>)}
          </FilterSelect>
          <FilterInput type="date" aria-label="From date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} className="w-36" />
          <span className="text-muted">to</span>
          <FilterInput type="date" aria-label="To date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} className="w-36" />
        </div>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Spinner /> : !data || data.content.length === 0 ? (
          <EmptyState title="No sales found" message="Adjust the filters, or make a sale from the Point of Sale." />
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}><table className={tableClass}>
            <thead className={theadClass}><tr>
              <th className={thClass}>Receipt</th><th className={thClass}>Date</th>{!isCashier && <th className={thClass}>Cashier</th>}
              <th className={thClass}>Payment</th><th className={`${thClass} text-right`}>Items</th><th className={`${thClass} text-right`}>Total</th><th className={thClass}>Status</th><th className={thClass}><span className="sr-only">View</span></th>
            </tr></thead>
            <tbody>{data.content.map(s => (
              <tr key={s.id} className={`${trClass} cursor-pointer`} onClick={() => setOpenId(s.id)}>
                <td className={`${tdClass} font-mono text-xs`}>{s.receiptNumber}</td>
                <td className={`${tdClass} whitespace-nowrap text-muted`}>{formatDateTime(s.createdAt)}</td>
                {!isCashier && <td className={tdClass}>{s.cashierName}</td>}
                <td className={tdClass}>{s.paymentMethod ? <Badge>{titleCase(s.paymentMethod)}</Badge> : '-'}</td>
                <td className={`${tdClass} tabular text-right`}>{s.itemCount}</td>
                <td className={`${tdClass} tabular text-right font-medium`}>{formatMoney(s.total)}</td>
                <td className={tdClass}><SaleStatusBadge status={s.status} /></td>
                <td className={`${tdClass} text-right`}><Button size="sm" variant="ghost" aria-label={`View ${s.receiptNumber}`} onClick={e => { e.stopPropagation(); setOpenId(s.id) }}><Eye className="h-4 w-4" /></Button></td>
              </tr>))}</tbody>
          </table></div>
        )}
        {data && <Pagination page={data.number} totalPages={data.totalPages} total={data.totalElements} onChange={setPage} />}
      </Card>
      {openId !== null && <SaleDetail id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  )
}
