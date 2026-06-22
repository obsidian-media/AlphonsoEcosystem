# ALPHONSO — Agent Ground Truth & Shared Context
**Last verified:** 2026-06-22 — Sprint Next-50 complete  
**Verified by:** Claude Code session (120 test files, 1737+ tests passing, cargo clippy clean)  
**Version:** 2.0.8 (All 9 agents have production runtimes; Sprint Next-50 complete; 10 TSX components; companion server wired)  
**Purpose:** Single source of truth for any agent, Claude session, or human operator starting fresh. Read this before reading any other document. If this file conflicts with an audit report or summary doc, trust this file and update the other.

---

## HOW TO KEEP THIS FILE ACCURATE

This file must be updated whenever:
- A new agent persona is added to `src/agents/`
- A new service is added to `src/services/`
- A test file is added to `src/test/`
- A GitHub Actions workflow is added or changed
- A previously-open gap is closed (move it from "Real Gaps" to the relevant section)
- An audit or summary doc is produced — reconcile it against this file first

Do not trust any audit report, progress summary, or parallel-agent brief that has not been checked against this file. Past audits have contained significant errors (see "Known Audit Errors" section at the bottom).

---

## 1. Project Identity

| Field | Value |
|---|---|
| App name | Alphonso |
| Version | 2.0.8 |
| Type | Tauri v2 desktop app (Windows) |
| Project root | `D:\AgentDevWork\repos\AlphonsoEcosystem` |
| Backend | Rust 1.77, Tauri 2.11, SQLite (rusqlite bundled), tokio, reqwest, tokio-tungstenite (companion) |
| Frontend | React 18, Vite 5, Tailwind 3, Lucide React — 63 `.jsx` + 10 `.tsx` components (App, Sidebar, RightPanel, SettingsView, ChatView, AgentStatusStrip, UpdaterNotification, NotificationCenter, AgentPerformanceView, TopBar) |
| AI layer | Ollama local (`llama3.2:3b` default), Claude API, OpenAI API |
| Deployment | Windows NSIS + MSI installer, Railway static serve (gateway) |

---

## 2. Agent Roster — 9 Agents (not 4)

Every agent has a profile, permissions file, and schema in `src/agents/`. All 9 are registered in `src/agents/agentRegistry.js` and enforced by `src/services/agentContractService.js`.

**Note:** Agent orchestration in this project is managed via OpenCode (opencode.ai), an interactive CLI tool that provides specialized agent skills and subagents for software engineering tasks. OpenCode agents are distinct from the 9 Alphonso agents defined in `src/agents/`.

| Agent | Role | Key constraint |
|---|---|---|
| **Alphonso** | Local operator — execution, verification, packaging | General execution agent |
| **Jose** | Orchestrator — intake, routing, merge, confirm, report | Cannot bypass high-risk restrictions |
| **Hector** | Research + citations, source scan | Cannot execute terminal/filesystem/posting/purchase actions |
| **Miya** | Creative — strategy, script, storyboard, export | Cannot execute system commands or unapproved publishing |
| **Maria** | Governance Auditor — risk assessment, compliance review, approval gate | Does not perform destructive execution; Ollama-powered with deterministic fallback |
| **Marcus** | Distribution Executor — GitHub releases, Slack notifications, publish pipelines | Requires Maria governance clearance; blocked on high/critical risk without approval |
| **Echo** | Knowledge Historian — memory synthesis, retention classification, archival | Knowledge preservation only; Ollama-powered with deterministic fallback |
| **Sentinel** | Security Monitor — threat detection, permission audit, automation safety | Ollama-powered + deterministic scan; blocks on critical risk or secret detection |
| **Nova** | Opportunity Analyst — scoring, prioritization, strategic analysis | 4-dimension scoring (value/risk/timing/effort); Ollama-powered with deterministic fallback |

---

## 3. Service Layer — ~131 Services in `src/services/`

Key services that past audits missed or underestimated:

### Orchestration & Governance (fully implemented)
- `orchestrationQueueService.js` — durable queue with state transitions (`new → pending_approval → queued → reported_to_jose → dead_letter/failed`), dead-letter replay, manual interrupt
- `orchestrationReceiptService.js` — receipt events across all flows: assignment creation, policy blocks, retries, dead-letter, merge/confirm, pipeline completion
- `orchestrationGovernanceService.js` — governance layer over orchestration
- `joseCommandRouterService.js` — Jose intake, decomposition, routing
- `joseExecutionEngineService.js` — Jose execution engine
- `packetExecutionService.js` — packet-level execution

### Policy & Approval (fully implemented, fail-closed)
- `policyEnforcementService.js` — **centralized policy gate** enforcing: zero-cost mode, approval mode, connector risk classification, auth/allowlist checks. Fails closed with a blocked result object when uncertain or unauthorized.
- `connectorRegistryService.js` — all 9 connector send paths run through policy gate before any external call

### Agent Contracts (fully implemented)
- `agentContractService.js` — per-agent allowed/blocked action prefixes, checked before packet execution
- `agentBusService.js` — inter-agent messaging bus

### Memory & Knowledge
- `unifiedMemoryService.js` — **unified memory** consolidating 4 separate systems (shared 1000, miya 700, ecosystem 1500, workflow 2000) into single API with namespace/category filters. All old services re-export from unified service (backward compatible).
- `memoryService.js` — re-exports from unifiedMemoryService
- `miyaMemoryService.js` — re-exports from unifiedMemoryService
- `memory/ecosystemMemoryService.js` — re-exports from unifiedMemoryService
- `durableMemoryService.js` — re-exports from unifiedMemoryService + migration helpers
- `workflowMemoryService.js` — re-exports from unifiedMemoryService
- `sessionIntelligenceService.js`, `workspaceIntelligenceService.js`
- `sourceConfidenceService.js`, `trustModel.js`, `verificationService.js`

### Connector & External
- `connectorRegistryService.js` — all outbound connector paths (policy-gated)
- `whatsappWebhookService.js` — WhatsApp webhook handling
- `marcusPublishService.js` — Marcus-governed distribution
- `metaPublishService.js` — Meta/Instagram publishing
- `hectorResearchService.js` — Hector live research
- `toolConnectionService.js`, `toolNotificationDispatcher.js`

### Workflow Operations (10 structured workflows)
- `workflowOperationsRegistryService.js` — Marketing Ops, Social Media, Content Production, Learning, Startup/Product Dev, Opportunity Discovery, Construction Ops, Knowledge Preservation, Content Repurposing, Automation Governance
- `workflowExecutionService.js`, `workflowBuilderService.js`, `workflowGovernanceService.js`

### Self-Development & Release
- `selfDevelopmentService.js`, `nativeSelfDevelopmentAutostartService.js`
- `productionReadinessService.js`, `rc0EvidenceService.js`, `nativeRc0ProofService.js`
- `runwayService.js`, `appUpdateService.js`
- `repoAuditService.js`

### Agent Brain & Execution
- `agentBrainService.js` — Brain 1-9: context reader, clarifying questions, plan preview, pattern memory (200 cap), thinking loop with error feedback, optimized Ollama params, multi-step decomposition (12+ patterns), git auto-commit, auto-run dev server, Composio external tool detection, post-write validation loop (build/lint after generation), self-evaluation (confidence 0-100), structured tool use (`executeWithTools` loop with 16 tools, max 10 iterations)
- `toolRegistryService.js` — 16 tools with JSON schemas: read/write/delete/move files, search, list dir, run commands, fetch URL, open URL, clipboard read/write, Composio, memory save/search, git commit/status
- `streamingService.js` — real-time token streaming with state persistence, subscriber pattern, abort support
- `composioService.js` — Composio SDK integration: API key config, toolkit discovery, action execution, agent tool selection via LLM, health check
- `agentMetricsService.js` — execution recording, success rate, confidence tracking, validation pass rate, 7-day trend, top commands, error patterns, per-agent breakdown
- `proactiveAgentService.js` — 7 proactive checks (failed builds, validation failures, high iterations, low confidence, project staleness, idle time, unused memory), suggestion banner with action buttons, 60s interval with 5min cooldown per type
- `workspaceFileService.js` — frontend wrapper for Tauri file operations: read, delete, move, search, list directory, tree builder
- `browserAutomationService.js` — open URL, fetch content (HTML stripping, title extraction), clipboard read/write
- `backupService.js` — full export/import of localStorage + SQLite + KV store as JSON, size estimation, file download/upload
- `searchService.js` — memory/project search with relevance scoring, category/agent filters, date range, suggestions
- `modelSelectionService.js` — multi-model selection, task-type routing, per-task override
- `autoRunService.js` — auto-run dev server after build, opt-out toggle
- `gitService.js` — git revert, log, status, diff for rollback
- `scaffoldTemplatesService.js` — 8 project templates (React, Next.js, Express, full-stack, vanilla)

