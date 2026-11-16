import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { AuditLog, Page } from '../lib/types'
import { formatDateTime, titleCase } from '../lib/format'
import { useAsync, useDebounced } from '../lib/useAsync'
import { FilterInput, FilterSelect } from '../components/ui/Form'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, Spinner, tableClass, tdClass, theadClass, thClass, trClass, type Tone } from '../components/ui/Display'

const ACTIONS = ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'USER_CREATED', 'USER_UPDATED',
  'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_ARCHIVED', 'PRODUCT_RESTORED', 'STOCK_ADJUSTED', 'SALE_CREATED', 'SALE_VOIDED', 'SALE_REFUNDED',
  'PURCHASE_CREATED', 'PURCHASE_APPROVED', 'PURCHASE_RECEIVED', 'PURCHASE_CANCELLED', 'CATEGORY_CREATED', 'CATEGORY_UPDATED', 'CATEGORY_DELETED', 'SUPPLIER_CREATED', 'SUPPLIER_UPDATED']

const tone = (a: string): Tone => (a.endsWith('FAILED') || a.includes('VOIDED') || a.includes('REFUNDED') || a.includes('CANCELLED') ? 'bad'
  : a.startsWith('LOGIN') || a === 'LOGOUT' ? 'neutral' : a.includes('PASSWORD') || a.startsWith('USER') || a === 'STOCK_ADJUSTED' ? 'warn' : 'accent')

export default function AuditLogsPage() {
  const [action, setAction] = useState('')
  const [username, setUsername] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const user = useDebounced(username)
  useEffect(() => { setPage(0) }, [action, user, from, to])
  const { data, error, loading, reload } = useAsync(() => api.get<Page<AuditLog>>('/api/audit-logs', { action, username: user, from, to, page, size: 25 }), [action, user, from, to, page])

  return (
    <>
      <PageHeader title="Audit log" subtitle="Who did what, and when. Entries cannot be edited or deleted from the application." />
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <FilterSelect aria-label="Filter by action" value={action} onChange={e => setAction(e.target.value)}>
            <option value="">All actions</option>{ACTIONS.map(a => <option key={a} value={a}>{titleCase(a)}</option>)}
          </FilterSelect>
          <FilterInput placeholder="Username" aria-label="Filter by username" value={username} onChange={e => setUsername(e.target.value)} className="w-40" />
          <FilterInput type="date" aria-label="From date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} className="w-36" />
          <span className="text-muted">to</span>
          <FilterInput type="date" aria-label="To date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} className="w-36" />
        </div>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Spinner /> : !data || data.content.length === 0 ? <EmptyState title="No audit entries match" /> : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}><table className={tableClass}>
            <thead className={theadClass}><tr><th className={thClass}>Time</th><th className={thClass}>User</th><th className={thClass}>Action</th><th className={thClass}>Entity</th><th className={thClass}>Details</th><th className={thClass}>IP</th></tr></thead>
            <tbody>{data.content.map(a => (
              <tr key={a.id} className={trClass}>
                <td className={`${tdClass} whitespace-nowrap text-muted`}>{formatDateTime(a.createdAt)}</td>
                <td className={`${tdClass} font-medium`}>{a.username ?? 'system'}</td>
                <td className={tdClass}><Badge tone={tone(a.action)}>{titleCase(a.action)}</Badge></td>
                <td className={`${tdClass} text-muted`}>{a.entityType ? `${titleCase(a.entityType)}${a.entityId ? ` #${a.entityId}` : ''}` : '-'}</td>
                <td className={`${tdClass} max-w-md text-muted`}>{a.details ?? '-'}</td>
                <td className={`${tdClass} font-mono text-xs text-muted`}>{a.ipAddress ?? '-'}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        {data && <Pagination page={data.number} totalPages={data.totalPages} total={data.totalElements} onChange={setPage} />}
      </Card>
    </>
  )
}
