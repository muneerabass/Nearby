# Emblem Improvement Roadmap

This roadmap is ordered for a 500–1,000-user pilot and preserves the current monolith, React Native client, Go API and PostgreSQL database. Each phase is independently implementable and ends with a verification gate.

## Phase 1: Critical Bugs and Foundation

### Objectives

- Remove release blockers and broken client/backend contracts.
- Make the current COD journey safe to verify.

### Work

- Rotate/remove any real local credentials and add secret scanning/ignore checks.
- Repair store deletion contract: prefer archive/deactivate if open orders/products exist.
- Repair delivery-code handoff: preserve the one-time code in the customer active-order experience without storing it in plaintext on the server.
- Repair rider removal semantics so store unassignment does not unexpectedly delete/demote a multi-store rider.
- Fix default TypeScript CI by including Jest types or using separate tsconfigs.
- Update README to describe live API/COD behavior accurately.
- Add request IDs, structured error logging and configured DB pool limits.
- Add a safe local/test environment checklist.

### Files likely to change

`Quick-Commerce/src/services/adminService.ts`, `backend-go/internal/api/rest/handlers/catalogHandler.go`, `backend-go/internal/services/catalogService.go`, `backend-go/internal/repository/commerceRepository.go`, `Quick-Commerce/tsconfig.json`, `Quick-Commerce/README.md`, `backend-go/internal/api/server.go`, CI config.

### API/database changes

- Add `DELETE`/archive store contract only after deciding retention semantics.
- No destructive migration required if deactivation is selected.

### Dependencies

None; this phase precedes feature expansion.

### Acceptance criteria

- No client service calls an unregistered route.
- Customer can reliably show the delivery code after placement and app navigation while the order is open.
- Removing a rider from one store does not remove unrelated store assignments.
- Default type check is green.
- No secrets are committed or printed.
- DB pool values are explicit and documented.
- README matches actual architecture.

### Tests required

- Admin store archive/delete authorization and open-order cases.
- Frontend service contract test for the route.
- CI secret scan and `npm test`, `tsc`, Go tests when dependencies are available.

### Definition of completion

A clean checkout passes frontend tests/type-check, backend tests in a dependency-enabled environment, and a reviewer can run the app without guessing whether it uses mock data.

### Codex implementation prompt

> Inspect the existing Emblem repository before changing anything, especially `adminService.ts`, catalog handlers/services/repositories, `tsconfig.json`, README, server startup and environment handling. Reproduce the store-delete route mismatch and type-check failure. Choose the smallest safe fix that preserves existing store/product/order behavior; prefer deactivation/archive when hard deletion could violate foreign keys or open orders. Never expose or copy secret values. Add/update tests for authorization, open-order protection, route behavior and TypeScript configuration. Configure DB pooling without introducing a new architecture. Run frontend tests, TypeScript, Go tests/builds that the environment supports, and report exact files changed, commands/results, regressions fixed and anything still blocked. Do not modify production databases.

## Phase 2: Authentication and Onboarding

### Objectives

- Make customer/admin/rider entry flows production-safe and understandable.

### Work

- Verify OTP throttling, resend UX, session expiry and logout-all.
- Add explicit role-aware onboarding copy and first-address flow.
- Improve permission denial/retry behavior for location.
- Add production configuration checks for OTP provider and admin bootstrap.
- Add admin/rider account lifecycle audit and safer admin promotion process.

### Files likely to change

`AuthContext.tsx`, auth screens/services, `AddressContext.tsx`, user/auth services, config/middleware tests.

### API/database changes

Potential auth audit events and admin invitation/role-management fields; avoid schema change unless required.

### Dependencies

Phase 1 release/config hygiene.

### Acceptance criteria

- New customer, returning customer, admin and delivery flows are distinct and recoverable after app restart.
- OTP provider failure gives a clear retry path.
- Expired sessions do not leave users in a privileged navigator.

### Tests required

- Auth refresh race, logout, revoked session, OTP resend/attempt limits, role routing and offline boot.

### Definition of completion

All role entry paths have documented QA cases and no privileged screen is reachable with a stale/invalid session.

### Codex implementation prompt

> Inspect current auth handlers, token/session services, middleware, AuthContext, auth screens and storage before modifying them. Trace both fresh login and app-reopen flows for customer/admin/delivery roles. Preserve the current OTP and refresh behavior unless a test demonstrates a defect. Implement only the onboarding/session improvements required for this phase, update backend and frontend together, add focused tests for expiration, refresh races, logout, role routing and location-denial recovery, and avoid printing secrets. Run relevant tests/type-check/build checks, fix regressions, and report changed files, verification output and remaining limitations.

