-- Add scheduler columns to items table
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS reminder_type text DEFAULT 'one_time',
ADD COLUMN IF NOT EXISTS one_time_at timestamptz,
ADD COLUMN IF NOT EXISTS recurring_config jsonb,
ADD COLUMN IF NOT EXISTS next_trigger_at timestamptz,
ADD COLUMN IF NOT EXISTS last_acknowledged_at timestamptz;

-- Add scheduler columns to tasks table
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS reminder_type text DEFAULT 'one_time',
ADD COLUMN IF NOT EXISTS one_time_at timestamptz,
ADD COLUMN IF NOT EXISTS recurring_config jsonb,
ADD COLUMN IF NOT EXISTS next_trigger_at timestamptz,
ADD COLUMN IF NOT EXISTS last_acknowledged_at timestamptz;

-- Create index for polling performance
CREATE INDEX IF NOT EXISTS items_next_trigger_at_idx ON items (next_trigger_at);
CREATE INDEX IF NOT EXISTS tasks_next_trigger_at_idx ON tasks (next_trigger_at);
