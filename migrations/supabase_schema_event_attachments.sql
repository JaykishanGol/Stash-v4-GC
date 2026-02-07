-- Add attachments column to events table
-- Stores file attachments as JSONB array of {id, name, url, storagePath, type, size}
ALTER TABLE events ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
