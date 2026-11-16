import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertTriangle, Plus, Wallet } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { MovementType, Movement, Page, Product, ValuationReport } from '../lib/types'
import { formatDateTime, formatMoney, titleCase } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { FilterInput, FilterSelect, Input, Select } from '../components/ui/Form'
import { Modal } from '../components/ui/Modal'
import { Card, EmptyState, ErrorState, PageHeader, Pagination, Spinner, Stat, tableClass, tdClass, theadClass, thClass, trClass } from '../components/ui/Display'
import { MovementBadge, StockBadge } from '../components/ui/StatusBadges'

const MANUAL_TYPES: MovementType[] = ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT']
const ALL_TYPES: MovementType[] = ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'SALE', 'REFUND', 'VOID', 'PURCHASE_RECEIPT']

const schema = z.object({
  productId: z.string().min(1, 'Choose a product'),
  type: z.enum(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT']),
  quantity: z.number({ invalid_type_error: 'Enter a whole number' }).int('Whole numbers only'),
  reason: z.string().trim().min(3, 'Give a reason (min 3 characters)').max(255),
  unitCost: z.number({ invalid_type_error: 'Enter a number' }).min(0).optional().or(z.nan().transform(() => undefined)),
}).superRefine((v, ctx) => {
  if (v.type !== 'ADJUSTMENT' && v.quantity <= 0) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Must be greater than zero' })
  if (v.type === 'ADJUSTMENT' && v.quantity === 0) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Cannot be zero' })
})
type FormValues = z.infer<typeof schema>

function MovementModal({ products, onClose, onSaved }: { products: Product[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema), defaultValues: { productId: '', type: 'STOCK_IN', quantity: 1, reason: '' },
  })
  const type = watch('type')
  const productId = watch('productId')
  const selected = products.find(p => String(p.id) === productId)

  async function onSubmit(v: FormValues) {
    try {
      await api.post('/api/inventory/movements', { productId: Number(v.productId), type: v.type, quantity: v.quantity, reason: v.reason, unitCost: v.unitCost })
      toast.success('Stock movement recorded')
      onSaved()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not record the movement') }
  }

  return (
    <Modal open title="Record stock movement" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={isSubmitting} onClick={handleSubmit(onSubmit)}>Record</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Select label="Product" error={errors.productId?.message} {...register('productId')}>
          <option value="">Select a product...</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku}) - {p.quantity} on hand</option>)}
        </Select>
        <Select label="Movement type" {...register('type')}>
          {MANUAL_TYPES.map(t => <option key={t} value={t}>{titleCase(t)}</option>)}
        </Select>
        <Input label={type === 'ADJUSTMENT' ? 'Quantity (use a negative number to remove stock)' : 'Quantity'} type="number" step="1"
          error={errors.quantity?.message} {...register('quantity', { valueAsNumber: true })}
          hint={selected ? `Current stock: ${selected.quantity}. Stock can never go below zero.` : undefined} />
        {type === 'STOCK_IN' && <Input label="Unit cost (optional)" type="number" step="0.01" min="0" error={errors.unitCost?.message} {...register('unitCost', { valueAsNumber: true })} />}
        <Input label="Reason" placeholder={type === 'ADJUSTMENT' ? 'e.g. Stocktake correction, damaged goods' : 'e.g. Supplier delivery, transfer'} error={errors.reason?.message} {...register('reason')} />
      </form>
    </Modal>
  )
}

