-- Optimistic Locking Support
-- Add version column to enable concurrent editing protection

-- 1. Items Table
ALTER TABLE public.items 
ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;

-- 2. Tasks Table
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;

-- 3. Lists Table
ALTER TABLE public.lists 
ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;

-- Trigger to auto-increment version on update
CREATE OR REPLACE FUNCTION public.increment_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply Triggers
DROP TRIGGER IF EXISTS on_item_update_version ON public.items;
CREATE TRIGGER on_item_update_version
    BEFORE UPDATE ON public.items
    FOR EACH ROW
    EXECUTE FUNCTION public.increment_version();

DROP TRIGGER IF EXISTS on_task_update_version ON public.tasks;
CREATE TRIGGER on_task_update_version
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.increment_version();

DROP TRIGGER IF EXISTS on_list_update_version ON public.lists;
CREATE TRIGGER on_list_update_version
    BEFORE UPDATE ON public.lists
    FOR EACH ROW
    EXECUTE FUNCTION public.increment_version();
