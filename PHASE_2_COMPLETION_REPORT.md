# Emblem Phase 2 Completion Report

## Scope

Phase 2 only was implemented. The existing OTP, refresh-token, role middleware, admin-provisioned delivery-user, and address APIs were inspected and preserved. No unrelated product screens were redesigned and no Phase 3 work was started.

## Existing authentication verified before changes

- Customer login/registration uses phone OTP through `/auth/send-otp` and `/auth/verify-otp`.
- OTPs are hashed server-side, expire, are single-use, have attempt limits, resend limits, daily phone limits, and per-IP limits.
- Access and refresh tokens are persisted on the client.
- Refresh token rotation is protected by a shared in-flight refresh promise, preventing parallel requests from rotating the same refresh token twice.
- The backend validates active sessions on protected requests and applies role middleware to admin and delivery routes.
- Admins create delivery accounts through the admin-only delivery-user endpoint; unknown phone numbers default to customer and cannot self-register as delivery or admin.
- Existing address management and pincode catalog serviceability APIs were reused.

## Implemented changes

### Customer onboarding

Added `CustomerOnboardingScreen` and connected it to the root navigator.

The flow provides:

- A clear Emblem welcome explanation.
- A one-time customer setup step for the first delivery address.
- Optional foreground location permission request.
- Reverse-geocoded pincode/city/state autofill when location is granted.
- Manual pincode entry when permission is denied or unavailable.
- Backend serviceability verification before saving the address.
- Name, phone, address, city, state, and pincode completion.
- Loading, retryable error, denial, offline, and unavailable-area states.
- Keyboard-safe scrolling through the existing `AuthLayout`.
- Default-address creation before entering the shopping application.

Files:

- `Quick-Commerce/src/screens/onboarding/CustomerOnboardingScreen.tsx`
- `Quick-Commerce/src/navigation/RootNavigator.tsx`
- `Quick-Commerce/src/navigation/types.ts`

### Avoiding repeated onboarding

`AuthContext` now tracks `requiresOnboarding`.

- Newly authenticated customers enter onboarding after completing their name.
- Returning customers are checked against `/users/me/addresses` during session restoration.
- Existing customers with an address go directly to the customer application.
- Admins and delivery partners bypass customer onboarding.
- After the first address is successfully created, onboarding is completed in memory and the root navigator switches to the customer application.
- If address lookup fails during an offline boot, the saved session remains usable rather than forcing an impossible onboarding screen.

Files:

- `Quick-Commerce/src/context/AuthContext.tsx`

### Role-based navigation and protection

The existing role split remains enforced:

- `customer` → customer `MainNavigator`.
- `admin` → `AdminNavigator`.
- `delivery` → `DeliveryNavigator`.

The backend remains the authority for authorization through `RequireAuth` and `RequireRole`; client navigation is not treated as a security boundary. Invalid refresh sessions clear local session state and emit the existing unauthorized event. The unauthorized path now also clears the persisted user object, preventing stale role data from remaining after session expiry.

### Delivery partner onboarding

No new self-registration path was introduced. The inspected existing flow remains:

- An authorized admin creates or activates a delivery user.
- The backend assigns the `delivery` role and may assign a store.
- The delivery user signs in through the same OTP flow.
- Existing delivery users retain their provisioned role on login.
- Unknown users default to `customer`; they cannot choose `admin` or `delivery` through OTP registration.

Added backend tests for these role guarantees.

## Tests added

Frontend:

- `Quick-Commerce/src/__tests__/authFlow.test.ts`
  - Parallel expired-session requests share one refresh request.
  - Network failure preserves the session rather than signing out.
  - Rejected refresh clears persisted tokens and emits unauthorized.

Backend:

- `backend-go/internal/services/authService_test.go`
  - Provisioned delivery users retain the delivery role.
  - Unknown users cannot self-register as admin or delivery.
  - The configured admin phone receives the admin role.

Existing tests already cover OTP creation, reuse prevention, expiry, invalid attempts, resend throttling, refresh rotation, logout revocation, and admin route authorization.

## API and database changes

- No new API endpoint was required.
- Existing `/catalog/products?pincode=...` and `/users/me/addresses` APIs are used by onboarding.
- No database migration was required.
- No production or existing database data was modified.

## Verification results

| Check | Result | Details |
|---|---|---|
| TypeScript | PASS | `npx tsc --noEmit` |
| Frontend Jest | PASS | 6 suites, 45 tests |
| Expo configuration | PASS | `npx expo config --type public` |
| Go formatting | PASS | Added backend tests formatted with `gofmt` |
| Go tests | NOT VERIFIED | Missing modules could not be downloaded because `proxy.golang.org` DNS resolution failed |
| Go build | NOT RUN | Same dependency/network limitation prevented backend test/build verification |
| PostgreSQL integration | NOT RUN | No test database URL was provided |
| Device permission tests | NOT RUN | No physical Android/iOS device or simulator was available in this environment |

The Go tests were attempted with isolated temporary Go cache/module paths and were not reported as passing.

## Remaining risks

1. Native Android/iOS behavior for permission denial, reverse geocoding, keyboard layouts, and app background/foreground transitions still requires device verification.
2. Auth tokens continue using the existing storage abstraction; OS-backed secure token storage remains a future hardening item.
3. The configured single admin-phone model is suitable for the current MVP but should eventually become an explicit admin-management workflow.
4. Go auth tests and backend compilation need to be rerun in a network-enabled environment with dependencies available.
5. The current onboarding stores the first address only after serviceability verification; a user outside the service area can still use the app after changing to a supported address, but cannot proceed into the shopping flow until one is saved.

## Completion status

Phase 2 implementation is complete at the code level and frontend verification passed. Backend role tests were added but could not be executed because of the dependency-network limitation. Phase 3 was not implemented.
