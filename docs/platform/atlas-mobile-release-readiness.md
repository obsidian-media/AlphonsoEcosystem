# Atlas Mobile Release Readiness

## Purpose

This guide is the operational gate between the current **Atlas mobile foundation** and any non-demo mobile rollout. It converts the existing control-plane, persistence, and mobile architecture boundaries into verifiable release criteria. It must be completed in an isolated non-production environment before TestFlight, and repeated with production evidence before a public release. The present FastAPI Atlas module is intentionally a non-production contract-validation surface, and its confirmations remain non-executing.[1]

> **Release rule:** A green mobile interface, a successful client-side biometric prompt, or a `confirmation_recorded` state is not proof that an external action is authorized or executed. Production release requires the server-side policy, proof, persistence, and effect-adapter gates below.

## Current release posture

| Area | Current capability | Release interpretation |
|---|---|---|
| Mobile product | Atlas has typed workspace, work, decision, outcome, audit, identity, sync-health, and recovery surfaces. | Suitable for controlled UX and contract testing after native validation. |
| Cloud repository | HTTPS v1 client is opt-in and requires an enrolled device plus a Keychain-held bearer token. | Do not configure a production endpoint until durable server gates are complete. |
| Control plane | Demo state is in-memory, user-scoped, and disabled unless explicitly enabled. | **Not production eligible.** Replace rather than extend this module. |
| High-risk workflow | Review, server challenge, local biometric handoff, and non-executing confirmation receipt are distinct. | No final approval, dispatch, publication, or connector execution is enabled. |
| Durable data | The repository contains a Supabase migration with workspace, membership, challenge, and immutable audit foundations. | The migration and RLS behavior must be applied and verified in a dedicated environment before use.[2] |
| Native quality | Linux validation covers the Python suite and source integrity only. | macOS Xcode build, XCTest, archive, and physical-device checks remain mandatory. |

## Gate A — environment and configuration

| Check | Required evidence | Pass condition |
|---|---|---|
| Isolated environment | Environment name, owner, and Supabase project identifier recorded in the release ticket. | Demo, staging, and production credentials are never shared. |
| HTTPS origin | Reviewed `AtlasControlPlaneURL` supplied only through controlled build configuration. | URL is HTTPS, points to the intended environment, and contains no secret material. |
| Secrets boundary | Build settings and source scan. | No access token, service-role credential, or device identifier is in `Info.plist`, source control, logs, or `UserDefaults`.[1] |
| Demo isolation | Deployment configuration and route smoke test. | `ATLAS_CONTROL_PLANE_DEMO_MODE` is `false` outside an isolated test environment. |
| Workspace seed removal | Test data review. | `workspace-northstar` and its fixture assumptions are not relied on by the target environment. |

## Gate B — durable workspace and audit controls

| Check | Required evidence | Pass condition |
|---|---|---|
| Migration application | Migration execution record for `20260826230000_atlas_control_plane_foundation.sql`. | Schema, indexes, RLS policies, and immutable-audit trigger are present in the designated environment. |
| Membership isolation | Automated tests using at least two users and two workspaces. | A user cannot read, mutate, subscribe to, or infer another workspace’s data. |
| Device lifecycle | Enrollment, revocation, re-enrollment, and stale-device tests. | An unenrolled or revoked device cannot access briefing, events, audit receipts, review, challenge, or confirmation routes. |
| Durable repository adapter | Code review and restart test. | Runs, decisions, challenges, and audit receipts survive service restart and are written through a production repository—not the in-memory demo adapter. |
| Audit immutability | Direct update/delete attempts under application and administrative roles. | Receipts are append-only; changes or deletions are rejected and operational access is logged. |
| Event recovery | Disconnect, reconnect, duplicate-event, and background-resume test evidence. | Client resumes from authoritative data without applying partial mutations or silently presenting stale state as current. |

## Gate C — policy, proof, and effect separation

| Check | Required evidence | Pass condition |
|---|---|---|
| Scope enforcement | Server authorization tests for every workspace operation. | User role, workspace membership, device trust, and connector/resource scope are evaluated server-side. |
| Challenge durability | Challenge persistence, expiry, and concurrency tests. | Challenge is device-bound, short-lived, single-use, replay-resistant, and atomically consumed. |
| Step-up proof | Threat-model review and implementation test. | Server verifies a device-bound cryptographic proof; local biometric success alone is not accepted as proof.[1] |
| Policy adapter | Policy matrix and test suite. | The policy service independently decides whether an effect is allowed, required evidence is present, and an accountable actor is eligible. |
| Effect adapter | Controlled integration test against a non-production destination. | External effect execution is explicit, idempotent, scoped, observable, and produces a durable result receipt. |
| Local-worker separation | Network and authorization test. | The desktop/local companion remains a separately paired Hybrid worker boundary and cannot be reached through Atlas Cloud HTTP routes.[1] |

