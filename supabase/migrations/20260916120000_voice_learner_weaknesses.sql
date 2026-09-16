create table public.voice_learner_weaknesses (
  id uuid primary key default gen_random_uuid(),
  -- Note: The service_role key bypasses RLS for admin operations (cleanup, exports).
  -- All user-facing access is gated by the policies below.
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null check (char_length(language) between 2 and 10),
  mistake_type text not null check (char_length(mistake_type) between 1 and 60),
  example text not null check (char_length(example) between 1 and 500),
  corrected_form text not null check (char_length(corrected_form) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.voice_learner_weaknesses enable row level security;

create index voice_learner_weaknesses_user_language_created_at_idx
  on public.voice_learner_weaknesses (user_id, language, created_at desc);

create policy "Users can read their own learner weaknesses"
  on public.voice_learner_weaknesses for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own learner weaknesses"
  on public.voice_learner_weaknesses for insert to authenticated
  with check ((select auth.uid()) = user_id);
