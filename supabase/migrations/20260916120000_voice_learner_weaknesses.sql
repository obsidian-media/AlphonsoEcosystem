create table public.voice_learner_weaknesses (
  id uuid primary key default gen_random_uuid(),
  -- Note: The service_role key bypasses RLS for admin operations (cleanup, exports).
  -- All user-facing access is gated by the policies below.
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The session that most recently produced/refreshed this row. Matches
  -- VoiceRequest.session_id's shape (an app-generated string, not necessarily
  -- a UUID) -- see app/contracts.py. Traceability only; the unique
  -- constraint below (not this column) is what makes storage idempotent.
  session_id text not null check (char_length(session_id) between 1 and 128),
  language text not null check (char_length(language) between 2 and 10),
  mistake_type text not null check (char_length(mistake_type) between 1 and 60),
  example text not null check (char_length(example) between 1 and 500),
  corrected_form text not null check (char_length(corrected_form) between 1 and 500),
  created_at timestamptz not null default now(),
  -- One row per distinct mistake type per learner per language, not one row
  -- per session. lesson_pipeline.store_weaknesses upserts on this constraint
  -- (PostgREST `Prefer: resolution=merge-duplicates`, i.e.
  -- `INSERT ... ON CONFLICT (...) DO UPDATE`) instead of inserting a fresh
  -- row every analysis. This buys three things with one mechanism:
  --   - idempotency: a client retry of the same session's analyze call just
  --     re-upserts the same values, no duplicate rows
  --   - cross-session dedup: the same recurring mistake doesn't pile up
  --     N rows across N sessions
  --   - staleness/"resolution": created_at only advances when the mistake is
  --     seen again, so fetch_recent_weaknesses' recency window naturally lets
  --     a fixed mistake age out without needing a separate resolved flag
  unique (user_id, language, mistake_type)
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

-- Required for the upsert's ON CONFLICT DO UPDATE path, not just plain INSERT.
create policy "Users can update their own learner weaknesses"
  on public.voice_learner_weaknesses for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
