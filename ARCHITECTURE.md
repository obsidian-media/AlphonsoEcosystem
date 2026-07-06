# Alphonso Architecture

## Overview

Alphonso is a local-first AI companion desktop application built with Tauri v2 (Rust backend + React frontend). It runs entirely on the user's machine with no cloud dependency for core operation. A 9-agent multi-agent system handles intake, orchestration, research, creative generation, governance, distribution, memory, security, and analysis — all coordinated through a durable Jose orchestration pipeline and a centralized policy enforcement layer that fails closed on any unauthorized or ambiguous action.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, Tailwind CSS 3, Lucide React, Framer Motion — `.jsx` (most) + `.tsx` (10 key components) |
| Animation | Framer Motion (`src/lib/motion.ts` — `spring`, `tween`, `fadeUp`, `messageIn`, `panelIn` etc.) |
| Design Tokens | OKLCH CSS custom properties (`src/styles/tokens.css`) — all colors in perceptually-uniform `oklch()` syntax |
| Backend | Rust 1.77, Tauri 2.11, tokio async runtime, reqwest HTTP client |
| Voice OS | Python FastAPI (`voice/backend/`) — faster-whisper STT, piper TTS, webrtcvad VAD, Ollama LLM. Launched as a Tauri-managed sidecar process. WebSocket on port 8765. |
| AI (local) | Ollama (`llama3.2:3b` default), runs on-device |
| AI (cloud, optional) | Claude API (Anthropic), OpenAI API — policy-gated, approval-required |
| Storage | SQLite via rusqlite (bundled), localStorage (session/UI state, migration ongoing) |
| Deployment | Windows NSIS + MSI installer; Railway for gateway hosting; Tauri updater with signed manifest |

---

## IPC Flow

```
Tauri WebView (React)
  → window.__TAURI__.invoke("command_name", { ...args })
  → Rust #[tauri::command] handler (src-tauri/src/lib.rs)
  → SQLite (rusqlite) / reqwest (external APIs) / tokio tasks
  → Result<T, String> returned to frontend via Promise
```

All outbound connector calls additionally run through `policyEnforcementService.js` on the JS side before `invoke()` is called, and the Rust handlers do their own validation. The gate is fail-closed: if the policy is uncertain or credentials are missing, the call is blocked and an audit receipt is written.

---

## Agent Roster

| Agent | Role | Key Constraint |
|---|---|---|
| **Alphonso** | Local operator — execution, verification, packaging | General execution agent |
| **Jose** | Orchestrator — intake, routing, merge, confirm, report | Cannot bypass high-risk restrictions |
| **Hector** | Research + citations, source scan | Cannot execute terminal/filesystem/posting/purchase actions |
| **Miya** | Creative — strategy, script, storyboard, export | Cannot execute system commands or unapproved publishing |
| **Maria** | Governance, audit, risk, approval review | Does not perform destructive execution |
| **Marcus** | Approved distribution execution | Executes distribution only under approved paths |
| **Echo** | Memory historian and archival | Knowledge preservation only |
| **Sentinel** | Security monitoring, automation safety | Safety checks only, no destructive execution |
| **Nova** | Scoring, analysis, opportunity prioritization | Analysis only |

All agents have a profile, permissions file, and schema in `src/agents/`. All are registered in `src/agents/agentRegistry.js` and enforced by `src/services/agentContractService.js`.

---

## Orchestration Flow

```
Shayan (user input or Telegram/WhatsApp inbound)
  → Jose intake (joseCommandRouterService.js)
  → Decomposition into sub-packets
  → Agent assignment (agentContractService.js checks per-agent allowed/blocked actions)
  → orchestrationQueueService.js: new → pending_approval → queued → reported_to_jose
  → Execution (packetExecutionService.js → joseExecutionEngineService.js)
  → Approval gate if risky (policyEnforcementService.js, ApprovalModal UI)
  → Jose merge + confirm
  → Report to user (chat UI + optional Telegram/WhatsApp reply)
  → orchestrationReceiptService.js writes receipt events at every step
```

