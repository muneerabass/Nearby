# Emblem Technical, Functional, Architectural and Product Audit

Audit date: 2026-11-01  
Scope: repository inspection, static tracing, available local tests/config checks. No application source code, production database, or existing data was modified.

## 1. Executive Summary

**Verdict: NOT YET A complete Blinkit/Zepto-class quick-commerce product, but a credible COD quick-commerce MVP foundation.**

The repository contains a React Native/Expo mobile client, a Go/Fiber/GORM API, PostgreSQL migrations, customer/admin/delivery role navigation, OTP authentication, addresses, pincode catalog, one-store cart behavior, COD orders, inventory reservation, order cancellation, rider assignment, delivery-code completion, and automated business-logic tests.

The strongest part is the backend order core. Order creation locks the cart and inventory rows inside a transaction, decrements stock, clears the cart, records an event, accepts an idempotency key, and restores stock on cancellation. Delivery access is scoped by rider assignment and accepted rider identity. These are meaningful foundations for 500–1,000 initial users.

The product is not business-operationally complete. The admin cannot manage categories, there is no dashboard/order/revenue/customer analytics, no payment gateway or payment-failure path exists, no coupon/banner/tax/service configuration exists, customer reorder is only copy, delivery availability/online-offline state is absent, order statuses stop at pending/accepted/completed, live map tracking and notifications are absent, and the admin client calls a store-delete endpoint that the backend does not register.

The client README is materially stale: it describes mock catalog data and checkout as a stub, while current source has live API seams and COD checkout. This documentation mismatch creates release and QA risk.

### Risk summary

| Area | Status | Assessment |
|---|---|---|
| Customer auth/session | PARTIAL | OTP, refresh, persistence and role routing exist; device/production verification not performed. |
| Customer catalog/cart | PASS/PARTIAL | Live pincode catalog and server-priced cart exist; product model lacks MRP/discount/SKU/variant support. |
| Checkout/order | PARTIAL | Real COD order path works by inspection and is well-defended; payment is not implemented. |
| Customer order experience | PARTIAL | History, details, polling and cancellation exist; reorder, notifications and live location do not. |
| Admin operations | PARTIAL/FAIL | Store/product/inventory/rider/order basics exist; category and business operations are missing; store delete is a broken integration. |
| Delivery operations | PARTIAL | Assigned-order isolation, accept, navigation link and delivery-code completion exist; no availability, pickup, status progression or notification workflow. |
| Backend security/RBAC | PASS/PARTIAL | Auth and role middleware are present; secrets in local environment and OTP/rate-limit/device hardening need release controls. |
| Database/order consistency | PASS/PARTIAL | Good transaction design and constraints; schema is COD-only and lacks operational states/configuration. |
| Verification | PARTIAL | Frontend unit tests pass; Go and PostgreSQL tests were blocked by environment. |

## 2. Existing Architecture

### Frontend

- Expo SDK 57 / React Native 0.86 / TypeScript 6.
- Root provider composition in `Quick-Commerce/App.tsx`: auth, addresses, cart, navigation, offline banner.
- Navigation is role-based in `Quick-Commerce/src/navigation/RootNavigator.tsx`: customer, admin, delivery.
- State management is React Context plus local state rather than Redux: `AuthContext`, `AddressContext`, `CartContext`, `StoreContext`, `AdminContext`, `DeliveryContext`.
- API access is centralized in `Quick-Commerce/src/services/apiClient.ts`, with a 15-second timeout, refresh-token retry, connectivity signal, and consistent `ApiError`.
- Client services map to backend routes for auth, catalog, cart, orders, admin, delivery, address and uploads.
- Catalog is served by pincode and filtered against a fixed storefront category list in `StoreContext`/`storefrontCategories.ts`.
- Order tracking is polling-based: customer detail polling is 10 seconds; delivery context polling is 20 seconds; delivery detail polling is 8 seconds.

### Backend