## Phase 3: Customer Shopping Experience

### Objectives

- Make discovery dynamic, useful and operationally controlled.

### Work

- Replace fixed category allowlist dependence with API-driven active/orderable categories.
- Add backend search with pagination, pincode/store scope and safe limits.
- Add product merchandising fields needed for pilot: SKU/unit, MRP/discount if required, availability.
- Add product/customer empty states for store closure and no stock.
- Add recently viewed only if analytics/value justifies it.

### Files likely to change

`StoreContext.tsx`, `HomeScreen.tsx`, category/search screens/services/types, catalog handlers/services/repositories, product migrations.

### API/database changes

Category active/order fields; product SKU/unit/MRP/availability; indexed search fields/query.

### Dependencies

Phase 1; category admin in Phase 5 is the operational producer.

### Acceptance criteria

- An admin-created active category/product appears without a TypeScript code change.
- Search works with pagination and does not fetch the entire catalog for every query.
- Product price/discount/availability is consistent between home, detail, cart and order snapshot.

### Tests required

- Catalog serviceability, dynamic category rendering, search pagination, unavailable products and price snapshot tests.

### Definition of completion

Customers can discover every active catalog item served to their pincode through a live API contract.

### Codex implementation prompt

> First inspect the current catalog SQL, repositories, DTOs, handlers, StoreContext, home/category/search/product screens and existing fixed category mapping. Identify which existing data must remain compatible. Implement dynamic categories and bounded search with the smallest schema/API change, preserve pincode serviceability and stock semantics, update TypeScript types and Go DTOs together, add migrations safely, and add tests for pagination, inactive categories, out-of-stock and price consistency. Run frontend tests/type-check and backend tests/builds available; fix regressions and report exact changed files and remaining unsupported merchandising features.

## Phase 4: Cart, Checkout and Payments

### Objectives

- Make checkout commercially credible while preserving safe COD.

### Work

- Add configurable minimum order value and fee rules.
- Add coupons/promotions only with server-side validation and order snapshots.
- Decide payment scope: keep COD-only for pilot or add one gateway.
- If adding online payment: payment intent/order, webhook signature verification, idempotent status transitions, failure/retry/refund states.
- Persist checkout recovery state if app dies after an unknown response.

### Files likely to change

Cart/order screens/services, commerce DTOs/services/handlers, payment package, migrations and order state tests.

### API/database changes

Orders/payment attempts/coupons/config tables; extend payment status checks safely.

### Dependencies

Phase 1; payment provider credentials only if online payment is selected.

### Acceptance criteria

- Server remains the source of truth for totals.
- Double taps, retries, webhook repeats and payment failure cannot double-create or falsely complete an order.
- COD remains fully usable if gateway is unavailable.

### Tests required

- Concurrent checkout/idempotency, stock race, coupon abuse, payment webhook replay/failure/refund and order total snapshots.

### Definition of completion

Every checkout outcome is explicit: placed, payment pending, paid, failed, cancelled, refunded or recoverable.

### Codex implementation prompt

> Inspect CartScreen, CartContext, orderService, commerce handlers/services/repositories, order migrations and existing lifecycle tests. Do not assume payment exists. Preserve the current transactional stock decrement and COD path. Implement only the approved pilot payment/config scope, with server-side totals, idempotency and webhook/security tests; update frontend/backend/database together and create safe migrations. Never put gateway secrets in the mobile app. Run all relevant tests/builds, exercise failure and retry paths, fix regressions, and report exactly what changed and what remains intentionally COD-only.

## Phase 5: Admin Panel and Business Management

### Objectives

- Let the operator run the business without direct database edits.

### Work

- Category CRUD/archive/order.
- Dashboard aggregates: orders, revenue, customers, products, riders, pending/completed/cancelled.
- Customer list/detail/order history and block/deactivate.
- Product delete/archive, SKU/MRP/discount/availability as approved.
- Inventory adjustment reasons/history/low-stock thresholds.
- Business settings: fees, minimum order, hours, service pincodes, banners, coupons.
- Improve admin order details and payment display.

### Files likely to change

All `src/screens/admin/*`, `adminService.ts`, `AdminContext.tsx`, catalog/commerce handlers/services/repositories/DTOs, migrations.

### API/database changes

Admin settings, category fields, inventory movements, optional customer status/audit tables, reporting queries.

### Dependencies

Phases 1–4; dynamic catalog from Phase 3.

### Acceptance criteria

- Admin can create/edit/archive categories and products, adjust stock with a reason, view business KPIs and manage customers/riders.
- Every UI action maps to an authenticated backend route.
- Deletion/archive behavior is explicit and safe with foreign keys/open orders.

