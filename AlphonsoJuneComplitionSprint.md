# ALPHONSO JUNE COMPLETION SPRINT
**Version target:** v2.4.0
**Baseline:** v2.3.3 — 149 test files / 1983 tests / ~38% coverage
**Audit reference:** `ALPHONSOAUDIT25.06.2026.md`
**Ground truth:** `docs/ALPHONSO_GROUND_TRUTH.md` — read before doing anything

---

## BUILDER INSTRUCTIONS

Take ownership of this project end-to-end. Create subagents as needed, coordinate them, give each one a clear job, keep them focused, compare their answers, audit their answers, give them specialized skills as needed. Resolve disagreements and apply improvements and execute tasks as this plan defines directly. Verify the result and only stop for destructive, secret-related, paid, external-network, production, or irreversible actions. Keep going until the project is done or you hit a real blocker. Do not stop for small questions. Token-saving mode ON.

After each phase:
1. Assign a subagent to update ALL docs (GROUND_TRUTH, CLAUDE.md, CHANGELOG, README) to match the work done.
2. After docs are updated, commit all changes and push to that phase's branch.
3. Subagents should work in parallel wherever possible. If no parallel work can be performed, you execute directly — not a subagent.

**Branch strategy:** Each phase gets its own branch.
- Phase 1 → `phase1branch`
- Phase 2 → `phase2branch`
- Phase 3 → `phase3branch`
- Phase 4 → `phase4branch`
- Phase 5 → `phase5branch`
- Phase 6 → `phase6branch`

After ALL phases are complete, the Orchestrator (not the builder) will audit each branch and manage merge to main.

Make no mistakes — there is no time for rework. Verify each task before marking it done.

---

## PHASE 1 — SECURITY HARDENING
**Branch:** `phase1branch`
**Goal:** Eliminate all P0 and P1 security issues

### Tasks

**T1.01** — Add HMAC-SHA256 webhook signature verification to the WhatsApp Cloud gateway.
- File: `gateway/whatsapp-cloud/index.js` (or equivalent entry point)
- Verify every incoming POST against the `X-Hub-Signature-256` header using `WHATSAPP_APP_SECRET` env var
- Return 403 on mismatch; log the attempt
- Validation: send a spoofed webhook request → must receive 403

**T1.02** — Add request body size limit to the bridge server.
- File: `bridge/server.js`
- Add `express.json({ limit: '1mb' })` middleware
- Validation: send a 2MB body → must receive 413

**T1.03** — Add basic auth middleware to the MCP server.
- File: `mcp-server/server.js`
- Read `MCP_SECRET` from env; require `Authorization: Bearer <secret>` header on all tool call routes
- If `MCP_SECRET` is not set, log a warning and allow localhost-only connections
- Validation: call any MCP tool without auth → must receive 401

**T1.04** — Move connector credential storage from localStorage to Tauri's secure KV store.
- Files: all connector services that call `localStorage.setItem` with credential keys (search for `alphonso_connector_*` keys), `ConnectorSetupPanel.jsx`, `src/lib/durableStore.js`
- Replace `localStorage.setItem/getItem` credential calls with `durableGet/Set` backed by Tauri `kv_set`/`kv_get`
- Maintain backward compat: on first load, migrate existing localStorage credential keys to KV store then remove them
- Validation: set a credential, restart app, confirm it persists via KV, confirm localStorage no longer holds it

**T1.05** — Move plugin signing trusted signer keys from localStorage to KV store.
- File: `src/services/pluginSigningService.js`
- Same migration pattern as T1.04
- Validation: add a trusted signer, restart → signer persists; localStorage entry is gone

**T1.06** — Add a dead-letter queue size cap to orchestration queue.
- File: `src/services/orchestrationQueueService.js`
- Cap dead-letter array at 100 entries; evict oldest when exceeded
- Add a `getDeadLetterCount()` export for observability
- Validation: unit test — push 110 items to dead-letter, confirm length is capped at 100