- Go module `quick-commerce`, Go 1.26.5, Fiber, GORM, PostgreSQL, SQLite test dependency, JWT.
- HTTP setup in `backend-go/internal/api/server.go`; route composition starts in `SetupUserRoutes` and mounts catalog, commerce and upload routes.
- Layering is broadly sound: handlers → services → repositories → domain/DTOs.
- Auth uses OTP verification, short-lived access tokens, refresh sessions, JWT parsing and session validation.
- Roles are `customer`, `admin`, `delivery`; middleware is in `backend-go/internal/api/middleware/auth.go`.
- A background order sweeper cancels stale pending orders every minute.
- Production deployment targets Cloud Run + Cloud SQL via `cloudbuild.yaml`; local PostgreSQL is in `infra/docker-compose.yml`.

### Database

- Versioned embedded SQL migrations `0001`–`0010`, recorded in `schema_migrations`.
- Migration runner uses a PostgreSQL advisory lock and transaction per migration.
- Main tables: users, OTPs, sessions, addresses, categories, stores, store pincodes, products, inventory, carts, cart items, orders, order items, delivery-store assignments, order status events.
- Useful indexes exist for user orders, store status, inventory, pincodes, order items, sessions, idempotency and uniqueness.
- Order amounts are integer minor units (paise), which is appropriate for monetary arithmetic.

## 3. Current Application Capabilities

### Verified by code

- OTP send/verify, refresh and logout endpoints.
- Admin promotion based on configured admin phone during OTP verification.
- Customer profile and address CRUD, default address, geocoding endpoint.
- Pincode serviceability and in-stock catalog endpoint.
- Product details and multiple image URLs.
- Cart add/update/delete/clear with one-store constraint.
- Server-side fees and free-delivery threshold.
- COD order placement with idempotency key.
- Customer history/detail/cancel while pending.
- Admin order list, cancel and reassign.
- Delivery rider creation, store assignment, pending list, accept and complete.
- Delivery code generated at order creation, hashed in new records, shown once in the create response, and checked with attempt locking.
- Cloudinary signed image upload endpoint for admin users.
- Frontend loading, empty, offline, stale-refresh and error states in many major screens.

### Not verified in a live end-to-end environment

- Real PostgreSQL migrations against a test database.
- SMS delivery through 2Factor.
- Cloudinary upload.
- Google Maps/geocoding and native map picker on physical devices.
- Cloud Run deployment, Cloud SQL connectivity, release APK, iOS build and push/notification infrastructure.
- Actual cross-role order journey through running mobile builds.

## 4. Customer Application Audit

| Capability | Status | Findings |
|---|---|---|
| OTP login/registration | PASS by inspection | `LoginScreen`, `OtpScreen`, `NameScreen`, `authService`, backend OTP routes. New users can provide a name. |
| Session persistence | PASS by inspection | AsyncStorage stores access/refresh/user; app calls `/users/me` at boot and refreshes on 401. |
| Logout | PASS by inspection | Best-effort backend logout followed by local wipe. |
| Location permission | PARTIAL | Expo location/native map configuration exists, but catalog serviceability is ultimately pincode/address based; no verified physical-device permission flow. |
| Address management | PASS/PARTIAL | CRUD/default/map picker exists. Address validation and geocoder behavior need live verification. |
| Home catalog | PARTIAL | Live pincode catalog, categories and product rails exist. No backend-driven banners, recommendations, recently viewed, or search ranking. |
| Search | PARTIAL | Search is client-side over the loaded catalog; there is no backend search endpoint, pagination, ranking or typo tolerance. |
| Product details | PASS/PARTIAL | Detail screen and image fallback exist; variants, MRP, discount, SKU and availability semantics are absent. |
| Cart | PASS by inspection | Server-backed cart, one-store constraint, quantity guards, stock issues, fees and persisted backend state. |
| Checkout | PARTIAL | Real COD placement exists in `CartScreen.tsx` and `orderService.ts`; no online payment, coupon, tax, minimum-order configuration or payment-failure flow. |
| Stock race handling | PASS by inspection | `OrderService.Create` locks inventory and checks stock in a transaction. |
| Order history/detail | PASS/PARTIAL | Cursor pagination, detail, status events, rider contact and polling exist. |
| Cancellation | PASS/PARTIAL | Customer can cancel pending orders; UI/backend correctly reject late cancellation. No refund/payment reversal is needed because only COD exists. |
| Live tracking | MISSING | Polling status is not GPS/live map tracking. No customer map, ETA or rider location endpoint exists. |
| Reorder | MISSING | Profile copy says “Track and reorder”, but `OrderListScreen` has no reorder action and no reorder service/API. |
| Notifications | MISSING | No push notification token, notification service, or notification UI. |
| Help/support | MISSING | No support ticket/contact/help flow was found. |

