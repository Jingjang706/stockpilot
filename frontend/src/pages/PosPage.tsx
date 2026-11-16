import { useMemo, useState } from 'react'
import { Minus, PackageX, Plus, Printer, Search, ShoppingCart, Trash2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { Page, PaymentMethod, Product, Sale } from '../lib/types'
import { formatMoney, titleCase } from '../lib/format'
import { useAsync, useDebounced } from '../lib/useAsync'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { FilterInput, FilterSelect, Input } from '../components/ui/Form'
import { Modal } from '../components/ui/Modal'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui/Display'
import { Receipt } from '../components/Receipt'
import { cartSubtotal, discountLimit, type CartLine } from '../lib/cart'

const METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'OTHER']

export default function PosPage() {
  const { hasRole } = useAuth()
  const isCashier = hasRole('CASHIER')
  const toast = useToast()
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [discountText, setDiscountText] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [reference, setReference] = useState('')
  const [tendered, setTendered] = useState('')
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState<Sale | null>(null)
  const search = useDebounced(q, 250)

  const categories = useAsync(() => api.get<{ id: number; name: string }[]>('/api/categories'), [])
  const { data, error, loading, reload } = useAsync(() => api.get<Page<Product>>('/api/products', { q: search, categoryId, size: 24, sort: 'name,asc' }), [search, categoryId])

  const subtotal = useMemo(() => cartSubtotal(cart), [cart])
  const discount = Math.max(0, Number(discountText) || 0)
  const limit = isCashier ? discountLimit(subtotal) : subtotal
  const discountError = discount > subtotal ? 'Discount cannot exceed the subtotal'
    : isCashier && discount > limit ? `Cashiers can discount up to ${formatMoney(limit)} (5%). Ask a manager for more.` : null
  const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100)
  const change = method === 'CASH' && tendered ? Number(tendered) - total : null
  const units = cart.reduce((n, l) => n + l.quantity, 0)

  function add(p: Product) {
    if (p.quantity <= 0) return
    setCart(c => {
      const existing = c.find(l => l.productId === p.id)
      if (!existing) return [...c, { productId: p.id, name: p.name, sku: p.sku, unitPrice: p.sellingPrice, quantity: 1, available: p.quantity }]
      if (existing.quantity >= existing.available) { toast.error(`Only ${existing.available} of "${p.name}" in stock`); return c }
      return c.map(l => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l))
    })
  }
  const setQty = (id: number, qty: number) => setCart(c => c.map(l => (l.productId === id ? { ...l, quantity: Math.min(Math.max(1, qty || 1), l.available) } : l)))
  const remove = (id: number) => setCart(c => c.filter(l => l.productId !== id))
  const clear = () => { setCart([]); setDiscountText(''); setReference(''); setTendered('') }

  async function charge() {
    setBusy(true)
    try {
      const sale = await api.post<Sale>('/api/sales', {
        items: cart.map(l => ({ productId: l.productId, quantity: l.quantity })),
        discountAmount: discount > 0 ? discount : undefined, paymentMethod: method, paymentReference: reference || undefined,
      })
      setReceipt(sale)
      clear()
      reload()
      toast.success(`Sale ${sale.receiptNumber} completed`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not complete the sale')
      reload()   // stock may have changed; refresh availability
    } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="Point of Sale" subtitle="Search products, build the cart and take payment" />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <section aria-label="Products">
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <FilterInput className="h-10 pl-9" autoFocus placeholder="Search by name, SKU or barcode" aria-label="Search products" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <FilterSelect className="h-10" aria-label="Category" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">All categories</option>{categories.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </FilterSelect>
          </div>
          {error ? <Card><ErrorState message={error} onRetry={reload} /></Card> : loading && !data ? <Spinner /> : !data || data.content.length === 0 ? (
            <Card><EmptyState title="No products found" message="Try a different search." /></Card>
          ) : (
            <ul className={`grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 ${loading ? 'opacity-60' : ''}`}>
              {data.content.map(p => {
                const out = p.quantity <= 0
                const inCart = cart.find(l => l.productId === p.id)?.quantity ?? 0
                return (
                  <li key={p.id}>
                    <button disabled={out} onClick={() => add(p)} aria-label={`Add ${p.name} to cart`}
                      className="group relative flex h-full w-full flex-col rounded-xl border bg-surface p-3 text-left shadow-card transition hover:border-accent hover:shadow-md active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50">
                      {inCart > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1 text-xs font-semibold text-accent-ink">{inCart}</span>}
                      <span className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug">{p.name}</span>
                      <span className="mt-1 font-mono text-[11px] text-muted">{p.sku}</span>
                      <span className="mt-3 flex items-end justify-between">
                        <span className="tabular text-base font-semibold">{formatMoney(p.sellingPrice)}</span>
                        {out ? <Badge tone="bad">Out</Badge> : <span className={`text-xs ${p.stockStatus === 'LOW_STOCK' ? 'text-warn' : 'text-muted'}`}>{p.quantity} left</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <aside id="cart" aria-label="Cart" className="scroll-mt-4 lg:sticky lg:top-6 lg:self-start">
          <Card padded={false} title={`Cart${units ? ` (${units} item${units === 1 ? '' : 's'})` : ''}`}
            actions={cart.length > 0 && <button onClick={clear} className="text-xs text-muted hover:text-bad">Clear</button>}>
            {cart.length === 0 ? <EmptyState title="Cart is empty" message="Tap a product to add it." /> : (
              <ul className="max-h-[40vh] divide-y overflow-y-auto">
                {cart.map(l => (
                  <li key={l.productId} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      <p className="tabular text-xs text-muted">{formatMoney(l.unitPrice)} each</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="secondary" aria-label={`Decrease ${l.name}`} onClick={() => (l.quantity <= 1 ? remove(l.productId) : setQty(l.productId, l.quantity - 1))}><Minus className="h-3.5 w-3.5" /></Button>
                      <input aria-label={`Quantity of ${l.name}`} type="number" min={1} max={l.available} value={l.quantity} onChange={e => setQty(l.productId, parseInt(e.target.value, 10))}
                        className="tabular h-8 w-12 rounded-md border bg-surface text-center text-sm" />
                      <Button size="sm" variant="secondary" aria-label={`Increase ${l.name}`} disabled={l.quantity >= l.available} onClick={() => setQty(l.productId, l.quantity + 1)}><Plus className="h-3.5 w-3.5" /></Button>
                    </div>
                    <div className="tabular w-16 text-right text-sm font-medium">{formatMoney(l.unitPrice * l.quantity)}</div>
                    <button aria-label={`Remove ${l.name}`} onClick={() => remove(l.productId)} className="text-muted hover:text-bad"><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}

            {cart.length > 0 && (
              <div className="space-y-3 border-t p-4">
                <Input label="Discount ($)" type="number" min="0" step="0.01" value={discountText} onChange={e => setDiscountText(e.target.value)}
                  error={discountError ?? undefined} hint={isCashier ? `Up to ${formatMoney(limit)} (5%) without a manager` : undefined} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="pay" className="mb-1.5 block text-sm font-medium">Payment</label>
                    <FilterSelect id="pay" className="h-10 w-full" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}>
                      {METHODS.map(m => <option key={m} value={m}>{titleCase(m)}</option>)}
                    </FilterSelect>
                  </div>
                  {method === 'CASH'
                    ? <Input label="Cash received" type="number" min="0" step="0.01" value={tendered} onChange={e => setTendered(e.target.value)} />
                    : <Input label="Reference" placeholder="Optional" maxLength={100} value={reference} onChange={e => setReference(e.target.value)} />}
                </div>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular">{formatMoney(subtotal)}</dd></div>
                  {discount > 0 && !discountError && <div className="flex justify-between"><dt className="text-muted">Discount</dt><dd className="tabular">-{formatMoney(discount)}</dd></div>}
                  <div className="flex justify-between border-t pt-2 text-lg font-semibold"><dt>Total</dt><dd className="tabular">{formatMoney(total)}</dd></div>
                  {change !== null && <div className="flex justify-between"><dt className="text-muted">Change due</dt><dd className={`tabular font-medium ${change < 0 ? 'text-bad' : 'text-good'}`}>{change < 0 ? `Short ${formatMoney(-change)}` : formatMoney(change)}</dd></div>}
                </dl>
                <Button variant="primary" className="h-12 w-full text-base" loading={busy} disabled={!!discountError || (change !== null && change < 0)} onClick={charge}>
                  <ShoppingCart className="h-5 w-5" /> Charge {formatMoney(total)}
                </Button>
              </div>
            )}
          </Card>
          {!data?.content.length && !loading && !error && <p className="mt-3 flex items-center gap-2 text-xs text-muted"><PackageX className="h-4 w-4" /> No products to sell yet.</p>}
        </aside>
      </div>

      {cart.length > 0 && (
        <>
          <div className="h-16 lg:hidden" aria-hidden />
          <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t bg-surface p-3 shadow-[0_-4px_12px_rgb(0_0_0/0.08)] lg:hidden">
            <Button variant="primary" className="h-12 w-full text-base" onClick={() => document.getElementById('cart')?.scrollIntoView({ behavior: 'smooth' })}>
              <ShoppingCart className="h-5 w-5" /> View cart ({units}) - {formatMoney(total)}
            </Button>
          </div>
        </>
      )}

      <Modal open={!!receipt} title="Sale complete" onClose={() => setReceipt(null)}
        footer={<><Button onClick={() => setReceipt(null)}>New sale</Button><Button variant="primary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print receipt</Button></>}>
        {receipt && <Receipt sale={receipt} />}
      </Modal>
    </>
  )
}
