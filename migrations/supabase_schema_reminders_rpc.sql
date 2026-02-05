-- Optimize Reminders Query
-- Purpose: Efficiently fetch only items/tasks that need reminders, avoiding full table scans.

CREATE OR REPLACE FUNCTION public.get_due_reminders(check_time timestamptz)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    title text,
    type text, -- 'item' or 'task'
    next_trigger_at timestamptz,
    last_acknowledged_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    -- Select Items
    SELECT 
        i.id,
        i.user_id,
        i.title,
        'item'::text as type,
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
    
    -- Select Tasks
    SELECT 
        t.id,
        t.user_id,
        t.title,
        'task'::text as type,
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
