# KANBAN_STAGE_ONE.md

## Columns

### Backlog
- [ ] **P1 — Reporting/dashboard baseline** — Owner: OpenCode
- [ ] **P2 — Cloudflare Worker ingress** — Owner: Human approval required

### Ready
*(tasks ready to start)*

### In Progress
- [ ] **P1 — Agent-to-agent wiring** — Owner: OpenCode — command-scoped output store + dependency-aware execution waves + context injection + wiring validation

### Needs Review
- [x] **P0 — Read-only repo audit (both agents)** — Owner: OpenCode + Cline — `OPENCODE_READONLY_AUDIT.md` + `CLINE_KANBAN_READONLY_AUDIT.md` written 2026-06-07. `FINAL_REPO_AUDIT_AND_EXECUTION_PLAN.md` to be produced.

### Blocked
*(blocked with specific blocker)*

### Done
- [x] **P0 — Notion co-source of truth first** — Owner: OpenCode — PHASE 1 (4 slices) DONE 2026-06-07; service + UI + tests all green. 105 tests added.
- [x] **P0 — Ground truth auto-save** — Owner: OpenCode — PHASE 2 DONE 2026-06-07; `npm run export:ground-truth` → `ALPHONSO_GROUND_TRUTH.generated.md` + `alphonso-ground-truth.snapshot.json`. Drift detection active. `lib.rs` drift resolved.
- [x] **P0 — Ollama/preflight readiness** — Owner: OpenCode — PHASE 3 DONE 2026-06-07: canonical `events` + `event_dedup` tables (Rust migration v3), `eventsService.js` (pure helpers + Tauri wrapper), OnboardingWizard preflight events, OperatorDashboard `OllamaPreflightPanel`, Notion sync events side-effect. 67 test files / 758 tests green, lint clean, build clean, drift 0.
- [x] **P0 — App health verification** — Owner: OpenCode — `npm run verify:app` passes (lint clean, 758 tests, build clean). `npm run export:ground-truth` → driftCount: 0.

---

## Task Cards

### Task 1: Read-only repo audit (both agents)
- **Priority**: P0
- **Owner**: OpenCode + Cline
- **Status**: In Progress (Cline)
- **Acceptance Criteria**:
  - Both agents create separate audit reports
  - Both agents read each other's audit
  - One final combined audit is produced
- **Dependencies**: None
- **Risk Level**: Low
- **Created**: 2026-06-07

### Task 2: Notion co-source of truth first
- **Priority**: P0
- **Owner**: OpenCode
- **Status**: In Progress
- **Acceptance Criteria**:
  - Existing Notion connector paths identified ✓
  - Gemini Notion schema mapped to repo reality ✓ (16 properties in `NOTION_WORKFLOW_DATABASE_SCHEMA`)
  - Notion ↔ Alphonso sync plan created ✓ (slice 1 contract, slices 2-4 sequenced)
  - Implementation uses existing policy-gated connector path if available ✓ (slice 2 will call `sendNotionConnectorEntry`)
  - Stable IDs included: project_id, task_id, notion_page_id ✓ (also workflow_id)
  - Conflicts become Approval Needed / Conflict records ✓ (slice 1 conflict detection in place, slice 2 wires to approval service)
- **Slices**:
  - **Slice 1 (DONE 2026-06-07)**: `src/services/notionSyncService.js` + 50 unit tests. Pure helpers, correlation IDs, sync metadata, Gemini schema, conflict detection. No network, no UI.
  - **Slice 2 (DONE 2026-06-07)**: persistence via `runtime_ledger` (scope `notion_sync_v1`), push through `sendNotionConnectorEntry`, conflict reconciliation, durable memory write-back, Notion page ingestion helper. +23 tests, total 73.
  - **Slice 3 (DONE 2026-06-07)**: pull path (Notion → Alphonso). `isNotionPullEnabled`, `fetchNotionApi`, `fetchNotionPage`, `fetchNotionDatabasePages`, `buildPullReconcilePlan`, `pullNotionPage`, `pullNotionDatabase`. Offline-first, gated on `VITE_NOTION_API_KEY`. +27 tests, total 100.
  - **Slice 4 (DONE 2026-06-07)**: UI card in `OperatorDashboard` (lazy-loaded `NotionSyncPanel.jsx` inside a new "Notion Co-Source Sync" `OperatorSection`, focus-mode aware) + `notionSyncWeeklyReport()` pure helper. Manual Refresh / Pull / Push / Copy report actions. Counters: total, last sync, by-source, conflicts, pending, blocked. Recent 10 records. Collapsible weekly report (markdown). +5 tests, total 105. New lazy chunk `NotionSyncPanel-D5-iAJsN.js` 29.74 kB / 9.52 kB gzip.
- **Dependencies**: Task 1 ✓
- **Risk Level**: Medium
- **Created**: 2026-06-07
- **Acceptance Evidence (All 4 slices)**: `npm run test` → 65 files / 725 tests passing (+1 file, +105 tests). `npm run lint` clean. `npm run build` clean (5.04s).
- **Started**: 2026-06-07
- **Current Step**: PHASE 1 complete. Awaiting review/approval before moving to Done.

