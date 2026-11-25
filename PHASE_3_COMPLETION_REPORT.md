# Emblem Phase 3 Completion Report

## Scope

Phase 3 customer shopping experience work is implemented. Customer catalog behavior, backend search, dynamic categories, product metadata compatibility, availability presentation, and Buy Again were changed. Admin CRUD screens were not built or redesigned.

## Existing implementation inspected

- Customer home and category screens were grouping products through `storefrontCategories.ts`, a fixed TypeScript allowlist.
- `StoreContext` downloaded the pincode catalog and filtered out every backend category not present in that allowlist.
- Search filtered the already-downloaded client catalog; there was no backend search endpoint.
- Categories came indirectly from product names rather than a customer-facing backend category contract.
- Public product queries did not consistently exclude inactive categories or inactive stores.
- Orders already returned historical item IDs, quantities, and historical prices, which was sufficient to build a current-availability reorder flow without changing order history.
- The cart correctly enforces one store per cart and already accepts server-side store/address validation.

## Implemented changes

### Dynamic categories

Added backend-owned category fields and customer APIs:

- `image_url`
- `is_active`
- `display_order`
- product count for the selected pincode

Added:

- `GET /api/v1/catalog/categories?pincode=...`

The endpoint returns active categories represented by products at active stores serving the requested pincode. Customer screens now use backend category IDs and ordering. The TypeScript storefront allowlist is no longer used by customer home, categories, or category-product browsing. Existing category cosmetics remain only as fallback icon/tint styling for categories without an image.

Inactive categories are excluded from customer product listing, product search, category results, and product details. Uncategorized legacy products remain directly addressable/catalog-visible for backward compatibility, but they do not appear in a category rail.

Files:

- `backend-go/internal/domain/commerceDomain.go`
- `backend-go/internal/migrations/0011_customer_catalog_fields.sql`
- `backend-go/internal/repository/commerceRepository.go`
- `backend-go/internal/services/catalogService.go`
- `backend-go/internal/api/rest/handlers/catalogHandler.go`
- `backend-go/internal/dto/commerceResponseDto.go`
- `Quick-Commerce/src/context/StoreContext.tsx`
- `Quick-Commerce/src/screens/home/HomeScreen.tsx`
- `Quick-Commerce/src/screens/categories/CategoriesScreen.tsx`
- `Quick-Commerce/src/screens/categories/CategoryProductsScreen.tsx`
- `Quick-Commerce/src/components/CategoryCard.tsx`

### Product information compatibility

Added backend/client support for:

- SKU
- MRP
- Unit/quantity label
- Existing name, description, images, selling price, category, and inventory quantity

The future admin contract can populate these fields through the existing product request/patch DTOs; no admin UI was added in this phase. Inventory quantity remains the availability authority. Products with zero stock can now be returned in the pincode catalog and are displayed with an out-of-stock treatment, while cart/order validation still uses live backend inventory.

Migration:

- `backend-go/internal/migrations/0011_customer_catalog_fields.sql`

### Home and product discovery

- Home category rails are generated from active backend categories and their product IDs.
- Category images are displayed when supplied; fallback icons remain for missing images.
- Out-of-stock products are visible with disabled add controls and a stock overlay.
- Product cards and detail screens show MRP when higher than selling price and show the unit label when supplied.
- Product detail queries require an active store and active category.
- Existing store/pincode-aware catalog behavior is preserved.

### Backend search

Added:

- `GET /api/v1/catalog/search?pincode=...&q=...&limit=...&offset=...`

Search supports:

- Product name matching.
- SKU matching.
- Active-store and pincode-aware results.
- Active-category filtering.
- Limit/offset pagination, capped by the backend.
- Current price, MRP, unit, images, store, category, and quantity in each result.

The React Native search screen now debounces input through the existing debounce hook, requests the backend instead of filtering the full catalog, supports paginated loading, and shows loading, empty, error, and retry states.

Files:

- `backend-go/internal/repository/commerceRepository.go`
- `backend-go/internal/services/catalogService.go`
- `backend-go/internal/api/rest/handlers/catalogHandler.go`
- `Quick-Commerce/src/services/catalogService.ts`
- `Quick-Commerce/src/screens/home/SearchScreen.tsx`
- `Quick-Commerce/src/components/ProductGrid.tsx`

### Buy Again / reorder

Added a Buy Again action to completed and cancelled order details.

The flow:

1. Reads historical order item IDs and quantities.
2. Fetches each product’s current catalog state.
3. Checks current stock and current product data.
4. Caps requested quantity to current stock and the existing cart line limit.
5. Reports missing/out-of-stock items to the customer.
6. Prevents mixing products from different stores.
7. Prompts before replacing an existing cart from another store.
8. Adds available lines using current backend pricing.
9. Explains partial success or complete unavailability.

Files:

- `Quick-Commerce/src/context/CartContext.tsx`
- `Quick-Commerce/src/utils/reorder.ts`
- `Quick-Commerce/src/screens/orders/OrderDetailsScreen.tsx`

No order-history prices or quantities are mutated. No new reorder database table or API was required.

## API contract summary

| Endpoint | Purpose |
|---|---|
| `GET /catalog/categories?pincode=...` | Active customer categories available for a pincode |
| `GET /catalog/search?pincode=...&q=...&limit=...&offset=...` | Paginated pincode-aware product/SKU search |
| `GET /catalog/products?pincode=...` | Existing home catalog, now includes active-category products and out-of-stock quantities |
| `GET /catalog/products/:productID` | Existing detail endpoint, now excludes inactive stores/categories |

## Database changes

Added migration `0011_customer_catalog_fields.sql`.

- Categories: `image_url`, `is_active`, `display_order`.
- Products: `sku`, `mrp`, `unit`.
- Added indexes for category ordering and SKU lookup.

No production database was modified. The migration has not been executed in this environment.

## Testing

Added frontend tests:

- `Quick-Commerce/src/__tests__/catalog.test.ts`
  - Dynamic category response.
  - Search contract, pricing, MRP, unit, stock, and pagination.
- `Quick-Commerce/src/__tests__/reorder.test.ts`
  - Current-stock quantity capping.
  - Missing product reporting.
  - Cross-store reorder protection.

Added backend service coverage:

- `backend-go/internal/services/commerceService_test.go`
  - Active/inactive category filtering.
  - Out-of-stock product visibility.
  - SKU search.
  - Customer category filtering.

Verification results:

| Check | Result | Details |
|---|---|---|
| TypeScript | PASS | `npx tsc --noEmit` |
| React Native Jest | PASS | 8 suites, 49 tests |
| Expo configuration | PASS | `npx expo config --type public` |
| Go formatting | PASS | Changed Go files formatted with `gofmt` |
| Go tests | NOT VERIFIED | Dependency downloads failed because `proxy.golang.org` DNS resolution was unavailable |
| Go build | NOT VERIFIED | Same dependency/network limitation |
| PostgreSQL migration/integration | NOT RUN | No test database was available; no database was changed |
| Physical device UI validation | NOT RUN | No Android/iOS device or simulator was available |

## Remaining risks

1. Backend SQL and Go tests must be rerun in a network-enabled environment before deployment.
2. Migration execution against a staging database is still required.
3. Home still loads the pincode catalog as one response; backend search avoids full-catalog downloads, but a future scale phase could add paginated home rails if catalogs become very large.
4. Category image upload/CRUD remains an admin-phase responsibility; this phase only established the read contract and compatibility fields.
5. Product variants were not introduced because the current catalog model does not require them; SKU/unit fields cover the current product representation.
6. Buy Again performs multiple current-product requests; a future backend reorder endpoint could reduce round trips, but the current approach is suitable for the initial 500–1,000-user target.

## Completion status

Phase 3 customer shopping implementation is complete at the code level. Frontend verification passed. Backend tests and migration execution remain unverified solely because required Go dependencies and a PostgreSQL environment were unavailable. Admin CRUD work was intentionally left for a future phase.