Dead-letter path: failed packets move to `dead_letter` state with replay capability.

---

## Voice OS Flow

```
Microphone (browser MediaStream API)
  → AudioWorklet (pcm-processor.worklet.ts — float32→int16 PCM at 16kHz)
  → WebSocket (ws://127.0.0.1:8765/ws — binary frames)
  → FastAPI voice server (voice/backend/main.py)
  → VAD gate (webrtcvad — discards silent frames)
  → STT (faster-whisper, tiny.en model, CPU int8)
  → Agent routing (voice/backend/router.py — 9 regex patterns)
  → Ollama /api/chat (same local model, streaming, conversation history)
  → TTS (piper, ThreadPoolExecutor — non-blocking WAV synthesis)
  → WebSocket binary frame back to browser
  → AudioContext playback
```

Barge-in: if the voice state is `speaking` and a new PCM chunk arrives, the current Ollama + TTS task is cancelled immediately via `session.cancel()`.

Conversation history: the server accumulates up to 20 messages (10 turns) per session; reset via `{"type": "reset"}` control message.

Tauri integration: `src-tauri/src/voice_sidecar.rs` manages a `Child` process via `VoiceSidecar(Mutex<Option<Child>>)`. Commands: `voice_start`, `voice_stop`, `voice_status` — callable from the React layer via `invoke()`.

---

## Service Layer

### Orchestration & Governance
- `orchestrationQueueService.js` — durable queue with full state transitions and dead-letter replay
- `orchestrationReceiptService.js` — receipt events across all pipeline phases
- `orchestrationGovernanceService.js` — governance layer over orchestration
- `joseCommandRouterService.js` — Jose intake, decomposition, routing
- `joseExecutionEngineService.js` — Jose execution engine
- `packetExecutionService.js` — packet-level execution

### Policy & Approval (fail-closed)
- `policyEnforcementService.ts` — centralized policy gate: zero-cost mode, approval mode, connector risk classification, auth/allowlist checks, license tier validation
- `licenseService.ts` — license tier system (Free/Pro/Enterprise) with premium connector gates
- `connectorRegistryService.js` — all 13 connector send paths run through policy gate before any external call

### Performance & Execution
- `parallelExecutionService.ts` — parallel task execution with concurrency control, retry logic, and task queues
- `cacheService.ts` — memory caching with TTL, LRU eviction, and global/connector/agent caches

### Agent Contracts
- `agentContractService.ts` — per-agent allowed/blocked action prefixes, checked before every packet execution
- `agentBusService.js` — inter-agent messaging bus

### Memory & Knowledge
- `memoryService.js`, `durableMemoryService.js` — general + SQLite-backed durable memory
- `miyaMemoryService.js`, `workflowMemoryService.js`, `workflowReceiptService.js`, `workflowTelemetryService.js`
- `sessionIntelligenceService.js`, `workspaceIntelligenceService.js`
- `sourceConfidenceService.js`, `trustModel.js`, `verificationService.js`

### Connectors & External
- `connectorRegistryService.js` — all outbound connector paths (policy-gated)
- `connectors/connectorOutbound.js` — frontend dispatch (policy-gated, calls Rust commands via invoke)
- `connector_commands.rs` — `connector_github_action`: GitHub REST API v3 — create_issue, dispatch_workflow, create_pr, get_repo, list_issues
- `connector_commands.rs` — `connector_slack_send`: Slack Web API chat.postMessage with optional thread_ts
- `connectors/connectorAuth.js` — connector authentication management
- `connectors/connectorOutbound.js` — outbound connector dispatch
- `connectors/connectorPolling.js` — inbound connector polling
- `connectors/connectorImageGenerators.js` — image generation connectors (SD WebUI, ComfyUI)
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
- `runwayService.js`, `appUpdateService.js`, `repoAuditService.js`

### Utility & Other
- `pluginSandboxService.js`, `pluginRegistryService.js`
- `recoveryService.js`, `runtimeLedgerService.js`
- `screenIntelligenceService.js`, `voiceService.js`
- `chatPersistenceService.js`, `notificationService.js`
- `coachModeService.js`, `skillPackService.js`
- `localMarketplaceService.js`, `resourceCostService.js`
- `agentAvatarService.js`, `agentVisualService.js`