### Resilience & Monitoring (added Sprint Next-50)
- `connectorCircuitBreakerService.js` — localStorage-backed circuit breaker per connector; 5-failure threshold, 60s cooldown, half-open recovery
- `connectorRateLimiterService.js` — in-memory token-bucket rate limiter; 60 req/min default, per-connector config
- `memoryMonitorService.js` — localStorage usage monitor; byte counts, threshold alerts (5MB warn / 8MB critical), pruneOldest helper

### Agent Intelligence (added Sprint Next-50)
- `hectorBookmarkService.js` — Hector research bookmark ring (200 cap); tag/search filter, JSON export
- `mariaWeeklyReportService.js` — Maria governance weekly report; reads audit + receipt logs, risk breakdown, scheduleWeeklyGeneration

### Other
- `pluginSandboxService.js`, `pluginRegistryService.js`
- `recoveryService.js`, `runtimeLedgerService.js`
- `screenIntelligenceService.js`, `voiceService.js`
- `chatPersistenceService.js`, `notificationService.js`
- `coachModeService.js`, `skillPackService.js`
- `localMarketplaceService.js`, `resourceCostService.js`
- `devPacketService.js`, `serviceScopes.js`
- `agentAvatarService.js`, `agentVisualService.js`

---

## 4. Test Suite — 120 Files in `src/test/` (not zero)

The test suite exists and is substantial. Any agent or audit that says "no test suite" or "zero coverage" is wrong.

**Test files (verified 2026-06-22 Sprint Next-50, all passing):**
- 120 test files (119 top-level + `services/agentContract.test.ts`), 1737+ tests passing
- 14 Rust unit tests passing (`cargo test` in src-tauri/)
```
accBridgeService.test.js
agentBusService.test.js
agentContractService.test.js
agentOutputStoreService.test.js
agentPairingConstants.test.js
agentPairingExecutionService.test.js
agentSkills.test.js
approvalEnforcement.test.js
appStorage.test.js
appUpdateService.test.js
ApprovalPanel.test.jsx
batchOrchestratorService.test.js
cacheService.test.ts
chatPersistenceService.test.js
chatUtils.test.js
coachInterventionService.test.js
coachSkillService.test.js
coachSoundCueService.test.js
connectorAuditLogService.test.js
connectorGitHubSlack.test.ts
connectorRegistryService.test.js
contentCatalystBridgeService.test.js
contentCatalystService.test.js
devPacketService.test.js
durableMemoryService.test.js
eventsService.test.js
githubConnector.test.js          ← added PR #41 (20 tests)
hectorResearchService.test.js
joseCommandRouterService.test.js
joseExecutionEngineService.test.js
josePipelineE2E.test.js
joseZeroCostRouting.test.js
licenseService.test.ts
localMarketplaceService.test.js
memoryService.test.js
missionRoomService.test.js
miyaComfyWorkflowPresetService.test.js
miyaExportPacketService.test.js
miyaWorkflowTemplates.test.js
notificationService.test.js
notionSyncService.test.js
novaFeedbackService.test.js
ollamaReadinessGuide.test.js
ollamaState.test.js
ollamaUtils.test.js
OllamaPreflightPanel.test.jsx
operatorDashboard.test.jsx
orchestrationQueueService.test.js
orchestrationReceiptService.test.js
parallelExecutionService.test.ts
pluginRegistryService.test.js
AgentActivityLog.test.jsx          ← added Direction 3 (6 tests)
ApprovalModal.test.jsx             ← added Direction 3 (10 tests)
ChatView.test.jsx                  ← added Direction 3 (8 tests)
ConnectorSetupPanel.test.jsx       ← added Direction 3 (7 tests)
MicrophoneStatus.test.jsx          ← added Direction 3 (5 tests)
RightPanel.test.jsx                ← added Direction 3 (8 tests)
VoiceInputButton.test.jsx          ← added Direction 3 (6 tests)
voiceService.test.js               ← added Direction 3 (10 tests)
WorkflowBuilderView.test.jsx       ← added Direction 3 (7 tests)
useVoiceInput.test.js              ← added Direction 3 (7 tests)
telegramCompanionService.test.js   ← added Direction 1
pluginSandboxService.test.js
policyEnforcementCaching.test.ts
policyEnforcementService.test.js
productionReadinessService.test.js
recoveryService.test.js
runtimeLedgerService.test.js
runwayService.test.js
selfDevelopmentService.test.js
sentinelGateService.test.js
services/agentContract.test.ts
sessionIntelligenceService.test.js
slackConnector.test.js           ← added PR #41 (16 tests)
mariaAuditService.test.js        ← added Phase 3 (33 tests)
echoMemoryService.test.js        ← added Phase 3 (35 tests)
marcusExecutionService.test.js   ← added Phase 3 (23 tests)
sentinelSecurityService.test.js  ← added Phase 1 (33 tests)
novaAnalysisService.test.js      ← added Phase 1 (36 tests)
connectorAuth.test.js            ← added Phase 1 Stage 3 (coverage push)
agentMetricsService.test.js      ← added Phase 1 Stage 3 (coverage push)
modelSelectionService.test.js    ← added Phase 1 Stage 3 (coverage push)
sourceConfidenceService.test.js
telegramAutoPollService.test.js
telegramConnectorProof.test.js
toolConnectionLiveProof.test.js
toolConnectionService.test.js
toolNotificationDispatcher.test.js
trustModel.test.js
TrustReceiptBrowser.test.jsx
updaterReleaseUtils.test.js
whatsappCloudGateway.test.js
whatsappCloudGatewayRuntime.test.js
whatsappGatewaySecurity.test.js
whatsappWebhookService.test.js
workflowDurabilityHydration.test.js
workflowExecutionService.test.js
workflowGovernanceService.test.js
workflowOperationsRegistryService.test.js
workspaceRootService.test.js
agentAuditService.test.js      ← added Direction 5 (5 tests)
workspaceExportService.test.js ← added Direction 5 (9 tests)
agentBrainService.test.js      ← added Sprint Next-10 T3 (27 tests)
workspaceFileService.test.js   ← added Sprint Next-10 T3 (17 tests)
proactiveAgentService.test.js  ← added Sprint Next-10 T3 (14 tests)
streamingService.test.js       ← added Sprint Next-10 T3 (19 tests)
browserAutomationService.test.js ← added Sprint Next-10 T3 (16 tests)
backupService.test.js          ← added Sprint Next-10 T3 (16 tests)
composioService.test.js        ← added Sprint Next-10 T3 (26 tests)
agentActivityService.test.js   ← added Sprint Next-10 T3 (9 tests)
resourceCostService.test.js    ← added Sprint Next-10 T3 (16 tests)
marcusPublishService.test.js   ← added Sprint Next-10 T3 (22 tests)
gitService.test.js             ← added Sprint Next-50 D3 (12 tests)
skillPackService.test.js       ← added Sprint Next-50 D3 (12 tests)
workspaceIntelligenceService.test.js ← added Sprint Next-50 D3 (11 tests)
screenIntelligenceService.test.js    ← added Sprint Next-50 D3 (11 tests)
scaffoldTemplatesService.test.js     ← added Sprint Next-50 D3 (12 tests)
metaPublishService.test.js           ← added Sprint Next-50 D3 (11 tests)
workspaceArtifactService.test.js     ← added Sprint Next-50 D3 (8 tests)
telegramBrowserConnector.test.js     ← added Sprint Next-50 D3 (19 tests)
```

**Rust tests (verified 2026-06-15, Session 13):**
- 17 tests in `src-tauri/src/lib.rs`, `src-tauri/src/companion_auth.rs`, `kv_store.rs`, `whatsapp_webhook.rs` — all passing
- `cargo clippy -- -D warnings` clean

**What agents working on testing should focus on:**
- Coverage is at ~38%+ (threshold 20%) — next staged target is 40%
- Component test coverage ~12%; 8 new service test files added in Sprint Next-50
- Run `npm run test:coverage` to see current state

---

## 5. CI/CD — Two Workflows Already Exist

**`.github/workflows/ci.yml`** — runs on push/PR to main:
- `npm ci` → `npm audit --audit-level=high` → lint → `npm test` → `npm run build`
- `rust-quality` job: runs on **ubuntu-latest** (Windows App Control was blocking DLL loading), `cargo clippy -- -D warnings` + `cargo test`
- On main branch only: Tauri desktop build + NSIS artifact upload

**Note:** `verify-app.yml` does NOT exist as a separate workflow file. `npm run verify:app` (lint + test + build) is run as part of `ci.yml`. Do not reference `verify-app.yml`.

**CI status as of 2026-06-22:** `test` job passing green on `main`. `rust-quality` switched to ubuntu-latest to avoid Windows App Control DLL blocking. `npm audit` fixed (vite 8.0.16, vitest 4.1.8 — 0 vulnerabilities).

**`.npmrc`** — `legacy-peer-deps=true` required because `@eslint/js@10.x` and `eslint@9.x` are in `package.json` together (peer dep mismatch). Without this, `npm ci` fails with ERESOLVE.

