# StockPilot multi-branch development plan

## Agreed scope

- Hosting budget: **100% free**. Do not provision paid Render resources.
- Initial operating shape: **3–5 branches** (configurable; do not hard-code a maximum of five).
- Inventory model: **separate stock per branch**.
- One central StockPilot API and one logical business database; branch records partition operational data.
- The existing Render deployment and database are development/demo only. Do not point a new build at the existing database for destructive migrations, cleanup, or test fixtures.
- This document is a development specification, not a claim that multi-branch behavior is already implemented.

## Current-code findings

The current schema has one global inventory row per product (`inventory.product_id` is its primary key). Sales, purchases, stock movements, and users have no branch association. The inventory service locks stock by product ID, and POS checkout consumes that global stock. Reporting queries aggregate globally. Therefore, adding only a branch selector in the UI would be unsafe: users could still read or mutate another branch's data through the API.

## Target domain model

### Organization and branches

- `branches`: `id`, unique `code`, `name`, `address`, `phone`, `timezone`, `active`, timestamps.
- A business starts with one explicitly selected **Main Branch** during migration. Additional branches are created by an authorized administrator.
- Branch codes are stable identifiers used in receipts, stock transfers, exports, and audit records.
- Do not infer branch from client-supplied text or trust a branch ID without checking the authenticated user's membership.

### User access

- `user_branches`: `user_id`, `branch_id`, `is_default`, timestamps; unique pair and at most one default branch per user.
- Admins may be granted all branches; managers and cashiers receive explicit branch assignments.
- Login identity remains global. The authenticated context includes permitted branch IDs and the selected active branch.
- Every branch-scoped endpoint must enforce membership server-side. A cashier may only sell and view permitted branch records. A manager may manage assigned branches. Cross-branch reports and transfers require elevated authorization.
- Branch switching must be an authenticated API action or be validated against the server-issued membership list; never accept a raw frontend branch ID as authorization.

### Separate inventory

- Change inventory identity from one row per product to one row per **(branch, product)**.
- Primary/unique key: `(branch_id, product_id)`; quantity remains non-negative.
- Every stock movement includes `branch_id`; `quantity_after` is the post-movement balance for that branch/product pair.
- Sale and purchase receiving stock changes must use the sale/purchase branch and lock the matching branch/product inventory row.
- Product catalog, SKU, categories, and supplier master data remain shared initially. Stock quantity and low-stock evaluation are branch-specific. Decide later whether supplier assignment needs branch-specific overrides.

### Transactions and transfers

- Add required `branch_id` to `sales` and `purchases`; receipt/PO uniqueness must include branch identity (or include branch code in the generated number).
- Add `stock_transfers` and `stock_transfer_items` with source branch, destination branch, status, requester, approver, dispatched/received timestamps, and immutable line quantities.
- Transfer workflow: request -> approve (if required by policy) -> dispatch (decrement source) -> receive (increment destination). Each step is transactional, idempotent, audited, and produces linked stock movements. Never make stock appear at the destination before dispatch/receipt rules permit it.
- Transfers between the same branch are rejected. Quantities must be positive. Insufficient source stock rejects dispatch. A transfer cannot be received twice.

### Reporting

- Default dashboard and reports are scoped to the active branch.
- Authorized owners/admins can request consolidated totals and branch comparisons.
- Every report endpoint validates branch scope; an omitted branch filter must not accidentally become unrestricted access for a manager or cashier.
- Inventory valuation and low-stock counts are computed for the selected branch or explicit authorized branch set.

## Migration strategy (must be tested on a disposable database)

1. Create a new migration after the current schema migration; never edit an already-applied migration.
2. Create a Main Branch record.
3. Create the user-branch assignment table and assign existing users to Main Branch as a compatibility baseline. Review admin access separately.
4. Replace the inventory primary key with a composite branch/product key; backfill each existing inventory row into Main Branch without changing quantities.
5. Add Main Branch to existing sales, purchases, and stock movements; preserve all existing IDs, timestamps, totals, receipts, and movement history.
6. Add constraints, foreign keys, indexes, and branch-aware receipt/PO uniqueness only after backfill succeeds.
7. Validate row counts and stock reconciliation: pre-migration inventory quantity equals Main Branch quantity for every product; sale and purchase totals remain unchanged.
8. Deploy to a separate staging database first. Do not apply this migration to the currently deployed demo database until a verified export, restore test, and explicit owner approval exist.

## API work required

- Branch CRUD and branch membership administration.
- Authenticated branch context / branch switch endpoint.
- Branch-scoped inventory, stock movement, checkout, sale history, purchase receiving, dashboard, and reporting.
- Stock transfer lifecycle endpoints.
- Consistent authorization tests for missing, invalid, inactive, and unauthorized branch IDs.
- Ensure server-side service/repository queries are branch-aware. UI filtering alone is not security.

## Frontend work required

- Branch selector in the authenticated application shell, showing only branches the user can access.
- Branch management and staff assignment screens for administrators.
- Active-branch context surfaced in POS, inventory, sales, purchases, and reports.
- Branch-specific inventory quantities and low-stock indicators.
- Transfer workflow screens with status and audit trail.
- Consolidated reporting only for authorized roles.
- Clear empty/loading/error states when a user has no assigned active branch.

## Acceptance criteria

- A cashier assigned to Branch A cannot read, sell from, adjust, or view reports for Branch B by changing request parameters.
- Selling a product at Branch A changes only Branch A stock; Branch B stock is unchanged.
- A product can have different quantities and low-stock states at each branch.
- Concurrent checkouts at one branch cannot oversell its stock; simultaneous sales at separate branches do not lock unrelated stock rows.
- Purchase receiving increases stock only at the purchase's branch.
- Transfers preserve total stock across source + destination, with no double dispatch/receipt and a complete audit trail.
- Branch reports reconcile with consolidated totals.
- Existing demo data migrates to Main Branch with no lost or duplicated quantities, sales, purchases, or movements.
- Backend integration tests and frontend tests pass; a browser-based multi-user staging test is completed before any production use.

## Free-hosting operating limits

Keep the existing Render free frontend/API for demos and development only. The currently attached free PostgreSQL instance is temporary and expires; it must not be treated as durable business storage. Do not create paid services or databases. Do not promise checkout availability, durable backups, or permanent retention on the free tier. Keep fixtures and automated tests on isolated disposable databases, never against the live/demo database.

## Explicitly out of scope until separately approved

- Merging any pull request.
- Changing the Render Blueprint, service environment variables, deploy branch, or live deployment.
- Applying migrations to the current Render database, deleting demo data, or importing real business records.
- Creating paid resources or enabling paid upgrades.
- Enabling production checkout or describing StockPilot as production-certified.