### Tests required

- Admin RBAC for every route, duplicate/invalid data, archive/open-order behavior, aggregate correctness and inventory movement audit.

### Definition of completion

A trained operator can manage a day of catalog, stock, orders, riders and customer support without SQL.

### Codex implementation prompt

> Audit every existing admin screen/service/context and every registered admin backend route before coding. Build the smallest complete operational admin surface, preserving existing working store/product/inventory/order flows. Add category CRUD, dashboard aggregates, customer management and inventory audit only where the current product requires them; update migrations safely with nullable/archive semantics for existing rows. Add frontend/backend authorization tests and endpoint contract tests. Run tests/type-check/builds, fix route mismatches and regressions, and report exact files, schema changes, acceptance results and remaining business settings.

## Phase 6: Delivery Partner Workflow

### Objectives

- Make delivery usable in the field and operationally visible.

### Work

- Rider online/offline toggle and heartbeat/last seen.
- Assignment notification and explicit reject/cancel reason.
- Add pickup, picked-up and out-for-delivery transitions if operations need them.
- Delivery checklist, offline retry and clear reassignment behavior.
- Admin rider availability and delivery history/statistics.
- Keep rider order isolation enforced server-side.

### Files likely to change

Delivery screens/context/services, order status utilities, delivery handlers/services/repositories, domain/migrations, admin rider screens.

### API/database changes

Availability fields/table, status transition/event changes, optional assignment records and notification jobs.

### Dependencies

Phase 5 rider management; Phase 7 notification/tracking decisions.

### Acceptance criteria

- Only online/eligible assigned riders can accept.
- Rider cannot see or mutate another rider’s order.
- Every transition is server-authorized, auditable and recoverable after cancellation/reassignment.

### Tests required

- RBAC/ownership, two-rider race, busy rider, offline retry, reject/reassign and state-transition matrix.

### Definition of completion

A rider can go online, accept, pick up, navigate, mark out for delivery, verify code and complete delivery with support-visible state.

### Codex implementation prompt

> Inspect the current delivery UI/context/services, order state checks, repository queries and admin assignment flow. Design the minimal field/state additions needed for a safe field workflow; do not broaden access. Implement availability, authorized transitions, reject/reassign handling and UI recovery, updating frontend/backend/migrations together. Add tests proving a rider cannot access or mutate another rider’s order and that concurrent accepts/transitions are safe. Run all relevant checks and report changed files, security guarantees, test output and any intentionally omitted earnings/tracking work.

## Phase 7: Order Lifecycle and Real-Time Tracking

### Objectives

- Give customers and operators trustworthy state visibility.

### Work

- Formalize order state machine and transition table.
- Add notification events for placed/accepted/preparing/out-for-delivery/completed/cancelled/no-rider.
- Add customer status timeline and ETA.
- Add rider location only if operationally needed; start with periodic location updates and map display, not WebSockets.
- Add customer/support cancellation and refund semantics for paid orders.

### Files likely to change

Order lifecycle service/repository/DTOs, order status utilities/screens, notification worker/outbox, optional location module.

### API/database changes

State transition constraints/service, notification/outbox tables, optional rider locations and ETA fields.

### Dependencies

Phases 4 and 6.

### Acceptance criteria

- Invalid transitions are rejected by the backend.
- Customer/admin/rider see role-appropriate status history.
- Notification retries are idempotent and do not block order completion.

### Tests required

- Full transition matrix, cancellation races, notification retry/idempotency, location ownership and stale-location behavior.

### Definition of completion

The expected lifecycle is visible and enforced from placement through delivery or a documented terminal cancellation.

### Codex implementation prompt

> Trace the complete current order lifecycle in handlers, services, repositories, migrations, customer/admin/delivery screens before changing it. Write the allowed transition matrix first, then implement it centrally without weakening existing transaction and ownership checks. Add notifications/outbox and optional tracking only within pilot scope; do not introduce WebSockets or microservices without evidence. Update all clients and migrations, add race/transition/notification tests, run builds and tests, fix regressions, and report the final state machine and known operational limits.

## Phase 8: Backend, Database and Security Improvements

### Objectives

- Harden the pilot for real traffic and operations.

### Work

- Configure DB pool, request IDs, structured logs, metrics and error reporting.
- Add OpenAPI/contract documentation.
- Add SQL query plans/indexes based on realistic data.
- Add inventory movement ledger and order/reporting indexes.
- Standardize validation/error responses and payload limits.
- Add secret scanning and production startup checks.

### Files likely to change

`server.go`, configs, middleware, repositories, migrations, CI/deployment files and API docs.

