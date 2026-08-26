# Atlas Mobile Demo Validation Runbook

## Purpose and boundary

This runbook provides a repeatable **non-production** validation session for the Atlas iOS foundation. It exercises the typed mobile product against both fixture data and the gated Atlas demo control plane. It is intended for a trusted developer or tester using an isolated Supabase project and a supported iPhone/iPad or Xcode simulator.

> **Safety boundary:** The demo may create a planned run, record a review, issue a challenge, and record a non-executing confirmation receipt. It does **not** authorize, dispatch, publish, operate a desktop worker, access connectors, or perform an external action. A Face ID/Touch ID result is only a client attestation in this demo.[1]

## Prerequisites

| Item | Required state | Evidence before testing |
|---|---|---|
| Environment | Isolated non-production deployment only | Environment owner and Supabase project are recorded. |
| Server configuration | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `ATLAS_CONTROL_PLANE_DEMO_MODE=true` | The service starts with demo routes intentionally enabled.[1] |
| Mobile build | `AtlasControlPlaneURL` is a valid HTTPS origin for the isolated environment | The URL contains no credential material and points nowhere production. |
| Mobile session | A valid authenticated user session is available through the current mobile sign-in handoff | Account & Cloud can attempt device enrollment without exposing an access token. |
| Device | Supported simulator or physical iPhone/iPad; biometric hardware is preferred for the confirmation scenario | Device/OS/build number are recorded. |
| Test user | User has no reliance on production workspaces or data | The tester accepts that demo state is in-memory and user-scoped. |

> **Do not** put an Atlas bearer token, device identifier, Supabase secret, or service role key in source control, `Info.plist`, logs, or `UserDefaults`.[1]

## Preflight checks

| Check | Action | Expected result |
|---|---|---|
| Backend suite | From `voice/cloud-backend`, run `pytest -q`. | The Atlas control-plane tests pass. |
| Native suite | On a macOS runner, run the project’s `xcodebuild test` command against a supported iPhone simulator. | Unit and UI tests pass for the exact candidate commit. |
| Fixture fallback | Launch the iOS build with no `AtlasControlPlaneURL`. | Atlas Home renders fixture data and Account & Cloud identifies the fixture/unconfigured state. |
| Cloud configuration | Launch the isolated HTTPS-configured build with an authenticated session. | Account & Cloud moves through enrollment into an enrolled state, or shows an explicit recoverable error. |
| Trust headers | Inspect server request logs only for route/authorization outcome—never raw credentials. | Workspace operations are accepted only after matching device enrollment. |

## Mobile validation sequence

### 1. Atlas shell and recovery posture

Launch the app, confirm Atlas is the default experience, and verify the five mobile product areas: **Home, Work, Inbox, Chat, and More**. On Home, inspect the workspace-health record. It must distinguish a snapshot/refresh, live reconciliation, or a recoverable failure; Refresh reloads the briefing only and does not execute work.[2]

In More, verify that Account & Cloud and Security & Devices are active routes. Team, Boardroom, Knowledge, Integrations, and Local Worker must be marked **Planned**, not display an inert navigation affordance. Open the legacy companion only as a compatibility check; do not use its local pairing path as a Cloud API test.[2]

### 2. Device trust and briefing synchronization

Open **More → Account & Cloud**. Confirm that no token or raw device ID is visible. Trigger safe reconnection if needed and verify the status transitions are truthful: unavailable/fixture, disconnected, enrolling, enrolled, or recoverably failed.

After enrollment, return to Home and confirm an authoritative workspace briefing appears. In the server logs, verify only that the request passed bearer, version, and enrolled-device checks. The first event-stream payload must be a complete workspace snapshot; Atlas must not rely on partial event mutations.[1]

### 3. Planned work preparation and event reconciliation

Create a work item from **Work → Create work**. Enter a specific brief and a desired outcome, then select **Prepare work**. Verify the following conditions.

| Step | Expected mobile result | Expected demo result |
|---|---|---|
| Preparation | Visible `Preparing work` state; no silent dismissal | Draft route receives brief, desired outcome, and selected execution posture. |
| Receipt | `Work prepared` receipt explains that the record is planned only | A planned run is returned; no external task is executed. |
| Navigation | **View prepared work** opens Work → Planned | The run appears in the user-scoped current briefing/event snapshot. |
| Recovery | Simulate a transient briefing problem after a successful create, if feasible | Atlas preserves the accepted receipt and requests an authoritative refresh rather than inviting a duplicate retry. |