## Gate D — mobile identity, reliability, and UX

| Check | Required evidence | Pass condition |
|---|---|---|
| Dedicated Atlas sign-in | Product and security review. | Atlas no longer depends on incremental Voice Cloud session handoff; it has an explicit account/session lifecycle. |
| Keychain boundary | Device inspection and logout/reinstall test. | Atlas token and device identifier use the dedicated `ThisDeviceOnly` Keychain boundary; neither is copied to unprotected storage. |
| Account recovery | Manual test of unavailable, signed-out, enrolling, enrolled, and failed states. | Account & Cloud accurately reports state, permits only safe reconnection, and never exposes credentials or raw device IDs. |
| Workspace health | Offline, delayed, failed-refresh, and live-SSE scenarios. | The Home health record explains freshness/transport state and refresh retrieves a briefing only—it does not execute work. |
| Work flow | Create-work, Chat handoff, prepared receipt, retry, Planned routing, Work detail, and Library outcome tests. | A prepared record is visible immediately, is clearly planned, and is never represented as automatic execution. |
| Decision flow | Review, expired challenge, canceled biometric prompt, repeated confirmation, and audit-trail tests. | UI remains clear that review/confirmation are accountable non-executing steps until an approved production effect adapter exists. |
| Accessibility | Dynamic Type, VoiceOver, contrast, 44-point touch-target, reduced-motion, landscape, and iPad tests. | Every active control is operable and every unavailable surface is clearly labeled rather than presented as inert navigation. |

## Gate E — build, test, and release evidence

| Check | Required evidence | Pass condition |
|---|---|---|
| Backend regression | `pytest -q` result attached to release record. | Atlas backend and contract tests pass with no unexpected warning/error regressions. |
| macOS native build | GitHub Actions or trusted macOS runner log. | `xcodebuild build` succeeds for the exact commit and configuration intended for distribution. |
| XCTest | macOS test log for the exact commit. | Unit and UI tests pass on a supported simulator runtime. |
| Archive and signing | Archive/export log and signing review. | Release archive is reproducible, uses the correct bundle identifier/team, and contains only intended configurations. |
| Physical devices | Test matrix covering supported iPhone and iPad OS versions. | Magic-link return path, Face ID/Touch ID cancellation, Keychain persistence, offline recovery, SSE background/foreground behavior, and Dynamic Type are verified on hardware. |
| Security review | Signed review of Gates A–D. | No release-blocking finding remains open; risk acceptance is explicit, time-bound, and owned. |
| Rollback | Deployment and mobile build rollback plan. | The team can disable the server effect adapter, revoke devices, and halt the rollout without data corruption. |

## Explicit no-go conditions

A release is blocked if any of the following is true:

1. The in-memory demo control plane is exposed as a production service.
2. The Supabase migration, RLS behavior, or append-only audit protections are unapplied or unverified.
3. A local biometric prompt is treated as final server-verifiable authorization.
4. Any user can reach another workspace, device record, audit receipt, connector scope, or local worker.
5. An external effect can occur without a durable policy decision, idempotency guarantee, and result receipt.
6. The exact branch has not passed macOS Xcode build/XCTest plus physical-device checks.
7. Atlas labels a preparation, review, challenge, or confirmation receipt as completed external execution.

## Release record template

| Field | Record |
|---|---|
| Candidate commit |  |
| Environment |  |
| Release owner |  |
| Mobile build number |  |
| Backend test log |  |
| macOS build/XCTest log |  |
| Device matrix evidence |  |
| Security reviewer |  |
| Policy/effect adapter reviewer |  |
| Rollback owner and procedure |  |
| Exceptions and expiry date |  |
| Final go/no-go decision |  |

## References

[1] [Atlas Control Plane Demo Boundary](../../voice/cloud-backend/ATLAS_CONTROL_PLANE_DEMO.md)

[2] [Atlas Persistence Foundation](atlas-persistence-foundation.md)

[3] [Atlas Full-Mobile Foundation](mobile-foundation.md)
