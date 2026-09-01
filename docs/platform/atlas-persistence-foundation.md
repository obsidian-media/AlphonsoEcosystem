# Atlas Persistence Foundation

## Purpose

This foundation replaces the implicit persistence assumptions of the Atlas demo with a durable schema and a dedicated audit repository boundary. The active Cloud backend remains explicitly **non-production**: it uses `InMemoryAtlasAuditRepository` only when `ATLAS_CONTROL_PLANE_DEMO_MODE=true`. The Supabase migration establishes the tables, RLS policies, indexes, and immutable audit-receipt trigger that a production adapter must use.

> The migration is a security foundation, not a production switch. Do not enable a durable Atlas route merely because the tables exist.

## Durable schema

| Record | Primary responsibility | Client-access rule |
|---|---|---|
| `atlas_workspaces` and `atlas_workspace_members` | Workspace tenancy and role membership | Authenticated members can read only their own workspaces. |
| `atlas_runs` | Typed work records and lifecycle state | Members can read; state changes require a trusted server path. |
| `atlas_decisions` | Evidence-backed decision state | Members can read; decision state cannot be changed by direct client table mutation. |
| `atlas_action_challenges` | Short-lived device-bound confirmation challenges | Only the challenged user can read a challenge within a workspace they belong to. |
| `atlas_audit_receipts` | Immutable accountability record | Members can read; updates and deletes are rejected by a database trigger. |

The migration file is [`20260826230000_atlas_control_plane_foundation.sql`](../../supabase/migrations/20260826230000_atlas_control_plane_foundation.sql). It also indexes the read paths used by the mobile briefing, decision inbox, challenge lookup, and audit trail.

## Audit transition model

Every decision transition in the current control-plane adapter appends a non-executing receipt. The order is deliberate: a review is recorded, a short-lived challenge is issued, and a separate confirmation receipt is recorded. None of these state changes executes an action, dispatches a local worker, publishes content, or marks a decision as approved.

| Event | Required boundary | Receipt outcome |
|---|---|---|
| `review_recorded` | Authenticated user and enrolled device | `not_executed` |
| `challenge_issued` | Recorded review, policy state, user/device match, expiration | `not_executed` |
| `confirmation_recorded` | Matching unexpired single-use challenge and local-authentication attestation | `not_executed` |

## Production activation prerequisites

A production adapter must be added as a separate implementation of `AtlasAuditRepository`; it must not repurpose the demo adapter. It needs a trusted service identity or security-definer RPCs that execute the decision transition, challenge update, and audit insert in a single transaction. The service must validate workspace membership, durable Atlas device trust, server-verifiable step-up proof, expiration, replay protection, policy scope, and correlation IDs before it writes any state.

The current Supabase user JWT is suitable for RLS reads. It is not, by itself, sufficient evidence that a Face ID prompt completed. The existing mobile field is therefore documented as an attestation only. A future server-verifiable device-bound proof must replace it before a confirmation receipt can authorize any policy-gated execution path.

## Deployment sequence

Apply the SQL migration to an isolated non-production Supabase project first. Seed a workspace and member through a privileged operational procedure, then verify a user can read only their own workspace records and cannot modify decision or audit tables directly. Implement and test the production adapter behind a separate configuration gate. Only after the adapter produces durable, immutable receipts should the event feed move from demo state to persistent reads.
