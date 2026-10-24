# CALL-E Native/Live Preflight Audit

> **Status (2026-10-25):** a real placed call is still not checked. Today: 2.10.0 on `main` (not tagged; latest release 2.9.0), 9 agents, 33 connectors, 285 services, 546 test files / 6,777 tests, 189 Tauri commands, 50 Rust modules; current facts are in `docs/ALPHONSO_GROUND_TRUTH.md`.

Date: 2026-10-20  
Branch: `agent/Codex-priority-hardening`  
Scope: deferred-work item J3 / CALL-E live verification

## Evidence

- Codebase-memory graph status: ready; the graph exposes the native path
  `confirmMcpOutreachCall` -> `runCall` -> `pollMcpCallUntilTerminal` and the
  approval escalation function `placeEscalationCall`.
- Read-only GitHub Actions secret-name inventory returned no names matching
  CALL-E, HeyCall, phone, or Twilio. Secret values were not requested or read.
- No native login, keychain restart test, or real `run_call` was attempted.

## Assessment

The implementation path is present and ready for an owner-supervised native
acceptance run. Live closure is blocked by the absence of provisioned
credentials and the need for an explicitly consenting recipient; a real call
is a paid/high-risk external action and must not be initiated unattended.

## Required follow-up

1. Owner supplies/enters the CALL-E account in the native Tauri app.
2. Complete Alphonso's browser-login flow and capture an authenticated
   `tools/list` result.
3. Quit/relaunch and capture keychain-survived connected state.
4. With explicit recipient consent and Zero-Cost Mode disabled, place one
   `run_call` and capture terminal record plus connector audit row.
