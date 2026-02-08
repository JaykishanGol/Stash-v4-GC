-- ==============================================
-- EMERGENCY CLEANUP: Delete duplicate Google-synced tasks,
-- calendar events, and lists
-- ==============================================
-- The reconcileTimestampDrift bug + upsertLink 401 RLS bug caused
-- hundreds of duplicate tasks/events/lists to be created via Google sync.
-- This migration cleans up ALL duplicates.
-- ==============================================

-- 1) Preview: See how many duplicate TASKS exist (run SELECT first to verify)
-- SELECT title, list_id, count(*) as cnt
-- FROM public.tasks
-- WHERE user_id = '0bfae3dd-8569-4327-bfbf-195d81016db9'
--   AND deleted_at IS NULL
-- GROUP BY title, list_id
-- HAVING count(*) > 1
-- ORDER BY cnt DESC;

-- 2) Delete duplicate TASKS — keep the OLDEST task per (title, list_id, user_id)
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

-- 3) Delete duplicate CALENDAR EVENTS (google tasks shown as events)
-- Keep the OLDEST per (google_task_id, user_id)
WITH ranked_events AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, google_task_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.events
  WHERE user_id = '0bfae3dd-8569-4327-bfbf-195d81016db9'
    AND is_google_task = true
    AND google_task_id IS NOT NULL
    AND deleted_at IS NULL
)
DELETE FROM public.events
WHERE id IN (SELECT id FROM ranked_events WHERE rn > 1);

-- 4) Clean up orphaned google_resource_links for deleted tasks
DELETE FROM public.google_resource_links
WHERE user_id = '0bfae3dd-8569-4327-bfbf-195d81016db9'
  AND resource_type = 'task'
  AND local_type = 'task'
  AND local_id NOT IN (
    SELECT id FROM public.tasks
    WHERE user_id = '0bfae3dd-8569-4327-bfbf-195d81016db9'
  );

-- 6) Clean up orphaned links for deleted calendar_events
DELETE FROM public.google_resource_links
WHERE user_id = '0bfae3dd-8569-4327-bfbf-195d81016db9'
  AND local_type = 'calendar_event'
  AND local_id NOT IN (
    SELECT id FROM public.events
    WHERE user_id = '0bfae3dd-8569-4327-bfbf-195d81016db9'
  );

-- 7) Clean up orphaned links for deleted lists
DELETE FROM public.google_resource_links
WHERE user_id = '0bfae3dd-8569-4327-bfbf-195d81016db9'
  AND local_type = 'list'
  AND local_id NOT IN (
    SELECT id FROM public.lists
    WHERE user_id = '0bfae3dd-8569-4327-bfbf-195d81016db9'
  );

-- 8) Deduplicate google_resource_links (keep newest per entity+type)
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

-- 9) Acknowledge all "Google cloud trial end" tasks so the reminder
--    function stops firing notifications for them
UPDATE public.tasks
SET last_acknowledged_at = now()
WHERE user_id = '0bfae3dd-8569-4327-bfbf-195d81016db9'
  AND lower(title) LIKE '%google cloud trial%';
