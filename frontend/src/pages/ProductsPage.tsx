import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Archive, ArrowDown, ArrowUp, ArrowUpDown, ImageOff, Pencil, Plus, RotateCcw, Search } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { Category, Page, Product, Supplier } from '../lib/types'
import { formatMoney } from '../lib/format'
import { useAsync, useDebounced } from '../lib/useAsync'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { FilterInput, FilterSelect, Input, Select, Textarea } from '../components/ui/Form'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, Spinner, tableClass, tdClass, theadClass, thClass, trClass } from '../components/ui/Display'
import { StockBadge } from '../components/ui/StatusBadges'

export const productSchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required').max(50),
  barcode: z.string().trim().max(60).optional(),
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: z.string().max(5000).optional(),
  categoryId: z.string().optional(),
  supplierId: z.string().optional(),
  costPrice: z.number({ invalid_type_error: 'Enter a number' }).min(0, 'Cannot be negative'),
  sellingPrice: z.number({ invalid_type_error: 'Enter a number' }).min(0, 'Cannot be negative'),
  minStock: z.number({ invalid_type_error: 'Enter a whole number' }).int('Whole numbers only').min(0, 'Cannot be negative'),
  imageUrl: z.string().trim().max(500).optional().refine(v => !v || /^https?:\/\//i.test(v), 'Must start with http:// or https://'),
  initialStock: z.number({ invalid_type_error: 'Enter a whole number' }).int('Whole numbers only').min(0, 'Cannot be negative').optional(),
})
type FormValues = z.infer<typeof productSchema>

type SortKey = 'name' | 'sku' | 'sellingPrice'

function ProductFormModal({ product, categories, suppliers, onClose, onSaved }:
  { product: Product | null; categories: Category[]; suppliers: Supplier[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const editing = !!product
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: product ? {
      sku: product.sku, barcode: product.barcode ?? '', name: product.name, description: product.description ?? '',
      categoryId: product.categoryId ? String(product.categoryId) : '', supplierId: product.supplierId ? String(product.supplierId) : '',
      costPrice: product.costPrice ?? 0, sellingPrice: product.sellingPrice, minStock: product.minStock, imageUrl: product.imageUrl ?? '',
    } : { sku: '', barcode: '', name: '', description: '', categoryId: '', supplierId: '', costPrice: 0, sellingPrice: 0, minStock: 5, imageUrl: '', initialStock: 0 },
  })

  async function onSubmit(v: FormValues) {
    const body = {
      ...v, categoryId: v.categoryId ? Number(v.categoryId) : null, supplierId: v.supplierId ? Number(v.supplierId) : null,
      barcode: v.barcode || null, imageUrl: v.imageUrl || null, description: v.description || null,
      initialStock: editing ? undefined : v.initialStock ?? 0,
    }
    try {
      if (editing) await api.put(`/api/products/${product!.id}`, body)
      else await api.post('/api/products', body)
      toast.success(editing ? 'Product updated' : 'Product created')
      onSaved()
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.fieldErrors) Object.entries(e.fieldErrors).forEach(([k, m]) => setError(k as keyof FormValues, { message: m }))
        toast.error(e.message)
      } else toast.error('Could not save the product')
    }
  }

  return (
    <Modal open title={editing ? `Edit ${product!.name}` : 'Add product'} onClose={onClose} wide
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={isSubmitting} onClick={handleSubmit(onSubmit)}>{editing ? 'Save changes' : 'Create product'}</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Input label="Name" className="sm:col-span-2" error={errors.name?.message} {...register('name')} />
        <Input label="SKU" error={errors.sku?.message} hint="Unique; stored in upper case" {...register('sku')} />
        <Input label="Barcode" error={errors.barcode?.message} {...register('barcode')} />
        <Select label="Category" error={errors.categoryId?.message} {...register('categoryId')}>
          <option value="">- None -</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select label="Supplier" error={errors.supplierId?.message} {...register('supplierId')}>
          <option value="">- None -</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Input label="Cost price" type="number" step="0.01" min="0" error={errors.costPrice?.message} {...register('costPrice', { valueAsNumber: true })} />
        <Input label="Selling price" type="number" step="0.01" min="0" error={errors.sellingPrice?.message} {...register('sellingPrice', { valueAsNumber: true })} />
        <Input label="Minimum stock level" type="number" min="0" step="1" error={errors.minStock?.message} hint="Low-stock alert threshold" {...register('minStock', { valueAsNumber: true })} />
        {!editing
          ? <Input label="Initial stock" type="number" min="0" step="1" error={errors.initialStock?.message} hint="Recorded as a stock-in movement" {...register('initialStock', { valueAsNumber: true })} />
          : <Input label="Current stock" value={product!.quantity} disabled hint="Change stock from the Inventory page" readOnly />}
        <Input label="Image URL" className="sm:col-span-2" placeholder="https://..." error={errors.imageUrl?.message} {...register('imageUrl')} />
        <Textarea label="Description" className="sm:col-span-2" error={errors.description?.message} {...register('description')} />
      </form>
    </Modal>
  )
}

