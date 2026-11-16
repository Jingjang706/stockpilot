import { passwordSchema } from '../pages/ChangePasswordPage'
import { productSchema } from '../pages/ProductsPage'

describe('password rules (match the backend)', () => {
  const ok = { currentPassword: 'old', newPassword: 'Newpass123', confirm: 'Newpass123' }
  it('accepts a valid password', () => expect(passwordSchema.safeParse(ok).success).toBe(true))
  it('rejects short, digit-less, letter-less and mismatched passwords', () => {
    expect(passwordSchema.safeParse({ ...ok, newPassword: 'Ab1', confirm: 'Ab1' }).success).toBe(false)
    expect(passwordSchema.safeParse({ ...ok, newPassword: 'abcdefgh', confirm: 'abcdefgh' }).success).toBe(false)
    expect(passwordSchema.safeParse({ ...ok, newPassword: '12345678', confirm: '12345678' }).success).toBe(false)
    expect(passwordSchema.safeParse({ ...ok, confirm: 'Different123' }).success).toBe(false)
  })
})

describe('product form validation', () => {
  const ok = { sku: 'ABC-1', name: 'Pen', costPrice: 1, sellingPrice: 2, minStock: 5 }
  it('accepts a minimal valid product', () => expect(productSchema.safeParse(ok).success).toBe(true))
  it('requires sku and name, and forbids negative prices or fractional stock', () => {
    expect(productSchema.safeParse({ ...ok, sku: '' }).success).toBe(false)
    expect(productSchema.safeParse({ ...ok, name: ' ' }).success).toBe(false)
    expect(productSchema.safeParse({ ...ok, costPrice: -1 }).success).toBe(false)
    expect(productSchema.safeParse({ ...ok, minStock: 2.5 }).success).toBe(false)
    expect(productSchema.safeParse({ ...ok, imageUrl: 'javascript:alert(1)' }).success).toBe(false)
  })
})
