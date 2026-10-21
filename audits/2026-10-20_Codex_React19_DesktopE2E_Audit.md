# React 19 / Desktop E2E CI Audit

Date: 2026-10-20
Branch: `agent/Codex-priority-hardening`
Commit under test: `4c88b8d62313950100caf56d4463b4e32ecbe833`
Workflow: `39500638718`

## Evidence

- Standard Test & Build passed: unit tests, coverage, web build, and bundle-size checks.
- Rust Tests & Clippy passed.
- Secrets Scan, Doc Count Freshness, Cloud Voice & Gateway Tests, Gateway Health Check, iOS Companion Build Check, and Playwright E2E Smoke Test passed.
- The real Windows desktop E2E job failed before test execution in `Install EdgeDriver`.
- GitHub job step evidence identified the failed step as `Install EdgeDriver`; no desktop spec ran.

## Root cause and change

The workflow derived the compatible WebView2 `major.minor.build` version but used the full WebView2 patch version in the EdgeDriver download URL. The setup now resolves `https://msedgedriver.microsoft.com/LATEST_RELEASE_<major.minor.build>`, downloads that resolved release, and retains the existing executable version check against the first three components.

## Status

React 19 standard CI verification is green. Desktop E2E and the desktop-CI deferred item remain open pending a fresh run that proves EdgeDriver installation and real Tauri test execution. No branch-protection mutation was made.

## Follow-up CI finding

Replacement workflow `39504052015` reached `Test & Build` but failed at `Security audit (npm)` because Vite `8.0.16` fell within the affected `8.0.0`–`8.1.5` range for `GHSA-587h-7wmj-h5pm`. `npm audit fix --package-lock-only --ignore-scripts` resolved Vite to `8.3.4`; a local `npm audit --audit-level=high` then reported zero vulnerabilities. The lockfile-only update also refreshed compatible transitive Rolldown packages. A fresh CI run is required before claiming the desktop fix is verified.

The combined run then reached the corrected EdgeDriver step but failed during PowerShell parsing because the validation message used `$browserVersion:`; PowerShell interpreted the colon as part of the variable reference. The message now uses `${browserVersion}:` so the setup script parses and can execute.

The next run showed the lookup endpoint itself was unsuitable for this runner: a read-only check returned 404 for `LATEST_RELEASE_131.0.2903`, while the exact `131.0.2903.86/edgedriver_win64.zip` archive returned 200. The workflow now downloads the exact detected WebView2 version first and falls back to the compatible-release lookup only if the exact archive is unavailable.

Run `39510208290` confirmed the exact archive download and executable launch succeeded: it reported `Microsoft Edge WebDriver 131.0.2903.86`. The remaining failure was the validation regex expecting the legacy `MSEdgeDriver` prefix. CI now accepts both `MSEdgeDriver` and `Microsoft Edge WebDriver` output formats.

## Desktop runtime finding

Run `39512142677` proved the EdgeDriver setup and real Tauri launch path work. The desktop suite reached WebDriver execution and completed 16 specs with `3 passed, 13 failed`. The repeated failure was `Failed to read the 'localStorage' property from 'Window': Access is denied for this document.` in `e2e-desktop/helpers.mjs:37` inside `enterShell()`, under Microsoft Edge/WebView2 `131.0.2903.86`.

The harness now waits for a real Alphonso shell/setup root before touching storage, verifies the JavaScript write, and falls back to WebDriver's storage endpoint with a verified readback. Desktop CI remains open pending a fresh run of the patched helper.

## CI bounded-runtime follow-up

The fresh run `39517091682` again kept the primary Test & Build job active while all independent gates completed, leaving the desktop dependency chain unopened. The CI workflow now gives that job an explicit 45-minute timeout so a stalled install/test process produces a terminal failure instead of withholding downstream evidence indefinitely. This does not claim the desktop suite is green; a fresh run must still reach and pass the real desktop job.

The Rust quality prerequisite now has the same 45-minute bound because desktop jobs require both prerequisites; this prevents a stalled Cargo/toolchain operation from withholding desktop evidence indefinitely.

