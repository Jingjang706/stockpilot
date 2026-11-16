import { useEffect, useState } from 'react'
import { Eye, Plus, Trash2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { Page, Product, Purchase, PurchaseStatus, Supplier } from '../lib/types'
import { formatDate, formatDateTime, formatMoney, titleCase } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { FilterSelect, Input, Select, Textarea } from '../components/ui/Form'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Card, EmptyState, ErrorState, PageHeader, Pagination, Spinner, tableClass, tdClass, theadClass, thClass, trClass } from '../components/ui/Display'
import { PurchaseStatusBadge } from '../components/ui/StatusBadges'

interface Line { productId: string; quantity: string; unitCost: string }

function CreatePurchase({ suppliers, products, onClose, onSaved }: { suppliers: Supplier[]; products: Product[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: '1', unitCost: '' }])
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string | null>(null)

  const setLine = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const pick = (i: number, productId: string) => {
    const p = products.find(x => String(x.id) === productId)
    setLine(i, { productId, unitCost: p?.costPrice != null ? String(p.costPrice) : '' })
  }
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0)

  function validate(): string | null {
    if (!supplierId) return 'Choose a supplier'
    const ids = lines.map(l => l.productId)
    if (ids.some(id => !id)) return 'Choose a product for every line'
    if (new Set(ids).size !== ids.length) return 'Each product can appear only once'
    if (lines.some(l => !(Number.isInteger(Number(l.quantity)) && Number(l.quantity) > 0))) return 'Quantities must be whole numbers above zero'
    if (lines.some(l => l.unitCost === '' || Number(l.unitCost) < 0)) return 'Enter a unit cost for every line'
    return null
  }

  async function submit() {
    const problem = validate()
    setErrors(problem)
    if (problem) return
    setBusy(true)
    try {
      await api.post('/api/purchases', {
        supplierId: Number(supplierId), notes: notes || undefined,
        items: lines.map(l => ({ productId: Number(l.productId), quantity: Number(l.quantity), unitCost: Number(l.unitCost) })),
      })
      toast.success('Purchase order created'); onSaved()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not create the order') } finally { setBusy(false) }
  }

  return (
    <Modal open wide title="New purchase order" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Create order</Button></>}>
      <div className="space-y-4">
        {errors && <div role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{errors}</div>}
        <Select label="Supplier" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
          <option value="">Select a supplier...</option>{suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <div className="space-y-2">
          <p className="text-sm font-medium">Items</p>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_6rem_auto] items-end gap-2">
              <Select label={i === 0 ? 'Product' : ''} aria-label={`Product line ${i + 1}`} value={l.productId} onChange={e => pick(i, e.target.value)}>
                <option value="">Select...</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
              </Select>
              <Input label={i === 0 ? 'Qty' : ''} aria-label={`Quantity line ${i + 1}`} type="number" min="1" step="1" value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} />
              <Input label={i === 0 ? 'Unit cost' : ''} aria-label={`Unit cost line ${i + 1}`} type="number" min="0" step="0.01" value={l.unitCost} onChange={e => setLine(i, { unitCost: e.target.value })} />
              <Button variant="ghost" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button size="sm" onClick={() => setLines(ls => [...ls, { productId: '', quantity: '1', unitCost: '' }])}><Plus className="h-4 w-4" /> Add line</Button>
        </div>
        <Textarea label="Notes (optional)" value={notes} maxLength={500} onChange={e => setNotes(e.target.value)} />
        <p className="text-right text-sm text-muted">Order total: <span className="tabular text-lg font-semibold text-ink">{formatMoney(total)}</span></p>
      </div>
    </Modal>
  )
}