**T1.07** — Add Tauri IPC rate limiting for expensive commands.
- File: `src-tauri/src/lib.rs`
- For commands that call external APIs (`telegram_send_message`, `whatsapp_send_message`, `youtube_upload_video`, `meta_publish_media`): add a per-command token bucket (max 10 calls/min) using a `HashMap<String, (u32, Instant)>` in a `Mutex`-wrapped state
- Return an error string `"rate_limited"` when exceeded
- Validation: call one of the rate-limited commands 12 times in a loop → calls 11 and 12 must fail with `rate_limited`

**T1.08** — Verify no credentials in git history.
- Run `git log --all --full-history -- '*.env'` and `git log -S "API_KEY" --oneline` and similar patterns
- If any credential is found in history, document it in a `SECURITY_REMEDIATION.md` file and use `git filter-repo` to remove it (stop and alert if this is needed — it is a destructive action)
- Validation: search comes back clean

**T1.09** — Add `policyEnforcementService` fail-closed path test.
- File: `src/test/policyEnforcementService.test.js` (create if not exists)
- Test: call `enforcePolicy` with missing credentials → result must have `blocked: true`
- Test: call with ambiguous action type → must block
- Test: call with valid credentials and low-risk action → must pass
- Minimum 8 test cases covering: missing creds, invalid connector, zero-cost mode, approval mode, allowlist bypass
- Validation: `npm run test` all pass

**T1.10** — Add `agentContractService` boundary violation tests.
- File: `src/test/agentContractService.test.ts` (create or extend)
- Test each of the 9 agents: attempt a blocked action → must return false
- Test each agent: attempt an allowed action → must return true
- Minimum 18 test cases (2 per agent)
- Validation: `npm run test` all pass

---

## PHASE 2 — TYPESCRIPT MIGRATION (COMPONENTS)
**Branch:** `phase2branch`
**Goal:** Migrate all 63 remaining `.jsx` components to `.tsx` with full prop interfaces

### Rules for every migration
- Read the existing `.jsx` file
- Define a `Props` interface for every prop the component receives
- Replace `React.FC` with explicit return type `JSX.Element` where appropriate
- Delete the old `.jsx` file after creating `.tsx`
- Run `npm run typecheck` — zero new errors allowed
- Run `npm run test` — all 1983+ tests must still pass

### Batch A — Core UI Components (parallel subagents)

**T2.01** — Migrate `src/components/ChatView.jsx` → `ChatView.tsx` (if not already `.tsx`)
**T2.02** — Migrate `src/components/ConnectorHealthPanel.jsx` → `ConnectorHealthPanel.tsx`
**T2.03** — Migrate `src/components/ConnectorSetupPanel.jsx` → `ConnectorSetupPanel.tsx`
**T2.04** — Migrate `src/components/ConnectorStatusIndicators.jsx` → `ConnectorStatusIndicators.tsx`
**T2.05** — Migrate `src/components/ApprovalModal.jsx` → `ApprovalModal.tsx`
**T2.06** — Migrate `src/components/OnboardingWizard.jsx` → `OnboardingWizard.tsx`
**T2.07** — Migrate `src/components/OllamaOfflineBanner.jsx` → `OllamaOfflineBanner.tsx`
**T2.08** — Migrate `src/components/BootStatusBanner.jsx` → `BootStatusBanner.tsx`
**T2.09** — Migrate `src/components/RuntimeManagerView.jsx` → `RuntimeManagerView.tsx`
**T2.10** — Migrate `src/components/WorkflowBuilderView.jsx` → `WorkflowBuilderView.tsx`

### Batch B — Agent & Activity Components (parallel subagents)

**T2.11** — Migrate `src/components/AgentActivityLog.jsx` → `AgentActivityLog.tsx`
**T2.12** — Migrate `src/components/AgentDock.jsx` → `AgentDock.tsx`
**T2.13** — Migrate `src/components/AgentPairingView.jsx` → `AgentPairingView.tsx`
**T2.14** — Migrate `src/components/BoardroomView.jsx` → `BoardroomView.tsx`
**T2.15** — Migrate `src/components/AutomationView.jsx` → `AutomationView.tsx`

### Batch C — Settings & Panels (parallel subagents)

