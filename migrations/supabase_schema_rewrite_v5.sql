-- ============================================================
-- Phase 1: Schema Migration for Calendar + Sync Rewrite V5
-- 
-- 1. Add source_entity_type + source_entity_id to events table
-- 2. Drop Google columns from tasks table
-- 3. Clean up google_resource_links
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Add source entity columns to events
--    Links a CalendarEvent back to the Item or Task that was scheduled
-- ============================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS source_entity_type TEXT DEFAULT NULL;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS source_entity_id UUID DEFAULT NULL;

-- Index for looking up events by their source entity
CREATE INDEX IF NOT EXISTS idx_events_source
  ON public.events(source_entity_type, source_entity_id)
  WHERE source_entity_type IS NOT NULL;

RAISE NOTICE 'Added source_entity_type and source_entity_id to events table';

-- ============================================================
-- 2. Drop Google columns from tasks table
--    Google Tasks now live ONLY in events table (is_google_task=true)
-- ============================================================

-- Drop any indexes that reference these columns first
DROP INDEX IF EXISTS idx_tasks_google_task_id;

ALTER TABLE public.tasks
  DROP COLUMN IF EXISTS google_task_id;

ALTER TABLE public.tasks
  DROP COLUMN IF EXISTS google_etag;

ALTER TABLE public.tasks
  DROP COLUMN IF EXISTS remote_updated_at;

RAISE NOTICE 'Dropped google_task_id, google_etag, remote_updated_at from tasks table';

-- ============================================================
-- 3. Clean up google_resource_links
--    Remove any stale local_type='task' rows (no longer used for sync)
-- ============================================================

DELETE FROM public.google_resource_links
  WHERE local_type = 'task';

RAISE NOTICE 'Cleaned up stale task links from google_resource_links';

COMMIT;
