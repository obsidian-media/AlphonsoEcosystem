# UI Redesign — Bug / Issue Log

Living document. Append findings as they're discovered during Phase 0 discovery and later phases. Each entry: what, where, how verified, status.

---

## CLOSED

### 1. "Agent Performance" sidebar nav item is a dead link — renders nothing

- **Where:** `src/components/Sidebar.tsx:95` registers `{ id: 'agent_performance', icon: Activity, label: 'Agent Performance' }` under the "Agents" nav group.
- **What's broken:** `src/App.tsx` had zero `activeTab === 'agent_performance'` render branch anywhere. Also found, while fixing: a genuinely dead, unused **static** import of `AgentPerformanceView` already sitting at the top of `App.tsx` (line 15) — imported but never rendered by anyone, pre-existing before this fix, and it started conflicting with the correct lazy-loaded version once one was added (`tsc --noEmit` caught this, not the plan's own test steps).
- **Fix:** wired a real `activeTab === 'agent_performance'` branch using the file's established lazy-loading convention, and removed the stale static import. See `06-phase1-implementation-plan.md` Task 1 and its follow-up fix commit.
- **Status:** CLOSED — fixed, tested (`src/test/appAgentPerformanceNav.test.js`), verified with a clean full-project `tsc --noEmit` and `npm run test` pass, committed to `ui-redesign/phase0-discovery`.

### 7. `SessionHistoryView.tsx` had zero navigation path anywhere — same class of bug as #1

- **Where:** `src/App.tsx` had no lazy import and no `activeTab === 'session_history'` branch for this component, mirroring bug #1's exact shape (a real, working component with no way to reach it).
- **Fix:** wired per the established convention (`12-sidebar-redesign-plan.md` Task 1) — lazy import + render branch — and added it as a real Home-space nav item in the rebuilt `Sidebar.tsx`.
- **Status:** CLOSED — `src/test/appSessionHistoryNav.test.js`, `tsc --noEmit` clean, committed.

### 8. Global search (Ctrl+P / sidebar search field) now works from any page — was Chat-only

- **What changed:** `toggle_search`/`showMemorySearch`/`<MemorySearch>` lifted from `ChatView.tsx`-local state to `App.tsx`-global state (`12-sidebar-redesign-plan.md` Task 2), closing the "only works while Chat is mounted" half of bug #6. `show_shortcuts`'s separate hand-rolled-modal duplication (the other half of #6) is untouched — still OPEN, a distinct cleanup.
- **Honest trade-off accepted, not silently dropped:** the old Chat-local `onSelect` handler populated the chat input with `Tell me about: ${item.title}` when a memory item was selected. The new global handler just closes the modal (`onSelect={() => setShowMemorySearch(false)}`) — `MemorySearch`'s `onSelect` prop is optional and App.tsx has no existing channel to push a value into `ChatView`'s composer from outside it. Wiring that back up (a cross-component prefill mechanism) was judged out of scope for this plan; flagging here in case a future pass wants to restore it specifically for the Chat page.
- **Status:** CLOSED for the stated scope (global search), with the composer-prefill regression above left as a known, deliberate gap — not a silent loss.

### 9. Research/Hector Desk re-skin — 6 components, zero prior test coverage, live-verified

- **What changed:** `HectorResearchDesk.tsx` and its 5 sub-panels (`SourceBoard`, `CitationPanel`, `ResearchReportPanel`, `HectorActivityLog`, `HectorApprovalHandoff`) were still on pre-redesign hardcoded `zinc-*`/`teal-*` Tailwind classes — the last real page left on the old visual language. Re-skinned onto the token system (`Zone mood="hector"`, `--surface-*`/`--text-*`/`--agent-hector`/`--success`/`--error`/`--warning-dim`) per `14-phase2-hector-research-desk-spec.md` / `15-hector-research-desk-implementation-plan.md`.
- **Real gap closed alongside the re-skin:** none of these 6 components had any test coverage before this pass (only the *service* layer, `hectorResearchService.js`, was tested) — added one test file per component (17 tests total).
- **Real bug found and fixed during Task 6's TDD pass, not assumed:** `HectorResearchDesk.tsx`'s tab switching uses `AnimatePresence mode="wait"` — in jsdom (Vitest), the exit/enter transition never completes on its own, so a synchronous `getByText` assertion right after a tab-switch click sees stale content indefinitely. Not a real product bug (confirmed by live-verifying tab switching in an actual Chromium browser via Playwright — works correctly there), but a real testing gotcha worth remembering for any future component using `AnimatePresence` + tab-switch patterns: use `findByText`/`waitFor`, not `getByText`, right after a click that changes an `AnimatePresence`-keyed child.
- **Live-verified** (Playwright, real dev server, real Ollama connection): New Research tab, Reports tab (empty state + populated with a real created draft), and the new synthesis-gap notice all render correctly with zero console errors.
- **Status:** CLOSED.

