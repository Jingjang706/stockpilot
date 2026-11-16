import { useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, Printer } from 'lucide-react'
import { api } from '../lib/api'
import type { Product, PurchaseReport, RevenueOverview, SalesReport, TopProduct, ValuationReport } from '../lib/types'
import { daysAgo, formatDate, formatMoney, formatNumber, shortDay, toDateInput } from '../lib/format'
import { downloadCsv } from '../lib/csv'
import { useAsync } from '../lib/useAsync'
import { useChartColors } from '../lib/useChartColors'
import { Button } from '../components/ui/Button'
import { FilterInput, FilterSelect } from '../components/ui/Form'
import { Card, EmptyState, ErrorState, PageHeader, Spinner, Stat, tableClass, tdClass, theadClass, thClass, trClass } from '../components/ui/Display'
import { PurchaseStatusBadge, StockBadge } from '../components/ui/StatusBadges'

type Tab = 'sales' | 'best' | 'low' | 'valuation' | 'purchases' | 'revenue'
const TABS: { id: Tab; label: string }[] = [
  { id: 'sales', label: 'Sales' }, { id: 'best', label: 'Best sellers' }, { id: 'revenue', label: 'Revenue overview' },
  { id: 'low', label: 'Low stock' }, { id: 'valuation', label: 'Inventory valuation' }, { id: 'purchases', label: 'Purchases' },
]
const GRAINS = [{ v: 'day', l: 'Daily' }, { v: 'week', l: 'Weekly' }, { v: 'month', l: 'Monthly' }, { v: 'year', l: 'Annual' }]

function Shell({ title, subtitle, onCsv, children, loading, error, reload }:
  { title: string; subtitle?: string; onCsv?: () => void; children: ReactNode; loading: boolean; error: string | null; reload: () => void }) {
  return (
    <div className="print-area">
      <Card title={title} padded={false} actions={
        <div className="no-print flex gap-2">
          {onCsv && <Button size="sm" onClick={onCsv}><Download className="h-4 w-4" /> CSV</Button>}
          <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
        </div>}>
        {subtitle && <p className="border-b px-4 py-2 text-xs text-muted">{subtitle}</p>}
        {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <Spinner /> : children}
      </Card>
    </div>
  )
}

function DateRange({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <FilterInput type="date" aria-label="From date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} className="w-36" />
      <span className="text-muted">to</span>
      <FilterInput type="date" aria-label="To date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} className="w-36" />
    </div>
  )
}

