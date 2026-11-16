export interface CartLine { productId: number; name: string; sku: string; unitPrice: number; quantity: number; available: number }

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export const cartSubtotal = (cart: CartLine[]) => round2(cart.reduce((sum, l) => sum + round2(l.unitPrice * l.quantity), 0))

/** Cashiers may discount up to 5% of the subtotal; this mirrors the rule enforced by the backend. */
export const discountLimit = (subtotal: number) => round2(subtotal * 0.05)
