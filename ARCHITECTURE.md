# Alphonso Architecture

> **Execution status:** Architecture describes intended and implemented design;
> it is not proof of release readiness. For active remediation tasks and required
> evidence, read [docs/TRUTH_FIRST_EXECUTION_PLAN.md](docs/TRUTH_FIRST_EXECUTION_PLAN.md)
> with [Ground Truth](docs/ALPHONSO_GROUND_TRUTH.md).

## Overview

Alphonso is a local-first AI companion desktop application built with Tauri v2 (Rust backend + React frontend). It runs entirely on the user's machine with no cloud dependency for core operation. A 9-agent multi-agent system handles intake, orchestration, research, creative generation, governance, distribution, memory, security, and analysis. Jose answers or plans every request as a graph of steps, each checked against one permission table and approved by what it does; Miya's content factory runs a whole video project (script to posted videos and their results) as one such request; and a centralized policy enforcement layer gates every outbound call. The JS `policyEnforcementService.ts` is fail-closed on missing credentials and Zero-Cost Mode (blocks paid connectors). The supplemental connector DSL (`policyDslService.ts`) is default-deny; it currently applies to the registry image-dispatch path in addition to the primary gate.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, Lucide React, Framer Motion — new UI components are `.tsx`; legacy production `.jsx` contexts and Content Catalyst files remain for a future migration. |
| Animation | Framer Motion (`src/lib/motion.ts` — `spring`, `tween`, `fadeUp`, `messageIn`, `panelIn` etc.) |
| Design Tokens | OKLCH CSS custom properties (`src/styles/tokens.css`) — all colors in perceptually-uniform `oklch()` syntax |
| Backend | Rust (minimum 1.77.2), Tauri 2 (2.12 in the lockfile), tokio async runtime, reqwest HTTP client |
| Voice OS | Python FastAPI (`voice/backend/`) — faster-whisper STT, piper TTS, webrtcvad VAD, Ollama LLM. Launched as a Tauri-managed sidecar process. WebSocket on port 8766 (moved from 8765 on 2026-07-10 — collided with the Mobile Companion WebSocket server, which also defaults to 8765). |
| AI (local) | Ollama (`llama3.2:3b` default), runs on-device |
| AI (cloud, optional) | Claude, ChatGPT (paid; Jose may use them for a step only when you allow paid models), NVIDIA NIM and Gemini (free tiers), Hermes Agents (self-hosted) — all policy-gated |
| Media (local) | FFmpeg (bundled on Windows), Kokoro voice-overs, MusicGen music, Whisper captions, ComfyUI pictures, AI clips (LTX-Video, Wan 2.2), the character reference model and motion transfer (Wan 2.1 VACE) — installed from Runtime Hub |
| Media (paid, optional) | Runway clips, ElevenLabs voices and sound effects, Higgsfield pictures, clips, characters and motion — each run asks first with the cost |
| Storage | SQLite via rusqlite (bundled), the OS keychain for connector keys and other secrets, localStorage (session/UI state), and project folders under the user's output folder (`<brand>/<project>/`) for the content factory |
| Deployment | Windows NSIS + MSI installer, macOS DMG (Apple Silicon), Linux AppImage; Railway for the WhatsApp gateway and the Farsi voice; AWS ECS for Cloud Voice compute (iOS); Tauri updater with signed manifest |

---

## IPC Flow

```
Tauri WebView (React)
  → invoke("command_name", { ...args })   (@tauri-apps/api/core)
  → Rust #[tauri::command] handler (registered in src-tauri/src/lib.rs, defined in its module)
  → SQLite (rusqlite) / reqwest (external APIs) / tokio tasks
  → Result<T, String> returned to frontend via Promise
```

All outbound connector calls additionally run through `policyEnforcementService.ts` on the JS side before `invoke()` is called, and the Rust handlers do their own validation. The gate is fail-closed: if the policy is uncertain or credentials are missing, the call is blocked and an audit receipt is written.