### Customer issues

**CUS-001 — Catalog discovery is client-filtered and fixed-category dependent**  
Feature/module: Home/category/search. Current implementation: `StoreContext.tsx` filters API results through `isStorefrontCategory`; `HomeScreen.tsx` builds fixed rails. Problem: valid admin-created categories/products can disappear from the customer app. Why it matters: operations cannot freely expand the catalog. Severity: High. Files/functions: `Quick-Commerce/src/context/StoreContext.tsx:66-70`, `HomeScreen.tsx:buildRails`, `src/data/storefrontCategories.ts`. Recommendation: return category metadata from the backend and render dynamic categories, with an explicit merchandising order. Dependency: category management API (ADM-001).

**CUS-002 — Search is local-only**  
Status: PARTIAL. Search operates on the already-loaded pincode catalog and has no API search/pagination. Severity: Medium. Files: `SearchScreen.tsx`, `StoreContext.tsx`, no backend search handler. Recommendation: add a paginated, pincode/store-aware search endpoint once catalog scale requires it; keep local filtering as a fast first pass.

**CUS-003 — Reorder is advertised but absent**  
Status: MISSING. Severity: Medium. Files: `ProfileScreen.tsx:86`, `OrderListScreen.tsx`, `orderService.ts`. Recommendation: add “Buy again”, availability recheck, cart-store replacement confirmation and a backend-independent client composition from order items.

**CUS-004 — Payment model is COD-only**  
Status: PARTIAL/MISSING for modern quick-commerce checkout. The database explicitly constrains `payment_method = 'cod'`; no payment intent, webhook, capture, failure, retry, refund or reconciliation path exists. Severity: High for product readiness, Medium for an intentionally COD-only pilot. Files: migration `0002_commerce_module.sql:99-101`, `commerceService.go:323-325`, `CartScreen.tsx:329`. Recommendation: first make COD operationally explicit, then add a gateway behind a payment abstraction with webhook idempotency.

**CUS-005 — Delivery code is not retained by the customer client after order creation**  
Status: FAIL. The backend returns the plaintext code in `OrderService.Create`, but subsequent customer GETs intentionally omit it for HMAC-hashed codes. `CartScreen.tsx:129-132` navigates using only the order ID, and `OrderDetailsScreen.tsx` reloads the order, so the displayed delivery code is normally absent immediately after placement and after app reopen. Severity: High because it can block delivery handover. Files: `backend-go/internal/services/commerceService.go:376-379`, `backend-go/internal/services/orderLifecycle.go:472-478`, `Quick-Commerce/src/screens/cart/CartScreen.tsx:129-132`, `Quick-Commerce/src/screens/orders/OrderDetailsScreen.tsx`. Recommendation: persist the one-time plaintext code securely for the active order or pass it as a navigation parameter with a clear lifecycle; never re-store it server-side or log it. Dependency: delivery completion UX (DEL-002).

## 5. Admin Panel Audit

| Capability | Status | Findings |
|---|---|---|
| Dashboard KPIs | FAIL/PARTIAL | Shows product/category/stock counts only; no orders, revenue, customers, pending/completed/cancelled or active riders. |
| Store management | PARTIAL/FAIL | Create/edit/active/pincodes exists; delete UI calls an unregistered backend route. |
| Category management | MISSING | Screen is intentionally read-only and backend only lists categories. |
| Product management | PARTIAL | Create/edit/images/price/category/initial stock; no delete, MRP, discount, SKU, variants, availability flag or audit history. |
| Inventory | PARTIAL | Current stock, low/out-of-stock derived counts and set quantity exist; no adjustment reason/history, alerts or stock ledger. |
| Orders | PARTIAL | List/filter/cancel/reassign exist; no accept/prepare/ready workflow, payment view, customer view or operational SLA metrics. |
| Riders | PARTIAL | Create/list/store assignment/delete/deactivate semantics exist; no availability/status, delivery statistics or actual per-store unassignment in the UI flow. |
| Customers | MISSING | No admin customer list/detail/block/deactivate UI or API. |
| Configuration | MISSING | Delivery/handling fees are environment values; no admin settings, hours, coupons, banners, taxes or service-area console. |