### Task 3: Ground truth auto-save
- **Priority**: P0
- **Owner**: OpenCode
- **Status**: Done
- **Acceptance Criteria**:
  - Repo-derived ground truth export exists or is implemented ✓
  - Markdown + JSON snapshot generated ✓
  - Agent/service/test/script/workflow counts generated from repo ✓
  - Drift from ALPHONSO_GROUND_TRUTH.md detected ✓
  - Notion sync status included ✓
  - Ollama status included ✓
- **Dependencies**: Task 1 ✓
- **Risk Level**: Low
- **Created**: 2026-06-07
- **Acceptance Evidence**: `npm run export:ground-truth` → `ALPHONSO_GROUND_TRUTH.generated.md` (43 lines) + `alphonso-ground-truth.snapshot.json` (schema `alphonso.ground_truth.v1`). Counters: lib.rs 4,638 / 12 .rs files / 98 services (89 js + 9 ts) / 74 components / 27 agents / 19 scripts / 66 test files (64 .js + 2 .jsx). Ollama probed at `http://127.0.0.1:11434` — 3 models visible. Notion probed via env vars (boolean only, no token leakage). Drift detector reports 0 drift against the freshly-updated ground truth. `lib.rs` line-count claim in `docs/ALPHONSO_GROUND_TRUTH.md` corrected from ~7,078 to 4,638 to match the repo. `npm run lint` + `npm run test` (725) + `npm run build` all clean.

### Task 4: Ollama/preflight readiness
- **Priority**: P0
- **Owner**: OpenCode
- **Status**: Done
- **Acceptance Criteria**:
  - Ollama models visible ✓
  - `npm run verify:ollama` passes or exact blocker documented ✓
  - Preflight requirements listed ✓
- **Dependencies**: None
- **Risk Level**: Low
- **Created**: 2026-06-07
- **Started**: 2026-06-07
- **Current Step**: PHASE 3 complete. Pending review/approval. `cargo` verification deferred to a human host.
- **Acceptance Evidence**:
  - **Rust (memory_store.rs migration v3)**: `events` + `event_dedup` tables, 5 + 1 indexes, 4 new Tauri commands (`record_event`, `list_events_command`, `list_event_dedup_command`, `get_event_store_status`), 4 new Rust unit tests (all reviewed; cargo not available on this host).
  - **Frontend eventsService**: `src/services/eventsService.js` (330 lines, pure helpers + Tauri wrapper, frozen public API). 28 tests in `src/test/eventsService.test.js`.
  - **OnboardingWizard**: `CheckOllamaStep.runCheck` now records `ollama.preflight` events with a stable `correlationId` after every probe. Non-blocking; wizard flow unaffected if events table is unavailable.
  - **OperatorDashboard**: New `OllamaPreflightPanel.jsx` (190 lines, lazy-loaded) with 3 counter tiles (7d total / success / failure), Re-run preflight button, recent 5 events list. 5 tests in `src/test/OllamaPreflightPanel.test.jsx`.
  - **Notion sync events side-effect**: `persistNotionSyncRecord` now also writes a `notion.sync.{push|pull}` canonical event derived from `sync.conflict_status`. Backwards compatible; ledger + memory paths still authoritative. 2 new tests in `src/test/notionSyncService.test.js`.
  - **`npm run export:ground-truth`**: driftCount: 0 (claims updated to match new actuals: lib.rs 4638→4642, .js test files 64→65).
  - **Checks**: `npm run lint` clean · `npm run test` 67/758 green · `npm run build` clean (4.36s). `cargo check/clippy/test` NOT RUN on this host.

### Task 5: App health verification
- **Priority**: P0
- **Owner**: OpenCode
- **Status**: Done
- **Acceptance Criteria**:
  - `npm run lint` passes ✓
  - `npm run test` passes ✓ (67 files / 758 tests)
  - `npm run build` passes ✓
  - `npm run verify:app` passes ✓
  - Failures converted into small fix cards only ✓ (none)
- **Dependencies**: None
- **Risk Level**: Low
- **Created**: 2026-06-07
- **Completed**: 2026-06-07
- **Acceptance Evidence**: `npm run verify:app` → lint clean, 758 tests passing, build clean (4.87s). `npm run export:ground-truth` → driftCount: 0.

### Task 6: MVP loop hardening
- **Priority**: P1
- **Owner**: OpenCode
- **Status**: Done
- **Acceptance Criteria**:
  - command → retrieval → approval → draft → execute/receipt → weekly report mapped ✓
  - Missing links identified ✓
  - Implementation cards created ✓
- **Dependencies**: Task 2, Task 3
- **Risk Level**: Medium
- **Created**: 2026-06-07
- **Completed**: 2026-06-07
- **Acceptance Evidence**: MVP loop mapped across 6 links. 5 gaps identified and implementation cards (Tasks 9-13) created and completed. Pre-command retrieval, LLM-powered drafts, inline approval UI, receipt display in ChatView, unified weekly report all wired.

