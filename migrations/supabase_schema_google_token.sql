-- Google Token Refresh Migration
-- Run this in your Supabase SQL Editor to add the google_refresh_token column

-- Add google_refresh_token column to user_settings table
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;

-- Add comment
COMMENT ON COLUMN user_settings.google_refresh_token IS 'Encrypted Google OAuth refresh token for persistent calendar/tasks sync';