### Admin issues

**ADM-001 — Category CRUD is absent**  
Status: MISSING. `AdminCategoriesScreen.tsx:14-16` explicitly says read-only; backend exposes only `GET /admin/categories`. Severity: High. Recommendation: add authenticated admin create/update/archive/order endpoints and UI; preserve products by setting category nullable or archive rather than hard delete. Dependency: dynamic customer categories (CUS-001).

**ADM-002 — Store delete integration is broken**  
Status: FAIL. `Quick-Commerce/src/services/adminService.ts:63-66` calls `DELETE /admin/stores/:storeId`, but `SetupCatalogRoutes` registers GET/POST/PATCH only for stores and no DELETE handler. Severity: High. Recommendation: either implement a safe deactivate endpoint and change UI wording, or add a guarded delete/archive route with open-order and product/inventory policy. Dependency: data-retention policy.

**ADM-003 — Dashboard is inventory-only**  
Status: PARTIAL. `AdminDashboardScreen.tsx:52-59` shows four inventory/catalog cards. No dashboard API exists. Severity: High. Recommendation: add a bounded aggregate endpoint with counts and revenue from indexed queries; avoid N+1 calls from the client.

**ADM-004 — Admin cannot manage customers**  
Status: MISSING. No customer admin route or screen found. Severity: Medium. Recommendation: add read-only customer list/detail/order history first, then explicit block/deactivate with audit and session revocation.

**ADM-005 — Product model is insufficient for commerce merchandising**  
Status: PARTIAL. `Product` has price/images/category/quantity but no MRP, discount, SKU, unit/size, tax class, availability or variants. Severity: High. Recommendation: add only the fields required by the first catalog, preferably product variants as separate rows if quantities/sizes are needed. Dependency: customer product detail and pricing.

**ADM-006 — Inventory is a mutable balance, not an auditable ledger**  
Status: PARTIAL. `SetInventory` and order decrement are present, but no adjustment reason, actor, source or history. Severity: Medium. Recommendation: keep the balance for fast reads and add an append-only inventory movements table for admin adjustments/order reserve/release.

## 6. Delivery Partner Audit

| Capability | Status | Findings |
|---|---|---|
| Login/session | PASS by inspection | Shared OTP auth with role routing. |
| Online/offline availability | MISSING | No field, endpoint, toggle, heartbeat or availability constraint. |
| Assigned orders | PASS/PARTIAL | Store assignments scope pending orders; rider sees accepted own orders. |
| Accept/reject | PARTIAL | Accept exists; rejection is effectively no action. No explicit reject reason or assignment expiry. |
| Address/navigation | PASS/PARTIAL | Address/coordinates are returned and external map linking exists; no in-app route/ETA. |
| Pickup confirmation | MISSING | No picked-up status or pickup action. |
| Out-for-delivery status | MISSING | Status jumps pending → accepted → completed. |
| Delivery confirmation | PASS | Delivery code and atomic completion check exist. |
| History | PASS | Completed rider orders endpoint and screen exist. |
| Earnings | MISSING | No earnings model or endpoint. |
| Notifications | MISSING | Polling only; no new-assignment push. |
| Unauthorized access | PASS by inspection | `GetForDelivery`, pending query, accept and complete scope by rider/assignment. |

**DEL-001 — No rider availability state**  
Severity: High. Current: accept is the only operational availability signal and rider concurrency is limited to one accepted order. Problem: admin cannot know who is online and pending orders are not assigned/claimed predictably. Files: `DeliveryContext.tsx`, `commerceRepository.go:430-457`, no availability domain field. Recommendation: add `delivery_status`/`is_online`, last_seen, and an explicit availability API; require online riders for acceptance and let admin see stale heartbeats.

**DEL-002 — Lifecycle lacks pickup/out-for-delivery states**  
Severity: High. Current: database check allows pending, accepted, completed, cancelled only. Recommendation: introduce a documented state machine (`pending`, `accepted`, `picked_up`, `out_for_delivery`, `completed`, `cancelled`) only if operations need it; enforce allowed transitions in one service.

