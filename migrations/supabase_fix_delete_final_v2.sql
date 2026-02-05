-- FIX: Robust Deletion & Cleanup (Polymorphic-Safe)

-- 1. Drop the old trigger/function
DROP TRIGGER IF EXISTS on_item_delete ON public.items;
DROP FUNCTION IF EXISTS public.handle_item_deletion();

-- 2. Cleanup Orphaned Items (Invalid Folder Parents)
-- This fixes "Foreign Key Violation" if a child points to a ghost folder
UPDATE public.items
SET folder_id = NULL
WHERE folder_id IS NOT NULL 
AND folder_id NOT IN (SELECT id FROM public.items);

-- 3. Re-create the Cleanup Trigger (With Google Link Cleanup)
CREATE OR REPLACE FUNCTION public.handle_item_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- Wrap in BEGIN/EXCEPTION to ensure deletion never fails
    BEGIN
        -- 1. Clean up Google Resource Links (Polymorphic, so no FK)
        DELETE FROM public.google_resource_links 
        WHERE local_id = OLD.id;

        -- 2. Remove from Tasks (Handle NULLs)
        UPDATE public.tasks
        SET item_ids = array_remove(COALESCE(item_ids, '{}'), OLD.id::text)
        WHERE item_ids @> ARRAY[OLD.id::text];

        -- 3. Remove from Lists
        UPDATE public.lists
        SET items = array_remove(COALESCE(items, '{}'), OLD.id::text)
        WHERE items @> ARRAY[OLD.id::text];

        -- 4. Clean Task Completions
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

-- 4. Ensure item_versions CASCADE
-- (Just in case)
ALTER TABLE public.item_versions
DROP CONSTRAINT IF EXISTS item_versions_item_id_fkey;

ALTER TABLE public.item_versions
ADD CONSTRAINT item_versions_item_id_fkey
FOREIGN KEY (item_id)
REFERENCES public.items(id)
ON DELETE CASCADE;
