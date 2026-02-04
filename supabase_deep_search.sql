-- Search Capability: Deep Content Search
-- Stores extracted text from files for searchability

ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS search_text text;

-- Create Index for Full Text Search
CREATE INDEX IF NOT EXISTS items_search_text_idx ON public.items USING gin(to_tsvector('english', search_text));

-- Update Search Function to include this new field
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
            WHEN i.search_text IS NOT NULL THEN substring(i.search_text from 1 for 100)
            ELSE NULL 
        END as snippet,
        (
            similarity(i.title, query_text) + 
            (ts_rank(to_tsvector('english', COALESCE(i.search_text, '')), plainto_tsquery('english', query_text)) * 0.5)
        )::real as rank,
        i.updated_at
    FROM public.items i
    WHERE 
        i.deleted_at IS NULL 
        AND i.user_id = auth.uid()
        AND (
            i.title ILIKE '%' || query_text || '%' 
            OR (i.content->>'text') ILIKE '%' || query_text || '%'
            OR to_tsvector('english', COALESCE(i.search_text, '')) @@ plainto_tsquery('english', query_text)
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
