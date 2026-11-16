# Production readiness and launch runbook

StockPilot is an operational prototype, not a certified or fully production-hardened POS product. Do not use it as the sole system of record for a business until every launch gate below has been completed and tested in the target environment.

## Safe deployment defaults

The Render Blueprint is configured to:
- Run Flyway schema migrations only; it does not load the demo seed for a new database.
- Validate Hibernate entities against the migrated schema at startup.
- Use `Asia/Phnom_Penh` for business-day and receipt/report boundaries. Change this to the shop's actual IANA timezone if needed.
- Generate the JWT signing secret through Render's secret generation.

**Important:** Removing the seed location does not remove demo rows already inserted into an existing database. The current demo database must be backed up, reviewed, and cleaned or replaced deliberately before real business use. Never run an unreviewed destructive cleanup against the live database.

## Required launch gates

### 1. Infrastructure and data durability
- Replace Render free Postgres with a durable paid database or a managed PostgreSQL provider with automated backups, point-in-time recovery, retention, and tested restore procedures. Render free databases expire.
- Do not rely on free web services for checkout availability: free instances can sleep and have no production availability guarantee.
- Keep API and database in the same region; restrict database network access.
- Configure custom domain, TLS, uptime monitoring, alerting, log retention, and documented incident contacts.
- Test backup restoration into a separate staging database before importing real data.

### 2. Identity and application security
- Add and verify login rate limiting / brute-force protection and account lockout with a safe recovery process.
- Add a secure first-admin bootstrap procedure that does not ship shared/default credentials; disable it after initialization.
- Review token lifetime, revocation, and browser token storage. Current access tokens are stateless JWTs held in sessionStorage; logout is audit-only and does not revoke a copied token before expiry.
- Add security headers, dependency scanning, secret scanning, and regular patching.
- Review audit-log access, retention, and protection against tampering.
- Perform an independent authorization review for every endpoint and role.

### 3. Business and financial correctness
- Confirm currency, decimal precision, tax/VAT rules, receipt numbering, rounding, business timezone, refund policy, discount permissions, and cash-drawer procedures with the business and local accountant.
- Current payment methods record payment information; they do not process card or bank payments through a payment provider.
- Test sale, void, refund, purchase receiving, concurrent checkout, stock reconciliation, and month-end reports using realistic data.
- Define how to handle partial refunds, partial receipts, exchanges, returns, damaged goods, and stock counts before staff depend on the system.
- Do not represent generated receipts or reports as tax-compliant without local review.

### 4. Quality and release controls
- Run `cd backend && mvn clean verify` with Docker available for Testcontainers.
- Run `cd frontend && npm ci && npm test && npm run build`.
- Run `python3 scripts/smoke_test.py` against an isolated staging deployment.
- Add browser end-to-end tests against the real Spring Boot API, not a stand-in.
- Test migration and rollback/restore procedures on a production-like copy.
- Use a staging environment and reviewed release process before production deploys.

## Existing verification limitation

The repository's README records that backend compilation and backend tests were not executed in the original authoring environment. A successful container image build or Render deploy is not a substitute for the full test suite. Treat all business workflows as unverified until the commands above pass against the current commit.

## First launch sequence

1. Create a separate production database and take a verified backup before any import.
2. Deploy the production branch to staging and confirm Flyway + Hibernate validation.
3. Implement a one-time secure admin bootstrap; create the real owner account and remove all demo accounts/data from the production database only after backup and explicit review.
4. Complete the security, accounting, and operational gates above.
5. Train staff, run parallel/manual reconciliation for an agreed pilot period, and define support/rollback ownership.
6. Only then decide whether StockPilot is suitable as the business's primary POS/inventory system.

This checklist is an engineering guide, not legal, tax, payment-industry, or security certification.
