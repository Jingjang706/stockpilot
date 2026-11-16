import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, Mail, Pencil, Phone, Plus } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { Product, Purchase, Supplier } from '../lib/types'
import { formatDate, formatMoney } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Form'
import { Modal } from '../components/ui/Modal'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner, tableClass, tdClass, theadClass, thClass, trClass } from '../components/ui/Display'
import { PurchaseStatusBadge, StockBadge } from '../components/ui/StatusBadges'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150),
  contactName: z.string().trim().max(120).optional(),
  email: z.string().trim().max(150).optional().refine(v => !v || /^\S+@\S+\.\S+$/.test(v), 'Enter a valid email'),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(255).optional(),
  active: z.boolean(),
})
type FormValues = z.infer<typeof schema>

function SupplierForm({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: supplier?.name ?? '', contactName: supplier?.contactName ?? '', email: supplier?.email ?? '', phone: supplier?.phone ?? '', address: supplier?.address ?? '', active: supplier?.active ?? true },
  })
  async function onSubmit(v: FormValues) {
    const body = { ...v, contactName: v.contactName || null, email: v.email || null, phone: v.phone || null, address: v.address || null }
    try {
      if (supplier) await api.put(`/api/suppliers/${supplier.id}`, body); else await api.post('/api/suppliers', body)
      toast.success(supplier ? 'Supplier updated' : 'Supplier added'); onSaved()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not save the supplier') }
  }
  return (
    <Modal open title={supplier ? `Edit ${supplier.name}` : 'Add supplier'} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={isSubmitting} onClick={handleSubmit(onSubmit)}>Save</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Input label="Company name" className="sm:col-span-2" error={errors.name?.message} {...register('name')} />
        <Input label="Contact person" error={errors.contactName?.message} {...register('contactName')} />
        <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
        <Input label="Email" type="email" className="sm:col-span-2" error={errors.email?.message} {...register('email')} />
        <Input label="Address" className="sm:col-span-2" error={errors.address?.message} {...register('address')} />
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" {...register('active')} /> Active (can receive new purchase orders)</label>
      </form>
    </Modal>
  )
}

function SupplierDetail({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const [tab, setTab] = useState<'products' | 'purchases'>('products')
  const products = useAsync(() => api.get<Product[]>(`/api/suppliers/${supplier.id}/products`), [supplier.id])
  const purchases = useAsync(() => api.get<Purchase[]>(`/api/suppliers/${supplier.id}/purchases`), [supplier.id])
  const spent = purchases.data?.filter(p => p.status === 'RECEIVED').reduce((s, p) => s + p.totalCost, 0) ?? 0
  return (
    <Modal open wide title={supplier.name} onClose={onClose}>
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
        {supplier.contactName && <span>{supplier.contactName}</span>}
        {supplier.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{supplier.email}</span>}
        {supplier.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{supplier.phone}</span>}
        {supplier.address && <span>{supplier.address}</span>}
      </div>
      <div role="tablist" className="mb-3 flex gap-1 border-b">
        {(['products', 'purchases'] as const).map(t => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize ${tab === t ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'}`}>
            {t === 'products' ? `Associated products${products.data ? ` (${products.data.length})` : ''}` : `Purchase history${purchases.data ? ` (${purchases.data.length})` : ''}`}
          </button>
        ))}
      </div>
      {tab === 'products' ? (products.error ? <ErrorState message={products.error} onRetry={products.reload} /> : !products.data ? <Spinner /> : products.data.length === 0 ? <EmptyState title="No products linked" message="Assign this supplier when editing a product." /> : (
        <table className={tableClass}><thead className={theadClass}><tr><th className={thClass}>Product</th><th className={`${thClass} text-right`}>Cost</th><th className={`${thClass} text-right`}>Stock</th><th className={thClass}>Status</th></tr></thead>
          <tbody>{products.data.map(p => <tr key={p.id} className={trClass}><td className={tdClass}>{p.name}<div className="font-mono text-xs text-muted">{p.sku}</div></td><td className={`${tdClass} tabular text-right`}>{formatMoney(p.costPrice)}</td><td className={`${tdClass} tabular text-right`}>{p.quantity}</td><td className={tdClass}><StockBadge status={p.stockStatus} /></td></tr>)}</tbody></table>
      )) : (purchases.error ? <ErrorState message={purchases.error} onRetry={purchases.reload} /> : !purchases.data ? <Spinner /> : purchases.data.length === 0 ? <EmptyState title="No purchase orders yet" /> : (
        <>
          <p className="mb-2 text-sm text-muted">Total received from this supplier: <span className="tabular font-medium text-ink">{formatMoney(spent)}</span></p>
          <table className={tableClass}><thead className={theadClass}><tr><th className={thClass}>PO</th><th className={thClass}>Date</th><th className={thClass}>Status</th><th className={`${thClass} text-right`}>Total</th></tr></thead>
            <tbody>{purchases.data.map(p => <tr key={p.id} className={trClass}><td className={`${tdClass} font-mono text-xs`}>{p.poNumber}</td><td className={`${tdClass} text-muted`}>{formatDate(p.createdAt)}</td><td className={tdClass}><PurchaseStatusBadge status={p.status} /></td><td className={`${tdClass} tabular text-right`}>{formatMoney(p.totalCost)}</td></tr>)}</tbody></table>
        </>
      ))}
    </Modal>
  )
}

export default function SuppliersPage() {
  const { data, error, loading, reload } = useAsync(() => api.get<Supplier[]>('/api/suppliers'), [])
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null)
  const [viewing, setViewing] = useState<Supplier | null>(null)
  return (
    <>
      <PageHeader title="Suppliers" subtitle="Who you buy from, what they supply and what you have ordered"
        actions={<Button variant="primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add supplier</Button>} />
      <Card padded={false}>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Spinner /> : !data || data.length === 0 ? (
          <EmptyState title="No suppliers yet" message="Add a supplier to start creating purchase orders." action={<Button variant="primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add supplier</Button>} />
        ) : (
          <div className="overflow-x-auto"><table className={tableClass}>
            <thead className={theadClass}><tr><th className={thClass}>Supplier</th><th className={thClass}>Contact</th><th className={thClass}>Email</th><th className={thClass}>Phone</th><th className={thClass}>Status</th><th className={`${thClass} text-right`}>Actions</th></tr></thead>
            <tbody>{data.map(s => (
              <tr key={s.id} className={trClass}>
                <td className={`${tdClass} font-medium`}>{s.name}</td><td className={tdClass}>{s.contactName ?? '-'}</td>
                <td className={`${tdClass} text-muted`}>{s.email ?? '-'}</td><td className={`${tdClass} text-muted`}>{s.phone ?? '-'}</td>
                <td className={tdClass}><Badge tone={s.active ? 'good' : 'neutral'}>{s.active ? 'Active' : 'Inactive'}</Badge></td>
                <td className={`${tdClass} text-right`}><div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" aria-label={`View ${s.name}`} onClick={() => setViewing(s)}><Eye className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
                </div></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Card>
      {editing && <SupplierForm supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
      {viewing && <SupplierDetail supplier={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}
