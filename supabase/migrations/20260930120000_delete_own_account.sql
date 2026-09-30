-- In-app account deletion (2026-09-30 pre-launch audit, P0-6).
--
-- App Store Guideline 5.1.1(v) and basic privacy hygiene: a signed-in user can
-- permanently delete their own account and the data tied to it, without a
-- service-role key anywhere in a client or the Cloud Voice backend.
--
-- voice_devices, voice_learner_weaknesses, atlas_workspace_members and
-- atlas_action_challenges all reference auth.users ON DELETE CASCADE, so
-- deleting the auth row removes them. atlas_audit_receipts.actor_user_id is
-- ON DELETE RESTRICT by design (receipts are an immutable audit trail): an
-- account with Atlas receipts is refused with a clear, catchable error rather
-- than silently rewriting audit history.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from auth.users where id = caller;
exception
  when foreign_key_violation then
    raise exception 'account has retained Atlas audit receipts; contact support to delete it'
      using errcode = 'P0001';
end;
$$;

revoke all on function public.delete_own_account() from public;
revoke all on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;
