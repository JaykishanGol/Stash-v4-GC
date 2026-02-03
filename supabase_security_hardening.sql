-- Security Hardening: Enable RLS on all tables and ensure proper indexing

-- 1. Items Table
ALTER TABLE IF EXISTS public.items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own items"
    ON public.items FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own items"
    ON public.items FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own items"
    ON public.items FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own items"
    ON public.items FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS items_user_id_idx ON public.items (user_id);
CREATE INDEX IF NOT EXISTS items_folder_id_idx ON public.items (folder_id);


-- 2. Lists Table
ALTER TABLE IF EXISTS public.lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own lists"
    ON public.lists FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own lists"
    ON public.lists FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own lists"
    ON public.lists FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lists"
    ON public.lists FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS lists_user_id_idx ON public.lists (user_id);


-- 3. Folders Table (if it exists separate from items, though 'items' table handles type='folder')
-- If you have a separate folders table, uncomment below. Based on code, folders are just items.
-- ALTER TABLE IF EXISTS public.folders ENABLE ROW LEVEL SECURITY;
-- ... policies ...


-- 4. Tasks Table (Already checked, but reinforcing)
ALTER TABLE IF EXISTS public.tasks ENABLE ROW LEVEL SECURITY;
-- (Policies likely exist from supabase_schema_tasks.sql, but good to double check in dashboard)
CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON public.tasks (user_id);


-- 5. Push Subscriptions (Already checked)
ALTER TABLE IF EXISTS public.push_subscriptions ENABLE ROW LEVEL SECURITY;
-- (Policies exist)