**DEL-003 — Delivery completion verification has a pre-check outside the transaction**  
Severity: Medium. `OrderService.Complete` reads and validates the order/code before the transactional `CompleteOrder`. The final status update is atomic, so duplicate completion is not accepted, but concurrent cancellation/completion can produce a generic unavailable error after code work. Recommendation: move code verification and status transition into one transaction/locked row for cleaner semantics and auditability.

**DEL-004 — “Remove rider” is a full delete/demotion, not a store-specific unassignment**  
Severity: Medium. The admin context deliberately rebinds `removeDeliveryAssignment` to `deleteDeliveryUser`, while the screen presents a trash/remove action for riders at the active store. A rider assigned to multiple stores is demoted and removed from all stores. Files: `Quick-Commerce/src/context/AdminContext.tsx:200-212`, `AdminDeliveryUsersScreen.tsx:46-55`, `adminService.ts:93-101`. Recommendation: use the existing store-specific DELETE assignment endpoint for the screen and reserve full rider deactivation for a separate action.

## 7. Complete Order Lifecycle Audit

### Current trace

1. Customer selects a default address and loads the pincode catalog.
2. Product is added to a server cart tied to one store; inventory is checked.
3. Cart is re-priced by backend fees and serviceability.
4. Customer submits COD order with an `Idempotency-Key`.
5. `OrderService.Create` locks the cart, checks active-order rule, locks/checks inventory, decrements stock, creates order/items/event, clears cart, and returns the plaintext delivery code once.
6. Assigned riders see pending orders; `AcceptOrder` enforces store assignment and one active order per rider.
7. Rider can navigate/call and submits delivery code; completion atomically sets completed and paid.
8. Customer polls order detail and sees event history/rider information while accepted.
9. Customer/admin/system cancellation restores inventory inside the same transaction and records an event.

### Lifecycle edge cases

| Scenario | Result | Status |
|---|---|---|
| Payment failure | Impossible in current product: COD only. | NOT APPLICABLE/PARTIAL |
| Insufficient inventory at checkout | Cart issues and transactional recheck reject order; stock cannot go negative through this path. | PASS by inspection |
| No rider available | Order remains pending until sweeper cancels after configured timeout. | PARTIAL; no proactive admin/customer notification |
| Admin cancels pending/accepted | Status and stock restore are transactional; accepted rider is not notified except next poll. | PASS/PARTIAL |
| Customer cancels | Pending only; stock restored. | PASS |
| Rider cancels | No rider cancel action; admin reassign is the supported path. | MISSING |
| Invalid status | Database check plus conditional updates prevent most invalid transitions. | PASS by inspection |
| Two riders accept same order | Conditional update and row count permit one winner. | PASS by inspection |
| Negative stock | Inventory check/row lock and non-negative DB check protect normal order path. | PASS by inspection |
| Duplicate order charge/process | COD has no gateway charge; client/server idempotency key protects retry if the same key is reused. | PASS for COD; not verified under live DB concurrency |
| Stale pending order | Background sweeper cancels and restores stock. | PASS by inspection |

**ORD-001 — No customer/admin operational notification for state changes**  
Severity: High. Status transitions are persisted but only observed by polling. Recommendation: start with in-app refresh plus SMS/push for accepted/cancelled/completed/no-rider outcomes; make notification delivery asynchronous and idempotent.

**ORD-002 — Idempotency depends on client retaining the key across retry**  
Severity: Medium. The client ref retains the key during unknown outcome, which is good, but an app kill loses it and a new checkout can be attempted after cart state is uncertain. Recommendation: persist checkout attempt key with order state or expose a “recover recent pending attempt” endpoint.

## 8. Backend Audit

### Strengths

- Clear handler/service/repository separation.
- Central error mapping and role middleware.
- Session validation on protected routes.
- Pagination for customer/admin orders.
- Rate limits on OTP/cart/order writes.
- Transactional inventory/order/cancellation paths.
- Graceful shutdown and request logging without bodies/auth headers.
- Config validation rejects missing production CORS and dev OTP logging.

