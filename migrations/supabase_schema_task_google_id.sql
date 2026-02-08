-- Migration: Add google_task_id to tasks table
-- This provides a stable Google Task identifier for reliable lookup
-- (google_etag changes on every edit and is unreliable as a foreign key)

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS google_task_id TEXT;

-- Index for fast lookup by google_task_id per user
CREATE INDEX IF NOT EXISTS idx_tasks_user_google_task_id
  ON tasks (user_id, google_task_id)
  WHERE google_task_id IS NOT NULL;

-- Backfill: populate google_task_id from google_resource_links where possible
UPDATE tasks t
SET google_task_id = grl.google_id
FROM google_resource_links grl
WHERE grl.local_id = t.id
  AND grl.local_type = 'task'
  AND grl.resource_type = 'task'
  AND t.google_task_id IS NULL;
