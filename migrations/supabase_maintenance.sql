-- ==========================================
-- STASH MAINTENANCE: AUTO-PRUNING & HYGIENE
-- ==========================================

-- 1. Create the Cleanup Function
-- This function permanently deletes "soft deleted" items/tasks older than 30 days.
-- It also moves completed tasks older than 90 days to an archive table (optional, simplified here to just cleanup).

CREATE OR REPLACE FUNCTION public.run_maintenance_cleanup()
RETURNS void AS $$
DECLARE
    deleted_items_count integer;
    deleted_tasks_count integer;
BEGIN
    -- 1. Hard Delete Trashed Items (> 30 Days)
    WITH deleted_rows AS (
        DELETE FROM public.items
        WHERE deleted_at < (NOW() - INTERVAL '30 days')
        RETURNING id
    )
    SELECT count(*) INTO deleted_items_count FROM deleted_rows;

    -- 2. Hard Delete Trashed Tasks (> 30 Days)
    WITH deleted_rows AS (
        DELETE FROM public.tasks
        WHERE deleted_at < (NOW() - INTERVAL '30 days')
        RETURNING id
    )
    SELECT count(*) INTO deleted_tasks_count FROM deleted_rows;

    -- Log the maintenance run (if you have the audit log table from previous step)
    -- We insert a system log entry.
    BEGIN
        INSERT INTO public.activity_log (user_id, entity_type, entity_id, action_type, details)
        VALUES (
            '00000000-0000-0000-0000-000000000000', -- System User ID placeholder
            'system',
            '00000000-0000-0000-0000-000000000000',
            'maintenance',
            jsonb_build_object(
                'items_pruned', deleted_items_count,
                'tasks_pruned', deleted_tasks_count
            )
        );
    EXCEPTION WHEN OTHERS THEN
        -- Ignore logging error if table doesn't exist yet
    END;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Schedule the Job (Requires pg_cron extension)
-- If you are on the Supabase Free Tier, pg_cron might not be available.
-- You can alternatively call this function via an Edge Function cron trigger.

-- UNCOMMENT THE LINES BELOW IF YOU HAVE PG_CRON ENABLED:
/*
SELECT cron.schedule(
    'stash-daily-cleanup', -- name of the cron job
    '0 3 * * *',           -- schedule: every day at 3:00 AM (UTC)
    $$SELECT public.run_maintenance_cleanup()$$
);
*/

-- 3. Security: Allow this to be called via API (if using Edge Function instead of pg_cron)
GRANT EXECUTE ON FUNCTION public.run_maintenance_cleanup TO service_role;