**What does NOT exist yet:**
- ~~Rust `cargo test` step in CI~~ → **DONE** — `rust-quality` job in `ci.yml`
- ~~`cargo clippy` step in CI~~ → **DONE** — included in `rust-quality` job with `-D warnings`
- ~~Coverage threshold enforcement in CI~~ → **DONE** — threshold at **12%** in `vite.config.js`, actual measured **27.83%** (src/ scoped). Coverage include scoped to `src/**/*.{js,jsx,ts,tsx}`. 5 new test files added: `appStorage.test.js`, `chatUtils.test.js`, `ollamaUtils.test.js`, `trustModel.test.js`, `connectorAuditLogService.test.js`, `sourceConfidenceService.test.js`.
- ~~Playwright E2E~~ → **FULLY INSTALLED 2026-06-01 Session 4** — `@playwright/test@1.60.0` installed, Chromium browser installed via `npx playwright install chromium`. Run: `npm run test:e2e` (requires dev server on :5173 + Ollama running).

---

## 6. npm Scripts — Full List

```
dev                      node scripts/run-vite-dev.mjs
desktop:dev              npx.cmd tauri dev
build                    node scripts/run-vite-build.mjs
start                    node scripts/run-vite-preview.mjs
test                     node scripts/run-vitest-programmatic.mjs src
test:watch               node scripts/run-vitest-programmatic.mjs --watch src
lint                     eslint src
verify:app               npm run lint && npm run test && npm run build
verify:desktop:preflight node scripts/verify-desktop-preflight.mjs
verify:desktop           node scripts/verify-desktop.mjs
updater:keygen           node scripts/setup-updater-signing.mjs --generate-only
updater:setup            node scripts/setup-updater-signing.mjs
updater:verify           node scripts/verify-updater-readiness.mjs
release:updater          node scripts/release-updater.mjs
verify:ollama            node scripts/verify-ollama-runtime.mjs
proof:native-selfdev     node scripts/proof-native-selfdev.mjs
proof:rc0                node scripts/proof-native-selfdev.mjs --rc0
auth:youtube             node scripts/auth-youtube.mjs
auth:meta                node scripts/auth-meta.mjs
auth:outlook             node scripts/auth-outlook.mjs
preview                  node scripts/run-vite-preview.mjs
tauri                    tauri
```

---

## 7. Connector Status — Policy-Gated, Not Raw Stubs

All outbound connector paths run through `policyEnforcementService.js` before any external call. They are not raw stubs.

| Connector | Frontend path | Rust command | Live status |
|---|---|---|---|
| Telegram | `connectorRegistryService.sendTelegramConnectorMessage` | Yes | Credential-dependent |
| WhatsApp outbound | `connectorRegistryService.sendWhatsAppConnectorMessage` | Yes (+ browser fallback) | Credential-dependent |
| WhatsApp inbound (Twilio poll) | `whatsappWebhookService.js` | Yes | Credential-dependent |
| WhatsApp inbound (Cloud webhook) | `browserPollWhatsAppGateway` → Railway queue drain | Browser fallback | Live — requires Railway gateway + 5 credentials in UI |
| YouTube upload | `connectorRegistryService.uploadYouTubeConnectorVideo` | Yes | OAuth-dependent |
| Notion | `connectorRegistryService.sendNotionConnectorEntry` | Yes | Token-dependent |
| ClickUp | `connectorRegistryService.sendClickUpConnectorTask` | Yes | Token-dependent |
| Claude | `connectorRegistryService.sendClaudeConnectorMessage` | Yes | API key-dependent |
| ChatGPT/OpenAI | `connectorRegistryService.sendChatGptConnectorMessage` | Yes | API key-dependent |
| SD WebUI | `connectorRegistryService.generateSdWebUiImage` | Yes | Local service-dependent |
| ComfyUI | `connectorRegistryService.queueComfyUiVideo` | Yes | Local service-dependent |

All paths: fail-closed on missing credentials, blocked in zero-cost mode unless explicitly overridden, approval-gated for risky external actions.

---

## 8. Real Gaps — What Actually Needs Work

These are confirmed gaps as of 2026-06-21. Any agent working on these areas should check current state before implementing — some may have been partially addressed since this file was last updated.

### SECURITY
- [x] **CSP fixed** — `"security": { "csp": null }` replaced with full production policy string in `tauri.conf.json` (2026-05-31, Agent A). See `docs/SECURITY_CONFIG_REPORT.md`.
- [x] **GPU flags removed** — `--disable-gpu --disable-gpu-compositing --use-angle=swiftshader` deleted; hardware acceleration now active (2026-05-31, Agent A).
- [x] **Window size fixed** — changed to 1280×800, `minWidth: 1024`, `minHeight: 700` (2026-05-31, Agent A)
- [x] **.env.example sanitized** — real phone numbers in `WHATSAPP_ALLOWED_NUMBERS` replaced with placeholders (2026-05-31, Agent A)
- [x] **.gitignore verified** — `.env`, `.env.*`, `.tauri-updater-key`, `.tauri-updater-key.pub` all correctly excluded
- [x] **Git history audit** — DONE (2026-06-01, Session 3). `git log --follow -- .env` returned empty — `.env` was NEVER committed. History is clean. No rotation needed.
- [x] **Tauri capability scoping** — DONE (2026-06-01, Session 3). Findings: `src-tauri/capabilities/default.json` grants only `core:default`, `notification:default`, `global-shortcut:default`. All file-write commands include path-traversal guards. One mild finding: `check_env_vars_presence` accepts arbitrary env var names (probes presence only, no value leakage). No action required; document for awareness.

### RUST BACKEND
- [x] **`lib.rs` modular split completed** — Phases 1+2 extraction done (2026-06-09): `lib.rs` is now ~1,455 lines, down from 7,078 (5,623 lines extracted across 16 modules: whatsapp_webhook, kv_store, native_proof, plugin_runtime, policy_gate, audit_log, ollama, memory_store, meta_publish, connector_commands, search, telegram, workspace, youtube, runway, main).
- [x] **lib.rs KV store split** — `src-tauri/src/kv_store.rs` created (2026-06-01, Session 4): `ensure_kv_table`, `kv_set`, `kv_get`, `save_settings`, `load_settings` extracted. `open_memory_db` marked `pub(crate)`.
- [x] **lib.rs continued splitting + plugins extracted** — DONE (2026-06-07, OpenCode): `plugin_runtime.rs`, `policy_gate.rs`, `audit_log.rs`, `ollama.rs`, `memory_store.rs`, `meta_publish.rs`, `runway.rs`, `native_proof.rs` now own their own modules. `cargo check` clean, `cargo clippy -- -D warnings` clean, `cargo test` clean (14 Rust unit tests passing).
- [x] **Policy gate expanded** — `policy_gate.rs` whitelist expanded from 8 to 40+ programs: python, pip, cargo, npx, yarn, pnpm, curl, wget, ffmpeg, docker, pwsh, explorer, chrome, copy, xcopy, robocopy, mkdir, del, and more. Still blocks: cmd, rm, shutdown, format, net, reg.
- [x] **New Tauri commands** — `read_workspace_file`, `delete_workspace_file`, `move_workspace_file`, `search_workspace_files`, `list_workspace_directory`, `open_url`, `fetch_url_content`, `read_clipboard`, `write_clipboard`. All with safe path validation (no escape from workspace root).
- [ ] **lib.rs further splitting** — Optional: Telegram connector block can be extracted further if needed.
- [x] **Rust unit tests added** — 14 tests in `#[cfg(test)] mod tests` covering `allowed_program`, `plugin_blocked_token_present`, `validate_plugin_extra_args`, `trim_trailing_slashes`, `wal_pragma_applies_on_in_memory_db`, `to_hex` — all passing (verified `cargo test` 2026-05-31, Agent D)
- [x] **Shared `reqwest::Client`** — built at startup, registered via `.manage()`, used by `connector_poll_telegram`, `connector_send_telegram`, `connector_send_chatgpt`, `connector_send_claude` (2026-05-31, Agent D).
- [x] **SQLite WAL mode + cache** — `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-65536;` in `open_memory_db()` — 64MB page cache added (2026-06-01, Agent 3)
- [x] **`unwrap()` audit done** — 1 runtime `.unwrap()` found, replaced with safe `match + continue`. Two startup-only `.expect()` calls intentionally kept.
- [x] **Clippy clean** — All 27 pre-existing clippy warnings fixed (2026-06-01, Session 3): `&PathBuf→&Path` in 7 functions across `lib.rs`/`runway.rs`, identity map removed, `.clamp()` used, `sort_by_key`, `#[allow(too_many_arguments)]` on 3 functions. `cargo clippy -- -D warnings` now passes on CI.