**T2.16** — Migrate `src/components/SettingsView.jsx` → `SettingsView.tsx` (if not already `.tsx`)
**T2.17** — Migrate `src/components/WorkspaceExportImportView.jsx` → `WorkspaceExportImportView.tsx`
**T2.18** — Migrate `src/components/CrashLogView.jsx` → `CrashLogView.tsx`
**T2.19** — Migrate `src/components/NovaHistoryChart.jsx` → `NovaHistoryChart.tsx`
**T2.20** — Migrate `src/components/SentinelFindingModal.jsx` → `SentinelFindingModal.tsx`
**T2.21** — Migrate `src/components/WhatsAppInboxPanel.jsx` → `WhatsAppInboxPanel.tsx`
**T2.22** — Migrate `src/components/MeetingTranscriptionPanel.jsx` → `MeetingTranscriptionPanel.tsx`

### Batch D — All remaining `.jsx` components

**T2.23** — Glob `src/components/*.jsx` — list all remaining files not yet migrated and migrate them all to `.tsx`
- Each file: read → write typed `.tsx` → delete `.jsx` → verify typecheck passes
- Run in subagents where the components are independent (no shared import chains)
- After all migrations: `npm run typecheck` must report 0 errors; `npm run test` must pass

---

## PHASE 3 — TEST COVERAGE: 38% → 50%
**Branch:** `phase3branch`
**Goal:** Reach ≥50% measured coverage (`npm run test:coverage`)

### Rules
- Add tests to existing test files before creating new ones
- Every new test file must be in `src/test/`
- Tests must be Vitest; no Jest syntax
- No mocking of internal business logic — use real service calls where possible
- After all tasks: `npm run test:coverage` must show ≥50% overall

### Service Test Files (parallel subagents — each subagent owns one file)

**T3.01** — `src/test/orchestrationQueueService.test.js` — add tests for: enqueue, state transitions, dead-letter capping (T1.06), retry, manual interrupt. Target: 15 new tests.

**T3.02** — `src/test/orchestrationReceiptService.test.js` — add tests for: receipt creation per flow type, receipt retrieval, 100-entry cap. Target: 10 new tests.

**T3.03** — `src/test/unifiedMemoryService.test.js` — add tests for: namespace filters, eviction on quota, cross-namespace reads, migration from old services. Target: 12 new tests.

**T3.04** — `src/test/joseSchedulerService.test.js` — add tests for: schedule creation, cron validation (T2.08 fix), startScheduler/stopScheduler, SCHEDULE_PRESETS. Target: 10 new tests.

**T3.05** — `src/test/echoFileWatcherService.test.js` — add tests for: config save/load, debounce behavior, watcher start/stop. Target: 8 new tests.

**T3.06** — `src/test/mariaAuditService.test.js` — add tests for: risk assessment with deterministic fallback, high-risk block, low-risk pass, Ollama timeout path. Target: 10 new tests.

**T3.07** — `src/test/echoMemoryService.test.js` — add tests for: synthesis, retention classification, confidence normalization, Ollama fallback. Target: 10 new tests.

**T3.08** — `src/test/marcusExecutionService.test.js` — add tests for: governance gate, GitHub dispatch, Slack dispatch, blocked-on-critical path. Target: 10 new tests.

**T3.09** — `src/test/hectorResearchService.test.js` — add tests for: RSS fetch, parseRssItems, fetch retry on network error (T2.06 fix), Tavily fallback, Perplexity fallback. Target: 12 new tests.

**T3.10** — `src/test/novaAnalysisService.test.js` — add tests for: 4-dimension scoring, saveOpportunityScore, getOpportunityHistory 30-entry cap, Ollama fallback. Target: 10 new tests.

**T3.11** — `src/test/sentinelSecurityService.test.js` — add tests for: threat detection, secret detection, scheduled scan interval, quick scan, Ollama fallback. Target: 12 new tests.

**T3.12** — `src/test/pluginRegistryService.test.js` — add tests for: listPlugins, togglePlugin, validatePluginManifestDisk, executePluginToolRun (mocked sidecar). Target: 8 new tests.