The desktop window's origin (`http://tauri.localhost`) is refused by local servers such as Ollama and ComfyUI, so calls to them go through narrow backend commands (`ollama_chat`, `ollama_pull_model`, `comfyui_request`, `comfyui_upload_image`, `comfyui_save_output`) instead of `fetch` from the window.

---

## Agent Roster

| Agent | Role | Key Constraint |
|---|---|---|
| **Alphonso** | Local operator — code, commands, plain questions and everyday writing | The only agent that may run code or change project files |
| **Jose** | Orchestrator — plans every request as steps, each to the agent who owns that work; runs and reports; does none of the work | Never runs code or publishes; may spend only on a paid-model step, which always asks |
| **Hector** | Research — finding facts, sources, competitors, stock clips (Nova judges them) | Read and write its own work |
| **Miya** | Creative — the content factory (including the finished video) and UI/UX design, never code | Read and write its own work |
| **Maria** | Governance & Risk Lead — governance, risk and quality reviews | Read and write its own work |
| **Marcus** | Distribution & Release Manager — posts and schedules | The only agent that may publish or send, after approval |
| **Echo** | Memory historian and archival | Read and write its own work |
| **Sentinel** | Security only | Read and write its own work |
| **Nova** | Scoring, analysis, timing, results | Read and write its own work |

All agents have a profile and schema in `src/agents/` and are registered in `src/agents/agentRegistry.js`. What each may do is one table, `src/services/jose/agentPermissionTable.ts`; `agentContractService.ts` and Jose's plan check (`jose/stepGraph.ts`) enforce it. The `src/agents/*/…Permissions.js` files are descriptive only.

---

## Orchestration Flow

```
A message (Chat, Telegram, WhatsApp, the phone, a schedule, Boardroom, a workflow)
  → answerOrPlan() (jose/joseInbound.ts) → decideJoseRoute(): answer, or plan
  → answer: Alphonso's model replies directly
  → plan: submitToJose() → planJoseRequest() (jose/josePlanner.ts)
      Jose's model writes a step graph (agent, action type, effects, needs),
      starting from a fitting template or fresh; checkPlan() checks it against
      the permission table and the limits (50 steps); one fix, else a fallback
  → bigger plans wait for "Run this plan" (jose/josePlanApproval.ts)
  → the request is saved (jose/joseRequestStore.ts) and shown on the Requests board
  → runJoseCommandExecutionPipeline() runs every ready step (joseExecutionEngineService.ts)
      each step waits on the effects that ask (jose/joseEffects.ts):
      spend, publish and delete always ask; run is asked per command
  → adaptPlan() (jose/joseAdapt.ts) may add review rounds, help steps,
      a larger model or a paid retry, checked again before they are added
  → a waiting step is approved in Chat, on the board or on Telegram, and
      resumeJoseRequest() carries the request on
  → Echo saves the decisions; the user gets the report (and Telegram, if paired)
  → orchestrationReceiptService.ts writes receipt events at every step
```

Dead-letter path: failed packets move to `dead_letter` state with replay capability. A request cut off when the app closed is marked interrupted and can be carried on; a waiting request expires after the days set in Settings.

---

## Content Factory Flow

```
A project (one idea for one brand, saved in <output folder>/<brand>/<project>/)
  → Run project: one Jose request (contentFactory/contentProjectPlan.ts)
  → research (Hector, Nova) → script (Miya) → reviews (Nova, Maria; up to 2 rounds)
  → waits: "Approve the review in Miya Studio first."
  → scenes and pictures → thumbnails → voice (Kokoro or ElevenLabs) → music
  → sound effects (optional) → stock clips (Hector) → AI clips and motion (local,
    Runway or Higgsfield; paid ones ask once) → finished 16:9 and 9:16 videos
    (Alphonso, FFmpeg) → Shorts and carousel (when asked for) → campaign
  → quality gate (Maria, Sentinel) → Publish (Marcus; always asks)
  → YouTube, Facebook (scheduled on the platform), Instagram (sent by Marcus's runner)
  → numbers read at 1 h, 1 day, 7 and 30 days → lessons and ideas you keep or drop
```

