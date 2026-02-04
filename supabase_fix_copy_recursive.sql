-- FIX 3: Robust Copy Function (Recursive)
-- Copies a folder and all its descendants to a new parent folder
CREATE OR REPLACE FUNCTION public.copy_folder_recursive(
    source_folder_id uuid,
    target_folder_id uuid,
    new_user_id uuid
)
RETURNS void AS $$
DECLARE
    new_folder_id uuid;
    source_row public.items%ROWTYPE;
    child_row public.items%ROWTYPE;
BEGIN
    -- 1. Get source folder details
    SELECT * INTO source_row FROM public.items WHERE id = source_folder_id;
    
    -- 2. Create new folder (The copy)
    INSERT INTO public.items (
        id, user_id, folder_id, type, title, content, file_meta, 
        priority, tags, bg_color, is_pinned, is_archived, created_at, updated_at
    ) VALUES (
        gen_random_uuid(),
        new_user_id,
        target_folder_id, -- Parent is the new target
        source_row.type,
        source_row.title || ' (Copy)', -- Append Copy
        source_row.content,
        source_row.file_meta,
        source_row.priority,
        source_row.tags,
        source_row.bg_color,
        false, -- Don't copy pinned state usually
        false,
        now(),
        now()
    ) RETURNING id INTO new_folder_id;

    -- 3. Loop through children and copy them
    FOR child_row IN 
        SELECT * FROM public.items WHERE folder_id = source_folder_id AND deleted_at IS NULL
    LOOP
        IF child_row.type = 'folder' THEN
            -- Recursive call for sub-folders
            PERFORM public.copy_folder_recursive(child_row.id, new_folder_id, new_user_id);
        ELSE
            -- Direct copy for items
            INSERT INTO public.items (
                id, user_id, folder_id, type, title, content, file_meta, 
                priority, tags, bg_color, is_pinned, is_archived, created_at, updated_at
            ) VALUES (
                gen_random_uuid(),
                new_user_id,
                new_folder_id, -- Parent is the NEW folder we just created
                child_row.type,
                child_row.title, -- No need to append "Copy" for children
                child_row.content,
                child_row.file_meta,
                child_row.priority,
                child_row.tags,
                child_row.bg_color,
                false,
                false,
                now(),
                now()
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
