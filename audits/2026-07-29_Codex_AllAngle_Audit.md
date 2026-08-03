# All-Angle Repository Audit

**Date:** 2026-07-29
**Auditor:** Codex
**Scope:** Architecture, security, quality, verification, governance, documentation, dependency hygiene, and repository state.
**Method:** Fresh full codebase-memory graph index; targeted graph/code review of high-risk boundaries; current governance/backlog review; repository-state and verification commands. This is a risk-based audit, not a claim that every line was manually reviewed.

## Executive assessment

**Status: PARTIAL — not release-ready from this environment.** The codebase has substantial policy-gating and test infrastructure, but the required local verification gate did not finish because its fallback secret scanner exceeded ten minutes. Two material Cloud Voice security items remain open in the canonical execution plan. The current workspace also contains unrelated untracked material which was not inspected, altered, or included in verification.

## Evidence collected

| Area | Result | Evidence |
|---|---|---|
| Knowledge graph | Reindexed successfully | Full index: 9,883 nodes; 22,344 edges; persisted artifact requested. |
| Workspace state | User-owned/unrelated untracked files present | `git status --short --branch`: `.claude/`, `28.07.2026HermesDetailALLinOneAuditReport.md`, and `landing/`; no changes made to them. |
| Lint | Passed | `npm run lint` exited 0 (2026-07-29). |
| Full governance verifier | Incomplete | `pwsh -File scripts/verify.ps1` timed out after 600 seconds at `== secret-scan ==`; lint/test/build/deploy stages were not reached. |
| Bash verifier | Not runnable in this session | `bash scripts/verify.sh` failed to start due to a local Windows logon-session error. |
| npm dependency audit | Incomplete | `npm audit --omit=dev --audit-level=high` could not contact the npm advisory endpoint and could not write its normal user-cache log. |
| Canonical backlog | Reviewed | `docs/TRUTH_FIRST_EXECUTION_PLAN.md`, `docs/ALPHONSO_GROUND_TRUTH.md`, and `docs/governance/DEFERRED_WORK.md`. |

## Confirmed findings

### A-01 — Verification gate can hang in fallback secret scanning (High)

`scripts/verify.ps1` recursively enumerates every eligible repository file and invokes `Select-String` once per file when `gitleaks` is unavailable. In this workspace, the stage did not complete within the verifier's 600-second command window, preventing the required lint/test/build/deploy checks from executing.

**Risk:** a required CI/local gate is not reliably usable; it masks later failures and makes release evidence non-reproducible.

**Recommendation:** make the fallback scanner bounded and Git-tracked-file based (or require/pin `gitleaks` in CI), emit per-stage timing, and add a regression test that proves it excludes large untracked/generated trees.

### A-02 — Cloud Voice local backend uses invalid credentialed wildcard CORS (High, pre-existing)

`voice/backend/main.py:24-31` configures `allow_origins=["*"]` with `allow_credentials=True`. This is invalid for credentialed browser requests and is already tracked as F2 in the Truth-First plan.

**Recommendation:** constrain allowed origins to the documented local client origins, or remove credential support if wildcard origins are intentional; test the selected browser-facing behavior.

### A-03 — Cloud Voice enrollment uses a Supabase service-role credential for REST writes/reads (High, pre-existing)

`voice/cloud-backend/app/supabase_auth.py:35-74` uses the full service-role key as both `apikey` and Bearer authorization for device-enrollment and lookup REST calls. It is already tracked as F3/T18 in the Truth-First plan.

**Risk:** compromise of this backend credential has broad Supabase authority beyond the narrow device-registration purpose.

**Recommendation:** move the operations behind a restricted Supabase RPC/function or scoped credential, with explicit authorization checks and an operational key-rotation procedure.

## Material risks requiring planned work

- **Complexity/concentration:** graph analysis identifies `MiyaStudio` (cyclomatic 45/cognitive 64), `hectorResearchService.runMultiSourceResearch` (32/86), `native_proof.scan_rc0_target_surface` (31/112), `voice.backend.main.ws_endpoint` (19/58), and connector dispatch as high-complexity or high-coupling surfaces. This is a maintainability/review-priority signal, not proof of a defect.
- **Release evidence:** live signed-updater verification and physical iOS/Cloud Voice device verification remain explicitly blocked on owner authorization/hardware (D1/D2).
- **Coverage:** function-level coverage and iOS CI test execution remain open canonical backlog items.
- **Documentation truth:** the execution plan itself records E2 (generated release evidence) and E3 (stale-claim reconciliation) as open. Do not treat historical pass counts or release claims as current evidence.

## Positive controls observed

- The refreshed graph shows explicit policy-gate, connector-auth, and Rust command-policy surfaces, with policy enforcement and connector credential retrieval among the most connected control points.
- Existing policy tests and gateway security entry points are structurally present; no bypass was asserted without a complete connector-by-connector runtime test.
- Current lint passes.

## Deferred / not verified

- Full JavaScript test suite, production build, Tauri checks/tests/clippy, E2E, and deploy-dry were not run in this audit because the required verifier stopped in secret scanning.
- Dependency advisories could not be refreshed because npm registry access failed in this session.
- No live paid connectors, release publishing, external APIs, or physical devices were used.

## Recommended order

1. Repair and time-bound the fallback secret-scan path, then run `pwsh -File scripts/verify.ps1` to completion.
2. Close F2 (CORS) and F3/T18 (service-role exposure) with focused tests.
3. Produce reproducible release evidence (E2) and reconcile stale claims (E3).
4. Break down the highest-complexity UI/research/proof/voice functions while preserving test coverage.