### Findings

**BE-001 — Database pool settings are not configured**  
Severity: Medium. `server.go` opens GORM/Postgres but does not configure `sql.DB` max open/idle connections or lifetimes. At 500–1,000 users Cloud Run instances can still exhaust Cloud SQL connections under concurrency. Recommendation: configure pool per instance and align with Cloud Run max instances.

**BE-002 — Input validation is uneven at handler boundary**  
Severity: Medium. Many handlers call `BodyParser` and rely on services; no shared request schema validation, payload field limits or structured validation package exists. Recommendation: validate required fields, string lengths, numeric bounds, URLs/images and unknown business states before service calls.

**BE-003 — No admin categories/config/payment/customer APIs**  
Severity: High. This is a product completeness gap rather than a layering defect. Add bounded APIs before adding frontend controls.

**BE-004 — Search/filter query surface is limited**  
Severity: Medium. Catalog is pincode-only; admin products/orders have basic store/status filtering but no general search or date/revenue aggregates. Recommendation: add indexed query parameters with explicit limits.

**BE-005 — Background sweeper is in-process**  
Severity: Medium. It is acceptable for a small deployment, but each Cloud Run instance runs a sweeper. The SQL locking makes duplicate cancellation safe, yet it is unnecessary work and can be delayed on scale-to-zero. Recommendation: retain for pilot, then move to Cloud Scheduler/Cloud Tasks or a single scheduled worker if SLA matters.

**BE-006 — API contract/docs are absent**  
Severity: Medium. No OpenAPI contract was found. Recommendation: document routes, auth, error codes and state transitions; generate client types or at least add contract tests.

## 9. Database Audit

### Strengths

- Foreign keys and useful delete policies.
- Unique cart per user, unique cart item per product, unique inventory per store/product.
- Case-insensitive uniqueness for categories/stores/products.
- Partial unique indexes for one default address, idempotency and one active admin.
- Order status events and stored financial snapshots.
- Advisory-locked migration runner.

### Findings

**DB-001 — Schema encodes COD-only payment**  
Severity: High. `orders.payment_method` has `CHECK (payment_method = 'cod')`. This is safe for current scope but blocks online payments.

**DB-002 — No customer/order notification, rider availability or inventory movement tables**  
Severity: High/Medium. These are required for the requested product operations, not for the basic COD pilot.

**DB-003 — No category ordering/active flag**  
Severity: Medium. Customer ordering is hardcoded in TypeScript. Add `is_active` and `display_order` when category CRUD is implemented.

**DB-004 — `0010_referral_feature.sql` is less defensive than prior migrations**  
Severity: Low. It uses unqualified `users`, lacks `IF NOT EXISTS` on columns/index, and assumes a clean unapplied version. The migration runner prevents normal reapplication, but consistency should be improved for operational recovery.

**DB-005 — No explicit inventory reservation concept**  
Severity: Low/Medium. Current design decrements at order placement and restores on cancellation, which is valid for a simple COD flow. If payment authorization or picker substitutions are added, a reservation/movement model will be needed.

## 10. Security Audit

**SEC-001 — Local environment contains live-looking secrets**  
Severity: Critical release hygiene. `backend-go/.env` and `Quick-Commerce/.env` exist in the workspace and contain credentials/API keys. Values are intentionally not reproduced in this report. They must never be committed, shared, bundled as server secrets, or reused after exposure; rotate all database, JWT/OTP, SMS, maps and Cloudinary credentials if they are real. Confirm ignore rules and secret scanning in CI.

**SEC-002 — Client Google Maps key is distributable but must be restricted**  
Severity: High. Expo config injects the maps key into native builds. This is expected for mobile SDK keys, but Android package/SHA-1 and iOS bundle restrictions must be enforced.

**SEC-003 — Admin identity is configured by one phone number**  
Severity: High operational risk. OTP verification promotes the configured admin phone. This is acceptable for a single-owner pilot but needs an explicit admin-management process, audit log, and preferably a separate admin auth/control plane before multiple operators.

**SEC-004 — Developer OTP route must be impossible in production**  
Status: mitigated by inspection. Config rejects `DEV_OTP_LOG=true` with `APP_ENV=production`, and the route is only mounted when enabled. Release CI should assert this configuration.

