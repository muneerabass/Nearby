-- Admin management: product availability, rider presence, and auditable stock changes.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 5;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    before_quantity integer NOT NULL,
    change_quantity integer NOT NULL,
    after_quantity integer NOT NULL,
    reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_adjustments_non_negative CHECK (before_quantity >= 0 AND after_quantity >= 0)
);
CREATE INDEX IF NOT EXISTS inventory_adjustments_product_idx ON public.inventory_adjustments(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS users_delivery_presence_idx ON public.users(role, status, is_online);
