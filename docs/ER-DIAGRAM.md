# Database ER diagram

Source of truth: [`backend/src/main/resources/db/migration/V1__core_schema.sql`](../backend/src/main/resources/db/migration/V1__core_schema.sql).
GitHub renders the Mermaid diagram below directly.

```mermaid
erDiagram
    USERS ||--o{ SALES : "rings up (cashier)"
    USERS ||--o{ PURCHASES : "creates / approves / receives"
    USERS ||--o{ STOCK_MOVEMENTS : "performs"
    USERS ||--o{ AUDIT_LOGS : "responsible for"
    CATEGORIES ||--o{ PRODUCTS : classifies
    SUPPLIERS ||--o{ PRODUCTS : "usually supplies"
    SUPPLIERS ||--o{ PURCHASES : "receives orders"
    PRODUCTS ||--|| INVENTORY : "current stock"
    PRODUCTS ||--o{ STOCK_MOVEMENTS : "history"
    PRODUCTS ||--o{ PURCHASE_ITEMS : ordered
    PRODUCTS ||--o{ SALE_ITEMS : sold
    PURCHASES ||--|{ PURCHASE_ITEMS : contains
    SALES ||--|{ SALE_ITEMS : contains
    SALES ||--|{ PAYMENTS : "paid by"

    USERS {
        bigint id PK
        varchar username UK
        varchar email UK
        varchar password_hash "BCrypt"
        varchar role "ADMIN | MANAGER | CASHIER"
        boolean active
        boolean must_change_password
    }
    CATEGORIES { bigint id PK
        varchar name UK }
    SUPPLIERS { bigint id PK
        varchar name UK
        varchar email
        boolean active }
    PRODUCTS {
        bigint id PK
        varchar sku UK
        varchar barcode UK
        bigint category_id FK
        bigint supplier_id FK
        numeric cost_price
        numeric selling_price
        int min_stock
        boolean active "false = archived"
    }
    INVENTORY {
        bigint product_id PK, FK
        int quantity "CHECK >= 0"
    }
    STOCK_MOVEMENTS {
        bigint id PK
        bigint product_id FK
        varchar type "STOCK_IN, STOCK_OUT, ADJUSTMENT, SALE, REFUND, VOID, PURCHASE_RECEIPT"
        int quantity_change
        int quantity_after "CHECK >= 0"
        varchar reference_type
        bigint reference_id
        bigint created_by FK
    }
    PURCHASES {
        bigint id PK
        varchar po_number UK
        bigint supplier_id FK
        varchar status "PENDING, APPROVED, RECEIVED, CANCELLED"
        numeric total_cost
        bigint created_by FK
        bigint approved_by FK
        bigint received_by FK
    }
    PURCHASE_ITEMS {
        bigint id PK
        bigint purchase_id FK
        bigint product_id FK
        int quantity
        numeric unit_cost
    }
    SALES {
        bigint id PK
        varchar receipt_number UK
        bigint cashier_id FK
        varchar status "COMPLETED, VOIDED, REFUNDED"
        numeric subtotal
        numeric discount_amount
        numeric total
        numeric cogs "cost of goods, snapshotted"
    }
    SALE_ITEMS {
        bigint id PK
        bigint sale_id FK
        bigint product_id FK
        varchar product_name "snapshot"
        int quantity
        numeric unit_price
        numeric unit_cost
        numeric line_total
    }
    PAYMENTS {
        bigint id PK
        bigint sale_id FK
        varchar method "CASH, BANK_TRANSFER, OTHER"
        numeric amount
    }
    AUDIT_LOGS {
        bigint id PK
        bigint user_id FK
        varchar username
        varchar action
        varchar entity_type
        varchar entity_id
        varchar ip_address
    }
```

Notes
- `customers` exists in the schema (the brief lists it) but no screen or API uses it yet; see "Future improvements" in the README.
- Indexes cover the hot paths: product name/category/supplier, movements by product and date, sales by date/cashier/status, audit by date/user/action.
