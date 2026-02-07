-- Full two-way Google parity foundation:
-- - task + event sync metadata
-- - per-scope sync cursors
-- - extensible google_resource_links
-- - one-time legacy item(type='event') -> events migration

-- =========================
-- 1) TASK + EVENT COLUMNS
-- =========================

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS sort_position text,
ADD COLUMN IF NOT EXISTS google_etag text,
ADD COLUMN IF NOT EXISTS remote_updated_at timestamptz,
ADD COLUMN IF NOT EXISTS is_unsynced boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON public.tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_remote_updated_at ON public.tasks(remote_updated_at);

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS google_etag text,
ADD COLUMN IF NOT EXISTS remote_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_events_remote_updated_at ON public.events(remote_updated_at);

-- =========================
-- 2) GOOGLE SYNC CURSORS
-- =========================

CREATE TABLE IF NOT EXISTS public.google_sync_cursors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('event', 'task')),
  scope_id text NOT NULL,
  sync_token text,
  last_pulled_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, resource_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_google_sync_cursors_user
  ON public.google_sync_cursors(user_id);

CREATE INDEX IF NOT EXISTS idx_google_sync_cursors_scope
  ON public.google_sync_cursors(resource_type, scope_id);

ALTER TABLE public.google_sync_cursors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own sync cursors" ON public.google_sync_cursors;
CREATE POLICY "Users can view their own sync cursors"
  ON public.google_sync_cursors FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own sync cursors" ON public.google_sync_cursors;
CREATE POLICY "Users can insert their own sync cursors"
  ON public.google_sync_cursors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own sync cursors" ON public.google_sync_cursors;
CREATE POLICY "Users can update their own sync cursors"
  ON public.google_sync_cursors FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own sync cursors" ON public.google_sync_cursors;
CREATE POLICY "Users can delete their own sync cursors"
  ON public.google_sync_cursors FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_google_sync_cursors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS google_sync_cursors_updated_at ON public.google_sync_cursors;
CREATE TRIGGER google_sync_cursors_updated_at
  BEFORE UPDATE ON public.google_sync_cursors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_google_sync_cursors_updated_at();

-- =========================
-- 3) GOOGLE RESOURCE LINKS
-- =========================

-- Ensure the table exists for older installs that skipped previous Google migrations.
CREATE TABLE IF NOT EXISTS public.google_resource_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  local_id uuid NOT NULL,
  local_type text NOT NULL DEFAULT 'item',
  google_id text NOT NULL,
  resource_type text NOT NULL,
  calendar_id text,
  task_list_id text,
  last_synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(local_id, google_id)
);

-- Remove the old hard FK to items so links can reference events/tasks/lists.
ALTER TABLE public.google_resource_links
DROP CONSTRAINT IF EXISTS google_resource_links_local_id_fkey;

ALTER TABLE public.google_resource_links
ADD COLUMN IF NOT EXISTS local_type text,
ADD COLUMN IF NOT EXISTS calendar_id text,
ADD COLUMN IF NOT EXISTS task_list_id text,
ADD COLUMN IF NOT EXISTS last_synced_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS remote_etag text,
ADD COLUMN IF NOT EXISTS remote_updated_at timestamptz,
ADD COLUMN IF NOT EXISTS last_sync_direction text
  CHECK (last_sync_direction IN ('push', 'pull', 'none')),
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
ADD COLUMN IF NOT EXISTS error text;

-- Backfill local_type for databases where the column was missing historically.
UPDATE public.google_resource_links
SET local_type = CASE
  WHEN local_type IS NOT NULL AND local_type <> '' THEN local_type
  WHEN resource_type = 'event' THEN 'calendar_event'
  WHEN resource_type = 'task' THEN 'task'
  ELSE 'item'
END;

ALTER TABLE public.google_resource_links
ALTER COLUMN local_type SET DEFAULT 'item';

-- Ensure ON CONFLICT (local_id, google_id) always has a matching unique index.
-- Older databases may have this table without the original unique constraint.
WITH ranked_links AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY local_id, google_id
      ORDER BY last_synced_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.google_resource_links
)
DELETE FROM public.google_resource_links g
USING ranked_links r
WHERE g.ctid = r.ctid
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_google_resource_links_local_google_unique
  ON public.google_resource_links(local_id, google_id);

CREATE INDEX IF NOT EXISTS idx_google_resource_links_local_type_resource
  ON public.google_resource_links(local_id, local_type, resource_type);