Each step's result is saved to the project as it finishes (`contentStepRecorder.ts`), with versions and an "Out of date" mark when an earlier step changes. The Calendar (`components/calendar/`) shows every brand's posts and moves them, on the platform too when they are scheduled there.

---

## Voice OS Flow

This diagram describes the intended pipeline; `voice/backend/pipeline.py` did not
actually implement it correctly until 2026-07-10 (it called a nonexistent LLM
function with the wrong signature, never awaited the async TTS call, and had no
VAD gate — see `docs/ALPHONSO_GROUND_TRUTH.md` §11.15). The flow below is now
accurate to the real code.

```
Microphone (browser MediaStream API)
  → AudioWorklet (pcm-processor.worklet.ts — float32→int16 PCM at 16kHz)
  → WebSocket (ws://127.0.0.1:8766/ws — binary frames)
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
- `jose/` — `joseInbound.ts` (answer or plan), `submitToJose.ts`, `josePlanner.ts`, `stepGraph.ts`, `joseEffects.ts`, `agentPermissionTable.ts`, `joseRequestStore.ts`, `joseAdapt.ts`, `joseTelegram.ts`, `joseSpend.ts` (paid models)
- `orchestrationQueueService.ts` — durable queue with full state transitions and dead-letter replay
- `orchestrationReceiptService.ts` — receipt events across all pipeline phases
- `orchestrationGovernanceService.ts` — governance layer over orchestration
- `joseCommandRouterService.ts` — routes a plan's steps into packets (only Jose's own code calls it)
- `joseExecutionEngineService.ts` — Jose execution engine (runs, resumes and carries on requests)
- `packetExecutionService.ts` — packet-level execution

### Content Factory
- `contentFactory/` — projects and brands, the project plan, each step's prompts and executors (text, media, publishing), pictures, captions, posts, the one publishing path (`publishPost.ts`), post moves, sign-in expiry, daily limits, results, lessons, ideas, characters and motion
- `marcusExecutionService.ts` — the one scheduler for posts

### Policy & Approval (fail-closed)
- `policyEnforcementService.ts` — centralized policy gate: zero-cost mode, approval mode, connector risk classification, auth/allowlist checks, license tier validation
- `licenseService.ts` — license tier system (Free/Pro/Enterprise) with premium connector gates. Inert at launch (2026-09-30) until a vendor signing key is configured (`isPremiumGatingEnabled()`)
- `connectorRegistryService.ts` — all **33 connector** send paths run through policy gate before any external call

### Performance & Execution
- `parallelExecutionService.ts` — parallel task execution with concurrency control, retry logic, and task queues
- `cacheService.ts` — memory caching with TTL, LRU eviction, and global/connector/agent caches

### Agent Contracts
- `agentContractService.ts` — per-agent allowed/blocked action prefixes, checked before every packet execution
- `agentBusService.ts` — inter-agent messaging bus

### Memory & Knowledge
- `memoryService.ts`, `durableMemoryService.ts` — general + SQLite-backed durable memory
- `miyaMemoryService.ts`, `workflowMemoryService.ts`, `workflowReceiptService.ts`, `workflowTelemetryService.ts`
- `sessionIntelligenceService.ts`, `workspaceIntelligenceService.ts`
- `sourceConfidenceService.ts`, `trustModel.ts`, `verificationService.ts`

### Connectors & External
- `connectorRegistryService.ts` — all outbound connector paths (policy-gated)
- `connectors/connectorOutbound.js` — frontend dispatch (policy-gated, calls Rust commands via invoke)
- `connector_commands.rs` — `connector_github_action`: GitHub REST API v3 — create_issue, dispatch_workflow, create_pr, get_repo, list_issues
- `connector_commands.rs` — `connector_slack_send`: Slack Web API chat.postMessage with optional thread_ts
- `connectors/connectorAuth.ts` — connector authentication management
- `connectors/connectorOutbound.js` — outbound connector dispatch
- `connectors/connectorPolling.js` — inbound connector polling
- `connectors/connectorImageGenerators.js` — image generation connectors (SD WebUI, ComfyUI)
- `whatsappWebhookService.ts` — WhatsApp webhook handling
- `marcusPublishService.ts` — Marcus-governed distribution
- `metaPublishService.ts` — Meta/Instagram publishing
- `hectorResearchService.js` — Hector live research
- `toolConnectionService.ts`, `toolNotificationDispatcher.ts`

### Workflow Operations (16 structured workflows)
- `workflowOperationsRegistryService.ts` — Marketing Ops, Social Media, Content Production, Learning, Startup/Product Dev, Opportunity Discovery, Construction Ops, Knowledge Preservation, Content Repurposing, Automation Governance, Research Operations, Crisis Management, Ecosystem Learning, Human Collaboration, Financial Intelligence, Reputation and Brand Monitoring
- `workflowExecutionService.js`, `workflowBuilderService.ts`, `workflowGovernanceService.ts`

### Self-Development & Release
- `selfDevelopmentService.ts`, `nativeSelfDevelopmentAutostartService.ts`
- `productionReadinessService.js`, `rc0EvidenceService.ts`, `nativeRc0ProofService.ts`
- `runwayService.ts`, `appUpdateService.ts`, `repoAuditService.ts`

### Utility & Other
- `pluginSandboxService.ts`, `pluginRegistryService.ts`
- `recoveryService.ts`, `runtimeLedgerService.ts`
- `screenIntelligenceService.ts`, `voiceService.ts`
- `chatPersistenceService.ts`, `notificationService.ts`
- `coachModeService.ts`, `skillPackService.ts`
- `localMarketplaceService.ts`, `resourceCostService.ts`
- `agentAvatarService.ts`, `agentVisualService.ts`

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
- **licenseService.ts** — license tier validation (Free/Pro/Enterprise) for premium connectors. Dormant while `LICENSE_TRUST_KEY` is `null` (launching free), and an approval never bypasses it once enabled
- **Command policy (`policy_gate.rs`)** — every program allowed through `execute_command_verified` has an explicit, fail-closed argument rule (no inline interpreter code, no arbitrary `npx` packages, no git exec/write flags). It is the real boundary for AI-planned commands
- **Mobile companion server** — PIN-authenticated WebSocket on port 8765. Opt-in since 2026-09-30: it only listens after the user enables mobile pairing
- **Zero-cost mode** — blocks paid connectors (Claude API, OpenAI, YouTube, etc.) by default unless explicitly overridden
- **Approval gates** — risky actions (external sends, uploads, publishes) require explicit user confirmation in the `ApprovalModal` UI before execution proceeds
- **Connector allowlists** — `TELEGRAM_ALLOWED_CHAT_IDS` (`telegramCompanionService.js`) and `WHATSAPP_ALLOWED_NUMBERS` (`whatsappCompanionService.ts`, added 2026-07-10) gate first-time owner pairing before any command executes. Enforced in the JS companion service layer, not the Rust command layer — corrected 2026-07-10, this line previously overstated where the check lives
- **Secrets** — connector keys, the license token and other secrets saved in Settings are kept in the OS keychain (`os_keychain_store.rs`), never in localStorage, backups or exports; environment variables still work as a fallback. `.gitignore` excludes `.env`, `.env.*`, `.tauri-updater-key`, `.tauri-updater-key.pub`
- **Network** — research and media downloads go through `fetch_with_ssrf_guard` (private addresses refused, every redirect checked); stock-clip downloads only from the stock hosts; the sign-in callbacks listen on `127.0.0.1` only, for 5 minutes
- **Plugin sandbox** — `pluginSandboxService.ts` enforces token-based plugin isolation

---

## Deployment

| Target | Method |
|---|---|
| Installers | `release.yml` on a tag: Windows NSIS + MSI (with the bundled Ollama runtime and FFmpeg), macOS DMG, Linux AppImage; `npm run release:updater` locally |
| Auto-updater | Tauri updater with signed manifest; keys generated via `npm run updater:keygen` |
| Gateway (WhatsApp Cloud inbound) | Railway static serve; service root `gateway/whatsapp-cloud/`; healthcheck at `/health` |
| Cloud Voice (iOS companion) | AWS ECS behind `voice.obsidianmedia.online`, deployed by `deploy-cloud-voice.yml`; Farsi Piper on Railway; Railway kept as the rollback. The address did not resolve on 2026-10-20 (see `docs/deployment/AWS_VOICE_MIGRATION.md`) |
| Dev server | `npm run dev` (Vite, port 5173) or `npm run tauri dev` (full Tauri with Rust) |

---

## Known Technical Debt

- `src-tauri/src/lib.rs` is **~967 lines**; there are **197 `#[tauri::command]` functions** across **56 modules in src-tauri/src/**. Module list: `audit_log.rs`, `comfyui_installs.rs`, `comfyui_proxy.rs`, `comfyui_video_models.rs`, `commands/` (`bridge`, `clipboard`, `filesystem`, `jose`, `notification`, `ocr`, `restore`, `runtime`, `system`, `updates`, `url`), `companion_auth.rs`, `companion_discovery.rs`, `companion_router.rs`, `companion_server.rs`, `companion_types.rs`, `connector_commands.rs`, `elevenlabs.rs`, `higgsfield.rs`, `kv_store.rs`, `main.rs`, `media_storage.rs`, `media_tools.rs`, `memory_graph.rs`, `memory_graph_prune.rs`, `memory_store.rs`, `meta_media.rs`, `meta_publish.rs`, `meta_video.rs`, `native_proof.rs`, `oauth_signin.rs`, `ollama.rs`, `os_keychain_store.rs`, `plugin_runtime.rs`, `policy_gate.rs`, `post_metrics.rs`, `runtime_manager.rs`, `runway.rs`, `research_store.rs`, `resources.rs`, `search.rs`, `skills_store.rs`, `telegram.rs`, `utils.rs`, `voice_sidecar.rs`, `whatsapp_webhook.rs`, `workspace.rs`, `youtube.rs`, and `lib.rs` itself. `memory_graph.rs` (added 2026-09-04) implements the memory knowledge graph — `memory_nodes`/`memory_edges` SQLite tables, one-hop and cycle-safe multi-hop traversal via `WITH RECURSIVE`, and automated structural edge inference (`memory_graph_infer_edges`).
- Frontend uses `.tsx` for new UI work, with legacy production `.jsx` contexts and Content Catalyst files still present. The service layer remains mixed JavaScript/TypeScript; current exact counts are verified by `npm run verify:docs`.
- Much of the app's state (Jose's requests, content projects and brands, schedules) is still in `localStorage`, with schema migrations; durable records and secrets are in SQLite and the keychain
- WhatsApp Cloud API fully wired (v2.0.2): inbound via `browserPollWhatsAppGateway` (Railway `/queue/drain`), outbound via `browserSendWhatsApp`. No external relay URL needed.
- Playwright E2E wired into CI (8 spec files under `e2e/`) — runs the web build with the Tauri bridge mocked, so it never exercises the Rust backend
- Desktop E2E suite (`e2e-desktop/`, `npm run test:e2e:desktop`) — WebdriverIO + tauri-driver against the real built binary on isolated test data; 34 spec files; runs in CI as `Desktop E2E (real Tauri binary)` on Windows (not a required check)
- Coverage floors 48% lines / 38% branches / 30% functions / 48% statements (`npm run test:coverage`); 544 test files, 6,719 tests, all passing (verified 2026-10-25 — this line is not covered by `scripts/verify-doc-counts.mjs`'s ARCHITECTURE.md checks, so it can drift silently; cross-check against AGENTS.md's Project Identity line before trusting it)
- GitHub connector tests: 20 tests in `githubConnector.test.js`; Slack connector tests: 16 tests in `slackConnector.test.js`
- `src-tauri/rustfmt.toml` added — `cargo fmt --check` now passes in CI; `cargo clippy -- -D warnings` clean (verified 2026-07-08)
- **Last reconciled with the code:** 2026-10-25 (first full audit 2026-07-08 — see `docs/AUDIT_REPORT_2026-07-08.md`).

