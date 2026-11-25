-- Delivery workflow states and rider-facing lifecycle timestamps.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('pending', 'accepted', 'picked_up', 'out_for_delivery', 'completed', 'cancelled'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS picked_up_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS out_for_delivery_at timestamptz;
CREATE INDEX IF NOT EXISTS orders_delivery_status_idx ON public.orders(accepted_by, status, updated_at DESC);
