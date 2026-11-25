# Emblem API conventions

The backend is a versioned Go modular monolith. Application routes are under
`/api/v1`; `/health` is unauthenticated for deployment probes.

## Authentication and authorization

- Protected requests send `Authorization: Bearer <access token>`.
- Access tokens are short-lived JWTs backed by an active server-side session.
- Refresh tokens are rotated by `/api/v1/auth/refresh`.
- Customer, admin, delivery and vendor permissions are enforced in backend
  middleware and service/repository ownership checks. Client-side navigation is
  not a security boundary. The role is read from the database on every request,
  so demoting or blocking a user takes effect immediately.
- A vendor manages exactly one store. `/vendor/*` handlers take the store from
  the vendor's assignment and never from the request, so another store's data
  is reported as `404`, not `403`.

## Request correlation and errors

Every response includes `X-Request-ID`. Clients may send one, or the server
generates a UUID. JSON errors have this shape:

```json
{"error":"human-readable message","code":"stable_machine_code","request_id":"..."}
```

The server logs method, path, status, latency, and request ID as JSON. It does
not log query strings, request bodies, authorization headers, OTPs, tokens,
passwords, delivery codes, or secrets.

## Pagination

- Customer order history uses `limit` plus the `before` RFC3339 cursor.
- Admin and vendor order lists accept `limit` plus `before` and return
  `next_before` when more pages exist; `limit` is capped server-side.
- Catalog search accepts `limit` and `offset`; the server caps the page size.
- Callers must not assume an unbounded collection response is safe for new
  endpoints.

## Inventory audit

`inventory_adjustments` is append-only audit history for admin changes, order
reservations, and cancellation restoration. `order_id` links order-driven
movements without changing existing inventory balances or order snapshots.


## Admin order monitoring

All under `/api/v1/admin` (admin role).

| Endpoint | Purpose |
|---|---|
| `GET /orders` | Order history. Filters: `status` (comma separated), `store_id`, `customer_id`, `rider_id`, `payment_status`, `q` (order id prefix, recipient name or phone), `from`/`to` (RFC3339, on `created_at`), `stale=true`, `before`, `limit`. Rows carry the customer, the rider and `rider_rejections`. |
| `GET /orders/:id` | Full record: items, subtotal, fees, total, payment, customer, rider, delivery-code attempts and the whole timeline including staff-only events. |
| `GET /orders/attention` | Open orders needing a human, each with `reasons`: `pending_too_long`, `no_rider_online`, `rider_rejected`, `stale_in_progress`, `code_locked`. Optional `store_id`. |
| `POST /orders/:id/cancel` | Cancel an open order, including `picked_up` and `out_for_delivery`. A reason is required; stock is restored. |
| `POST /orders/:id/assign` | Give a pending order to a rider. The timeline names the admin as the actor. |
| `POST /orders/:id/reassign` | Return an accepted order to the pending pool; the previous rider is recorded. |
| `POST /orders/:id/reset-delivery-code` | Clear a wrong-code lockout. |
| `GET /dashboard?store_id=` | Counters, optionally for one store; includes in-flight counts and `rider_rejections_today`. |
| `GET /stores/:id/stats` | The same summary the store's vendor sees (see below). |

### Order timeline events

`events[]` entries have `event_type` (`status_change`, `rider_rejected`,
`reassigned`, `admin_assigned`, `vendor_ready`, `delivery_code_locked`,
`delivery_code_reset`, `auto_cancelled`) and `visibility`. `staff` events (rider
rejections, code lockouts) are returned to admins and vendors only; customers and
riders never receive them. `actor_name` and `meta` are filled for staff views.

## Stores and vendors

| Endpoint | Purpose |
|---|---|
| `POST /admin/stores` | Create a store. An optional `vendor: {phone, name}` creates the vendor login in the same transaction; `contact_phone` is optional. |
| `GET /admin/stores` | Each store includes its `vendor` summary. |
| `GET/POST/PUT/DELETE /admin/stores/:id/vendor` | Read, create (409 `vendor_exists` if one exists), replace, or remove the store's vendor. The replaced or removed vendor becomes a customer and is signed out everywhere. |

A vendor signs in with the normal phone OTP flow; the login response carries
`user.store`. A phone that belongs to an admin or rider is refused, as is a
customer with an open order or a vendor already linked to another store.

## Vendor API

All under `/api/v1/vendor` (vendor role, active, linked to a store).

| Endpoint | Purpose |
|---|---|
| `GET /store`, `PATCH /store` | Own store. A vendor may change only `is_active` (open/closed) and `contact_phone`. A store an admin closed cannot be reopened by the vendor (`403 store_closed_by_admin`). |
| `GET /orders`, `GET /orders/:id` | The store's orders (filters as above). The customer's phone, street address and notes are never returned; only the first name and pincode. |
| `POST /orders/:id/ready` | Mark ready for pickup. Informational: it does not block riders. `409` if already ready or past pickup. |
| `POST /orders/:id/reject` | `{reason}` cancels a `pending` or `accepted` order and restores stock. |
| `GET /stats?from&to&tz_offset` | Orders by status, completed revenue, cancellations by actor, average accept/ready/delivery times, rider rejections, top products, daily series, and online riders. Range is limited to 92 days; default is the last 7 days. |
| `GET /riders` | Riders assigned to the store with online status (read-only). |
| `GET /categories`, `GET/POST/PATCH /products`, `GET/PUT /inventory` | Catalog and stock of the vendor's own store only. |
