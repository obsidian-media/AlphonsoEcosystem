# FABLE5.md — Fast Orientation for the Next Agent Session

**Purpose:** Read this file FIRST, before `CLAUDE.md` or `docs/ALPHONSO_GROUND_TRUTH.md`. It tells you what this repo *is*, where the real source-of-truth docs live, what I verified myself vs. what I trusted from existing docs. It is deliberately short — the existing docs are already excellent and huge; don't re-read them cover to cover unless you're working in that specific area.

**Written:** 2026-07-12, by a Claude Code session. Two passes this session:
1. A repo audit (doc-synthesis + spot-checks, not a full `npm test`/`cargo check` run) starting from branch `TestParallal` @ `89a6e73`. Repo indexed into codebase-memory-mcp as project `D-AgentDevWork-repos-AlphonsoEcosystem` — 9,591 nodes / 22,255 edges.
2. A fix + branch-hygiene pass: fixed a real `npm run typecheck` failure, discovered `TestParallal` was NOT ahead of `main` (see §4A below — this superseded my original §4.1/§4.2 findings, kept here renamed for the record), and merged only the salvageable part into `main`.

**Current state as of this write:** `main` @ `ee228d0`, `npm run typecheck` clean, working tree clean except this file.

---

## 1. What this project is, in one paragraph

Alphonso is a Windows desktop app (Tauri v2 + React 18/Vite/Tailwind frontend, Rust backend) that runs a 9-agent AI orchestration system (Alphonso/Jose/Hector/Miya/Maria/Marcus/Echo/Sentinel/Nova) on top of local Ollama + optional Claude/OpenAI, with 22 policy-gated external connectors (Telegram, WhatsApp, GitHub, Slack, Discord, Notion, ClickUp, YouTube, n8n, image/video gen backends, search APIs, etc.), a companion iOS app, a Voice OS sidecar (FastAPI/Python), and a real-time multi-agent "Boardroom" group chat feature. It is a solo/small-team project with an unusually mature documentation discipline — see §2.

## 2. The doc hierarchy — READ THIS ORDER

1. **This file** — orientation only, ~5 min read.
2. **`CLAUDE.md`** (repo root) — build commands, the "Do Not Duplicate" table (huge — check before writing any new service/component, there are 165+ services and 114+ components already), and a chronological session-log at the bottom going back through every sprint. This file explicitly says it OVERRIDES default behavior — respect that.
3. **`docs/ALPHONSO_GROUND_TRUTH.md`** — 1,751 lines, the actual single source of truth for feature status, "Real Gaps," and a "Known Audit Errors" section. It says outright: if an audit report conflicts with this file, trust this file. It is kept current sprint-by-sprint — I only read the first ~525 lines this session (sections 1–8: identity, agent roster, service layer, test suite, CI, npm scripts, connector status, real gaps). It continues to section 11.x+ with a long chronological "last verified" narrative — read further into it if you need pre-2026-07-10 history.
4. **`TODO.md`** — currently open, *not yet done* work only (Boardroom spec items explicitly deferred: cards, regenerate/diff view, resource contention handling, voice input, mobile parity in Boardroom — plus a "scope limits called out during the 12 [Boardroom] phases" section listing conscious cuts like no real `AbortController` fetch-cancellation for Stop).
5. **`docs/CHANGELOG.md`** — version history.

Do not write a competing summary doc. If you learn something durable, update `ALPHONSO_GROUND_TRUTH.md` and/or `TODO.md` per their own stated update rules — don't let this file (FABLE5.md) become a second source of truth; keep it a pointer + delta, not a copy.

## 3. Verified facts (I ran these myself this session, not copied from docs)

