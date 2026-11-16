import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { AlertTriangle, Boxes, CalendarDays, DollarSign, TrendingUp, Wallet } from 'lucide-react'
import { api } from '../lib/api'
import type { Dashboard } from '../lib/types'
import { daysAgo, formatDateTime, formatMoney, formatNumber, shortDay, toDateInput } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { useChartColors } from '../lib/useChartColors'
import { Button } from '../components/ui/Button'
import { FilterInput } from '../components/ui/Form'
import {
  Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, Stat, tableClass, tdClass, theadClass, thClass, trClass,
} from '../components/ui/Display'
import { SaleStatusBadge, StockBadge } from '../components/ui/StatusBadges'

const PRESETS = [{ label: '7 days', days: 6 }, { label: '30 days', days: 29 }, { label: '90 days', days: 89 }]

export default function DashboardPage() {
  const [from, setFrom] = useState(daysAgo(29))
  const [to, setTo] = useState(toDateInput(new Date()))
  const colors = useChartColors()
  const { data, error, loading, reload } = useAsync(() => api.get<Dashboard>('/api/dashboard', { from, to }), [from, to])
  const invalid = from > to

  const tooltipStyle = { background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: 8, fontSize: 12, color: colors.ink }

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live view of sales, stock and performance"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map(p => (
              <Button key={p.label} size="sm" variant={from === daysAgo(p.days) && to === toDateInput(new Date()) ? 'primary' : 'secondary'}
                onClick={() => { setFrom(daysAgo(p.days)); setTo(toDateInput(new Date())) }}>{p.label}</Button>
            ))}
            <CalendarDays className="ml-1 h-4 w-4 text-muted" aria-hidden />
            <FilterInput type="date" aria-label="From date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="w-36" />
            <span className="text-muted">to</span>
            <FilterInput type="date" aria-label="To date" value={to} min={from} onChange={e => setTo(e.target.value)} className="w-36" />
          </div>
        } />

      {invalid && <p role="alert" className="mb-4 text-sm text-bad">The start date must be on or before the end date.</p>}
      {error && <Card><ErrorState message={error} onRetry={reload} /></Card>}
      {loading && !data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      )}

      {data && !error && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Total products" value={formatNumber(data.totalProducts)} icon={<Boxes className="h-4 w-4" />} sub="Active in catalog" />
            <Stat label="Inventory value" value={formatMoney(data.inventoryValue)} icon={<Wallet className="h-4 w-4" />} sub="At cost price" />
            <Stat label="Sales today" value={formatMoney(data.salesToday.revenue)} icon={<DollarSign className="h-4 w-4" />}
              sub={`${data.salesToday.count} transaction${data.salesToday.count === 1 ? '' : 's'}`} />
            <Stat label="Monthly revenue" value={formatMoney(data.monthToDate.revenue)} icon={<TrendingUp className="h-4 w-4" />}
              sub={`${data.monthToDate.count} sales this month`} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={`Revenue (${shortDay(data.from)} - ${shortDay(data.to)})`} value={formatMoney(data.periodTotals.revenue)} sub={`${data.periodTotals.count} completed sales`} />
            <Stat label="Cost of goods sold" value={formatMoney(data.periodTotals.cogs)} sub="Cost of items sold in the period" />
            <Stat label="Gross profit" value={formatMoney(data.periodTotals.grossProfit)} sub="Revenue minus cost of goods sold" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Sales performance" className="lg:col-span-2">
              <div className="h-72" role="img" aria-label="Revenue and gross profit by day">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.salesTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors.accent} stopOpacity={0.35} /><stop offset="100%" stopColor={colors.accent} stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.line} vertical={false} />
                    <XAxis dataKey="period" tickFormatter={shortDay} stroke={colors.muted} fontSize={11} tickLine={false} minTickGap={24} />
                    <YAxis stroke={colors.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} width={48} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={l => shortDay(String(l))} formatter={(v: number, n) => [formatMoney(v), n === 'revenue' ? 'Revenue' : 'Gross profit']} />
                    <Legend formatter={n => (n === 'revenue' ? 'Revenue' : 'Gross profit')} wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="revenue" stroke={colors.accent} strokeWidth={2} fill="url(#rev)" />
                    <Area type="monotone" dataKey="grossProfit" stroke={colors.warn} strokeWidth={2} fill="none" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Inventory status">
              {data.inventoryStatus.inStock + data.inventoryStatus.lowStock + data.inventoryStatus.outOfStock === 0 ? (
                <EmptyState title="No products yet" />
              ) : (
                <div className="h-72" role="img" aria-label="Products by stock status">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2} stroke="none"
                        data={[{ name: 'In stock', value: data.inventoryStatus.inStock }, { name: 'Low stock', value: data.inventoryStatus.lowStock }, { name: 'Out of stock', value: data.inventoryStatus.outOfStock }]}>
                        <Cell fill={colors.good} /><Cell fill={colors.warn} /><Cell fill={colors.bad} />
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Top-selling products" actions={<span className="text-xs text-muted">by units sold</span>}>
              {data.topProducts.length === 0 ? <EmptyState title="No sales in this period" /> : (
                <div className="h-64" role="img" aria-label="Top selling products by units">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.topProducts} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={colors.line} horizontal={false} />
                      <XAxis type="number" stroke={colors.muted} fontSize={11} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={140} stroke={colors.muted} fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n) => (n === 'unitsSold' ? [formatNumber(v), 'Units sold'] : [formatMoney(v), 'Revenue'])} />
                      <Bar dataKey="unitsSold" fill={colors.accent} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card title={`Low-stock products (${data.lowStockCount})`} padded={false}
              actions={<Link to="/inventory" className="text-xs text-accent hover:underline">Manage stock</Link>}>
              {data.lowStock.length === 0 ? <EmptyState title="All stocked up" message="No product is at or below its minimum level." /> : (
                <div className="overflow-x-auto">
                  <table className={tableClass}>
                    <thead className={theadClass}><tr><th className={thClass}>Product</th><th className={`${thClass} text-right`}>On hand</th><th className={`${thClass} text-right`}>Min</th><th className={thClass}>Status</th></tr></thead>
                    <tbody>{data.lowStock.map(p => (
                      <tr key={p.id} className={trClass}>
                        <td className={tdClass}><div className="font-medium">{p.name}</div><div className="text-xs text-muted">{p.sku}</div></td>
                        <td className={`${tdClass} tabular text-right`}>{p.quantity}</td>
                        <td className={`${tdClass} tabular text-right text-muted`}>{p.minStock}</td>
                        <td className={tdClass}><StockBadge status={p.stockStatus} /></td>
                      </tr>))}</tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <Card title="Recent transactions" padded={false} actions={<Link to="/sales" className="text-xs text-accent hover:underline">All sales</Link>}>
            {data.recentTransactions.length === 0 ? <EmptyState title="No transactions yet" /> : (
              <div className="overflow-x-auto">
                <table className={tableClass}>
                  <thead className={theadClass}><tr>
                    <th className={thClass}>Receipt</th><th className={thClass}>When</th><th className={thClass}>Cashier</th>
                    <th className={thClass}>Payment</th><th className={`${thClass} text-right`}>Items</th><th className={`${thClass} text-right`}>Total</th><th className={thClass}>Status</th>
                  </tr></thead>
                  <tbody>{data.recentTransactions.map(s => (
                    <tr key={s.id} className={trClass}>
                      <td className={`${tdClass} font-mono text-xs`}>{s.receiptNumber}</td>
                      <td className={`${tdClass} text-muted`}>{formatDateTime(s.createdAt)}</td>
                      <td className={tdClass}>{s.cashierName}</td>
                      <td className={tdClass}>{s.paymentMethod ? <Badge>{s.paymentMethod.replace('_', ' ')}</Badge> : '-'}</td>
                      <td className={`${tdClass} tabular text-right`}>{s.itemCount}</td>
                      <td className={`${tdClass} tabular text-right font-medium`}>{formatMoney(s.total)}</td>
                      <td className={tdClass}><SaleStatusBadge status={s.status} /></td>
                    </tr>))}</tbody>
                </table>
              </div>
            )}
          </Card>
          {data.lowStockCount > 0 && (
            <p className="flex items-center gap-2 text-xs text-muted"><AlertTriangle className="h-3.5 w-3.5 text-warn" /> {data.lowStockCount} product{data.lowStockCount === 1 ? ' is' : 's are'} at or below the minimum stock level.</p>
          )}
        </div>
      )}
    </>
  )
}
