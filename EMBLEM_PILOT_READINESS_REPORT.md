# Emblem Pilot Readiness Report

Date: 2026-11-01

Scope: independent Phase 10 verification of the customer, admin, delivery-partner, Go backend, PostgreSQL, deployment and release surfaces. Earlier phase reports were used as context only; their claims were not treated as proof.

## Overall readiness

**Recommendation: NO-GO for an external pilot at this time.**

The repository contains a credible quick-commerce implementation: the React Native TypeScript checks, Jest suite, Expo configuration, Android JavaScript export, order policy code, role checks, COD lifecycle code and deployment configuration pass static or locally executable checks. However, the complete customer-to-delivery journey was not independently executed against a running backend and disposable PostgreSQL database. The Go test/build toolchain could not download modules, PostgreSQL was unavailable, the production health endpoint could not be reached from this environment, no load test could run, and Android/iOS native/device verification remains unavailable. These are release-gating verification gaps rather than evidence that the corresponding features work in production.

The report also found and fixed one verified deployment defect: `backend-go/deploy/bootstrap.sh` previously created Cloud SQL with backups disabled. New instances created by the script now request a daily backup window and point-in-time recovery. Existing instances still require an operator to verify or enable those settings in Cloud SQL before pilot use.

## Verification status summary

| Area | Status | Evidence / limitation |
|---|---|---|
| Customer UI static checks | PASS | TypeScript check passed; Expo Android JS export bundled 1,572 modules. |
| Customer Jest coverage | PASS | 8 suites and 49 tests passed. |
| Backend compilation | NOT VERIFIED | Go dependencies could not be downloaded because `proxy.golang.org` DNS was unavailable. |
| Backend unit/service tests | NOT VERIFIED | Same dependency blocker; only `internal/dto` resolved with no test files. |
| PostgreSQL migrations/integration | NOT VERIFIED | `TEST_DB_URL` unset; local PostgreSQL had no response; Docker socket unavailable. |
| Full customer-to-delivery journey | NOT VERIFIED | No connected test backend, database, SMS path or device was available. |
| Production API smoke test | NOT VERIFIED | The configured Cloud Run hostname could not be resolved from this environment. |
| Android native release | NOT VERIFIED | Phase 9 attempt was blocked by unavailable Gradle distribution/network. |
| iOS native release | NOT VERIFIED | Phase 9 attempt was blocked by unavailable iOS simulator platform/runtime. |
| Physical devices | NOT VERIFIED | No usable Android device daemon or iOS simulator was available. |
| Load/performance test | NOT RUN | No pilot environment or load tool was available; no capacity claim is made. |
| Secret scan | NOT VERIFIED | `gitleaks` is not installed. Static ignore/config review passed. |
| Backup and recovery drill | NOT VERIFIED | No Cloud SQL access or disposable backup target was available. |

## Full feature verification

### Customer-to-delivery journey

| Journey step | Status | Independent finding |
|---|---|---|
| New customer onboarding and OTP | PARTIAL | Screens, auth service and OTP/rate-limit tests exist. Real SMS and device execution were not verified. |
| Serviceable address selection | PARTIAL | Address/pincode and store-serviceability logic exists with service tests; no live database journey was run. |
| Dynamic catalog/categories | PARTIAL | Backend-driven category/search code and Jest/service coverage exist; no connected API execution was possible. |
| Cart and server-side totals | PARTIAL | Transactional cart/order policy and idempotency tests exist; no PostgreSQL concurrency run was possible. |
| COD order placement | PARTIAL | COD order creation, snapshots, fees and delivery-code generation are implemented in code/tests; no end-to-end placement was executed. |
| Admin receipt and assignment | PARTIAL | Admin order and rider-assignment routes/services exist; no live role-authenticated flow was run. |
| Rider acceptance/pickup/out-for-delivery | PARTIAL | Dedicated delivery routes and state transitions exist; no two-rider or device test was run. |
| Customer polling/status display | PARTIAL | Polling hooks and lifecycle display exist; stale/background behavior was code-reviewed only. |
| Delivery verification/completion | PARTIAL | Hashed delivery-code verification and COD collection transition are implemented and covered by service tests; no live completion was executed. |
| Completed order history | PARTIAL | Order history APIs/screens exist; persistence was not verified against PostgreSQL in this run. |

The backend state machine defines `pending → accepted → picked_up → out_for_delivery → completed` and cancellation paths, with role restrictions. The compatibility `accepted → completed` transition remains in code for older rider clients; this should be removed only after confirming all deployed rider clients use the full workflow.

### Edge-case verification