- **Repo indexed** into codebase-memory-mcp (`mcp__codebase-memory-mcp__*` tools) — 9,591 nodes / 22,255 edges. Use `search_graph`/`trace_path`/`get_code_snippet`/`query_graph` instead of blind grep for call-chain questions; it's already warm.
- **Version**: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` all read `2.6.0` — in sync (this was a real historical bug per GROUND_TRUTH §"Last verified" — 9 versions drifted before it was caught; it is NOT drifted right now).
- **`src/services/`**: 141 files total, 123 `.ts` / 11 `.js` (the remaining 11 root-level `.js` files are the last holdouts of a long TS-migration effort — expect this number to keep shrinking).
- **`src/test/`**: 229 files total under the test tree (151 direct files in the top-level glob I ran + subdirectories). Roughly matches GROUND_TRUTH's "218 test files" claim (close enough given subfolder counting differences — I did not run the full suite, see §5 below for why that's hard here).
- **`src/components/`**: 80 `.tsx`, 0 `.jsx` at the top level — confirms the "components are 100% TypeScript" claim.
- **`src/services/connectors/`**: 13 files.
- **`src-tauri/src/`**: 25 Rust module files, `lib.rs` is 2,199 lines (GROUND_TRUTH says "~2,024," close, likely grew slightly with recent work — not a red flag).
- **Architecture graph findings** (via `get_architecture`, summarized by a sub-agent to avoid blowing context):
  - `src/services` is the dominant hub in the whole call graph: **513 fan-in / 362 fan-out** — by far the busiest layer. This matches the "165+ services, check before writing a new one" guidance in CLAUDE.md — it's not just a doc warning, the graph backs it up.
  - Tightest-cohesion JS cluster (0.87) centers on `runProjectWorkshop`, `ProjectExecutionMode`, `requireApproval`, `createProjectExecutionPlan` — the project/approval workflow is the most architecturally self-contained JS subsystem.
  - Rust backend clusters are tighter (0.79–0.84 cohesion) than the JS frontend generally — expected for a systems layer.
  - `test` layer: 370 inbound calls, 0 outbound — tests are pure leaves, no test-to-test or reverse test→prod coupling.
  - One soft flag, not a defect: a direct `src` → `AlphonsoCompanion` (iOS) 12-edge link in the graph — likely shared protocol/type definitions rather than runtime calls. Worth a glance only if you're touching iOS companion work.
  - No dependency cycles, no dead-code clusters, no god-objects surfaced by community detection.
- **Branch state (superseded by §4A below — kept for the record):** at audit time, `TestParallal` looked like "2 commits ahead of main." It was not — see §4A for the real story (it had forked from an older main commit and was actually missing real work main had). Remote is `github.com/obsidian-media/AlphonsoEcosystem`.
- **Current state after this session's fixes:** `main` is at `ee228d0`, working tree clean except this file. `npm run typecheck` passes clean.

## 4. Discrepancies found — one fixed, one merge-blocked and resolved

1. **`npm run typecheck` FAILED at session start, now fixed on `main`.** `src/test/test-mocks.ts` did `vi.spyOn(global.Date, 'now')` — `global` isn't ambiently typed without `@types/node`/`"types": ["node"]` in `tsconfig.json`, which this repo doesn't have. Changed to `globalThis.Date` (standard, always-typed, functionally identical for this use). Verified `npm run typecheck` clean after. Commit `99df38e` on the now-superseded `TestParallal` branch, then carried forward into the squash-merge (`ee228d0`) described in §4A.

2. **The auto-memory MEMORY.md index** (outside this repo, at `C:\Users\AgentDev\.claude\projects\...\memory\MEMORY.md`) still says branch `feat/ios-companion` and "v2.0.9" — badly stale versus reality. Not fixable from inside this repo; just don't trust it over `git branch`/`package.json`.

## 4A. `TestParallal` branch — investigated, NOT merged as-is, salvaged instead

The user asked me to double-check `TestParallal` and merge it into `main` if it verified. It did not verify as "ahead of main" — investigation showed:

- `git merge-base main TestParallal` = `8498d01` (the 2.5.18→2.6.0 version-bump commit) — **not** main's actual tip at the time (`ca7738a`, "6 fixes from DEBUGGING branch"). `TestParallal` forked from an older point and never picked up main's next commit.
- That missed main commit (`ca7738a`) added `src/components/VoiceView.tsx`, fixed a real Voice OS Python-venv-resolution bug in `src-tauri/src/voice_sidecar.rs` (with unit tests — it now correctly prefers the Runtime-Hub-managed venv over a bundled-but-never-created one), and updated docs. None of that existed on `TestParallal`.
- `TestParallal`'s own two commits (`dbc3b5e`, `89a6e73`) added `src/test/tauri-mock.ts` + `src/test/test-mocks.ts` (344 lines of Tauri/service mock scaffolding, **imported by zero test files** — inert infrastructure) plus a stray `commit-msg.txt`. The `dbc3b5e` commit message claimed "14 React hooks tests, 200+ tests, all 243 test files pass with 3738 tests" — **none of those test files exist anywhere in the diff.** The message was fabricated/aspirational, not a record of real work.
- Merging `TestParallal` → `main` as literally requested would have **deleted** `VoiceView.tsx`, **reverted** the venv-resolution fix, and **dropped** the doc updates on `main` — a regression, for two commits whose only real content is unused mock scaffolding.

**Resolution (user confirmed after I explained the tradeoff):** created a temp branch off current `main`, copied over just `tauri-mock.ts` + `test-mocks.ts` (with the `globalThis` fix already applied), committed with an honest message that doesn't overstate what exists, fast-forward merged into `main`. Dropped the stray `commit-msg.txt` and the fabricated test-count claims. `main` is now `ee228d0`. The `TestParallal` branch itself was left alone (not deleted) in case anyone wants to look at it — it is not part of `main`'s history and should not be re-merged as-is.

**Lesson for future sessions:** don't trust a branch's commit messages as evidence of what's in the diff — verify with `git show --stat`/`git diff`. This one oversold itself by ~14 nonexistent test files.

## 5. Known environment constraint (from GROUND_TRUTH, not independently re-verified this session)

GROUND_TRUTH states the full 218/229-file Vitest suite cannot complete in one run on this dev machine — the worker pool times out past ~170 files regardless of pool configuration. This is documented as an environment/resource issue, not a code defect, and files that do run individually pass. If you need to verify tests, run targeted subsets (`vitest run src/test/<file>`), not the full `npm run test`.

## 6. What I did NOT do this session

- Did not run `npm run test`, `npm run build`, `cargo check`, or `cargo clippy` (user chose the lighter-weight audit path).
- Did not verify the "Do Not Duplicate" table in CLAUDE.md entry-by-entry (it's ~150 rows; treat it as trustworthy but not re-confirmed today).
- Did not open or audit `src-tauri/` Rust source beyond file/line counts.
- Did not investigate the Boardroom, Voice OS, or Mobile Companion subsystems beyond what's already narrated in GROUND_TRUTH §11.x (which reads as very thorough — multiple real bugs found and fixed there with actual root-cause tracing, not just claims).

## 7. Suggested first move for whoever reads this next

If you're picking up general work: read `CLAUDE.md` + `ALPHONSO_GROUND_TRUTH.md` §1–8 (already summarized above, so you can skim), check `TODO.md` for open items, and consider fixing the `test-mocks.ts` `global` TypeScript error (§4.1) as a quick, low-risk warm-up task if nothing else is more urgent.
