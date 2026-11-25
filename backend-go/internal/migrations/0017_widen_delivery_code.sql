-- Delivery codes are stored as "hmac:<64 hex chars>" since the hashing change, but
-- 0006 created the column as varchar(6), so every order insert failed on PostgreSQL
-- with "value too long for type character varying(6)". Plaintext legacy codes (6
-- digits) still fit.
ALTER TABLE public.orders ALTER COLUMN delivery_code TYPE text;
