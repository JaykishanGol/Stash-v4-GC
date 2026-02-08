-- ==============================================
-- FIX: Link model hardening & dedup cleanup
-- ==============================================
-- Problem: google_resource_links can accumulate stale/orphaned
-- rows when entities change sync targets (event↔task).
-- Also, duplicate rows per (user_id, local_id, resource_type, local_type)
-- can cause confusion.
-- ==============================================

-- 1) Deduplicate: keep latest row per (user_id, local_id, resource_type, local_type)
WITH ranked_links AS (
  SELECT ctid, row_number() OVER (
    PARTITION BY user_id, local_id, resource_type, local_type
    ORDER BY last_synced_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
  ) AS rn
  FROM public.google_resource_links
)
DELETE FROM public.google_resource_links g
USING ranked_links r
WHERE g.ctid = r.ctid AND r.rn > 1;

-- 2) Add a unique index to prevent future duplicate rows
--    per entity per direction. The existing unique on (local_id, google_id)
--    prevents same google_id re-link, but this prevents same local entity
--    getting multiple rows for the same resource_type + local_type.
CREATE UNIQUE INDEX IF NOT EXISTS idx_google_resource_links_entity_type_unique
  ON public.google_resource_links(user_id, local_id, resource_type, local_type);
