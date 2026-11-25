# Emblem Phase 7 Completion Report

## Scope

Phase 7 was implemented using API polling only. No WebSockets, live GPS tracking, background location streaming, or continuous location collection was introduced.

## Order state machine

Added the central backend policy in `backend-go/internal/services/orderStateMachine.go`.

| Transition | Allowed role | Notes |
|---|---|---|
| `pending → accepted` | Delivery partner | Atomic rider acceptance and ownership assignment |
| `accepted → picked_up` | Delivery partner | Current rider only |
| `picked_up → out_for_delivery` | Delivery partner | Current rider only |
| `out_for_delivery → completed` | Delivery partner | Requires delivery-code verification; records COD collection |
| `pending → cancelled` | Customer, admin, system | Customer ownership and cancellation rules remain enforced |
| `accepted → cancelled` | Admin, system | Used for support/sweeper workflows |
| `accepted → pending` | Admin | Reassignment clears the current rider |

The backend keeps an explicit `accepted → completed` compatibility transition for older clients. The current customer, admin, and rider flows use the full pickup and out-for-delivery path. Repository updates continue to use atomic current-state predicates, preventing concurrent requests from applying the same transition twice.

## Customer experience

- Existing order details polling remains at 10 seconds while an order is active.
- The screen shows the lifecycle status, event history, event timestamps, cancellation reason, COD status, rider information, and delivery-code experience.
- Polling stops for completed/cancelled orders, stops when the screen is unfocused or the app is backgrounded, and resumes with an immediate refresh.
- Failed polls retain the last good order and back off to 20 and then 40 seconds.

## Admin experience

- The admin order queue now includes `pending`, `accepted`, `picked_up`, and `out_for_delivery` in the Open filter.
- Each order shows time since placement, time in its current state, assigned rider identifier, and COD collected/pending status.
- Admin polling runs every 20 seconds while the order screen is focused and visible.
- Stale filtering now includes all accepted-but-not-completed lifecycle states.
- Backend status filtering accepts all six lifecycle states.

## Delivery experience

- Existing rider polling remains shared by the separate delivery app and embedded compatibility navigator.
- Active assignments use the backend’s current authorized state and ownership checks.
- Polling is foreground-only, avoids overlapping refresh requests, refreshes immediately after actions and app resume, and backs off after failed refreshes.
- Existing busy guards and server-side state predicates protect accept, pickup, out-for-delivery, and completion actions from duplicate/stale requests.

## API and schema changes

- Added `status_updated_at` to order responses. It is backed by the order’s current `updated_at`, which is updated on lifecycle transitions.
- Added support for admin order filters: `picked_up` and `out_for_delivery`.
- No new database migration was required; Phase 6 migration `0014_delivery_workflow.sql` already added the lifecycle states, timestamps, and index.
- Existing delivery-code and COD payment behavior is preserved: payment changes to paid only on successful completion.

## Files modified

- Backend: central state policy, lifecycle service guards, order repository active/stale filters, order response DTO, admin order handler validation, and state-machine tests.
- React Native: focused polling hook, customer order details, rider order details/context, admin order queue, order status labels, order type, and admin service filter types.

## Verification

- React Native TypeScript: PASS — `npx tsc --noEmit --pretty false`.
- React Native Jest: PASS — 8 suites, 49 tests.
- Expo configuration: PASS — `quick-commerce-app` configuration resolved.
- Go formatting: PASS — modified Go files are `gofmt` clean.
- Diff whitespace check: PASS — `git diff --check` produced no findings for the scoped paths.
- Go tests/build: NOT VERIFIED. Required modules could not be downloaded because `proxy.golang.org` DNS resolution is unavailable. The test command did not reach compilation.
- PostgreSQL integration/state-transition tests: NOT VERIFIED. No disposable database was available and no production database was modified.

## Remaining risks

1. Run `go test ./...` and Go build in a network-enabled environment with dependencies available.
2. Run lifecycle race tests against disposable PostgreSQL, especially cancellation versus acceptance, reassignment versus pickup, and duplicate completion.
3. The compatibility `accepted → completed` transition should be removed after all deployed rider clients use the Phase 6 workflow.
4. `status_updated_at` currently represents the order row update timestamp; if future non-lifecycle edits update the same row, a dedicated state-transition timestamp column may be preferable.

