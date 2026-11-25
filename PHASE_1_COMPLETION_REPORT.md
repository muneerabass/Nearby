# Emblem Phase 1 Completion Report

## Scope

Phase 1 was implemented only. No Phase 2 product features were started. Application source changes were limited to the security/environment foundation, delivery-code availability, store archiving, rider assignment operations, TypeScript configuration, database pooling, tests, and documentation.

## Executive result

Phase 1 implementation is complete at the code level. The frontend checks pass. Go tests and builds could not be completed because the environment could not resolve `proxy.golang.org` to download missing modules. PostgreSQL integration tests were not run because no test database URL was available. No production database was modified.

## Changes made

### Security and environment

- Confirmed `backend-go/.env`, `Quick-Commerce/.env`, and frontend local environment files are ignored by Git.
- Added a repository `.gitleaks.toml` configuration and a `backend-go/Makefile` `secrets-scan` target.
- Added ignore rules for local secret files and secret-like artifacts in `Quick-Commerce/.gitignore`.
- Reviewed environment references without printing secret values. Local environment files contain live-looking credentials/configuration and should be rotated if they were ever committed, shared, or exposed.
- Confirmed mobile configuration uses public client configuration only; backend secrets remain backend environment variables. Public map/API client keys must still be restricted by platform, package/bundle ID, API, and quota controls.
- `gitleaks` was not installed, so an actual secret scan was not executed.

### Delivery verification code

Issue ID: `P1-DELIVERY-CODE`

- `CartScreen` persists the delivery code returned by successful order creation.
- `OrderDetailsScreen` loads the code from client storage when opening or reopening an active order.
- The code remains available after navigation and app restart.
- The code is cleared when an order is completed, cancelled, or customer-cancelled.
- Backend hashing/security was preserved; the backend database does not store plaintext delivery codes.
- Added `deliveryCode.test.ts` covering save/read/clear behavior and preventing empty values from being cached.

Files:

- `Quick-Commerce/src/services/storage.ts`
- `Quick-Commerce/src/screens/cart/CartScreen.tsx`
- `Quick-Commerce/src/screens/orders/OrderDetailsScreen.tsx`
- `Quick-Commerce/src/__tests__/deliveryCode.test.ts`

Remaining risk: the client cache uses the existing AsyncStorage abstraction rather than OS-backed SecureStore. A future hardening phase should move this short-lived sensitive value to Keychain/Keystore-backed storage. Also, if order creation succeeds but the response is lost before the code is cached, a later order fetch cannot recover plaintext from the backend by design.

### Store deletion/archive

Issue ID: `P1-STORE-ARCHIVE`

- Registered `DELETE /api/v1/admin/stores/:storeID`.
- The endpoint performs a safe archive by setting `is_active=false`; it does not physically delete the store.
- Existing products, inventory, orders, and historical relationships are preserved.
- The frontend contract now calls this operation `archiveStore` and the UI uses Archive terminology.
- Existing open-order handling in `UpdateStore` is preserved.
- Added a service-level archive test confirming the row remains present and inactive.

Files:

- `backend-go/internal/api/rest/handlers/catalogHandler.go` — `ArchiveStore`
- `Quick-Commerce/src/services/adminService.ts`
- `Quick-Commerce/src/context/AdminContext.tsx`
- `Quick-Commerce/src/screens/admin/AdminStoreFormScreen.tsx`
- `backend-go/internal/services/commerceService_test.go`

Database migration: none required; the existing store active flag is used.

### Rider removal and assignment isolation

Issue ID: `P1-RIDER-SCOPE`

- Store-specific unassignment remains separate from account deactivation.
- Unassigning a rider now passes the selected store ID and cannot remove assignments from other stores.
- Deactivating a rider remains an account-level operation that revokes the rider and removes all active assignments while preserving historical order data.
- The admin UI exposes separate actions and confirmation text for unassigning from the current store versus deactivating the rider.

Files:

- `Quick-Commerce/src/context/AdminContext.tsx`
- `Quick-Commerce/src/screens/admin/AdminDeliveryUsersScreen.tsx`
- `Quick-Commerce/src/services/adminService.ts`

API behavior: the existing store-scoped unassignment and account-level deactivation endpoints are now correctly mapped to separate UI operations; no migration was required.

### TypeScript configuration

Issue ID: `P1-TS-CONFIG`

- Added Jest types to `Quick-Commerce/tsconfig.json` so the default production type check recognizes Jest globals without changing Jest runtime behavior.

### PostgreSQL connection pooling

Issue ID: `P1-DB-POOL`

- Added environment-based settings:
  - `DB_MAX_OPEN_CONNS` default `10`
  - `DB_MAX_IDLE_CONNS` default `5`
  - `DB_CONN_MAX_LIFETIME` default `30m`
  - `DB_CONN_MAX_IDLE_TIME` default `5m`
- Applied the settings to the underlying `*sql.DB` after GORM initialization.
- Idle connections are capped at the configured open-connection limit.
- Added configuration tests for defaults, overrides, duration parsing, and capping.
- Documented Cloud Run/Cloud SQL sizing in `backend-go/.env.example` and `Quick-Commerce/README.md`. At three instances, the default maximum is approximately 30 application connections, leaving headroom for administrative and migration connections.

Files:

- `backend-go/configs/appConfig.go`
- `backend-go/configs/appConfig_test.go`
- `backend-go/internal/api/server.go`
- `backend-go/.env.example`

### Documentation

`Quick-Commerce/README.md` now documents the actual customer/admin/delivery architecture, Go/PostgreSQL API relationship, local device URL differences, environment setup, pool sizing, verification commands, secret handling, and current product limitations.

## API and database changes

- Added `DELETE /api/v1/admin/stores/:storeID` as a safe archive operation returning the archived store response.
- No new delivery-code API was required; delivery-code persistence remains HMAC-backed on the server and client-cached for the active customer experience.
- Rider endpoint contracts remain separate for store unassignment and account deactivation.
- No database migration was required.
- No production or existing database data was changed.

## Verification results

| Check | Result | Evidence/limitation |
|---|---|---|
| Frontend Jest | PASS | 5 suites, 42 tests |
| TypeScript | PASS | `npx tsc --noEmit` |
| Expo configuration | PASS | `npx expo config --type public` |
| Go tests | NOT VERIFIED | Missing modules could not be downloaded because `proxy.golang.org` DNS resolution failed |
| Go build | NOT VERIFIED | Same dependency/network limitation |
| PostgreSQL integration tests | NOT RUN | No test database URL was supplied; no database was modified |
| Secret scan | NOT RUN | `gitleaks` is not installed in the environment |
| Native Android/iOS release builds | NOT RUN | No native build toolchain/device credentials were available in this audit environment |

The Go commands were attempted with isolated temporary Go cache/module paths. They were not reported as passing.

## Remaining risks

1. Delivery-code client storage should eventually use OS-backed secure storage.
2. A lost order-create response cannot recover a plaintext delivery code from the backend, which is consistent with the no-plaintext-storage requirement; a future design may add a one-time secure recovery mechanism.
3. Go compilation, backend tests, and integration tests require a network-enabled environment with dependencies available.
4. Real-looking credentials in local environment files require rotation if exposure cannot be ruled out.
5. Native release builds and physical-device behavior still need verification outside this environment.

## Phase 1 completion definition

The requested Phase 1 code changes, tests, configuration, and documentation are implemented. The phase is ready for review, with the explicit verification limitations above. Phase 2 has not been implemented.
