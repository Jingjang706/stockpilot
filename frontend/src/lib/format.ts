const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const formatMoney = (n: number | null | undefined) => (n === null || n === undefined ? '-' : money.format(n))
export const formatNumber = (n: number) => new Intl.NumberFormat('en-US').format(n)
export const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '-'
export const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '-'

/** yyyy-mm-dd in local time, for <input type="date"> and API params. */
export const toDateInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return toDateInput(d) }

export const titleCase = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^\w|\s\w/g, c => c.toUpperCase())

/** Short label for chart axes: 2026-11-05 -> Nov 5 */
export const shortDay = (yyyyMmDd: string) => {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
