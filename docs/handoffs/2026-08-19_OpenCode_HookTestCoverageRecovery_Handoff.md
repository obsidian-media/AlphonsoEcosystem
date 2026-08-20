# Hook Test Coverage Recovery — Handoff to OpenCode

**RESOLVED 2026-08-20** (Claude Code session): all 5 originally-flagged files
(`useAppShellState`, `useBootEffects`, `usePersistenceEffects`,
`useSessionEffects`, `useTrayEffects`) fixed, plus `useKeyboardShortcuts`
(found failing during verification — not in the original 5, so the
"pure-hoisting theory" caveat below was warranted). Full `src/test/hooks/`
suite: 15 files / 345 tests, 0 failures. Branch merged with `main` (zero
conflicts, no manual resolution needed) and pushed; PR #151 CI re-triggered.
The rest of this document is preserved as historical record of the
diagnosis — see `docs/governance/DEFERRED_WORK.md` for the resolution entry.

**From:** Claude Code (session 2026-08-19)
**To:** OpenCode (or any agent picking up `recover/hook-test-coverage`)
**Branch:** `recover/hook-test-coverage` (pushed to `origin`, PR #151 open against `main`)
**Status at handoff:** Open PR, CI red on two required checks, branch 52 commits behind current `main` but merges cleanly (verified via `git merge-tree`, zero conflict markers).

---

## 1. Why this branch exists (background, so you don't have to reconstruct it)

On 2026-07-10, a concurrent debugging session on this repo produced 7,243 lines of real, never-committed test coverage — 14 new files under `src/test/hooks/` — that were sitting in a git stash and were at real risk of being lost. On 2026-08-14, a repo-hygiene pass audited all local branches and stashes, identified this stash as genuinely unrecovered work (not superseded, not trivial), and rescued it onto this branch: `recover/hook-test-coverage`. Two commits were made to get it running at all:

1. `47c6c89` — `test(hooks): recover lost hook test coverage from 2026-07-10 stash` (the raw recovery)
2. `56d8509` — `fix: remove stale appStorage.js/ollama.js duplicates, fix act import` (fixed a real regression the recovery surfaced: `src/lib/appStorage.js`/`ollama.js` existed alongside already-migrated `.ts` siblings, and Vite's default resolve order was silently running the untyped `.js` — deleting them surfaced a real bug in `ollama.ts`'s `classifyOllamaError`, separately fixed in PR #147 on `main`)

After those two fixes, the suite sat at **257+/396 tests passing**. The remaining **132 failures** are concentrated in exactly 5 of the 14 files and have a diagnosed, but not yet fixed, root cause (§3 below). This has been sitting untouched since 2026-08-14, tracked in `docs/governance/DEFERRED_WORK.md` (2026-08-14 entry) and referenced from `docs/TRUTH_FIRST_EXECUTION_PLAN.md`.

**This is real, valuable, already-diagnosed work sitting idle — not a speculative task.** That's why handing it to a second agent to work in parallel is a good use of concurrent capacity: it does not overlap with any work currently in flight on `main` (Hermes delegation, AB strategy docs), and the branch merges cleanly against current `main` as of this handoff.

---

## 2. Exact current state (verified 2026-08-19, this session)

```
Branch:        recover/hook-test-coverage
Base:          main @ 0938c8a (merge-base)
Ahead of base: 2 commits (47c6c89, 56d8509)
Behind main:   52 commits — main has moved to efc235f since the branch was cut
Merge check:   git merge-tree <merge-base> origin/main origin/recover/hook-test-coverage
               → 0 conflict markers. Clean merge expected.
PR:            #151 "hook test coverage", OPEN, base=main, head=recover/hook-test-coverage
```

**PR #151's last CI run (2026-08-16, before the 52 commits landed on `main`) — required checks:**

| Check | Result |
|---|---|
| Test & Build | **FAILURE** |
| Doc Count Freshness | **FAILURE** |
| Rust Tests & Clippy | success |
| Secrets Scan (TruffleHog) | success |
| gate (secret-scan, doc-freshness, build, test, deploy-dry) | success (ran before the Doc Count Freshness failure was introduced, or on a different check set — re-verify, do not assume) |
| CodeQL / CodeFactor / Codacy / CodeRabbit / qlty | success, except Codacy shows `ACTION_REQUIRED` |

**14 files this branch adds** (all under `src/test/hooks/`, total 6,435 insertions):

```
useAppEffects.test.js            354 lines
useAppKeyboardShortcuts.test.js  297 lines
useAppShellState.test.js         585 lines   ← known failing
useBootEffects.test.js           431 lines   ← known failing
useDataHydration.test.js         695 lines
useIdleLock.test.js              305 lines
useKeyboardShortcuts.test.js     537 lines
useNativeProofEffects.test.js    227 lines
useOllamaHealth.test.js          603 lines
usePersistenceEffects.test.js    240 lines   ← known failing
usePollingEffects.test.js        375 lines
useSessionEffects.test.js        611 lines   ← known failing
useTrayEffects.test.js           598 lines   ← known failing
useVoiceInput.extended.test.js   577 lines
```

9 of the 14 files are believed fully passing already (257+/396 total passing across all 14 files); the 5 marked above account for the 132 known failures.

**Note on live reproduction:** this session attempted to run the 5 known-failing files directly (`npx vitest run <files> --no-file-parallelism`, and again with `--pool=threads`) and hit a `vitest-pool-runner: Timeout waiting for worker to respond` error before any test executed — this is the same pre-existing, already-documented environment constraint noted in `CLAUDE.md` ("the full local test suite... cannot complete in one run on this dev machine — vitest worker-pool startup times out"), evidently severe enough today to block even a single-file run on this machine at this moment. **Do not assume this means the tests are unrunnable** — verify in your own environment; this dev machine's resource state at the time of this session is the likely cause, not the test files themselves. If you hit the same timeout, try `--pool=threads --poolOptions.threads.singleThread` or reduce concurrent processes on the machine first.

---

## 3. Root cause of the 132 failures (diagnosed 2026-08-14, not yet fixed)

Per `docs/governance/DEFERRED_WORK.md`'s 2026-08-14 entry:

> 132 tests across `useAppShellState`, `useBootEffects`, `usePersistenceEffects`, `useSessionEffects`, `useTrayEffects` still fail — root cause identified as a Vitest 2.1.9→4.1.8 major-version jump changing `vi.mock` hoisting semantics, which needs real per-file mock-pattern rewrites, not something to force through quickly.

Current `package.json` pins `"vitest": "^4.1.8"` (confirmed this session). The original test files were written against Vitest ~2.1.9's hoisting behavior. Vitest's `vi.mock()` calls are hoisted to the top of the file at transform time in both versions, but the *semantics of what's safe to reference inside the mock factory* changed across the major version jump — factories that captured outer-scope variables, relied on `vi.mock` execution order relative to `vi.hoisted()` blocks, or depended on partial-mock (`vi.importActual`) timing are the likely failure classes. This is **not** a simple "bump a version and retest" fix — it requires reading each failing file's actual assertion errors and rewriting the specific mock pattern that broke, file by file.

**What this session found while inspecting `useAppShellState.test.js`** (one of the 5 failing files): its `vi.mock()` calls (lines 4-102+) are plain factory-function mocks returning object literals — `vi.mock('../services/memoryService', () => ({ listMemoryItems: vi.fn(() => []), ... }))` — which is the *safe* pattern (no outer-scope variable capture visible in the mocks inspected). This suggests the failures in this specific file may **not** be pure hoisting-order bugs, or may be a subtler variant (e.g., a mock's return shape no longer matching what the hook now expects post-migration, or an `act()`/async-timing change unrelated to `vi.mock` at all). **Do not assume the DEFERRED_WORK.md diagnosis is complete or fully accurate for every one of the 5 files** — it's the best diagnosis available at the time it was written, not independently re-verified against live failure output in this session (the pool-timeout above prevented that). Treat it as a strong starting hypothesis, not a confirmed root cause for every failure.

---

## 4. What "done" looks like

1. **Rebase or merge `main` into `recover/hook-test-coverage`** (52 commits behind as of this handoff — re-check the exact count when you start, `main` moves daily). Merge-tree dry run showed zero conflicts as of 2026-08-19, but re-verify before assuming that still holds.
2. **Run the full 14-file `src/test/hooks/` suite** and get real, current pass/fail numbers — don't trust the "257+/396" figure blindly, it's from 2026-08-14 and both the test files and their production-code targets (the actual hooks in `src/hooks/`) may have changed since.
3. **For each of the 132 (or however many are now) failing tests**, read the actual Vitest failure output (not just DEFERRED_WORK's diagnosis) and fix the specific mock pattern or assertion causing it. Expect this to be mostly mechanical once the pattern is identified per file, but do not batch-apply a fix across all 5 files without confirming each file's failures share the same root cause — the `useAppShellState.test.js` inspection above suggests they may not all be identical.
4. **Fix the `Doc Count Freshness` CI failure** — almost certainly the same class of issue this session hit twice on unrelated PRs (#165, and earlier in this same repo's history): adding new test files changes the total test-file/test count, and `scripts/verify-doc-counts.mjs`'s hand-maintained `CURRENT_TOTAL_TESTS` constant plus README.md/AGENTS.md's stated counts need updating to match. Run `node scripts/verify-doc-counts.mjs` locally before pushing — it exits 0 when clean, and tells you exactly which file/line is stale if not.
5. **Fix whatever caused `Test & Build` to fail** — re-run and get fresh output; the 2026-08-16 failure may be stale relative to current `main` (it may have been the same 132 known failures, or something else — verify, don't assume).
6. **Do not weaken or delete tests to make them pass.** If a test is asserting something the hook genuinely no longer does (behavior changed upstream in the 52 commits this branch is behind), fix the test to match current correct behavior — do not delete the assertion. If you're unsure whether a failure is a real regression-catch vs. a stale assertion, flag it rather than guessing.
7. **Update `docs/governance/DEFERRED_WORK.md`'s 2026-08-14 entry** to reflect resolution (or partial resolution, with an honest updated failure count) once you're done — don't leave it claiming "deferred" if it's fixed.
8. **Get PR #151 to green on all required checks** (`Test & Build`, `Doc Count Freshness`, `Rust Tests & Clippy`, `Secrets Scan`, both `gate` checks). **Do NOT merge it yourself.** Shayan is keeping merge authority on this one — when the PR is green, send a completion report (what you changed, current pass/fail count, CI status, anything still open or deferred) back and he'll ask Claude Code to merge it. This repo's `main` is protected; direct pushes will be rejected regardless (confirmed empirically this session), but the instruction above is about approval, not just mechanics — don't merge even if you have the technical ability to.

---

## 5. Explicit non-goals for this task

- Do not touch anything under `src/services/connectors/hermesAgentConnector.ts` or the Hermes per-agent provider system — that's separate, currently-active work (see `docs/TRUTH_FIRST_EXECUTION_PLAN.md` §I, PR 1a merged 2026-08-19, Phase 1b not yet started) and is out of scope here.
- Do not touch `docs/STRATEGY_AGNT_VS_ALPHONSO.md` or `docs/STRATEGY_AB_ROADMAP.md` (gitignored strategy docs, unrelated to this task).
- Do not expand this task into a general test-suite health audit — scope is specifically the 14 files this branch introduces and getting PR #151 green. If you find unrelated pre-existing failures elsewhere in the suite while you're in there, note them in `DEFERRED_WORK.md` rather than fixing them inline (keeps the PR reviewable and scoped).
- Do not bump the `vitest` package version as a shortcut to "fix" this — `4.1.8` is the currently pinned, intentional version across the whole repo; downgrading it to dodge the hoisting-semantics change would be a regression for everyone else, not a fix.

---

## 6. Quick-start commands

```bash
# From a clean main checkout:
git fetch origin
git checkout recover/hook-test-coverage
git merge origin/main   # resolve any conflicts if the clean merge-tree check above is stale by the time you run this

# Verify current failure state (adjust pool flags if you hit the worker-timeout issue):
npx vitest run src/test/hooks/ --no-file-parallelism

# Once fixed, before pushing:
node scripts/verify-doc-counts.mjs
npm run lint
npx tsc --noEmit

git push origin recover/hook-test-coverage
# PR #151 will pick up the new commits automatically (same branch, already open)
```

---

## 7. Who to ask if blocked

This is a single-operator repo (Shayan / `obsidianmedia.yt@gmail.com`). If genuinely blocked on a product decision (e.g., a test's expected behavior is ambiguous and might reflect an intentional recent product change rather than a bug), leave the test failing with a clear comment explaining the ambiguity and flag it in your handoff back, rather than guessing at intent.
