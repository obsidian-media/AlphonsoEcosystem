# ALPHONSO — Agent Ground Truth & Shared Context
**Last verified:** 2026-07-02 — v2.5.0-security
**Verified by:** Bob (IBM) — feat/batch1-security-infra-bobibm — all 4 phases complete
**Version:** 2.5.0-security (Batch 1 complete: boot crash fixed, 18 security findings resolved, infrastructure hardened)
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
| Version | 2.5.0 |
| Type | Tauri v2 desktop app (Windows) |
| Project root | `D:\AgentDevWork\repos\AlphonsoEcosystem` |
| Backend | Rust 1.77, Tauri 2.11, SQLite (rusqlite bundled), tokio, reqwest, tokio-tungstenite (companion) |
| Frontend | React 18, Vite 5, Tailwind 3, Lucide React, Framer Motion — 114 `.tsx` + 0 subdirectory `.jsx` components (TypeScript migration complete; only top-level utility .jsx files remain if any) |
| UI System | **OKLCH** CSS design token system (`src/styles/tokens.css` — all colors in `oklch()` syntax), Framer Motion animation library (`src/lib/motion.ts` — spring/tween/fadeUp/fadeIn/slideInRight/scaleIn/staggerContainer/staggerItem/messageIn/panelIn), component library in `src/components/ui/` (Button, Badge, Card, Input, Tabs, Modal, EmptyState, StatusDot, LoadingState, ProgressRing, Skeleton, index.ts) |
| AI layer | Ollama local (`llama3.2:3b` default), Claude API, OpenAI API |
| Voice OS | FastAPI + Python microservice in `voice/` — STT (faster-whisper), LLM (Ollama `/api/chat`), TTS (piper), VAD (webrtcvad), barge-in cancellation. Launched as Tauri sidecar via `voice_sidecar.rs`. |
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

### Voice OS (added feat/voice-os sprint)
- `src/services/voiceOsService.js` — Tauri `invoke` wrappers: `startVoiceServer`, `stopVoiceServer`, `getVoiceServerStatus`, `getVoiceWebSocketUrl`. Appends `agentActivityService` events on start/stop.
- `src/hooks/useJarvisVoice.ts` — React hook for voice WebSocket: `start`, `stop`, `reset`, `state`, `transcript`, `reply`, `activeAgent`, `error`, `isConnected`. Uses **AudioWorklet** (not deprecated ScriptProcessor).
- `src-tauri/src/voice_sidecar.rs` — `VoiceSidecar` state struct + `voice_start`/`voice_stop`/`voice_status` Tauri commands. `voice_start` accepts `app: tauri::AppHandle` and resolves the backend path via `app.path().resource_dir().join("voice/backend")` — works in both dev and production installs. `voice/backend/**` is included in bundle resources via `tauri.conf.json`.
- `voice/backend/` — Python FastAPI: `main.py` (lifespan preload, CORSMiddleware, `/health`, barge-in, conversation history), `pipeline.py` (async generator: VAD→STT→agent→LLM→TTS), `router.py` (9-agent regex routing), `state.py` (per-session `get_state`/`set_state`/`remove_state`), `session.py` (task registry, barge-in cancel), `stt.py` (faster-whisper + lru_cache), `tts.py` (piper + ThreadPoolExecutor, async `synthesize()`), `vad.py` (webrtcvad `is_speech()`)
- `voice/backend/tests/` — `test_state.py`, `test_session.py`, `test_router.py`, `test_stt.py`, `test_pipeline.py`
- `voice/frontend/src/useJarvisVoice.ts` — Standalone frontend hook (AudioWorklet, all exports)
- `voice/frontend/src/pcm-processor.worklet.ts` — AudioWorklet processor (PCM float32→int16)
- `src/hooks/pcm-processor.worklet.ts` — **copy required by `useJarvisVoice.ts`** (the hook imports from `./pcm-processor.worklet`; the voice/frontend version is a separate package). Do NOT remove this file.

### UI Polish Sprint (v2.3.1)
- `src/services/connectors/perplexityConnector.js` — Perplexity AI search: `isPerplexityConfigured`, `searchPerplexity`. Calls `/chat/completions` with `llama-3.1-sonar-small-128k-online`.
- **6 pages tab-overhauled**: `ProjectExecutionMode.jsx` (4 tabs), `HectorResearchDesk.jsx` (3 tabs), `OrchestratorView.jsx` (4 tabs), `MiyaStudio.jsx` (tab-conditional layout), `EcosystemHub.jsx` (flat header + pill toggle), `ContentCatalystWorkspace.jsx` (max-w-5xl wrapper).