**T3.13** — `src/test/pluginSigningService.test.js` — add tests for: keypair generation, signPluginManifest, verifyPluginSignature, verifyAndAddPlugin, trusted signer management. Target: 10 new tests.

**T3.14** — `src/test/workspaceExportService.test.js` — add tests for: exportWorkspace (all `alphonso_*` keys captured), importWorkspace (keys restored), round-trip integrity. Target: 8 new tests.

**T3.15** — `src/test/connectorRegistryService.test.js` — add tests for: policy gate is always called before external send, blocked connector returns error not undefined, audit entry created on send. Target: 10 new tests.

### Component Tests (parallel subagents)

**T3.16** — `src/test/components/NotificationCenter.test.tsx` — render, add notification, clear all, colored border per type. Target: 8 tests.

**T3.17** — `src/test/components/AgentPerformanceView.test.tsx` — render with mock receipts, success/error/latency display. Target: 6 tests.

**T3.18** — `src/test/components/OnboardingWizard.test.tsx` — step progression, Ollama check step, connector step, skip behavior. Target: 8 tests.

**T3.19** — `src/test/components/WorkflowBuilderView.test.tsx` — render, add node, reorder, save. Target: 6 tests.

**T3.20** — `src/test/components/SentinelFindingModal.test.tsx` — render, severity badge, close behavior. Target: 5 tests.

**T3.21** — Verify total: run `npm run test:coverage` — confirm ≥50% overall coverage. If not reached, identify the lowest-coverage services and add targeted tests until threshold is met.

---

## PHASE 4 — OBSERVABILITY & RELIABILITY
**Branch:** `phase4branch`
**Goal:** Eliminate all P1 reliability issues; add critical observability

### Tasks

**T4.01** — Add Voice OS sidecar health-check watchdog.
- File: `src/services/voiceOsService.js`
- After `startVoiceServer()` succeeds, start a `setInterval` every 30 seconds that calls `getVoiceServerStatus()`
- If status returns `stopped` or throws, emit a `CustomEvent('alphonso:toast', { detail: { type: 'error', message: 'Voice OS offline — restarting...' } })` and call `startVoiceServer()` once
- Export `stopVoiceWatchdog()` to clean up on app unmount
- Validation: unit test — mock `getVoiceServerStatus` to return `stopped` → confirm restart is called

**T4.02** — Capture Voice OS stdout/stderr in production.
- File: `src-tauri/src/voice_sidecar.rs`
- Pipe sidecar stdout and stderr to Tauri's `tracing::info!` and `tracing::error!` macros
- Validation: `cargo check` passes; start sidecar in dev mode, confirm logs appear in Tauri console

**T4.03** — Add `unifiedMemoryService` namespace eviction.
- File: `src/services/unifiedMemoryService.js`
- Each namespace has a configurable max size (default 500 entries); on insert when full, evict the oldest entry by timestamp
- Validation: unit test — fill a namespace to 501 entries, confirm length stays at 500

**T4.04** — Add retry + exponential backoff to `hectorResearchService` RSS fetch.
- File: `src/services/hectorResearchService.js`
- Wrap each `fetch(rssUrl)` call in a retry helper: 3 attempts, 500ms / 1000ms / 2000ms delays
- Log each retry attempt via `crashLogService.logError`
- Validation: mock `fetch` to fail twice then succeed → confirm 3 calls were made, result is returned

**T4.05** — Add cron expression validation to `joseSchedulerService`.
- File: `src/services/joseSchedulerService.js`
- Before storing a schedule, validate the cron expression using a lightweight validator (implement a simple regex or use the existing `cron-parser` if already in `package.json`; do not add new deps without checking first)
- Return `{ valid: false, error: 'Invalid cron expression' }` on failure
- Validation: unit test — invalid cron string → returns error; valid cron → returns success

**T4.06** — Add `chromaDbService` write error surface.
- File: `src/services/chromaDbService.js`
- Wrap `addMemoryToChroma` in try/catch; on error, call `crashLogService.logError` with context
- Add `getChromaWriteErrors()` export that returns last 10 write errors from an in-memory ring buffer
- Validation: mock Chroma to throw → confirm error is logged and retrievable

