import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, CircleAlert, Inbox, Loader2, RotateCw } from 'lucide-react'
import { Button } from './Button'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, actions, children, className = '', padded = true }:
  { title?: string; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`rounded-xl border bg-surface shadow-card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </div>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  )
}

const tones = {
  neutral: 'bg-raised text-muted ring-line',
  good: 'bg-good/10 text-good ring-good/25',
  warn: 'bg-warn/10 text-warn ring-warn/30',
  bad: 'bg-bad/10 text-bad ring-bad/25',
  accent: 'bg-accent/10 text-accent ring-accent/25',
} as const
export type Tone = keyof typeof tones
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>{children}</span>
}

export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between text-muted">
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className="tabular mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}...
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-raised ${className}`} />
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-3 rounded-full bg-raised p-3 text-muted"><Inbox className="h-6 w-6" /></div>
      <p className="font-medium">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-3 rounded-full bg-bad/10 p-3 text-bad"><CircleAlert className="h-6 w-6" /></div>
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry && <Button className="mt-4" size="sm" onClick={onRetry}><RotateCw className="h-4 w-4" /> Try again</Button>}
    </div>
  )
}

export function Pagination({ page, totalPages, total, onChange }:
  { page: number; totalPages: number; total: number; onChange: (page: number) => void }) {
  if (total === 0) return null
  return (
    <div className="no-print flex items-center justify-between border-t px-4 py-3 text-sm text-muted">
      <span>{total} result{total === 1 ? '' : 's'}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 0} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="tabular">Page {page + 1} of {Math.max(totalPages, 1)}</span>
        <Button size="sm" variant="secondary" disabled={page + 1 >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}

/** Shared table styling: <table className={tableClass}> <thead className={theadClass}> ... */
export const tableClass = 'w-full text-left text-sm'
export const theadClass = 'border-b bg-raised/60 text-xs uppercase tracking-wide text-muted'
export const thClass = 'whitespace-nowrap px-4 py-2.5 font-medium'
export const tdClass = 'px-4 py-3 align-middle'
export const trClass = 'border-b last:border-0 hover:bg-raised/50'