function SalesTab({ from, to }: { from: string; to: string }) {
  const [grain, setGrain] = useState('day')
  const colors = useChartColors()
  const { data, error, loading, reload } = useAsync(() => api.get<SalesReport>('/api/reports/sales', { grain, from, to }), [grain, from, to])
  const label = (p: string) => (grain === 'day' || grain === 'week' ? shortDay(p) : grain === 'month' ? p.slice(0, 7) : p.slice(0, 4))
  return (
    <div className="space-y-4">
      <div className="no-print"><FilterSelect aria-label="Grouping" value={grain} onChange={e => setGrain(e.target.value)}>{GRAINS.map(g => <option key={g.v} value={g.v}>{g.l}</option>)}</FilterSelect></div>
      <Shell title={`${GRAINS.find(g => g.v === grain)?.l} sales`} subtitle={`Completed sales only. ${from || 'Start'} to ${to || 'today'}. Revenue = sales total; COGS = cost of items sold; gross profit = revenue - COGS.`}
        loading={loading} error={error} reload={reload}
        onCsv={data ? () => downloadCsv(`sales-${grain}.csv`, ['Period', 'Sales', 'Revenue', 'COGS', 'Gross profit'], data.buckets.map(b => [b.period, b.count, b.revenue, b.cogs, b.grossProfit])) : undefined}>
        {!data || data.buckets.length === 0 ? <EmptyState title="No sales in this range" /> : (
          <>
            <div className="grid gap-4 p-4 sm:grid-cols-4">
              <Stat label="Sales" value={formatNumber(data.totals.count)} /><Stat label="Revenue" value={formatMoney(data.totals.revenue)} />
              <Stat label="Cost of goods sold" value={formatMoney(data.totals.cogs)} /><Stat label="Gross profit" value={formatMoney(data.totals.grossProfit)} />
            </div>
            <div className="no-print h-64 px-4" role="img" aria-label="Revenue, cost and gross profit by period">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.buckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.line} vertical={false} />
                  <XAxis dataKey="period" tickFormatter={label} stroke={colors.muted} fontSize={11} tickLine={false} minTickGap={20} />
                  <YAxis stroke={colors.muted} fontSize={11} tickLine={false} axisLine={false} width={52} tickFormatter={v => `$${v}`} />
                  <Tooltip contentStyle={{ background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: 8, fontSize: 12, color: colors.ink }} formatter={(v: number) => formatMoney(v)} labelFormatter={l => label(String(l))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name="Revenue" fill={colors.accent} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="cogs" name="COGS" fill={colors.muted} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="grossProfit" name="Gross profit" fill={colors.good} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 overflow-x-auto"><table className={tableClass}>
              <thead className={theadClass}><tr><th className={thClass}>Period</th><th className={`${thClass} text-right`}>Sales</th><th className={`${thClass} text-right`}>Revenue</th><th className={`${thClass} text-right`}>COGS</th><th className={`${thClass} text-right`}>Gross profit</th></tr></thead>
              <tbody>{data.buckets.map(b => <tr key={b.period} className={trClass}><td className={tdClass}>{label(b.period)}</td><td className={`${tdClass} tabular text-right`}>{b.count}</td><td className={`${tdClass} tabular text-right`}>{formatMoney(b.revenue)}</td><td className={`${tdClass} tabular text-right text-muted`}>{formatMoney(b.cogs)}</td><td className={`${tdClass} tabular text-right font-medium`}>{formatMoney(b.grossProfit)}</td></tr>)}</tbody>
            </table></div>
          </>
        )}
      </Shell>
    </div>
  )
}

function BestTab({ from, to }: { from: string; to: string }) {
  const { data, error, loading, reload } = useAsync(() => api.get<TopProduct[]>('/api/reports/best-selling', { from, to, limit: 20 }), [from, to])
  return (
    <Shell title="Best-selling products" subtitle="Ranked by units sold (completed sales)" loading={loading} error={error} reload={reload}
      onCsv={data ? () => downloadCsv('best-selling.csv', ['Rank', 'SKU', 'Product', 'Units sold', 'Revenue'], data.map((p, i) => [i + 1, p.sku, p.name, p.unitsSold, p.revenue])) : undefined}>
      {!data || data.length === 0 ? <EmptyState title="No sales in this range" /> : (
        <div className="overflow-x-auto"><table className={tableClass}>
          <thead className={theadClass}><tr><th className={thClass}>#</th><th className={thClass}>Product</th><th className={`${thClass} text-right`}>Units sold</th><th className={`${thClass} text-right`}>Revenue</th></tr></thead>
          <tbody>{data.map((p, i) => <tr key={p.productId} className={trClass}><td className={`${tdClass} text-muted`}>{i + 1}</td><td className={tdClass}>{p.name}<div className="font-mono text-xs text-muted">{p.sku}</div></td><td className={`${tdClass} tabular text-right`}>{formatNumber(p.unitsSold)}</td><td className={`${tdClass} tabular text-right font-medium`}>{formatMoney(p.revenue)}</td></tr>)}</tbody>
        </table></div>
      )}
    </Shell>
  )
}

