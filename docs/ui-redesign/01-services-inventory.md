# Full Services Inventory

Compiled by cross-checking the real file system (`src/services/` — 190 files, 155 root + 35 across 7 subdirectories) against CLAUDE.md's "Do Not Duplicate" table, which the repo's own `verify:dnd-coverage` script confirms is currently 100% complete (every file documented, zero drift, checked live this session — not assumed). Grouped by domain for readability; nothing here is invented, every description traces to a verified source.

Purpose: this is the master reference for "what already exists and must not be silently duplicated or orphaned" while redesigning pages. If a page redesign needs new backing logic, check here first.

---

## Core Multi-Agent Orchestration

| Service | Role |
|---|---|
| `agentBusService.ts` | Packet-based agent communication bus — approve/reject packets, `getPacketById` |
| `agentContractService.ts` | Enforces each of the 9 agents' permission/execution boundaries; `validateSkillPackAgainstContract` |
| `joseExecutionEngineService.ts` | Jose's real orchestration pipeline — routes tasks, wave-based execution, budget/loop-guard (`PIPELINE_MAX_ASSIGNMENTS`/`PIPELINE_MAX_DURATION_MS`) |
| `joseCommandRouterService.ts` | Persists routed command history, wraps packet creation + orchestration queue/receipt transitions |
| `joseSchedulerService.ts` | Cron-style scheduled task runner (`SCHEDULE_PRESETS`) |
| `orchestrationQueueService.ts` | Queue + dead-letter handling, crash-recovery checkpoint (`recoverInterruptedExecutions`) |
| `orchestrationReceiptService.ts` | Audit/receipt event log for every orchestration step |
| `orchestrationGovernanceService.ts` | Governance rules layered over orchestration |
| `parallelExecutionService.ts` | Concurrency-controlled parallel task execution with retry |
| `packetExecutionService.ts` | Lower-level packet execution primitives |
| `a2aProtocolService.ts` | Agent-to-agent task delegation protocol (`delegate`, `getTaskStatus`) |
| `agentPairingRegistryService.ts` / `agentPairingExecutionService.ts` / `agentPairingConstants.ts` | Agent-to-agent pairing/collaboration system |
| `agentActivityService.ts` | Backing store for the live activity log |
| `agentAuditService.ts` | Approval audit trail (`logApprovalEvent`) |
| `agentMetricsService.ts` / `agentPerformanceService.ts` | Per-agent success/error/latency stats |
| `agentOutputStoreService.ts` | Stores agent-produced outputs |
| `agentVisualService.ts` | Visual-state helpers for agent UI |
| `agentAvatarService.ts` | **User-uploaded custom avatar only — no default portraits exist today** (see Draft A doc) |
| `toolRegistryService.ts` / `toolNotificationDispatcher.ts` / `toolConnectionService.ts` | Tool-call registry, notification dispatch, connection status |
| `verificationService.ts` / `verificationChainService.js` (agentWorkshop) | Multi-step verification with receipt trail |
| `recoveryService.ts` | Error recovery/retry orchestration |
| `resourceCostService.ts` | Tracks/estimates resource cost per action |
| `serviceScopes.ts` | Shared scope constants |
| `trustModel.ts` | `TRUST_STATES` enum + `trustColor()` — the one shared confidence-labeling vocabulary, used pervasively |

## Per-Agent Runtime Services (the 9 agents' real backing logic)

| Service | Agent |
|---|---|
| `agentBrainService.js` | Alphonso (non-streaming call sites) |
| `hectorResearchService.js` / `hectorBookmarkService.ts` | Hector — research drafts, RSS failover, bookmarks |
| `mariaAuditService.ts` / `mariaWeeklyReportService.ts` | Maria — governance risk audit (Ollama-backed), scheduled reports |
| `echoMemoryService.ts` / `echoFileWatcherService.ts` | Echo — memory synthesis/retention, filesystem watcher |
| `marcusExecutionService.ts` / `marcusPublishService.ts` | Marcus — governance-gated distribution/publish execution |
| `sentinelSecurityService.ts` / `sentinelGateService.ts` | Sentinel — security scan runtime, gating |
| `novaAnalysisService.ts` / `novaFeedbackService.ts` | Nova — opportunity scoring, feedback loop |
| `miyaMemoryService.ts` / `miyaExportPacketService.ts` / `miyaComfyWorkflowPresetService.ts` / `miyaWorkflowTemplates.ts` | Miya — creative memory, export packets, ComfyUI presets/templates |
| `creativeRoutingService.ts` | Routes creative tasks to the right agent |
| `codingAgentService.ts` | Agent-driven code generation |

