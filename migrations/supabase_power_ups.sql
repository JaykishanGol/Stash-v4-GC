-- ==========================================
-- STASH POWER-UPS: ENTERPRISE DB LOGIC
-- ==========================================

-- Enable Extensions for Advanced Features
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For Fuzzy Search (Like Google)
CREATE EXTENSION IF NOT EXISTS "pg_cron";  -- For Scheduled Jobs (Optional, requires Supabase plan, usually)

-- ==========================================
-- 1. INTELLIGENT SCHEDULER (The Rolling Trigger)
-- ==========================================

-- Function: Calculates next recurring date and "rolls" the task
CREATE OR REPLACE FUNCTION public.handle_recurring_task()
RETURNS TRIGGER AS $$
DECLARE
    next_date timestamptz;
    interval_val interval;
    config jsonb;
BEGIN
    -- Only proceed if task is being marked COMPLETED and is RECURRING
    IF NEW.is_completed = true AND OLD.is_completed = false AND NEW.reminder_type = 'recurring' THEN
        
        config := NEW.recurring_config;
        
        -- Safe check: if config is missing, do nothing (let it close)
        IF config IS NULL THEN
            RETURN NEW;
        END IF;

        -- 1. Determine the Interval (e.g., '1 day', '2 weeks')
        -- We map the JSON 'frequency' + 'interval' to a Postgres INTERVAL type
        CASE config->>'frequency'
            WHEN 'daily' THEN interval_val := (config->>'interval' || ' days')::interval;
            WHEN 'weekly' THEN interval_val := (config->>'interval' || ' weeks')::interval;
            WHEN 'monthly' THEN interval_val := (config->>'interval' || ' months')::interval;
            WHEN 'yearly' THEN interval_val := (config->>'interval' || ' years')::interval;
            ELSE interval_val := '1 day'::interval; -- Default safety
        END CASE;

        -- 2. Calculate Next Date
        -- Logic: Next = (Original Due Date OR Now) + Interval
        -- We use COALESCE(OLD.due_at, NOW()) to ensure we have a base.
        -- Ideally, we roll from the OLD due date to keep the schedule strict (e.g. always 9am).
        next_date := COALESCE(OLD.due_at, NOW()) + interval_val;

        -- If the calculated date is still in the past (e.g. task was due 3 weeks ago),
        -- we should probably roll it to the FUTURE relative to NOW, 
        -- otherwise it will instantly be overdue again.
        IF next_date < NOW() THEN
            next_date := NOW() + interval_val;
        END IF;

        -- 3. UPDATE THE ROW (Mutate the NEW record before it saves)
        NEW.is_completed := false;       -- Uncheck it!
        NEW.due_at := next_date;         -- New Due Date
        NEW.next_trigger_at := next_date; -- Sync trigger
        NEW.last_acknowledged_at := NOW(); -- Mark handled
        
        -- Optional: Increment a 'completion_count' if you had one
        -- NEW.completion_count := OLD.completion_count + 1;

        RAISE NOTICE 'Auto-rolled recurring task % to %', NEW.id, next_date;
        
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Attach to TASKS table
DROP TRIGGER IF EXISTS trigger_auto_roll_task ON public.tasks;
CREATE TRIGGER trigger_auto_roll_task
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.handle_recurring_task();


-- Repeat for ITEMS (if items can be completed/recurring too)
-- (Assuming items table has same columns: is_completed, reminder_type, etc.)
DROP TRIGGER IF EXISTS trigger_auto_roll_item ON public.items;
CREATE TRIGGER trigger_auto_roll_item
BEFORE UPDATE ON public.items
FOR EACH ROW
EXECUTE FUNCTION public.handle_recurring_task();


-- ==========================================
-- 3. ATOMIC LIST STATISTICS (Instant Counts)
-- ==========================================

-- We need a place to store the counts first.
ALTER TABLE public.lists ADD COLUMN IF NOT EXISTS item_count integer DEFAULT 0;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS child_count integer DEFAULT 0;

-- Function: Maintain List Count (TASKS only)
CREATE OR REPLACE FUNCTION public.update_list_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF NEW.list_id IS NOT NULL THEN
            UPDATE public.lists SET item_count = item_count + 1 WHERE id = NEW.list_id;
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        IF OLD.list_id IS NOT NULL THEN
            UPDATE public.lists SET item_count = item_count - 1 WHERE id = OLD.list_id;
        END IF;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF OLD.list_id IS DISTINCT FROM NEW.list_id THEN
            IF OLD.list_id IS NOT NULL THEN
                UPDATE public.lists SET item_count = item_count - 1 WHERE id = OLD.list_id;
            END IF;
            IF NEW.list_id IS NOT NULL THEN
                UPDATE public.lists SET item_count = item_count + 1 WHERE id = NEW.list_id;
            END IF;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Function: Maintain Folder Count (ITEMS only)
CREATE OR REPLACE FUNCTION public.update_folder_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF NEW.folder_id IS NOT NULL THEN
            UPDATE public.items SET child_count = child_count + 1 WHERE id = NEW.folder_id;
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        IF OLD.folder_id IS NOT NULL THEN
            UPDATE public.items SET child_count = child_count - 1 WHERE id = OLD.folder_id;
        END IF;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF OLD.folder_id IS DISTINCT FROM NEW.folder_id THEN
            IF OLD.folder_id IS NOT NULL THEN
                UPDATE public.items SET child_count = child_count - 1 WHERE id = OLD.folder_id;
            END IF;
            IF NEW.folder_id IS NOT NULL THEN
                UPDATE public.items SET child_count = child_count + 1 WHERE id = NEW.folder_id;
            END IF;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Triggers for Counts
DROP TRIGGER IF EXISTS trigger_count_tasks ON public.tasks;
CREATE TRIGGER trigger_count_tasks
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_list_counts();

DROP TRIGGER IF EXISTS trigger_count_items ON public.items;
CREATE TRIGGER trigger_count_items
AFTER INSERT OR UPDATE OR DELETE ON public.items
FOR EACH ROW
EXECUTE FUNCTION public.update_folder_counts();


-- ==========================================
-- 4. SEARCH INDEXING (Full Text Search)
-- ==========================================

-- 1. Create a Generated Column that combines Title + Description/Content
-- This auto-updates whenever data changes.

ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS fts tsvector
GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') || 
    setweight(to_tsvector('english', coalesce(content->>'text', '')), 'B')
) STORED;

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS fts tsvector
GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') || 
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
) STORED;

-- 2. Create GIN Indexes for Lightning Fast Search
CREATE INDEX IF NOT EXISTS items_fts_idx ON public.items USING GIN (fts);
CREATE INDEX IF NOT EXISTS tasks_fts_idx ON public.tasks USING GIN (fts);

-- 3. (Optional) Trigram Index for "Fuzzy" search (e.g. "appl" finds "apple")
-- Requires pg_trgm extension enabled above
CREATE INDEX IF NOT EXISTS items_title_trgm_idx ON public.items USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tasks_title_trgm_idx ON public.tasks USING GIN (title gin_trgm_ops);

