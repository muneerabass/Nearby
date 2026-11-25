-- Complete the existing inventory_adjustments audit trail with order linkage.
-- Existing balances and history are preserved; new order reservations and
-- cancellations are recorded in the same append-only table as admin changes.
ALTER TABLE public.inventory_adjustments
    ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_adjustments_order_idx
    ON public.inventory_adjustments(order_id, created_at DESC)
    WHERE order_id IS NOT NULL;