## Connectors (25 registered, `connectors/` subdir + root-level)

| Service | Connector |
|---|---|
| `connectors/connectorRegistry.js` | `DEFAULT_CONNECTORS` — the master list of all 25 |
| `connectors/connectorAuth.ts` | Credential storage (SQLite-backed cache) |
| `connectors/connectorConstants.ts` | Shared constants |
| `connectors/connectorOutbound.js` / `connectorPolling.js` / `connectorImageGenerators.js` | Outbound dispatch, inbound polling, image-gen connector helpers |
| `connectors/githubConnector.ts` | Issues/PRs/releases/code search/workflows |
| `connectors/slackConnector.ts` | Messages/channels/files/reactions/webhooks |
| `connectors/discordConnector.ts` | Messages/channels/webhooks |
| `connectors/n8nConnector.ts` | Workflow trigger/list/toggle |
| `connectors/tavilyConnector.ts` / `connectors/perplexityConnector.ts` / `connectors/deepseekConnector.ts` | Hector's tiered search fallback chain |
| `connectors/nvidiaNimConnector.ts` / `connectors/geminiConnector.ts` | Free-tier cloud LLM providers |
| `connectors/hermesAgentConnector.ts` | Per-agent self-hosted Hermes Agent LLM backend (high-risk classified) |
| `telegramCompanionService.js` / `telegramBrowserConnector.ts` / `telegramAutoPollService.ts` | Telegram (21 bot commands + browser send + auto-poll) |
| `whatsappCompanionService.ts` / `whatsappBrowserConnector.ts` / `whatsappWebhookService.ts` | WhatsApp (9 bot commands + browser send + webhook) |
| `genericWebhookService.js` | Generic inbound webhook gateway client |
| `chatgptService.ts` / `claudeService.ts` | ChatGPT / Claude connectors |
| `composioService.ts` | Composio toolkit integration |
| `notionSyncService.js` | Notion database sync |
| `runwayService.ts` | Runway video generation |
| `chromaDbService.ts` | ChromaDB vector memory writes |
| `connectorRegistryService.ts` | Higher-level registry wrapper |
| `connectorAuditLogService.ts` / `connectorCircuitBreakerService.ts` / `connectorRateLimiterService.ts` / `connectorHealthCheckService.ts` / `connectorStatusService.ts` | Cross-cutting: audit log, circuit breaker, rate limiting, health checks, **the one `deriveConnectorStatus()` classification function** (do not re-derive) |

## Memory / Knowledge

| Service | Role |
|---|---|
| `memoryService.ts` / `unifiedMemoryService.js` | Consolidated memory API (4 legacy systems merged) |
| `memory/ecosystemMemoryService.js` | Backward-compat re-export shim |
| `memoryGraphService.ts` | Knowledge graph — nodes/edges, one-hop + multi-hop (`WITH RECURSIVE`) queries |
| `memoryGraphInferenceService.ts` | Structural common-neighbor edge inference, scheduled + fire-and-forget + on-demand |
| `memoryMonitorService.ts` | Memory usage monitoring |
| `durableMemoryService.ts` | SQLite-backed durable memory store |
| `chatPersistenceService.ts` | Dual-write chat history (SQLite + localStorage), serialized write queue |
| `workflowMemoryService.ts` | Workflow-scoped memory |
| `searchService.ts` | Memory/project search (Ctrl+P) |
| `sourceConfidenceService.ts` | Source credibility rating for Hector |

## Workflow / Automation (3 parallel systems — see note)

