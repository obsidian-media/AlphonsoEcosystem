# Phase 2 — Orchestrator View Re-skin Spec

## Scope

Re-skin `OrchestratorView.tsx` (1177 lines, 84 real hardcoded color-class occurrences, verified via direct grep including the `red-*`/`pink-*` families this session's earlier grep pattern initially missed — see bug-log.md #12). This is the "Orchestrator" page (Agents space), the real governance/approval hub embedding `OrchestratorQueueView`. 61 refs live in the main render body, 23 in a dozen small reusable helper components at the bottom of the file (`OCard`, `ApproveBtn`, `RejectBtn`, `NeutralBtn`, `Panel`, `CollapsiblePanel`, `Metric`, `MiniStat`, `RuntimeRow`, `TrustBadge`, `GovernanceRow`, `FlowStep`). Same direct spec-and-build recipe as the previous 5 re-skins this session.

**Real finding: partial/inconsistent prior tokenization.** `OCard`, `ApproveBtn`, and `RejectBtn` already use `--success`/`--error` for their border/background, but still hardcode `text-emerald-300`/`text-red-300` for the label text sitting on top of those same tokened washes — a half-finished tokenization pass from before this redesign started. Completed here, not left inconsistent.

## Color mapping (all tokens confirmed real in `tokens.css`)

| Old (hardcoded) | New (token) |
|---|---|
| `zinc-900/NN` (panel/card backgrounds) | `var(--surface-1)` |
| `zinc-100`/`zinc-200`/`zinc-300` (primary/secondary text) | `var(--text-1)` / `var(--text-2)` |
| `zinc-400`/`zinc-500`/`zinc-600` (tertiary/quaternary text) | `var(--text-3)` / `var(--text-4)` |
| `emerald-*` (success states) | `var(--success)` / `var(--success-dim)` |
| `red-*` (error/reject states) | `var(--error)` / `var(--error-dim)` |
| `amber-*` (warning/pending states, icon accents) | `var(--warning)` / `var(--warning-dim)` |
| `fuchsia-*` (used here as a generic 4th "tone" option in `Metric`'s tone system, not tied to Miya specifically — this file has no per-agent context) | `var(--accent)` — the app's general default interactive/informational color, consistent with every prior page's treatment of a stray 4th neutral tone |

`Metric`'s `tone` prop (`'zinc' | 'green' | 'red' | 'amber' | 'fuchsia'`) keeps its existing prop values/API — only the color each tone maps to internally changes to a token. No call site needs updating.

## Test coverage

**Zero existing component tests for this file** (`batchOrchestratorService.test.js` tests a different, service-layer file). Given this page's real governance/approval role, add a focused smoke-test file covering: renders without crashing with a minimal props set, renders the core panel structure, and exercises `Metric`'s tone-based coloring doesn't crash for each tone value. Not exhaustive coverage of every panel's real data wiring — proportional to the effort already applied to other zero-coverage components this session (Hector's 5 sub-panels, Content Catalyst's 5 components).

## Explicitly open / deferred

- No `Zone` adoption — matches every non-Hector page this session; this file's panels are dense, data-heavy governance surfaces, not simple wash-able content zones.
- Any change to the underlying approval/governance logic, `OrchestratorQueueView` embed, or real-time data wiring — visual-only pass.