---

## Storage

| Store | Contents | Implementation |
|---|---|---|
| SQLite `memory_records` | Agent memory with governance metadata (owner, sensitivity, retention, privacy) | Rust `rusqlite`, WAL mode enabled |
| SQLite `kv_store` | Durable key-value store for runtime state | Rust `rusqlite` |
| SQLite `runtime_ledger` | Runtime event ledger | Rust `rusqlite` |
| `localStorage` | Session state, connector auth profiles, UI preferences | Browser API — migration to SQLite ongoing |

SQLite runs in WAL mode (`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;`) for concurrent read/write performance.

---

## Security Model

- **CSP** — enforced via `tauri.conf.json` `security.csp` with a production policy string
- **policyEnforcementService.ts** — centralized fail-closed gate for all connector sends; blocks with an explicit blocked result object when uncertain or unauthorized
- **licenseService.ts** — license tier validation (Free/Pro/Enterprise) gates premium connectors
- **Zero-cost mode** — blocks paid connectors (Claude API, OpenAI, YouTube, etc.) by default unless explicitly overridden
- **Approval gates** — risky actions (external sends, uploads, publishes) require explicit user confirmation in the `ApprovalModal` UI before execution proceeds
- **Connector allowlists** — `TELEGRAM_ALLOWED_CHAT_IDS` and `WHATSAPP_ALLOWED_NUMBERS` block unauthorized senders at the Rust command layer
- **Secrets** — all credentials in `.env` only (never committed); `.gitignore` excludes `.env`, `.env.*`, `.tauri-updater-key`, `.tauri-updater-key.pub`
- **Plugin sandbox** — `pluginSandboxService.js` enforces token-based plugin isolation

---

## Deployment

| Target | Method |
|---|---|
| Windows installer | `npm run release:updater` → NSIS + MSI artifacts |
| Auto-updater | Tauri updater with signed manifest; keys generated via `npm run updater:keygen` |
| Gateway (WhatsApp Cloud inbound) | Railway static serve; service root `gateway/whatsapp-cloud/`; healthcheck at `/health` |
| Dev server | `npm run dev` (Vite, port 5173) or `npm run tauri dev` (full Tauri with Rust) |

---

## Known Technical Debt

- `src-tauri/src/lib.rs` is ~2,052 lines (25 modules in src/: `audit_log.rs`, `companion.rs`, `connector_commands.rs`, `kv_store.rs`, `main.rs`, `memory_store.rs`, `meta_publish.rs`, `native_proof.rs`, `ollama.rs`, `plugin_runtime.rs`, `policy_gate.rs`, `runway.rs`, `runtime_manager.rs`, `search.rs`, `telegram.rs`, `utils.rs`, `voice_sidecar.rs`, `whatsapp_webhook.rs`, `workspace.rs`, `youtube.rs`, and `lib.rs` itself)
- All frontend files are `.jsx` not `.tsx` — partial TypeScript migration (9 services migrated: policyEnforcement, agentContract, orchestrationQueue, license, cache, parallelExecution, memory, ollama, chatUtils)
- Some durable data still in `localStorage` instead of SQLite via `kv_set`/`kv_get` (3 keys remaining)
- WhatsApp Cloud API fully wired (v2.0.2): inbound via `browserPollWhatsAppGateway` (Railway `/queue/drain`), outbound via `browserSendWhatsApp`. No external relay URL needed.
- Playwright E2E wired into CI (`e2e/smoke.spec.js`, `e2e/boot.spec.js`)
- Component test coverage improved to ~28%+ (18 new service test files added in Direction 3 + Test Expansion sprint)
- Overall coverage ~38%+ (threshold 38%), 218 test files, 3,167+ tests
- GitHub connector tests: 20 tests in `githubConnector.test.js`; Slack connector tests: 16 tests in `slackConnector.test.js`
- `src-tauri/rustfmt.toml` added — `cargo fmt --check` now passes in CI
