import { cartSubtotal, discountLimit, type CartLine } from './cart'

const line = (unitPrice: number, quantity: number): CartLine => ({ productId: 1, name: 'x', sku: 'x', unitPrice, quantity, available: 100 })

describe('cart maths (must mirror the backend)', () => {
  it('sums line totals rounded to cents', () => {
    expect(cartSubtotal([line(10, 4), line(2.5, 2)])).toBe(45)
    expect(cartSubtotal([line(0.1, 3), line(0.2, 3)])).toBe(0.9)   // avoids 0.9000000000000001
  })
  it('is zero for an empty cart', () => expect(cartSubtotal([])).toBe(0))
  it('limits cashier discounts to 5% of the subtotal', () => {
    expect(discountLimit(20)).toBe(1)
    expect(discountLimit(19.99)).toBe(1)
    expect(discountLimit(0)).toBe(0)
  })
})
