-- Vendor (store owner) role, store ownership, "ready for pickup", and a typed,
-- audience-aware order history so admins and vendors can see what happened.

-- 1. New role. The constraint was created without IF EXISTS semantics in 0002,
--    so drop and re-add it.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
    CHECK (role IN ('customer', 'admin', 'delivery', 'vendor'));

-- 2. One vendor login manages exactly one store (vendor_id is the primary key).
CREATE TABLE IF NOT EXISTS public.vendor_store_assignments (
    vendor_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendor_store_assignments_store_idx
    ON public.vendor_store_assignments (store_id);

-- 3. Store contact number shown to riders and admin.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS contact_phone text;
-- Who closed the store ('admin' or 'vendor'); a vendor may not reopen an
-- admin-closed store.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS closed_by_role text;
UPDATE public.stores SET closed_by_role = 'admin' WHERE is_active = false AND closed_by_role IS NULL;

-- 4. Vendor "ready for pickup" marker. Informational: it never blocks a rider.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ready_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ready_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- 5. Typed history. visibility='staff' entries (rider rejections, admin notes) are
--    hidden from customers.
ALTER TABLE public.order_status_events ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'status_change';
ALTER TABLE public.order_status_events ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'all';
ALTER TABLE public.order_status_events ADD COLUMN IF NOT EXISTS meta jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'order_status_events_visibility_check' AND conrelid = 'public.order_status_events'::regclass
    ) THEN
        ALTER TABLE public.order_status_events ADD CONSTRAINT order_status_events_visibility_check
            CHECK (visibility IN ('all', 'staff'));
    END IF;
END $$;

-- Rider rejections used to be a status="pending" event with a free-text note.
UPDATE public.order_status_events
SET event_type = 'rider_rejected', visibility = 'staff'
WHERE event_type = 'status_change'
  AND actor_role = 'delivery'
  AND note LIKE 'Rider rejected assignment:%';

UPDATE public.order_status_events
SET event_type = 'auto_cancelled'
WHERE event_type = 'status_change'
  AND actor_role = 'system'
  AND status = 'cancelled';

UPDATE public.order_status_events
SET event_type = 'reassigned'
WHERE event_type = 'status_change'
  AND note = 'Reassigned by admin';

CREATE INDEX IF NOT EXISTS order_status_events_created_idx
    ON public.order_status_events (created_at DESC);
CREATE INDEX IF NOT EXISTS order_status_events_rejection_idx
    ON public.order_status_events (order_id, actor_id) WHERE event_type = 'rider_rejected';
