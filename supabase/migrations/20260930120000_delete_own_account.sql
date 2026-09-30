-- In-app account deletion (2026-09-30 pre-launch audit, P0-6).
--
-- App Store Guideline 5.1.1(v) and basic privacy hygiene: a signed-in user can
-- permanently delete their own account and the data tied to it, without a
-- service-role key anywhere in a client or the Cloud Voice backend.
--
-- voice_devices, voice_learner_weaknesses, atlas_workspace_members and
-- atlas_action_challenges all reference auth.users ON DELETE CASCADE, so
-- deleting the auth row removes them.
--
-- Atlas audit receipts are an audit trail and are kept, but retention must not
-- block deletion (Apple's account-deletion guidance). Previously
-- actor_user_id and challenge_id were ON DELETE RESTRICT, which made
-- deleting any user with receipts fail. They now become NULL: the receipt
-- survives, anonymized, and no longer points at the deleted account.

alter table public.atlas_audit_receipts
  alter column actor_user_id drop not null;

alter table public.atlas_audit_receipts
  drop constraint if exists atlas_audit_receipts_actor_user_id_fkey,
  add constraint atlas_audit_receipts_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete set null;

alter table public.atlas_audit_receipts
  drop constraint if exists atlas_audit_receipts_challenge_id_fkey,
  add constraint atlas_audit_receipts_challenge_id_fkey
    foreign key (challenge_id) references public.atlas_action_challenges(id) on delete set null;

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
end;
$$;

revoke all on function public.delete_own_account() from public;
revoke all on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;