### API/database changes

Indexes/tables only after EXPLAIN and business need; no destructive migration.

### Dependencies

All prior business features inform the final schema.

### Acceptance criteria

- Production config fails closed for missing secrets/CORS/OTP provider.
- APIs have documented request/response/error contracts.
- Pool and Cloud Run limits are compatible with Cloud SQL limits.
- Logs contain correlation IDs but no tokens, OTPs, request bodies or secrets.

### Tests required

- Config matrix, auth/log redaction, migration idempotency, contract tests, concurrency tests and query benchmarks.

### Definition of completion

The backend is observable, documented and safe to operate at pilot scale without manual forensic SQL.

### Codex implementation prompt

> Inspect the current Go server/config/middleware/repository/migrations/deployment files and existing tests. Measure before optimizing; do not replace the architecture. Implement configuration, observability, validation, documentation and indexes in small safe migrations. Preserve response compatibility or document versioned changes. Add tests for production config rejection, log redaction, migration idempotency, auth/RBAC and concurrent order/inventory behavior. Run Go tests/builds and database integration tests only against a dedicated test DB, never production; report exact verification and limitations.

## Phase 9: UI/UX Polish and Device Compatibility

### Objectives

- Make the mobile product reliable across supported Android/iOS devices.

### Work

- Fix safe-area/keyboard/back behavior from device testing.
- Configure physical-device development URL guidance and release URL checks.
- Add image sizing/cache/transformation strategy.
- Verify Maps, location, image picker, Reanimated and background/resume.
- Add accessibility labels, contrast and touch targets.
- Add responsive QA matrix for small/large Android and iPhone notch/tablet.

### Files likely to change

Expo config, env/config docs, shared components/theme, affected screens and test harness.

### API/database changes

None expected.

### Dependencies

Functional flows from Phases 1–7 must be stable.

### Acceptance criteria

- Release APK and iOS build launch and complete auth/catalog/cart/order flows.
- No overflow or blocked CTA on the device matrix.
- App resumes with correct session/cart/order state after backgrounding.

### Tests required

- Detox/Maestro or equivalent smoke flows, device screenshots, slow/offline network, permission denial and background/resume.

### Definition of completion

Two real devices plus simulator/emulator coverage pass the agreed smoke suite.

### Codex implementation prompt

> Inspect Expo config, env handling, navigation, shared components and all role screens before making visual or native changes. Use the existing design system and preserve behavior. Implement only issues reproduced on the target device matrix; do not infer release readiness from Expo config alone. Add or update smoke tests and accessibility checks, run TypeScript/Jest and native build commands available, fix regressions, and report device/build results separately from static inspection.

## Phase 10: Testing, Deployment and Final Verification

### Objectives

- Prove the product is ready for a controlled pilot.

### Work

- Dedicated PostgreSQL test database with migrations and seed data.
- End-to-end customer/admin/rider order journey.
- Concurrency, auth/RBAC, payment/COD, cancellation, inventory and notification tests.
- Release build, crash/error monitoring, backups/restore drill and rollback procedure.
- Load test realistic pilot traffic, not enterprise-scale traffic.
- Final security/secret/config review.

### Files likely to change

Tests, CI scripts, deployment docs, seed data and monitoring configuration.

### API/database changes

Only defects discovered during verification; no ad-hoc production schema changes.

### Dependencies

All phases.

### Acceptance criteria

- All critical/high findings are closed or explicitly accepted.
- Full order lifecycle passes from customer placement to rider completion.
- Failed payment/stock/no-rider/admin-cancel/customer-cancel paths are verified.
- Release builds use stable URLs and restricted keys.
- Backups and rollback are demonstrated.

### Tests required

- Backend unit/integration, frontend unit/type/build, API contract, E2E, device, security and pilot load checks.

### Definition of completion

Emblem is approved as a controlled 500–1,000-user pilot with an owner, support process, monitoring and rollback plan.

### Codex implementation prompt

> Inspect the completed phases, repository state, deployment configuration and test inventory before acting. Create a verification plan that uses a dedicated test PostgreSQL database and never production data. Execute backend migrations/integration tests, frontend tests/type-check/native builds, API contract tests, role/RBAC tests, concurrent order tests and the full customer-admin-rider journey. Fix only verified regressions; do not rewrite working architecture. Report commands, pass/fail/blocked evidence, remaining risks, release configuration checks and a precise pilot go/no-go recommendation.

## Recommended phase order and gates

`Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10`

The first usable pilot gate is after Phase 1 plus the verified existing COD journey. The proper business-operations gate is after Phase 5–7. The release gate is Phase 10.
