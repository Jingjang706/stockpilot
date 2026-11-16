import type { MovementType, PurchaseStatus, SaleStatus, StockStatus } from '../../lib/types'
import { titleCase } from '../../lib/format'
import { Badge, type Tone } from './Display'

export function StockBadge({ status }: { status: StockStatus }) {
  const tone: Tone = status === 'IN_STOCK' ? 'good' : status === 'LOW_STOCK' ? 'warn' : 'bad'
  return <Badge tone={tone}>{titleCase(status)}</Badge>
}
export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return <Badge tone={status === 'COMPLETED' ? 'good' : status === 'VOIDED' ? 'bad' : 'warn'}>{titleCase(status)}</Badge>
}
export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  const tone: Tone = status === 'RECEIVED' ? 'good' : status === 'APPROVED' ? 'accent' : status === 'PENDING' ? 'warn' : 'neutral'
  return <Badge tone={tone}>{titleCase(status)}</Badge>
}
export function MovementBadge({ type }: { type: MovementType }) {
  const tone: Tone = type === 'SALE' || type === 'STOCK_OUT' ? 'neutral'
    : type === 'PURCHASE_RECEIPT' || type === 'STOCK_IN' ? 'good'
      : type === 'ADJUSTMENT' ? 'warn' : 'accent'
  return <Badge tone={tone}>{titleCase(type)}</Badge>
}