The separate `governance-gate` workflow, which runs `scripts/verify.sh` before branch CI, now also has a 45-minute bound. Without this, the main CI workflow can remain queued even when its own prerequisite jobs are bounded.

Superseded governance-gate runs were also observed remaining active across branch commits. The workflow now uses branch-scoped concurrency cancellation so the current commit's gate is not delayed by stale gate runs.

## Fresh desktop failure and harness correction

Run `39518466140` reached the real Windows desktop suite after all standard
gates, EdgeDriver setup, and Tauri launch succeeded. The suite completed 14
spec files successfully and failed only the smoke spec's `before all` hook:
`window.localStorage` was accessed directly from
`e2e-desktop/specs/smoke.e2e.mjs:42`, producing WebView2 error 18
(`Access is denied for this document`). The shared `enterShell()` helper had
already been hardened, but the smoke spec had its own duplicate setup path and
therefore bypassed that fix.

The smoke spec now imports and uses `enterShell()`, removing the duplicate
direct-storage setup. The current run is not a green desktop result: its
Windows desktop job remains failed because it used the pre-fix commit. A fresh
run after this correction is required.

Run `39522981820` verified the harness correction: the smoke spec passed all 19
checks and 15 of 16 desktop spec files passed. The sole failure was
`jose-approval.e2e.mjs`, which executed the packet from the Packets tab and then
asserted `Execution Results` without returning to Approvals, where that panel
is rendered. The test now switches back to Approvals before asserting the
visible result. A fresh run is required for the final desktop pass.

Run `39527088509` reached the real Windows suite after all prerequisites passed.
The suite again passed 15 of 16 spec files; the Jose case still timed out while
observing `Execution Results` after the tab switch. The packet reached
`executed`, so the failure is isolated to test synchronization around the tab
transition. The test now waits for the exact Approvals tab's
`aria-pressed=true` state before checking the result panel. A fresh governance
gate and full CI run are required.

Run `39531450328` reproduced the same isolated Jose result-panel observation
failure after the tab became active; 15 of 16 spec files passed again. The
packet reached `executed`, so the result-panel wait is now bounded at 60
seconds, matching the execution-state wait, to account for asynchronous UI
completion before another fresh run.

Run `39535487818` showed the 60-second wait still could not observe the panel;
the packet nevertheless reached `executed` and 15/16 spec files passed. The
root cause is now addressed in `OrchestratorView`: execution feedback is
rendered immediately as `Executing approved packet…` and replaced by the
durable final result. The Jose test now waits for the final queued summary.
Fresh governance and full CI verification are required.

Run `39539686231` exposed the remaining locator defect: the global `Execute`
selector could target another active packet when the isolated profile contained
more than one handoff. The Jose test now scopes the click to the approved IANA
packet card. That run also recorded one independent Project Execution stale
element failure; it is not conflated with the Jose fix and will be triaged if
it repeats.

Local targeted typecheck/Vitest execution is unavailable in this worktree
because the existing `node_modules` is incomplete (`tsc` cannot resolve its
binary and `@vitest/utils/dist/constants.js` is missing); clean CI installs
remain the authoritative check for the touched TypeScript component.

Run `39543100340` passed Project Execution and 15 of 16 desktop specs, but
Jose still lacked the result panel after the scoped click. The next run now
reports the active tab and visible main text when the panel assertion times
out, so the remaining UI-state issue can be fixed from direct evidence.

Run `39546580262` confirmed the panel and queued result were rendered. The
remaining failure was assertion casing: the UI renders `EXECUTION RESULTS`,
while the test searched case-sensitively for `Execution Results`. The test
now matches the panel label case-insensitively; a fresh green run is required.

Run `39549859072` completed the authoritative verification: all prerequisite
gates passed and the Windows real-Tauri suite reported 16 of 16 spec files
passed, including all three Jose approval tests. The case-insensitive result
panel assertion is verified against the built desktop application.

Exact-head CI `39553613636` then passed every required gate for `ed778e9`,
including frontend build/test/coverage, Rust checks, Linux and macOS builds,
Windows packaging, Playwright, and the Windows real-Tauri suite. This closes
the Jose desktop-E2E verification on the pushed branch.