function LowTab() {
  const { data, error, loading, reload } = useAsync(() => api.get<Product[]>('/api/reports/low-stock'), [])
  return (
    <Shell title="Low-stock report" subtitle="Active products at or below their minimum level" loading={loading} error={error} reload={reload}
      onCsv={data ? () => downloadCsv('low-stock.csv', ['SKU', 'Product', 'Supplier', 'On hand', 'Minimum', 'Shortfall'], data.map(p => [p.sku, p.name, p.supplierName ?? '', p.quantity, p.minStock, Math.max(0, p.minStock - p.quantity)])) : undefined}>
      {!data || data.length === 0 ? <EmptyState title="Nothing is low on stock" /> : (
        <div className="overflow-x-auto"><table className={tableClass}>
          <thead className={theadClass}><tr><th className={thClass}>Product</th><th className={thClass}>Supplier</th><th className={`${thClass} text-right`}>On hand</th><th className={`${thClass} text-right`}>Minimum</th><th className={thClass}>Status</th></tr></thead>
          <tbody>{data.map(p => <tr key={p.id} className={trClass}><td className={tdClass}>{p.name}<div className="font-mono text-xs text-muted">{p.sku}</div></td><td className={`${tdClass} text-muted`}>{p.supplierName ?? '-'}</td><td className={`${tdClass} tabular text-right`}>{p.quantity}</td><td className={`${tdClass} tabular text-right text-muted`}>{p.minStock}</td><td className={tdClass}><StockBadge status={p.stockStatus} /></td></tr>)}</tbody>
        </table></div>
      )}
    </Shell>
  )
}

function ValuationTab() {
  const { data, error, loading, reload } = useAsync(() => api.get<ValuationReport>('/api/reports/inventory-valuation'), [])
  return (
    <Shell title="Inventory valuation" subtitle="Current stock x cost price (cost value) and x selling price (retail value)" loading={loading} error={error} reload={reload}
      onCsv={data ? () => downloadCsv('inventory-valuation.csv', ['SKU', 'Product', 'Category', 'Quantity', 'Unit cost', 'Cost value', 'Retail value'], data.rows.map(r => [r.sku, r.name, r.category ?? '', r.quantity, r.unitCost, r.costValue, r.retailValue])) : undefined}>
      {!data || data.rows.length === 0 ? <EmptyState title="No products" /> : (
        <>
          <div className="grid gap-4 p-4 sm:grid-cols-2"><Stat label="Total cost value" value={formatMoney(data.totalCostValue)} /><Stat label="Total retail value" value={formatMoney(data.totalRetailValue)} sub="Potential revenue if all stock sold at list price" /></div>
          <div className="overflow-x-auto"><table className={tableClass}>
            <thead className={theadClass}><tr><th className={thClass}>Product</th><th className={thClass}>Category</th><th className={`${thClass} text-right`}>Qty</th><th className={`${thClass} text-right`}>Unit cost</th><th className={`${thClass} text-right`}>Cost value</th><th className={`${thClass} text-right`}>Retail value</th></tr></thead>
            <tbody>{data.rows.map(r => <tr key={r.productId} className={trClass}><td className={tdClass}>{r.name}<div className="font-mono text-xs text-muted">{r.sku}</div></td><td className={`${tdClass} text-muted`}>{r.category ?? '-'}</td><td className={`${tdClass} tabular text-right`}>{r.quantity}</td><td className={`${tdClass} tabular text-right`}>{formatMoney(r.unitCost)}</td><td className={`${tdClass} tabular text-right`}>{formatMoney(r.costValue)}</td><td className={`${tdClass} tabular text-right`}>{formatMoney(r.retailValue)}</td></tr>)}</tbody>
          </table></div>
        </>
      )}
    </Shell>
  )
}

function PurchasesTab({ from, to }: { from: string; to: string }) {
  const { data, error, loading, reload } = useAsync(() => api.get<PurchaseReport>('/api/reports/purchases', { from, to }), [from, to])
  return (
    <Shell title="Purchase report" subtitle="Orders created in the range. 'Received' counts only goods already booked into stock." loading={loading} error={error} reload={reload}
      onCsv={data ? () => downloadCsv('purchases.csv', ['PO', 'Supplier', 'Created', 'Status', 'Items', 'Total'], data.purchases.map(p => [p.poNumber, p.supplierName, p.createdAt.slice(0, 10), p.status, p.items.length, p.totalCost])) : undefined}>
      {!data || data.purchases.length === 0 ? <EmptyState title="No purchase orders in this range" /> : (
        <>
          <div className="grid gap-4 p-4 sm:grid-cols-2"><Stat label="Ordered (excl. cancelled)" value={formatMoney(data.totalOrdered)} /><Stat label="Received into stock" value={formatMoney(data.totalReceived)} /></div>
          <div className="overflow-x-auto"><table className={tableClass}>
            <thead className={theadClass}><tr><th className={thClass}>PO</th><th className={thClass}>Supplier</th><th className={thClass}>Created</th><th className={thClass}>Status</th><th className={`${thClass} text-right`}>Total</th></tr></thead>
            <tbody>{data.purchases.map(p => <tr key={p.id} className={trClass}><td className={`${tdClass} font-mono text-xs`}>{p.poNumber}</td><td className={tdClass}>{p.supplierName}</td><td className={`${tdClass} text-muted`}>{formatDate(p.createdAt)}</td><td className={tdClass}><PurchaseStatusBadge status={p.status} /></td><td className={`${tdClass} tabular text-right`}>{formatMoney(p.totalCost)}</td></tr>)}</tbody>
          </table></div>
        </>
      )}
    </Shell>
  )
}

