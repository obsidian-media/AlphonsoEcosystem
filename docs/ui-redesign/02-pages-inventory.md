# Full Pages / Tabs / Cards Inventory + IA Structure Notes

Ground-truthed against the real `Sidebar.tsx` nav registry and `App.tsx`'s `activeTab` render switch (not assumed from docs). Cross-referenced with CLAUDE.md's Do-Not-Duplicate table for anything reachable outside the main sidebar. Per the locked decision earlier in this session, this covers both **what exists visually** and **structural/IA problems**, with proposed fixes flagged.

---

## A. Current top-level navigation (real, as of this session)

Sidebar groups pages into 4 sections:

### Home
| id | Label | Component |
|---|---|---|
| `chat` | Chat | `ChatView.tsx` |
| `mission` | Dashboard | `MissionControlHome.tsx` |

### Work
| id | Label | Component |
|---|---|---|
| `project_execution` | Projects | `ProjectExecutionMode.tsx` (simulated Agent Workshop subsystem) |
| `hector` | Research | Hector Research Desk (`dashboard/HectorResearchDesk.tsx`) |
| `content` | Content | Content Catalyst workspace |
| `automation` | Automation | `AutomationView.tsx` |

### Agents
| id | Label | Component | Status |
|---|---|---|---|
| `orchestrator` | Orchestrator | `OrchestratorView.tsx` (embeds `OrchestratorQueueView`) | live, has approval badge |
| `miya` | Creative | `MiyaStudio.tsx` | live |
| `mission_room` | Boardroom | `MissionRoom.tsx` / `BoardroomChatView.tsx` | live |
| `ecosystem` | All Agents | `EcosystemHub.tsx` | live |
| `agent_performance` | Agent Performance | *(none — see Bug Log #1)* | **BROKEN: dead nav link, renders blank** |

### System
| id | Label | Component |
|---|---|---|
| `runtimes` | Runtimes | `RuntimeManagerView.tsx` (also has its own internal Activity tab) |
| `voice` | Voice | `VoiceView.tsx` |
| `connectors` | Connectors | `ConnectorHealthPanel.tsx` / `ConnectorSetupPanel.tsx`, status dot |
| `operator` | Operator | `OperatorDashboard.tsx` |

### Reached outside the grouped sidebar list
| id | Label | Trigger | Component |
|---|---|---|---|
| `settings` | Settings | Gear/status button in `TopBar.tsx` (`onOpenSettings`) | `SettingsView.tsx` (huge — Connectors, Skill Packs, Agent Providers, Coach, Echo Timeline, Nova History, Logs, Plugins, Knowledge/Files all nested inside) |
| `files` | Files/Knowledge | Nested inside Settings' Knowledge section (`FilesView.tsx` rendered there per CLAUDE.md) — **sidebar item was explicitly removed 2026-06-25**, so `activeTab === 'files'` in `App.tsx` may now be effectively unreachable directly; needs live verification, not assumed | `FilesView.tsx` |
| `activity` | Activity | Triggered programmatically (`switchTab('activity')` from `WorkflowPanel`'s `onRunWorkflow`) — **no visible persistent nav entry**, only reachable as a side-effect of running a workflow | `AgentActivityLog.tsx` |

---

## B. Pages that exist in the codebase but are NOT in the top-level tab switch at all

These are real, built, working components with no `App.tsx activeTab` branch — reached via nested modals, embedded panels inside other views, or genuinely orphaned. Distinguishing "intentionally embedded elsewhere" from "actually orphaned" needs a page-by-page click-through in Phase 2, not guessed here.

| Component | Where it actually lives today |
|---|---|
| `AgentPairingView.tsx` | Reachable, but per CLAUDE.md's own 2026-09-02 note, "2+ clicks deep behind a generic tab label" — real discoverability problem, not fixed as of last verification |
| `CompanionPairingPanel.tsx` | Embedded inside `SettingsView.tsx` |
| `WorkspaceExportImportView.tsx` | Embedded inside `SettingsView.tsx` |
| `CrashLogView.tsx` | Embedded inside `SettingsView.tsx` (Logs tab) |
| `KeyboardShortcutsModal.tsx` | Modal, triggered by `Ctrl+?` |
| `MemorySearch.tsx` | Modal/overlay, triggered by `Ctrl+P` |
| `DigestPanel.tsx` | Slide-out panel, trigger point not confirmed this session |
| `GuidedTour.tsx` | First-run overlay, not a nav destination |
| `MarketingLandingPage.tsx` | Standalone, not part of the authenticated app shell |
| `SessionHistoryView.tsx` | Reachability not confirmed this session — needs a live check |
| `MemoryGraphViewer.tsx` | Compact mode in `SettingsView.tsx`, full mode via a `Modal` `size="full"` — reachable from both `SettingsView.tsx` and `RightPanel.tsx` |
| `NotionSyncPanel.tsx` | Reachability not confirmed this session |
| `WorkflowPanel.tsx` | Slide-out, triggered by `showWorkflowPanel` state — **this is a 4th thing sitting alongside the 3 workflow systems already flagged in the services doc, worth checking in Phase 2 whether it's actually the same feature as `AutomationView`'s Builder tab or a genuine 4th surface** |

`RightPanel.tsx` (System / Audit / Agents 3-tab sidebar panel, not a page) is always-present chrome, not part of this page list, but is a major surface in every layout decision going forward.

---

## C. Known naming collisions (do not conflate these while redesigning)

1. **"Boardroom" means two different things.** `mission_room` (sidebar label "Boardroom") → `BoardroomChatView.tsx`, the real multi-agent group chat. `BoardroomPanel.tsx` → a project-goal/task-batch tracker over `batchOrchestratorService.js`, unrelated to chat despite the name. A redesign that renames or restructures navigation must resolve this collision, not just reskin both pages with the same name still confusing.
2. **`AgentDock.tsx` exists twice** — `src/components/AgentDock.tsx` (floating, draggable, embedded in `RightPanel`'s Agents tab) vs. `src/components/agents/AgentDock.tsx` (static grid, used only by `ProjectExecutionMode.tsx`). Different components, same name, different import paths.
3. **`HectorResearchPanel.tsx`** (`components/research/`) is a separate, simpler component from the real `HectorResearchDesk.tsx` (`components/dashboard/`) — don't assume interchangeable.
4. **Two approval systems, two audit systems** — see the services doc's cross-cutting note. A page redesign that shows "pending approvals" must be honest about which system (`agentBusService` real vs. `approvalService.js` simulated) it's actually displaying.

---

## D. Known IA/discoverability problems (per CLAUDE.md's own tracked gaps, still open as of last verification, cross-checked against real code above)

- **Agent Pairing, Ecosystem Maturity panels, Operator Dashboard** — historically "2+ clicks deep" / "undiscoverable." Operator got a nav entry in a prior pass (confirmed: `operator` id IS in the current Sidebar list above), so that specific complaint is resolved. Agent Pairing's discoverability was NOT independently re-verified this session — flagged as needing a live check, not assumed fixed.
- **Coach Mode** feels "forgotten" — not because it's broken, but because it opens as a second OS window with no persistent visual signal in the main app that it's running (confirmed real: `coachModeService.ts` opens a literal separate `WebviewWindow`).
- **The Orchestrator page has real internal duplication** — its embedded `OrchestratorQueueView` and a separate hand-rolled Monitor-tab panel cover the same dead-letter-queue data on different refresh cadences (documented in CLAUDE.md, left alone per explicit prior user instruction — worth revisiting during this redesign since it's a legitimate structural problem, not just cosmetic).
- **NEW, found this session (Bug Log #1):** `agent_performance` sidebar nav is completely dead.

---

## E. Pages that arguably should exist but don't (gaps, not built anywhere)

- **A single unified "what needs my attention right now" view.** Right now, approvals live in `agentBusService`'s real flow, plus a *separate* simulated approval store in Project Execution Mode, plus Sentinel findings, plus Coach interventions in a separate window, plus connector health warnings — five different systems, each with a different notification surface, none unified. The Draft A nav design's "notification bell with approval badge" concept assumes a single source of truth for "things needing my attention" that does not currently exist as one aggregation point in the codebase. This is a real architectural gap worth flagging for Phase 1/2, not just a visual one.
- **An "agent detail" page/panel** — you can see an agent's avatar and status dot in various strips, but there's no single canonical "here's everything about Hector: recent activity, skill packs, contract permissions, current provider, performance stats" page. Several partial views exist (`AgentProfilePanel.tsx`, `AgentMetricsPanel.tsx`, `AgentCapabilityMatrix.tsx`) but they're scattered across the Project Execution Mode subsystem, not a general-purpose per-agent page reachable from anywhere.
- **A real onboarding/tour path back into Coach Mode or Agent Pairing** — `GuidedTour.tsx` exists but its actual step coverage wasn't verified this session.

---

## Open items for Phase 2 (not resolved here, flagged so they aren't silently dropped)

1. Live click-through verification of every "reachability not confirmed this session" row above.
2. A decision on the Boardroom naming collision (rename one of the two features).
3. A decision on whether `agent_performance`'s dead link should be fixed by wiring `AgentPerformanceView` in, or by removing the nav item (it may have been intentionally disabled and the nav entry left behind by mistake — needs the maintaining session's context, not guessed here).
4. A decision on the Orchestrator page's internal duplication.
