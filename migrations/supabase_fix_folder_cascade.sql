-- Fix Folder Deletion Constraint
-- Ensure that deleting a folder also deletes its children (Cascade)
-- This prevents "Foreign key violation" errors when hard-deleting folders.

-- 1. Drop existing constraint if it exists (name might vary, trying standard naming)
ALTER TABLE public.items 
DROP CONSTRAINT IF EXISTS items_folder_id_fkey;

-- 2. Add constraint with ON DELETE CASCADE
ALTER TABLE public.items 
ADD CONSTRAINT items_folder_id_fkey 
FOREIGN KEY (folder_id) 
REFERENCES public.items(id) 
ON DELETE CASCADE;