export default function InventoryPage() {
  const [productId, setProductId] = useState('')
  const [type, setType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const [recording, setRecording] = useState(false)
  useEffect(() => { setPage(0) }, [productId, type, from, to])

  const products = useAsync(() => api.get<Page<Product>>('/api/products', { size: 200, sort: 'name,asc' }), [])
  const valuation = useAsync(() => api.get<ValuationReport>('/api/reports/inventory-valuation'), [])
  const low = useAsync(() => api.get<Product[]>('/api/inventory/low-stock'), [])
  const moves = useAsync(() => api.get<Page<Movement>>('/api/inventory/movements', { productId, type, from, to, page, size: 15 }), [productId, type, from, to, page])

  const refreshAll = () => { products.reload(); valuation.reload(); low.reload(); moves.reload() }

  return (
    <>
      <PageHeader title="Inventory" subtitle="Stock levels, valuation and every movement, recorded"
        actions={<Button variant="primary" onClick={() => setRecording(true)} disabled={!products.data}><Plus className="h-4 w-4" /> Record movement</Button>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Stock value (at cost)" value={valuation.data ? formatMoney(valuation.data.totalCostValue) : '...'} icon={<Wallet className="h-4 w-4" />} sub="Quantity x cost price, active products" />
        <Stat label="Stock value (at retail)" value={valuation.data ? formatMoney(valuation.data.totalRetailValue) : '...'} sub="Quantity x selling price" />
        <Stat label="Low-stock products" value={low.data ? low.data.length : '...'} icon={<AlertTriangle className="h-4 w-4 text-warn" />} sub="At or below minimum level" />
      </div>

      <div className="mb-6">
        <Card title="Low-stock alerts" padded={false}>
          {low.error ? <ErrorState message={low.error} onRetry={low.reload} /> : !low.data ? <Spinner /> : low.data.length === 0 ? (
            <EmptyState title="No low-stock products" message="Everything is above its minimum level." />
          ) : (
            <div className="overflow-x-auto"><table className={tableClass}>
              <thead className={theadClass}><tr><th className={thClass}>Product</th><th className={thClass}>Supplier</th><th className={`${thClass} text-right`}>On hand</th><th className={`${thClass} text-right`}>Minimum</th><th className={thClass}>Status</th></tr></thead>
              <tbody>{low.data.map(p => (
                <tr key={p.id} className={trClass}>
                  <td className={tdClass}><div className="font-medium">{p.name}</div><div className="font-mono text-xs text-muted">{p.sku}</div></td>
                  <td className={`${tdClass} text-muted`}>{p.supplierName ?? '-'}</td>
                  <td className={`${tdClass} tabular text-right font-medium`}>{p.quantity}</td>
                  <td className={`${tdClass} tabular text-right text-muted`}>{p.minStock}</td>
                  <td className={tdClass}><StockBadge status={p.stockStatus} /></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </Card>
      </div>

      <Card title="Inventory history" padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <FilterSelect aria-label="Filter by product" value={productId} onChange={e => setProductId(e.target.value)} className="max-w-[16rem]">
            <option value="">All products</option>{products.data?.content.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </FilterSelect>
          <FilterSelect aria-label="Filter by type" value={type} onChange={e => setType(e.target.value)}>
            <option value="">All types</option>{ALL_TYPES.map(t => <option key={t} value={t}>{titleCase(t)}</option>)}
          </FilterSelect>
          <FilterInput type="date" aria-label="From date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} className="w-36" />
          <span className="text-muted">to</span>
          <FilterInput type="date" aria-label="To date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} className="w-36" />
        </div>
        {moves.error ? <ErrorState message={moves.error} onRetry={moves.reload} /> : !moves.data ? <Spinner /> : moves.data.content.length === 0 ? (
          <EmptyState title="No movements match" message="Adjust the filters or record a movement." />
        ) : (
          <div className={`overflow-x-auto ${moves.loading ? 'opacity-60' : ''}`}><table className={tableClass}>
            <thead className={theadClass}><tr>
              <th className={thClass}>When</th><th className={thClass}>Product</th><th className={thClass}>Type</th>
              <th className={`${thClass} text-right`}>Change</th><th className={`${thClass} text-right`}>Balance</th><th className={thClass}>Reason / reference</th><th className={thClass}>By</th>
            </tr></thead>
            <tbody>{moves.data.content.map(m => (
              <tr key={m.id} className={trClass}>
                <td className={`${tdClass} whitespace-nowrap text-muted`}>{formatDateTime(m.createdAt)}</td>
                <td className={tdClass}><div className="font-medium">{m.productName}</div><div className="font-mono text-xs text-muted">{m.sku}</div></td>
                <td className={tdClass}><MovementBadge type={m.type} /></td>
                <td className={`${tdClass} tabular text-right font-medium ${m.quantityChange > 0 ? 'text-good' : 'text-bad'}`}>{m.quantityChange > 0 ? '+' : ''}{m.quantityChange}</td>
                <td className={`${tdClass} tabular text-right`}>{m.quantityAfter}</td>
                <td className={`${tdClass} text-muted`}>{m.reason ?? (m.referenceType ? `${titleCase(m.referenceType)} #${m.referenceId}` : '-')}</td>
                <td className={`${tdClass} text-muted`}>{m.createdBy ?? '-'}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        {moves.data && <Pagination page={moves.data.number} totalPages={moves.data.totalPages} total={moves.data.totalElements} onChange={setPage} />}
      </Card>

      {recording && products.data && <MovementModal products={products.data.content} onClose={() => setRecording(false)} onSaved={() => { setRecording(false); refreshAll() }} />}
    </>
  )
}