**T4.07** — Add n8n connector request timeout.
- File: `src/services/connectors/n8nConnector.js`
- `triggerN8nWebhook`: add `AbortController` with 15-second timeout
- `listN8nWorkflows`: 10-second timeout
- Validation: mock `fetch` to never resolve → confirm `AbortError` is caught and returned as error result

**T4.08** — Add bundle size budget check to CI.
- File: `.github/workflows/ci.yml`
- After `npm run build`, add a step that checks `dist/` total size
- Fail CI if total JS bundle exceeds 5MB (gzipped check optional)
- Use `du -sh dist/assets/*.js` and sum — fail if any single chunk exceeds 2MB
- Validation: CI runs, step is visible in workflow log

**T4.09** — Add Tauri updater manifest verification step to release CI.
- File: `.github/workflows/release.yml`
- After signing, add a step that downloads the generated manifest and verifies the `signature` field is non-empty and the `url` field points to the expected release asset
- Fail the release if either check fails
- Validation: dry-run the release workflow with a test tag

**T4.10** — Add `DeadLetterQueueView` export to `AgentPerformanceView` or new view.
- File: `src/components/AgentPerformanceView.tsx` (after Phase 2 migration)
- Add a "Dead Letter Queue" section showing: count, oldest entry timestamp, "Retry All" button that calls `retryDeadLetter()`
- Validation: render with mock dead-letter entries → count shown; Retry All button calls service

**T4.11** — Add voice sidecar watchdog test.
- File: `src/test/voiceOsService.test.js`
- Test watchdog start/stop, restart-on-failure behavior
- Target: 6 tests

**T4.12** — Add `isChromaHealthy` to health dashboard in RuntimeManagerView.
- File: `src/components/RuntimeManagerView.tsx` (after Phase 2 migration)
- Add ChromaDB as a tool entry in the Runtime Hub tool list with status dot from `isChromaHealthy()`
- Validation: renders without error; status dot reflects mock health response

---

## PHASE 5 — AGENT CAPABILITIES & BOARDROOM
**Branch:** `phase5branch`
**Goal:** Elevate agent intelligence and multi-agent coordination

### Tasks

**T5.01** — Implement Boardroom multi-agent session logic.
- File: `src/components/BoardroomView.tsx` (after Phase 2 migration)
- The Boardroom currently exists in the sidebar but has no real session. Implement:
  - A session model: `{ sessionId, participants: AgentId[], topic: string, messages: BoardroomMessage[], status: 'active' | 'concluded' }`
  - UI: topic input, participant selector (checkbox for each of 9 agents), "Convene Session" button
  - On convene: route the topic through Jose (`joseCommandRouterService`) with `boardroom: true` flag; display each agent's response in a timeline
  - "Conclude" button: summarize via Echo, save session to `unifiedMemoryService` under `boardroom` namespace
- Validation: convene a session with 3 agents on a test topic → all 3 respond; session is saved to memory

**T5.02** — Add `Nova` proactive opportunity scan to the daily scheduler.
- File: `src/services/joseSchedulerService.js`, `src/services/novaAnalysisService.js`
- Add a `SCHEDULE_PRESETS` entry: `nova_daily_scan` — runs every day at 09:00, calls `analyzeOpportunity` with current workspace context from `unifiedMemoryService`
- Store result via `saveOpportunityScore`
- Show a toast if score > 75: "Nova found a high-value opportunity — check the Nova panel"
- Validation: manually trigger the preset → opportunity score saved; if > 75, toast fires

**T5.03** — Add `Sentinel` threat summary to the daily scheduler.
- File: `src/services/joseSchedulerService.js`, `src/services/sentinelSecurityService.js`
- Add preset: `sentinel_daily_summary` — runs every day at 08:00, calls `runQuickScan`, formats a summary
- Dispatch summary via `appendAgentActivity` for Sentinel
- Validation: trigger preset → activity log shows Sentinel entry with scan summary

