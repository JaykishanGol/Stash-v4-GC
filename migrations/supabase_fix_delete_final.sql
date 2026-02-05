-- FIX: Robust Deletion & Cleanup
-- 1. Drop the potential problem trigger
DROP TRIGGER IF EXISTS on_item_delete ON public.items;
DROP FUNCTION IF EXISTS public.handle_item_deletion();

-- 2. Add CASCADE to google_resource_links (if missing)
-- First, drop any existing loose constraint
ALTER TABLE public.google_resource_links
DROP CONSTRAINT IF EXISTS google_resource_links_local_id_fkey;

-- Cleanup orphans before adding constraint
DELETE FROM public.google_resource_links
WHERE local_id NOT IN (SELECT id FROM public.items)
AND local_type = 'item';

-- Add solid constraint
ALTER TABLE public.google_resource_links
ADD CONSTRAINT google_resource_links_local_id_fkey
FOREIGN KEY (local_id)
REFERENCES public.items(id)
ON DELETE CASCADE;

-- 3. Cleanup Orphaned Items (Invalid Folder Parents)
-- This fixes "Foreign Key Violation" if a child points to a ghost folder
UPDATE public.items
SET folder_id = NULL
WHERE folder_id IS NOT NULL 
AND folder_id NOT IN (SELECT id FROM public.items);

-- 4. Re-create the Cleanup Trigger (Safer Version)
CREATE OR REPLACE FUNCTION public.handle_item_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- Wrap in BEGIN/EXCEPTION to ensure deletion never fails
    BEGIN
        -- Remove from Tasks (Handle NULLs)
        UPDATE public.tasks
        SET item_ids = array_remove(COALESCE(item_ids, '{}'), OLD.id::text)
        WHERE item_ids @> ARRAY[OLD.id::text];

        -- Remove from Lists
        UPDATE public.lists
        SET items = array_remove(COALESCE(items, '{}'), OLD.id::text)
        WHERE items @> ARRAY[OLD.id::text];

        -- Clean Task Completions
        UPDATE public.tasks
        SET item_completion = COALESCE(item_completion, '{}'::jsonb) - OLD.id::text
        WHERE item_completion ? OLD.id::text;
    EXCEPTION WHEN OTHERS THEN
        -- If cleanup fails, LOG it but ALLOW the item deletion
        RAISE WARNING 'Cleanup trigger failed for item %: %', OLD.id, SQLERRM;
    END;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_item_delete
    AFTER DELETE ON public.items
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_item_deletion();
