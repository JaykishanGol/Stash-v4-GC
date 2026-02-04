-- FIX 1: Ensure cascading deletes for folders
-- This prevents "Foreign Key Violation" when deleting a folder before its children
ALTER TABLE public.items
DROP CONSTRAINT IF EXISTS items_folder_id_fkey;

ALTER TABLE public.items
ADD CONSTRAINT items_folder_id_fkey
FOREIGN KEY (folder_id)
REFERENCES public.items(id)
ON DELETE CASCADE;

-- FIX 2: Efficient Empty Trash RPC
-- Deletes all items marked as deleted_at IS NOT NULL for the user
CREATE OR REPLACE FUNCTION public.empty_trash()
RETURNS void AS $$
BEGIN
    -- Delete items that are in the trash
    -- Due to ON DELETE CASCADE, deleting folders will also delete their children
    -- even if the children weren't explicitly marked (though they should be).
    DELETE FROM public.items
    WHERE user_id = auth.uid()
    AND deleted_at IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
