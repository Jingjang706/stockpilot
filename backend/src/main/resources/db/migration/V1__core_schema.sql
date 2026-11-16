-- StockPilot core schema (PostgreSQL 16)

CREATE TABLE users (
    id                   BIGSERIAL PRIMARY KEY,
    username             VARCHAR(50)  NOT NULL UNIQUE,
    email                VARCHAR(150) NOT NULL UNIQUE,
    full_name            VARCHAR(120) NOT NULL,
    password_hash        VARCHAR(100) NOT NULL,
    role                 VARCHAR(20)  NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'CASHIER')),
    active               BOOLEAN      NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN      NOT NULL DEFAULT FALSE,
    last_login_at        TIMESTAMPTZ,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE categories (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(80) NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE suppliers (
    id           BIGSERIAL PRIMARY KEY,
    name         VARCHAR(150) NOT NULL UNIQUE,
    contact_name VARCHAR(120),
    email        VARCHAR(150),
    phone        VARCHAR(40),
    address      VARCHAR(255),
    active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customers (
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(150) NOT NULL,
    email      VARCHAR(150),
    phone      VARCHAR(40),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id            BIGSERIAL PRIMARY KEY,
    sku           VARCHAR(50)  NOT NULL UNIQUE,
    barcode       VARCHAR(60)  UNIQUE,
    name          VARCHAR(200) NOT NULL,
    description   TEXT,
    category_id   BIGINT REFERENCES categories (id),
    supplier_id   BIGINT REFERENCES suppliers (id),
    cost_price    NUMERIC(12, 2) NOT NULL CHECK (cost_price >= 0),
    selling_price NUMERIC(12, 2) NOT NULL CHECK (selling_price >= 0),
    min_stock     INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
    image_url     VARCHAR(500),
    active        BOOLEAN     NOT NULL DEFAULT TRUE,   -- FALSE = archived
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_name     ON products (lower(name));
CREATE INDEX idx_products_category ON products (category_id);
CREATE INDEX idx_products_supplier ON products (supplier_id);

-- One row of current stock per product. Negative stock is impossible by constraint.
CREATE TABLE inventory (
    product_id BIGINT PRIMARY KEY REFERENCES products (id) ON DELETE CASCADE,
    quantity   INTEGER     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stock_movements (
    id              BIGSERIAL PRIMARY KEY,
    product_id      BIGINT      NOT NULL REFERENCES products (id),
    type            VARCHAR(20) NOT NULL CHECK (type IN
                    ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'SALE', 'REFUND', 'VOID', 'PURCHASE_RECEIPT')),
    quantity_change INTEGER     NOT NULL CHECK (quantity_change <> 0),
    quantity_after  INTEGER     NOT NULL CHECK (quantity_after >= 0),
    unit_cost       NUMERIC(12, 2),
    reason          VARCHAR(255),
    reference_type  VARCHAR(30),
    reference_id    BIGINT,
    created_by      BIGINT REFERENCES users (id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_movements_product ON stock_movements (product_id, created_at DESC);
CREATE INDEX idx_movements_created ON stock_movements (created_at DESC);

CREATE TABLE purchases (
    id          BIGSERIAL PRIMARY KEY,
    po_number   VARCHAR(30) NOT NULL UNIQUE,
    supplier_id BIGINT      NOT NULL REFERENCES suppliers (id),
    status      VARCHAR(15) NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING', 'APPROVED', 'RECEIVED', 'CANCELLED')),
    notes       VARCHAR(500),
    total_cost  NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
    created_by  BIGINT NOT NULL REFERENCES users (id),
    approved_by BIGINT REFERENCES users (id),
    received_by BIGINT REFERENCES users (id),
    received_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchases_supplier ON purchases (supplier_id);
CREATE INDEX idx_purchases_status   ON purchases (status);

CREATE TABLE purchase_items (
    id          BIGSERIAL PRIMARY KEY,
    purchase_id BIGINT NOT NULL REFERENCES purchases (id) ON DELETE CASCADE,
    product_id  BIGINT NOT NULL REFERENCES products (id),
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost   NUMERIC(12, 2) NOT NULL CHECK (unit_cost >= 0),
    UNIQUE (purchase_id, product_id)
);

CREATE SEQUENCE receipt_seq START 1001;
CREATE SEQUENCE po_seq      START 1001;

CREATE TABLE sales (
    id              BIGSERIAL PRIMARY KEY,
    receipt_number  VARCHAR(30) NOT NULL UNIQUE,
    cashier_id      BIGINT      NOT NULL REFERENCES users (id),
    customer_id     BIGINT REFERENCES customers (id),
    status          VARCHAR(15) NOT NULL DEFAULT 'COMPLETED'
                    CHECK (status IN ('COMPLETED', 'VOIDED', 'REFUNDED')),
    subtotal        NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
    discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    total           NUMERIC(14, 2) NOT NULL CHECK (total >= 0),
    cogs            NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (cogs >= 0),
    reversal_reason VARCHAR(255),
    reversed_by     BIGINT REFERENCES users (id),
    reversed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (discount_amount <= subtotal)
);
CREATE INDEX idx_sales_created ON sales (created_at DESC);
CREATE INDEX idx_sales_cashier ON sales (cashier_id, created_at DESC);
CREATE INDEX idx_sales_status  ON sales (status);

CREATE TABLE sale_items (
    id           BIGSERIAL PRIMARY KEY,
    sale_id      BIGINT NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
    product_id   BIGINT NOT NULL REFERENCES products (id),
    product_name VARCHAR(200) NOT NULL,   -- snapshot at time of sale
    sku          VARCHAR(50)  NOT NULL,
    quantity     INTEGER NOT NULL CHECK (quantity > 0),
    unit_price   NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    unit_cost    NUMERIC(12, 2) NOT NULL CHECK (unit_cost >= 0),
    line_total   NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0)
);
CREATE INDEX idx_sale_items_sale    ON sale_items (sale_id);
CREATE INDEX idx_sale_items_product ON sale_items (product_id);

CREATE TABLE payments (
    id         BIGSERIAL PRIMARY KEY,
    sale_id    BIGINT NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
    method     VARCHAR(20) NOT NULL CHECK (method IN ('CASH', 'BANK_TRANSFER', 'OTHER')),
    amount     NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
    reference  VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_sale ON payments (sale_id);

CREATE TABLE audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT REFERENCES users (id) ON DELETE SET NULL,
    username    VARCHAR(50),
    action      VARCHAR(40)  NOT NULL,
    entity_type VARCHAR(40),
    entity_id   VARCHAR(40),
    details     VARCHAR(1000),
    ip_address  VARCHAR(45),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_user    ON audit_logs (user_id);
CREATE INDEX idx_audit_action  ON audit_logs (action);
