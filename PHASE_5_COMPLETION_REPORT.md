# Emblem Phase 5 Completion Report

## Summary

Phase 5 added backend-enforced admin management capabilities while preserving the existing admin RBAC boundary (`authenticated` + `RequireRole("admin")`). Existing stores, products, inventory writes, rider assignment, order cancellation/reassignment, upload signing, and safe store archive behavior were preserved.

## Implemented

### Dashboard

Added `GET /api/v1/admin/dashboard` with database aggregates for:

- Total, today’s, pending, completed, and cancelled orders.
- Customers, products, and active delivery partners.
- Completed-order revenue.
- Today’s completed COD collections.
- Low-stock product count.

Revenue and COD collections are separate fields and are based on completed orders with `payment_status=paid`.

The mobile dashboard now displays backend metrics instead of deriving business totals from the currently loaded store list.

### Categories

Added:

- `POST /api/v1/admin/categories`
- `PATCH /api/v1/admin/categories/:categoryID`
- `DELETE /api/v1/admin/categories/:categoryID`

Category creation, activation/deactivation, display order, image URL, duplicate-name validation, and safe archive behavior are supported. A category with products cannot be archived; admins must deactivate it instead.

The admin app now loads categories dynamically and provides category creation and activation controls. The previous fixed customer-category allowlist is no longer used by the admin context.

### Products and inventory

- Added product activation state with migration-backed `products.is_active`.
- Customer catalog, product detail, and search now exclude inactive products.
- Product editing supports SKU, MRP, unit, price, images, category, and activation state at the API level.
- Inventory updates are transactionally locked and cannot become negative.
- Added configurable low-stock thresholds.
- Added `inventory_adjustments` migration/table with actor, before, delta, after, reason, and timestamp.
- Added `GET /api/v1/admin/stores/:storeID/inventory/:productID/adjustments`.
- Inventory writes now record an audit adjustment.

### Orders

- Added `POST /api/v1/admin/orders/:orderID/assign`.
- Added optional `customer_id` filtering to the existing admin order endpoint.
- Existing backend state checks for cancellation, reassignment, rider ownership, and inventory restoration remain in force.

### Delivery partners

- Added online/presence fields to the schema and user responses (`is_online`, `last_seen_at`) for future availability controls.
- Existing store-specific assignment and unassignment operations remain separate from full rider deactivation.

### Customers

Added:

- `GET /api/v1/admin/customers`
- `PATCH /api/v1/admin/customers/:customerID/status`

Customer blocking/activation is backend-enforced, paginated, and refuses administrator status changes. A mobile customer-management screen is available from Admin → Settings.

## Database migration

Added:

- `backend-go/internal/migrations/0013_admin_management.sql`

It adds product activation, inventory low-stock thresholds, rider presence fields, inventory adjustment history, and supporting indexes. No production database was modified during this task.

## Modified application areas

- Backend domain models, DTOs, repositories, admin services, admin handlers, and migrations.
- Admin API service client and types.
- Admin dashboard metrics.
- Dynamic category management.
- Product form metadata fields.
- Customer management screen.
- Admin navigation.

## Verification

- Frontend TypeScript: PASS — `npx tsc --noEmit --pretty false`.
- Frontend Jest: PASS — 8 suites, 49 tests.
- Go formatting: PASS — modified Go files are `gofmt` clean.
- Go tests/build: NOT VERIFIED. Dependency downloads were blocked by DNS failure resolving `proxy.golang.org`.
- Database migration execution: NOT VERIFIED. No test PostgreSQL service was available, and no production database was touched.

## Explicitly not implemented

These remain outside the verified Phase 5 implementation because the repository does not yet contain corresponding business models or complete contracts:

- Coupon CRUD and coupon calculation.
- Store operating-hours model.
- Promotional banner model and management.
- Category image-picker UI; the API accepts image URLs and the existing signed-upload system can provide them.
- Full inventory-history screen; the endpoint and audit persistence are implemented.
- Full order-detail/assignment UI; the assignment endpoint is implemented, while the existing order queue continues to support cancellation and reassignment.
- Customer detail/order-history screen; customer list/status and customer-filtered admin orders are available.
- Rider availability mutation endpoint. Presence columns were added, but no online/offline operation was exposed without defining assignment semantics and session/background behavior first.

## Remaining release risks

1. Run Go tests, build, migrations, and integration tests in a network-enabled environment with a disposable PostgreSQL database.
2. Review and test migration 0013 against the deployed schema before release.
3. Add UI flows for inventory history, order assignment, and category image upload before calling the admin panel fully complete.
4. Define business rules for coupons, hours, and banners before adding those schemas or endpoints.
