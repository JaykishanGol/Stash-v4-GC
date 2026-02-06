-- ============================================================================
-- Fix Reminders V2 — Complete Notification Pipeline Repair
-- ============================================================================
-- This migration fixes:
--   1. next_trigger_at never being computed for one-time reminders
--   2. get_due_reminders RPC returning too few columns
--   3. Ghost notifications for deleted items
--   4. 30-day notification TTL cleanup
-- ============================================================================

-- ============================================================================
-- 1. Trigger: Auto-compute next_trigger_at on items
-- ============================================================================
CREATE OR REPLACE FUNCTION public.compute_next_trigger_items()
RETURNS TRIGGER AS $$
BEGIN
    -- If item is deleted or has no scheduled_at, clear trigger
    IF NEW.deleted_at IS NOT NULL OR NEW.scheduled_at IS NULL THEN
        NEW.next_trigger_at := NULL;
    ELSE
        -- next_trigger_at = scheduled_at minus remind_before minutes
        -- If remind_before is NULL or 0, trigger at scheduled_at itself
        NEW.next_trigger_at := NEW.scheduled_at - (COALESCE(NEW.remind_before, 0) * INTERVAL '1 minute');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compute_next_trigger_items ON public.items;
CREATE TRIGGER trg_compute_next_trigger_items
    BEFORE INSERT OR UPDATE OF scheduled_at, remind_before, deleted_at
    ON public.items
    FOR EACH ROW
    EXECUTE FUNCTION public.compute_next_trigger_items();


-- ============================================================================
-- 2. Trigger: Auto-compute next_trigger_at on tasks
-- ============================================================================
CREATE OR REPLACE FUNCTION public.compute_next_trigger_tasks()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.deleted_at IS NOT NULL OR NEW.scheduled_at IS NULL THEN
        NEW.next_trigger_at := NULL;
    ELSE
        NEW.next_trigger_at := NEW.scheduled_at - (COALESCE(NEW.remind_before, 0) * INTERVAL '1 minute');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compute_next_trigger_tasks ON public.tasks;
CREATE TRIGGER trg_compute_next_trigger_tasks
    BEFORE INSERT OR UPDATE OF scheduled_at, remind_before, deleted_at
    ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.compute_next_trigger_tasks();


-- ============================================================================
-- 3. Backfill existing items/tasks that have scheduled_at but no next_trigger_at
-- ============================================================================
UPDATE public.items
SET next_trigger_at = scheduled_at - (COALESCE(remind_before, 0) * INTERVAL '1 minute')
WHERE scheduled_at IS NOT NULL
  AND deleted_at IS NULL
  AND next_trigger_at IS NULL;

UPDATE public.tasks
SET next_trigger_at = scheduled_at - (COALESCE(remind_before, 0) * INTERVAL '1 minute')
WHERE scheduled_at IS NOT NULL
  AND deleted_at IS NULL
  AND next_trigger_at IS NULL;


-- ============================================================================
-- 4. REPLACE get_due_reminders RPC — return all columns the backend needs
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_due_reminders(timestamptz);

CREATE OR REPLACE FUNCTION public.get_due_reminders(check_time timestamptz)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    title text,
    type text,
    scheduled_at timestamptz,
    remind_before integer,
    priority text,
    content jsonb,
    description text,
    next_trigger_at timestamptz,
    last_acknowledged_at timestamptz
) AS $$
BEGIN
    RETURN QUERY

    -- Items
    SELECT
        i.id,
        i.user_id,
        i.title,
        i.type::text,          -- item type: note, link, image, file, folder
        i.scheduled_at,
        i.remind_before,
        i.priority::text,
        i.content,             -- jsonb content for items
        NULL::text AS description,
        i.next_trigger_at,
        i.last_acknowledged_at
    FROM public.items i
    WHERE
        i.deleted_at IS NULL
        AND i.next_trigger_at IS NOT NULL
        AND i.next_trigger_at <= check_time
        AND (
            i.last_acknowledged_at IS NULL
            OR i.last_acknowledged_at < i.next_trigger_at
        )

    UNION ALL

    -- Tasks
    SELECT
        t.id,
        t.user_id,
        t.title,
        'task'::text AS type,  -- always 'task'
        t.scheduled_at,
        t.remind_before,
        t.priority::text,
        NULL::jsonb AS content,
        t.description,
        t.next_trigger_at,
        t.last_acknowledged_at
    FROM public.tasks t
    WHERE
        t.deleted_at IS NULL
        AND t.next_trigger_at IS NOT NULL
        AND t.next_trigger_at <= check_time
        AND (
            t.last_acknowledged_at IS NULL
            OR t.last_acknowledged_at < t.next_trigger_at
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 5. Trigger: Clean up notifications when items/tasks are soft-deleted
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_notifications_on_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- When deleted_at changes from NULL to a value, remove pending notifications
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        DELETE FROM public.notifications
        WHERE data->>'itemId' = NEW.id::text
          AND is_read = false;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cleanup_notifications_items ON public.items;
CREATE TRIGGER trg_cleanup_notifications_items
    AFTER UPDATE OF deleted_at ON public.items
    FOR EACH ROW
    EXECUTE FUNCTION public.cleanup_notifications_on_delete();

DROP TRIGGER IF EXISTS trg_cleanup_notifications_tasks ON public.tasks;
CREATE TRIGGER trg_cleanup_notifications_tasks
    AFTER UPDATE OF deleted_at ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.cleanup_notifications_on_delete();


-- ============================================================================
-- 6. Cleanup: Delete notifications older than 30 days
-- ============================================================================
DELETE FROM public.notifications
WHERE created_at < NOW() - INTERVAL '30 days';


-- ============================================================================
-- 7. Add index for faster notification cleanup queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_notifications_data_item_id
    ON public.notifications ((data->>'itemId'))
    WHERE data->>'itemId' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
    ON public.notifications (created_at);
