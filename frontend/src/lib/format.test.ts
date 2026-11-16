import { formatMoney, shortDay, titleCase, toDateInput } from './format'

describe('formatting helpers', () => {
  it('formats money as USD and shows a dash for missing values', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50')
    expect(formatMoney(null)).toBe('-')
  })
  it('converts enum-like codes to readable labels', () => {
    expect(titleCase('PURCHASE_RECEIPT')).toBe('Purchase Receipt')
    expect(titleCase('LOW_STOCK')).toBe('Low Stock')
  })
  it('formats dates for inputs in local time', () => {
    expect(toDateInput(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
  it('shortens ISO days for chart axes', () => {
    expect(shortDay('2026-11-05')).toMatch(/Nov/)
  })
})
