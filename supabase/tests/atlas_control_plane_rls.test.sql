begin;

create extension if not exists pgtap with schema extensions;
select plan(23);

-- The migration under test is applied by `supabase test db` before this suite.
-- Fixed UUIDs are safe because the enclosing transaction rolls back every change.
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'atlas-owner@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'atlas-member@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'atlas-outsider@example.test');

insert into public.atlas_workspaces (id, name, posture)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Atlas RLS verification workspace', 'cloud'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Atlas non-member workspace', 'cloud');

insert into public.atlas_workspace_members (workspace_id, user_id, member_role)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'reviewer');

insert into public.atlas_runs (
  id, workspace_id, title, summary, owner_label, phase, posture, trace_id
)
values (
  '44444444-4444-4444-4444-444444444444',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'RLS verification run',
  'A non-executing record used only to verify Atlas read boundaries.',
  'Atlas test owner',
  'planned',
  'cloud',
  'RUN/RLS-001'
);

insert into public.atlas_decisions (
  id, workspace_id, run_id, title, summary, affected_resource, execution_detail,
  policy_code, policy_reason, evidence_summary, risk, state, expires_at
)
values (
  '55555555-5555-5555-5555-555555555555',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '44444444-4444-4444-4444-444444444444',
  'RLS verification decision',
  'An intent-only decision record used for access-control verification.',
  'Atlas test workspace',
  'No external action is configured.',
  'P-RLS-001',
  'The database policy verification requires an isolated decision fixture.',
  'Fixture evidence is limited to this rolled-back pgTAP transaction.',
  'high',
  'review_recorded_pending_confirmation',
  now() + interval '1 hour'
);

insert into public.atlas_action_challenges (
  id, workspace_id, decision_id, user_id, device_id, policy_code, statement,
  requires_local_authentication, expires_at
)
values (
  '66666666-6666-6666-6666-666666666666',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '55555555-5555-5555-5555-555555555555',
  '11111111-1111-1111-1111-111111111111',
  '77777777-7777-7777-7777-777777777777',
  'P-RLS-001',
  'This challenge verifies read scoping only and cannot execute an action.',
  true,
  now() + interval '30 minutes'
);

insert into public.atlas_audit_receipts (
  id, workspace_id, decision_id, challenge_id, actor_user_id, device_id,
  event_type, execution_status, correlation_id, payload
)
values (
  '88888888-8888-8888-8888-888888888888',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '55555555-5555-5555-5555-555555555555',
  '66666666-6666-6666-6666-666666666666',
  '11111111-1111-1111-1111-111111111111',
  '77777777-7777-7777-7777-777777777777',
  'confirmation_recorded',
  'not_executed',
  '99999999-9999-9999-9999-999999999999',
  '{"verification": "pgTAP only", "execution": "not_executed"}'::jsonb
);

select ok((select relrowsecurity from pg_class where oid = 'public.atlas_workspaces'::regclass), 'RLS is enabled for Atlas workspaces');
select ok((select relrowsecurity from pg_class where oid = 'public.atlas_workspace_members'::regclass), 'RLS is enabled for Atlas workspace memberships');
select ok((select relrowsecurity from pg_class where oid = 'public.atlas_runs'::regclass), 'RLS is enabled for Atlas runs');
select ok((select relrowsecurity from pg_class where oid = 'public.atlas_decisions'::regclass), 'RLS is enabled for Atlas decisions');
select ok((select relrowsecurity from pg_class where oid = 'public.atlas_action_challenges'::regclass), 'RLS is enabled for Atlas action challenges');
select ok((select relrowsecurity from pg_class where oid = 'public.atlas_audit_receipts'::regclass), 'RLS is enabled for Atlas audit receipts');

select ok(not has_table_privilege('anon', 'public.atlas_workspaces', 'select'), 'anonymous clients have no Atlas workspace read grant');
select ok(not has_table_privilege('authenticated', 'public.atlas_runs', 'insert'), 'authenticated clients cannot insert Atlas runs directly');
select ok(not has_table_privilege('authenticated', 'public.atlas_decisions', 'update'), 'authenticated clients cannot update Atlas decisions directly');
select ok(not has_table_privilege('authenticated', 'public.atlas_audit_receipts', 'delete'), 'authenticated clients cannot delete immutable audit receipts');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select results_eq(
  $$select id from public.atlas_workspaces order by id$$,
  array['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid],
  'the workspace owner reads only the shared workspace'
);
select results_eq(
  $$select id from public.atlas_action_challenges order by id$$,
  array['66666666-6666-6666-6666-666666666666'::uuid],
  'the challenge owner reads their own challenge'
);
select results_eq(
  $$select execution_status from public.atlas_audit_receipts order by id$$,
  array['not_executed'::text],
  'audit receipts preserve the non-executing status'
);

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select results_eq(
  $$select id from public.atlas_workspaces order by id$$,
  array['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid],
  'an invited member reads the shared workspace'
);
select results_eq(
  $$select user_id from public.atlas_workspace_members where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid order by user_id$$,
  array['11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid],
  'an invited member reads workspace membership without recursive RLS evaluation'
);
select results_eq(
  $$select id from public.atlas_runs order by id$$,
  array['44444444-4444-4444-4444-444444444444'::uuid],
  'an invited member reads the shared workspace run'
);
select is_empty(
  $$select id from public.atlas_action_challenges$$,
  'an invited member cannot read another member''s action challenge'
);
select results_eq(
  $$select id from public.atlas_audit_receipts order by id$$,
  array['88888888-8888-8888-8888-888888888888'::uuid],
  'an invited member reads the shared accountability receipt'
);

set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select is_empty($$select id from public.atlas_workspaces$$, 'an unrelated authenticated user reads no workspaces');
select is_empty($$select id from public.atlas_workspace_members$$, 'an unrelated authenticated user reads no memberships');
select is_empty($$select id from public.atlas_decisions$$, 'an unrelated authenticated user reads no decisions');
select is_empty($$select id from public.atlas_audit_receipts$$, 'an unrelated authenticated user reads no audit receipts');
select throws_ok(
  $$insert into public.atlas_runs (workspace_id, title, summary, owner_label, phase, posture, trace_id)
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      'Unauthorised client write',
      'This write must be denied before any external effect can occur.',
      'Unrelated user',
      'planned',
      'cloud',
      'RUN/RLS-DENIED'
    )$$,
  '42501',
  null,
  'an unrelated authenticated user cannot create a run through direct table access'
);

select * from finish();
rollback;