### JUNE CANDY Additions (v2.2.8 – v2.3.0)
- `src/services/connectors/tavilyConnector.js` — Tavily AI search (free tier 1K/mo), `searchTavily`, `isTavilyConfigured`. Wired as tier-2 fallback in `hectorResearchService.js` (Brave → Tavily → DuckDuckGo → RSS).
- `src/services/chromaDbService.js` — ChromaDB local vector DB (port 8000): `addMemoryToChroma`, `semanticSearchMemory`, `deleteMemoryFromChroma`, `isChromaHealthy`. Fire-and-forget write from `echoMemoryService.runEchoPreservation`.
- `src/services/whisperTranscriptionService.js` — Whisper meeting transcription: `transcribeAndIngest(audioFilePath, filename, onProgress)` — calls `transcribe_audio_file` Tauri command → Ollama summarize → Echo `pushMemoryItem`.
- `src/services/connectors/n8nConnector.js` — n8n workflow automation: `isN8nHealthy`, `triggerN8nWebhook`, `listN8nWorkflows`, `setN8nWorkflowActive`. Wired as Marcus distribution target (`n8n|workflow.*trigger`). All endpoints have AbortController timeouts (15s/10s/5s).
- `src/services/moduleRegistryService.ts` — Agent OS module registry: `installModule`, `enableModule`, `disableModule`, `listModules`, `getModule`, `uninstallModule`. Persisted via durableStore as `alphonso_modules_v1`. Reads `module.toml` manifests.
- `src/services/runtimeApiService.ts` — Bridge client (port 4444) for module lifecycle: `listModules`, `runModule`, `getRunStatus`, `publishEvent`. Falls back to registry when bridge offline. 10s AbortController timeout.
- `src/services/policyDslService.ts` — Module-level policy evaluation: `loadPolicy`, `evaluateAction`, `getPolicyRules`. Uses hardcoded rules from `policy.yaml` spec. Separate from `policyEnforcementService`.
- `src/services/a2aProtocolService.ts` — A2A task delegation: `delegate`, `getTaskStatus`, `updateTaskResult`, `listActiveTasks`, `listTasksByAgent`. Uses agentBusService for message passing; persists to `alphonso_a2a_tasks_v1`.
- `src/services/joseSchedulerService.js` — Jose cron scheduler: `createSchedule`, `listSchedules`, `saveSchedule`, `deleteSchedule`, `startScheduler`, `stopScheduler`. `SCHEDULE_PRESETS`: 30min/hourly/daily/weekly. Polls every 60s, fires callback when due. Started in `App.tsx`.
- `src/services/echoFileWatcherService.js` — Echo inbox file watcher: `startFileWatcher`, `stopFileWatcher`, `getWatcherConfig`, `saveWatcherConfig`. Polls via `watch_inbox_poll` Tauri command every 30s, auto-summarizes with Ollama, saves to Echo via `runEchoPreservation`, deduplicates via `.processed` suffix. Started in `App.tsx`.
- `mcp-server/server.js` — MCP server (port 3333): 5 tools (`alphonso_run_pipeline`, `alphonso_search_memory`, `alphonso_research`, `alphonso_get_status`, `alphonso_get_receipts`), callable from Claude Desktop/Cursor/Windsurf.
- `bridge/server.js` — Alphonso Bridge (port 4444): proxies MCP tool calls to Ollama `/api/chat` for live responses; `alphonso_get_status` checks Ollama `/api/tags` for real health + model list.

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

## 4. Test Suite — 186 Files in `src/test/` (not zero)

The test suite exists and is substantial. Any agent or audit that says "no test suite" or "zero coverage" is wrong.

**Test files (verified 2026-06-29 v2.5.0, all passing):**
- 186 test files, 2518+ tests passing
- 14 Rust unit tests passing (`cargo test` in src-tauri/)
- 22+ new test files added in Batch 2 (feat/batch2-testing-completeness)
```
a2aProtocolService.test.ts          ← added Batch 2 (20+ tests)
agentProfiles.test.js               ← added Batch 2 (9-agent profile completeness)
approvalService.test.js             ← added Batch 2 (15+ tests)
chatgptService.test.js              ← added Batch 2 (10+ tests)
claudeService.test.js               ← added Batch 2 (10+ tests)
coachModeService.test.js            ← added Batch 2 (10+ tests)
companionIntegration.test.js        ← added Batch 2 (8+ tests)
connectorHealthCheckService.test.js ← added Batch 2 (10+ tests)
connectorImageGenerators.test.js    ← added Batch 2 (12+ tests)
connectorPolling.test.js            ← added Batch 2 (10+ tests)
connectorRateLimiterService.test.js ← added Batch 2 (10+ tests)
externalAgentAdapter.test.js        ← added Batch 2 (21 tests)
memoryMonitorService.test.js        ← added Batch 2 (8+ tests)
moduleRegistryService.test.ts       ← added Batch 2 (15+ tests)
offlineChatService.test.js          ← added Batch 2 (10+ tests)
orchestrationGovernanceService.test.js ← added Batch 2 (12+ tests)
runtimeApiService.test.ts           ← added Batch 2 (12+ tests)
toolRegistryService.test.js         ← added Batch 2 (10+ tests)
verificationChainService.test.js    ← added Batch 2 (15+ tests)
verificationService.test.js         ← added Batch 2 (15+ tests)
voiceOsService.test.js              ← added Batch 2 (10+ tests)
whatsappBrowserConnector.test.js    ← added Batch 2 (10+ tests)
whisperTranscriptionService.test.js ← added Batch 2 (10+ tests)
workflowBuilderService.test.js      ← added Batch 2 (15+ tests)
workflowReceiptService.test.js      ← added Batch 2 (10+ tests)
workflowTelemetryService.test.js    ← added Batch 2 (10+ tests)
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
CompanionPairingPanel.test.jsx      ← added companion Phase 2 (7 tests)
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
tavilyConnector.test.js              ← added JUNE CANDY v2.2.8 (5 tests)
chromaDbService.test.js              ← added JUNE CANDY v2.2.9 (8 tests)
n8nConnector.test.js                 ← added JUNE CANDY v2.3.0 (12 tests)
joseSchedulerService.test.js         ← added JUNE CANDY v2.3.0 (14 tests)
echoFileWatcherService.test.js       ← added JUNE CANDY v2.3.0 (14 tests)
```

**Rust tests (verified 2026-06-15, Session 13):**
- 17 tests in `src-tauri/src/lib.rs`, `src-tauri/src/companion_auth.rs`, `kv_store.rs`, `whatsapp_webhook.rs` — all passing
- `cargo clippy -- -D warnings` clean

**What agents working on testing should focus on:**
- 186 test files / 2518+ tests (Batch 2 added 22+ new files covering previously untested services)
- Coverage expanded significantly across agent adapters, connector services, voice OS, workflow services
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
typecheck                tsc --noEmit
verify:app               npm run lint && npm run typecheck && npm run test && npm run build
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
| Brave Search | `connectorRegistryService` via `hectorResearchService` | No | API key-dependent |
| Tavily | `tavilyConnector.searchTavily` | No | API key-dependent (tier-2 Hector fallback) |
| n8n | `n8nConnector.triggerN8nWebhook` | No | Local service at localhost:5678; Marcus distribution target |

All paths: fail-closed on missing credentials, blocked in zero-cost mode unless explicitly overridden, approval-gated for risky external actions.

---

## 8. Real Gaps — What Actually Needs Work

These are confirmed gaps as of 2026-07-02. Any agent working on these areas should check current state before implementing.

