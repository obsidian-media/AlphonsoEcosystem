# UI Redesign — Bug / Issue Log

Living document. Append findings as they're discovered during Phase 0 discovery and later phases. Each entry: what, where, how verified, status.

---

## CLOSED

### 1. "Agent Performance" sidebar nav item is a dead link — renders nothing

- **Where:** `src/components/Sidebar.tsx:95` registers `{ id: 'agent_performance', icon: Activity, label: 'Agent Performance' }` under the "Agents" nav group.
- **What's broken:** `src/App.tsx` had zero `activeTab === 'agent_performance'` render branch anywhere. Also found, while fixing: a genuinely dead, unused **static** import of `AgentPerformanceView` already sitting at the top of `App.tsx` (line 15) — imported but never rendered by anyone, pre-existing before this fix, and it started conflicting with the correct lazy-loaded version once one was added (`tsc --noEmit` caught this, not the plan's own test steps).
- **Fix:** wired a real `activeTab === 'agent_performance'` branch using the file's established lazy-loading convention, and removed the stale static import. See `06-phase1-implementation-plan.md` Task 1 and its follow-up fix commit.
- **Status:** CLOSED — fixed, tested (`src/test/appAgentPerformanceNav.test.js`), verified with a clean full-project `tsc --noEmit` and `npm run test` pass, committed to `ui-redesign/phase0-discovery`.

---

## OPEN

### 2. CLAUDE.md's Do-Not-Duplicate table claims `ApprovalGatePanel.tsx` was deleted — it's still live

- **Where:** CLAUDE.md's "Project Execution Mode / Agent Workshop subsystem" row states the approval gate design "supersed[ed]... the deleted `agentWorkshop/ApprovalGatePanel.tsx` read-only card (both removed)."
- **What's actually true:** `src/components/agentWorkshop/ApprovalGatePanel.tsx` still exists on disk, was never deleted in git history (`git log --diff-filter=D` on that path returns nothing), and is **actively imported and rendered** — `src/components/projectExecution/ProjectExecutionMode.tsx:21,383` (`<Card label="Approval Gates"><ApprovalGatePanel gates={...} /></Card>`) and referenced in `EcosystemHub.tsx` too.
- **How found:** while updating `02-pages-inventory.md` note #4 for the real PR #225 approval gate (see below) — almost repeated CLAUDE.md's "deleted" claim verbatim, caught it by verifying against the actual filesystem/git history/grep first instead of trusting the doc.
- **Impact for Phase 2:** whoever redesigns Project Execution Mode's page needs to actually resolve which approval UI survives — the new real Approval tab (per PR #225, wraps `approvalService.js`'s real `approveRequest`/`rejectRequest`) or this still-live old panel — not assume the old one is already gone, since it isn't.
- **Status:** OPEN. This is a CLAUDE.md doc-drift bug, not a UI-redesign-specific one — worth surfacing to whoever maintains that file next, in addition to Phase 2 needing to resolve the actual duplication.

### 3. Heads-up for Phase 2's Research room design: Hector's pipeline doesn't synthesize (real, confirmed, not yet fixed)

- **Where:** `docs/governance/DEFERRED_WORK.md`'s 2026-09-05 entry (found via `git show 48643ec`), verified directly against `hectorResearchService.js` and `ResearchReportPanel.tsx` in that same commit's description — not re-verified independently this session, but the finding traces to real, cited line numbers and code excerpts, not a vague claim.
- **What it says:** Hector's research pipeline fetches sources and truncates each one's snippet independently (220 chars, after an earlier 420-char Rust-side truncation) — it never combines, cross-references, or reasons over multiple sources into one write-up. The UI (`ResearchReportPanel.tsx`) reflects this directly: a flat list of source links + HTTP-status badges + independently-truncated bullet points, "10 tabs, not a research paper."
- **Why this matters for this redesign specifically:** Draft A's Research room mockups (this session) showed a "citation card" layout — a list of source/confidence rows — which matches Hector's *current* real output shape. If/when the synthesis fix described in that DEFERRED_WORK.md entry gets built (resume hint there: needs its own brainstorm → spec → plan, not started), the Research room will need a **synthesized report block** (a real narrative write-up) as the primary content, with the current per-source list demoted to supporting citations underneath — a real layout change, not just new copy.
- **Status:** OPEN, tracked upstream in `docs/governance/DEFERRED_WORK.md`, not this redesign's job to fix — but Phase 2's Research page design should account for it rather than design tightly around the current (about-to-change) shape.

---

## Notes on discovery method

Bugs logged here were found through direct verification (grep + read the actual code), never assumed from documentation. If CLAUDE.md's Do-Not-Duplicate table describes a feature as working and this document contradicts it, trust this document's direct-verification note, and re-check CLAUDE.md's claim before relying on it further.
