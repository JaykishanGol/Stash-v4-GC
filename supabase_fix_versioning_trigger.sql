-- UPGRADE: Include file_meta in version history
-- This allows tracking file replacements (Version 1 -> Version 2)

-- 1. Update the item_versions table to store file_meta
ALTER TABLE public.item_versions
ADD COLUMN IF NOT EXISTS file_meta jsonb;

-- 2. Update the Trigger Function
CREATE OR REPLACE FUNCTION public.create_item_version()
RETURNS TRIGGER AS $$
BEGIN
    -- Detect changes in content, title, OR file_meta
    IF (OLD.content IS DISTINCT FROM NEW.content) 
       OR (OLD.title IS DISTINCT FROM NEW.title)
       OR (OLD.file_meta IS DISTINCT FROM NEW.file_meta) THEN
        
        INSERT INTO public.item_versions (
            item_id, 
            user_id, 
            version, 
            title, 
            content, 
            file_meta, -- Store file metadata
            created_by
        )
        SELECT 
            NEW.id,
            NEW.user_id,
            COALESCE((SELECT MAX(version) FROM public.item_versions WHERE item_id = NEW.id), 0) + 1,
            NEW.title,
            NEW.content,
            NEW.file_meta,
            auth.uid();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