Repeat the same preparation flow from **Chat**: enter a typed direction, use the direction action, and verify the Create work brief is prefilled. Voice capture, file intake, and generated suggestions are intentionally unavailable in the current mobile contract.[2]

### 4. Evidence records and audit visibility

Open **Work → Library** and inspect a verified outcome record. Then open the latest outcome from Home. Both routes must show the same traceable outcome detail and immutable trace identifier.

Open **More → Security & Devices → Audit trail**. Before any decision activity, the screen may be empty in fixture mode or show read-only receipts in demo mode. The audit feed must never block core workspace use if it is unavailable, and every demo receipt must state `execution_status: not_executed`.[1]

### 5. Review, challenge, biometric handoff, and confirmation receipt

Use an Inbox decision only in the isolated demo workspace. This sequence verifies accountability flow—not approval or execution.

| Step | Tester action | Expected result |
|---|---|---|
| Review | Start the decision review flow | The server records review only. No approval, dispatch, publication, or external effect occurs. |
| Challenge | Continue to request the server challenge | A device-bound, short-lived challenge statement appears. |
| Biometric handoff | Confirm with Face ID/Touch ID where available | The local authenticator runs; cancel behavior remains recoverable. |
| Receipt | Submit the confirmation record | The receipt clearly states it is recorded and **not executed**. |
| Audit | Reopen Audit trail | Review/challenge/confirmation history is visible newest first, with a non-executing status. |

## Recovery and negative-path checks

| Scenario | Tester action | Expected recovery behavior |
|---|---|---|
| No Cloud configuration | Remove/omit the HTTPS control-plane URL and relaunch. | Fixture mode remains usable; no deceptive connection claim is shown. |
| Enrollment or briefing failure | Deny session access or point to an unreachable isolated origin. | Account/health surfaces expose a recoverable state and safe reconnect/refresh controls. |
| Review or challenge failure | Interrupt the request after review has been recorded. | Atlas labels the failed stage; a retry issues a challenge without recording review twice. |
| Confirmation transport failure | Interrupt confirmation recording after biometric handoff. | Atlas discards the local challenge and requires a fresh server challenge before a new confirmation attempt. |
| Biometric cancellation | Cancel the platform biometric prompt. | No confirmation receipt is created; the in-scope challenge remains until expiry or a new request is required. |
| Challenge expiry | Wait until challenge expiry, then submit. | The server rejects it; Atlas provides an explicit recovery path to request a fresh challenge. |
| Cross-user isolation | Repeat with a different isolated demo user. | Workspaces, runs, decisions, and audit receipts remain user-scoped. |

## Native UI automation

The current UI suite uses stable identifiers for workspace health, Account & Cloud, Audit trail, typed Chat direction, and Create work fields/actions. On macOS, run the full iOS test target and confirm these smoke flows pass:

1. Atlas launches as the default mobile shell with a workspace-health record.
2. More opens Account & Cloud and Audit trail.
3. Typed Chat direction opens a prefilled Create work sheet.
4. The legacy compatibility path can be entered and returned from without changing the default Atlas selection.

## Completion record

| Field | Record |
|---|---|
| Candidate commit |  |
| Tester and date |  |
| Environment and Supabase project |  |
| Device/simulator and OS |  |
| Fixture fallback result |  |
| Enrollment and briefing result |  |
| Work preparation/event result |  |
| Outcome/audit result |  |
| Review/challenge/confirmation result |  |
| Negative-path findings |  |
| macOS `xcodebuild test` evidence |  |
| Open defects and owner |  |

## Stop conditions

Stop immediately and disable the isolated demo route if any flow performs an external action, exposes credentials, reaches the local desktop worker, allows cross-user data access, represents `confirmation_recorded` as approval/execution, or loses the distinction between a demo receipt and a production effect. Do not promote the demo environment based on this runbook; use the separate release-readiness gate for durable policy, cryptographic proof, RLS, audit, physical-device, and release evidence.[3]

## References

[1] [Atlas Control Plane Demo Boundary](../../voice/cloud-backend/ATLAS_CONTROL_PLANE_DEMO.md)

[2] [Atlas Full-Mobile Foundation](mobile-foundation.md)

[3] [Atlas Mobile Release Readiness](atlas-mobile-release-readiness.md)
