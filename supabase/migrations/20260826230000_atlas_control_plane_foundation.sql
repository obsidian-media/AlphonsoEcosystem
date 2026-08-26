-- Atlas control-plane persistence foundation.
--
-- This migration creates the durable schema required to replace the non-production
-- in-memory Atlas demo state. State-changing operations are intentionally not exposed
-- to direct client table writes: production services must use a scoped server role or
-- security-definer RPCs that validate workspace membership, device trust, challenges,
-- policy, and audit receipt creation in one transaction.

create extension if not exists pgcrypto;

create table if not exists public.atlas_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  posture text not null check (posture in ('cloud', 'hybrid', 'local', 'on_device')),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.atlas_workspace_members (
  workspace_id uuid not null references public.atlas_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null check (member_role in ('owner', 'operator', 'reviewer', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.atlas_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.atlas_workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  summary text not null check (char_length(summary) between 1 and 2000),
  owner_label text not null check (char_length(owner_label) between 1 and 160),
  phase text not null check (phase in ('planned', 'awaiting_approval', 'queued', 'executing', 'waiting_on_dependency', 'succeeded', 'failed', 'cancelled')),
  posture text not null check (posture in ('cloud', 'hybrid', 'local', 'on_device')),
  trace_id text not null unique check (char_length(trace_id) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.atlas_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.atlas_workspaces(id) on delete cascade,
  run_id uuid references public.atlas_runs(id) on delete set null,
  title text not null check (char_length(title) between 1 and 240),
  summary text not null check (char_length(summary) between 1 and 2000),
  affected_resource text not null check (char_length(affected_resource) between 1 and 500),
  execution_detail text not null check (char_length(execution_detail) between 1 and 1000),
  policy_code text not null check (char_length(policy_code) between 1 and 100),
  policy_reason text not null check (char_length(policy_reason) between 1 and 2000),
  evidence_summary text not null check (char_length(evidence_summary) between 1 and 5000),
  risk text not null check (risk in ('routine', 'elevated', 'high')),
  state text not null check (state in ('awaiting_review', 'review_recorded_pending_confirmation', 'confirmation_recorded', 'approved', 'rejected', 'expired', 'unavailable')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.atlas_action_challenges (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.atlas_workspaces(id) on delete cascade,
  decision_id uuid not null references public.atlas_decisions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  policy_code text not null check (char_length(policy_code) between 1 and 100),
  statement text not null check (char_length(statement) between 1 and 2000),
  requires_local_authentication boolean not null default false,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  confirmation_receipt_id uuid,
  check (expires_at > issued_at)
);

create table if not exists public.atlas_audit_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.atlas_workspaces(id) on delete restrict,
  decision_id uuid references public.atlas_decisions(id) on delete restrict,
  challenge_id uuid references public.atlas_action_challenges(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  device_id uuid,
  event_type text not null check (event_type in ('review_recorded', 'challenge_issued', 'confirmation_recorded')),
  execution_status text not null check (execution_status in ('not_executed')),
  correlation_id uuid not null default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists atlas_workspace_members_user_idx
  on public.atlas_workspace_members (user_id, workspace_id);
create index if not exists atlas_runs_workspace_updated_idx
  on public.atlas_runs (workspace_id, updated_at desc);
create index if not exists atlas_decisions_workspace_state_idx
  on public.atlas_decisions (workspace_id, state, expires_at);
create index if not exists atlas_action_challenges_decision_device_idx
  on public.atlas_action_challenges (decision_id, user_id, device_id, expires_at);
create index if not exists atlas_audit_receipts_workspace_occurred_idx
  on public.atlas_audit_receipts (workspace_id, occurred_at desc);

alter table public.atlas_workspaces enable row level security;
alter table public.atlas_workspace_members enable row level security;
alter table public.atlas_runs enable row level security;
alter table public.atlas_decisions enable row level security;
alter table public.atlas_action_challenges enable row level security;
alter table public.atlas_audit_receipts enable row level security;

create policy "Atlas members can read workspace metadata"
  on public.atlas_workspaces for select to authenticated
  using (exists (
    select 1 from public.atlas_workspace_members member
    where member.workspace_id = atlas_workspaces.id and member.user_id = (select auth.uid())
  ));

create policy "Atlas members can read memberships"
  on public.atlas_workspace_members for select to authenticated
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.atlas_workspace_members member
    where member.workspace_id = atlas_workspace_members.workspace_id and member.user_id = (select auth.uid())
  ));

create policy "Atlas members can read workspace runs"
  on public.atlas_runs for select to authenticated
  using (exists (
    select 1 from public.atlas_workspace_members member
    where member.workspace_id = atlas_runs.workspace_id and member.user_id = (select auth.uid())
  ));

create policy "Atlas members can read workspace decisions"
  on public.atlas_decisions for select to authenticated
  using (exists (
    select 1 from public.atlas_workspace_members member
    where member.workspace_id = atlas_decisions.workspace_id and member.user_id = (select auth.uid())
  ));

create policy "Atlas members can read own action challenges"
  on public.atlas_action_challenges for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.atlas_workspace_members member
    where member.workspace_id = atlas_action_challenges.workspace_id and member.user_id = (select auth.uid())
  ));

create policy "Atlas members can read workspace audit receipts"
  on public.atlas_audit_receipts for select to authenticated
  using (exists (
    select 1 from public.atlas_workspace_members member
    where member.workspace_id = atlas_audit_receipts.workspace_id and member.user_id = (select auth.uid())
  ));

-- Audit receipts are append-only, including for privileged application roles.
create or replace function public.atlas_reject_audit_receipt_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Atlas audit receipts are immutable';
end;
$$;

create trigger atlas_audit_receipts_no_update
  before update or delete on public.atlas_audit_receipts
  for each row execute function public.atlas_reject_audit_receipt_mutation();
