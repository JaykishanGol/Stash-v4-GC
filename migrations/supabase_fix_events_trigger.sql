-- ==============================================
-- FIX: Drop the events_updated_at trigger
-- ==============================================
-- Problem: The BEFORE UPDATE trigger unconditionally sets
--   NEW.updated_at = now()
-- which silently replaces any explicit updated_at value
-- written by the sync engine (e.g., remote_updated_at from Google).
-- This breaks Last-Write-Wins (LWW) conflict resolution because
-- the engine compares local updated_at vs remote updated_at,
-- but the DB always overwrites updated_at with server time.
--
-- The sync engine and Zustand store already manage updated_at
-- explicitly in patchLocalEvent / syncEventToDb, so the trigger
-- is redundant and harmful.
-- ==============================================

DROP TRIGGER IF EXISTS events_updated_at ON public.events;

-- Optionally drop the function too (it's no longer used)
DROP FUNCTION IF EXISTS update_events_updated_at();
