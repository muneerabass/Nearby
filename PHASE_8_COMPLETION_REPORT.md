# Emblem Phase 8 Completion Report

## Scope

Phase 8 hardened the existing Go modular monolith and PostgreSQL integration without introducing microservices, Kafka, Kubernetes, or a replacement persistence layer.

## Implemented

### Inventory movement history — PASS

The existing `inventory_adjustments` table was extended rather than replaced:

- Added nullable `order_id` with a foreign key to `orders`.
- Added an order lookup index for linked movements.
- Checkout now records one negative movement per reserved order item.
- Cancellation restoration now locks each inventory row, updates the balance, and records the positive restoration movement atomically with the cancellation transaction.
- Existing admin adjustments remain unchanged and continue to record before/change/after quantities and reasons.
- Inventory adjustment API responses now expose the linked order ID when present.
- Existing balances and order snapshots are preserved.

Migration: `backend-go/internal/migrations/0015_inventory_movement_audit.sql`.

### Transactions and consistency — PASS/PARTIAL

- Order reservation movements are written in the same transaction as order creation and stock decrement.
- Cancellation restoration uses a row lock and the same transaction as the status change.
- Existing idempotency and inventory locking were preserved.
- Unit test coverage was added for reservation and cancellation movement records.
- PostgreSQL concurrency behavior remains NOT VERIFIED because no test database/dependency environment was available.

### Request IDs and observability — PASS

- Every server request receives or propagates `X-Request-ID`.
- Request IDs are included in JSON error responses.
- Access logs are structured JSON containing request ID, method, route path, status, and latency.
- Query strings, bodies, authorization headers, OTPs, tokens, passwords, delivery codes, and secrets are not logged.
- Added API conventions documentation in `backend-go/API.md`.

### Security and configuration — PASS/PARTIAL

Existing protections were preserved and audited:

- JWT parsing restricts the signing algorithm and validates issuer, expiry, and session state.
- Backend role middleware and service/repository ownership checks remain authoritative.
- OTP expiry, attempt limits, phone/IP rate limits, and PostgreSQL advisory locking remain enabled.
- Production validation already rejects missing/weak secrets, wildcard-compatible empty CORS configuration, and development OTP logging.
- PostgreSQL pool settings remain environment-based with pilot defaults of 10 open and 5 idle connections per instance.

The in-process rate limiter remains best-effort across multiple replicas; a global quota still belongs at the API gateway/WAF or a distributed counter layer.

### Query and schema review — PARTIAL

Reviewed migrations, foreign keys, indexes, catalog joins, order listing, pagination, and connection setup. Existing order/catalog indexes and cursor/limit safeguards were retained.

No speculative catalog or order-list indexes were added because `EXPLAIN ANALYZE` could not be run against representative PostgreSQL data in the available environment. The new inventory audit index is limited to the new order-linked audit access path.

Known query consideration: order mapping and some detail responses perform related lookups per record. At the target scale this remains manageable, but should be measured with production-shaped data before introducing preload/batch changes.

## Modified files and areas

- `backend-go/internal/migrations/0015_inventory_movement_audit.sql`
- Inventory adjustment domain, repository, service, DTO, and tests.
- Request-ID middleware, structured request logging, and standardized error response correlation.
- `backend-go/API.md` API conventions and operational documentation.

## Verification

- Go formatting: PASS — modified Go files are `gofmt` clean.
- Scoped whitespace check: PASS — `git diff --check` reported no findings.
- React Native TypeScript: PASS — `npx tsc --noEmit --pretty false`.
- React Native Jest: PASS — 8 suites, 49 tests.
- Go tests/build: NOT VERIFIED. Dependency downloads failed because `proxy.golang.org` could not resolve in this environment, before backend compilation.
- PostgreSQL migrations: NOT VERIFIED. No disposable PostgreSQL service was available and no production database was touched.
- `EXPLAIN ANALYZE`: NOT VERIFIED. No representative PostgreSQL dataset/connection was available.
- Security/concurrency integration tests: NOT VERIFIED for the same backend dependency/database limitation.

## Remaining risks

1. Run `go test ./...` and `go build ./...` in a network-enabled environment with dependencies cached.
2. Run migration idempotence, inventory movement, cancellation-race, and concurrent checkout tests against disposable PostgreSQL.
3. Capture `EXPLAIN (ANALYZE, BUFFERS)` for catalog search, pincode catalog, customer order history, admin order filters, and inventory audit queries before adding further indexes.
4. Replace the per-process OTP/request rate-limit state with gateway or distributed enforcement before running multiple public replicas.
5. Add a batch/preload strategy only if measured N+1 behavior becomes material at the target workload.