function PurchaseDetail({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const { data: po, error, reload } = useAsync(() => api.get<Purchase>(`/api/purchases/${id}`), [id])
  const [confirm, setConfirm] = useState<'approve' | 'receive' | 'cancel' | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: 'approve' | 'receive' | 'cancel') {
    setBusy(true)
    try {
      await api.post(`/api/purchases/${id}/${action}`)
      toast.success(action === 'approve' ? 'Order approved' : action === 'receive' ? 'Goods received - stock updated' : 'Order cancelled')
      setConfirm(null); reload(); onChanged()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Action failed'); setConfirm(null) } finally { setBusy(false) }
  }

  return (
    <>
      <Modal open wide title={po ? po.poNumber : 'Purchase order'} onClose={onClose}
        footer={po && (po.status === 'PENDING' || po.status === 'APPROVED') && <>
          <Button variant="danger" onClick={() => setConfirm('cancel')}>Cancel order</Button>
          {po.status === 'PENDING' && <Button variant="primary" onClick={() => setConfirm('approve')}>Approve</Button>}
          {po.status === 'APPROVED' && <Button variant="primary" onClick={() => setConfirm('receive')}>Receive goods</Button>}
        </>}>
        {error ? <ErrorState message={error} onRetry={reload} /> : !po ? <Spinner /> : (
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-muted">Supplier</dt><dd className="font-medium">{po.supplierName}</dd></div>
              <div><dt className="text-muted">Status</dt><dd><PurchaseStatusBadge status={po.status} /></dd></div>
              <div><dt className="text-muted">Total</dt><dd className="tabular font-medium">{formatMoney(po.totalCost)}</dd></div>
              <div><dt className="text-muted">Created</dt><dd>{formatDateTime(po.createdAt)} by {po.createdBy}</dd></div>
              {po.approvedBy && <div><dt className="text-muted">Approved by</dt><dd>{po.approvedBy}</dd></div>}
              {po.receivedAt && <div><dt className="text-muted">Received</dt><dd>{formatDateTime(po.receivedAt)} by {po.receivedBy}</dd></div>}
            </dl>
            {po.notes && <p className="rounded-lg bg-raised px-3 py-2 text-sm">{po.notes}</p>}
            <table className={tableClass}>
              <thead className={theadClass}><tr><th className={thClass}>Product</th><th className={`${thClass} text-right`}>Qty</th><th className={`${thClass} text-right`}>Unit cost</th><th className={`${thClass} text-right`}>Line total</th></tr></thead>
              <tbody>{po.items.map(i => <tr key={i.productId} className={trClass}><td className={tdClass}>{i.productName}<div className="font-mono text-xs text-muted">{i.sku}</div></td><td className={`${tdClass} tabular text-right`}>{i.quantity}</td><td className={`${tdClass} tabular text-right`}>{formatMoney(i.unitCost)}</td><td className={`${tdClass} tabular text-right`}>{formatMoney(i.lineTotal)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!confirm} loading={busy} danger={confirm === 'cancel'} title={confirm === 'receive' ? 'Receive goods?' : confirm === 'approve' ? 'Approve order?' : 'Cancel order?'}
        confirmLabel={confirm === 'receive' ? 'Receive' : confirm === 'approve' ? 'Approve' : 'Cancel order'}
        message={confirm === 'receive' ? 'All items will be added to stock and the product cost prices will be updated. This can only be done once.' : confirm === 'approve' ? 'Approved orders can be received when the goods arrive.' : 'The order will be cancelled and can no longer be received.'}
        onCancel={() => setConfirm(null)} onConfirm={() => confirm && run(confirm)} />
    </>
  )
}

export default function PurchasesPage() {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  useEffect(() => { setPage(0) }, [status])

  const lookups = useAsync(async () => ({
    suppliers: await api.get<Supplier[]>('/api/suppliers'),
    products: (await api.get<Page<Product>>('/api/products', { size: 200, sort: 'name,asc' })).content,
  }), [])
  const { data, error, loading, reload } = useAsync(() => api.get<Page<Purchase>>('/api/purchases', { status, page, size: 15 }), [status, page])

  return (
    <>
      <PageHeader title="Purchase orders" subtitle="Order from suppliers and receive goods into stock"
        actions={<Button variant="primary" disabled={!lookups.data} onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New order</Button>} />
      <Card padded={false}>
        <div className="flex items-center gap-3 border-b p-4">
          <FilterSelect aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value as PurchaseStatus | '')}>
            <option value="">All statuses</option>{(['PENDING', 'APPROVED', 'RECEIVED', 'CANCELLED'] as PurchaseStatus[]).map(s => <option key={s} value={s}>{titleCase(s)}</option>)}
          </FilterSelect>
        </div>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Spinner /> : !data || data.content.length === 0 ? (
          <EmptyState title="No purchase orders" message="Create an order to restock from a supplier." />
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}><table className={tableClass}>
            <thead className={theadClass}><tr><th className={thClass}>PO</th><th className={thClass}>Supplier</th><th className={thClass}>Created</th><th className={thClass}>Status</th><th className={`${thClass} text-right`}>Items</th><th className={`${thClass} text-right`}>Total</th><th className={thClass}><span className="sr-only">View</span></th></tr></thead>
            <tbody>{data.content.map(p => (
              <tr key={p.id} className={`${trClass} cursor-pointer`} onClick={() => setOpenId(p.id)}>
                <td className={`${tdClass} font-mono text-xs`}>{p.poNumber}</td><td className={tdClass}>{p.supplierName}</td>
                <td className={`${tdClass} text-muted`}>{formatDate(p.createdAt)}</td><td className={tdClass}><PurchaseStatusBadge status={p.status} /></td>
                <td className={`${tdClass} tabular text-right`}>{p.items.length}</td><td className={`${tdClass} tabular text-right font-medium`}>{formatMoney(p.totalCost)}</td>
                <td className={`${tdClass} text-right`}><Button size="sm" variant="ghost" aria-label={`View ${p.poNumber}`} onClick={e => { e.stopPropagation(); setOpenId(p.id) }}><Eye className="h-4 w-4" /></Button></td>
              </tr>))}</tbody>
          </table></div>
        )}
        {data && <Pagination page={data.number} totalPages={data.totalPages} total={data.totalElements} onChange={setPage} />}
      </Card>
      {creating && lookups.data && <CreatePurchase suppliers={lookups.data.suppliers} products={lookups.data.products} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload() }} />}
      {openId !== null && <PurchaseDetail id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  )
}
