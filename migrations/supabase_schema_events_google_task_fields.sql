-- Migration: Add Google Task fields to events table
-- When is_google_task = true, the event row represents a Google Task
-- displayed as a CalendarEvent on the calendar with ○ icon

-- Add new columns
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_google_task boolean DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS google_task_id text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS google_task_list_id text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_completed boolean DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS sort_position text;

-- Index for fast lookup by google_task_id (unique per user)
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_google_task_id
  ON events (user_id, google_task_id)
  WHERE google_task_id IS NOT NULL;

-- Index for filtering Google Tasks
CREATE INDEX IF NOT EXISTS idx_events_is_google_task
  ON events (user_id, is_google_task)
  WHERE is_google_task = true;

-- Index for completed Google Tasks (newest first sorting)
CREATE INDEX IF NOT EXISTS idx_events_google_task_completed
  ON events (user_id, is_completed, completed_at DESC)
  WHERE is_google_task = true;

-- Backfill: existing events are not Google Tasks
UPDATE events SET is_google_task = false WHERE is_google_task IS NULL;
UPDATE events SET is_completed = false WHERE is_completed IS NULL;
