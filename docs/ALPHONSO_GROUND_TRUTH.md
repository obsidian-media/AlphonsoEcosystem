# ALPHONSO — Agent Ground Truth & Shared Context
**Last verified:** 2026-07-14 — v2.6.0 (voice/mobile doc reconciliation + branch review; no version bump)
**Verified by:** Claude Code session — reconciled the root docs against recent voice/mobile commits already on `main` (desktop Voice OS, iOS companion Voice tab, cloud voice, Farsi routing, Supabase device enrollment), reviewed branch `sprint-5-kilo-cli` for PR readiness against current `main`, and corrected the failing README Rust test count so `npm run verify:docs` passes on `main`. Full details: sections 11.19 and 11.20.
**Version:** 2.6.0 (unchanged — no release cut; this pass verified current docs against recent `main` history and branch state rather than running the full app/build matrix)
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
| Version | 2.6.0 |
| Type | Tauri v2 desktop app (Windows) |
| Project root | `D:\AgentDevWork\repos\AlphonsoEcosystem` |
| Backend | Rust 1.77, Tauri 2.11, SQLite (rusqlite bundled), tokio, reqwest, tokio-tungstenite (companion) |
| Frontend | React 18, Vite 8, Tailwind 3, Lucide React, Framer Motion — new UI work is `.tsx`; legacy production `.jsx` contexts and Content Catalyst files remain and are tracked for migration. |
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

## 3. Service Layer — ~168 Services in `src/services/`

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
- `src/services/voiceOsService.js` — Tauri `invoke` wrappers: `startVoiceServer`, `stopVoiceServer`, `getVoiceServerStatus`, `getVoiceWebSocketUrl`. Appends `agentActivityService` (now `.ts`) events on start/stop.
- `src/hooks/useJarvisVoice.ts` — React hook for voice WebSocket: `start`, `stop`, `reset`, `state`, `transcript`, `reply`, `activeAgent`, `error`, `isConnected`. Uses **AudioWorklet** (not deprecated ScriptProcessor).
- `src-tauri/src/voice_sidecar.rs` — `VoiceSidecar` state struct + `voice_start`/`voice_stop`/`voice_status` Tauri commands. `voice_start` accepts `app: tauri::AppHandle` and resolves the backend path via `app.path().resource_dir().join("voice/backend")` — works in both dev and production installs. `voice/backend/**` is included in bundle resources via `tauri.conf.json`.
- `voice/backend/` — Python FastAPI: `main.py` (lifespan preload, CORSMiddleware, `/health`, barge-in, conversation history), `pipeline.py` (async generator: VAD→STT→agent→LLM→TTS), `router.py` (9-agent regex routing), `state.py` (per-session `get_state`/`set_state`/`remove_state`), `session.py` (task registry, barge-in cancel), `stt.py` (faster-whisper + lru_cache), `tts.py` (piper + ThreadPoolExecutor, async `synthesize()`), `vad.py` (webrtcvad `is_speech()`)
- `voice/backend/tests/` — `test_state.py`, `test_session.py`, `test_router.py`, `test_stt.py`, `test_pipeline.py`
- `voice/frontend/src/useJarvisVoice.ts` — Standalone frontend hook (AudioWorklet, all exports)
- `voice/frontend/src/pcm-processor.worklet.ts` — AudioWorklet processor (PCM float32→int16)
- `src/hooks/pcm-processor.worklet.ts` — **copy required by `useJarvisVoice.ts`** (the hook imports from `./pcm-processor.worklet`; the voice/frontend version is a separate package). Do NOT remove this file.
- `voice/cloud-backend/` — Railway Cloud Voice FastAPI service. It validates bearer-authenticated requests, applies one of nine voice personas, uses NVIDIA NIM for replies, NVIDIA TTS for non-Farsi replies, and private Railway Piper for `fa-IR` (`mana`/`manta`). `/health` and `/ready` were verified live on 2026-07-13.
- `voice/piper-farsi/` — token-protected Railway Piper service with a persistent `/data` model cache. `/health` was verified live on 2026-07-13 and reports `mana` and `manta`.
- **Cloud Voice access truth: PARTIAL.** The iOS Voice UI no longer exposes provider credentials, carries selected agent/language metadata, uses Supabase email OTP with a Keychain session, and enrolls a stable device UUID. Cloud Voice validates the Supabase user session plus active device on each request. The server and migration were deployed on 2026-07-13; physical iPhone sign-in, English speech, and Farsi speech acceptance still require verification before public-ready status.

### UI Polish Sprint (v2.3.1)
- `src/services/connectors/perplexityConnector.js` — Perplexity AI search: `isPerplexityConfigured`, `searchPerplexity`. Calls `/chat/completions` with `llama-3.1-sonar-small-128k-online`.
- **6 pages tab-overhauled**: `ProjectExecutionMode.jsx` (4 tabs), `HectorResearchDesk.jsx` (3 tabs), `OrchestratorView.jsx` (4 tabs), `MiyaStudio.jsx` (tab-conditional layout), `EcosystemHub.jsx` (flat header + pill toggle), `ContentCatalystWorkspace.jsx` (max-w-5xl wrapper).

### JUNE CANDY Additions (v2.2.8 – v2.3.0)
- `src/services/connectors/tavilyConnector.js` — Tavily AI search (free tier 1K/mo), `searchTavily`, `isTavilyConfigured`. Wired as tier-2 fallback in `hectorResearchService.js` (Brave → Tavily → DuckDuckGo → RSS).
- `src/services/chromaDbService.js` — ChromaDB local vector DB (port 8000): `addMemoryToChroma`, `semanticSearchMemory`, `deleteMemoryFromChroma`, `isChromaHealthy`. Fire-and-forget write from `echoMemoryService.runEchoPreservation`.
- `src/services/whisperTranscriptionService.ts` — Whisper meeting transcription: `transcribeAndIngest(audioFilePath, filename, onProgress)` — calls `transcribe_audio_file` Tauri command → Ollama summarize → Echo `pushMemoryItem`.
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

## 4. Test Suite — 226 Files in `src/test/` (not zero)

The test suite exists and is substantial. Any agent or audit that says "no test suite" or "zero coverage" is wrong.

**Test files (verified 2026-06-30 v2.5.0, all passing):**
- 218 test files, 3174 tests passing (re-verified in isolation 2026-07-02; +7 tests added for onboarding wizard approval-mode/advanced-services steps)
- 94 Rust unit tests total (`cargo test` in src-tauri/): 91 passing, 3 known pre-existing failures unrelated to any recent change — tracked in `todo.md` (`runtime_manager::tests::all_tools_have_unique_ports`, `runtime_manager::tests::autostart_prefs_defaults_ollama_only`, `workspace::tests::absolute_path_detected`). Re-verified in isolation 2026-07-02; count grew from the historical "14" figure as more modules gained test coverage over time — that figure is stale, do not cite it as current.
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
- 218 test files / 3,167 tests (Batch 2 + Test Expansion Phases 1-3; all passing as of 2026-07-01)
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

