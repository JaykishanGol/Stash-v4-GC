-- ==============================================
-- EMERGENCY CLEANUP: Delete duplicate Google-synced tasks
-- ==============================================
-- The reconcileTimestampDrift bug + upsertLink 409 bug caused
-- hundreds of duplicate tasks to be created via Google Tasks sync.
-- This migration keeps the OLDEST copy of each task (by title+list)
-- and deletes all newer duplicates.
-- ==============================================

-- 1) Preview: See how many duplicates exist (run SELECT first to verify)
-- SELECT title, list_id, count(*) as cnt
-- FROM public.tasks
-- WHERE user_id = '0bfae3dd-8569-4327-bfbf-195d81016db9'
--   AND deleted_at IS NULL
-- GROUP BY title, list_id
-- HAVING count(*) > 1
-- ORDER BY cnt DESC;

-- 2) Delete duplicates — keep the OLDEST task per (title, list_id, user_id)
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, title, list_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.tasks
  WHERE user_id = '0bfae3dd-8569-4327-bfbf-195d81016db9'
    AND deleted_at IS NULL
)
DELETE FROM public.tasks
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3) Clean up orphaned google_resource_links for deleted tasks
DELETE FROM public.google_resource_links
WHERE user_id = '0bfae3dd-8569-4327-bfbf-195d81016db9'
  AND resource_type = 'task'
  AND local_type = 'task'
  AND local_id NOT IN (
    SELECT id FROM public.tasks
    WHERE user_id = '0bfae3dd-8569-4327-bfbf-195d81016db9'
  );

-- 4) Deduplicate google_resource_links (keep newest per entity+type)
WITH ranked_links AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, local_id, resource_type, local_type
      ORDER BY last_synced_at DESC NULLS LAST, created_at DESC NULLS LAST
    ) AS rn
  FROM public.google_resource_links
  WHERE user_id = '0bfae3dd-8569-4327-bfbf-195d81016db9'
)
DELETE FROM public.google_resource_links
WHERE id IN (SELECT id FROM ranked_links WHERE rn > 1);

-- 5) Acknowledge all "Google cloud trial end" tasks so the reminder
--    function stops firing notifications for them
UPDATE public.tasks
SET last_acknowledged_at = now()
WHERE user_id = '0bfae3dd-8569-4327-bfbf-195d81016db9'
  AND lower(title) LIKE '%google cloud trial%';