### FRONTEND
- [x] **Design system created** — `tailwind.config.js` tokens (surface-0..4, accent, success/warning/danger), CSS component classes (.panel, .card, .btn-*, .badge-*, .input, .section-label), Manrope font, ambient glow, custom scrollbar.
- [x] **Font size standardization** — Eliminated all `text-[8px]`/`[9px]` across AgentDock, ChatView, BoardroomPanel, App, TopBar, RightPanel, Badge. Standardized to `text-2xs` (10px) and `text-xs` (12px).
- [x] **Streaming UX** — Real-time token display while 7B model generates, abort button with stop/cancel, token counter, elapsed time ticker, live streaming status indicator with green pulse dot.
- [x] **Keyboard shortcuts** — 12 shortcuts: Ctrl+N new chat, Ctrl+K or / focus input, Esc abort, Ctrl+P search, ? help modal. `useKeyboardShortcuts` hook.
- [x] **Memory search** — `MemorySearch` modal with debounced search, relevance scoring, category/agent filter chips, suggestions, result preview with metadata.
- [x] **Agent metrics** — `AgentMetricsPanel` with 6 stat cards (success rate, validation pass, avg files, avg duration, avg confidence, avg iterations), top commands, error patterns, 7-day trend chart, per-agent breakdown. Wired into SettingsView.
- [x] **Backup/restore** — SettingsView UI with export button (shows size estimate), import button, success/error feedback, auto-reload after restore.
- [x] **Proactive suggestions** — Banner in ChatView with action buttons. 7 checks: failed builds, validation failures, high iterations, low confidence, project staleness, idle time, unused memory. 60s interval, 5min cooldown per type.
- [x] **Composio settings** — API key input, user ID, health check, toolkit list display in SettingsView.
- [x] **Navigation simplified** — 15 sidebar tabs → 8 items in 4 sections. CommandRib reduced to agent indicator + theme switcher + status dot. RightPanel reduced to 4 diagnostics.
- [x] **Rich project summary** — `buildProjectSummary()` in ChatView constructs rich markdown from execution receipts (file explanations, run instructions, next steps).
- [x] **`alphonso_settings` → SQLite** — already done (Sessions 3). Both persist to localStorage + SQLite; SQLite hydrated on boot.
- [x] **`alphonso_conversations` → SQLite** — DONE (2026-06-01, Session 4): `App.jsx` now calls `invoke('kv_set', ...)` on every conversations change and hydrates from `kv_get` on boot. localStorage kept as fallback.
- [x] **`alphonso_connector_auth_profiles_v1` → SQLite** — DONE (2026-06-03, Session 5): persisted via `kv_set`/`kv_get` with localStorage fallback.
- [x] **`alphonso_connector_registry_v2` → SQLite** — DONE (2026-06-03, Session 5): persisted via `kv_set`/`kv_get` with localStorage fallback.
- [x] **`alphonso_messages_${id}` → SQLite** — DONE (2026-06-03, Session 6): `chatPersistenceService.js` persists via `upsert_memory_records`/`list_memory_records`; `ChatView.jsx` also calls `kv_set`/`kv_get` for secondary SQLite path. localStorage kept as fallback. All message keys now dual-write.

### TESTING
- [x] **Coverage threshold** — set to 9% in `vite.config.js` (actual measured: 9.22%). Staged path: write tests to hit 12→20→30. `@vitest/coverage-v8@2.1.9` installed and version-matched.
- [x] **Vitest scoped to src/** — `include: ['src/**/*.{test,spec}.{js,jsx}']` added to prevent Vitest from picking up Playwright `e2e/` files.
- [x] **`cargo test` + `cargo clippy` in CI** — `rust-quality` job passing; `clippy -- -D warnings` now clean.
- [x] **Rust unit tests** — 14 tests added, all passing.
- [x] **Playwright scaffold** — `playwright.config.js` + `e2e/smoke.spec.js` created (2026-06-01). `@playwright/test` added to `package.json`. To run: `npm install --save-dev @playwright/test && npx playwright install chromium && npm run test:e2e`. Requires: dev server on :5173 and Ollama running.
- [x] **Test suite confirmed passing** — **111 test files, 1621+ tests, all passing** (verified 2026-06-21 Sprint Next-10). 14 Rust unit tests also passing. Sprint Next-10 additions (10 new files): `agentBrainService.test.js` (27), `workspaceFileService.test.js` (17), `proactiveAgentService.test.js` (14), `streamingService.test.js` (19), `browserAutomationService.test.js` (16), `backupService.test.js` (16), `composioService.test.js` (26), `agentActivityService.test.js` (9), `resourceCostService.test.js` (16), `marcusPublishService.test.js` (22).

### CONNECTORS & FEATURES
- [x] **Claude + ChatGPT structured error handling** — both connectors now return `{ success, code, error }` with codes `MISSING_KEY`, `TIMEOUT`, `RATE_LIMITED`. 30s timeout, pre-flight key check (2026-05-31, Agent F)
- [x] **Brave Search for Hector** — `search_brave_sources` Rust command exists (line 5965 in lib.rs). Added frontend `searchBrave()` with dual-path: Rust first, then `VITE_BRAVE_SEARCH_API_KEY` frontend fallback (2026-05-31, Agent F)
- [x] **Model switcher UI** — `src/components/ModelSwitcher.jsx` created. Fetches Ollama `/api/tags`, shows dropdown in ChatView header, persists to `alphonso_selected_model_v1`, shows "Ollama offline" pill if unreachable (2026-05-31, Agent F)
- [x] **Connector health dashboard** — `ConnectorHealthPanel.jsx` with status for all 11 connectors (2026-05-31, Agent C)
- [x] **Hector research persistence** — `persistResearchResult(query, results)` added to `hectorResearchService.js`; called at all exit points of `discoverResearchSourcesBrave`; writes via `pushMemoryItem` with `category: 'research_memory'` (2026-06-01, Agent 4)
- [x] **Composio integration** — External tool access for agents via `composioService.js`. API key config, toolkit discovery, action execution, LLM tool selection, health check. Wired into agent brain — detects external tool intent before code generation.
- [x] **Structured tool use framework** — 16 tools with JSON schemas. `executeWithTools()` loop: LLM chooses tool → execute → feed result back → repeat up to 10 iterations. Tools: read/write/delete/move files, search, list dir, run commands, fetch URL, open URL, clipboard read/write, Composio, memory, git.
- [x] **Browser automation** — `open_url` (opens in default browser), `fetch_url_content` (strips HTML, extracts title, 10KB limit), `read_clipboard`/`write_clipboard` (via PowerShell on Windows).
- [x] **File system operations** — `read_workspace_file`, `delete_workspace_file`, `move_workspace_file`, `search_workspace_files` (grep across workspace, skips node_modules/.git, max 200 results), `list_workspace_directory` (recursive tree builder).
- [x] **Post-write validation** — After generating files, runs build/lint validation. Auto-fixes on failure with error context. Final validation pass. Self-evaluation with confidence score (0-100).
- [x] **Agent performance metrics** — Every brain execution records: success rate, confidence, validation pass rate, iterations, duration. 7-day trend, top commands, error patterns, per-agent breakdown.
- [x] **Proactive agent behavior** — Background watcher monitors idle time, failed builds, high iterations, low confidence, validation failures, stale projects, unused memory. Shows suggestion banner with action buttons.

