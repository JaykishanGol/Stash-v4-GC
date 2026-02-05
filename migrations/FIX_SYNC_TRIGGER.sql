-- FIX FOR SYNC ERRORS
-- The issue was caused by a shared trigger function trying to access 'list_id' on the 'items' table.
-- This script splits the trigger into two separate functions, one for Tasks and one for Items.

-- 1. Create separate function for TASKS (Lists)
CREATE OR REPLACE FUNCTION public.update_list_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF NEW.list_id IS NOT NULL THEN
            UPDATE public.lists SET item_count = item_count + 1 WHERE id = NEW.list_id;
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        IF OLD.list_id IS NOT NULL THEN
            UPDATE public.lists SET item_count = item_count - 1 WHERE id = OLD.list_id;
        END IF;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF OLD.list_id IS DISTINCT FROM NEW.list_id THEN
            IF OLD.list_id IS NOT NULL THEN
                UPDATE public.lists SET item_count = item_count - 1 WHERE id = OLD.list_id;
            END IF;
            IF NEW.list_id IS NOT NULL THEN
                UPDATE public.lists SET item_count = item_count + 1 WHERE id = NEW.list_id;
            END IF;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. Create separate function for ITEMS (Folders)
CREATE OR REPLACE FUNCTION public.update_folder_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF NEW.folder_id IS NOT NULL THEN
            UPDATE public.items SET child_count = child_count + 1 WHERE id = NEW.folder_id;
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        IF OLD.folder_id IS NOT NULL THEN
            UPDATE public.items SET child_count = child_count - 1 WHERE id = OLD.folder_id;
        END IF;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF OLD.folder_id IS DISTINCT FROM NEW.folder_id THEN
            IF OLD.folder_id IS NOT NULL THEN
                UPDATE public.items SET child_count = child_count - 1 WHERE id = OLD.folder_id;
            END IF;
            IF NEW.folder_id IS NOT NULL THEN
                UPDATE public.items SET child_count = child_count + 1 WHERE id = NEW.folder_id;
            END IF;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. Update the Triggers to use the new functions
DROP TRIGGER IF EXISTS trigger_count_tasks ON public.tasks;
CREATE TRIGGER trigger_count_tasks
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_list_counts();

DROP TRIGGER IF EXISTS trigger_count_items ON public.items;
CREATE TRIGGER trigger_count_items
AFTER INSERT OR UPDATE OR DELETE ON public.items
FOR EACH ROW
EXECUTE FUNCTION public.update_folder_counts();

-- 4. Clean up the old broken function
DROP FUNCTION IF EXISTS public.update_parent_counts();