| Case | Status | Finding |
|---|---|---|
| Insufficient inventory | PARTIAL | Server validation and locking logic are present; PostgreSQL concurrency was not executed. |
| Duplicate order submission | PARTIAL | Idempotency service tests exist; HTTP/database integration was not executed. |
| Customer/admin cancellation | PARTIAL | Cancellation and stock restoration logic are covered by service tests; live race verification was not run. |
| Rider rejection/reassignment | PARTIAL | Routes/services exist and unit coverage is present for reassignment; live multi-rider behavior was not run. |
| No available rider | NOT VERIFIED | No live assignment environment was available. |
| Network loss/app termination | NOT VERIFIED | Code was inspected; no device/network shaping test was available. |
| Unauthorized API access | PARTIAL | RBAC/ownership tests exist in source; backend test execution was blocked. |
| Concurrent same-product orders | NOT VERIFIED | Requires PostgreSQL integration and representative data. |

## Backend and database assessment

The backend remains a Go modular monolith with Fiber, service/repository layers, GORM and PostgreSQL. It has a centralized order state machine, server-side COD pricing, idempotency handling, inventory movement history, role middleware, customer/rider ownership checks, request IDs and structured request logging.

The most important unverified risks are transactional behavior under PostgreSQL contention, migration correctness on a clean database, connection behavior under multiple Cloud Run instances, and the query plan of catalog/order listings. The integration suite is intentionally safe for a dedicated test URL but resets the `public` schema; it must never be pointed at production. In this environment `TEST_DB_URL` was unset, local port 5432 did not respond, and Docker could not be accessed.

No claim is made that migrations, indexes, constraints, rollback, backup restore or concurrent checkout are production-verified.

## Security assessment

### Positive evidence

- Production configuration requires JWT, OTP hash and delivery-code secrets and requires a production CORS allowlist.
- Distribution builds reject loopback, emulator, tunnel and missing API URLs; Maps configuration is required for distribution builds.
- OTPs, access tokens, refresh tokens, passwords and delivery codes were not printed during this audit.
- Delivery codes are hashed in backend persistence and cleared from the order response after successful completion according to the inspected implementation/tests.
- Backend routes use role middleware and ownership checks for customer, admin and rider operations.
- `.env` files are ignored in both app/backend projects and `.env.example` files are the documented templates.

### Outstanding security verification

- `gitleaks` was unavailable, so repository secret scanning was not executed. Run `make secrets-scan` in a tool-enabled CI environment before release.
- Secret values were not inspected or printed. Any credential previously committed or shared outside Secret Manager must be rotated independently.
- Production CORS, SMS provider credentials, Maps restrictions, Cloudinary credentials and Secret Manager versions were not live-verified.
- Unauthorized-route and token-refresh tests could not be executed because Go dependencies were unavailable.

## Release configuration and deployment

Static inspection found a production EAS profile using a stable Cloud Run URL and a backend Cloud Build deployment using Secret Manager references, Cloud SQL attachment, bounded Cloud Run instances and environment-based pool settings. The configured pool defaults are 10 open and 5 idle connections per instance; with a maximum of three Cloud Run instances this is approximately 30 application connections before other clients and administrative headroom.

The configured production API hostname could not be DNS-resolved from this environment, so URL reachability, TLS, `/health`, CORS behavior and actual production configuration are **NOT VERIFIED**.

The bootstrap script correction is syntax-checked and now requests:

```text
--backup-start-time=02:00
--enable-point-in-time-recovery
```

Because the script tolerates an already-existing instance with `|| true`, this change does not retroactively configure an existing Cloud SQL instance. Before pilot approval, an operator must verify backup retention, point-in-time recovery, restore permissions, backup completion and a successful restore drill.

## Test results

### Passed in this environment

- `Quick-Commerce`: `npx tsc --noEmit --pretty false` — PASS.
- `Quick-Commerce`: `npx jest --runInBand --passWithNoTests` — PASS, 8 suites / 49 tests.
- `Quick-Commerce`: `npx expo config --json` — PASS; iOS and Android platforms, portrait orientation.
- `Quick-Commerce`: `npx expo export --platform android --output-dir /tmp/emblem-phase10-export` — PASS; Android bundle generated with 1,572 modules.
- `backend-go/deploy/bootstrap.sh`: `bash -n` — PASS after the backup fix.
- Targeted `git diff --check` for the deployment fix — PASS.

### Blocked or unavailable

- `go test ./...` — BLOCKED before compilation by unavailable `proxy.golang.org` DNS/module downloads.
- `go build ./...` — BLOCKED by the same dependency issue.
- PostgreSQL migration/integration tests — NOT VERIFIED; no dedicated `TEST_DB_URL`, no local PostgreSQL response and no Docker access.
- Android release APK — NOT VERIFIED; Gradle distribution download was unavailable in the Phase 9 native attempt.
- iOS Release build — NOT VERIFIED; the installed iOS simulator platform/runtime was unavailable in the Phase 9 native attempt.
- Android/iOS physical-device testing — NOT VERIFIED; no usable device/simulator was available.
- Maestro/Detox — NOT VERIFIED; neither tool is installed.
- Production health smoke — NOT VERIFIED; DNS resolution failed for the configured Cloud Run hostname.

