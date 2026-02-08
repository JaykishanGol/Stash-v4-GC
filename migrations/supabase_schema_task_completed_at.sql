-- ==============================================
-- Add completed_at to tasks table for Google Tasks parity
-- ==============================================
-- Google Tasks returns a completedDate when a task is completed.
-- This column stores that timestamp for accurate two-way sync.
-- ==============================================

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Backfill: set completed_at for already-completed tasks
UPDATE public.tasks
SET completed_at = updated_at
WHERE is_completed = true AND completed_at IS NULL;
