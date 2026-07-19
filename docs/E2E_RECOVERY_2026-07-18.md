# E2E Recovery Ledger — 2026-07-18

## Baseline

`npx playwright test --reporter=line` collected 28 tests. The command exceeded
the local 60-second execution ceiling while failures were still being reported,
so this is a partial, factual ledger rather than a completion claim.

## Confirmed failures

| Spec | Failure class | Required repair |
|---|---|---|
| `visual.spec.js` shell and sidebar snapshots | Stale or nondeterministic baselines | Stabilize app state, then intentionally update reviewed Windows baselines. |
| `visual.spec.js` settings panel | Ambiguous `/Settings/i` role selector | Target the sidebar's `Open settings` accessible name. |
| `voice.spec.js` approvals navigation | Ambiguous `Orchestrator` role selector | Scope the selector to the sidebar navigation. |
| `runtime-tools.spec.js` | Its mock returned an obsolete prerequisite response shape, crashing Runtime Hub; its checks also implied Open WebUI was a supported settings flow | Align the mock with Rust's `PrereqStatus`; retain Runtime Hub coverage and move ComfyUI coverage to Settings → Runtime. |
| `content-pipeline.spec.js` | Expected the retired “Content Catalyst” title and calendar content before selecting its tab | Assert the current Content Studio entry point and explicitly select Calendar. |
| `smoke.spec.js` chat flow | Still running when the local command timed out | Re-run in isolation after shared navigation and mock setup are fixed. |
| `multiagent.spec.js` policy flow | Still running when the local command timed out | Re-run in isolation after the policy and navigation harness are fixed. |

## Rules for repair

- Keep one current success-path assertion for each covered user workflow.
- Do not delete a failing test solely to make CI green.
- Prefer scoped accessible-role selectors or stable `data-testid` attributes to
  broad text and regular-expression selectors.
- Update visual snapshots only after functional assertions are stable and the
  rendered state is deterministic.

## Current status

**PARTIAL:** `runtime-tools.spec.js` and `content-pipeline.spec.js` now pass
as an isolated group (8 tests, verified locally on 2026-07-19). The Runtime
Hub failure was a test-harness contract drift: the mock omitted Rust's required
`missing` array and `installHint` fields. The production Rust command already
returns that contract. E2E remains advisory until the visual baselines and all
remaining isolated specs are repaired, the full suite passes on Node 22 in CI,
and the workflow setting is removed.