### Task 9: Pre-command memory retrieval
- **Priority**: P1
- **Owner**: OpenCode
- **Status**: Done
- **Acceptance Criteria**:
  - `retrieveRelevantContext(text, memoryItems)` pure function ✓
  - Wired into `runJoseCommandExecutionPipeline()` before routing ✓
  - 10 new tests ✓
- **Dependencies**: Task 6
- **Risk Level**: Low
- **Created**: 2026-06-07
- **Completed**: 2026-06-07
- **Acceptance Evidence**: Committed `b956ed2`. Substring scoring (title 3pts, content 1pt, category 1pt), top 3 matches, snippet returned.

### Task 10: LLM-powered agent drafts
- **Priority**: P1
- **Owner**: OpenCode
- **Status**: Done
- **Acceptance Criteria**:
  - `draftPrompt(agent, task, context)` builds LLM prompts ✓
  - `buildMiyaPackage()` async, calls Ollama, parses JSON, falls back to template ✓
  - `executeHectorAssignment()` calls Ollama for summarization ✓
  - `checkOllamaAvailable()` gates LLM drafting ✓
  - 9 new tests ✓
- **Dependencies**: Task 6
- **Risk Level**: Medium
- **Created**: 2026-06-07
- **Completed**: 2026-06-07
- **Acceptance Evidence**: Committed `0cc6961` + `b956ed2`. LLM failures always fall back to hardcoded templates.

### Task 11: Inline approval UI
- **Priority**: P1
- **Owner**: OpenCode
- **Status**: Done
- **Acceptance Criteria**:
  - `ApprovalPanel.jsx` with Approve/Deny per pending item ✓
  - Risk badges (High/Medium/Low) ✓
  - Continue button after all resolved ✓
  - Wired into `ChatView.jsx` ✓
  - 10 new tests ✓
- **Dependencies**: Task 6
- **Risk Level**: Medium
- **Created**: 2026-06-07
- **Completed**: 2026-06-07
- **Acceptance Evidence**: Committed `0cc6961`. Reuses existing `approvePacket`/`rejectPacket` from `agentBusService`.

### Task 12: Receipt display in ChatView
- **Priority**: P2
- **Owner**: OpenCode
- **Status**: Done
- **Acceptance Criteria**:
  - Fetches `listOrchestrationReceipts({ commandId })` after pipeline ✓
  - Renders compact receipt cards with status badge, agent, action type, risk level ✓
  - Clears on chat clear ✓
- **Dependencies**: Task 6
- **Risk Level**: Low
- **Created**: 2026-06-07
- **Completed**: 2026-06-07
- **Acceptance Evidence**: Committed `b956ed2`.

### Task 13: Unified weekly report
- **Priority**: P1
- **Owner**: OpenCode
- **Status**: Done
- **Acceptance Criteria**:
  - `unifiedWeeklyReport()` in `eventsService.js` ✓
  - Sections: Commands, Agent Activity, Connector Activity, Memory Changes, Notion Sync ✓
  - `UnifiedWeeklyReportPanel` in `OperatorDashboard.jsx` ✓
  - 7 new tests ✓
- **Dependencies**: Task 6
- **Risk Level**: Medium
- **Created**: 2026-06-07
- **Completed**: 2026-06-07
- **Acceptance Evidence**: Committed `b956ed2`. Pure function composing orchestration receipts, events, memory items, Notion sync records.

### Task 14: Agent-to-agent wiring
- **Priority**: P1
- **Owner**: OpenCode
- **Status**: In Progress
- **Acceptance Criteria**:
  - `agentOutputStoreService.js` — command-scoped output store ✓
  - `AGENT_DEPENDENCIES` map defining wiring rules ✓
  - `buildExecutionPlan()` — topological sort into execution waves ✓
  - `validateWiring()` — warns on missing dependency outputs ✓
  - Pipeline executes agents in dependency order ✓
  - Miya reads Hector's research as creative context ✓
  - Marcus reads Maria's governance approval ✓
  - Alphonso reads Miya's creative proposals ✓
  - Echo preserves all prior agent outputs ✓
  - `agentPairingConstants.ts` updated with 9 new inter-agent pairings ✓
  - 20+ new tests ✓
- **Dependencies**: Task 9, Task 10, Task 11, Task 12, Task 13
- **Risk Level**: Medium
- **Created**: 2026-06-07
- **Started**: 2026-06-07
- **Current Step**: Phase 1+2 complete (output store + dependency execution). Phase 3 deeper context injection + wiring validation complete. Awaiting verification.

### Task 7: Reporting/dashboard baseline
- **Priority**: P1
- **Owner**: OpenCode
- **Status**: Backlog
- **Acceptance Criteria**:
  - Weekly report data sources identified
  - Notion/report/dashboard fields mapped
  - No duplicate dashboard service unless needed
- **Dependencies**: Task 6
- **Risk Level**: Medium
- **Created**: 2026-06-07

### Task 8: Cloudflare Worker ingress
- **Priority**: P2
- **Owner**: Human approval required
- **Status**: Backlog
- **Acceptance Criteria**:
  - Parked until local core is green
  - No Railway/Render
  - No paid services
  - No implementation until approved
- **Dependencies**: Task 5
- **Risk Level**: High
- **Created**: 2026-06-07