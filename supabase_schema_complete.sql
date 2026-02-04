-- ==========================================
-- SUPERIOR MIGRATION: Schema & Storage Fixes
-- ==========================================

-- 1. FIX STORAGE PERMISSIONS (Solves Mobile Image Bug)
-- Ensure the bucket exists and is private (secure)
INSERT INTO storage.buckets (id, name, public)
VALUES ('stash_vault', 'stash_vault', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Drop old policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can upload own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;

-- Policy: Allow users to upload files to their own folder
CREATE POLICY "Users can upload own files"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'stash_vault' AND
    auth.uid() = owner AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow users to view/download their own files
CREATE POLICY "Users can view own files"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'stash_vault' AND
    auth.uid() = owner AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow users to update their own files
CREATE POLICY "Users can update own files"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'stash_vault' AND
    auth.uid() = owner AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow users to delete their own files
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'stash_vault' AND
    auth.uid() = owner AND
    (storage.foldername(name))[1] = auth.uid()::text
);


-- 2. FIX ITEMS TABLE (Add Missing & Legacy Columns)
ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_completed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS priority text DEFAULT 'none',
ADD COLUMN IF NOT EXISTS due_at timestamptz,
ADD COLUMN IF NOT EXISTS bg_color text DEFAULT '#FFFFFF',
-- Legacy columns required by frontend types to prevent sync errors
ADD COLUMN IF NOT EXISTS remind_at timestamptz,
ADD COLUMN IF NOT EXISTS reminder_recurring text;

-- Add indexes for new columns (Critical for performance)
CREATE INDEX IF NOT EXISTS items_tags_idx ON public.items USING gin(tags);
CREATE INDEX IF NOT EXISTS items_is_pinned_idx ON public.items (is_pinned);
CREATE INDEX IF NOT EXISTS items_is_completed_idx ON public.items (is_completed);
CREATE INDEX IF NOT EXISTS items_due_at_idx ON public.items (due_at);
CREATE INDEX IF NOT EXISTS items_priority_idx ON public.items (priority);


-- 3. VERIFY TASKS TABLE (Ensure consistency)
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS priority text DEFAULT 'none',
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS remind_at timestamptz,
ADD COLUMN IF NOT EXISTS reminder_recurring text;


-- 4. CREATE MISSING LISTS TABLE
CREATE TABLE IF NOT EXISTS public.lists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text NOT NULL,
    "order" integer DEFAULT 0,
    items text[] DEFAULT '{}', -- Array of item IDs
    created_at timestamptz DEFAULT now()
);

-- RLS for Lists
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own lists" ON public.lists;
CREATE POLICY "Users can view their own lists"
    ON public.lists FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own lists" ON public.lists;
CREATE POLICY "Users can insert their own lists"
    ON public.lists FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own lists" ON public.lists;
CREATE POLICY "Users can update their own lists"
    ON public.lists FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own lists" ON public.lists;
CREATE POLICY "Users can delete their own lists"
    ON public.lists FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS lists_user_id_idx ON public.lists (user_id);

-- ==============================================================================
-- PHASE 1: CORE STABILITY MIGRATIONS
-- ==============================================================================

-- 1. FIX GHOST ITEMS (Referential Integrity)
-- Create a function to clean up references when an item is deleted
CREATE OR REPLACE FUNCTION public.handle_item_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- Remove the deleted item ID from any tasks that reference it
    UPDATE public.tasks
    SET item_ids = array_remove(item_ids, OLD.id::text)
    WHERE item_ids @> ARRAY[OLD.id::text];

    -- Remove the deleted item ID from any lists that reference it
    UPDATE public.lists
    SET items = array_remove(items, OLD.id::text)
    WHERE items @> ARRAY[OLD.id::text];

    -- Also clean up item_completion JSONB in tasks
    UPDATE public.tasks
    SET item_completion = item_completion - OLD.id::text
    WHERE item_completion ? OLD.id::text;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS on_item_delete ON public.items;
CREATE TRIGGER on_item_delete
    AFTER DELETE ON public.items
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_item_deletion();


-- 2. FIX FREEZING BRAIN (Server-Side Recursion)
-- RPC to efficiently delete a folder and all its descendants
CREATE OR REPLACE FUNCTION public.delete_folder_recursive(target_folder_id uuid)
RETURNS void AS $$
DECLARE
    target_ids uuid[];
BEGIN
    -- Recursive CTE to find all descendant IDs (including the folder itself)
    WITH RECURSIVE folder_tree AS (
        -- Base case: the target folder
        SELECT id FROM public.items WHERE id = target_folder_id
        UNION ALL
        -- Recursive case: items inside the folders found so far
        SELECT i.id
        FROM public.items i
        INNER JOIN folder_tree ft ON i.folder_id = ft.id
    )
    SELECT array_agg(id) INTO target_ids FROM folder_tree;

    -- Update all found items to be deleted (Soft Delete)
    -- We use updated_at = now() to ensure clients sync the change
    UPDATE public.items
    SET 
        deleted_at = now(),
        updated_at = now()
    WHERE id = ANY(target_ids) AND deleted_at IS NULL;
    
    -- NOTE: If you wanted HARD delete, you would use DELETE WHERE id = ANY(target_ids)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==============================================================================
-- PHASE 3: SCALABILITY MIGRATIONS (SEARCH)
-- ==============================================================================

-- 1. Enable Trigram Extension for Fuzzy Search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Add Indices for Performance
CREATE INDEX IF NOT EXISTS items_title_trgm_idx ON public.items USING gin (title gin_trgm_ops);
-- Cast content to text for indexing if it's JSONB, or extract text fields
-- For simplicity in this generic setup, we index title heavily. 
-- If 'content' is JSONB, we need a specific expression index.
-- Assuming 'content' ->> 'text' for notes.
CREATE INDEX IF NOT EXISTS items_content_text_trgm_idx ON public.items USING gin ((content->>'text') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tasks_title_trgm_idx ON public.tasks USING gin (title gin_trgm_ops);

-- 3. Search RPC Function
CREATE OR REPLACE FUNCTION public.search_items(query_text text)
RETURNS TABLE (
    id uuid,
    type text,
    title text,
    snippet text,
    rank real,
    updated_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id,
        i.type,
        i.title,
        CASE 
            WHEN i.type = 'note' THEN substring(i.content->>'text' from 1 for 100)
            ELSE NULL 
        END as snippet,
        similarity(i.title, query_text) as rank,
        i.updated_at
    FROM public.items i
    WHERE 
        i.deleted_at IS NULL 
        AND i.user_id = auth.uid()
        AND (
            i.title ILIKE '%' || query_text || '%' 
            OR (i.content->>'text') ILIKE '%' || query_text || '%'
        )
    UNION ALL
    SELECT 
        t.id,
        'task' as type,
        t.title,
        t.description as snippet,
        similarity(t.title, query_text) as rank,
        t.updated_at
    FROM public.tasks t
    WHERE 
        t.deleted_at IS NULL 
        AND t.user_id = auth.uid()
        AND (
            t.title ILIKE '%' || query_text || '%'
        )
    ORDER BY rank DESC, updated_at DESC
    LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