export default function ProductsPage() {
  const { hasRole } = useAuth()
  const canManage = hasRole('ADMIN', 'MANAGER')
  const toast = useToast()
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' })
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [toArchive, setToArchive] = useState<Product | null>(null)
  const [busy, setBusy] = useState(false)
  const search = useDebounced(q)

  useEffect(() => { setPage(0) }, [search, categoryId, includeArchived, sort])

  const lookups = useAsync(async () => {
    const categories = await api.get<Category[]>('/api/categories')
    const suppliers = canManage ? await api.get<Supplier[]>('/api/suppliers') : []
    return { categories, suppliers }
  }, [canManage])

  const { data, error, loading, reload } = useAsync(() => api.get<Page<Product>>('/api/products', {
    q: search, categoryId, includeArchived, page, size: 15, sort: `${sort.key},${sort.dir}`,
  }), [search, categoryId, includeArchived, page, sort])

  const toggleSort = (key: SortKey) => setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  const SortHead = ({ k, children, right }: { k: SortKey; children: string; right?: boolean }) => (
    <th className={`${thClass} ${right ? 'text-right' : ''}`} aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className="inline-flex items-center gap-1 uppercase hover:text-ink" onClick={() => toggleSort(k)}>
        {children}{sort.key === k ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  )

  async function setActive(p: Product, active: boolean) {
    setBusy(true)
    try {
      if (active) await api.post(`/api/products/${p.id}/restore`)
      else await api.del(`/api/products/${p.id}`)
      toast.success(active ? `${p.name} restored` : `${p.name} archived`)
      setToArchive(null)
      reload()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Action failed') } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="Products" subtitle={canManage ? 'Catalog, pricing and stock levels' : 'Browse products and availability'}
        actions={canManage && <Button variant="primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add product</Button>} />

      <Card padded={false}>
        <div className="no-print flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <FilterInput className="pl-9" placeholder="Search name, SKU or barcode" aria-label="Search products" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <FilterSelect aria-label="Filter by category" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="">All categories</option>{lookups.data?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </FilterSelect>
          {canManage && <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)} /> Show archived</label>}
        </div>

        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Spinner /> : !data || data.content.length === 0 ? (
          <EmptyState title="No products found" message={search || categoryId ? 'Try a different search or filter.' : 'Add your first product to get started.'}
            action={canManage && !search && !categoryId ? <Button variant="primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add product</Button> : undefined} />
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className={tableClass}>
              <thead className={theadClass}><tr>
                <th className={`${thClass} w-12`}><span className="sr-only">Image</span></th>
                <SortHead k="name">Product</SortHead><SortHead k="sku">SKU</SortHead><th className={thClass}>Category</th>
                {canManage && <th className={`${thClass} text-right`}>Cost</th>}
                <SortHead k="sellingPrice" right>Price</SortHead>
                <th className={`${thClass} text-right`}>Stock</th><th className={thClass}>Status</th>
                {canManage && <th className={`${thClass} text-right`}>Actions</th>}
              </tr></thead>
              <tbody>{data.content.map(p => (
                <tr key={p.id} className={`${trClass} ${p.active ? '' : 'opacity-60'}`}>
                  <td className={tdClass}>
                    {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" className="h-9 w-9 rounded-md border object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      : <div className="flex h-9 w-9 items-center justify-center rounded-md bg-raised text-muted"><ImageOff className="h-4 w-4" /></div>}
                  </td>
                  <td className={tdClass}><div className="font-medium">{p.name}</div>{p.barcode && <div className="font-mono text-xs text-muted">{p.barcode}</div>}</td>
                  <td className={`${tdClass} font-mono text-xs`}>{p.sku}</td>
                  <td className={`${tdClass} text-muted`}>{p.categoryName ?? '-'}</td>
                  {canManage && <td className={`${tdClass} tabular text-right text-muted`}>{formatMoney(p.costPrice)}</td>}
                  <td className={`${tdClass} tabular text-right font-medium`}>{formatMoney(p.sellingPrice)}</td>
                  <td className={`${tdClass} tabular text-right`}>{p.quantity}<span className="text-xs text-muted"> / min {p.minStock}</span></td>
                  <td className={tdClass}>{p.active ? <StockBadge status={p.stockStatus} /> : <Badge>Archived</Badge>}</td>
                  {canManage && (
                    <td className={`${tdClass} text-right`}>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                        {p.active
                          ? <Button size="sm" variant="ghost" aria-label={`Archive ${p.name}`} onClick={() => setToArchive(p)}><Archive className="h-4 w-4" /></Button>
                          : <Button size="sm" variant="ghost" aria-label={`Restore ${p.name}`} onClick={() => setActive(p, true)}><RotateCcw className="h-4 w-4" /></Button>}
                      </div>
                    </td>
                  )}
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.number} totalPages={data.totalPages} total={data.totalElements} onChange={setPage} />}
      </Card>

      {editing && lookups.data && (
        <ProductFormModal product={editing === 'new' ? null : editing} categories={lookups.data.categories} suppliers={lookups.data.suppliers}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />
      )}
      <ConfirmDialog open={!!toArchive} danger title="Archive product?" confirmLabel="Archive" loading={busy}
        message={<>"{toArchive?.name}" will be hidden from the POS and product lists. Its sales and stock history are kept, and you can restore it later.</>}
        onCancel={() => setToArchive(null)} onConfirm={() => toArchive && setActive(toArchive, false)} />
    </>
  )
}