### 10. `BrandHeader.jsx` (Content Catalyst) is dead code — zero import sites anywhere

- **Where:** `src/features/content-catalyst/workspace/BrandHeader.jsx` — a fully-built, already-mostly-tokenized header component (brand name, job counts, Settings/Trends/Analytics toggle buttons).
- **How verified:** `grep -rn "BrandHeader" src/` (excluding the file's own definition) returns zero matches. `ContentCatalystWorkspace.jsx` (the real Content Studio shell) has its own separate inline `<header>` block instead and never imports this file.
- **Why not fixed as part of the Content Studio re-skin (`16-phase2-content-studio-spec.md` / `17-content-studio-implementation-plan.md`):** re-skinning dead code is wasted effort. Whether the right fix is wiring it in (replacing the shell's inline header), using it somewhere else entirely, or deleting it outright is a real product decision, not a styling call — left untouched and unrewired this pass.
- **Status:** OPEN, flagged for a future pass or explicit user decision.

### 11. `VoiceView.tsx` re-skin — small, contained, existing test coverage reused as the regression guard

- **What changed:** the Voice console page still carried the same cyan/violet gradient header pattern + hardcoded `emerald-*`/`amber-*`/`rose-*`/`zinc-*` classes found and fixed on Mission Control/Content Studio — moved onto `--accent`/`--success`/`--warning`/`--error`/`--text-*` tokens, gradient dropped in favor of a flat `--surface-1` + accent-border header (same pattern as Content Studio).
- **Unlike Hector/Content Catalyst's components, this one already had real test coverage** (`src/test/voiceView.test.jsx`, 7 tests) — no new tests needed; the existing suite served as the regression guard and stayed green throughout.
- **Live-verified** (Playwright, real dev server): renders correctly with real live status data (Python-not-detected, WebSocket-not-listening — genuine current state on this dev machine, not mocked), zero console errors.
- **Status:** CLOSED.

---

## CLOSED (stale finding, corrected after a later rebase)

### 2. ~~CLAUDE.md's Do-Not-Duplicate table claims `ApprovalGatePanel.tsx` was deleted — it's still live~~ — WAS TRUE AT THE TIME, NOW ACTUALLY FALSE

- **Original finding:** at the time this was written, this worktree's rebase point predated PR #225's `d3b265b` commit ("wire the real approval gate, remove dead Setup toggle and ApprovalGatePanel") actually merging into `origin/main`. Against that older commit, `ApprovalGatePanel.tsx` genuinely still existed and was imported in `ProjectExecutionMode.tsx` — the finding was real and correctly verified *against the code available at the time*.
- **Re-verified after a later rebase onto current `origin/main`:** `src/components/agentWorkshop/ApprovalGatePanel.tsx` no longer exists on disk, and `grep -rn "ApprovalGatePanel" src/` returns zero matches anywhere. CLAUDE.md's "deleted" claim is now genuinely correct — PR #225 actually did remove it, just not yet as of this file's original writing.
- **Lesson, not just a correction:** this is exactly the risk of a long session against a shared, actively-moving `main` — a real, correctly-verified finding can go stale within the same session if not re-checked after rebasing. Caught here by re-verifying after noticing a commit message (`d3b265b`) that directly contradicted the original finding, not by routine habit — worth being more deliberate about re-checking bug-log entries after every rebase going forward, not just trusting them once verified.
- **Status:** CLOSED — the underlying duplication this bug was about no longer exists; Phase 2's Project Execution Mode redesign only has the new real Approval tab to design around now, not two competing panels.

### 3. Heads-up for Phase 2's Research room design: Hector's pipeline doesn't synthesize (real, confirmed, not yet fixed)

- **Where:** `docs/governance/DEFERRED_WORK.md`'s 2026-09-05 entry (found via `git show 48643ec`), verified directly against `hectorResearchService.js` and `ResearchReportPanel.tsx` in that same commit's description — not re-verified independently this session, but the finding traces to real, cited line numbers and code excerpts, not a vague claim.
- **What it says:** Hector's research pipeline fetches sources and truncates each one's snippet independently (220 chars, after an earlier 420-char Rust-side truncation) — it never combines, cross-references, or reasons over multiple sources into one write-up. The UI (`ResearchReportPanel.tsx`) reflects this directly: a flat list of source links + HTTP-status badges + independently-truncated bullet points, "10 tabs, not a research paper."
- **Why this matters for this redesign specifically:** Draft A's Research room mockups (this session) showed a "citation card" layout — a list of source/confidence rows — which matches Hector's *current* real output shape. If/when the synthesis fix described in that DEFERRED_WORK.md entry gets built (resume hint there: needs its own brainstorm → spec → plan, not started), the Research room will need a **synthesized report block** (a real narrative write-up) as the primary content, with the current per-source list demoted to supporting citations underneath — a real layout change, not just new copy.
- **Status:** OPEN (the underlying gap — Hector still doesn't synthesize), but the UI is no longer silently misleading about it. `14-phase2-hector-research-desk-spec.md` / `15-hector-research-desk-implementation-plan.md` added a small, clearly-labeled notice directly in `ResearchReportPanel.tsx` ("Per-source findings below — Hector doesn't yet combine these into one written report."), live-verified rendering correctly against a real Ollama-connected run. This is a UI-honesty mitigation, not a fix — the real synthesis work described above is still not started.

---

### 4. `RightPanel.tsx`'s Sentinel "Threat Level" badge always shows clean — it never actually scans anything

- **Where:** `src/components/RightPanel.tsx:162-164`, `runQuickScan()` calls `scanForThreats('', {})` — empty command text, empty prior outputs — every time it fires (once on mount, then every 10 minutes via `setInterval`).
- **What's broken:** `sentinelSecurityService.ts`'s `scanForThreats(commandText, priorOutputs)` builds `allText` by concatenating `commandText` and `priorOutputs`' summaries, then tests each of 8 threat regexes against `allText`. Verified directly: with `commandText=''` and `priorOutputs={}`, `allText` is always the empty string, no regex in `THREAT_PATTERNS` can match an empty string, and there are no `priorOutputs` entries to check for failed agents either. `findings` is therefore always `[]` and `riskScore` is always `0` — structurally guaranteed, not just "usually."
- **Impact:** the "Security → Threat Level: clean" badge users see in `RightPanel.tsx` is not a real live security check — it will say "clean" regardless of what's actually happening in the app, because it's scanning nothing. Sentinel's actual design purpose — scanning a *specific proposed command* before execution — appears to have no real caller that feeds it real command text for this dashboard-level "quick scan" use case; `runQuickScan` looks like an incomplete wiring rather than an intentional no-op.
- **How verified:** read `RightPanel.tsx`'s real call site and `sentinelSecurityService.ts`'s real matching logic directly, not assumed from a UI screenshot description.
- **Impact on this redesign:** directly caused the Mission Control attention-aggregator (`08-phase2-attention-aggregator-plan.md`) to drop Sentinel from its list of real sources — there is currently no real Sentinel finding to surface, so building a source around it would just be another always-empty pathway, not a fix.
- **Status:** OPEN, not fixed — out of scope for this redesign to fix (it's a pre-existing Sentinel/RightPanel bug, not a UI-redesign task). Flagging for whoever maintains Sentinel next; a real fix needs `runQuickScan` to either scan something real (recent command history? recent agent outputs?) or for the feature's actual intent here to be reconsidered.

### 5. Coach interventions have 3 unreconciled signal representations, none with a durable "resolved" concept

- **Where:** traced live during Phase 2 planning across `src/contexts/CoachContext.jsx`, `src/services/coachEngineService.ts`, `src/services/coachHistoryService.ts`, and `src/services/coachInterventionService.ts`.
- **What's broken (three distinct, non-interchangeable representations of "a coach thing fired"):**
  1. **Local detector state:** `CoachContext.jsx`'s `runDetectors()` calls `runCoachDetectors(style)` (from `coachEngineService.ts`) every 2 minutes. When it returns a signal, this component builds a `coachIntervention` object **directly in React state** — this never touches `coachInterventionService.ts` at all.
  2. **`coachHistoryService.ts`'s log:** `coachEngineService.ts` also calls `recordCoachHistory(signal)` for the same fired signal, appending it to a capped 50-entry durable ring buffer (`getCoachHistory()`). This is a full historical record, but has **no field or mechanism marking an entry as resolved/dismissed** — `clearCoachHistory()` only wipes everything at once.
  3. **`coachInterventionService.ts`'s engine-event store:** a *separate* pathway (`pushCoachEngineEvent`/`subscribeCoachEngine`/`getLatestCoachEngineIntervention()`) exists for what looks like an external/websocket coach-engine event stream — confirmed via `COACH_ENGINE_EVENT`/`window.addEventListener('storage', ...)` — and is populated independently of the local 2-minute detector path. `getLatestCoachEngineIntervention()` would not reflect local-detector-sourced interventions at all.
- **The real gap:** when a user dismisses the live `coachIntervention` via the hard-interrupt overlay (`handleCoachInterventionAction` → `setCoachIntervention(null)`), that dismissal is **only ever reflected in transient React state** — it is never written back to `coachHistoryService`'s log or `coachInterventionService`'s event store. Neither of those two durable stores has any way to distinguish "still needs attention" from "already handled hours ago."
- **How verified:** read all 4 files' real code directly, traced the actual call chain (`runDetectors` → `runCoachDetectors` → `setCoachIntervention` + `recordCoachHistory`), not assumed from any single file in isolation.
- **Impact on this redesign:** Coach was dropped as a source from the Mission Control attention-aggregator (`08-phase2-attention-aggregator-plan.md`) for this reason — pulling from either durable store risks resurfacing an intervention the user already handled via the overlay, with no way to tell.
- **Status:** OPEN, not fixed — this is real, pre-existing architectural debt in the Coach subsystem (three parallel signal paths that were each built for a different purpose and never reconciled), not something to patch as a side effect of a Mission Control page task. A real fix needs a single durable "coach signal + resolved state" model that all 3 current paths write to and read from — genuine standalone work, flagged here for whoever picks up Coach next.

### 6. Two separate keyboard-shortcuts-help implementations, one of them not even reusing the shared component

- **Where:** `App.tsx` (real, global) renders the shared `KeyboardShortcutsModal.tsx` component, triggered via its own `showKeyboardShortcuts` state. `ChatView.tsx:301,1614` has its own, completely separate `showShortcutHelp` state and a **hand-rolled inline JSX modal** (not an import of `KeyboardShortcutsModal.tsx` at all) for the exact same feature.
- **Also found in the same investigation:** the entire `useKeyboardShortcuts` hook is only ever called once in the whole app, inside `ChatView.tsx` (`new_chat`/`focus_input`/`abort_generation`/`toggle_search`/`show_shortcuts`), meaning every one of those keyboard shortcuts — not just search — only works while the Chat tab is actually mounted. `App.tsx` never calls `useKeyboardShortcuts` itself.
- **How found:** while tracing whether the new Sidebar redesign's search field could trigger `Ctrl+P`'s memory search from any page — discovered it currently can't, since the whole mechanism lives inside one conditionally-rendered component.
- **Impact on this redesign:** the Sidebar/Mission Control plans lift `toggle_search` specifically (and only that binding) out of `ChatView.tsx` into `App.tsx`, so the new sidebar's search field works globally. `show_shortcuts` and its duplicate modal are deliberately left untouched — fixing that duplication is a separate, real cleanup task, not bundled into this redesign work.
- **Status:** OPEN (the `show_shortcuts` duplication specifically) — flagging for a future pass; not blocking or related to the Sidebar/Mission Control work currently in progress.

---

## Notes on discovery method

Bugs logged here were found through direct verification (grep + read the actual code), never assumed from documentation. If CLAUDE.md's Do-Not-Duplicate table describes a feature as working and this document contradicts it, trust this document's direct-verification note, and re-check CLAUDE.md's claim before relying on it further.