## Load and performance results

No load test was run. `k6`, `hey`, `wrk` and `artillery` were not available, and no isolated pilot backend/database target was available. Therefore this report makes **no capacity claim** for 500–1,000 users.

Before pilot approval, run an isolated test with representative catalog/order data and record p50/p95/p99 latency, HTTP error rate, database connection utilization, CPU, memory, checkout contention, duplicate-request behavior and inventory invariants. The test must include concurrent orders for the same SKU and at least the configured maximum Cloud Run instance count.

## Critical and high outstanding risks

| ID | Severity | Issue | Required action |
|---|---|---|---|
| QA-001 | Critical | The complete customer-to-delivery journey has not been executed against a real backend/database/device. | Run a dedicated end-to-end pilot rehearsal with seeded test data and all three roles. |
| QA-002 | Critical | PostgreSQL migrations, locking, rollback and inventory consistency are not verified in this environment. | Provision a disposable PostgreSQL database, run migrations/integration tests, concurrency tests and rollback/restore checks. |
| QA-003 | Critical | Native Android release and iOS build/device compatibility are not verified. | Build signed/internal artifacts in CI or a release machine and test the supported device matrix. |
| QA-004 | High | No load test evidence exists. | Run isolated pilot-shaped load/concurrency testing; do not rely on the 500–1,000 target as evidence. |
| QA-005 | High | Production API, SMS, Maps, CORS and Secret Manager configuration were not live-smoke-tested. | Run a credential-safe production smoke checklist and verify provider callbacks/quotas. |
| QA-006 | High | Backup/restore readiness is not verified; existing Cloud SQL instances may still have backups disabled despite the script fix. | Enable/verify backups and PITR on the actual instance, then perform and document a restore drill. |
| QA-007 | Medium | Secret scan was not run because `gitleaks` is absent. | Run the repository scan in CI and rotate any historical exposure. |
| QA-008 | Medium | `Delivery-Partner` has no independently installed dependency/native build environment in this workspace. | Install dependencies and produce/test the dedicated rider artifact before distributing it. |

## Device compatibility assessment

Code review found safe-area, keyboard, image fallback, polling cleanup, touch-target and accessibility improvements in the customer/admin flows. The Android JS bundle is valid. This does not prove native compatibility. Small/large Android screens, notched iPhones, status/navigation bars, backgrounding, offline transitions, actual API timeouts, image failures and rider navigation must still be exercised on physical or CI devices.

## Deployment checklist

Do not mark an item complete from configuration alone:

- [ ] Dedicated production/staging PostgreSQL database selected; no destructive tests against production.
- [ ] All migrations applied and verified on a clean database.
- [ ] PostgreSQL indexes/constraints and concurrent inventory/order tests passed.
- [ ] Cloud SQL automated backups, retention and PITR verified on the actual instance.
- [ ] Restore drill completed and rollback owner/timing recorded.
- [ ] JWT, OTP, delivery-code, SMS, Maps and Cloudinary secrets stored in Secret Manager and rotated from any prior exposure.
- [ ] `ALLOWED_ORIGINS` reviewed against deployed clients/admin surfaces.
- [ ] Production `/health` and authenticated smoke tests passed.
- [ ] SMS provider sends and rate limits verified without logging OTPs.
- [ ] Maps key restrictions verified for Android package/certificate and iOS bundle.
- [ ] Android release artifact installed and tested on representative devices.
- [ ] iOS artifact built/tested where iOS distribution is supported.
- [ ] Customer, admin and rider roles tested independently.
- [ ] Full COD order journey and edge cases passed.
- [ ] Load/concurrency results reviewed against latency/error thresholds.
- [ ] Monitoring, alert ownership and log-redaction checks enabled.
- [ ] Rollback command/image/database procedure rehearsed.

## Rollback plan

1. Stop pilot traffic and record the request ID/order IDs involved; do not delete order or inventory history.
2. Roll Cloud Run back to the last known-good immutable image tag (`SHORT_SHA`), not `latest`.
3. If a migration caused the issue, use its documented forward-fix/rollback procedure only after taking a verified backup; do not reset the production schema.
4. Restore the database only when data corruption is confirmed and the recovery point is approved by the owner; record the recovery point and expected data loss.
5. Re-run health, authentication, catalog, checkout, assignment and COD-completion smoke tests before reopening traffic.
6. Preserve structured logs/request IDs and the incident timeline for reconciliation.

The repository contains deployment image tags and a Cloud SQL attachment, but an actual rollback and restore were not performed in this environment.

## Final go/no-go decision

**NO-GO.** Emblem should not be opened to pilot customers until QA-001 through QA-006 are closed with recorded evidence. The codebase is suitable for the next verification gate and does not require a rewrite, but the missing environment, database, native-build, production-smoke and load evidence means operational readiness cannot honestly be certified.

