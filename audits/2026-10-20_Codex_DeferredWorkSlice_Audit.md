# Deferred Work Slice Audit

> **Status (2026-10-25):** a dated record, kept as written. Today: 2.10.0 on `main` (not tagged; latest release 2.9.0), 9 agents, 33 connectors, 285 services, 546 test files / 6,777 tests, 189 Tauri commands, 50 Rust modules; current facts are in `docs/ALPHONSO_GROUND_TRUTH.md`.

Date: 2026-10-20  
Agent: Codex  
Scope: First implementation slice from the prioritized deferred-work batch

## Outcome

Implemented and verified three repository-actionable fixes on
`agent/Codex-priority-hardening`:

- Runtime starts are single-flight across Tauri command and autostart paths.
- Approval panels show the remaining/resolved count instead of retaining a
  stale "awaiting approval" total after decisions.
- Research snippet extraction removes `style` and `script` blocks before HTML
  tag stripping.

## Evidence

- `cargo test --lib runtime_manager` — 23 passed.
- `npx vitest run src/test/ApprovalPanel.test.jsx src/test/hectorResearchService.test.js` — 51 passed.
- `npx tsc --noEmit` — passed.
- `node scripts/verify-doc-counts.mjs` — passed.
- `git diff --check` — passed before commit.
- Commit `7335d3b` was pushed to the feature branch.

## Remaining risk

The Project Execution source-agent label is still open and remains in the
deferred register. Native desktop verification, CI-runtime observation, and
all owner-gated production/device/signing checks remain unclaimed. The
pre-existing `.serena/` and `brag-output/` directories were not touched.

## Prior audit comparison

The 2026-08-02 QA audit established that Projects, Runtimes, Research, and
approval-related surfaces were reachable but did not verify these specific
failure states. This slice adds deterministic unit/regression evidence for
three of those deferred behaviors; it does not claim a new packaged-desktop
run.
