# Atlas Supabase RLS Verification Procedure

**Status:** Prepared for an isolated non-production Supabase project; **not yet executed**. This procedure verifies the read-only Atlas data boundary introduced in `20260826230000_atlas_control_plane_foundation.sql`. It does not authorize a production deployment, expose a client write path, or enable execution of external actions.

## Objective

Atlas mobile clients may read only the workspace records for which the authenticated user is a member. Direct mobile writes to workspace, work, decision, challenge, and audit tables remain prohibited. Future state changes must be implemented by a separately reviewed, server-side adapter or validated security-definer RPC that checks membership, device trust, challenge freshness, policy, and immutable audit creation in a single transaction.

> The verification suite confirms authorization boundaries only. A successful test run does **not** make the in-memory demo control plane durable or production-ready.

| Boundary | Prepared enforcement | pgTAP evidence |
| --- | --- | --- |
| Anonymous client | No grant on Atlas tables | Denied workspace read privilege |
| Authenticated client | Read-only grants only | Direct run insert, decision update, and audit delete privileges absent |
| Workspace owner | Reads the member workspace, their challenge, and its audit receipt | Positive read assertions |
| Invited member | Reads shared workspace, member list, run, decision/audit records | Positive read assertions, including the membership policy |
| Invited member | Cannot read another user’s action challenge | Empty result assertion |
| Unrelated user | Reads no workspace, member, decision, or audit record | Negative read assertions |
| Audit immutability | Audit status remains `not_executed`; direct client writes are denied | Read assertion plus denied direct run insert |

The migration explicitly revokes all table permissions from `anon` and `authenticated`, then grants only `SELECT` to `authenticated`. This distinction matters because an RLS policy limits matching rows but does not, by itself, remove a role’s underlying table privileges.[1]

## RLS design under test

The migration enables RLS on six Atlas tables and routes membership checks through `public.atlas_is_workspace_member(uuid)`. That helper is a schema-qualified `plpgsql SECURITY DEFINER` function with an empty `search_path`, explicit authenticated-only execution, and a JWT-derived caller identity. This avoids recursively evaluating the `atlas_workspace_members` policy while keeping authorization scoped to the caller’s current `auth.uid()`.[1][2]

| Artifact | Purpose |
| --- | --- |
| `supabase/migrations/20260826230000_atlas_control_plane_foundation.sql` | Creates tables, read-only grants, RLS policies, the membership helper, and immutable audit trigger. |
| `supabase/tests/atlas_control_plane_rls.test.sql` | Executes **23** transaction-isolated pgTAP assertions for owner, member, outsider, anonymous, and direct-write-denial scenarios. |

## Required non-production access

An authorized operator must provide access to a **separate non-production Supabase project** or a local Supabase environment. The migration has not been applied by this branch, and this procedure deliberately avoids running any remote mutation without deployment authority.

| Required item | Why it is needed | Not acceptable |
| --- | --- | --- |
| Isolated development or staging project | Applies and tests the Atlas migration without touching production data | A production project or a shared project without rollback approval |
| Database deployment authority | Runs the versioned migration and enables the RLS policies | A publishable/mobile key |
| Supabase CLI and local container runtime, or an approved remote test database | Runs `supabase test db` and pgTAP | Treating static review as RLS proof |
| Test-only users/workspace data | Exercises member and non-member scenarios inside a rolled-back transaction | Reusing customer identities or records |

## Execution sequence

Run the following only after the non-production project and deployment authority are available. Use a branch-specific or disposable environment and preserve the command output as evidence.

```bash
# Local, disposable validation (preferred before remote application)
supabase start
supabase db reset
supabase test db
```

For an authorized isolated remote environment, first link the intended **non-production** project, inspect the migration plan, and obtain explicit deployment approval before applying it. After application, run the same pgTAP suite against that environment according to the organization’s approved database workflow. Supabase documents `supabase test db` with pgTAP as the intended path for testing schema, functions, and RLS policies.[1][3]

The test intentionally uses `begin`/`rollback`, fixed non-production UUID fixtures, `set local role authenticated`, and `set local request.jwt.claim.sub` to switch principals. This follows Supabase’s documented policy-testing pattern and makes the owner/member/outsider cases reproducible without persistent test data.[1][3]

## Required acceptance evidence

The migration can be considered **database-boundary verified in non-production** only when each item below has recorded evidence.

1. The migration applies cleanly to the isolated environment, with no unexpected grants, policy creation errors, or RLS recursion.
2. `supabase test db` passes all 23 Atlas assertions.
3. An anonymous role is denied, workspace members can read only their allowed records, unrelated users see no records, and an invited member cannot read another user’s action challenge.
4. Authenticated mobile roles have no direct `INSERT`, `UPDATE`, or `DELETE` privileges for Atlas tables.
5. Audit receipts remain append-only, and their non-executing `execution_status` remains `not_executed`.
6. A separate application-level test exercises the future server adapter with unique test identities and verifies its atomic membership, device, challenge, policy, and receipt behavior.

## Explicit limitations after a green RLS suite

A green pgTAP suite proves only the prepared database authorization boundary. It does **not** provide server-verifiable device-bound proof, durable/replay-resistant challenges, dedicated Atlas authentication and step-up, scoped effect adapters, revocation/rate limiting, Hybrid QR/WSS transport, physical iPhone/iPad validation, or permission to execute any external effect. Those remain separate release gates.

## References

[1]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase: Row Level Security"
[2]: https://supabase.com/docs/guides/database/functions "Supabase: Database Functions"
[3]: https://supabase.com/docs/guides/local-development/testing/overview "Supabase: Testing Overview"
