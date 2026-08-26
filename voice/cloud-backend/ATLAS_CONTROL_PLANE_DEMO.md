# Atlas Control-Plane Demo

## Purpose

This module is a **non-production mobile integration surface** for Atlas. It exists to validate the iOS typed repository and mobile information architecture against a real HTTP contract without exposing desktop controls, connector credentials, local files, worker dispatch, or final approval execution.

The routes are disabled by default. They must not be exposed as a production control plane until durable storage, tenant/workspace membership enforcement, device registration, scope-based authorization, audit receipts, rate limits, action challenges, and deployment review are implemented.

## Local configuration

Use an isolated non-production environment. Set the existing Supabase settings so the server can validate the user bearer token, then explicitly enable the demo module.

| Variable | Required | Purpose |
|---|---:|---|
| `SUPABASE_URL` | Yes | Supabase project URL used to validate a mobile user token. |
| `SUPABASE_ANON_KEY` | Yes | Publishable Supabase key supplied with the user token for validation. |
| `ATLAS_CONTROL_PLANE_DEMO_MODE` | Yes | Must be exactly `true` to enable the routes. It defaults to `false`. |
| `VOICE_CLOUD_TIMEOUT_SECONDS` | No | Existing Cloud Voice HTTP timeout; it does not change Atlas demo behavior. |

The iOS build activates its Cloud repository only when `AtlasControlPlaneURL` is a valid HTTPS origin and the mobile sign-in flow has stored an access token in the Atlas-specific Keychain entry. Unconfigured iOS builds retain the fixture repository.

> Do not add an Atlas access token to `Info.plist`, a repository file, or `UserDefaults`. The mobile client uses an authenticated bearer token from a dedicated Keychain entry.

## API contract

Every route requires `Authorization: Bearer <user-access-token>` and `X-Alphonso-API-Version: v1`. Workspace routes also require `X-Alphonso-Device-Id`, which must match a device enrolled by the authenticated user. The current demo accepts only the seeded `workspace-northstar` workspace and scopes ephemeral state by authenticated user ID.

| Operation | Route | Behavior |
|---|---|---|
| Enroll Atlas device | `POST /api/v1/devices/enroll` | Requires a matching `X-Alphonso-Device-Id` header and body `device_id`; returns `demo_enrolled` device trust. |
| Workspace briefing | `GET /api/v1/workspaces/workspace-northstar/briefing` | Requires an enrolled device; returns workspace metadata, freshness, active runs, outcomes, and pending decisions. |
| Create a draft run | `POST /api/v1/workspaces/workspace-northstar/runs/drafts` | Accepts `brief`, `desired_outcome`, and `execution_posture`; returns a planned run and adds it to the caller’s ephemeral briefing. |
| Record a decision review | `POST /api/v1/workspaces/workspace-northstar/decisions/decision-release-brief/reviews` | Records a review state only. It does **not** approve, dispatch, publish, or perform an external action. |

The response uses snake-case JSON and ISO-8601 timestamps. A repeated review of the same decision returns `409`, preventing the demo client from treating review handoff as an idempotent final approval.

## Development verification

Run the focused Atlas suite from this directory:

```bash
pytest -q tests/test_atlas_control_plane.py tests/test_contracts.py
```

The tests cover disabled-by-default behavior, required bearer authentication, required API-version headers, device-header/payload matching, enrolled-device enforcement, mobile response shape, draft creation, per-user ephemeral state, review transition behavior, and unknown-workspace rejection.

## Production replacement checklist

The demo state in `app/atlas_control_plane.py` must be replaced rather than extended in place. A production control plane needs a database-backed workspace model; RLS-enforced user membership; durable device enrollment and revocation; server-side scopes; a persistent append-only audit record; rate limits; background-safe event delivery; server-issued action challenges; biometric confirmation verification; and explicit policy-gated execution adapters. The desktop companion server remains a separate local-worker boundary and must not be reachable through these HTTP routes.