**T5.04** — Add `Echo` memory consolidation job to the daily scheduler.
- File: `src/services/joseSchedulerService.js`, `src/services/echoMemoryService.js`
- Add preset: `echo_nightly_consolidation` — runs every day at 02:00, synthesizes memories older than 7 days in `unifiedMemoryService`, archives low-confidence entries
- Validation: trigger preset → memory count reduces or retention tier changes for old entries

**T5.05** — Wire `Maria` risk score into the Boardroom session conclusion.
- File: `src/components/BoardroomView.tsx`, `src/services/mariaAuditService.js`
- After Boardroom session concludes, call `mariaAuditService` on the session outcome
- Display the risk score with the `ScoreRing` SVG in the conclusion card
- If risk > 70, show a warning badge and require explicit user confirmation to apply any session decisions
- Validation: conclude a session → Maria score shown; high-risk session shows confirmation prompt

**T5.06** — Add `Marcus` distribution target for Boardroom session summaries.
- File: `src/services/marcusExecutionService.js`, `src/components/BoardroomView.tsx`
- After a concluded session is approved by Maria (T5.05), offer a "Distribute Summary" button
- On click: route through Marcus → publish to Slack channel (if configured) with session summary
- Validation: complete a low-risk session → Distribute button appears; clicking it calls Marcus dispatch

**T5.07** — Add agent-to-agent messaging in `agentBusService`.
- File: `src/services/agentBusService.js`
- Add `sendAgentMessage(fromAgent, toAgent, message, context)` and `getAgentMessages(toAgent)` with a 50-message ring buffer per agent
- Add `clearAgentMessages(toAgent)` for cleanup
- Validation: unit test — send 3 messages to Sentinel; retrieve them; confirm order and content

**T5.08** — Add Hector research briefing to the Boardroom session.
- File: `src/components/BoardroomView.tsx`, `src/services/hectorResearchService.js`
- When a Boardroom session is convened, auto-trigger Hector to research the topic
- Display Hector's briefing card (sky-tinted, top 3 sources) at the top of the session thread before agent responses
- Validation: convene session → Hector card appears first with sources

**T5.09** — Add `Miya` creative brief generation from Boardroom session.
- File: `src/components/BoardroomView.tsx`, `src/services/miyaCreativeService.js` (or equivalent)
- Add "Generate Creative Brief" button in concluded sessions
- On click: pass session summary to Miya → generate a creative brief (script outline / strategy doc)
- Display result in a modal; offer "Save to Memory" button
- Validation: click button → Miya generates brief; Save to Memory stores it in `miya` namespace

**T5.10** — Add Telegram companion command `/boardroom` (start a remote Boardroom session).
- File: `src/services/telegramCompanionService.js`
- Command: `/boardroom <topic>` — creates a Boardroom session with all 9 agents on the given topic, runs it, returns the conclusion summary via Telegram reply
- Validation: unit test — mock Telegram message `/boardroom test topic` → session created, reply sent with summary

---

## PHASE 6 — DOCUMENTATION, POLISH & CONVERGENCE
**Branch:** `phase6branch`
**Goal:** All docs current; all P3 issues resolved; system ready for Orchestrator merge

### Tasks

**T6.01** — Update `docs/ALPHONSO_GROUND_TRUTH.md` to v2.4.0.
- Reflect all changes from Phases 1–5: new security middleware, all components now `.tsx`, coverage ≥ 50%, Boardroom logic, 5 new scheduler presets, 22 Telegram commands
- Update version field, last-verified date, test file count and test count

**T6.02** — Update `CLAUDE.md` to v2.4.0.
- Add all new services, components, and patterns to the "Do Not Duplicate" table
- Update "Real Gaps" — mark all Phase 1–5 items as CLOSED
- Update "Last verified" line

**T6.03** — Update `docs/CHANGELOG.md` — add v2.4.0 release notes.
- Sections: Security Hardening, TypeScript Migration Complete, Test Coverage 50%+, Boardroom Multi-Agent, Observability, Agent Capabilities
- Keep entries concise — one line per change

**T6.04** — Update `README.md` to reflect v2.4.0.
- Update feature list, version badge, architecture diagram text
- Add Boardroom and daily scheduler to feature highlights

