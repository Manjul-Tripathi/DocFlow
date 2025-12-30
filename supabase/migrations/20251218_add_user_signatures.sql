-- User Signatures Table
-- Stores user's saved signatures and initials for reuse

create table if not exists user_signatures (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  signature_type text not null check (signature_type in ('signature', 'initial')),
  name text not null,
  data_url text not null, -- Base64 encoded image data
  font_family text,
  is_default boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS Policies for user_signatures
alter table user_signatures enable row level security;

-- Users can view their own signatures
create policy "Users can view their own signatures"
  on user_signatures for select
  using (auth.uid() = user_id);

-- Users can insert their own signatures
create policy "Users can insert their own signatures"
  on user_signatures for insert
  with check (auth.uid() = user_id);

-- Users can update their own signatures
create policy "Users can update their own signatures"
  on user_signatures for update
  using (auth.uid() = user_id);

-- Users can delete their own signatures
create policy "Users can delete their own signatures"
  on user_signatures for delete
  using (auth.uid() = user_id);

-- Index for faster lookups
create index if not exists idx_user_signatures_user_id on user_signatures(user_id);
create index if not exists idx_user_signatures_type on user_signatures(user_id, signature_type);
