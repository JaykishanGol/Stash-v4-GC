-- ==========================================
-- STASH ENTERPRISE: AUDIT LOGGING SYSTEM (SAFE V3)
-- ==========================================

-- 1. Create the Audit Log Table (If not exists)
CREATE TABLE IF NOT EXISTS public.activity_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action_type text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- 2. The Master Audit Trigger Function (NO JSON MATH)
CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS TRIGGER AS $$
DECLARE
    sys_user_id uuid;
    action text;
    diff jsonb := '{}'::jsonb;
    new_json jsonb;
    old_json jsonb;
BEGIN
    -- Get User ID
    sys_user_id := auth.uid();
    IF sys_user_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN sys_user_id := OLD.user_id; ELSE sys_user_id := NEW.user_id; END IF;
    END IF;

    -- Convert to JSONB for safe key access
    IF TG_OP != 'DELETE' THEN new_json := to_jsonb(NEW); END IF;
    IF TG_OP != 'INSERT' THEN old_json := to_jsonb(OLD); END IF;

    -- Determine Action
    IF TG_OP = 'INSERT' THEN
        action := 'create';
        diff := new_json; -- Log full object
        
    ELSIF TG_OP = 'DELETE' THEN
        action := 'delete';
        diff := jsonb_build_object('title', COALESCE(old_json->>'title', old_json->>'name', 'Unknown'));
        
    ELSIF TG_OP = 'UPDATE' THEN
        action := 'update';

        -- Check Safe Keys for Action Types
        -- We check if key exists using '?' operator before accessing
        
        IF (new_json ? 'is_completed') AND (old_json ? 'is_completed') THEN
            IF (new_json->>'is_completed')::boolean != (old_json->>'is_completed')::boolean THEN
                IF (new_json->>'is_completed')::boolean THEN action := 'complete'; ELSE action := 'uncomplete'; END IF;
            END IF;
        END IF;

        IF (new_json ? 'is_archived') AND (old_json ? 'is_archived') THEN
            IF (new_json->>'is_archived')::boolean != (old_json->>'is_archived')::boolean THEN
                IF (new_json->>'is_archived')::boolean THEN action := 'archive'; ELSE action := 'unarchive'; END IF;
            END IF;
        END IF;
            
        IF (new_json ? 'deleted_at') AND (old_json ? 'deleted_at') THEN
             -- Handle nulls
             IF (new_json->>'deleted_at') IS DISTINCT FROM (old_json->>'deleted_at') THEN
                 IF (new_json->>'deleted_at') IS NOT NULL THEN action := 'trash'; ELSE action := 'restore'; END IF;
             END IF;
        END IF;

        -- FOR DIFF: Instead of complex math, we just log the NEW state for safety.
        -- Or we can calculate specific field changes if we really want, but simpler is better for now.
        diff := new_json;
    END IF;

    -- Insert the Log
    INSERT INTO public.activity_log (user_id, entity_type, entity_id, action_type, details)
    VALUES (
        sys_user_id, 
        TG_TABLE_NAME, 
        COALESCE(NEW.id, OLD.id),
        action,
        diff
    );

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Re-Attach Triggers
DROP TRIGGER IF EXISTS trigger_audit_tasks ON public.tasks;
CREATE TRIGGER trigger_audit_tasks
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS trigger_audit_items ON public.items;
CREATE TRIGGER trigger_audit_items
AFTER INSERT OR UPDATE OR DELETE ON public.items
FOR EACH ROW
EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS trigger_audit_lists ON public.lists;
CREATE TRIGGER trigger_audit_lists
AFTER INSERT OR UPDATE OR DELETE ON public.lists
FOR EACH ROW
EXECUTE FUNCTION public.log_activity();