### CLOSED — 2026-07-10 (user bug-report pass — full detail in section 11.15)
- [x] **Telegram bot never responded** — wrong Tauri command names (`telegram_get_updates`/`telegram_send_message` vs. real `connector_poll_telegram`/`connector_send_telegram`) silently swallowed by a bare catch; also fixed a `return`-vs-`continue` bug that dropped every message after the first in a poll batch, and a dead `/memory <query>` search branch.
- [x] **CMD windows flashing open/closed** — `CREATE_NO_WINDOW` missing at multiple `Command::new()` sites across `lib.rs`/`plugin_runtime.rs`/`voice_sidecar.rs`/`workspace.rs`/`runtime_manager.rs`'s polled health-check helpers.
- [x] **Sidebar nav items unreachable on short windows** — `Sidebar.tsx` nav list was `shrink-0` inside `overflow-hidden` with no scroll of its own.
- [x] **Coach Mode non-functional** — the Coach webview window had zero Tauri capability grants (`capabilities/default.json` only listed `"main"`); also fixed a silent-failure bug where window creation never confirmed success, at 4 call sites in `CoachContext.jsx`.
- [x] **Voice OS completely non-functional** — `voice/backend/pipeline.py` called a nonexistent LLM function with the wrong signature (crashed every request), never `await`ed the async TTS call, had no VAD gate. Fully rewritten against the pre-existing test contract.
- [x] **Mobile Companion pairing P0** — port 8765 double-booked between the Companion WebSocket server and Voice OS; whichever started first silently won the bind. Voice OS moved to port 8766 (iOS hardcodes 8765 for Companion).
- [x] **WhatsApp had no command handling and no auto-start** — new `whatsappCompanionService.ts` (9 real commands, mirrors Telegram's pattern); also found `WHATSAPP_CLOUD_GATEWAY_DRAIN_URL` had no UI field anywhere, making inbound polling unconfigurable regardless of credentials.
- [x] **`voice/backend/router.py` keyword-routing bugs** — hector's broad keywords stole matches meant for nova/sentinel; miya was missing write/blog/draft keywords entirely.
- [x] **Stale Boardroom docs referencing nonexistent "Hermes"/"Kairo" agents** — correction banners added to `BOARDROOM_ROLES.md`/`BOARDROOM_MODEL_REGISTRY.md`.
- [ ] **Auto-update full in-app download+install+relaunch** — handed off, not built: `docs/AUTO_UPDATE_HANDOFF.md` + PR #98 on `feat/in-app-auto-update`.
- [ ] **`companionIntegration.test.js` asserts against fabricated Tauri command names** — gives false confidence without testing real wiring. Found, not yet fixed.
- [ ] **Mobile Companion pairing not independently re-verified live** — port collision fix is high-confidence but not confirmed against an actual paired phone this session; Windows Firewall (port 8765 / mDNS UDP 5353) remains a possible unverified contributor.

### CLOSED — 2026-07-02 (iOS companion pairing fix, post-audit Phase 1)
- [x] **iOS companion pairing — phone could not find/connect to desktop** — Root cause: `companion_discovery.rs`'s `advertise()` passed the bare OS hostname (e.g. `"DESKTOP-ABC123"`) as the mDNS `ServiceInfo::new` host name. The `mdns-sd` crate does NOT append `".local."` automatically — its `normalize_hostname()` only dedupes an already-doubled `".local.local."` suffix (confirmed by reading the crate source at `mdns-sd-0.20.1/src/service_info.rs`). This registered a service whose SRV target was not a valid mDNS host record, so iOS's `NWBrowser`/`NWConnection` (in `MDNSService.swift`) could discover the service instance but fail to resolve it to a connectable address — exactly matching "can't pair with my phone." Fixed by adding `to_mdns_host_name()` (always ends in `.local.`, with 3 new unit tests) and using it in `advertise()`. Also confirmed (by reading `mdns-sd`'s `ServiceDaemon::new_with_port` source) that the `ServiceDaemon`/`CompanionDiscovery` handle can be safely dropped after calling `advertise()` — the crate spawns a detached background thread holding its own sender clone, so the advertisement is NOT torn down when the caller's handle goes out of scope. That is not a bug; no change needed there. Also added a visible error message in `CompanionPairingPanel.tsx` when `companion_start_discovery` fails — previously the button just silently reset to "Start Discovery" with zero user feedback.

### CLOSED — 2026-07-02 (User-reported bug batch, post-audit Phase 1)
- [x] **Connector credentials appeared to not save (Telegram bot token example)** — Root cause was two-fold: (1) `hydrateConnectorCredentialsFromSqlite()` in `connectors/connectorAuth.js` was dead code, never called at app boot or component mount, so the in-memory credential cache permanently locked itself to `{}` on first read before SQLite ever got consulted; (2) `getStoredCredential()` in `connectors/connectorRegistry.js` and `getConnectorEnvironment()` in `connectors/connectorOutbound.js` both read directly from `localStorage.getItem('alphonso_connector_credentials_v1')` — a key that the KV-primary migration (see CLOSED audit-sprint-26jun entry below) stopped writing to and actively clears. So a credential saved via the UI persisted correctly to SQLite but both verification and the actual Telegram send path read a dead, always-empty key and reported "not configured" / "token is not configured". Fixed: `ConnectorSetupPanel.tsx` now hydrates+re-syncs all 20 credential fields on mount; `useDataHydration.js` hydrates the cache at boot (with `force=true` to guarantee a real SQLite read); both stale localStorage readers now delegate to `getConnectorCredential()`.
- [x] **ComfyUI reported "not running" in Content Catalyst while Runtime Hub showed it running** — `connectorImageGenerators.js`'s `generateComfyUiImage()` talks to ComfyUI via raw browser `fetch()` (not a Tauri command), using `http://127.0.0.1:8188` as the default endpoint. `tauri.conf.json`'s CSP `connect-src` only allowlisted `http://localhost:8188`, not the `127.0.0.1` form — browsers do not treat these as equivalent origins for CSP purposes — so the fetch was silently blocked and `contentCatalystService.js` reported a hardcoded "ComfyUI not running" message regardless of the actual failure. Fixed: added `http://127.0.0.1:8188` to CSP; the toast now surfaces the real underlying error instead of a hardcoded guess.
- [x] **No submit/input affordance on the Projects page** — `ProjectExecutionMode.tsx`'s intake form (Setup tab, via `ProjectIntakePanel`) had zero call-to-action; the only "Generate" submit button lived on a separate Execution tab with no link between them. Added a "Continue to Execution →" button directly under the intake form.
- [x] **Hector research output showed unclickable link-like text, no proper report** — Confirmed real bug: `CitationPanel.tsx`, `SourceBoard.tsx`, and `ResearchReportPanel.tsx` rendered source URLs as plain `<div>`/string text with no anchor or click handler at all. Separately, `ChatView.tsx`'s inline Hector citation chips called bare `window.open()`, which silently no-ops in the Tauri webview (same class of bug CLAUDE.md already documents for `<a target="_blank">`). Fixed: added `openExternalUrl()` to `browserAutomationService.js` (tries `invoke('open_url', ...)`, falls back to `window.open` only outside Tauri) and wired it into all four surfaces. Note: `HectorResearchDesk.tsx` already had a working Markdown export button (`exportReport()`) — that part of the "proper output format" request was already implemented and did not need a fix.

### CLOSED — 2026-07-02 (Onboarding wizard expansion, post-audit)
- [x] **Approval mode default was invisible to users** — `OnboardingWizard.tsx` now has a dedicated "Approval mode" step (new step 3 of 6) that asks the user explicitly whether Alphonso should ask before high-risk actions, defaulting to ON during onboarding, and writes the choice via `setRuntimePolicySettings({ approvalMode })`. Previously `approvalMode: false` was silently the default with no onboarding-time decision point (flagged as a P0 risk in `ALPHONSOAUDIT25.06.2026.md`'s completion report).
- [x] **Connect step copy overstated connector readiness** — `ConnectChannelStep` copy changed from "pick a channel" to explicitly state every connector stays disabled until credentials are added and skipping is normal — addresses the audit finding that a fresh install has zero working connectors and users were not told this.
- [x] **Optional/external-dependency services were silent** — New "Advanced" onboarding step (`AdvancedServicesStep`, step 5 of 6) surfaces ChromaDB (semantic memory) and Voice OS (Python-dependent) with live status checks (`isChromaHealthy`, `getVoiceServerStatus` + `checkPrerequisites().pythonFound`) instead of failing silently later. No new backend surface added — reuses existing Tauri commands only.
- [x] **Onboarding wizard is now 6 steps**, not 4: Check Ollama → Pick a model → **Approval mode (new)** → Connect → **Advanced services (new)** → Ready. `StepIndicator` and both test files (`src/test/OnboardingWizard.test.jsx`, `src/test/components/OnboardingWizard.test.tsx`) updated accordingly.

### OPEN GAPS (as of v2.5.0-security)
- [ ] **Voice OS Python dependency** — Voice OS in Runtime Hub can Install/Start, but requires Python 3.10+ on PATH. `find_python()` checks standard paths but won't auto-install Python itself. User must have Python installed first.
- [x] **CLOSED 2026-07-02 — Plugin execution isolation (corrected from a stale/incorrect prior claim)** — This entry previously claimed "Plugin tools run in the main thread" with "no Web Worker, iframe, or subprocess isolation." That claim was **wrong** and was never re-verified against the actual Rust implementation before being written. In reality: `executePluginToolRun` (`pluginRegistryService.js`) invokes the Tauri command `execute_plugin_tool` in `plugin_runtime.rs`, which runs plugin tools as **native OS subprocesses** via `Command::new(&tool.program)` — never as in-process JavaScript, and never in the browser/renderer main thread. There is no `eval()`/dynamic `import()` of plugin code anywhere in the JS layer to isolate in the first place; manifests are purely declarative (`tool.id` → fixed `program` + `args`), not executable plugin code. Execution was already gated by: manifest `tools.execute`/`command.execute` permission checks, the shared `allowed_program()` system allowlist, `validate_plugin_extra_args()` (arg count/length/blocked-token checks), and workspace-root-scoped `cwd` resolution. The one real gap — that any plugin could declare `program` as anything already in the *shared, system-wide* allowlist (git/npm/docker/etc.), with no per-plugin scoping — is now closed: manifests may declare `declared_programs: string[]`; when present, `execute_plugin_tool` rejects any `tool.program` not in that plugin's own list, enforced on top of (not instead of) the shared allowlist. `validate_plugin_manifest_disk` now warns when a manifest omits `declared_programs` and errors if a tool's program isn't listed in a declared set. Optional field — fully backward compatible with any manifest written before this change. 4 new Rust unit tests added (`program_allowed_by_manifest_*`) in `plugin_runtime.rs`. **Correction note for future audits: verify claims like "runs in the main thread" against the actual Tauri command implementation before repeating them — this file itself was the source of the stale claim.**
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
- [x] **Branch protection on `main`** — **CLOSED 2026-07-06** Classic branch protection enabled on `main` via `gh api`: requires "Test & Build" + "Rust Tests & Clippy" status checks (strict) + 1 approving review, blocks force-push/deletion. Note: a repo-wide ruleset named "Protected-Main" (created 2026-07-03, source unclear — predates this session) already enforced an equivalent policy across all branches, making this classic-API addition partially redundant; both are active now. A separate ruleset "Alphonso" (created 2026-06-17) blocks deletion/force-push on the default branch only. Recommend consolidating to one mechanism in a future pass rather than running both indefinitely.
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
- **WhatsApp companion bot commands** → `src/services/whatsappCompanionService.ts` (added 2026-07-10) — `/status`, `/queue`, `/approve`, `/reject`, `/agents`, `/report`, `/ping`, `/help`, `/ask`, real Jose routing for free text. Owner-pairing gated on `WHATSAPP_ALLOWED_NUMBERS` credential (mirrors Telegram's `TELEGRAM_ALLOWED_CHAT_IDS` pattern). Auto-starts at boot in `useBootEffects.js` if `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_CLOUD_GATEWAY_DRAIN_URL` are both set. Do NOT recreate — this did not exist before 2026-07-10; WhatsApp previously had zero command handling.
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
- **agentAuditService** → `src/services/agentAuditService.ts` — localStorage ring buffer (100 entries, `alphonso_approval_audit_v1`). `logApprovalEvent(packetId, agent, action, outcome)`, `getAuditLog()`, `clearAuditLog()`. Do NOT duplicate.
- **workspaceExportService** → `src/services/workspaceExportService.ts` — exports/imports all `alphonso_*` localStorage keys as JSON. `exportWorkspace()`, `importWorkspace(jsonString)`. Do NOT create another backup/export service (also see `backupService.js`).
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

### Production-readiness roadmap T11–T20 (not started, tracked 2026-07-15/16)
Full task list, plan, risk, and dependencies for each: `docs/PRODUCTION_READINESS_ASSESSMENT_2026-07-15.md` §6. T1/T2/T3/T4/T5/T6 are done (see §11.21/§11.22); T10 is partial (E2E collection fixed, specs still need repair). Do not re-derive scope for these from memory — read that doc's §6 before starting any of them, since each has explicit dependencies on the others (e.g. T13 keychain depends on T5's token format). Short list for quick reference:
- **T11** — harden KV/localStorage persistence with a real schema + migrations
- **T12** — replace the fail-open connector policy DSL default with risk-tiered rules
- **T13** — move credentials to OS-level secret storage (depends on T5's token format)
- **T14** — split `lib.rs` (~2,024 lines) + lint-enforce `CREATE_NO_WINDOW`
- **T15** — live-verify the in-app auto-updater against a real signed release
- **T16** — live-verify iOS companion pairing on a real device (depends on T6's lockout)
- **T17** — add observability to the cloud sidecars (gateways, MCP server, bridge)
- **T18** — reduce the Supabase service-role-key blast radius in the voice backend
- **T19** — auto-generate the "Do Not Duplicate" map to close doc-drift at the source
- **T20** — add a token/cost budget to multi-agent fan-out + surface hidden features

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

## 11.5 ALPHONSOTOTHEMOON Sprint 1 (2026-07-02)

Full context and rationale live in `ALPHONSOTOTHEMOON.md` at repo root — this is
the ground-truth summary of what actually changed.

- **Licensing**: `LICENSE` added — SHALAUDE License v1.0 (all-rights-reserved,
  source-visible, not OSI-approved). The repo previously had no LICENSE file at
  all; README's prior "BSL 1.1" claim did not match reality (no BSL file ever
  existed in the repo) and has been corrected to reference SHALAUDE.
- **Skill pack ↔ agent contract enforcement**: `validateSkillPackAgainstContract()`
  in `src/services/agentContractService.ts` cross-checks a skill pack's declared
  `permissions` against its owning agent's `AGENT_EXECUTION_CONTRACTS` entry.
  Wired into `installSkillPack`/`setSkillPackEnabled` in `skillPackService.js` —
  a pack whose permissions exceed its agent's contract is rejected (install) or
  refused (enable), with an `install_blocked`/`enable_blocked` audit entry.
- **Default skill packs for all 9 agents**: previously only Jose, Hector, Miya,
  and Maria (×2) had an `agent_skill` category default pack. Added:
  `pack.alphonso-runtime-operations`, `pack.marcus-distribution-execution`,
  `pack.echo-memory-synthesis`, `pack.sentinel-vuln-scan`,
  `pack.nova-opportunity-analysis`.
- **Alphonso skill pack expansion (2026-07-17)**: Alphonso now has 18 skill packs
  (2 existing + 16 new). New packs: `pack.coding.full-stack`, `pack.coding.tdd`,
  `pack.alphonso-typescript-mastery`, `pack.alphonso-rust-operations`,
  `pack.alphonso-react-patterns`, `pack.alphonso-python-voice`,
  `pack.alphonso-code-review`, `pack.alphonso-build-verification`,
  `pack.alphonso-refactoring`, `pack.debugging.root-cause`,
  `pack.alphonso-runtime-diagnostics`, `pack.alphonso-security-audit`,
  `pack.github.integration`, `pack.alphonso-performance-optimization`,
  `pack.alphonso-api-integration`, `pack.alphonso-error-handling`. All packs
  include structured workflow guidance, example tasks, and per-pack scope
  overrides. See `docs/ALPHONSO_SKILLS.md` for full documentation.
- **Jose skill pack expansion (2026-07-17)**: Jose now has 22 skill packs
  (6 existing + 16 new). New packs: `pack.jose-workflow-design`,
  `pack.jose-strategic-planning`, `pack.jose-dependency-mapping`,
  `pack.jose-agent-coordination`, `pack.jose-parallel-orchestration`,
  `pack.jose-task-prioritization`, `pack.jose-risk-assessment`,
  `pack.jose-quality-gates`, `pack.jose-compliance-checks`,
  `pack.jose-progress-tracking`, `pack.jose-status-reporting`,
  `pack.jose-performance-metrics`, `pack.jose-workflow-optimization`,
  `pack.jose-bottleneck-detection`, `pack.jose-continuous-improvement`,
  `pack.jose-stakeholder-communication`. All packs include structured
  workflow guidance, example tasks, and per-pack scope overrides. See
  `docs/JOSE_SKILLS.md` for full documentation.
- **Pipeline loop-guard / execution budget**: `runJoseCommandExecutionPipeline`
  in `joseExecutionEngineService.js` now hard-stops at `PIPELINE_MAX_ASSIGNMENTS`
  (50) or `PIPELINE_MAX_DURATION_MS` (5 minutes), whichever comes first. On
  breach it returns `{ ok: false, reason: 'budget_exceeded' }` and appends a
  `pipeline_budget_exceeded` orchestration receipt — this did not exist before;
  a malformed command graph or stuck agent could previously iterate unbounded.
- Deferred to Sprint 2 (tracked in `ALPHONSOTOTHEMOON.md`, not dropped): resumable-
  execution checkpoints on top of the existing dead-letter queue, a Discord
  connector, a generic inbound webhook connector, subprocess/sandboxed tool
  execution, MCP as a first-class runtime capability (not just a side Express
  server), and scheduler heartbeat/liveness supervision.

## 11.6 ALPHONSOTOTHEMOON Sprint 2 (2026-07-02)

Full context lives in `ALPHONSOTOTHEMOON.md` at repo root.

- **Crash-recovery checkpoint**: `recoverInterruptedExecutions()` added to
  `src/services/orchestrationQueueService.ts`. Scans all agent packets still
  in `queued`/`executing` state at app boot and marks each interrupted via
  `markPacketInterrupted()` — a function that already existed in this file
  (failed + retryable, records a transition) but was never called from
  anywhere before this sprint. Wired as a one-shot boot `useEffect` in
  `src/App.tsx`, right after the runtime-manager autostart block, surfacing
  a warning notification when work is recovered.
- **Discord connector**: `src/services/connectors/discordConnector.ts` —
  Discord REST API v10, Bot token auth, policy-gated identically to the
  existing `slackConnector.ts` pattern. Functions: `sendMessage`,
  `editMessage`, `deleteMessage`, `listGuildChannels`, `getChannelHistory`,
  `addReaction`, `sendWebhookMessage`. Registered in `connectorRegistry.js`
  as `discord`; credential UI (Bot Token, live-verified against
  `GET /users/@me`) in `ConnectorSetupPanel.tsx`; 17 tests.
- **Generic inbound webhook connector**: two halves —
  1. `gateway/generic-webhook/` — a standalone, Railway-deployable Node HTTP
     server mirroring `gateway/whatsapp-cloud/`'s proven queue-drain shape,
     generalized: `POST /webhook/:sourceId` (any external service, shared
     secret required) enqueues an event; `GET /queue/drain` (separate
     drain token) lets Alphonso pull queued events. No local port is opened
     inside the Tauri app itself — this follows the same reasoning as the
     WhatsApp Cloud gateway: a desktop app has no stable public IP, so the
     receiving side has to be an externally-deployed service, not a listener
     inside the app.
  2. `src/services/genericWebhookService.js` — `pollGenericWebhookGateway()`
     (one-shot drain, appends an `orchestrationReceiptService` receipt per
     event for auditability), `startGenericWebhookPolling()` /
     `stopGenericWebhookPolling()` (30s interval, no-ops until a drain URL
     is configured). Registered in `connectorRegistry.js` as
     `generic_webhook`; credential UI (drain URL + token) in
     `ConnectorSetupPanel.tsx`; boot poller wired in `App.tsx`; 13 tests.
- Connector count: 14 → 16 (`DEFAULT_CONNECTORS.length` in
  `connectorRegistry.js`, +Discord +Generic Webhook). The existing
  `connectorGitHubSlack.test.ts` assertion of `toBe(14)` was accurate before
  this sprint and was updated to `toBe(16)` with coverage added for both
  new entries.
- Found, documented, and left open (pre-existing, independent of this
  sprint — reproduced identically with Sprint 2 changes stashed out):
  `src/test/ConnectorSetupPanel.test.jsx` fails 7/7 because its
  `vi.mock('../services/connectors/connectorAuth', ...)` factory omits
  `hydrateConnectorCredentialsFromSqlite`, so the component's real hydrate
  `useEffect` throws on mount inside the test. See `CLAUDE.md` Real Gaps.

## 11.7 Auto-updater fix + connector registry completeness (2026-07-02)

- **Auto-updater was never functional despite being fully coded.**
  `src/services/appUpdateService.ts` (`checkAppUpdate()`) and
  `src/components/UpdaterNotification.tsx` both already existed and
  `appUpdateService` had 19 passing tests — but `App.tsx` never called
  `checkAppUpdate()`, so `updaterVersion` state stayed `null` forever and
  the banner could never render. Separately, the banner's `onUpdate` prop
  was hardcoded to `() => {}}` — a no-op even if the banner had shown.
  Fixed: added a Tauri-only boot `useEffect` calling `checkAppUpdate()`
  with the real endpoint/pubkey from `tauri.conf.json`, wired the button to
  `invoke('open_url', ...)` opening the release download. Verified
  separately that no GitHub release newer than v2.4.4 existed (checked via
  `gh release list`) and that the live `latest.json` at the configured
  endpoint was well-formed — so the user-facing symptom was compounded by
  simply not having tagged a release in ~6 days of active development, not
  purely a code defect.
  **Not done**: full in-app download+install+relaunch. Needs
  `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process` as npm
  dependencies — the Rust side (`tauri-plugin-updater`) is already
  registered and ready in `lib.rs`, only the JS side is missing. Tracked in
  `ALPHONSOTOTHEMOON.md` as a follow-up, not silently dropped.
- **Connector registry completeness.** `connectorRegistry.js`'s
  `DEFAULT_CONNECTORS` was missing Ollama, Brave Search, Perplexity,
  Tavily, DeepSeek, and n8n — each had working credential UI in
  `ConnectorSetupPanel.tsx` and a real service implementation, just no
  central registry entry. Traced via git log: each was added in a separate
  earlier feature push (DeepSeek in a v2.4.4 gap-closure sprint, n8n in
  its own dedicated commit) that wired credential UI directly to one
  consumer without circling back to register centrally — genuine drift
  across several sprints, not a deliberate design choice. Added all 6;
  connector count 16 → 22.
- **Coach Mode investigated, confirmed live.** User reported it "feels
  forgotten." Traced `handleToggleCoachMode` through `App.tsx`: it's passed
  as `onOpenCoach` into the main `Sidebar` component and also exposed via
  `OperatorDashboard`'s coach toggle props. Not dead code. Whether it's
  *prominent* enough in the actual rendered UI is unverified — no
  browser-automation tool was available in this session to click through
  the live app, so this is a source-level confirmation of wiring, not a
  visual UX verdict. Seeded as a "feature discoverability audit" in
  `ALPHONSOTOTHEMOON.md` Sprint 3.

## 11.8 ALPHONSOTOTHEMOON Sprint 3: agent skill-library depth (2026-07-02)

Full context lives in `ALPHONSOTOTHEMOON.md` at repo root. Scoped to the 3
highest-traffic agents per the roadmap's own v1 recommendation — not a
big-bang rebuild of all 9 agents' skill systems.

- **Miya** (`src/services/skillPackService.js`): kept
  `pack.miya-runway-video-generation`; added `pack.miya-creative-image`,
  `pack.miya-ui-ux-design`, `pack.miya-brand-identity`,
  `pack.miya-motion-graphics`. `miyaProfile.js`'s `skillPackIds`/`skillFocus`
  updated to match.
- **Hector**: kept `pack.hector-professional-marketing`; added
  `pack.hector-market-research`, `pack.hector-competitive-analysis`,
  `pack.hector-source-verification`, `pack.hector-rss-monitoring` — the
  RSS pack deliberately describes the RSS-failover capability
  `hectorResearchService.js` already ships (`RSS_FEED_CATALOG`,
  `fetchRssSources`), not new scope. `hectorProfile.js` updated.
- **Jose**: kept `pack.jose-professional-orchestration`; added
  `pack.jose-task-routing`, `pack.jose-approval-gating`,
  `pack.jose-cross-agent-synthesis`, `pack.jose-pipeline-governance` — the
  governance pack describes the Sprint 1 `PIPELINE_MAX_ASSIGNMENTS`/
  `PIPELINE_MAX_DURATION_MS` loop-guard already shipped in
  `runJoseCommandExecutionPipeline`. `joseProfile.js` updated.
- **Per-skill contract scoping**: `validateSkillPackAgainstContract()` in
  `src/services/agentContractService.ts` gained an optional third `packId`
  parameter and a new `AGENT_SKILL_PACK_SCOPE_OVERRIDES` map. A pack with an
  override entry is checked against that pack's own narrower permission
  list instead of its owning agent's full agent-wide list — e.g. Miya's
  `pack.miya-brand-identity` cannot carry `video.draft` even though Miya's
  agent-wide contract allows it (for her separate video pack). Packs with
  no override entry, or callers that omit `packId`, get the exact original
  agent-wide behavior — fully backward compatible.
  `skillPackService.js`'s `installSkillPack`/`setSkillPackEnabled` updated
  to pass `manifest.id`/`target.id` through so the narrower check actually
  applies at install/enable time.
- **UI**: `src/components/EcosystemHub.tsx`'s Skills tab now groups packs by
  `ownerAgent` (falling back to "Agent Workflows" for `category:
  'agent_workflow'` packs, "General" otherwise) instead of one flat list —
  makes each agent's taxonomy visible without a new panel.
- `SKILL_WORKFLOW_GUIDANCE` extended with real guidance/steps for all 12 new
  packs so `loadAgentSkillGuidance()` returns actual content for them.
- Tests: `agentSkills.test.js` updated for new `skillFocus` strings + a
  dedicated taxonomy-coverage test; `agentContractService.test.js` gained 6
  tests covering the override behavior (narrower-than-agent-wide
  enforcement, fallback when no override exists, cross-agent coverage).
  99/99 targeted tests passing, `npx tsc --noEmit` clean, ESLint clean on
  every touched file.
- Explicitly deferred (per the roadmap's own scope note, not dropped):
  taxonomy depth for the other 6 agents (Alphonso, Maria, Marcus, Echo,
  Sentinel, Nova keep one default pack each), module-system convergence
  between `modules/` TOML manifests and `skillPackService.js` packs, and a
  full skill-marketplace model.

## 11.9 ALPHONSOTOTHEMOON Sprint 3: discoverability audit (2026-07-02, v2.5.5)

The other half of Sprint 3 (skill-library depth was closed in §11.8). This
half required driving the actual running app rather than reading source —
done via `npm run dev` + headless Chromium (Playwright), since no project
skill for running this app existed yet.

- **Critical bug found and fixed: Boardroom Sessions crashed the entire
  app.** `App.tsx` line 47 was `const BoardroomView = lazy(() =>
  import('./components/BoardroomView'));` — missing the `.then((mod) => ({
  default: mod.BoardroomView }))` mapping that every other one of the 25
  other lazy-loaded views in that file uses. `BoardroomView.tsx` only has a
  named export (`export function BoardroomView()`), no default export. When
  a user clicked Sidebar → Boardroom → "Boardroom Sessions" subtab, React's
  lazy loader resolved `module.default === undefined` as the component
  type, and React's own dev-mode warning path crashed with an uncaught
  `TypeError: Cannot convert object to primitive value`, replacing the
  entire app with a full-screen "BOOT ERROR" overlay. Root cause confirmed
  by direct comparison against every other lazy import in the file (24 of
  25 correctly used the `.then(...)` mapping; `RuntimeManagerView` is the
  one exception, but that's fine because its component file uses `export
  default function`, so it has an actual default export to resolve).
  Fixed: added the missing `.then(...)` mapping. Verified live post-fix —
  renders correctly, zero console errors.
- **Why the test suite never caught this**: `BoardroomView` had zero test
  coverage before this sprint, and there is no App.tsx-level render smoke
  test in the suite. Added two regression tests: `src/test/boardroomView.test.jsx`
  (renders without throwing + asserts the module has no default export, so a
  future contributor doesn't "fix" the type error by adding a default export
  without checking the `App.tsx` side of the contract) and
  `src/test/appLazyImports.test.js` (a static guard that parses every
  `lazy(() => import(...))` call in `App.tsx` — 26 total — and verifies the
  target module's actual export shape matches what each call expects; this
  is what confirms BoardroomView was the *only* mismatch, not an assumption).
- **Discoverability findings, all verified live** (this was the actual
  scope of the audit — is a real, wired feature actually reachable):
  - **Coach Mode**: real and functional. Clicking the sidebar footer "Coach"
    button toggles `coachMode` state correctly (confirmed via the Dashboard
    stat tile flipping "Off" → "On"). Not a bug. It sits in the sidebar
    footer with the exact same visual weight as Settings and the light/dark
    toggle — no badge, no distinct color, no explanation — which is the most
    likely reason a user reported it "feels forgotten." No UI change made
    this pass (a visual-prominence decision, logged as a follow-up, not
    silently fixed).
  - **Boardroom / Mission Room**: reachable via the sidebar "Boardroom" nav
    item (opens to a "Mission Room" / "Boardroom Sessions" sub-tab pair).
    Minor naming mismatch: the nav item is labeled "Boardroom" but its
    default sub-tab is "Mission Room," not "Boardroom Sessions" — cosmetic,
    not functionally confusing once opened.
  - **Agent Pairing** (`AgentPairingView`): reachable only via sidebar "All
    Agents" → "Pairings" tab inside `EcosystemHub`'s 7-tab bar (Overview /
    Queue / Skills / Workflows / Pairings / Workshop / Advanced) — 2 clicks
    deep behind a generic tab label that gives no hint agent-to-agent
    pairing lives there. Confirmed rendering correctly (9-agent pairing grid
    visible).
  - **Ecosystem Maturity panels + Self-Development panel**: reachable only
    via "All Agents" → "Advanced" tab, and only visible after scrolling
    past the Operator Modes / Trust-Verification-Layer sections that also
    render there. Confirmed rendering correctly (Live Ecosystem Map
    Foundation with all 9 agent tiles visible on scroll).
  - **Operator Dashboard — the clearest "buried" case**: has **no sidebar
    nav entry at all**. The only path to it is a "Operator" quick-launch
    card on the Dashboard home tab (`MissionControlHome.tsx` line 251:
    `{ title: 'Operator', detail: 'Settings, Coach, and memory', tab:
    'operator', ... }`). When Operator Mode is off (the default for a fresh
    install), opening this tab shows nothing but a bare "Operator Mode is
    Off" card with an "Enable" button — no preview of telemetry, proofs,
    memory dashboards, or supervised runtime tools that exist behind it.
    A first-time user has zero visual reason to enable it.
- **Explicitly not changed this pass** (UI-placement/prominence is a design
  decision, not a bug — flagged for a follow-up, not assumed): whether
  Operator Dashboard should get a sidebar nav entry, whether Coach Mode
  should get a status badge, whether the Pairings/Advanced tabs should be
  renamed or promoted. These are recommendations for a future UX pass, not
  done silently in this audit.
- **Environment note, not a code defect**: while starting `npm run dev` for
  this audit, discovered an unrelated third-party dev server ("MINT — AI
  Content Workstation") already bound to the wildcard address on port 5173
  on this dev machine. Vite correctly fell back to binding
  `127.0.0.1:5173` explicitly and logged a warning; the audit had to target
  `http://127.0.0.1:5173` rather than `http://localhost:5173` to reach the
  right server. Not an Alphonso bug — logged here only so a future session
  doesn't waste time rediscovering it.

## 11.10 ALPHONSOTOTHEMOON Sprint 4: security hardening Batch 2 (2026-07-02, v2.5.6)

Full context in `ALPHONSOTOTHEMOON.md`. Audited already-merged Sprint 2 code
directly (grep + read), not via the diff-scoped `security-review` skill,
since there was no pending PR to review.

- **Real authentication-bypass bug found and fixed**: `telegramCompanionService.js`'s
  `/start` owner registration was first-come-first-served — whichever chat
  messaged the bot first (while no owner was yet registered) became the
  *permanent* owner with full command authority to route arbitrary text to
  Jose. Telegram bot usernames are publicly searchable (unlike bot tokens),
  so an attacker who found the bot before its legitimate owner could win
  this race. Fixed by gating first-time registration on
  `TELEGRAM_ALLOWED_CHAT_IDS` — a credential field that already existed in
  `ConnectorSetupPanel.tsx` (labeled "optional") but was never read or
  enforced anywhere in `telegramCompanionService.js` before this fix.
  Registration now refuses if the allowlist is empty or the chat ID isn't
  on it. UI label changed to "(required to pair)" with an explanation.
  3 new regression tests added to the existing owner-registration test
  block (22/22 passing total for that file, up from 19).
- **Design note**: the plan discussed with the user before implementing was
  a newly-generated pairing code shown in Settings. While implementing,
  found the allowlist field already existed and was dead code — reused it
  instead (same security guarantee, less new surface, activates a
  previously-inert UI field). Documented as a transparent pivot, not a
  silent substitution.
- **Constant-time token comparison** added to both
  `gateway/generic-webhook/src/server.js` and
  `gateway/whatsapp-cloud/src/server.js` — both compared shared secrets
  with plain `===`. The WhatsApp gateway's actual HMAC payload-signature
  check (`verify.js`'s `verifySignature`) already correctly used
  `crypto.timingSafeEqual`; only the simpler bearer/query-token checks had
  drifted from that pattern. Added a shared `constantTimeEqual()` helper
  to both gateways' `security.js` and to `verify.js`'s `verifyChallenge`.
- **Audited, no fix needed**: `discordConnector.ts` is outbound-only, no
  automatic ingestion pipeline exists for its `getChannelHistory()` or any
  other read into agent prompts. `genericWebhookService.js`'s drained
  events only produce an audit receipt + UI notification count, never
  reach `createJoseCommandRoute`. Same for `whatsappBrowserConnector.js`.
  `.github/workflows/ci.yml` confirmed: `npm audit --audit-level=high` and
  `cargo audit --deny warnings` both already fail the build on findings
  (no `continue-on-error` on either).
- **Documented, not implemented** (user's explicit choice): OS-level
  credential storage (e.g. Windows Credential Manager via a Tauri plugin)
  vs. the current localStorage + SQLite dual-write. Recommended for a
  future sprint if/when multi-user or shared-machine use is ever
  supported; not urgent for a single-user local-first desktop app.
  Tracked as a Sprint 6 carryover item.
- **Bonus fix**: closed the `ConnectorSetupPanel.test.jsx` failure open
  since Sprint 2 (documented one-line fix: added
  `hydrateConnectorCredentialsFromSqlite: vi.fn().mockResolvedValue()` to
  its `connectorAuth` mock factory) — found while already touching that
  file for the Telegram UI copy change.
- Verification: 48/48 targeted tests passing, `npx tsc --noEmit` clean,
  ESLint clean.

## 11.11 ALPHONSOTOTHEMOON Sprint 5, batch 1: connectors subsystem TS migration (2026-07-02, v2.5.7)

Full context in `ALPHONSOTOTHEMOON.md`. `src/services/` root level is still
115 `.js` / 16 `.ts` — this batch targeted the `connectors/` subdirectory
specifically, per the sprint's own "batch by subsystem, connectors first"
guidance, not the root-level count.

- **Migrated 6 files**: `connectorConstants.ts`, `tavilyConnector.ts`,
  `perplexityConnector.ts`, `deepseekConnector.ts`, `n8nConnector.ts`,
  `connectorAuth.ts`. `src/services/connectors/` moved from 3 `.ts` / 10
  `.js` to 9 `.ts` / 4 `.js`.
- **Deliberately deferred** to a follow-up batch:
  `connectorImageGenerators.js` (375 lines), `connectorOutbound.js` (952
  lines), `connectorPolling.js` (452 lines), `connectorRegistry.js` (682
  lines) — larger files, more surface area per migration, consistent with
  "do not attempt in one pass."
- **Verified the rename pattern was safe before touching anything**: this
  codebase already imports `.ts` connector modules
  (`discordConnector.ts`/`slackConnector.ts`/`githubConnector.ts`) via
  literal `.js`-suffixed import specifiers in several other files (Vite's
  bundler module resolution rewrites the extension) — confirmed by
  grepping for `discordConnector.js`/`slackConnector.js` and finding real
  hits before assuming the same would work for the 6 files in this batch.
  No import statement needed changing across the ~15 files that reference
  these connectors.
- **Real bug caught by typechecking, not just a mechanical rename**:
  `connectorAuth.ts`'s new `updateConnectorAuthProfile()` type signature
  caught `ConnectorSetupPanel.tsx` passing a raw, unnormalized string as
  `allowlist` — the function's own `normalizeAllowlist()` call already
  handled this correctly at runtime, but the untyped JS had been silently
  accepting the mismatch. Fixed the type to explicitly accept the
  pre-normalization string input this call site actually passes, rather
  than loosening the type to `any` to make the error disappear.
- **Found and fixed a related test gap while running the full targeted
  suite**: `src/test/connectors/telegramCompanionService.test.js` is a
  second, duplicate Telegram companion test file that Sprint 4's
  owner-registration security fix hadn't touched (only
  `src/test/telegramCompanionService.test.js` was updated at the time).
  It had the same `TELEGRAM_ALLOWED_CHAT_IDS` mock gap and 2 failing
  tests as a result — fixed with the same mock pattern plus 2 new
  regression tests (empty-allowlist refusal, wrong-chat-id refusal).
- Verification: 275/275 targeted tests passing, `npx tsc --noEmit` clean,
  ESLint clean.

## 11.12 ALPHONSOTOTHEMOON Sprint 5, batch 2: 10 more root-level services (2026-07-02, v2.5.8)

Full context in `ALPHONSOTOTHEMOON.md`.

- **Migrated the 10 smallest remaining root-level `.js` files**:
  `connectorRegistryService.ts`, `workflowMemoryService.ts`,
  `workspaceArtifactService.ts`, `agentAuditService.ts`,
  `connectorAuditLogService.ts`, `agentPairingRegistryService.ts`,
  `miyaMemoryService.ts`, `crashLogService.ts`, `metaPublishService.ts`,
  `memoryService.ts`. Root-level `src/services/*.js` count: 115/16 →
  105/26.
- **Verification hit the documented vitest worker-pool timeout mid-run**:
  a ~27-file test invocation across the affected surface partially failed
  to start workers for 6 files (not test failures — worker-spawn
  timeouts). Re-ran those 6 individually; all passed. A further ~17-file
  batch surfaced one genuine test failure
  (`telegramConnectorProof.test.js`) — verified this was pre-existing and
  unrelated by running `git stash` (removing this session's changes
  entirely), reproducing the identical failure, then `git stash pop` to
  restore. Not caused by this migration.
- Verification: 269/270 targeted tests passing (the 1 known pre-existing
  failure excluded), `npx tsc --noEmit` clean, ESLint clean.

## 11.13 ALPHONSOTOTHEMOON Sprint 6 (started 2026-07-02, v2.5.9): fixed the ESLint `.ts`/`.tsx` coverage gap

Full context in `ALPHONSOTOTHEMOON.md`. Note for anyone reading prior
entries in this file: every "ESLint clean" claim logged before this entry
was accurate for the files ESLint actually processed, but `.ts`/`.tsx`
files were never among them — see below.

- **Root cause**: `eslint.config.js`'s only `files` block was
  `src/**/*.{js,jsx}`. No `.ts`/`.tsx` file in the repo (114 `.tsx`
  components, 26 `.ts` services as of Sprint 5 batch 2) had ever been
  linted.
- **Fix**: installed `typescript-eslint` (parser + plugin), added a
  matching `src/**/*.{ts,tsx}` rule block using `tseslint.configs.recommended`
  as a base, with `no-unused-vars`/`@typescript-eslint/no-explicit-any`
  turned off to match the existing leniency already established for
  `.js`/`.jsx` (avoids an unmanageable wall of findings on day one).
- **Immediately surfaced 37 real findings.** Fixed everything safely
  fixable:
  - 11 stale `eslint-disable` directives — auto-fixed.
  - 8 empty `catch {}` blocks (`ModelSwitcher.tsx` ×2,
    `appUpdateService.ts`, `licenseService.ts` ×3,
    `policyEnforcementService.ts` ×2) — each given an explanatory comment
    after confirming it was a legitimate fallback pattern, not a bug.
  - A real bug-shaped pattern in `SmartVoiceButton.tsx`: `cond ? a() :
    b();` as a bare statement (ternary used for side effects) — rewritten
    as `if (cond) a(); else b();`.
  - 3 `require()` calls inside try/catch in `SettingsView.tsx` — checked
    that `getWatcherConfig`/`saveWatcherConfig`
    (`echoFileWatcherService.js`) and `getUsageStats`
    (`memoryMonitorService.js`) are always-resolvable named exports
    before converting to static top-level imports (confirming the
    dynamic `require()` wasn't defensive lazy-loading, just unnecessary
    indirection).
  - 4 empty `interface X extends Y {}` in `global.d.ts` converted to
    `type X = Y` aliases (same semantics, satisfies the rule).
- **Deliberately deferred, not silently patched over**: 9 files use
  `// @ts-nocheck` (`App.tsx`, `ApprovalModal.tsx`, `ChatView.tsx`,
  `ConnectorHealthPanel.tsx`, `OllamaOfflineBanner.tsx`,
  `OnboardingWizard.tsx`, `SettingsView.tsx`, `Sidebar.tsx`,
  `WorkflowBuilderView.tsx`). These were written before any type
  checking existed for them; removing `@ts-nocheck` from any would
  likely surface a large batch of real type errors per file — a
  separate, much bigger scoped effort. Added a targeted `eslint.config.js`
  override, listing these 9 exact file paths (not a wildcard), that
  disables only `@typescript-eslint/ban-ts-comment` for them, with a
  comment instructing future contributors not to widen the list.
- Verification: `npm run lint` clean (exit 0), `npx tsc --noEmit` clean,
  133/133 targeted tests passing across every file touched.

## 11.14 First release since v2.4.4 — found and fixed a real version-drift bug (2026-07-02, v2.5.10)

User requested a tag + CI release + installer. Tagged and pushed `v2.5.9`;
`.github/workflows/release.yml` built and published successfully on
GitHub Actions (Windows runner, 19m47s: `npm run verify:app`, `cargo
test`/`clippy`, signed `tauri build`, GitHub Release with installer +
`.sig` + `latest.json`).

- **The published release was checked, not assumed correct.**
  `gh release view v2.5.9` showed the installer asset as
  `Alphonso_2.4.4_x64-setup.exe` — not `2.5.9`.
- **Root cause**: `package.json`'s version has been bumped every sprint
  since v2.4.4 (through 2.5.0–2.5.9), but `src-tauri/tauri.conf.json`
  and `src-tauri/Cargo.toml` — the actual Tauri application version,
  which drives the NSIS installer filename, the in-app About/version
  display, and the updater's version-comparison logic — were never
  touched. They still read `2.4.4`. Every "version bumped X → Y" claim
  in this project's history through Sprint 6 only ever updated the
  JS-side version; the shipped Tauri binary's version string was stuck.
  This went undetected for 9 version bumps because no release had been
  cut since v2.4.4 until this one.
- **Fix**: bumped `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`,
  and `src-tauri/Cargo.lock`'s `app` package entry to `2.5.10`, matched
  `package.json` to it, verified with `cargo check`, and cut a new
  release under `v2.5.10` rather than force-moving the already-public
  `v2.5.9` tag (it was live; someone could already be looking at it).
- **Process fix going forward**: any future "bump package.json version"
  step must also bump the three Tauri-side version locations in the same
  commit. Documented in `ALPHONSOTOTHEMOON.md`'s running log and Sprint 5
  tracker.

---

## 11.15 User bug-report pass — 15 issues traced to real root causes, not a sprint (2026-07-10)

Not a version bump or a planned sprint — the user reported 15 distinct issues live in
the running app and asked for root causes, fixes, and doc updates. Every claim below
was verified against real code (actual `invoke()` calls checked against actual
registered Tauri commands, actual test-suite contracts read before rewriting code,
actual test suites run before and after every change) — nothing here is inferred from
documentation or assumption.

**Fixed and verified:**

1. **Telegram bot never responded, despite a valid token, allowlist, and `/start`.**
   `telegramCompanionService.js` called Tauri commands that don't exist —
   `telegram_get_updates`/`telegram_send_message` — when the real registered
   commands (in `telegram.rs`, wired in `lib.rs`) are `connector_poll_telegram`/
   `connector_send_telegram`. Every call threw "command not found," silently
   swallowed by a bare `catch {}` in `telegramInvoke()`. Fixed the command names,
   adapted to the real `ConnectorPollProof`/`ConnectorInboundMessage` response
   shape, made the Rust commands accept a per-request `token` param instead of only
   reading an OS env var that's never set on a desktop install, and replaced the
   silent catch with real error logging.
   - Also found and fixed while in this file: `processInboundCommands` used
     `return` instead of `continue` inside its per-message loop — every command
     branch bailed out of the *entire* function after the first message in a poll
     batch, silently dropping every other message that arrived in the same
     4-second window. And a dead second `if (cmd === 'memory')` branch (shadowed
     by an identical earlier check) meant `/memory <query>` never actually
     searched — it always just listed recent items.
   - 40 tests in `src/test/connectors/telegramCompanionService.test.js` (2 new
     regression tests added), 22 in `src/test/telegramCompanionService.test.js` —
     all passing.

2. **CMD windows flashing open/closed while the app runs.** `CREATE_NO_WINDOW`
   (Windows-only flag to suppress a visible console window on child process spawn)
   was applied inconsistently — present at 2 of ~11 spawn sites in
   `runtime_manager.rs`, entirely absent from `lib.rs` (7 sites incl. `check_processes`'
   polled `tasklist` call — the most likely source of *recurring* flashes),
   `plugin_runtime.rs`, `voice_sidecar.rs`, and `workspace.rs`'s whisper spawn. Also
   found: `runtime_manager.rs`'s `kill_pid`/`is_pid_alive` helpers (used in a
   post-spawn health-check poll) were unguarded. Added a shared `no_window()`
   helper to `utils.rs`, applied everywhere. `cargo check`/`cargo clippy -D
   warnings` clean.

3. **Sidebar navigation items unreachable/clipped on short windows.**
   `Sidebar.tsx`'s nav item list (`NAV_SECTIONS`) was `shrink-0` inside a parent
   with `overflow-hidden` and no scroll of its own — if the list was taller than
   the window, items below the fold were simply clipped with no way to scroll to
   them (only the separate "Recent Chats" list below it had `overflow-y-auto`).
   Fixed: nav list now caps at `max-h-[45%]` with its own `overflow-y-auto` when
   the sidebar is expanded, and `flex-1 overflow-y-auto` when collapsed.

4. **Coach Mode: "even a page doesn't open."** Root cause was much deeper than UI —
   Coach Mode opens as a *separate Tauri webview window*
   (`new WebviewWindow('coach', ...)` in `coachModeService.ts`), and that window
   had **zero Tauri capability grants**: `src-tauri/capabilities/default.json`
   scoped every permission to `"windows": ["main"]` only, with no entry for
   `"coach"`. Even when the window opened, nothing inside it — including its own
   `invoke()` calls — could function. Added `"coach"` to the windows list. Also
   fixed a real silent-failure bug: `new WebviewWindow()` never throws
   synchronously on creation failure (errors only arrive later via an async
   `tauri://error` event nobody was listening for), so `openCoachWindow()` always
   *looked* successful even when it silently failed — now it actually awaits
   `tauri://created`/`tauri://error` and rejects on real failure.
   - Also found (self-reported after the user explicitly asked what bugs were
     found but not initially flagged): 3 more call sites in `CoachContext.jsx`
     (`handleToggleCoachTop`, `minimizeToCoach`, `openAlphonsoDesktopCard`) had the
     identical silent-catch pattern as the one first patched — all 4 now
     distinguish a real Tauri-runtime failure (surfaced as an error toast) from
     the expected web/dev-mode no-op.
   - 7/7 tests in `src/test/services/coachModeService.test.js` (1 new regression
     test for the `tauri://error` path).

5. **Voice OS completely non-functional — "not working at all."** This was not a
   missing-prerequisite issue; `voice/backend/pipeline.py` was fundamentally
   broken at the code level:
   - `run_pipeline(session_id, pcm, llm)`'s third parameter was named `llm` and
     called as `await llm(session_id, text, detect_agent(text))` — but the actual
     caller in `main.py` passes `conversation_history` (a plain list) as that
     argument. Calling a list as a function crashed every single voice
     interaction immediately after transcription succeeded.
   - No `_call_ollama` function existed anywhere in the backend, despite the
     pre-existing test suite (`tests/test_pipeline.py`) already expecting one
     with a specific async-generator streaming contract — the actual LLM call
     was simply never implemented.
   - `audio = synthesize(reply)` called an `async def` function without `await`,
     so (had it been reached) a Python coroutine object — not WAV bytes — would
     have been sent over the WebSocket.
   - No voice-activity-detection gate before transcribing — `vad.py`'s
     `is_speech()` existed but was never imported or called, so every audio
     buffer including background noise would trigger the (broken) pipeline.
   - Fully rewrote `pipeline.py` to match the pre-existing test contract: VAD
     gate → STT → agent detection → a real streaming Ollama `/api/chat` call
     (`_call_ollama`, new, using `httpx.AsyncClient`) → properly `await`ed TTS.
   - Secondary fix: the Piper TTS voice model (`en_US-lessac-medium.onnx`) isn't
     bundled and wasn't auto-downloaded — if missing, `tts.py` silently returned
     empty audio forever with only a Python-side log line nobody would ever see.
     Now attempts a one-time auto-download on first use via `piper.download_model()`.
   - `httpx` added to `requirements.txt` as an explicit dependency (was only
     present transitively).
   - 31/31 pytest passing in `voice/backend/tests/` (was 28/31 — the 3 failures
     were unrelated `router.py` bugs, also found and fixed this pass, see below).

6. **Mobile Companion pairing P0 — "was not pairing or getting connected."** The
   actual root cause, found by tracing the full pairing path end-to-end: **port
   8765 was double-booked.** `companion_types.rs`'s `CompanionConfig::default()`
   binds the Companion WebSocket server to port 8765; `voice_sidecar.rs` (and,
   independently, `runtime_manager.rs`'s `voice-os` `ToolDef` — a second,
   separate Voice OS launch path via the generic Runtime Hub) also started Voice
   OS's uvicorn server on 8765. Whichever service started first silently won the
   `TcpListener::bind`/socket bind; the other failed with `log::error!()` only —
   nothing ever reached the UI. Since the Companion server starts synchronously
   in `lib.rs`'s `.setup()` closure and Voice OS's watchdog only fires after a
   30-second idle delay, the Companion almost always won the race in practice,
   meaning Voice OS silently failed to start on every boot as a *second*,
   compounding symptom of the same bug. iOS hardcodes port 8765 in multiple Swift
   files (`MDNSService.swift`, `PairingView.swift`, `SettingsView.swift`), so
   Voice OS was moved to port 8766 instead, updated consistently across 6 files:
   `voice_sidecar.rs`, `tauri.conf.json`'s CSP, `voiceOsService.ts`'s default WS
   URL, `SettingsView.tsx`'s placeholder text, `runtime_manager.rs`'s `voice-os`
   ToolDef, and the matching test fixtures in `voiceOsService.test.js`.
   - **Not independently re-verified against a live paired phone this session** —
     the port collision is the most likely single point of total failure and is
     now fixed, but Windows Firewall blocking port 8765/mDNS UDP 5353 on first
     run remains a possible contributing factor that can't be ruled out from code
     alone. User should confirm pairing actually succeeds after this fix.
   - Also found and documented (not a bug, a UX gap): mDNS discovery
     (`companion_start_discovery`) is opt-in only, never auto-started at boot —
     it only fires when the user clicks "Start Discovery" in Settings, and
     nothing in the UI signals this is a required manual step.

7. **WhatsApp — "same issue as Telegram" + "add commands with real behavior."**
   Two real, distinct problems, both fixed:
   - WhatsApp had **zero command handling** — inbound messages landed passively
     in `WhatsAppInboxPanel` with no parsing, no reply logic, nothing. Built
     `src/services/whatsappCompanionService.ts` from scratch, mirroring
     Telegram's real command set: `/status`, `/queue`, `/approve`, `/reject`,
     `/agents`, `/report`, `/ping`, `/help`, `/ask` — every command calls the
     exact same real underlying services Telegram uses
     (`listApprovalQueue`/`approvePacket`/`rejectPacket`/`listAgentActivity`/etc.),
     not stubs. Owner-pairing gated behind a new `WHATSAPP_ALLOWED_NUMBERS`
     credential, mirroring the same security pattern as Telegram's Sprint 4
     owner-registration fix. Wired auto-start at boot in `useBootEffects.js`
     (previously only a manual "Poll" button in the Orchestrator view existed —
     no automatic inbound flow at all).
   - Found and fixed a second real bug while wiring the above:
     `WHATSAPP_CLOUD_GATEWAY_DRAIN_URL` — required by
     `browserPollWhatsAppGateway()` for inbound polling to function at all — had
     **no UI field anywhere in `ConnectorSetupPanel.tsx`**. WhatsApp inbound has
     been completely unconfigurable through the app regardless of what
     credentials were set. Added the missing field, plus the new
     `WHATSAPP_ALLOWED_NUMBERS` field, to the WhatsApp credential section.
   - 15 new tests in `src/test/services/whatsappCompanionService.test.js`, all
     passing, covering the pairing gate, command routing, and the same
     batch-processing correctness the Telegram fix required.

8. **`voice/backend/router.py` keyword-routing bugs** (surfaced by voice pipeline
   test failures, not user-reported directly, but real and fixed): dict
   iteration order meant `hector`'s broad `find`/`scan` keywords were checked
   before `nova`/`sentinel`, stealing matches meant for them ("find market
   opportunities" routed to hector instead of nova; "scan for security
   vulnerabilities" routed to hector instead of sentinel). `miya`'s pattern was
   also missing write/blog/draft/copy/email keywords entirely — "write me a blog
   post" matched nothing and fell through to `alphonso_core`. Reordered
   `ROUTING_PATTERNS` so specific agents are checked before hector's generic
   catch-all terms, added the missing miya keywords.

9. **`UpdaterNotification.tsx`'s button relabeled** from "Update & Restart" to
   "Download Update" — the old label was actively misleading; it never restarted
   anything, it opens the release download page in a browser.

10. **`docs/BOARDROOM_ROLES.md` / `docs/BOARDROOM_MODEL_REGISTRY.md` corrected.**
    Both describe an early, aspirational 11-seat Boardroom design — including
    "Hermes" and "Kairo" as agents, and "Shayan" (the founder) as a boardroom
    "seat" — that was never actually built. The real shipped product only has the
    9-agent roster (`agentRegistry.js`). Added correction banners to both files;
    kept for historical context, not deleted.

**Explanatory findings, not code fixes** (user explicitly asked to explain some
items rather than build against them):

- **Boardroom's actual purpose**: a real, working feature (not scaffolding) —
  convene a topic with selected agents, get a real Hector RSS briefing, real Jose
  command-bus routing, a real Maria governance risk score on conclusion, and a
  functional (but client-side-only) risk-confirmation gate before distributing
  high-risk summaries. Honest limitation: "agent responses" in a session are
  mostly Jose's delegation acknowledgment + Hector's briefing, not genuine
  multi-agent deliberation.
- **The approval-confirmation gate** in `BoardroomView.tsx` (`riskConfirmed`
  state, lines ~383-396) is real, not decorative — wired to a genuine
  `runMariaGovernanceAudit()` call — but is a soft, client-side-only nudge with
  no backend re-check.
- **Miya's role**: confirmed directly from `miyaProfile.js`'s own stated
  limitation ("does not claim generated media if engine is not connected") that
  she is architected as the creative-direction/planning layer, not the raw
  generation engine — her skill packs route to ComfyUI/SD WebUI/Runway for
  actual rendering.
- **The Orchestration page** (`OrchestratorView.tsx`) audited end-to-end: not
  dead scaffolding — every panel calls real services (`listAgentPackets`,
  `listApprovalQueue`, `orchestrationQueueService`, etc.) — but has genuine,
  provable duplication: the Packets tab embeds the real `OrchestratorQueueView`
  component (own 5s auto-refresh), while the Monitor tab separately re-implements
  a "Durable Queue" + "Dead-Letter Items" panel over the same underlying data on
  a different refresh cadence. Left alone per explicit user instruction ("leave
  the orchestration page for now") — not yet consolidated.
- **Docker/Runway**: zero code linkage found anywhere between the Runway
  connector and Docker — Docker is required only by the n8n connector
  (`ConnectorSetupPanel.tsx` credential hint). Likely a UI-adjacency confusion
  between "Runway" and "Runtime" (Hub), not an actual bug — unconfirmed without
  seeing the exact screen the user was looking at.

**Handed off, not built:** full in-app auto-update (download → verify → install →
relaunch). `docs/AUTO_UPDATE_HANDOFF.md` (new) has the complete scope, file-by-file
steps, and acceptance criteria — opened as PR #98 on branch
`feat/in-app-auto-update`. Deliberately not attempted in this pass: requires new
`@tauri-apps/plugin-updater`/`plugin-process` dependencies and new Tauri capability
grants, and can only be properly verified against a real signed release artifact,
not a dev build.

**Explicitly declined, pending user decision:** a large external Boardroom-rebuild
spec (bloome.im-style group chat UX — @mentions, agent-to-agent visible
critique/pushback, escalation banners, diff views, 20-step implementation plan)
arrived as a handoff PDF (`ALPHONSO BOARDROOM HANDOFF.pdf`, gitignored — not a
durable project record) mid-session. Flagged to the user that it directly
conflicts with their own earlier explicit instruction not to touch Boardroom yet;
not acted on pending explicit sign-off on which instruction supersedes the other.

**Verification summary:** 93 JS/TS tests passing across the directly-affected
suites (15 new WhatsApp, 2 new Telegram regression, 1 new Coach Mode regression),
31/31 voice backend pytest (was 28/31), `cargo check`/`cargo clippy -- -D
warnings` clean throughout every Rust change, `npx tsc --noEmit` clean, ESLint
clean (one pre-existing unrelated warning in `ChatView.tsx`, not touched this
session). `package.json` version unchanged at 2.5.18 — this was a bug-fix pass,
not a release cut.

Commits: `cab7b78`, `abe8ee5`, `2bb524b` on `main` (all pushed to
`origin/main`); `be11bd5` on `feat/in-app-auto-update` (PR #98, awaiting
implementation).

---

## 11.16 Boardroom rebuild (12 phases, real-time group chat) + PR #98 merge (2026-07-10, later same day)

Later the same day as 11.15, the user provided the previously-withheld
`ALPHONSO BOARDROOM HANDOFF.pdf` (a bloome.im-style multi-agent group chat
spec) and, after a Step 0/1 design review following the `brainstorming` and
`writing-plans` skills, explicitly authorized proceeding — overriding the
11.15 "don't touch Boardroom yet" hold. Built inline (not via subagents, per
explicit user policy) across 12 independently-planned, independently
TDD-verified, independently committed-and-pushed phases. Every phase's plan
doc (`docs/superpowers/plans/2026-07-10-boardroom-*-phase{1..12}.md`) states
its own scope limitations up front — the goal throughout was to build real,
bounded functionality and say plainly what it doesn't do, not to overclaim.

`BoardroomView.tsx` (the old session-summary model documented in §9/§11.9
above) is **replaced** as the mounted Boardroom component by
`BoardroomChatView.tsx`. `BoardroomView.tsx`'s file may still exist on disk
but is no longer wired in `App.tsx`'s lazy imports — do not describe it as
current.

**New services:**
- `src/services/boardroomThreadService.ts` — thread/message persistence
  (localStorage), `parseMentions()` (case-insensitive, dedup, ignores
  embedded matches like `foo@hector.com`), `findCrossThreadContext()`
  (keyword-overlap recall across other threads — plain overlap scoring, not
  semantic/embedding search), `acknowledgeThreadMessage()` /
  `confirmThreadMessage()` (one-way state flags), `migrateLegacySessions()`
  (auto-converts old `alphonso_boardroom_sessions_v1` sessions).
- `src/services/boardroomFacilitatorService.ts` — `generateAgentResponse()`
  calls real Ollama per-agent with a persona-specific system prompt sourced
  from `agentRegistry.js` (not hardcoded to Alphonso), returns measured
  `model`/`latencyMs` on success (real `Date.now()` timing, not an
  estimate). `detectLowConfidence()` — a fixed hedge-phrase list scan
  ("I'm not sure", "unclear", etc.); explicitly not real model
  confidence/logprob scoring, since Ollama exposes no such signal.

**Key safety/UX behaviors in `BoardroomChatView.tsx`:**
- `@mention`s chain across agents (a reply mentioning someone else triggers
  them too) — bounded by a hard `MAX_CHAIN_DEPTH = 3` cap per message
  cascade. Hitting the cap posts an amber "Needs your decision"
  (`kind: 'escalation'`) message instead of continuing. This was explicitly
  flagged as the highest-risk phase (uncontrolled generation loop) before
  being built, and scoped to a simple global depth counter rather than
  per-topic/per-pair round tracking.
- A **Stop** button (visible while `facilitatorPending`) halts further
  chained hops. Does **not** abort an in-flight fetch — `generateOllamaResponse`
  in `src/lib/ollama.js` has no `AbortController` wiring, and that's shared
  by every other caller in the app, so real cancellation was explicitly
  out of scope for this phase.
- Failed replies (`kind: 'failure'`) render distinct (rose styling) with a
  **Retry** button that reconstructs the original call from a stored
  `retryContext` field. Retry deliberately does **not** re-trigger the
  chaining a successful original reply would have.
- Escalation messages get a one-way **Acknowledge** control. Explicitly
  **not** a multi-human "seen by" roster — Boardroom has one human user
  (Shayan), so this is single-user acknowledgment, not presence tracking.
- Any message flagged `approvalRequired: true` (via the same real
  `classifyMissionRoomRisk()` `missionRoomService.ts` uses elsewhere)
  renders masked behind a **"Confirm to reveal"** gate until explicitly
  confirmed once. Before building this, grepped the entire Boardroom code
  path (`BoardroomChatView.tsx`, `boardroomThreadService.ts`,
  `boardroomFacilitatorService.ts`) for any connector/execution call —
  zero exist. This gates content *exposure*, not action *execution* — an
  honest distinction, since there is no live action-execution path in
  Boardroom's chat to gate.
- A small muted "model · Xs" label renders under real successful agent
  replies only (not escalation/failure/system messages).

**Live-verification finding (Phase 4):** ran a real, unmocked Ollama call
mid-phase and found a genuine bug mocked tests could never catch —
`generateOllamaResponse`'s hardcoded 30s timeout failed reproducibly
against a real multi-model Ollama instance (a cold model swap alone took
47.3s, total round-trip 73.1s). Fixed by bumping the timeout to 120s in
`src/lib/ollama.js`.

**Architectural decision (Phase 4):** Boardroom's chat does **not** route
through `agentBusService.ts` or `a2aProtocolService.ts` — both solve
governed packet execution / async task delegation, not "post a generated
chat message." `boardroomThreadService.ts` stays the sole source of truth
for Boardroom messaging.

**Deliberately deferred**, not forgotten (see each phase's own "Explicitly
NOT in this phase" section for exact scope): cards (spec 1.5),
regenerate/diff view (1.10.3/1.10.4), resource contention handling
(1.10.14), voice input (1.10.6), mobile parity (1.10.8).

**PR #98 (`feat/in-app-auto-update`) resolved in the same pass:** merged
`main` into the branch (25 commits, zero conflicts — Rust-side plugin
wiring for `@tauri-apps/plugin-updater`/`plugin-process` in `Cargo.toml`,
`lib.rs`'s `tauri_plugin_updater::Builder`, `capabilities/default.json`'s
`updater:default` permission, and `tauri.conf.json`'s updater block was
already correct on `main` — contrary to an earlier same-session assumption
that it was missing too, corrected by checking directly rather than
re-assuming). The actual reason the PR was unmergeable: `package.json`/
`package-lock.json` never declared the two npm packages despite
`node_modules` physically having them installed and
`UpdaterNotification.tsx` importing them — a fresh `npm ci` (what CI
actually runs) would have failed the build with module-not-found. Fixed by
adding both to `package.json` and running `npm install` to regenerate the
lockfile with proper entries. Also found and fixed, surfaced by the
branch's CI run: `Doc Count Freshness` was failing on 9 stale numeric doc
claims (lib.rs non-empty line count 2,197 vs. actual 2,056; services 165
vs. actual 168; test files 222 vs. actual 226) across README.md/
ARCHITECTURE.md/AGENTS.md — fixed against `scripts/shared/counters.mjs`'s
real computed values (`node scripts/verify-doc-counts.mjs` now passes
clean), not guessed. Merged into `main`.

**Auto-update status after merge:** `UpdaterNotification.tsx` now does a
real `check()` → `downloadAndInstall()` → `relaunch()` flow via the two
plugins. Code-complete but **not yet live-verified against a real signed
release** — that needs an actual version bump + tag, which this pass
deliberately did not cut (feature-build + branch-reconciliation, not a
release).

**Verification:** 95 tests passing across `boardroomThreadService.test.ts`
(27), `boardroomFacilitatorService.test.ts` (15), `boardroomChatView.test.jsx`
(25+), `appLazyImports.test.js` (intermediate per-phase counts also captured
in individual commits). `npx tsc --noEmit` clean throughout. `npm run lint`
clean except the same one pre-existing `ChatView.tsx` console warning noted
in 11.15, not touched this session either. `package.json` version:
unchanged at 2.5.18.

Commits (`main`): `a632711`, `8a4cbfc` (Phase 4) · `4ff93d2` (Phase 5) ·
`78ef11e`, `cdca50c`, `bceb431` (Phase 6) · `359d836`, `3ca8a34` (Phase 7) ·
`73a6d86` (Phase 8) · `357e6ff`, `f5bea52` (Phase 9) · `7cc62b9`, `50d30a3`
(Phase 10) · `8af1b18`, `03610f4` (Phase 11) · `6906af1`, `204b2a6`
(Phase 12) · `71036a7` (merge main → feat/in-app-auto-update) · `55fff06`
(dependency fix) · `cf069d5` (doc count fix) — the last three on
`feat/in-app-auto-update`, merged into `main` via PR #98.

Still genuinely open: the merged auto-updater is unverified against a real
release; `companionIntegration.test.js`'s fabricated Tauri command name
assertions (noted in 11.15, still not fixed — pre-existing test-quality
issue, not a production bug); all deliberately-deferred Boardroom spec
items listed above.

---

## 11.17 v2.6.0 live-verification bug pass — 6 real bugs found and fixed on a dedicated `DEBUGGING` branch (2026-07-10)

The user installed the v2.6.0 release built in 11.16, verified the
in-app auto-updater end-to-end for the first time (confirmed working —
banner shown, installer downloaded, old version uninstalled, new
version installed), and then reported 7 live issues. Per explicit user
instruction, all investigation and fixes happened on a dedicated
`DEBUGGING` branch (never on `main` directly) and were merged back only
once confirmed. Every root cause below was found by reading the actual
code paths involved, not by guessing from symptoms — several turned
out to be structurally different bugs than their symptoms suggested.

**Fixed (6 of 7), each with real tests, `cargo fmt`/`clippy -D warnings`
clean where Rust was touched:**

1. **Coach Mode wrongly said "requires Tauri runtime" inside the
   real installed desktop app.** `CoachContext.jsx` (3 call sites) and
   `telegramCompanionService.js`'s `isTauriAvailable()` checked
   `window.__TAURI__ !== undefined` — but Tauri v2 never sets that
   global unless `app.withGlobalTauri` is enabled in `tauri.conf.json`
   (it isn't, and was never intended to be). The correct check, already
   used correctly everywhere else in the codebase (`App.tsx`,
   `RuntimeManagerView.tsx`, `nativeSelfDevelopmentAutostartService.ts`),
   is `window.__TAURI_INTERNALS__`. The broken check meant
   `isTauriDesktop` was always `false`, so every real Coach Mode failure
   inside the installed app (e.g. a missing window capability grant) was
   silently reclassified as the expected-in-browser no-op message
   instead of surfacing the actual error.
2. **Telegram connector showed green/connected in Settings, but
   clicking "Test" said credentials were missing.** Not a race
   condition — `checkTelegramConnection`'s no-options fallback read the
   bot token from `localStorage['alphonso_connector_auth_profiles_v1']`
   under a `profiles[connectorId].apiKey` field, a completely different
   storage location and shape than where credentials are actually saved
   (`connectorAuth.ts`'s `saveConnectorCredential`, SQLite-backed under
   `alphonso_connector_credentials_v1`, keyed per-field e.g.
   `TELEGRAM_BOT_TOKEN`). The two systems never intersected — Test could
   never find a real token no matter what was saved in Settings.
3. **Telegram never responded to `/start` at all — not even the
   "pairing blocked" message.** `connectorAuth.ts`'s credential cache
   starts `null` and is only populated by an async
   `hydrateConnectorCredentialsFromSqlite()` call. `readAllCredentials()`
   locks the cache to `{}` the instant *anything* reads a credential
   before that hydrate resolves — and `useBootEffects.js`'s
   Telegram/WhatsApp companion-startup effects did exactly that, reading
   the token synchronously on mount with no hydrate call anywhere in the
   boot path. Once poisoned, the cache stays empty for
   `CRED_CACHE_TTL_MS` (60s), and any later default (`force=false`)
   hydrate call is a no-op due to `readAllCredentials`' own early-return
   guard — so `startTelegramCompanion()`/`startWhatsAppCompanion()` were
   silently never invoked, every boot, regardless of what was saved.
4. **Mobile Companion connected successfully but rejected nearly
   everything typed from the phone** with "Command not recognized as a
   Jose command." The iOS companion handler in `App.tsx` treated a
   `false` result from `isJoseIntakeCommand()`/`shouldRouteThroughJose()`
   as an outright rejection. Those two functions decide, within
   ChatView's own regular chat flow, between routing through Jose's
   multi-agent pipeline vs. answering directly via Ollama — returning
   `false` for ordinary messages (a greeting, a plain statement) is the
   *correct* signal there, since ChatView has a plain-chat fallback. The
   companion channel has no such fallback, so almost every message
   bounced. Fixed by always routing companion commands through Jose, per
   the effect's own stated purpose.
5. **The "Voice" sidebar page was completely empty.** `Sidebar.tsx` has
   always had a `id: 'voice'` nav item, but `App.tsx` never had a
   matching `activeTab === 'voice'` render branch — clicking it just
   showed blank content, and no Voice OS control view had ever been
   built. New `VoiceView.tsx`: real status (polled from the actual
   `voice_status` Tauri command), Start/Stop, the WebSocket URL once
   running, and a Python-prerequisite warning. Wired via the same
   named-export lazy-import `.then()` mapping pattern the rest of
   `App.tsx` uses, verified against `appLazyImports.test.js` — the
   regression test that exists specifically because a missing mapping
   for `BoardroomView` crashed the whole app earlier in this project's
   history (§11.9).
6. **Voice OS would not actually start, even after using Runtime
   Hub to "install" it.** The deepest bug of the six: two completely
   independent Voice OS provisioning systems exist that never agreed on
   where the Python virtual environment lives. Runtime Hub's `"voice-os"`
   `ToolDef` (`runtime_manager.rs`) is the *only* thing that ever
   `pip install`s Voice OS's dependencies (faster-whisper, piper-tts,
   fastapi, uvicorn, etc.) — into a venv at
   `runtimes_dir()/voice-os/venv` (`%APPDATA%\Alphonso\runtimes\voice-os\venv`
   on Windows). But `voice_sidecar.rs`'s `voice_start` — the command
   actually wired to the boot watchdog and the new Voice page — only
   ever checked for a venv under the *bundled app resource directory*, a
   location nothing ever creates a venv in. So even a fully successful
   Runtime Hub install was invisible to the real launch path:
   `voice_start` would silently fall through to bare system `python`,
   which crashes on the first missing import unless every dependency
   happened to be installed globally. Fixed with a new
   `resolve_voice_python()` helper (checks the Runtime Hub venv first,
   falls back to a bundled-resource venv, then bare system python as a
   last resort) and 3 new Rust unit tests covering all three resolution
   paths.

**Not yet fixed (1 of 7):** "output lands somewhere unknown, can't
find" — the user's message describing this was cut off before the
detail landed; needs clarification on what output and where it was
expected before this can be investigated.

**Process note:** all 6 fixes were committed individually on
`DEBUGGING` (never `main` directly, per explicit instruction), each with
its own real test (or, for the one exception — the `App.tsx` iOS
companion fix — a documented reason a new test wasn't added: the fix
sits inside an inline Tauri `listen()` callback in a 2000+-line
component with no existing mock harness, and building one from scratch
was judged disproportionate to a structurally trivial one-branch
removal; verified instead via full typecheck + lint + the existing
suite). A recurring hazard during this pass: this working directory is
shared with a concurrent OpenCode session actively expanding test
coverage on its own `TestParallal` branch — several `git stash
push --include-untracked` / commit / `git stash pop` cycles were needed
to keep OpenCode's uncommitted, unrelated stray files (which the shared
pre-commit lint hook would otherwise fail on) out of these commits
without disturbing or deleting any of that work. `DEBUGGING` was merged
into `main` via `git merge --no-ff` (commit `ef0ce1b`) once all 6 fixes
were verified, then deleted both locally and on `origin` per explicit
instruction. Doc-count drift from 3 new JS test files + 3 new Rust unit
tests fixed in the same pass (`410d4b0`).

Commits (`DEBUGGING`, in order): `175ee28` (Coach Mode), `edf5727`
(Telegram Test), `802eb23` (Telegram/WhatsApp boot start), `9335c79`
(Mobile Companion), `ab1b505` (Voice page), `4e6b758` (Voice OS venv
resolution). Merge: `ef0ce1b`. Doc fix: `410d4b0`.

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
| "Plugin tools run in the main thread, no Web Worker/iframe/subprocess isolation" (this file, until 2026-07-02) | Plugin tools already run as native OS subprocesses via `execute_plugin_tool` in `plugin_runtime.rs` (`Command::new`), not as in-process JS — there was never any plugin JS code to isolate with a Web Worker. This claim was written into ground truth itself without checking the Rust implementation; the real (narrower) gap was a missing per-plugin program allowlist, closed via `declared_programs`. |

**Root cause of all errors:** The audit was produced without reading `src/test/`, `src/agents/`, all of `src/services/`, or `.github/workflows/`. Future audits must verify all four directories before scoring any dimension.

**A separate, later audit — `14.07.2026CurrentStateofRepo.md` (repo root, dated 2026-07-14)** — is not known to contain factual errors the way the two above did, but carries the same general risk: it is a frozen point-in-time snapshot, not a maintained doc, and several of its numeric claims (test/file/line counts) are already stale relative to commits made after it was written. It now carries an explicit "do not trust on its own" banner at its top pointing back to this file and to `docs/PRODUCTION_READINESS_ASSESSMENT_2026-07-15.md` (added 2026-07-16). General rule, restated: no single audit or summary document — however recent — is ground truth by itself. Ground truth is the live code plus this file plus CLAUDE.md plus CHANGELOG.md read together, and when those disagree or leave a real gap, ask the user rather than guessing which one is current.

---

_Last verified: 2026-07-02 — v2.5.3. Fixed the auto-updater (it never checked for updates — `checkAppUpdate()` existed, tested, but was never called from `App.tsx`, and the Update button was a no-op; both fixed, full in-app install still needs `@tauri-apps/plugin-updater`, not yet installed). Closed a connector registry gap — Ollama, Brave Search, Perplexity, Tavily, DeepSeek, n8n each had working credential UI but no central registry entry; added all 6 (16 → 22). Seeded Sprint 3 (agent skill-library depth + feature-discoverability audit — investigated a "Coach Mode feels forgotten" report and confirmed it's actually wired via the main Sidebar, not dead code), Sprint 4 (security hardening Batch 2 — adversarial/attacker-resistance pass, not yet started), Sprint 5 (service-layer TS migration — corrected a stale claim that components were only 10/73 migrated; components are actually 100% done, the real gap is services at 115 `.js` / 16 `.ts`), Sprint 6 (runtime-hardening carryover). Confirmed via `.github/workflows/release.yml` that installer releases are built entirely by CI on tag push, not locally — this dev machine correctly has no signing key. TypeScript: 0 errors. package.json: 2.5.3. Targeted tests: 183/183 passing. Prior state (v2.5.2, 2026-07-02): ALPHONSOTOTHEMOON Sprint 2 — crash-recovery checkpoint, Discord connector, generic inbound webhook connector; connector count 14 → 16; found (documented, not fixed) a pre-existing `ConnectorSetupPanel.test.jsx` failure unrelated to any session change. Prior state (v2.5.1, 2026-07-02): ALPHONSOTOTHEMOON Sprint 1 — SHALAUDE License v1.0 added, skill-pack-to-agent-contract validation, default skill packs for all 9 agents, pipeline loop-guard/execution budget. Prior state (v2.5.0, 2026-07-01): security hardening (Batch 1) complete — SSRF, PKCE, tauri-plugin-dialog, arboard, per-program arg allowlist, policyDslService live, CSP narrowed. Open gaps: Voice OS Python prereq, plugin sandbox isolation, branch protection on main (manual step), rand/Tailwind/Vite major upgrades deferred, vitest worker-pool timeout on full-suite runs, `ConnectorSetupPanel.test.jsx` mock gap, full in-app updater install (needs plugin-updater/plugin-process deps), Sprint 3-6 backlog (see `ALPHONSOTOTHEMOON.md`)._

## 11.18 Repo audit, typecheck fix, and `TestParallal` branch resolution (2026-07-12)

User asked for a deep repo audit with a written orientation doc for future sessions, then separately asked to fix a bug the audit found, verify branch `TestParallal`, and merge it into `main` if it checked out — updating all docs afterward. Scope for the audit itself was explicitly agreed with the user as doc-synthesis + spot-checks, not a full `npm test`/`cargo check`/`cargo clippy` run.

**Audit deliverable:** `FABLE5.md` created at repo root — a short, durable fast-orientation doc for future agent sessions (points to `CLAUDE.md` → this file → `TODO.md` → `CHANGELOG.md` in read order, states what was verified vs. trusted, and is meant to be a pointer/delta layer, not a competing copy of this file). Read it before this file for a 5-minute warm start; it will be kept current as this session's findings age.

**Bug found and fixed:** `npm run typecheck` failed —
```
src/test/test-mocks.ts(117,12): error TS2304: Cannot find name 'global'.
```
`test-mocks.ts`'s `mockTimestampMs()` did `vi.spyOn(global.Date, 'now')`; this repo has no `@types/node`/`"types": ["node"]` in `tsconfig.json`, so ambient Node globals aren't typed. Changed `global.Date` → `globalThis.Date` (standard, always-typed, behaviorally identical for this call). `npm run typecheck` now passes clean. The function has zero callers currently (dead code, pre-existing, not addressed — see next item for why).

**`TestParallal` branch — investigated, found to be stale rather than ahead, salvaged instead of merged:**
- User asked to double-check `TestParallal` and merge into `main` if it verified.
- `git merge-base main TestParallal` = `8498d01` (the 2.5.18→2.6.0 bump), **not** main's tip at the time (`ca7738a`, "6 fixes from DEBUGGING branch," section 11.17 above). `TestParallal` had forked before that commit landed and never picked it up.
- That missed commit added `src/components/VoiceView.tsx`, the Voice-OS venv-resolution fix in `voice_sidecar.rs` (item 6 of section 11.17, with unit tests), and doc updates — none of which existed on `TestParallal`. Merging `TestParallal` into `main` as literally requested would have deleted `VoiceView.tsx`, reverted the venv fix, and dropped doc updates: a real regression.
- `TestParallal`'s own two commits (`dbc3b5e`, `89a6e73`) added `src/test/tauri-mock.ts` (193 lines: Tauri API mocks — invoke/listen/window/tray/notification/os) and `src/test/test-mocks.ts` (151 lines: service mocks — policy gate/connector registry/agent bus/cache/receipts/contracts/license), plus a stray leftover `commit-msg.txt`. Neither mock file is imported by any test file yet — inert scaffolding. `dbc3b5e`'s commit message claimed "14 React hooks tests... 200+ tests... all 243 test files pass with 3738 tests"; **none of those test files exist in the diff.** The message was aspirational/fabricated, not a record of real work — flagged explicitly so future sessions don't trust a branch's commit messages over `git diff`/`git show --stat`.
- Explained the tradeoff to the user (regression risk vs. speculative-value scaffolding); user confirmed: keep the scaffolding (low risk, may save time when hook tests are eventually written for real), but don't merge the stale branch or its misleading history. Created a temp branch off current `main`, copied over just the two mock files (with the `globalThis` fix already applied), committed with an honest message stating the files are unconsumed infrastructure, fast-forward merged into `main`. `TestParallal` itself was left alone (not deleted) for reference but is **not** part of `main`'s history and should not be re-merged as-is.
- `main` is now `ee228d0`.

**Drift check run (`npm run export:ground-truth`) — 2 numeric drifts found in this document, both now stale-flagged rather than corrected inline (the generator maintains its own snapshot; this file's prose claims were written at various past dates and drift is expected):**
- `src-tauri/src/lib.rs` lines: this doc has claimed as high as 4642 in places; live count is **2054** as of `main`@`ee228d0`. (Section 1/CLAUDE.md's "~2,024 lines" claim is closer and roughly current.)
- JS test files (`src/test`, `.js` extension only): claimed 65 in one spot, live count of `.js`-only test files is 177. Total test files across all extensions (`.js`+`.jsx`+`.ts`+`.tsx`) is **229** — this matches the "218 test files" ballpark claims elsewhere in this doc reasonably well; the drift-checker's 65-vs-177 comparison is specifically about the `.js`-only subset, not total test file count.
- Live counters from the same run, for reference: `services_total` 168, `components` 116, `agents` 27 (files under `src/agents/`, not the 9-agent roster — don't confuse the two), `scripts` 21, `test_files` 229, `test_lines` 30887, Ollama reachable with 6 models, Notion not wired.

**Verification performed:** `npm run typecheck` clean on `main` post-merge. Did not run `npm run test`/`npm run build`/`cargo check`/`cargo clippy` this pass (matches the doc-synthesis+spot-check scope agreed with the user). `git status` clean except `FABLE5.md` (new file, committed separately) and this doc update.

---

> _How to verify drift:_ run `npm run export:ground-truth` and read the **Drift vs ground truth** section of the generated file. It will flag any numeric claim in this document that diverges from the live repo.

## 11.19 `sprint-5-kilo-cli` branch review and rejection for PR (2026-07-14)

User asked whether stale local branch `sprint-5-kilo-cli` should be turned into a PR, whether it still verifies, and whether it conflicts with current `main`; docs were to be updated with the result.

**Conclusion:** do **not** open a PR from `sprint-5-kilo-cli` as-is.

- Branch position at review time: `main`/`origin/main` were both at `16ba2cc`; `sprint-5-kilo-cli` was 8 commits ahead of its own stale base but 78 commits behind current `main` (`git rev-list --left-right --count main...sprint-5-kilo-cli` = `78 8`).
- Branch verification in a temporary worktree failed before merge:
  - `npm run typecheck` failed with 10 TypeScript errors, including `src/components/BoardroomView.tsx` passing `[]` where `PriorOutputs` is required, `src/components/EcosystemMaturityPanels.tsx` state/type mismatch around `WorkflowOperation.status`, multiple incompatible `MissionRoom.tsx` state shapes, and `src/components/OperatorDashboard.tsx` assigning `OrchestrationReceipt[]` to `Record<string, unknown>[]`.
  - `npm run lint` completed with 1 warning (`src/components/ChatView.tsx` unexpected `console` call).
  - `npm run verify:docs` failed with 17 stale claims on that branch, including old version strings and outdated README/AGENTS/ARCHITECTURE counts.
- Mergeability against current `main` failed:
  - A non-committing merge in the temp worktree produced content conflicts in `README.md`, `docs/ALPHONSO_GROUND_TRUTH.md`, `docs/CHANGELOG.md`, `package.json`, `src-tauri/Cargo.lock`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src/services/backupService.ts`, `src/services/connectorHealthCheckService.ts`, `src/services/echoFileWatcherService.ts`, `src/services/missionRoomService.ts`, `src/services/novaAnalysisService.ts`, `src/services/pluginSigningService.ts`, `src/services/runtimeManagerService.ts` (add/add), and `src/services/workflowOperationsRegistryService.ts`.
  - `git merge-tree` also showed a broader changed-in-both/add-in-both conflict surface (27 entries total), confirming this is not a trivial rebase.
- Practical assessment: this branch is an old TypeScript-migration stack whose surviving unique changes are mixed with stale docs, stale version metadata, and service edits that now collide with later `main` work. Any useful ideas should be cherry-picked or reimplemented on a fresh branch from current `main`, not revived as a direct PR.

**Docs updated as part of this review:** README Rust unit test count fixed from 101 → 102; this section added here; matching note added to `docs/CHANGELOG.md`.

## 11.20 Voice/mobile doc reconciliation after recent `main` commits (2026-07-14)

User pointed out that the recent root-document updates still underrepresented how much had changed in voice and mobile since the stale TypeScript-migration branch. That was correct: the iOS companion README already described newer voice work that the top-level README/changelog summary did not.

**What changed on `main` recently, after the old branch diverged:**
- `fcc69fc` / `3e2b3b2` — a standalone `voice/cloud-backend/` service was added, then the repo was refactored to separate local Voice OS responsibilities from cloud voice responsibilities instead of mixing both concerns into the desktop backend.
- `f32f3f0` / `940fbed` / `f60e606` — the iOS companion's cloud voice transport was hardened: safer initialization, better credential handling, and explicit service override behavior.
- `1c493b2` / `913fecb` / `706b3fd` — follow-up operational fixes landed for local Ollama gateway config, Magpie-only cloud readiness, and unique TestFlight build numbers.
- `30253ee` / `b8776ac` / `57e9135` — Cloud Voice gained persona-aware routing plus Persian/Farsi support, with a dedicated Railway Piper service and playback retry handling.
- `b3fa949` — paired local companion conversations were updated to route by the selected persona rather than falling back to a generic reply path.
- `67703e3` / `16ba2cc` — Cloud Voice gained Supabase-backed device enrollment, and docs were added for that enrollment flow.

**Current architecture summary that top-level docs now need to reflect:**
- **Desktop app:** still owns the local-first voice runtime (`voice/backend/`, Voice OS, Ollama, local persona routing, companion WebSocket server).
- **Service split:** `voice/backend/` is the local desktop runtime; `voice/cloud-backend/` is now a separate cloud service with its own auth/config/contracts/tests; `voice/piper-farsi/` is a separate Farsi TTS service.
- **iOS companion:** now has a dedicated `VoiceView.swift` shell with separate `Local` and `Cloud` modes rather than being only a generic remote-control client.
- **Local mode:** push-to-talk turns are sent to the paired desktop and answered by the selected persona through desktop Ollama/Voice OS.
- **Cloud mode:** requests send `agent_id`, language, and response-voice selection to `POST /v1/voice/respond`; English uses NVIDIA TTS, while `fa-IR` uses Railway-hosted Piper voices `Mana` and `Manta`.
- **Security model:** the iOS app uses Supabase email one-time-code sign-in, stores the resulting session in Keychain, enrolls a generated device UUID, and sends only authenticated device-scoped Cloud Voice requests. Service-role credentials stay server-side.
- **Operational follow-ups already landed:** local voice calls can be pointed at a configured Ollama gateway, cloud readiness no longer requires more than the Magpie provider path, and the iOS build pipeline now uses unique TestFlight build numbers.

**Docs updated as part of this reconciliation:** README gained a new top-level "Voice + Mobile pass — 2026-07-14" section; `docs/CHANGELOG.md` gained matching unreleased notes; this section was added here to explain why the earlier branch-review-only summary was incomplete and what additional recent work had also landed.

## 11.21 PR #99 reviewed and merged — first 4 of 20 production-readiness tasks closed (2026-07-16)

User asked for a repo-state reconciliation: another, concurrent Claude Code session had been working on the remote and the user wanted to know what changed, what was committed/pushed, and what was left before anything got lost track of. Local `main` itself was clean and fully synced — the gap was entirely on the remote: PR #99 (`claude/production-readiness-audit-mxenki`, opened 2026-07-15, 11 commits) had been sitting open, unreviewed, unmerged.

**Discovery process (verified, not assumed):** `git fetch --all --prune`, `git branch -a`, `gh pr list --state all`, then `git diff main origin/claude/production-readiness-audit-mxenki --stat` to see the real shape of the branch before reading any of it.

**Also found:** the remote origin URL itself had changed from `github.com/Thatisshayan/AlphonsoEcosystem` to `github.com/obsidian-media/AlphonsoEcosystem` (PR #97, already merged 2026-07-06 — this was stale in the assistant's cross-session memory file, now corrected there too) — not a surprise once traced, but worth noting since a memory file citing the old URL would have sent future sessions to a dead/renamed remote.

**PR #99 review, file-by-file, before any merge action:**
- `src/services/licenseService.ts` + `src/config/licenseTrustKey.ts` + `scripts/issue-license.mjs` (T5) — the license paywall had been a client-side regex (`/^ALPHONSO-(PRO|ENT)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/`) checked against a plaintext key typed by the user, with **no server-side or cryptographic verification at all** — anyone could type a format-matching string, or simpler, just write `{"tier":"enterprise"}` into `localStorage['alphonso_license']` directly, and every premium connector unlocked. Replaced with offline ECDSA-P256 signed tokens: `licenseService.verifyLicenseToken()` checks a signature against `LICENSE_TRUST_KEY` (a public JWK, ships as `null` — fail-closed, every paid tier stays locked until the vendor generates a real key pair via `scripts/issue-license.mjs --generate-keys` and pastes the public half in) and an expiry, then holds the verified tier in memory (`verified`) rather than trusting storage as source of truth. `initLicense()` is called once at boot from `App.tsx`, and legacy insecure state (`alphonso_license`) is actively cleared on every boot so it can't linger and be misread. Test coverage rewritten (`src/test/licenseService.test.ts`, `src/test/services/licenseService.test.ts`, new `src/test/helpers/mintLicense.ts`) to assert forgery, tampering, and expiry are all rejected — 55/55 passing per the PR's own commit message.
- `src-tauri/src/companion_auth.rs` + `companion_server.rs` + `companion_router.rs` + `companion_types.rs` (T6) — the companion WebSocket's PIN pairing tracked a `pin_attempts` field on `ClientState::Pending` but **never read or enforced it** — an attacker on the LAN could hold a connection open and brute-force the 6-digit PIN indefinitely within its TTL, and the comparison itself was a plain `pin == attempt` (a timing side-channel, since Rust string equality short-circuits on the first differing byte). Fixed with `constant_time_eq()` (length-checked, XOR-accumulate byte comparison — length isn't secret since PINs are always 6 digits, but *which* digit differs must not leak via timing) plus a `max_pin_attempts` (default 5) budget enforced in `handle_auth()`: each wrong PIN increments the attempt counter and is echoed back to the client state; on the attempt that exhausts the budget, the live PIN is invalidated (`pin_manager.invalidate()`) and the connection is closed, so even a fresh guess attempt requires a brand new PIN to be generated and communicated out-of-band again. Both paths have dedicated Rust unit tests (`test_constant_time_eq`, `test_wrong_pin_locks_out_and_invalidates_after_budget`, `test_correct_pin_authenticates_without_closing`).
- `.github/workflows/ci.yml` (T1/T2/T10) — `cargo audit` had been running *before* fmt/test/clippy in the `rust-quality` job with `continue-on-error: false`; when the `spin 0.9.8` crate got yanked from crates.io, `cargo audit --deny warnings` failed and aborted the whole job before fmt/test/clippy ever ran — meaning CI on `main` had been silently gating nothing for however long that crate stayed yanked. Fixed two ways: bumped `spin` to `0.9.9` (unyanked) to make CI green immediately, and reordered the audit step to run **last** with `if: always()`, so a future yanked-crate advisory can dark-out at most itself, never the real quality gates before them — the reorder immediately un-masked and fixed a real hidden `cargo fmt` violation in `companion_router.rs` that had been sitting invisible behind the broken gate. Also fixed a Playwright collection-time crash: `test.describe.slow(...)` isn't a real API on the installed `@playwright/test` version, so the whole 28-spec E2E file threw at collection time and produced 0 collected tests — for months, meaning the E2E job had been gating nothing either. Fixed the API call, which un-hid the suite's true state: ~22 of 28 specs now fail at runtime as stale UI-interaction assertions needing live-app repair. Rather than either quietly leaving E2E fully red (blocking every future merge on unrelated, pre-existing spec rot) or leaving the collection crash in place (silently reporting "passing" while testing nothing), the job was made advisory (`continue-on-error: true`) with an explicit, dated code comment stating this is temporary and naming the tracking task (T10) — this was an **owner-approved tradeoff** documented in the PR itself, not a unilateral weakening of CI.
- Also fixed in the same PR: a flaky `latencyMs >= 5` wall-clock assertion in `boardroomFacilitatorService.test.ts` that intermittently reddened the JS test gate.

**Merge decision:** `gh pr merge 99 --merge --admin` was required — branch protection blocked a plain merge on 2 of ~15 required checks. Both were verified as pre-existing/unrelated before overriding, not assumed: `CodeQL (swift)` was independently confirmed failing on `main` itself via `gh run list --branch main --workflow CodeQL` (same failure, unrelated to this PR's changes), and the Playwright E2E check is the exact suite this same PR documents as intentionally advisory. User was asked and explicitly approved the admin override before it was used. Merged into `main` at `f782aa9` on 2026-07-16, then `git pull` to fast-forward the local working copy.

**Also done:** deleted a stale local-only branch `sprint-5-kilo-cli` — its remote counterpart had already been deleted on origin (shown as `[origin/...: gone]` in `git branch -vv`), and its 8 commits (TS migration batches 3–10) were already superseded by equivalent, already-merged commits on `main` with matching content — see §11.19 for the branch's original review/rejection history.

**T3 closed same day (2026-07-16), immediately after this section was written:** the `secrets-scan` (TruffleHog) CI job had been hard-failing on every direct push to `main` — not a real leak. Root cause, confirmed from the actual failing-run logs (`gh run view <id> --log`) across 3 separate push-to-main runs, all identical: `.github/workflows/ci.yml`'s TruffleHog step used `base: ${{ github.event.repository.default_branch }}` (i.e. `main`) and `head: HEAD` — on a `push` event *to* `main`, both resolve to the exact same commit (the one that was just pushed), and TruffleHog's own composite action explicitly refuses to scan and exits 1 when base equals head ("BASE and HEAD commits are the same"), rather than skipping quietly. This is why PR #99's own check for this job had shown "pass" — on a `pull_request` event, base/head are genuinely different (the PR's base branch vs. head branch). Fixed by diffing against `github.event.before` (the pre-push SHA) on push events, falling back to an empty base — i.e. full-history scan — when `before` is the all-zero SHA (a brand-new branch), and against the PR's actual base/head SHAs on `pull_request` events. Also added a real "Reporting a Vulnerability" disclosure/response section (contact method, 5-business-day ack target, 30-day fix target for critical/high, credit policy) plus an "Automated scanning" summary to `SECURITY.md`, which previously was only a historical fix-log with no reporting process — the task's own DoD ("secret-scan job green with a documented reason... disclosure process published") required both.

## 11.22 T4 branch protection enabled + `14.07.2026CurrentStateofRepo.md` given a trust caveat (2026-07-16, later same session)

User asked to proceed with T4 and to make sure the repo-root audit doc `14.07.2026CurrentStateofRepo.md` is clearly marked as not fully trustworthy on its own — explicitly framing ground truth as the combination of code + docs together, with the user as the tiebreaker when they disagree, not any single document (including this one).

**T4 — branch protection:** checked actual current state via `gh api repos/.../branches/main/protection` rather than assuming it was unset — it was **already partially configured** (`Test & Build` + `Rust Tests & Clippy` required as status checks, 1 approving review required, force-push and branch deletion both blocked, `enforce_admins: false`). This explains why merging PR #99 required `--admin` earlier the same session — a plain merge was already blocked by the existing review requirement, not by a rule this session was about to add. Expanded the required-status-checks list via `gh api -X PATCH .../required_status_checks` to add `Secrets Scan (TruffleHog)` and `Doc Count Freshness`, both now reliably green after T1–T3. **Deliberately left out of the required list:** `Playwright E2E Smoke Test` — it's intentionally advisory per T10's owner-approved decision (see §11.21), and requiring it would silently re-block every merge on ~22 known-broken, unrelated specs, defeating the point of making it advisory in the first place. Left `enforce_admins: false` — single/small-maintainer repo, and an admin override is exactly the escape hatch that was legitimately used to merge PR #99 after a careful manual review found the failing checks were pre-existing/unrelated; forcing every future judgment call like that through a second approver isn't warranted yet at this team size.

**`14.07.2026CurrentStateofRepo.md` trust caveat:** added an explicit warning banner at the top of the file itself (not just referenced from elsewhere) stating it is a frozen 2026-07-14 snapshot, pointing to this file's own §12 "Known Audit Errors" and to `docs/PRODUCTION_READINESS_ASSESSMENT_2026-07-15.md` (which already opens by saying it independently re-verified this report's claims rather than trusting them), and stating plainly that no single document is ground truth — code + `ALPHONSO_GROUND_TRUTH.md` + `CLAUDE.md` + `CHANGELOG.md` together are, and when those disagree or leave a gap, the answer is to ask the user, not to guess which doc is more current. Also added a corresponding row to this file's own §12 table so a reader who reaches §12 first (rather than opening the root file first) still learns about it.

**What's still open:** roadmap tasks T11–T20 (secret-scan triage, branch protection enablement, persistence schema, connector-DSL fail-open default, OS-keychain credentials, `lib.rs` split, live auto-updater/iOS-pairing verification, sidecar observability, service-role-key blast radius, doc-drift auto-generation, multi-agent budgets) are **not started** — full detail in `docs/PRODUCTION_READINESS_ASSESSMENT_2026-07-15.md` §6, which itself was updated same-pass to record the merge and mark T1/T2/T5/T6 done, T10 partial. CLAUDE.md's Real Gaps list and TODO §11 below were updated to point at the same roadmap doc rather than duplicating the full task list inline, so it can't drift out of sync across two places.




