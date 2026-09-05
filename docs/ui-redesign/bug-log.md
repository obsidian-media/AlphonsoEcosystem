# UI Redesign — Bug / Issue Log

Living document. Append findings as they're discovered during Phase 0 discovery and later phases. Each entry: what, where, how verified, status.

---

## OPEN

### 1. "Agent Performance" sidebar nav item is a dead link — renders nothing

- **Where:** `src/components/Sidebar.tsx:95` registers `{ id: 'agent_performance', icon: Activity, label: 'Agent Performance' }` under the "Agents" nav group.
- **What's broken:** `src/App.tsx` has zero `activeTab === 'agent_performance'` render branch anywhere (confirmed via direct grep — zero matches for the string `agent_performance` in `App.tsx`). There is also no `else`/default fallback in the tab-switch block (checked lines ~876-935): if no `activeTab === X` condition matches, the entire main content area renders **nothing at all** — a blank pane, no error, no message.
- **Impact:** clicking "Agent Performance" in the sidebar silently shows a blank screen. `AgentPerformanceView.tsx` exists and is otherwise fully built (has its own test file, is described in CLAUDE.md's Do-Not-Duplicate table) — it's just never wired to this nav entry. Likely a regression from whenever `agent_performance` was added to the sidebar without the matching `App.tsx` branch, or the reverse (branch removed, nav item left behind).
- **How verified:** direct grep of both files, read the surrounding render block to rule out a default case. Not verified live in a running browser this session (no dev server up during discovery) — verify visually before fixing, but the missing branch alone is conclusive.
- **Status:** OPEN, not fixed. Flagging for the maintaining session or a dedicated bugfix pass — out of scope to silently fix mid-brainstorm without the user's go-ahead, since this is Phase 0 discovery, not implementation.

---

## Notes on discovery method

Bugs logged here were found through direct verification (grep + read the actual code), never assumed from documentation. If CLAUDE.md's Do-Not-Duplicate table describes a feature as working and this document contradicts it, trust this document's direct-verification note, and re-check CLAUDE.md's claim before relying on it further.