### INFRASTRUCTURE & DOCS
- [x] **`ARCHITECTURE.md`** — created at project root: full stack, IPC flow, 9-agent roster, orchestration flow, service groups, storage model, security model, deployment (2026-05-31, Agent H)
- [x] **`CLAUDE.md`** — created at project root: session-start guide, all npm + cargo commands, do-not-duplicate table, real gaps, directory tree (2026-05-31, Agent H; updated 2026-06-21)
- [x] **`docs/CONNECTORS.md`** — all 14 connectors documented: env vars, credential steps, test procedure, limitations. Credential UI now available for all connectors in ConnectorSetupPanel.
- [x] **`docs/CHANGELOG.md`** — maintained with all session changes through v2.0.2
- [x] **`docs/IOS_COMPANION_PLAN.md`** — iOS companion architecture: WebSocket server design, JSON-RPC protocol, mDNS discovery, SwiftUI vs React Native tradeoffs, 5-phase implementation roadmap (2026-06-08)
- [x] **`.github/dependabot.yml`** — npm (weekly), Cargo (weekly), GitHub Actions (weekly)
- [x] **Auto-updater fully operational** — ed25519 keypair generated, `TAURI_SIGNING_PRIVATE_KEY` set in GitHub Secrets, pubkey in `tauri.conf.json`, v2.0.2 release triggered via `workflow_dispatch`. Future installs will auto-update.
- [x] **Sentinel Security Monitor runtime** — **CLOSED Phase 1** `src/services/sentinelSecurityService.js` — deterministic threat scan + Ollama deep analysis, blocks on critical risk/secret detection, full SENTINEL_ALERT_SCHEMA output.
- [x] **Nova Opportunity Analyst runtime** — **CLOSED Phase 1** `src/services/novaAnalysisService.js` — 4-dimension scoring (value/risk/timing/effort), Ollama strategic recommendation, integrates novaFeedbackService for decomposition hints, full NOVA_OPPORTUNITY_SCHEMA output.
- [x] **Maria Governance Auditor runtime** — **CLOSED Phase 3** `src/services/mariaAuditService.js` — Ollama-powered audit with JSON schema, deterministic fallback via `marcusAuditService.generateRiskScore()`, memory persistence, session event logging, orchestration receipt.
- [x] **Echo Knowledge Historian runtime** — **CLOSED Phase 3** `src/services/echoMemoryService.js` — Ollama synthesis, retention classification (permanent/standard_180d/ephemeral_7d), category classification, confidence normalization, memory persistence.
- [x] **Marcus Distribution Executor runtime** — **CLOSED Phase 3** `src/services/marcusExecutionService.js` — Maria governance gate (blocks on critical/high with approvalRequired), GitHub actions (release/issue), Slack messaging, publish dispatch via `marcusPublishService`, audit records.
- [x] **Connector credential UI gap** — **CLOSED Phase 3** All 9 API-key connectors now have credential input panels in `ConnectorSetupPanel.jsx`: GitHub, Slack, Claude/Anthropic, ChatGPT/OpenAI, Notion (2-field), ClickUp (2-field), WhatsApp (3-field), YouTube (4-field), Qwen.
- [x] **claudeService.js credential inconsistency** — **CLOSED Phase 3** Was reading from auth profiles `.claude.apiKey`; now reads via `getConnectorCredential('claude', 'ANTHROPIC_API_KEY')` consistent with all other connectors.
- [x] **chatgptService.js credential inconsistency** — **CLOSED Phase 3** Now reads via `getConnectorCredential('chatgpt', 'OPENAI_API_KEY')`.
- [x] **Telegram companion commands** — **CLOSED Direction 1** `telegramCompanionService.js` now handles `/help` (full command list), `/report` (Ollama status + queue + activity), `/files` (workspace directory listing). `telegramCompanionService.test.js` added (full test suite).
- [x] **Voice STT wiring** — **CLOSED Direction 1** `voiceService.js` now exports `SpeechRecognitionClass`, `supportsSpeechRecognition()`, `startSpeechRecognition()`. `useVoiceInput.js` hooks STT path with `liveTranscript` state + fallback mic-only path.
- [x] **Nova insight card in ChatView** — **CLOSED Direction 4** After Jose pipeline, fires `computeOpportunityScores` + async `runNovaAnalysis`; score > 65 shows insight card with SVG score ring, recommendation, dismiss button.
- [x] **Screen context injection** — **CLOSED Direction 4** `buildProjectSummary()` accepts `screenContext` param; last 3 `screenObserverLogs` events injected before "Next steps". `App.jsx` passes `screenObserverLogs` to `ChatView`.
- [x] **Maria risk score ring in ApprovalModal** — **CLOSED Direction 4** `ScoreRing` SVG component + `riskToScore()` + `mariaScore` prop override. Color-coded red/amber/green by score.
- [x] **Sentinel dashboard in RightPanel** — **CLOSED Direction 4** `scanForThreats()` on mount + ↺ re-scan button; threat level badge, findings list, last-scanned time; persisted to `alphonso_sentinel_last_scan_v1`.
- [x] **Echo memory timeline in SettingsView** — **CLOSED Direction 4** `EchoTimeline` component groups `listMemoryItems()` by retentionTier (permanent ♾ / standard_180d 📅 / ephemeral_7d ⏳) with expiry countdown.
- [x] **Composio toolkit toggles** — **CLOSED Direction 4** Static badge spans → toggleable 2-col grid cards; enabled set persisted to `alphonso_composio_toolkits_enabled_v1`.
- [x] **Hector RSS failover** — **CLOSED Direction 4** `RSS_FEED_CATALOG` (12 curated feeds), `fetchRssSources()`, `parseRssItems()` (DOMParser-based), `scoreRssFeed()` — wired as last-resort after Brave/DDG.
- [x] **WorkflowBuilderView** — **CLOSED Direction 4** New `src/components/WorkflowBuilderView.jsx` — two-panel builder (sidebar + node editor), 9 node types, up/down reorder, save confirmation. `AutomationView` now has Overview/Builder tab bar.
- [x] **Component test coverage** — **CLOSED Direction 3** 11 new component test files: ApprovalModal, RightPanel, ChatView, ConnectorSetupPanel, WorkflowBuilderView, AgentActivityLog, VoiceInputButton, MicrophoneStatus plus voiceService + useVoiceInput hook tests. Direction 5 added agentAuditService + workspaceExportService tests. 101 test files / 1439+ tests.
- [x] **NotificationCenter** — **CLOSED Direction 1** `src/components/NotificationCenter.jsx` — fixed top-right panel, max 5 notifications visible, colored left borders by type, relative timestamps, dismiss X, "Clear all" link.
- [x] **AgentStatusStrip** — **CLOSED Direction 1** `src/components/AgentStatusStrip.jsx` — horizontal flex strip of agent status badges; pulsing emerald dot for `status==='running'`; compact mode; returns null when empty.
- [x] **UpdaterNotification** — **CLOSED Direction 1** `src/components/UpdaterNotification.jsx` — amber fixed banner, "Update & Restart" + "Later" buttons; wired into App.jsx via `updaterVersion` state.
- [x] **WhatsAppInboxPanel** — **CLOSED Direction 1** `src/components/WhatsAppInboxPanel.jsx` — scrollable received-message list with inline per-message reply state.
- [x] **ModelSwitcher 3-pill + OllamaModelPicker** — **CLOSED Direction 1** `ModelSwitcher.jsx` now exports both: `ModelSwitcher` (3-pill Ollama/Claude/ChatGPT switcher, amber active state) and `OllamaModelPicker` (legacy renamed Ollama model selector). ChatView imports both.
- [x] **cacheService maxEntries cap** — **CLOSED Direction 2** `cacheService.ts` — `CacheOptions.maxEntries` (default 500 via `DEFAULT_MAX_ENTRIES`); while-loop evicts oldest key after every `set()`.
- [x] **crashLogService** — **CLOSED Direction 2** `src/services/crashLogService.js` — localStorage ring buffer, 100 entries, key `alphonso_crash_log_v1`. Exports: `logError`, `getCrashLog`, `clearCrashLog`.
- [x] **retryDeadLetter** — **CLOSED Direction 2** `orchestrationQueueService.ts` — `retryDeadLetter()` exported: replays all `dead_letter` packets via `replayPacketFromDeadLetter()`, returns retry count.
- [x] **ChatView drag-and-drop + Hector card** — **CLOSED Direction 4** Drag-and-drop onto chat input area; file pills with × remove; `[Attached files: ...]` suffix in messages. Hector briefing card (sky-tinted, dismissible) shows top 3 research sources above input.
- [x] **sentinelSecurityService scheduled scans** — **CLOSED Direction 4** `startScheduledScans(intervalMs, onResult)` exported from sentinelSecurityService; returns cleanup function; RightPanel auto-rescans every 10 min.
- [x] **novaAnalysisService opportunity history** — **CLOSED Direction 4** `saveOpportunityScore(score, recommendation)` + `getOpportunityHistory()` persist last 30 scores to `alphonso_nova_history_v1`.
- [x] **agentAuditService** — **CLOSED Direction 5** `src/services/agentAuditService.js` — localStorage ring buffer, 100 entries, key `alphonso_approval_audit_v1`. Exports: `logApprovalEvent`, `getAuditLog`, `clearAuditLog`.
- [x] **workspaceExportService** — **CLOSED Direction 5** `src/services/workspaceExportService.js` — `exportWorkspace()` (all `alphonso_*` keys as JSON), `importWorkspace(jsonString)` (validates prefix, returns `{ imported, errors }`).
- [x] **WorkspaceExportImportView** — **CLOSED Direction 5** `src/components/WorkspaceExportImportView.jsx` — export via Blob download, import via FileReader, emerald/red status feedback; rendered at bottom of SettingsView.
- [x] **RightPanel Audit tab** — **CLOSED Direction 5** System/Audit tab switcher in RightPanel header; Audit tab shows last 10 approval events with emerald/red outcome badges and relative timestamps.
- [x] **AgentPerformanceView** — **CLOSED Direction 5** `src/components/AgentPerformanceView.tsx` — per-agent success/error counts + avg latency computed from orchestration receipt data; props: `receipts`. (Migrated to .tsx in Sprint Next-10.)
- [x] **Onboarding connector step** — **CLOSED Sprint Next-10 T1** `OnboardingWizard.jsx` now has 4 steps; step 3 = "Connect a channel" with Telegram/WhatsApp/Skip cards; saves preference to `alphonso_onboarding_connector_v1`.
- [x] **CrashLogView** — **CLOSED Sprint Next-10 T5** `src/components/CrashLogView.jsx` — entry list with timestamp/message/context, "Clear" button; wired as "Logs" tab in SettingsView.
- [x] **NovaHistoryChart** — **CLOSED Sprint Next-10 T6** `src/components/NovaHistoryChart.jsx` — SVG sparkline of last 10 opportunity scores (indigo polyline + dots), most-recent recommendation; wired in SettingsView.
- [x] **Gateway Dockerfile** — **CLOSED Sprint Next-10 T7** `gateway/whatsapp-cloud/Dockerfile` multi-stage Node 20 Alpine build + `.dockerignore`.
- [x] **TypeScript migration (5 components)** — **CLOSED Sprint Next-10 T8** AgentStatusStrip, UpdaterNotification, NotificationCenter, AgentPerformanceView, TopBar migrated to `.tsx` with full prop interfaces. SVG type declaration added to `src/types/declarations.d.ts`. Old `.jsx` files removed.
- [x] **SentinelFindingModal** — **CLOSED Sprint Next-10 T9** `src/components/SentinelFindingModal.jsx` — fixed overlay modal, severity badge, pattern + recommendation rows. RightPanel findings now clickable to open modal.
- [x] **durableStore / SQLite dual-write** — **CLOSED Sprint Next-10 T10** `src/lib/durableStore.js` — `durableGet/Set/Remove` writes to localStorage + fire-and-forgets to Tauri `kv_set`; applied to crashLogService, agentAuditService, novaAnalysisService.
- [x] **Test coverage push** — **CLOSED Sprint Next-10 T3** 10 new service test files → 111 total / 1621+ tests: agentBrainService, workspaceFileService, proactiveAgentService, streamingService, browserAutomationService, backupService, composioService, agentActivityService, resourceCostService, marcusPublishService.
- [ ] **Branch protection on `main`** — CI not yet required before merge (GitHub settings, manual step)
- [x] **TypeScript migration (continued)** — **CLOSED Sprint Next-50 D5** App, Sidebar, RightPanel, SettingsView, ChatView all migrated to `.tsx`. Total: 10 TSX components. Remaining JSX: 63 components.