| Service | Role |
|---|---|
| `workflowBuilderService.ts` | Visual node-graph workflows |
| `workflowOperationsRegistryService.ts` | Governed operation templates (10 ops) |
| `workflowRegistryService.ts` | Jose-routed agent-chain workflows |
| `workflowExecutionService.js` | **The bridge between all 3** — `runVisualWorkflow`, `startWorkflowRun`, `executeWorkflowStep`; read its own header comment before adding a 4th system |
| `workflowReceiptService.ts` / `workflowTelemetryService.ts` / `workflowGovernanceService.ts` | Receipts, telemetry, governance rules |
| `batchOrchestratorService.js` | Project-goal + task-batch orchestration (BoardroomPanel — NOT the chat feature, naming collision) |

## Skill Packs

| Service | Role |
|---|---|
| `skillPackService.ts` | `BASE_PACKS` install/enable/CRUD entry point |
| `skillPackRegistry.ts` | Storage/audit-log persistence |
| `skillPackContent.ts` (+ `skillPackContentCore/Echo/Jose/Marcus/Maria/Nova/Sentinel.ts`) | Per-agent pack definitions, aggregated |
| `skillPackWorkflowData.ts` / `skillPackGuidance.ts` / `skillPackPermissions.ts` | Workflow skill defs, prose guidance, contract-permission re-export |

## Security / Governance / Licensing

| Service | Role |
|---|---|
| `policyEnforcementService.ts` | Gates every outbound connector call (Zero-Cost Mode, Approval Mode) |
| `policyDslService.ts` | Module-level policy rules (`policy.yaml`) — separate from the above |
| `licenseService.ts` | ECDSA-signed license token validation (Free/Pro/Enterprise) |
| `secureStorageService.ts` | OS-keychain wrapper (currently: license token only) |
| `crashLogService.ts` | 100-entry crash/error ring buffer |
| `repoAuditService.ts` | Automated repo audit |
| `pluginSigningService.ts` / `pluginSandboxService.ts` / `pluginRegistryService.ts` | Plugin ECDSA signing, sandboxed execution, marketplace registry |
| `approval/approvalService.js` | **Simulated** pending-approval store for Project Execution Mode — distinct from `agentBusService`'s real approve/reject |
| `audit/marcusAuditService.js` | Deterministic keyword-risk scorer for the simulated Agent Workshop pipeline — distinct from the real `mariaAuditService.ts` |

## Coach System

| Service | Role |
|---|---|
| `coachEngineService.ts` | 11 local detectors (approval theater, agent whiplash, rubber-stamp approvals, etc.) + Phase 4 Ollama-narrative rewrite |
| `coachInterventionService.ts` | Intervention orchestration |
| `coachModeService.ts` | Opens Coach as a **separate Tauri webview window** |
| `coachHistoryService.ts` | 50-entry fired-signal ring buffer |
| `coachSkillService.ts` / `coachSoundCueService.ts` | Skill-grid + audio cue system |

## Voice

| Service | Role |
|---|---|
| `voiceService.ts` | Browser SpeechRecognition fallback |
| `voiceOsService.ts` | Voice OS WebSocket client (`ws://127.0.0.1:8766/ws`) |
| `whisperTranscriptionService.ts` | File-based transcription via Tauri `pick_file` |

## Runtime / Infra Management

| Service | Role |
|---|---|
| `runtimeManagerService.ts` | AI runtime manager (13 tools: Ollama, Voice OS, prereqs, autostart) |
| `runtimeApiService.ts` | Bridge client (port 4444), falls back to registry offline |
| `runtimeLedgerService.ts` | Durable receipt ledger |
| `gitService.ts` | Git operations surface for agents |
| `moduleRegistryService.ts` | Module install/enable/list (`modules/` TOML manifests) |
| `nativeSelfDevelopmentAutostartService.ts` / `nativeRc0ProofService.ts` / `selfDevelopmentService.ts` / `rc0EvidenceService.ts` | Self-development/RC0 evidence tracking |
| `productionReadinessService.js` | Ecosystem maturity/readiness scoring |
| `systemHealth/systemHealthService.js` | System health checks (Project Execution Mode) |