### OPEN GAPS (as of v2.5.0-security)
- [ ] **Voice OS Python dependency** — Voice OS in Runtime Hub can Install/Start, but requires Python 3.10+ on PATH. `find_python()` checks standard paths but won't auto-install Python itself. User must have Python installed first.
- [ ] **Plugin true execution isolation** — `pluginSandboxService.js` IS imported and wired via `PluginContext.jsx:95` (`evaluatePluginExecutionPolicy`). But the policy check validates args only (arg count, blocked tokens, injection patterns) — there is no Web Worker, iframe, or subprocess isolation. Plugin tools run in the main thread.
- [ ] **Rust cargo check for new crates (arboard, tauri-plugin-dialog, tauri-plugin-opener)** — added to Cargo.toml in Batch 1 but not yet verified to compile on CI (first CI run on this branch will confirm).

### CLOSED — Batch 1 Security Sprint (2026-07-02, Bob/IBM)
- [x] **Boot crash: TDZ ReferenceError on launch** — `appConstants.js` imported `VOICE_STATES` from `voiceService.js` at module scope. Rollup couldn't safely order the module initialization chain, causing a TDZ crash. Fixed by inlining `VOICE_STATES` as a literal const inside `appConstants.js`. Build ✓ Tests ✓ (2,555 passing).
- [x] **C-2: Policy gate — 6 browser-only connectors** — verified already wired (`deepseekConnector`, `perplexityConnector`, `tavilyConnector`, `n8nConnector`, `githubConnector`, `slackConnector` all call `evaluatePolicyGate`).
- [x] **C-3: getComfyUiVideoHistory missing policy gate** — `gateConnectorAction` now called at top of function before circuit breaker.
- [x] **C-4/C-5: Path traversal in transcribe_audio_file + save_image_to_folder** — verified already protected.
- [x] **C-6: OAuth state + token redaction** — verified all 3 scripts already have proper state validation and safe error logging.
- [x] **H-1: Shell interpreters in policy_gate.rs** — verified `cmd.exe`, `powershell.exe`, `pwsh.exe` already removed.
- [x] **H-2: sanitize() in execute_command_verified was a no-op** — `String::replace()` does literal matching; pattern was never applied. Replaced with real line-by-line redaction scanning for api_key/token/secret/password/bearer patterns.
- [x] **H-3/H-4: SSRF — fetch_url_content had no IP blocklist** — `crate::search::is_private_ip()` now called before every fetch. `fetch_research_sources` was already protected.
- [x] **H-5/H-6: Symlink escape + watch_inbox_poll** — verified already protected via `canonicalize` + `starts_with`.
- [x] **H-7: Gateway /health leak** — verified already returns `{ ok: true, status: "ok" }` only.
- [x] **M-1: policyDslService dead code** — wired into `gateConnectorAction` as a DSL pre-check layer (deny rules block before main gate evaluation).
- [x] **M-2: gateConnectorAction exception safety** — wrapped in try/catch returning `{ ok: false, blocked: true, reason: 'Policy gate internal error' }`.
- [x] **M-3: Meta OAuth client_secret in URL** — both token exchanges now POST body.
- [x] **M-4: PKCE missing from all 3 OAuth scripts** — `code_verifier`/`code_challenge` (S256) added to YouTube, Meta, Outlook.
- [x] **M-5: open_url used shell (cmd /C start)** — replaced with `tauri-plugin-opener`.
- [x] **M-6: alphonso_bridge_send_packet created new reqwest::Client per call** — now uses managed shared `reqwest::Client` from Tauri state.
- [x] **M-7: Clipboard used PowerShell** — replaced with `arboard` crate.
- [x] **M-8: pick_file/pick_folder used PowerShell WinForms** — replaced with `tauri-plugin-dialog`.
- [x] **L-1: connect-src CSP was localhost:* wildcard** — narrowed to explicit ports (11434/5173/4444/4000/7860/8188/5678/8765 + ws:// variants).
- [x] **L-3: .env value escaping in Meta + Outlook auth scripts** — backslash/newline/hash now escaped.
- [x] **L-4: Queue drain used same token as webhook verification** — `ALPHONSO_DRAIN_TOKEN` env var added with fallback to `VERIFY_TOKEN`.
- [x] **L-5: OAuth callback servers bound to 0.0.0.0** — all 3 scripts now bind to `127.0.0.1`.
- [x] **L-6: policy_gate.rs allowed any args for sensitive programs** — `allowed_args()` function added for git/cargo/docker/npm with subcommand allowlists; wired into `execute_command_verified`.
- [x] **Infrastructure: .nvmrc + .editorconfig missing** — both created.
- [x] **Infrastructure: build.ps1 had stale 0.1.0 version** — updated to 2.4.4.

### CLOSED — v2.4.4 (2026-06-28)
- [x] **iOS companion router — events emitted but no frontend listener** — Already closed: `App.tsx` line 375+ listens for `companion://command`, `companion://abort`, `companion://approve` events and routes them to the execution engine. Swift WebSocketService (MDNSService.swift, WebSocketService.swift) matches Rust JSON-RPC protocol (companion_router.rs). 12 integration tests added in `companionIntegration.test.js`.
- [x] **DeepSeek connector** — `src/services/connectors/deepseekConnector.js` created: `isDeepSeekConfigured`, `sendDeepSeekMessage`, `searchWithDeepSeek`. Credential UI added to ConnectorSetupPanel. `externalAgentAdapter.js` wired: `runExternalAgentTask('deepseek', task)` calls DeepSeek API live. Hector tier-3 fallback added. 4 tests in `deepseekConnector.test.js`.
- [x] **PWA offline ChatView wiring** — `saveMessageOffline()` from `offlineChatService.js` now called in ChatView.tsx (import added line 43; called on Ollama stream error at line 687). Messages are saved to IndexedDB when Ollama is unreachable.
- [x] **Runway API key credential UI** — Already closed in prior sprint (ConnectorSetupPanel.tsx line 701). Ground Truth was stale.
- [x] **Plugin sandbox wiring** — Already closed: `PluginContext.jsx` imports and calls `evaluatePluginExecutionPolicy` before every tool run. Ground Truth was stale (incorrect "never imported" claim).
- [x] **agentContractService alphonso allowedActionPrefixes** — `execute_command` and `filesystem_` added to alphonso's allowed prefixes. Fixes test `allows alphonso execute_command`. Alphonso is the operator agent and CAN run commands and filesystem ops.

### CLOSED (historical — do not re-implement)

### SECURITY
- [x] **CSP fixed** — `"security": { "csp": null }` replaced with full production policy string in `tauri.conf.json` (2026-05-31, Agent A). See `docs/SECURITY_CONFIG_REPORT.md`.
- [x] **GPU flags removed** — `--disable-gpu --disable-gpu-compositing --use-angle=swiftshader` deleted; hardware acceleration now active (2026-05-31, Agent A).
- [x] **Window size fixed** — changed to 1280×800, `minWidth: 1024`, `minHeight: 700` (2026-05-31, Agent A)
- [x] **.env.example sanitized** — real phone numbers in `WHATSAPP_ALLOWED_NUMBERS` replaced with placeholders (2026-05-31, Agent A)
- [x] **.gitignore verified** — `.env`, `.env.*`, `.tauri-updater-key`, `.tauri-updater-key.pub` all correctly excluded
- [x] **Git history audit** — DONE (2026-06-01, Session 3). `git log --follow -- .env` returned empty — `.env` was NEVER committed. History is clean. No rotation needed.
- [x] **Tauri capability scoping** — DONE (2026-06-01, Session 3). Findings: `src-tauri/capabilities/default.json` grants only `core:default`, `notification:default`, `global-shortcut:default`. All file-write commands include path-traversal guards. One mild finding: `check_env_vars_presence` accepts arbitrary env var names (probes presence only, no value leakage). No action required; document for awareness.

### RUST BACKEND
- [x] **`lib.rs` modular split completed** — Phases 1+2 extraction done (2026-06-09): `lib.rs` is now ~2,024 lines (grew with Runtime Manager additions), down from original 7,078 (5,623 lines extracted across 16 modules: whatsapp_webhook, kv_store, native_proof, plugin_runtime, policy_gate, audit_log, ollama, memory_store, meta_publish, connector_commands, search, telegram, workspace, youtube, runway, main).
- [x] **lib.rs KV store split** — `src-tauri/src/kv_store.rs` created (2026-06-01, Session 4): `ensure_kv_table`, `kv_set`, `kv_get`, `kv_delete`, `save_settings`, `load_settings` extracted. `kv_delete` added 2026-06-25 (previously missing — `durableRemove` was setting keys to `''` instead of deleting). `open_memory_db` marked `pub(crate)`.
- [x] **lib.rs continued splitting + plugins extracted** — DONE (2026-06-07, OpenCode): `plugin_runtime.rs`, `policy_gate.rs`, `audit_log.rs`, `ollama.rs`, `memory_store.rs`, `meta_publish.rs`, `runway.rs`, `native_proof.rs` now own their own modules. `cargo check` clean, `cargo clippy -- -D warnings` clean, `cargo test` clean (14 Rust unit tests passing).
- [x] **Policy gate expanded** — `policy_gate.rs` whitelist expanded from 8 to 40+ programs: python, pip, cargo, npx, yarn, pnpm, curl, wget, ffmpeg, docker, pwsh, explorer, chrome, copy, xcopy, robocopy, mkdir, del, and more. Still blocks: cmd, rm, shutdown, format, net, reg.
- [x] **New Tauri commands** — `read_workspace_file`, `delete_workspace_file`, `move_workspace_file`, `search_workspace_files`, `list_workspace_directory`, `open_url`, `fetch_url_content`, `read_clipboard`, `write_clipboard`. All with safe path validation (no escape from workspace root).
- [x] **Voice sidecar module** — `src-tauri/src/voice_sidecar.rs` added (2026-06-24, feat/voice-os): `VoiceSidecar(Mutex<Option<Child>>)` state, `voice_start`/`voice_stop`/`voice_status` Tauri commands registered in `lib.rs`. `cargo clippy -- -D warnings` clean. **P1-08 CLOSED 2026-06-27**: `Stdio::null()` → `Stdio::piped()` for stdout+stderr; `BufReader` threads pipe to `log::info!`/`log::warn!` so voice OS subprocess errors are no longer invisible.
- [ ] **lib.rs further splitting** — Optional: Telegram connector block can be extracted further if needed.
- [x] **Rust unit tests added** — 14 tests in `#[cfg(test)] mod tests` covering `allowed_program`, `plugin_blocked_token_present`, `validate_plugin_extra_args`, `trim_trailing_slashes`, `wal_pragma_applies_on_in_memory_db`, `to_hex` — all passing (verified `cargo test` 2026-05-31, Agent D)
- [x] **Shared `reqwest::Client`** — built at startup, registered via `.manage()`, used by `connector_poll_telegram`, `connector_send_telegram`, `connector_send_chatgpt`, `connector_send_claude` (2026-05-31, Agent D).
- [x] **SQLite WAL mode + cache** — `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-65536;` in `open_memory_db()` — 64MB page cache added (2026-06-01, Agent 3)
- [x] **`unwrap()` audit done** — 1 runtime `.unwrap()` found, replaced with safe `match + continue`. Two startup-only `.expect()` calls intentionally kept.
- [x] **Clippy clean** — All 27 pre-existing clippy warnings fixed (2026-06-01, Session 3): `&PathBuf→&Path` in 7 functions across `lib.rs`/`runway.rs`, identity map removed, `.clamp()` used, `sort_by_key`, `#[allow(too_many_arguments)]` on 3 functions. `cargo clippy -- -D warnings` now passes on CI.

### FRONTEND
- [x] **OKLCH design token system** — `src/styles/tokens.css` uses `oklch()` color syntax for all surface, accent, text, and agent color variables. No hex hardcoding. (2026-06-24, feat/ui-ux-overhaul)
- [x] **Framer Motion animation library** — `framer-motion` in `package.json`. `src/lib/motion.ts` exports: `spring`, `tween`, `fadeUp`, `fadeIn`, `slideInRight`, `scaleIn`, `staggerContainer`, `staggerItem`, `messageIn`, `panelIn`. Chat messages wrapped in `AnimatePresence` with `motion.div` per message using `messageIn` variants. (2026-06-24, feat/ui-ux-overhaul)
- [x] **Full token sweep** — `OnboardingWizard`, `AgentStatusStrip`, `AutomationView`, `SettingsView EchoTimeline`, `RightPanel`, `TopBar`, `MissionControlHome` — all `zinc-*/indigo-*` hardcoded classes replaced with CSS var tokens. (2026-06-24, feat/ui-ux-overhaul)
- [x] **Sidebar collapsed tooltips** — collapsed sidebar nav buttons show `title` + `aria-label` for keyboard and hover accessibility. (2026-06-24, feat/ui-ux-overhaul)
- [x] **Voice OS sidecar integration** — `RuntimeManagerView` has `voice-os` entry in `TOOL_META`; `voiceOsService.js` wires Tauri commands; `useJarvisVoice.ts` hook uses AudioWorklet. (2026-06-24, feat/voice-os)
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
- [x] **Jose pipeline output consolidated** — All pipeline results (`PipelineResultCard`, `ApprovalPanel`, execution receipts, Nova insight) render inline under the last assistant message. Previously floated in 4 separate panels below the chat. Approval buttons appear directly in the chat thread. (2026-06-24, v2.2.3)
- [x] **Auto-scroll fixed** — Chat now scrolls to new messages by default (`settings.autoScroll !== false`). Previously required opt-in via `settings.autoScroll === true`. (2026-06-24, v2.2.3)
- [x] **Connector verification fixed** — `verifyConnectorEnvironment` now checks UI credential store (localStorage `alphonso_connector_credentials_v1`) in addition to OS env vars. Credentials entered in the settings panel now correctly verify. `saveConnectorApiKey` and `saveTelegramCredentials` auto-verify after save. (2026-06-24, v2.2.3)
- [x] **Connector status live refresh** — `ConnectorStatusDot` and `ConnectorStatusStrip` now poll every 5s and listen for `alphonso-connector-saved` CustomEvent. `ConnectorSetupPanel.refresh()` dispatches this event so status dots update instantly after saving credentials, without requiring a page reload. (2026-06-25, patch1)
- [x] **Null-guard boot fixes** — Three `invoke()` calls that return `null` (not throw) were crashing on boot. Fixed: `RuntimeManagerView` `getAllStatus()` uses `?? []`; `connectorRegistryService` both `check_env_vars_presence` calls use `?? {}`; `coachModeService` `getByLabel()` calls append `.catch(() => null)`. `CoachContext` `handleToggleCoachMode/Top` wrapped in try/catch — no-ops cleanly in web mode. (2026-06-25, patch2)
- [x] **Browse fallbacks in SettingsView** — Output Folder and ComfyUI Dir "Browse" buttons now fall back to hidden `<input type="file" webkitdirectory>` when `invoke('pick_folder')` fails in web mode. Added: `outputFolderPickerRef`, `comfyuiDirPickerRef`, `handleOutputFolderPick`, `handleComfyUIDirPick`. (2026-06-25, patch2)
- [x] **Jarvis voice button in ChatView** — `useJarvisVoice` WebSocket pipeline (AudioWorklet) now wired into `ChatView.tsx`: mic button next to SpeechRecognition button, pulses while listening, shows active agent in tooltip, transcript populates the input field. Requires FastAPI voice server running (`voice/backend/`). (2026-06-25, patch2)
- [x] **Agents tab in RightPanel** — Tab bar is now **System | Audit | Agents**. Agents tab renders `AgentStatusStrip useAutoFeed` — live pulsing agent badges in the right sidebar. (2026-06-25, patch2)
- [x] **SentinelAllowlistPanel compact rewrite** — Fully restyled for sidebar embedding: inline form row, `flex-1 min-w-0` inputs, abbreviated type options (dom/path/ip), list capped at `max-h-48 overflow-y-auto`, CSS variable theming. No longer overflows RightPanel width. (2026-06-25, patch2)
- [x] **pcm-processor.worklet.ts dead class removed** — Dead `class PcmProcessor extends AudioWorkletNode` placeholder existed at module level. `AudioWorkletNode` is browser-only; jsdom test environment does not define it. Adding `useJarvisVoice` to `ChatView.tsx` pulled this file into the test graph and caused 1 test failure. Only `PCM_WORKLET_CODE` string export is needed — placeholder class removed. All 144 test files now pass. (2026-06-25, patch2)
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
- [x] **durableStore / SQLite dual-write** — **CLOSED Sprint Next-10 T10** `src/lib/durableStore.js` — `durableGet/Set/Remove` writes to localStorage + fire-and-forgets to Tauri `kv_set`; applied to crashLogService, agentAuditService, novaAnalysisService. **Bug fixed 2026-06-25 patch1:** `durableRemove` previously called `kv_set(key, '')` (ghost entries on cold boot). Now correctly calls `kv_delete(key)` which issues `DELETE FROM kv_store WHERE key = ?`.
- [x] **Test coverage push** — **CLOSED Sprint Next-10 T3** 10 new service test files → 111 total / 1621+ tests: agentBrainService, workspaceFileService, proactiveAgentService, streamingService, browserAutomationService, backupService, composioService, agentActivityService, resourceCostService, marcusPublishService.
- [ ] **Branch protection on `main`** — CI not yet required before merge (GitHub settings, manual step)
- [x] **TypeScript migration (continued)** — **CLOSED Sprint Next-50 D5** App, Sidebar, RightPanel, SettingsView, ChatView all migrated to `.tsx`. Total: 10 TSX components. Remaining JSX: 63 components.
- [x] **TypeScript migration COMPLETE** — **CLOSED audit-sprint-26jun 2026-06-27** Final 20 subdirectory .jsx components migrated to .tsx (agents/, hector/, projectExecution/, research/, approval/, audit/, dashboard/ + ConnectorSetupPanel + ModelSwitcher). ui/Badge.jsx re-export shim deleted. Total: 114 .tsx, 0 subdirectory .jsx remain. P1-14 CLOSED.
- [x] **Connector credentials KV-primary** — **CLOSED audit-sprint-26jun 2026-06-27** `connectorAuth.js` now uses Tauri KV (SQLite) as primary store with in-memory `_credCache`. localStorage cleared after KV hydration. `hydrateConnectorCredentialsFromSqlite()` migrates and removes old localStorage keys. P1-05 CLOSED.
- [x] **Plugin signing keys KV-primary** — **CLOSED audit-sprint-26jun 2026-06-27** `pluginSigningService.js` stores keypair and trusted signer keys in KV; localStorage cleared after read. `hydrateTrustedSignerKeysFromKv()` migrates on boot. P2-14 CLOSED.

### BATCH 2 Completions (2026-06-29 — feat/batch2-testing-completeness → main)

- [x] **Phase 0 — Test fixes** — durableStore import path in connectorCircuitBreakerService fixed; policyEnforcement cache regression fixed; all tests passing.
- [x] **Phase 1 — Agent profile enrichment** — Echo, Sentinel, Nova profiles expanded from 8 → 25 properties (title, purpose, accentColor, visualIdentity, personality, strengths, limitations, allowedActions, blockedActions, outputTypes, requiresApprovalFor, defaultPrompt, skillPackIds, skillFocus, exampleTasks, hierarchyRank, mascotPath). All 9 agents now have full 25-property format. Agent profile completeness tests added (`agentProfiles.test.js`).
- [x] **Phase 2 — Test coverage expansion** — 22+ new test files covering previously untested services: approvalService, offlineChatService, coachModeService, connectorRateLimiter, voiceOsService, whisperTranscriptionService, externalAgentAdapter, connectorImageGenerators, connectorPolling, whatsappBrowserConnector, chatgptService, claudeService, connectorHealthCheck, memoryMonitor, workflowReceipt, workflowTelemetry, orchestrationGovernance, toolRegistry, verificationService, verificationChain, moduleRegistry, runtimeApi, a2aProtocol, workflowBuilder. Also added `bridge/tests/server.test.js` for MCP bridge.
- [x] **Phase 3 — Voice backend completion** — `voice/backend/vad.py` now implements real WebRTC VAD (`webrtcvad`, aggressiveness=2, 30ms frames at 16kHz) replacing energy heuristic stub. `voice/backend/router.py` implements full 9-agent routing via keyword/regex patterns (jose/hector/miya/maria/marcus/echo/sentinel/nova/alphonso). `requirements.txt` pinned to exact versions. Python tests updated for real VAD and routing.
- [x] **Phase 4 — UX completeness** — Voice sidebar nav entry added to `Sidebar.tsx` (Mic icon). `SmartVoiceButton.tsx` created — consolidates VoiceInputButton + Jarvis mic into one smart button (prefers Voice OS WebSocket, falls back to SpeechRecognition). `useJarvisVoice.ts` dispatches `alphonso:toast` on connection failure with setup guidance. `useAppShellState.js` refactored — sub-hooks extracted to reduce complexity. `e2e/voice.spec.js` + `e2e/visual.spec.js` added (visual regression baselines). `public/sw.js` updated with proper caching strategy (cache-first static, network-first nav, network-only API).
- [x] **Phase 5 — ExternalAgentAdapter wired** — `src/services/agentWorkshop/externalAgentAdapter.js` now wires: OpenAI/ChatGPT (credential-checked via `isConnectorAuthenticated('chatgpt')`), Claude/Anthropic (credential-checked), Ollama (local, no credentials needed), DeepSeek (credential-checked). Gemini documented as `planned_v2.6`. ACC documented as `not_wired` (requires MCP server). Import path fixed: `./connectorRegistryService.js` → `../connectorRegistryService.js`.
- [x] **Phase 6 — iOS companion verification** — Swift files in `ios/AlphonsoCompanion/` audited (MDNSService.swift, WebSocketService.swift, PINAuthService.swift). WebSocket + PIN auth flow verified against Rust `companion_router.rs` protocol. Swift ↔ Rust protocol mismatches fixed. `companionIntegration.test.js` added (8+ integration tests). iOS companion status documented as "Rust complete / Swift verified / integration tested".

### v2.2.4 UX Restructure (2026-06-25)
- [x] **Coach mode no visual feedback** — **CLOSED** `CoachContext.jsx` now sets `coachMode=true` and dispatches `alphonso:toast` even when Tauri window open fails. `ToastProvider` now listens to `window.alphonso:toast` CustomEvent for cross-context toasting.
- [x] **ACC Bridge config overload in Content page** — **CLOSED** `ContentCatalystWorkspace.jsx` now shows a 2-line status indicator (connected/not, Sync + Refresh buttons). Full config stays in Settings → Connectors.
- [x] **AgentDock not integrated in RightPanel** — **CLOSED** `AgentDock.jsx` added `embedded` prop (inline, no fixed positioning, no drag). `RightPanel.tsx` passes `agentDockCompanions` from App.tsx.
- [x] **Activity page too thin for standalone** — **CLOSED** `RuntimeManagerView.jsx` now has a Runtimes/Activity tab bar; Activity tab renders `AgentActivityLog`. Sidebar `activity` item removed.
- [x] **Knowledge/Files page too thin for standalone** — **CLOSED** `SettingsView.tsx` has a new "Knowledge" section that renders `FilesView`. Sidebar `files` item removed.
- [x] **Automation operations not interactive** — **CLOSED** `AutomationView.jsx` operations now have Enable/Active toggle via `updateWorkflowOperationStatus`.
- [x] **Telegram commands limited** — **CLOSED** 17 commands total: added `/ping`, `/agents`, `/nova`, `/scan` to `telegramCompanionService.js`.

### Runtime Hub (2026-06-23) — All 9 Gaps Fixed
- [x] **runtime_manager.rs** — full rewrite; all 9 gaps addressed:
  1. `find_python()` — PATH + Windows LOCALAPPDATA common paths + winget fallback
  2. `find_git()` — PATH + `C:\Program Files\Git` + winget fallback
  3. `find_ollama()` — PATH + `%LOCALAPPDATA%\Programs\Ollama\ollama.exe` + C:\Program Files\Ollama
  4. `run_streaming()` async — `tokio::process::Command` + `AsyncBufReadExt` line-by-line; emits `runtime://log` per line
  5. `ensure_venv()` — per-tool venv at `<install_dir>/venv/`; all pip via venv python
  6. AudioCraft args fixed — `demos/musicgen_app.py --server_name 127.0.0.1 --server_port 8765` (no `-m` module)
  7. InvokeAI resolved from `venv/Scripts/invokeai-web.exe` via `resolve_exe()`
  8. `autostart_all(state, app_handle)` — emits `runtime://boot_status` events per tool (starting/started/skipped/failed)
  9. `load_autostart_prefs()` / `save_autostart_prefs_to_disk()` — JSON at `%APPDATA%\Alphonso\runtimes\autostart_prefs.json`; new commands: `runtime_check_prerequisites`, `runtime_install_prerequisite`, `runtime_get_autostart_prefs`, `runtime_save_autostart_pref`
  — `cargo clippy -D warnings` clean
- [x] **runtimeManagerService.js** — 9 exported functions: `getAllStatus`, `listTools`, `installTool`, `startTool`, `stopTool`, `waitForTool`, `checkPrerequisites`, `installPrerequisite`, `getAutostartPrefs`, `saveAutostartPref`, `onLogLine`, `onAnyProgress`
- [x] **RuntimeManagerView.jsx** — prereq warning panel (Gap 1/2), live log via `LiveLogPanel` (Gap 4), autostart toggles per tool (Gap 9), `BootStatusBanner` wired
- [x] **BootStatusBanner.jsx** — fixed bottom-right banner showing real-time boot events from `runtime://boot_status` events (Gap 8)
- [x] **Sidebar Runtimes tab** — `Cpu` icon nav item wired to `runtimes` activeTab
- [x] **runtimeManagerService.test.js** — 22 tests covering all exported functions including 4 new prereq/autostart APIs

### v2.2.5 Fixes & Additions (2026-06-25)
- [x] **Boot crash: hooks violation in RightPanel** — `auditEntries` useMemo moved above `if (collapsed) return` early return.
- [x] **OpenWebUI added** — `runtime_manager.rs` TOOLS array + `RuntimeManagerView.jsx` TOOL_META (LLM category, port 3000, `open-webui serve`). Unit test `tool_def_lookup_works` updated.
- [x] **Brave Search CredentialSection** — `ConnectorSetupPanel.jsx` + `hectorResearchService.js` checks credential store before env vars.
- [x] **Runtime catalog fallback** — `RuntimeManagerView.jsx` shows `catalogFallback` from TOOL_META when `getAllStatus()` returns empty (web/browser mode).
- [x] **ContentCalendar real grid** — monthly grid with prev/next navigation, today highlight, draft dots, minimize/expand toggle.
- [x] **Content workspace full polish** — all 7 workspace components (BrandHeader, GeneratorForm, ContentCalendar, DraftPreview, DraftList, BrandSettings, AnalyticsDashboard, TrendResearch) rewritten to compact CSS-var-based design. Bridge/job-detail panels in ContentCatalystWorkspace also updated.
- [x] **E2E specs added** — `e2e/runtime-tools.spec.js` (ComfyUI + OpenWebUI), `e2e/content-pipeline.spec.js` (5 pipeline tests). Output path set to `D:\AgentDevDev\phonso`.
- [x] **Tauri mock runtime commands** — `e2e/tauri-mock.js` now includes all `runtime_*` commands with mock data.

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
- [x] **Lazy loading** — 20+ heavy views lazy-loaded. Main chunk: **288KB** (budget 550KB). Code splitting applied to ChatView, WorkflowPanel, coach components. **Fixed 2026-06-25 patch1:** Three static imports of `runtimeManagerService` in `OllamaOfflineBanner`, `OnboardingWizard`, and `creativeRoutingService` were defeating code splitting (Vite `INEFFECTIVE_DYNAMIC_IMPORT` warning). Converted to dynamic `await import()` at point of use — warning is gone.
- [x] **Image asset compression** — DONE (2026-06-03, Session 6): Logo/banner/icon/thumbnail PNGs converted to WebP (89% reduction, ~9MB saved). `miya-mascot.png` converted to WebP (77.7% reduction). Unused `ChatGPT Image Jun 1` deleted (2.7MB). Total savings: ~12MB.
- [x] **Design system** — Custom Tailwind tokens reduce CSS duplication. Component classes (.panel, .card, .btn-*) eliminate inline style repetition.

### TOOLING
- [x] **eslint-plugin-security** — installed + wired in `eslint.config.js` (2026-05-31, autonomous)
- [x] **eslint-plugin-react-hooks** — already in config pre-session; confirmed present
- [x] **TypeScript** — installed as devDependency; `tsconfig.json` + `tsconfig.node.json` created (2026-05-31, Agent E)
- [x] **`@types/react`, `@types/react-dom`, `@types/node`** — **added 2026-06-25 patch1**. Were missing from devDependencies; `tsc --noEmit` was producing 1,867 errors silently (Vite/OXC build skips type-checking). `typecheck` script added; `verify:app` now runs lint + typecheck + test + build.

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
- **CI workflows** → `ci.yml`, `release.yml`, and `ios-build.yml` exist and pass green (extend, do not replace). Note: `verify-app.yml` does NOT exist as a file — `npm run verify:app` runs inside `ci.yml`. `ios-build.yml` triggers on `main` pushes to `ios/**` + `workflow_dispatch`; builds, archives, exports IPA, and uploads to TestFlight via `xcrun altool` + App Store Connect API key.
- **WhatsApp webhook Rust module** → `src-tauri/src/whatsapp_webhook.rs` — `verify_whatsapp_cloud_webhook_challenge`, `verify_whatsapp_cloud_webhook_signature`, `normalize_whatsapp_cloud_inbound` + 4 structs live here. Do not re-add to `lib.rs`.
- **WhatsApp browser connector** → `src/services/whatsappBrowserConnector.js` — `browserSendWhatsApp` (outbound via Meta Graph API v17.0) and `browserPollWhatsAppGateway` (inbound via Railway gateway `/queue/drain`). Reads credentials from `connectorAuth.js` (`getConnectorCredential`). Do NOT recreate.
- **KV store Rust module** → `src-tauri/src/kv_store.rs` — `kv_set`, `kv_get`, `kv_delete`, `save_settings`, `load_settings`, `ensure_kv_table`. `kv_delete` issues `DELETE FROM kv_store WHERE key = ?`. Do not re-add to `lib.rs`.
- **Multi-turn Ollama chat** → `src/lib/ollama.js` — `generateOllamaChatStream` uses `/api/chat` endpoint with full `messages` array. `ChatView.jsx` captures history snapshot before state updates and passes it. Do not recreate.
- **appendAgentActivity wiring** → wired in `joseExecutionEngineService.js` (`executeAssignment`) and `connectorRegistryService.js` (`appendConnectorAudit`). Both import from `../components/AgentActivityLog`.
- **Playwright browser installed** → `@playwright/test@1.60.0` + Chromium installed. `npm run test:e2e` is ready to run (needs dev server + Ollama).
- **Playwright config** → `playwright.config.js` at project root; tests in `e2e/`. Do not create another E2E config.
- **`.npmrc`** — `legacy-peer-deps=true` already set at project root. Do not remove.
- **Companion WebSocket server** → Phase 1 implemented in `src-tauri/src/companion_*.rs` (5 Rust modules: `companion_types`, `companion_auth`, `companion_discovery`, `companion_router`, `companion_server`). Provides PIN auth, JSON-RPC routing, and mDNS discovery. Do not recreate.
- **CompanionPairingPanel** → `src/components/CompanionPairingPanel.jsx` — Remote Access PIN display, copy-to-clipboard, QR code, connected clients count, Start Discovery button for mDNS. Integrated in SettingsView. Do NOT create another pairing UI.
- **NotificationCenter** → `src/components/NotificationCenter.jsx` — fixed top-right panel, max 5 visible, colored left borders by type (emerald/amber/red/zinc), relative timestamps, dismiss X, "Clear all". Do NOT create another notification system.
- **AgentStatusStrip** → `src/components/AgentStatusStrip.jsx` — horizontal flex strip of agent badges with pulsing emerald dot for running agents, compact mode, returns null when empty. Do NOT duplicate.
- **UpdaterNotification** → `src/components/UpdaterNotification.jsx` — amber fixed banner, "Update & Restart" + "Later" buttons, wired into App.jsx via `updaterVersion` state. Do NOT recreate updater UI.
- **WhatsAppInboxPanel** → `src/components/WhatsAppInboxPanel.jsx` — scrollable received-message list with inline reply state per message. Reads from `browserPollWhatsAppGateway`. Do NOT duplicate.
- **AgentPerformanceView** → `src/components/AgentPerformanceView.jsx` — per-agent success/error counts + avg latency from orchestration receipt data. Props: `receipts`. Do NOT recreate.
- **WorkspaceExportImportView** → `src/components/WorkspaceExportImportView.jsx` — export all `alphonso_*` localStorage keys as JSON download; import via FileReader with prefix validation. Rendered in SettingsView. Do NOT create another export/import UI.
- **RightPanel tabs** → `src/components/RightPanel.tsx` now has **System | Audit | Agents** tabs (3 tabs). Audit tab shows last 10 approval events from `agentAuditService`. Security section + SentinelAllowlistPanel live inside System tab. Agents tab shows `AgentStatusStrip useAutoFeed`. Do NOT add a separate panel for this.
- **Jarvis voice button in ChatView** → `src/components/ChatView.tsx` wires `useJarvisVoice` — second mic button (WebSocket AudioWorklet pipeline) next to SpeechRecognition button. STT transcript populates input field. Button state reflects listening/thinking/speaking/error. Requires FastAPI voice server. Do NOT add another Jarvis voice UI.
- **Browse fallbacks in SettingsView** → `src/components/SettingsView.tsx` has hidden `<input type="file" webkitdirectory>` refs for Output Folder (`outputFolderPickerRef`) and ComfyUI Dir (`comfyuiDirPickerRef`). Triggered automatically when `invoke('pick_folder')` fails in web mode. Same pattern as Workspace Root Browse (line ~583). Do NOT add another folder picker flow.
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
- **SmartVoiceButton** → `src/components/SmartVoiceButton.tsx` — unified voice input button; prefers Voice OS WebSocket (Jarvis), falls back to browser SpeechRecognition. Shows status tooltip. Do NOT add another voice button to ChatView.
- **externalAgentAdapter** → `src/services/agentWorkshop/externalAgentAdapter.js` — routes tasks to OpenAI, Claude, Ollama, DeepSeek. Gemini/ACC planned v2.6. Do NOT add another external provider routing layer.
- **voiceOsService** → `src/services/voiceOsService.js` — `startVoiceServer`, `stopVoiceServer`, `getVoiceServerStatus`, `getVoiceWebSocketUrl`, `startVoiceWatchdog`, `stopVoiceWatchdog`. Tested in `voiceOsService.test.js`. Do NOT duplicate.
- **WebRTC VAD** → `voice/backend/vad.py` — real webrtcvad implementation (aggressiveness=2, 30ms frames). Do NOT revert to energy heuristic stub.
- **9-agent voice routing** → `voice/backend/router.py` — keyword/regex routing for all 9 agents. Do NOT recreate stub that returns `'alphonso_core'` for everything.
- **E2E voice + visual specs** → `e2e/voice.spec.js` (voice flow tests) and `e2e/visual.spec.js` (visual regression baselines for 5 views). Do NOT delete baseline snapshots.

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

_Last verified: 2026-06-29 — v2.5.0. Batch 2 (feat/batch2-testing-completeness) merged to main. 186 test files / 2518+ tests passing. Agent profiles complete (all 9 full 25-property). Voice backend: real WebRTC VAD + 9-agent routing live. SmartVoiceButton unified. ExternalAgentAdapter wired (OpenAI/Claude/Ollama/DeepSeek). iOS companion Swift verified. Remaining open gaps: Voice OS Python prereq (user must have Python 3.10+ installed), plugin true execution isolation (no Web Worker/iframe sandbox — policy check only). Branch protection on main: manual GitHub step still pending._

> _How to verify drift:_ run `npm run export:ground-truth` and read the **Drift vs ground truth** section of the generated file. It will flag any numeric claim in this document that diverges from the live repo.