### Sprint Next-50 Additions (2026-06-22)
- [x] **connectorCircuitBreakerService** — **CLOSED D2T1** localStorage-backed per-connector circuit breaker
- [x] **connectorRateLimiterService** — **CLOSED D2T7** token-bucket rate limiter (in-memory, 60 req/min default)
- [x] **memoryMonitorService** — **CLOSED D2T8** localStorage usage monitor with threshold alerts
- [x] **hectorBookmarkService** — **CLOSED D4T3** Hector research bookmark ring (200 cap)
- [x] **mariaWeeklyReportService** — **CLOSED D4T6** Maria governance weekly report generator
- [x] **SessionHistoryView** — **CLOSED D1T1** orchestration session history with search/filter/expand
- [x] **OrchestratorQueueView** — **CLOSED D2T5** live queue dashboard with 5s auto-refresh
- [x] **DeadLetterQueueView** — **CLOSED D2T6** dead-letter retry panel
- [x] **SentinelAllowlistPanel** — **CLOSED D4T5** allowlist manager with pattern test
- [x] **AgentPairingView** — **CLOSED D4T7** agent collaboration pairing UI
- [x] **ErrorBoundary → crashLogService** — **CLOSED D1T9** both ErrorBoundary + ViewErrorBoundary wire to logError
- [x] **Telegram/WhatsApp retry backoff** — **CLOSED D2T2/T3** 3-attempt exponential backoff (1s/2s/4s) on send
- [x] **AgentStatusStrip live feed** — **CLOSED D4T8** useAutoFeed polling every 3s from agentActivityService
- [x] **vitest ts/tsx include** — **CLOSED D5T6** include pattern covers .ts/.tsx test files
- [x] **ESLint no-console warn** — **CLOSED D5T7** console.log warns (warn/error allowed)
- [x] **Root docker-compose** — **CLOSED D5T10** docker-compose.yml at repo root builds gateway
- [x] **Nova threshold alerts** — **CLOSED D4T1** fires notification when score ≥ threshold (default 75)
- [x] **Echo end-of-session synthesis** — **CLOSED D4T2** synthesizeSession export; App.tsx wires close-requested
- [x] **Jose escalation** — **CLOSED D4T9** tracks consecutive failures, fires warning notification at 2
- [x] **Jose parallel dispatch** — **CLOSED D4T10** Promise.all when multiple agent assignments, parallelDispatch flag
- [x] **ChatView empty states** — **CLOSED D1T3** empty state cards in Chat/Files/MemorySearch
- [x] **ChatView connector badge** — **CLOSED D1T4** Ollama+Telegram status dots in header
- [x] **ChatView direct mode** — **CLOSED D1T7** bypass Jose pipeline, prefix [DIRECT:Agent]
- [x] **ChatView pin messages** — **CLOSED D1T8** pin/unpin per message, alphonso_pinned_messages_v1
- [x] **ChatView degradation banner** — **CLOSED D2T10** amber banner when connectors down but Ollama online
- [x] **Marcus scheduled publishing** — **CLOSED D4T4** schedulePublish, startScheduler, cancelScheduledPublish
- [x] **Husky pre-commit** — **CLOSED D5T8** runs npm run lint before every commit
- [x] **Bundle size CI guard** — **CLOSED D5T9** ci.yml checks no JS chunk > 1MB
- [x] **WhatsApp read status** — **CLOSED D1T10** ✓/✓✓/✓✓(blue)/✗+retry ticks on outbound messages
- [x] **Boot time diagnostics** — **CLOSED D2T9** PerformanceDiagnosticsPanel in SettingsView
- [x] **Light mode CSS tokens** — **CLOSED D1T2** --color-* suite added to .light{} in index.css
- [x] **8 new test files** — **CLOSED D3T3–T10** gitService, skillPack, workspaceIntelligence, screenIntelligence, scaffoldTemplates, metaPublish, workspaceArtifact, telegramBrowserConnector

### PERFORMANCE
- [x] **Lazy loading** — 20+ heavy views lazy-loaded. Main chunk: **288KB** (budget 550KB). Code splitting applied to ChatView, WorkflowPanel, coach components.
- [x] **Image asset compression** — DONE (2026-06-03, Session 6): Logo/banner/icon/thumbnail PNGs converted to WebP (89% reduction, ~9MB saved). `miya-mascot.png` converted to WebP (77.7% reduction). Unused `ChatGPT Image Jun 1` deleted (2.7MB). Total savings: ~12MB.
- [x] **Design system** — Custom Tailwind tokens reduce CSS duplication. Component classes (.panel, .card, .btn-*) eliminate inline style repetition.

### TOOLING
- [x] **eslint-plugin-security** — installed + wired in `eslint.config.js` (2026-05-31, autonomous)
- [x] **eslint-plugin-react-hooks** — already in config pre-session; confirmed present
- [x] **TypeScript** — installed as devDependency; `tsconfig.json` + `tsconfig.node.json` created (2026-05-31, Agent E)

### UX/UI
- [x] **Connector health dashboard** — `src/components/ConnectorHealthPanel.jsx` created with `ConnectorHealthPanel` (full panel), `ConnectorStatusStrip` (compact sidebar count), `ConnectorStatusDot` (per-connector dot). Mounted as `connectors` tab in `src/App.jsx` (2026-05-31, Agent C)
- [x] **Sidebar connector status** — `src/components/Sidebar.jsx` updated with "Connectors" nav item + inline `ConnectorStatusStrip` showing live/missing/disabled counts (2026-05-31, Agent C)
- [x] **Approval modal improved** — `src/components/ApprovalModal.jsx` now shows connector badge, colored risk level (high/medium/low), irreversibility warning banner, red confirm button for high-risk actions — backward compatible with existing `label` prop (2026-05-31, Agent C)
- [ ] **No onboarding flow** — first-launch experience does not guide through Ollama check → model download → connector setup
- [x] **Dark/light theme toggle** — `Sidebar.jsx` has Moon/Sun toggle persisting to `alphonso_theme_v1`; applies `.light` class to `<html>`; basic CSS variables in `index.css` (2026-06-01, Agent 1). Full Tailwind token propagation is a future task.
- [ ] **Toast notifications** — `ToastProvider` already mounted in `main.jsx`; inbound message toasts already wired in `App.jsx` — no gap here

### FREEZE FIX & BOOT OPTIMIZATIONS (v1.0.2)
- [x] **WebView2 zombie process fix** — Changed `CloseRequested` handler from hide-to-tray (`api.prevent_close()` + `window.hide()`) to `std::process::exit(0)`. This prevents WebView2 Edge processes from accumulating across sessions, which was causing the freeze.
- [x] **useAppEffects refactor** — Split 858-line `useAppEffects.js` into 6 focused hooks: `useBootEffects`, `usePersistenceEffects`, `useSessionEffects`, `usePollingEffects`, `useDataHydration`, `useNativeProofEffects`.
- [x] **Ollama polling simplified** — Removed broken backoff (attempt counter was never incremented), changed to fixed 30s interval with initial check guard.
- [x] **Autorun dependency trimmed** — Removed `verificationLogs` (200+ entries) from useEffect dependency array.
- [x] **Boot performance monitoring** — Added `performance.mark()` calls in `main.jsx` for boot sequence tracking.
- [x] **WhatsApp polling deferred** — Polling now waits 15s after boot and only runs if connector is authenticated.

---

## 9. What Has Been Built — Do NOT Duplicate