**SEC-005 — CORS wildcard remains development fallback**  
Status: mitigated by inspection. Production requires `ALLOWED_ORIGINS`; CI should test startup with production config.

**SEC-006 — Sensitive order data is role-scoped**  
Status: PASS by inspection. Customer ownership, rider assignment and admin role are checked. Delivery code is omitted from stored-to-client mappings except the one-time create response; new codes are HMAC-hashed.

## 11. Device Compatibility Audit

### Positive findings

- Safe-area provider and inset-aware custom tab bars.
- Keyboard-avoiding forms in auth/admin/address surfaces.
- Expo config declares Android/iOS packages and location permissions.
- Release config rejects missing/development API URL for distribution profiles.
- API timeout, stale-data and offline banners exist.
- `npx expo config --type public` succeeded and resolved both platforms.

### Risks/not verified

**DEV-001 — Default API URL is unusable on a physical device**  
Severity: High for local QA. `src/config/env.ts` defaults to localhost/10.0.2.2, which do not reach a developer laptop from a real phone. `.env.example` documents a LAN override, and release config catches bad distribution URLs, but a physical-device smoke test is still required.

**DEV-002 — No native release build was verified**  
Status: NOT VERIFIED. Expo config is not proof that APK/IPA compilation, Maps SDK keys, permissions, image picker and Reanimated work in release builds. Run EAS/internal builds on Android and iOS devices.

**DEV-003 — TypeScript project configuration excludes Jest globals**  
Severity: Medium. `npx tsc --noEmit` fails because `tsconfig.json` does not include Jest types, while `npx tsc --noEmit --types jest` passes. Fix the configuration or use a separate test tsconfig so CI’s default type check is green.

**DEV-004 — No automated responsive/device matrix**  
Severity: Medium. No Detox/Maestro/device screenshot suite found. Test small Android, large Android, iPhone with notch, keyboard open, background/resume and slow/offline network.

## 12. Performance and Scalability Audit

The current single Go service + PostgreSQL architecture is appropriate for 500–1,000 initial users. Do not split it into microservices yet.

### Realistic bottlenecks

- Customer catalog queries join products, stores, inventory and categories; indexes are mostly present, but no EXPLAIN plan was run against real data.
- Order list mapping performs per-order item/store lookups, creating an N+1 pattern for larger admin pages and order history.
- Order detail maps events and rider data with additional queries, acceptable at pilot volume but worth measuring.
- Client catalog loads the entire pincode catalog and then filters locally; pagination/search becomes important as SKU count grows.
- Remote product images have no documented resizing/CDN transformation strategy.
- In-process sweeper runs on every Cloud Run instance.
- No explicit DB pool sizing.

### Simple recommendations

1. Set PostgreSQL pool limits and Cloud Run max instances together.
2. Add composite/catalog indexes after `EXPLAIN ANALYZE` on realistic seed volume.
3. Batch order items/store names for list endpoints.
4. Add catalog pagination/search only when SKU count makes full catalog expensive.
5. Use Cloudinary transformations/thumbnails and consistent image dimensions.
6. Keep polling for the pilot; add push notifications before adding WebSockets.

## 13. Testing Results

| Check | Result | Evidence/limitation |
|---|---|---|
| Frontend Jest | PASS | 4 suites, 40 tests passed via `npm test -- --runInBand`. |
| Frontend default TypeScript | FAIL | Jest globals not included by `Quick-Commerce/tsconfig.json`; `npx tsc --noEmit --types jest` passed. |
| Expo public config | PASS | `npx expo config --type public` resolved iOS/Android config and plugins. |
| Go tests first attempt | BLOCKED | Go build cache path was not writable. |
| Go tests with `/tmp` caches | BLOCKED | Required modules unavailable and network DNS to proxy.golang.org unavailable. |
| PostgreSQL migrations/integration | NOT VERIFIED | `TEST_DB_URL` was not provided; no test DB was modified. |
| API live smoke tests | NOT VERIFIED | No safe test server/database credentials were used. |
| Native Android/iOS build | NOT VERIFIED | No release build/device execution performed. |
| Lint/format | NOT VERIFIED | No frontend lint script exists; Go formatting was not changed/run as a mutation. |

