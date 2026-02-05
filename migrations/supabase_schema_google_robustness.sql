-- Google Sync Tokens & Robustness
-- Add columns to store Google Sync Tokens (for incremental sync)

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS google_calendar_sync_token text,
ADD COLUMN IF NOT EXISTS google_tasks_sync_token text;

-- Add error tracking column to google_resource_links
ALTER TABLE public.google_resource_links
ADD COLUMN IF NOT EXISTS error text,
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;

COMMENT ON COLUMN public.user_settings.google_calendar_sync_token IS 'Token for incremental Google Calendar sync (handles deletions)';
COMMENT ON COLUMN public.user_settings.google_tasks_sync_token IS 'Token for incremental Google Tasks sync';