Before writing any new service or feature, verify it does not already exist:

- **Memory unification** → `unifiedMemoryService.js` — 4 systems consolidated, all old services re-export (backward compatible). Do NOT create another memory service.
- **Streaming output** → `streamingService.js` + ChatView — real-time token display, abort button, token counter, elapsed time. Do NOT recreate streaming.
- **Composio integration** → `composioService.js` — API key config, toolkit discovery, action execution, wired into agent brain. Do NOT create another external tool connector.
- **Tool use framework** → `toolRegistryService.js` — 16 tools with JSON schemas, `executeWithTools()` loop. Do NOT add tools outside this registry.
- **Browser automation** → `browserAutomationService.js` — open URL, fetch content, clipboard read/write. Do NOT create another browser service.
- **File operations** → `workspaceFileService.js` — read, delete, move, search, list directory. Do NOT create another file service.
- **Post-write validation** → built into `agentBrainService.js` — runs build/lint after generation, auto-fixes, self-evaluation. Do NOT recreate validation.
- **Agent metrics** → `agentMetricsService.js` + `AgentMetricsPanel.jsx` — success rate, confidence, 7-day trend. Wired into SettingsView. Do NOT create another metrics system.
- **Backup/restore** → `backupService.js` — export/import all data as JSON. Wired into SettingsView. Do NOT create another backup system.
- **Search** → `searchService.js` + `MemorySearch.jsx` — memory/project search with relevance scoring, Ctrl+P shortcut. Do NOT create another search.
- **Proactive agent** → `proactiveAgentService.js` — 7 checks, suggestion banner, 60s interval. Do NOT create another proactive system.
- **Keyboard shortcuts** → `useKeyboardShortcuts.js` — 12 shortcuts, ? help modal. Do NOT create another shortcut system.
- **Policy gate** → `policy_gate.rs` — 40+ programs whitelisted. Do NOT modify without reviewing security implications.
- **iOS companion plan** → `docs/IOS_COMPANION_PLAN.md` — architecture doc, do NOT start building without reviewing.
- **Error boundaries** → `ViewErrorBoundary.jsx` (enhanced with copy error, expandable stack trace), `ErrorBoundary.jsx` (reusable with HOC). All views wrapped.
- **Code splitting** — ChatView, WorkflowPanel, CoachMissionBadge, CoachInterventionCard, CoachHardInterruptOverlay, CoachSkillGrid now lazy-loaded. Main chunk reduced from 519KB to 288KB.
- **Approval modal** → `src/components/ApprovalModal.jsx` — already shows connector, risk level, irreversibility warning
- **Toast notifications** → `ToastProvider` already in `main.jsx`, inbound toasts already wired in `App.jsx`
- **Policy enforcement** → `policyEnforcementService.js` (do not recreate approval/risk logic)
- **Orchestration queue + receipts** → `orchestrationQueueService.js` + `orchestrationReceiptService.js`
- **Dead-letter replay** → already in `orchestrationQueueService.js`
- **Zero-cost mode** → enforced in Jose routing and `policyEnforcementService.js`
- **Agent contracts/boundaries** → `agentContractService.js` (do not add per-agent logic elsewhere)
- **10 workflow operations** → `workflowOperationsRegistryService.js`
- **Updater release script** → `npm run release:updater` (do not write a new one)
- **Architecture doc** → `ARCHITECTURE.md` at project root
- **Developer guide** → `CLAUDE.md` at project root (read at every session start)
- **Connector docs** → `docs/CONNECTORS.md`
- **Changelog** → `docs/CHANGELOG.md` — add to this, don't create a new one
- **Dependabot** → `.github/dependabot.yml` already exists
- **ModelSwitcher** → `src/components/ModelSwitcher.jsx` — Ollama model dropdown, already mounted in ChatView. Fixed 2026-06-01: now syncs model to parent on mount (was blocking all chat responses)
- **AgentActivityLog** → `src/components/AgentActivityLog.jsx` — activity timeline tab, auto-refreshes every 3s
- **connectorAuditLogService** → `src/services/connectorAuditLogService.js` — ring buffer for last 100 connector call results
- **Brave Search** → already wired in `hectorResearchService.js` with Rust + VITE_ fallback
- **Auth scripts** → `auth:youtube`, `auth:meta`, `auth:outlook` already exist
- **Desktop preflight/verify** → `verify:desktop:preflight`, `verify:desktop` already exist
- **CI workflows** → `ci.yml` and `release.yml` already exist and passing green (extend, do not replace). Note: `verify-app.yml` does NOT exist as a file — `npm run verify:app` runs inside `ci.yml`.
- **WhatsApp webhook Rust module** → `src-tauri/src/whatsapp_webhook.rs` — `verify_whatsapp_cloud_webhook_challenge`, `verify_whatsapp_cloud_webhook_signature`, `normalize_whatsapp_cloud_inbound` + 4 structs live here. Do not re-add to `lib.rs`.
- **WhatsApp browser connector** → `src/services/whatsappBrowserConnector.js` — `browserSendWhatsApp` (outbound via Meta Graph API v17.0) and `browserPollWhatsAppGateway` (inbound via Railway gateway `/queue/drain`). Reads credentials from `connectorAuth.js` (`getConnectorCredential`). Do NOT recreate.
- **KV store Rust module** → `src-tauri/src/kv_store.rs` — `kv_set`, `kv_get`, `save_settings`, `load_settings`, `ensure_kv_table`. Do not re-add to `lib.rs`.
- **Multi-turn Ollama chat** → `src/lib/ollama.js` — `generateOllamaChatStream` uses `/api/chat` endpoint with full `messages` array. `ChatView.jsx` captures history snapshot before state updates and passes it. Do not recreate.
- **appendAgentActivity wiring** → wired in `joseExecutionEngineService.js` (`executeAssignment`) and `connectorRegistryService.js` (`appendConnectorAudit`). Both import from `../components/AgentActivityLog`.
- **Playwright browser installed** → `@playwright/test@1.60.0` + Chromium installed. `npm run test:e2e` is ready to run (needs dev server + Ollama).
- **Playwright config** → `playwright.config.js` at project root; tests in `e2e/`. Do not create another E2E config.
- **`.npmrc`** — `legacy-peer-deps=true` already set at project root. Do not remove.
- **Companion WebSocket server** → Phase 1 implemented in `src-tauri/src/companion_*.rs` (5 Rust modules: `companion_types`, `companion_auth`, `companion_discovery`, `companion_router`, `companion_server`). Provides PIN auth, JSON-RPC routing, and mDNS discovery. Do not recreate.
- **NotificationCenter** → `src/components/NotificationCenter.jsx` — fixed top-right panel, max 5 visible, colored left borders by type (emerald/amber/red/zinc), relative timestamps, dismiss X, "Clear all". Do NOT create another notification system.
- **AgentStatusStrip** → `src/components/AgentStatusStrip.jsx` — horizontal flex strip of agent badges with pulsing emerald dot for running agents, compact mode, returns null when empty. Do NOT duplicate.
- **UpdaterNotification** → `src/components/UpdaterNotification.jsx` — amber fixed banner, "Update & Restart" + "Later" buttons, wired into App.jsx via `updaterVersion` state. Do NOT recreate updater UI.
- **WhatsAppInboxPanel** → `src/components/WhatsAppInboxPanel.jsx` — scrollable received-message list with inline reply state per message. Reads from `browserPollWhatsAppGateway`. Do NOT duplicate.
- **AgentPerformanceView** → `src/components/AgentPerformanceView.jsx` — per-agent success/error counts + avg latency from orchestration receipt data. Props: `receipts`. Do NOT recreate.
- **WorkspaceExportImportView** → `src/components/WorkspaceExportImportView.jsx` — export all `alphonso_*` localStorage keys as JSON download; import via FileReader with prefix validation. Rendered in SettingsView. Do NOT create another export/import UI.
- **RightPanel tabs** → `src/components/RightPanel.jsx` now has System + Audit tabs; Audit tab shows last 10 approval events from `agentAuditService`. Security section lives inside System tab. Do NOT add a separate panel for this.
- **ChatView drag-drop** → `src/components/ChatView.jsx` — file drag-and-drop onto chat input, file pills, `[Attached files: ...]` suffix appended to messages. Hector briefing card (sky-tinted, dismissible) shows top 3 sources. All state in `ChatView`.
- **crashLogService** → `src/services/crashLogService.js` — localStorage ring buffer (100 entries, `alphonso_crash_log_v1`). `logError(error, context)`, `getCrashLog()`, `clearCrashLog()`. Do NOT create another error logging system.
- **agentAuditService** → `src/services/agentAuditService.js` — localStorage ring buffer (100 entries, `alphonso_approval_audit_v1`). `logApprovalEvent(packetId, agent, action, outcome)`, `getAuditLog()`, `clearAuditLog()`. Do NOT duplicate.
- **workspaceExportService** → `src/services/workspaceExportService.js` — exports/imports all `alphonso_*` localStorage keys as JSON. `exportWorkspace()`, `importWorkspace(jsonString)`. Do NOT create another backup/export service (also see `backupService.js`).
- **cacheService maxEntries** → `src/services/cacheService.ts` — hard cap of 500 entries (`DEFAULT_MAX_ENTRIES`) with oldest-key eviction on every `set()`. `CacheOptions.maxEntries` controls per-instance limit.
- **retryDeadLetter** → `src/services/orchestrationQueueService.ts` — exported `retryDeadLetter()` replays all `dead_letter` packets via `replayPacketFromDeadLetter()`. Do NOT add duplicate dead-letter retry elsewhere.
- **OllamaModelPicker** → `src/components/ModelSwitcher.jsx` also exports `OllamaModelPicker` (legacy Ollama model selector). The default export `ModelSwitcher` is the 3-pill switcher (Ollama/Claude/ChatGPT). ChatView imports both.
- **sentinelSecurityService scheduled scans** → `src/services/sentinelSecurityService.js` — `startScheduledScans(intervalMs, onResult)` returns a cleanup function. Do NOT create another scheduled scan loop.
- **novaAnalysisService opportunity history** → `src/services/novaAnalysisService.js` — `saveOpportunityScore(score, recommendation)` + `getOpportunityHistory()` persist last 30 scores to `alphonso_nova_history_v1`. Do NOT recreate.
- **OnboardingWizard connector step** → `src/components/OnboardingWizard.jsx` — 4-step wizard; step 3 = "Connect a channel" (Telegram/WhatsApp/Skip), saves to `alphonso_onboarding_connector_v1`. Do NOT add another onboarding flow.
- **CrashLogView** → `src/components/CrashLogView.jsx` — entry list with timestamp/message/context keys, "Clear" button; rendered in SettingsView "Logs" tab. Do NOT duplicate.
- **NovaHistoryChart** → `src/components/NovaHistoryChart.jsx` — SVG sparkline (last 10 scores, indigo polyline), latest score + recommendation, wired in SettingsView. Do NOT recreate.
- **SentinelFindingModal** → `src/components/SentinelFindingModal.jsx` — fixed overlay, severity badge (critical/high/medium/low), pattern + recommendation; triggered from RightPanel. Do NOT duplicate.
- **durableStore** → `src/lib/durableStore.js` — `durableGet/Set/Remove` sync to localStorage + async fire-and-forget to Tauri `kv_set`. Use this for any new service that persists data. Do NOT call `localStorage` directly in new services.
- **Gateway Dockerfile** → `gateway/whatsapp-cloud/Dockerfile` — multi-stage Node 20 Alpine. `.dockerignore` alongside. Do NOT create another container config.
- **TypeScript components (.tsx)** → AgentStatusStrip, UpdaterNotification, NotificationCenter, AgentPerformanceView, TopBar are now `.tsx` with typed props. Do NOT recreate as `.jsx`. Remaining large components (ChatView, RightPanel, SettingsView, App, Sidebar) still `.jsx`.

