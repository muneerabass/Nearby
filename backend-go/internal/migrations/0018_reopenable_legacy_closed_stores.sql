-- Migration 0016 marked every store that was already inactive as closed by an admin,
-- which stops a vendor from reopening it. Those stores were closed before vendors
-- existed, so nobody chose that restriction: make them reopenable by their vendor.
--
-- Only stores not touched since 0016 ran are affected, so a store an admin closes
-- after the release keeps its admin lock.
UPDATE public.stores
SET closed_by_role = NULL
WHERE is_active = false
  AND closed_by_role = 'admin'
  AND updated_at < (SELECT applied_at FROM public.schema_migrations WHERE version = 16);
