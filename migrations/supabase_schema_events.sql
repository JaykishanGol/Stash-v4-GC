-- ==========================================
-- EVENTS TABLE: RFC 5545 Series + Exception Pattern
-- Google Calendar Clone Architecture
-- ==========================================

-- The events table stores both "Series Masters" and "Exceptions"
-- A Series Master has an rrule (recurrence rule) and generates virtual instances.
-- An Exception is a modified/deleted instance pointing back to its master.

CREATE TABLE IF NOT EXISTS public.events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Core Data
    title text NOT NULL DEFAULT '',
    description text DEFAULT '',
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    is_all_day boolean DEFAULT false,

    -- Recurrence Engine (RFC 5545)
    -- e.g., "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR"
    -- NULL for single (non-recurring) events
    rrule text,

    -- Exception Logic (The "Google Calendar" magic)
    -- If this row is a modified/deleted instance of a series, it points to the master
    parent_event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,

    -- If this is an exception, WHEN was it originally supposed to happen?
    -- Used to "hide" the original computed instance from the series
    recurring_event_id timestamptz,

    -- If true, this exception represents a DELETION (the instance is cancelled)
    is_deleted_instance boolean DEFAULT false,

    -- Event Details
    location text DEFAULT '',
    color_id text DEFAULT '7',  -- Google Calendar color ID (default: Peacock blue)
    visibility text DEFAULT 'default' CHECK (visibility IN ('default', 'public', 'private')),
    transparency text DEFAULT 'opaque' CHECK (transparency IN ('opaque', 'transparent')),
    timezone text DEFAULT 'UTC',

    -- Rich Data (JSONB)
    attendees jsonb DEFAULT '[]'::jsonb,
    conference_data jsonb DEFAULT null,
    reminders jsonb DEFAULT '[{"method": "popup", "minutes": 10}]'::jsonb,

    -- Google Sync
    google_event_id text,       -- The Google Calendar event ID for 2-way sync
    google_calendar_id text DEFAULT 'primary',

    -- Metadata
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    deleted_at timestamptz DEFAULT null,

    -- Sync
    is_unsynced boolean DEFAULT true
);

-- ==========================================
-- INDEXES for fast range + parent queries
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_events_user ON public.events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_range ON public.events(start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_events_parent ON public.events(parent_event_id);
CREATE INDEX IF NOT EXISTS idx_events_google ON public.events(google_event_id);
CREATE INDEX IF NOT EXISTS idx_events_deleted ON public.events(deleted_at) WHERE deleted_at IS NULL;

-- ==========================================
-- ROW LEVEL SECURITY
-- ==========================================

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own events" ON public.events;
CREATE POLICY "Users can view their own events"
    ON public.events FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own events" ON public.events;
CREATE POLICY "Users can create their own events"
    ON public.events FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own events" ON public.events;
CREATE POLICY "Users can update their own events"
    ON public.events FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own events" ON public.events;
CREATE POLICY "Users can delete their own events"
    ON public.events FOR DELETE
    USING (auth.uid() = user_id);

-- ==========================================
-- AUTO-UPDATE updated_at TRIGGER
-- ==========================================

CREATE OR REPLACE FUNCTION update_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_updated_at ON public.events;
CREATE TRIGGER events_updated_at
    BEFORE UPDATE ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION update_events_updated_at();