function RevenueTab({ from, to }: { from: string; to: string }) {
  const { data, error, loading, reload } = useAsync(() => api.get<RevenueOverview>('/api/reports/revenue-overview', { from, to }), [from, to])
  const rows = data ? [
    ['Revenue (completed sales)', data.completed.revenue], ['Cost of goods sold', data.completed.cogs], ['Gross profit', data.completed.grossProfit],
    ['Gross margin %', data.grossMarginPercent], ['Completed sales', data.completed.count], ['Voided sales (not in revenue)', data.voidedAmount],
    ['Refunded sales (not in revenue)', data.refundedAmount], ['Purchases received into stock', data.purchaseSpend],
  ] as [string, number][] : []
  return (
    <Shell title="Revenue overview" subtitle="Revenue, cost of goods sold and gross profit are shown separately. Voids and refunds are excluded from revenue." loading={loading} error={error} reload={reload}
      onCsv={data ? () => downloadCsv('revenue-overview.csv', ['Metric', 'Value'], rows) : undefined}>
      {data && (
        <div className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="Revenue" value={formatMoney(data.completed.revenue)} sub={`${data.completed.count} sales`} />
            <Stat label="Cost of goods sold" value={formatMoney(data.completed.cogs)} />
            <Stat label="Gross profit" value={formatMoney(data.completed.grossProfit)} />
            <Stat label="Gross margin" value={`${data.grossMarginPercent}%`} sub="Gross profit / revenue" />
          </div>
          <table className={tableClass}><tbody>
            <tr className={trClass}><td className={tdClass}>Voided sales</td><td className={`${tdClass} tabular text-right`}>{data.voidedCount} ({formatMoney(data.voidedAmount)})</td></tr>
            <tr className={trClass}><td className={tdClass}>Refunded sales</td><td className={`${tdClass} tabular text-right`}>{data.refundedCount} ({formatMoney(data.refundedAmount)})</td></tr>
            <tr className={trClass}><td className={tdClass}>Purchases received into stock</td><td className={`${tdClass} tabular text-right`}>{formatMoney(data.purchaseSpend)}</td></tr>
          </tbody></table>
        </div>
      )}
    </Shell>
  )
}

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('sales')
  const [from, setFrom] = useState(daysAgo(29))
  const [to, setTo] = useState(toDateInput(new Date()))
  const usesRange = tab === 'sales' || tab === 'best' || tab === 'purchases' || tab === 'revenue'
  return (
    <>
      <PageHeader title="Reports" subtitle="Business reports from live data. Export to CSV or print."
        actions={usesRange && <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />} />
      <div role="tablist" aria-label="Reports" className="no-print mb-4 flex flex-wrap gap-1 border-b">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'sales' && <SalesTab from={from} to={to} />}
      {tab === 'best' && <BestTab from={from} to={to} />}
      {tab === 'revenue' && <RevenueTab from={from} to={to} />}
      {tab === 'low' && <LowTab />}
      {tab === 'valuation' && <ValuationTab />}
      {tab === 'purchases' && <PurchasesTab from={from} to={to} />}
      <p className="no-print mt-4 text-xs text-muted">All figures are in USD.</p>
    </>
  )
}