---

## 10. Global Rules for Every Agent

- Read this file before any other document.
- Inspect the actual filesystem before assuming anything is missing or present.
- Do not commit, print, copy, or expose secret values. If you find secrets, report variable names only.
- Do not fake completed work. Mark scaffold/partial items explicitly.
- Keep changes scoped to your assignment.
- Leave a final report with: files changed, completed, not completed, risks, how to test, next step.
- If you add a service, test, workflow, or agent, update this file.

---

## 11. TODO — Deferred Work (confirmed gaps, not forgotten)

These items were explicitly deferred by the product owner. Do not skip them permanently — revisit when the milestone conditions are met.

### Gap 5 — macOS Support (deferred until Windows is fully mature)
**Decision (2026-06-20):** Focus on Windows first. Once the app reaches maturity on Windows, backport macOS support in a single focused effort.
**What will be needed when the time comes:**
- Tauri `[bundle]` targets: add `"dmg"`, `"app"` to `src-tauri/tauri.conf.json`
- CI: add `macos-latest` runner to `ci.yml` and `release.yml`
- Code-sign with Apple Developer certificate in GitHub Secrets
- Test native IPC (Ollama, SQLite, kv_store, connector sockets) on Darwin
- Replace any Windows-path assumptions in `workspace.rs` (path separators, home dir)
- Test installer flow on macOS (DMG notarization)

### UI / UX Improvements (next UI sprint)
The following improvements were noted but deferred to a dedicated UI sprint:
- **Onboarding flow** — first-launch experience: Ollama offline detection → model pull prompt → connector setup wizard
- **Ollama offline state** — currently fails silently or shows cryptic errors; needs a visible banner/prompt when Ollama is unreachable
- **Composio onboarding** — user must know to enter API key at composio.dev and then in Settings → Composio; no in-app guide
- **WhatsApp gateway deploy guide** — in-app instructions for Railway deployment of `gateway/whatsapp-cloud/`
- **Component test coverage** — currently ~6%; target 15% minimum for UI components

### Railway Deployment (gateway live — no ALPHONSO_FORWARD_URL needed)
**Two Railway configs exist:**
1. **Root `railway.json`** → deploys React frontend as static web app (no Rust/Ollama)
2. **`gateway/whatsapp-cloud/railway.json`** → deploys WhatsApp Cloud webhook gateway (24/7 microservice)

**The gateway is fully code-complete and deployed.** Required env vars in Railway dashboard:
- `WHATSAPP_VERIFY_TOKEN` — your webhook verify token (same value as in Alphonso connector UI)
- `WHATSAPP_APP_SECRET` — from Meta App Dashboard → App Settings
- `WHATSAPP_ALLOWLIST` or `WHATSAPP_ALLOWED_NUMBERS` — comma-separated allowed phone numbers (digits only, no `+`)
- `ALPHONSO_FORWARD_URL` — **optional**; gateway has a built-in queue so this is no longer required

**Alphonso credentials to set in Settings → Connectors → WhatsApp:**
- `WHATSAPP_ACCESS_TOKEN` — from Meta App Dashboard
- `WHATSAPP_PHONE_NUMBER_ID` — WhatsApp Business phone number ID
- `WHATSAPP_VERIFY_TOKEN` — same token as set in Railway
- `WHATSAPP_CLOUD_GATEWAY_DRAIN_URL` — `https://<your-railway-url>/queue/drain`
- `WHATSAPP_ALLOWED_NUMBERS` — comma-separated allowed sender numbers (digits only)

After Railway deploy: point Meta webhook URL to `https://<your-railway-url>/webhook`.

---

## 12. Known Audit Errors (for future reference)

These errors appeared in `ALPHONSO-AUDIT-2026-05-31.md` and `ALPHONSO_PARALLEL_SUBAGENTS_2026-05-31.md`. They are recorded here so future sessions do not repeat them.

| What the audit said | What is actually true |
|---|---|
| "No real test suite — zero coverage, no test files found" | 37 test files exist in `src/test/` covering Jose pipeline, connectors, Ollama, approval enforcement, WhatsApp, workflows, and more |
| "Testing score: 4.0/10 F" | The gap is Rust tests + coverage thresholds + E2E, not absence of tests |
| "Claude and ChatGPT connectors are frontend-only stubs" | Both run through `policyEnforcementService.js` and `connectorRegistryService.js` with policy gating, audit receipts, and fail-closed behavior |
| "4 agent personas: Alphonso, Jose, Hector, Miya" | 9 agents: + Maria, Marcus, Echo, Sentinel, Nova — all with profile + permissions files and `agentContractService.js` enforcement |
| "No CI/CD" (implied by Testing F grade) | Two GitHub Actions workflows exist: `ci.yml` (lint + test + build + Tauri artifact + cargo clippy/test) and `release.yml` (tag-triggered build + sign + publish) |
| ".env not in .gitignore" (implied) | `.env` and `.env.*` are correctly listed in `.gitignore`; the concern is git history, not current config |

**Root cause of all errors:** The audit was produced without reading `src/test/`, `src/agents/`, all of `src/services/`, or `.github/workflows/`. Future audits must verify all four directories before scoring any dimension.

---

_Last verified: 2026-06-22 — v2.0.6: Sprint Next-10 complete, rustfmt CI fix, docs accuracy pass, mobile companion sprint plan. 112 test files (111 + services/agentContract.test.ts), 1621+ tests passing. 14 Rust unit tests passing. `npm run lint` clean, `npm run build` clean (main chunk **288KB**, budget 550KB), `cargo clippy -- -D warnings` clean, `cargo fmt --check` clean (rustfmt.toml added). `lib.rs` ~1,585 lines (18 extracted modules). Coverage ~35%+ (threshold 20%, src/ scoped). Version 2.0.5. All 9 agent runtimes live. rustfmt.toml in src-tauri/. Run `npm run verify:app` and `cargo clippy -- -D warnings` from src-tauri/ to re-verify._

> _How to verify drift:_ run `npm run export:ground-truth` and read the **Drift vs ground truth** section of the generated file. It will flag any numeric claim in this document that diverges from the live repo.