Existing backend tests cover auth/config, handlers/RBAC, phone/OTP/two-factor, catalog/commerce, address, order lifecycle and Google Maps helpers. Existing frontend tests cover validation, errors, pricing and storefront category mapping, but not rendered screen flows or API contract tests.

## 14. Missing Features

1. Admin category CRUD, active state and ordering.
2. Admin dashboard metrics and order/revenue/customer/rider reporting.
3. Customer management and account blocking.
4. Store delete/deactivate contract repair.
5. Product delete, SKU, MRP, discount, variants and availability.
6. Inventory movement history and adjustment reasons.
7. Coupons/promotions/banners/taxes/minimum order/store hours configuration.
8. Online payment, payment failure/retry/refund/reconciliation.
9. Customer reorder.
10. Push/SMS notifications.
11. Rider online/offline availability and heartbeat.
12. Explicit pickup/out-for-delivery statuses.
13. Rider reject/cancel/reassignment notification workflow.
14. Live rider location/ETA tracking.
15. Rider earnings/delivery statistics.
16. Backend search/pagination for large catalogs.
17. OpenAPI/contract documentation.
18. Release-build and device-matrix verification.

## 15. Broken or Incomplete Features

- `DELETE /admin/stores/:storeID` is called by the client but not registered by the backend.
- Categories UI is intentionally read-only.
- Profile advertises reorder but no action/API exists.
- README says the app is mock-data/checkout-stub, contradicting current live API/COD behavior.
- Default physical-device API setup is not automatic; it requires a LAN/production URL.
- Default TypeScript check is red because Jest types are not configured.
- Admin dashboard does not represent requested business statistics.
- Delivery workflow has no availability, pickup or out-for-delivery state.
- Search is local-only and the customer catalog depends on a fixed TS category allowlist.

## 16. Critical Bugs

1. **SEC-001 secret exposure/release hygiene** — rotate if real, remove from distributable/committed scope, add secret scanning.
2. **ADM-002 broken store-delete API** — either change UI to deactivate or implement the endpoint safely.
3. **DEV-003 red default type check** — repair tsconfig/CI so release quality gates reflect reality.
4. **Release risk: no verified native builds or live DB/API smoke test** — not a code bug, but a go-live blocker.

## 17. UX/UI Improvements

- Replace fixed category copy with dynamic merchandising categories.
- Show an explicit delivery promise/ETA and store open/closed state on home and cart.
- Add customer-facing reasoned order states: preparing, picked up, out for delivery, arriving.
- Add “Buy again” with unavailable-item handling.
- Add proactive status notifications and a support entry point.
- Improve admin with queue counts, revenue/orders/customer metrics and clear store context.
- Add rider availability toggle, assignment notification, pickup checklist and offline-safe action retry.
- Add minimum-order, fee and coupon explanation before checkout.
- Use responsive layout tests for narrow Android devices and larger tablets.

## 18. Recommended Architecture Improvements

Keep the monolith. Improve the existing boundaries:

1. Define an API contract and state-machine document.
2. Add admin/business configuration tables and APIs rather than environment-only business rules.
3. Add category/product merchandising fields and dynamic client rendering.
4. Add payment as a separate payment service interface, not conditional logic spread across handlers.
5. Add inventory movements while retaining the current balance for fast reads.
6. Add rider availability and explicit order transition service methods.
7. Add notification events/outbox only when notifications are introduced; a simple DB-backed worker is enough at this scale.
8. Configure DB pools, structured logs, request IDs, metrics and error reporting.
9. Add contract/integration tests around the real PostgreSQL schema and two concurrent order attempts.
10. Separate frontend test type configuration from production TypeScript compilation.

### Final product conclusion

Emblem is a functional **backend-backed COD quick-commerce MVP core**, not yet a complete quick-commerce business product. It can plausibly support a controlled pilot after fixing the broken admin store-delete contract, release-secret hygiene, type-check gate, live database/API verification and operational gaps around rider/order visibility. It should not be described as Blinkit/Zepto-equivalent until the missing admin operations, payment strategy, notifications, delivery states and customer reorder/support flows are delivered.
