-- Add is_archived column to items table
ALTER TABLE public.items 
ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;

-- Create index for performance
CREATE INDEX IF NOT EXISTS items_is_archived_idx ON public.items (is_archived);
