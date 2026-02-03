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