## Project Execution Mode / Agent Workshop (simulated, parallel subsystem — see CLAUDE.md note)

| Service | Role |
|---|---|
| `agentWorkshop/agentRunnerService.js`, `aiReviewPolicyService.js`, `contextEngineeringService.js`, `diffProposalService.js`, `executionModeService.js`, `joseOrchestrationService.js`, `operationalModeService.js`, `providerAdapterService.js`, `traceabilityService.js`, `workContractService.js`, `accBridgeService.js`, `contentCatalystBridgeService.js`, `externalAgentAdapter.js` | Deterministic/localStorage-keyed backing for the parallel "Agent Workshop" planning UI — NOT Jose's real pipeline. `externalAgentAdapter.js`/`providerAdapterService.js` are the only ones that can trigger a real paid connector call, through the approval gate. |
| `projectExecution/projectDnaService.js`, `projectExecutionService.js`, `workshopSessionService.js` | Project-goal/roadmap/risk-register backing |

## Streaming / Chat Infra

| Service | Role |
|---|---|
| `streamingService.ts` | Real-time token streaming, abort, token counter |
| `offlineChatService.ts` | IndexedDB offline message queue |
| `modelSelectionService.ts` | Per-agent + global LLM provider selection |
| `screenIntelligenceService.ts` / `sessionIntelligenceService.ts` | Screen/session context awareness |
| `proactiveAgentService.ts` | 7 background checks, suggestion banner |
| `notificationService.ts` | Toast/notification dispatch backing |
| `eventsService.ts` | Generic event bus |

## Workspace / Files

| Service | Role |
|---|---|
| `workspaceFileService.ts` | File read/delete/move/search/list |
| `workspaceArtifactService.ts` | Workspace artifact management |
| `workspaceExportService.ts` | Full-workspace JSON export/import |
| `workspaceIntelligenceService.ts` / `workspaceRootService.ts` | Workspace-level context, active root path |
| `backupService.ts` | Export/import all `alphonso_*` data |
| `projectDirectoryService.ts` | Project directory management |
| `browserAutomationService.ts` | Open URL / fetch content / clipboard |
| `scaffoldTemplatesService.js` | Code/project scaffold templates |
| `devPacketService.ts` | Dev-packet handling |

## Misc / Cross-Cutting

| Service | Role |
|---|---|
| `cacheService.ts` | TTL + LRU memory cache (500-entry cap) |
| `appUpdateService.ts` | Auto-update check (real, wired) |
| `comfyuiSettingsService.ts` | ComfyUI path validation |
| `autoRunService.ts` | Auto-run behavior config |
| `localMarketplaceService.ts` | Local plugin marketplace |
| `missionRoomService.ts` | Mission Room operational data |
| `boardroomThreadService.ts` / `boardroomFacilitatorService.ts` | Boardroom chat threads/messages + real per-agent Ollama generation |

---

## Cross-cutting note: three deliberately-separate "workflow" systems

`workflowBuilderService.ts` (visual node graphs), `workflowOperationsRegistryService.ts` (governed templates), and `workflowRegistryService.ts` (Jose agent-chain workflows) are NOT redundant — `workflowExecutionService.js`'s own header comment documents how they relate. Do not consolidate them during redesign without understanding this first; a 4th competing system would be a real regression.

## Cross-cutting note: "simulated" vs. "real" parallel systems

Three places in this codebase intentionally simulate something the real system already does elsewhere, for the Project Execution Mode / Agent Workshop UI:
- `approval/approvalService.js` (simulated) vs. `agentBusService.ts` (real approve/reject)
- `audit/marcusAuditService.js` (deterministic keyword scorer) vs. `mariaAuditService.ts` (real Ollama-backed governance audit)
- The entire Agent Workshop subsystem vs. Jose's real orchestration pipeline

This matters directly for the redesign: **do not accidentally merge these two systems' UI into one page** without preserving the distinction — they have different guarantees.
