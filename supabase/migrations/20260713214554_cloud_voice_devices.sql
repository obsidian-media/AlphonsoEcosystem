create table public.voice_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 120),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, device_id)
);

alter table public.voice_devices enable row level security;

create policy "Users can read their enrolled voice devices"
  on public.voice_devices for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can revoke their enrolled voice devices"
  on public.voice_devices for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