-- Expand local_type values for canonical events + task list mapping.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'google_resource_links'
      AND constraint_name = 'google_resource_links_local_type_check'
  ) THEN
    ALTER TABLE public.google_resource_links
      DROP CONSTRAINT google_resource_links_local_type_check;
  END IF;
END $$;

ALTER TABLE public.google_resource_links
  ADD CONSTRAINT google_resource_links_local_type_check
  CHECK (local_type IN ('item', 'task', 'calendar_event', 'list'));

-- =========================
-- 4) LEGACY ITEM EVENT MIGRATION
-- =========================

CREATE TABLE IF NOT EXISTS public.legacy_event_item_map (
  item_id uuid PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  migrated_at timestamptz NOT NULL DEFAULT now()
);

-- Record deterministic ID mapping (preserve IDs by default).
INSERT INTO public.legacy_event_item_map (item_id, event_id)
SELECT i.id, i.id
FROM public.items i
WHERE i.type = 'event'
ON CONFLICT (item_id) DO NOTHING;

-- Convert legacy event-items into canonical events rows.
INSERT INTO public.events (
  id,
  user_id,
  title,
  description,
  start_at,
  end_at,
  is_all_day,
  rrule,
  parent_event_id,
  recurring_event_id,
  is_deleted_instance,
  location,
  color_id,
  visibility,
  transparency,
  timezone,
  attendees,
  conference_data,
  reminders,
  google_event_id,
  google_calendar_id,
  created_at,
  updated_at,
  deleted_at,
  is_unsynced
)
SELECT
  m.event_id,
  i.user_id,
  COALESCE(i.title, ''),
  COALESCE(i.content->>'description', ''),
  COALESCE(i.scheduled_at, now()),
  COALESCE((i.content->>'end_time')::timestamptz, i.scheduled_at, now() + interval '1 hour'),
  COALESCE((i.content->>'is_all_day')::boolean, false),
  NULLIF(i.content->>'rrule', ''),
  NULL,
  NULL,
  false,
  COALESCE(i.content->>'location', ''),
  COALESCE(i.content->>'color_id', '7'),
  CASE
    WHEN (i.content->>'visibility') IN ('default', 'public', 'private')
      THEN (i.content->>'visibility')
    ELSE 'default'
  END,
  CASE
    WHEN (i.content->>'show_as') = 'free' THEN 'transparent'
    ELSE 'opaque'
  END,
  COALESCE(NULLIF(i.content->>'timezone', ''), 'UTC'),
  COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object('email', v))
      FROM jsonb_array_elements_text(COALESCE(i.content->'attendees', '[]'::jsonb)) AS v
    ),
    '[]'::jsonb
  ),
  CASE
    WHEN NULLIF(i.content->>'meet_link', '') IS NOT NULL
      THEN jsonb_build_object('meetLink', i.content->>'meet_link', 'entryPoints', '[]'::jsonb)
    ELSE NULL
  END,
  COALESCE(i.content->'notifications', '[{"method":"popup","minutes":10}]'::jsonb),
  NULLIF(i.content->>'google_event_id', ''),
  COALESCE(NULLIF(i.content->>'calendar_id', ''), 'primary'),
  COALESCE(i.created_at, now()),
  COALESCE(i.updated_at, now()),
  i.deleted_at,
  true
FROM public.items i
JOIN public.legacy_event_item_map m ON m.item_id = i.id
WHERE i.type = 'event'
ON CONFLICT (id) DO NOTHING;

-- Backfill link metadata from existing events.google_event_id values.
INSERT INTO public.google_resource_links (
  user_id,
  local_id,
  local_type,
  google_id,
  resource_type,
  calendar_id,
  last_synced_at,
  remote_etag,
  remote_updated_at,
  last_sync_direction
)
SELECT
  e.user_id,
  e.id,
  'calendar_event',
  e.google_event_id,
  'event',
  COALESCE(e.google_calendar_id, 'primary'),
  now(),
  e.google_etag,
  e.remote_updated_at,
  'pull'
FROM public.events e
WHERE e.google_event_id IS NOT NULL
ON CONFLICT (local_id, google_id) DO UPDATE
SET
  local_type = EXCLUDED.local_type,
  calendar_id = EXCLUDED.calendar_id,
  remote_etag = COALESCE(EXCLUDED.remote_etag, public.google_resource_links.remote_etag),
  remote_updated_at = COALESCE(EXCLUDED.remote_updated_at, public.google_resource_links.remote_updated_at);

-- Mark legacy event-items archived/deleted so they do not render twice.
UPDATE public.items
SET
  is_archived = true,
  deleted_at = COALESCE(deleted_at, now()),
  updated_at = now()
WHERE type = 'event';
