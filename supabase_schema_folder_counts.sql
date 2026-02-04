-- ==========================================
-- STASH: FOLDER COUNTS + SYNC QUEUE IMPROVEMENTS
-- ==========================================

-- 1. Add child_count column to items table for folder count persistence
-- This allows faster loading without recalculating counts client-side
ALTER TABLE public.items 
ADD COLUMN IF NOT EXISTS child_count integer DEFAULT 0;

-- 2. Create function to automatically update folder counts
CREATE OR REPLACE FUNCTION public.update_folder_child_count()
RETURNS TRIGGER AS $$
DECLARE
    old_folder_id uuid;
    new_folder_id uuid;
BEGIN
    -- Get the relevant folder IDs
    IF TG_OP = 'DELETE' THEN
        old_folder_id := OLD.folder_id;
    ELSIF TG_OP = 'INSERT' THEN
        new_folder_id := NEW.folder_id;
    ELSIF TG_OP = 'UPDATE' THEN
        old_folder_id := OLD.folder_id;
        new_folder_id := NEW.folder_id;
    END IF;
    
    -- Update old folder count (if item was moved out or deleted)
    IF old_folder_id IS NOT NULL THEN
        UPDATE public.items 
        SET child_count = (
            SELECT COUNT(*) 
            FROM public.items 
            WHERE folder_id = old_folder_id 
            AND deleted_at IS NULL
        ),
        updated_at = NOW()
        WHERE id = old_folder_id;
    END IF;
    
    -- Update new folder count (if item was moved in or inserted)
    IF new_folder_id IS NOT NULL AND (old_folder_id IS NULL OR old_folder_id != new_folder_id) THEN
        UPDATE public.items 
        SET child_count = (
            SELECT COUNT(*) 
            FROM public.items 
            WHERE folder_id = new_folder_id 
            AND deleted_at IS NULL
        ),
        updated_at = NOW()
        WHERE id = new_folder_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create trigger for automatic folder count updates
DROP TRIGGER IF EXISTS trigger_update_folder_count ON public.items;
CREATE TRIGGER trigger_update_folder_count
AFTER INSERT OR UPDATE OF folder_id, deleted_at OR DELETE ON public.items
FOR EACH ROW
EXECUTE FUNCTION public.update_folder_child_count();

-- 4. Initialize existing folder counts
UPDATE public.items parent
SET child_count = (
    SELECT COUNT(*) 
    FROM public.items child 
    WHERE child.folder_id = parent.id 
    AND child.deleted_at IS NULL
)
WHERE parent.type = 'folder';

-- 5. Add index for faster folder lookups
CREATE INDEX IF NOT EXISTS idx_items_folder_id ON public.items(folder_id) WHERE deleted_at IS NULL;

-- 6. Create sync_queue table for server-side queue backup (optional)
-- This can be used to recover from client-side queue loss
CREATE TABLE IF NOT EXISTS public.sync_queue_backup (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    operation_type text NOT NULL,
    entity_id uuid NOT NULL,
    payload jsonb,
    created_at timestamptz DEFAULT now(),
    processed_at timestamptz,
    error_message text
);

-- Enable RLS on sync_queue_backup
ALTER TABLE public.sync_queue_backup ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own queue items
CREATE POLICY "Users can manage their own sync queue" ON public.sync_queue_backup
    FOR ALL USING (auth.uid() = user_id);

-- 7. Add rate limiting tracking table
CREATE TABLE IF NOT EXISTS public.rate_limits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier text NOT NULL,
    endpoint text NOT NULL,
    request_count integer DEFAULT 1,
    window_start timestamptz DEFAULT now(),
    UNIQUE(identifier, endpoint)
);

-- Create index for rate limit lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON public.rate_limits(identifier, endpoint, window_start);

-- Function to check and update rate limits
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_identifier text,
    p_endpoint text,
    p_max_requests integer DEFAULT 10,
    p_window_seconds integer DEFAULT 60
)
RETURNS boolean AS $$
DECLARE
    v_current_count integer;
    v_window_start timestamptz;
BEGIN
    -- Get current rate limit record
    SELECT request_count, window_start INTO v_current_count, v_window_start
    FROM public.rate_limits
    WHERE identifier = p_identifier AND endpoint = p_endpoint;
    
    -- If no record or window expired, create/reset
    IF v_window_start IS NULL OR v_window_start < NOW() - (p_window_seconds || ' seconds')::interval THEN
        INSERT INTO public.rate_limits (identifier, endpoint, request_count, window_start)
        VALUES (p_identifier, p_endpoint, 1, NOW())
        ON CONFLICT (identifier, endpoint) 
        DO UPDATE SET request_count = 1, window_start = NOW();
        RETURN true;
    END IF;
    
    -- Check if under limit
    IF v_current_count < p_max_requests THEN
        UPDATE public.rate_limits 
        SET request_count = request_count + 1
        WHERE identifier = p_identifier AND endpoint = p_endpoint;
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.check_rate_limit IS 'Returns true if request is allowed, false if rate limited';
