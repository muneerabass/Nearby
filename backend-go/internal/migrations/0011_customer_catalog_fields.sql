-- Customer discovery fields. Existing rows remain visible and active by default.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS mrp integer NOT NULL DEFAULT 0 CHECK (mrp >= 0);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit text;

CREATE INDEX IF NOT EXISTS categories_customer_order_idx
    ON public.categories (is_active, display_order, name);
CREATE INDEX IF NOT EXISTS products_sku_idx ON public.products (sku);