**T6.05** — Update `docs/USER_MANUAL.md` — document all 22 Telegram commands.
- Current manual reflects 17 commands. Add: `/boardroom`, `/research`, `/memory`, `/receipts`, `/read` (if not already there)
- Add a "Boardroom Sessions" section

**T6.06** — Create `docs/WORKFLOW_NODES.md` — document all 9 node types in WorkflowBuilderView.
- One section per node type: name, description, inputs, outputs, example use case

**T6.07** — Create `CONTRIBUTING.md` in repo root.
- Sections: dev setup, branch strategy, PR checklist, test requirements (all 1983+ must pass), TypeScript requirement for new components, commit message format

**T6.08** — Add dark/light mode toggle to the UI.
- File: `src/styles/tokens.css`, `src/components/TopBar.tsx`
- OKLCH tokens already defined for both modes. Add a `data-theme="dark" | "light"` attribute toggle on `<html>`
- Add a sun/moon icon button to `TopBar.tsx` that toggles it; persist preference via `durableStore`
- Validation: click toggle → colors change; refresh → preference restored

**T6.09** — Add keyboard shortcut reference panel.
- File: `src/components/` (new file `KeyboardShortcutsModal.tsx`)
- Show on `Ctrl+?` or a help button in TopBar
- List: existing shortcuts (if any) + define new ones: `Ctrl+K` (command palette stub), `Ctrl+J` (jump to ChatView), `Ctrl+B` (Boardroom), `Ctrl+R` (RuntimeManager)
- Validation: press `Ctrl+?` → modal opens with shortcut list

**T6.10** — Add agent performance metrics CSV/JSON export.
- File: `src/components/AgentPerformanceView.tsx`
- Add "Export CSV" and "Export JSON" buttons
- Export all receipts with columns: agent, timestamp, status, latency
- Use `URL.createObjectURL` + `<a download>` for browser-safe download
- Validation: click Export JSON → file downloads with correct structure

**T6.11** — Add Playwright E2E test for multi-agent pipeline.
- File: `e2e/multiagent.spec.js` (new file)
- Test: open app → submit a command → confirm Jose intake → confirm policy gate fires → confirm activity log shows agent entry
- Requires: `npm run dev` on :5173, Ollama running
- Validation: `npm run test:e2e` passes including new spec

**T6.12** — Run full verification suite and confirm DONE STATE.
- `npm run verify:app` — lint + typecheck + test + build → all must pass
- `npm run test:coverage` → ≥50%
- `npm run test:e2e` → all E2E pass
- `cargo check && cargo clippy -- -D warnings` from `src-tauri/` → zero warnings
- `npm audit --audit-level=high` → no high/critical vulnerabilities
- Document results in `docs/PHASE6_VERIFICATION.md`

---

## DONE STATE CHECKLIST

The Orchestrator will verify each item before merging any branch to main:

- [ ] P0-01: Branch protection configured on `main`
- [ ] P0-02: No credentials in git history
- [ ] P0-03: Voice OS watchdog running
- [ ] P0-04: Policy enforcement service has ≥8 tests, all passing
- [ ] P0-05: IPC rate limiting on 4 external commands
- [ ] P1-01: All 73 components are `.tsx` with prop interfaces
- [ ] P1-02: Coverage ≥ 50%
- [ ] P1-03: Multi-agent E2E test passing
- [ ] P1-04: Dead-letter queue capped at 100 entries
- [ ] P1-05: Connector credentials in KV store, not localStorage
- [ ] P1-06: WhatsApp gateway HMAC verification
- [ ] P1-07: Unified memory namespace eviction
- [ ] P1-08: Voice sidecar stdout/stderr captured
- [ ] P1-09: Agent contract boundary tests (18 minimum)
- [ ] P1-10: MCP server auth middleware
- [ ] Boardroom multi-agent session logic implemented
- [ ] 5 daily scheduler presets added
- [ ] All docs updated to v2.4.0
- [ ] `npm run verify:app` passes clean
- [ ] `npm audit` no high/critical issues
- [ ] Each phase committed to its own branch, ready for Orchestrator review

---

_Generated by Orchestrator audit on 25.06.2026. Builder takes this file as the single source of task authority._
