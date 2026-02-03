-- Migration: Add User Settings for Google Sync Status
-- Purpose: Track if a user INTENDS to be connected to Google, so we can prompt re-connection if the token is lost.

create table user_settings (
  user_id uuid references auth.users(id) on delete cascade primary key,
  is_google_connected boolean default false,
  google_calendar_id text default 'primary',
  google_task_list_id text default '@default',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table user_settings enable row level security;

create policy "Users can view their own settings"
  on user_settings for select
  using (auth.uid() = user_id);

create policy "Users can insert/update their own settings"
  on user_settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own settings"
  on user_settings for update
  using (auth.uid() = user_id);
