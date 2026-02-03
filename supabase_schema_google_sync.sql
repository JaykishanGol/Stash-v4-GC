-- Migration: Add Google Resource Linking
-- Purpose: Link local Stash items/tasks to Google Calendar Events and Google Tasks

create type google_resource_type as enum ('event', 'task');

create table google_resource_links (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  
  -- The local Stash Item or Task ID
  local_id uuid not null,
  local_type text not null check (local_type in ('item', 'task')),
  
  -- Google's ID
  google_id text not null,
  resource_type google_resource_type not null,
  
  -- Metadata
  etag text, -- Google's version tag
  calendar_id text, -- For events (which calendar?)
  task_list_id text, -- For tasks (which list?)
  
  last_synced_at timestamptz default now(),
  created_at timestamptz default now(),
  
  -- Constraints: One local item can have multiple Google links, but usually unique per type
  unique(local_id, google_id)
);

-- Indexes for fast lookups
create index idx_google_links_local on google_resource_links(local_id);
create index idx_google_links_user on google_resource_links(user_id);
create index idx_google_links_google_id on google_resource_links(google_id);

-- RLS Policies
alter table google_resource_links enable row level security;

create policy "Users can view their own links"
  on google_resource_links for select
  using (auth.uid() = user_id);

create policy "Users can insert their own links"
  on google_resource_links for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own links"
  on google_resource_links for update
  using (auth.uid() = user_id);

create policy "Users can delete their own links"
  on google_resource_links for delete
  using (auth.uid() = user_id);
