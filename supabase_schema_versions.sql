-- Version History System
-- Tracks changes to items for data safety and recovery

CREATE TABLE IF NOT EXISTS public.item_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    version integer NOT NULL,
    title text NOT NULL,
    content jsonb NOT NULL,
    
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id)
);

-- Index for fast retrieval of history
CREATE INDEX IF NOT EXISTS idx_item_versions_item ON public.item_versions(item_id, version DESC);

-- RLS Policies
ALTER TABLE public.item_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own item versions"
    ON public.item_versions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own item versions"
    ON public.item_versions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Trigger Function to Auto-Version on Update
CREATE OR REPLACE FUNCTION public.create_item_version()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create version if meaningful content changed
    -- We skip updates that only change metadata like 'updated_at', 'is_unsynced', etc.
    IF (OLD.content IS DISTINCT FROM NEW.content) OR (OLD.title IS DISTINCT FROM NEW.title) THEN
        INSERT INTO public.item_versions (item_id, user_id, version, title, content, created_by)
        SELECT 
            NEW.id,
            NEW.user_id,
            COALESCE((SELECT MAX(version) FROM public.item_versions WHERE item_id = NEW.id), 0) + 1,
            NEW.title,
            NEW.content,
            auth.uid();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach Trigger to Items Table
DROP TRIGGER IF EXISTS on_item_update_version_history ON public.items;
CREATE TRIGGER on_item_update_version_history
    AFTER UPDATE ON public.items
    FOR EACH ROW
    EXECUTE FUNCTION public.create_item_version();
