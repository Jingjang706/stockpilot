export type Role = 'ADMIN' | 'MANAGER' | 'CASHIER'
export type SaleStatus = 'COMPLETED' | 'VOIDED' | 'REFUNDED'
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'OTHER'
export type PurchaseStatus = 'PENDING' | 'APPROVED' | 'RECEIVED' | 'CANCELLED'
export type MovementType = 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT' | 'SALE' | 'REFUND' | 'VOID' | 'PURCHASE_RECEIPT'
export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'

export interface Page<T> { content: T[]; totalElements: number; totalPages: number; number: number; size: number }

export interface UserSummary { id: number; username: string; fullName: string; email: string; role: Role; mustChangePassword: boolean }
export interface LoginResponse { token: string; expiresAt: string; user: UserSummary }

export interface Product {
  id: number; sku: string; barcode: string | null; name: string; description: string | null
  categoryId: number | null; categoryName: string | null; supplierId: number | null; supplierName: string | null
  costPrice: number | null; sellingPrice: number; quantity: number; minStock: number
  stockStatus: StockStatus; imageUrl: string | null; active: boolean; createdAt: string; updatedAt: string
}
export interface Category { id: number; name: string; description: string | null }
export interface Supplier { id: number; name: string; contactName: string | null; email: string | null; phone: string | null; address: string | null; active: boolean; createdAt: string }

export interface Movement {
  id: number; productId: number; productName: string; sku: string; type: MovementType; quantityChange: number
  quantityAfter: number; unitCost: number | null; reason: string | null; referenceType: string | null
  referenceId: number | null; createdBy: string | null; createdAt: string
}

export interface SaleItem { productId: number; productName: string; sku: string; quantity: number; unitPrice: number; lineTotal: number }
export interface Payment { method: PaymentMethod; amount: number; reference: string | null }
export interface Sale {
  id: number; receiptNumber: string; status: SaleStatus; cashierId: number; cashierName: string
  subtotal: number; discountAmount: number; total: number; cogs: number | null
  items: SaleItem[]; payments: Payment[]; reversalReason: string | null; reversedBy: string | null
  reversedAt: string | null; createdAt: string
}
export interface SaleSummary { id: number; receiptNumber: string; status: SaleStatus; cashierName: string; total: number; itemCount: number; paymentMethod: PaymentMethod | null; createdAt: string }

export interface PurchaseItem { productId: number; productName: string; sku: string; quantity: number; unitCost: number; lineTotal: number }
export interface Purchase {
  id: number; poNumber: string; supplierId: number; supplierName: string; status: PurchaseStatus; notes: string | null
  totalCost: number; createdBy: string; approvedBy: string | null; receivedBy: string | null
  receivedAt: string | null; createdAt: string; items: PurchaseItem[]
}

export interface AppUser { id: number; username: string; email: string; fullName: string; role: Role; active: boolean; mustChangePassword: boolean; lastLoginAt: string | null; createdAt: string }
export interface CredentialResponse { user: AppUser; temporaryPassword: string }
export interface AuditLog { id: number; userId: number | null; username: string | null; action: string; entityType: string | null; entityId: string | null; details: string | null; ipAddress: string | null; createdAt: string }

export interface Totals { count: number; revenue: number; cogs: number; grossProfit: number }
export interface SalesBucket { period: string; count: number; revenue: number; cogs: number; grossProfit: number }
export interface TopProduct { productId: number; name: string; sku: string; unitsSold: number; revenue: number }
export interface Dashboard {
  from: string; to: string; totalProducts: number; inventoryValue: number
  salesToday: { count: number; revenue: number }; monthToDate: { count: number; revenue: number }
  lowStockCount: number; lowStock: Product[]; recentTransactions: SaleSummary[]
  salesTrend: SalesBucket[]; topProducts: TopProduct[]
  inventoryStatus: { inStock: number; lowStock: number; outOfStock: number }; periodTotals: Totals
}
export interface SalesReport { grain: string; from: string | null; to: string | null; buckets: SalesBucket[]; totals: Totals }
export interface ValuationRow { productId: number; sku: string; name: string; category: string | null; quantity: number; unitCost: number; costValue: number; retailValue: number }
export interface ValuationReport { rows: ValuationRow[]; totalCostValue: number; totalRetailValue: number }
export interface RevenueOverview {
  from: string | null; to: string | null; completed: Totals; grossMarginPercent: number
  voidedCount: number; voidedAmount: number; refundedCount: number; refundedAmount: number; purchaseSpend: number
}
export interface PurchaseReport { from: string | null; to: string | null; purchases: Purchase[]; totalOrdered: number; totalReceived: number }
