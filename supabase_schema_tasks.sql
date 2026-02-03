-- Create or update the tasks table
create table if not exists public.tasks (
    id uuid not null primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    list_id uuid references public.lists(id) on delete set null,
    title text not null,
    description text,
    color text,
    priority text,
    
    -- Array of item IDs that are linked to this task
    item_ids text[] default '{}',
    
    -- JSONB map for completion status: { "itemId": true/false }
    item_completion jsonb default '{}'::jsonb,
    
    is_completed boolean default false,
    
    due_at timestamptz,
    remind_at timestamptz,
    reminder_recurring text,
    
    deleted_at timestamptz,  -- Soft delete timestamp (null = not deleted)
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Enable RLS
alter table public.tasks enable row level security;

-- Policies
create policy "Users can view their own tasks"
    on public.tasks for select
    using (auth.uid() = user_id);

create policy "Users can insert their own tasks"
    on public.tasks for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own tasks"
    on public.tasks for update
    using (auth.uid() = user_id);

create policy "Users can delete their own tasks"
    on public.tasks for delete
    using (auth.uid() = user_id);
