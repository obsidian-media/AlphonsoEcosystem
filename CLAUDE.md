# Alphonso — Claude Code Guide

## ALWAYS READ FIRST

`docs/ALPHONSO_GROUND_TRUTH.md` — verified facts about what exists in this repo. Do not trust any audit report or summary document that contradicts it. Past audits contained significant errors (see "Known Audit Errors" section in that file).

---

## Build Commands

```bash
npm run dev              # Vite dev server only (port 5173)
npm run tauri dev        # Full Tauri dev with Rust backend (kill port 5173 first if busy)
npm run test             # Run all 1737+ tests across 120 files — all should pass
npm run test:watch       # Watch mode
npm run build            # Web build only (no Tauri/Rust)
npm run verify:app       # lint + test + build in one command
npm run lint             # ESLint on src/

# Rust (run from src-tauri/ directory)
cargo check              # Verify Rust compiles
cargo test               # Run Rust unit tests
cargo fmt --all -- --check   # Format check (rustfmt.toml sets tab_spaces=2)
cargo clippy -- -D warnings  # Lint Rust — must be zero warnings (CI enforces this)

# Updater / release
npm run release:updater  # One-command release pipeline (NSIS + MSI + signed manifest)
npm run updater:keygen   # Generate Tauri updater signing keys
npm run updater:verify   # Verify updater readiness

# Auth helpers
npm run auth:youtube     # OAuth flow for YouTube
npm run auth:meta        # OAuth flow for Meta/Instagram

# Coverage (actual measured: ~38%+, threshold: 35%, scoped to src/)
npm run test:coverage    # Run tests with coverage report

# E2E — Playwright installed (no extra install needed)
# Requires: npm run dev running on :5173 + Ollama running with a model
npm run test:e2e         # Run Playwright golden-path smoke test
```

---

## Key Architecture Facts

- **9 agents**: Alphonso, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, Nova — all in `src/agents/`, all enforced by `agentContractService.ts`
- **policyEnforcementService.ts is fail-closed**: every outbound connector call goes through this gate; if credentials are missing or the action is ambiguous it is blocked, not allowed
- **licenseService.ts**: license tier validation (Free/Pro/Enterprise) gates premium connectors (GitHub, Slack, Claude, ChatGPT, YouTube, Notion, ClickUp, SD WebUI, ComfyUI)
- **parallelExecutionService.ts**: parallel task execution with concurrency control, retry logic, and task queues
- **cacheService.ts**: memory caching with TTL, LRU eviction, and global/connector/agent caches
- **14 connectors**: Telegram, WhatsApp Cloud, YouTube, GitHub, Slack, Claude, ChatGPT, Notion, ClickUp, SD WebUI, ComfyUI, Brave Search, Ollama, Qwen/DashScope — all policy-gated. All have credential input UI in ConnectorSetupPanel.
- **lib.rs is ~2,024 lines** — 18 modules in src-tauri/src/ (audit_log, connector_commands, kv_store, main, memory_store, meta_publish, native_proof, ollama, plugin_runtime, policy_gate, runway, search, telegram, utils, whatsapp_webhook, workspace, youtube)
- **All 1737+ tests are in `src/test/`** — 120 test files; Vitest via vitest.config.js (separate from vite build config)
- **Two CI workflows**: `ci.yml` (lint + test + build + Tauri artifact + cargo test/clippy + npm audit + cargo audit) and `release.yml` (tag-triggered build + sign + publish).
- **`.npmrc`** has `legacy-peer-deps=true` — required because `@eslint/js@10` and `eslint@9` have a peer dep mismatch. Do not remove.
- **Multi-turn Ollama**: `generateOllamaChatStream` in `src/lib/ollama.js` uses `/api/chat` — full conversation history is passed per message. `ChatView.tsx` captures history snapshot before React state updates.
- **appendAgentActivity**: wired in `joseExecutionEngineService.js` (`executeAssignment`) and `connectorRegistryService.js` (`appendConnectorAudit`). Activity tab now shows live data.

---

## Do Not Duplicate — These Already Exist

Before writing any new service, component, or feature, check this list:

| Thing you might think is missing | Where it actually lives |
|---|---|
| Connector health UI (full panel) | `src/components/ConnectorHealthPanel.jsx` (lazy chunk) |
| Connector status dot/strip for sidebars | `src/components/ConnectorStatusIndicators.jsx` — import from HERE not ConnectorHealthPanel |
| Approval modal with risk levels | `src/components/ApprovalModal.jsx` |
| Toast notifications | `ToastProvider` in `main.jsx`, inbound toasts in `App.jsx` |
| Policy / approval enforcement | `src/services/policyEnforcementService.ts` |
| License tier validation | `src/services/licenseService.ts` |
| Parallel execution + retry | `src/services/parallelExecutionService.ts` |
| Memory caching (TTL + LRU) | `src/services/cacheService.ts` |
| Orchestration queue + dead-letter | `src/services/orchestrationQueueService.ts` |
| Receipt / audit events | `src/services/orchestrationReceiptService.js` |
| Zero-cost mode logic | `policyEnforcementService.js` + Jose routing |
| Agent contract boundaries | `src/services/agentContractService.ts` |
| 10 workflow operations | `src/services/workflowOperationsRegistryService.js` |
| AI runtime manager (7 tools) | `src-tauri/src/runtime_manager.rs` + `src/services/runtimeManagerService.js` + `src/components/RuntimeManagerView.jsx` |
| Prereq detection (Python/Git/Ollama) | `runtime_manager::find_python()` / `find_git()` / `find_ollama()` + `runtime_check_prerequisites` Tauri command |
| Prereq auto-install (winget/brew) | `runtime_install_prerequisite` Tauri command — do not add a separate install flow |
| Boot status banner | `src/components/BootStatusBanner.jsx` — listens to `runtime://boot_status` events |
| Ollama offline global banner | `src/components/OllamaOfflineBanner.jsx` — shown in App.tsx shell; Start/Retry/Open Runtime Hub; uses `startTool('ollama')` |
| Onboarding wizard | `src/components/OnboardingWizard.jsx` — 4 steps: Ollama check (auto-start via Runtime Hub), model picker, connect (Telegram/WhatsApp/Composio guides inline), ready |
| External URL opening (Tauri) | Use `invoke('open_url', { url })` — NOT bare `<a href target="_blank">` which fails silently in Tauri webview |
| Autostart prefs (per-tool) | `runtime_get_autostart_prefs` / `runtime_save_autostart_pref` + JSON at `%APPDATA%\Alphonso\runtimes\autostart_prefs.json` |
| Live install log streaming | `runtime://log` Tauri events + `onLogLine()` in runtimeManagerService + `LiveLogPanel` in RuntimeManagerView |
| Updater release script | `npm run release:updater` |
| Auth scripts (YouTube, Meta) | `npm run auth:youtube`, `npm run auth:meta` |
| Desktop preflight / verify | `npm run verify:desktop:preflight`, `npm run verify:desktop` |
| CI workflows | `.github/workflows/ci.yml`, `.github/workflows/release.yml` |
| WhatsApp webhook Rust commands | `src-tauri/src/whatsapp_webhook.rs` |
| KV store Rust commands | `src-tauri/src/kv_store.rs` — `kv_set`, `kv_get`, `save_settings`, `load_settings` |
| Playwright config + E2E test | `playwright.config.js` + `e2e/smoke.spec.js` (Chromium installed) |
| Multi-turn Ollama chat | `generateOllamaChatStream` in `src/lib/ollama.js` (uses `/api/chat`) |
| JSON response parser | `src/lib/jsonUtils.js` — `parseJsonResponse` (strips ``` fences, parses JSON). Do not re-add to joseExecutionEngineService. |
| Agent activity log wiring | `appendAgentActivity` imported in `joseExecutionEngineService` + `connectorRegistryService` |
| GitHub connector | `src/services/connectors/githubConnector.ts` — issues, PRs, releases, code search, workflows |
| Slack connector | `src/services/connectors/slackConnector.ts` — messages, channels, files, reactions, webhooks |
| WhatsApp browser send | `src/services/whatsappBrowserConnector.js` — `browserSendWhatsApp` (outbound via Meta Graph API) |
| WhatsApp browser poll | `src/services/whatsappBrowserConnector.js` — `browserPollWhatsAppGateway` (inbound via Railway queue drain) |
| Maria governance audit runtime | `src/services/mariaAuditService.js` — Ollama-powered risk assessment with fallback |
| Echo memory preservation runtime | `src/services/echoMemoryService.js` — Ollama synthesis, retention classification, confidence normalization |
| Marcus distribution execution runtime | `src/services/marcusExecutionService.js` — governance-gated GitHub/Slack/publish dispatch |
| Connector credential UI (all 9 API connectors) | `src/components/ConnectorSetupPanel.jsx` `CredentialSection` — saves via `saveConnectorCredential()` |
| Telegram companion bot commands | `src/services/telegramCompanionService.js` — `/help`, `/report`, `/files`, `/status`, `/memory` |
| Voice STT pipeline | `src/services/voiceService.js` + `src/hooks/useVoiceInput.js` — SpeechRecognition with fallback |
| Voice OS sidecar launcher | `src-tauri/src/voice_sidecar.rs` — `voice_start`/`voice_stop`/`voice_status` Tauri commands |
| Voice OS React service | `src/services/voiceOsService.js` — `startVoiceServer`, `stopVoiceServer`, `getVoiceServerStatus` |
| Jarvis voice hook | `src/hooks/useJarvisVoice.ts` — AudioWorklet WebSocket voice hook (start/stop/reset/state/transcript/reply/activeAgent/error/isConnected) |
| Voice OS backend | `voice/backend/` — FastAPI STT→LLM→TTS pipeline (faster-whisper, piper, webrtcvad, Ollama /api/chat) |
| Workflow visual builder UI | `src/components/WorkflowBuilderView.jsx` — two-panel editor, 9 node types, reorder, save |
| Nova insight card | `src/components/ChatView.tsx` — `novaInsight` state, score ring, fires after Jose pipeline |
| Sentinel quick-scan in sidebar | `src/components/RightPanel.tsx` — `sentinelScan` state, `runQuickScan()`, Security section |
| Echo memory timeline | `src/components/SettingsView.tsx` — `EchoTimeline` component, retention tier grouping |
| Composio toolkit toggles | `src/components/SettingsView.tsx` — `enabledToolkits` Set, `toggleComposioToolkit()` |
| Hector RSS failover | `src/services/hectorResearchService.js` — `RSS_FEED_CATALOG`, `fetchRssSources`, `parseRssItems` |
| Notification center | `src/components/NotificationCenter.jsx` — fixed top-right panel, colored borders per type, relative timestamps, "Clear all" |
| Agent status strip | `src/components/AgentStatusStrip.jsx` — horizontal badge strip with pulsing dot per running agent |
| Updater notification banner | `src/components/UpdaterNotification.jsx` — amber fixed banner, "Update & Restart" / "Later" buttons, wired in App.jsx |
| Ollama model picker (ChatView) | `src/components/ModelSwitcher.jsx` — exports `OllamaModelPicker` (used by ChatView) + `ModelSwitcher` 3-pill switcher |
| WhatsApp inbox panel | `src/components/WhatsAppInboxPanel.jsx` — received message list, inline reply input |
| Crash log service | `src/services/crashLogService.js` — `logError` / `getCrashLog` / `clearCrashLog`, 100-entry localStorage ring |
| Agent approval audit log | `src/services/agentAuditService.js` — `logApprovalEvent` / `getAuditLog`, 100-entry ring, `alphonso_approval_audit_v1` |
| Workspace export/import service | `src/services/workspaceExportService.js` — `exportWorkspace` / `importWorkspace` over all `alphonso_*` localStorage keys |
| Workspace export/import UI | `src/components/WorkspaceExportImportView.jsx` — Export (JSON download) + Import (file picker), wired in SettingsView |
| Agent performance view | `src/components/AgentPerformanceView.jsx` — per-agent success/error/avg-latency from `orchestrationReceipts` |
| ChatView drag-and-drop | `src/components/ChatView.tsx` — `attachedFiles` state, drag-zone, pill badges, filenames appended to command |
| Hector briefing card | `src/components/ChatView.tsx` — sky-tinted `hectorBriefing` card after pipeline, shows top 3 sources |
| Sentinel scheduled scans | `src/services/sentinelSecurityService.js` — `startScheduledScans(intervalMs, onResult)` interval export |
| Nova opportunity history | `src/services/novaAnalysisService.js` — `saveOpportunityScore` / `getOpportunityHistory`, 30-entry localStorage |
| RightPanel audit tab | `src/components/RightPanel.tsx` — System/Audit tab switcher, last 10 approval events with outcome badges |
| RightPanel auto-refresh | `src/components/RightPanel.tsx` — 10-min `setInterval` calling `runQuickScan()` |
| Onboarding connector step | `src/components/OnboardingWizard.jsx` — step 3 "Connect a channel" with Telegram/WhatsApp/Skip cards, saves to `alphonso_onboarding_connector_v1` |
| Crash log viewer | `src/components/CrashLogView.jsx` — entry list with timestamp/message/context, "Clear" button; wired as Logs tab in SettingsView |
| Nova history chart | `src/components/NovaHistoryChart.jsx` — SVG sparkline of last 10 scores, most-recent recommendation, wired in SettingsView |
| Sentinel findings modal | `src/components/SentinelFindingModal.jsx` — fixed overlay, severity badge, pattern + recommendation rows; triggered by clicking findings in RightPanel |
| Gateway Dockerfile | `gateway/whatsapp-cloud/Dockerfile` — multi-stage Node 20 Alpine build; `.dockerignore` alongside |
| durableStore (SQLite dual-write) | `src/lib/durableStore.js` — `durableGet/Set/Remove` writes to localStorage + fire-and-forgets to Tauri `kv_set`; used by crashLogService, agentAuditService, novaAnalysisService |
| TypeScript components (.tsx) | `AgentStatusStrip.tsx`, `UpdaterNotification.tsx`, `NotificationCenter.tsx`, `AgentPerformanceView.tsx`, `TopBar.tsx` — migrated with full prop interfaces; old .jsx files removed |

---

## Before Making Changes

1. Read `docs/ALPHONSO_GROUND_TRUTH.md`
2. Check `src/services/` for an existing service before writing a new one — there are 130+ services
3. Check `src/test/` — there are 111 test files already; add to them, don't create a parallel test system
4. Run `npm run test` before and after any change; all 1737+ tests must continue to pass
5. For Rust changes, run `cargo check` AND `cargo clippy -- -D warnings` from `src-tauri/` — CI enforces `-D warnings`
6. Do not commit `.env`, `.tauri-updater-key`, or `.tauri-updater-key.pub` — they are in `.gitignore`

---

## Real Gaps (as of 2026-06-21 — v2.0.5 + Sprint Next-10 complete)

These are confirmed gaps. Check `docs/ALPHONSO_GROUND_TRUTH.md` for the current state before working on any of them:

- ~~WhatsApp Cloud inbound webhook~~ — **CLOSED** (Railway gateway + `browserPollWhatsAppGateway`)
- ~~Auto-updater~~ — **CLOSED** (keypair in GitHub Secrets, v2.0.2 released)
- ~~Maria runtime~~ — **CLOSED Phase 3** (`src/services/mariaAuditService.js`)
- ~~Echo runtime~~ — **CLOSED Phase 3** (`src/services/echoMemoryService.js`)
- ~~Marcus runtime~~ — **CLOSED Phase 3** (`src/services/marcusExecutionService.js`)
- ~~Connector credential UI gap~~ — **CLOSED Phase 3** (all 9 connectors in ConnectorSetupPanel)
- ~~claudeService/chatgptService credential inconsistency~~ — **CLOSED Phase 3**
- ~~Sentinel runtime~~ — **CLOSED Phase 1** (`src/services/sentinelSecurityService.js`)
- ~~Nova runtime~~ — **CLOSED Phase 1** (`src/services/novaAnalysisService.js`)
- ~~Telegram companion commands~~ — **CLOSED Direction 1** (`/help`, `/report`, `/files` in telegramCompanionService)
- ~~Voice STT~~ — **CLOSED Direction 1** (SpeechRecognition wired into useVoiceInput + voiceService)
- ~~Nova insight card~~ — **CLOSED Direction 4** (ChatView shows card when score > 65 after Jose pipeline)
- ~~Maria risk ring~~ — **CLOSED Direction 4** (ScoreRing SVG + mariaScore prop in ApprovalModal)
- ~~Sentinel dashboard~~ — **CLOSED Direction 4** (RightPanel Security section with re-scan)
- ~~Echo memory timeline~~ — **CLOSED Direction 4** (EchoTimeline in SettingsView by retention tier)
- ~~Composio toolkit toggles~~ — **CLOSED Direction 4** (toggleable cards in SettingsView)
- ~~Hector RSS failover~~ — **CLOSED Direction 4** (12 curated feeds, parseRssItems, fetchRssSources)
- ~~WorkflowBuilderView~~ — **CLOSED Direction 4** (new component + AutomationView Builder tab)
- ~~Component test coverage at ~6%~~ — **CLOSED Direction 3** (101 test files / 1439+ tests; ~12% component coverage)
- ~~Notification center~~ — **CLOSED Direction 1 (All 5 Sprint)** (`src/components/NotificationCenter.jsx`)
- ~~Agent status strip~~ — **CLOSED Direction 1 (All 5 Sprint)** (`src/components/AgentStatusStrip.jsx`)
- ~~Updater notification banner~~ — **CLOSED Direction 1 (All 5 Sprint)** (`src/components/UpdaterNotification.jsx`)
- ~~WhatsApp inbox panel~~ — **CLOSED Direction 1 (All 5 Sprint)** (`src/components/WhatsAppInboxPanel.jsx`)
- ~~Crash log service~~ — **CLOSED Direction 2 (All 5 Sprint)** (`src/services/crashLogService.js`)
- ~~cacheService hard entry cap~~ — **CLOSED Direction 2 (All 5 Sprint)** (`maxEntries=500` in `cacheService.ts`)
- ~~Dead-letter queue retry~~ — **CLOSED Direction 2 (All 5 Sprint)** (`retryDeadLetter()` in orchestrationQueueService)
- ~~ChatView file drag-and-drop~~ — **CLOSED Direction 4 (All 5 Sprint)** (`attachedFiles` state + file pills in ChatView)
- ~~Hector briefing card~~ — **CLOSED Direction 4 (All 5 Sprint)** (`hectorBriefing` state + sky card in ChatView)
- ~~Sentinel scheduled background scans~~ — **CLOSED Direction 4 (All 5 Sprint)** (`startScheduledScans` in sentinelSecurityService)
- ~~Nova opportunity persistence~~ — **CLOSED Direction 4 (All 5 Sprint)** (`saveOpportunityScore`/`getOpportunityHistory` in novaAnalysisService)
- ~~Agent performance dashboard~~ — **CLOSED Direction 4 (All 5 Sprint)** (`src/components/AgentPerformanceView.jsx`)
- ~~Agent approval audit trail~~ — **CLOSED Direction 5 (All 5 Sprint)** (`src/services/agentAuditService.js` + RightPanel Audit tab)
- ~~Workspace export/import~~ — **CLOSED Direction 5 (All 5 Sprint)** (`workspaceExportService.js` + `WorkspaceExportImportView.jsx`)
- ~~RightPanel auto-refresh + audit tab~~ — **CLOSED Direction 5 (All 5 Sprint)** (10-min interval + System/Audit tab switcher)
- ~~Onboarding connector step~~ — **CLOSED Sprint Next-10 T1** (4th step "Connect a channel" added to OnboardingWizard with Telegram/WhatsApp/Skip cards)
- ~~CrashLogView UI~~ — **CLOSED Sprint Next-10 T5** (`CrashLogView.jsx` + Logs tab in SettingsView)
- ~~Nova opportunity history chart~~ — **CLOSED Sprint Next-10 T6** (`NovaHistoryChart.jsx` SVG sparkline + wired in SettingsView)
- ~~Gateway Dockerfile~~ — **CLOSED Sprint Next-10 T7** (`gateway/whatsapp-cloud/Dockerfile` + `.dockerignore`)
- ~~TypeScript migration (components)~~ — **CLOSED Sprint Next-10 T8** (5 components migrated: AgentStatusStrip, UpdaterNotification, NotificationCenter, AgentPerformanceView, TopBar → `.tsx`)
- ~~Sentinel findings drill-down~~ — **CLOSED Sprint Next-10 T9** (`SentinelFindingModal.jsx` + clickable findings in RightPanel)
- ~~SQLite dual-write for remaining keys~~ — **CLOSED Sprint Next-10 T10** (`src/lib/durableStore.js` + migrated crashLogService, agentAuditService, novaAnalysisService)
- ~~Test coverage at ~30%~~ — **CLOSED Sprint Next-10 T3** (111 test files / 1621+ tests; 10 new service test files)
- Branch protection on `main` — manual GitHub step (MCP doesn't expose branch protection API); require CI pass before merge
- Coverage at ~38%+ — next staged target 40%
- ~~Runtime Manager 9 gaps~~ — **CLOSED 2026-06-23**
- ~~Onboarding flow~~ — **CLOSED 2026-06-23** (Ollama auto-start, not-installed detection, Telegram/WhatsApp/Composio inline guides, `OllamaOfflineBanner` in main shell)
- ~~Ollama offline state~~ — **CLOSED 2026-06-23** (`OllamaOfflineBanner.jsx` — global, persistent, Start/Retry/Runtime Hub)
- ~~Composio onboarding~~ — **CLOSED 2026-06-23** (inline API key entry in OnboardingWizard Step 3, saves via `setComposioConfig`) (prereq detection, async streaming, venv isolation, AudioCraft fix, InvokeAI venv exe, boot status banner, autostart prefs JSON)
- TypeScript migration — 10 components migrated (all major ones done). Remaining: bulk of 63 .jsx component files

---

## Project Structure

```
src/                   React frontend (all .jsx, 9 .ts services)
  agents/              9 agent profiles, permissions, schemas + agentRegistry.js
  components/          UI components
    ConnectorHealthPanel.jsx        — full connector panel (lazy chunk)
    ConnectorStatusIndicators.jsx   — small dot/strip components (static-safe import)
    AgentActivityLog.jsx            — activity timeline tab (appendAgentActivity wired)
  services/            ~131 services
    connectors/        GitHub, Slack, and other connector implementations
  hooks/               14 custom hooks (useAppShellState, useAppEffects split into 6)
  lib/
    ollama.js          Ollama client — generateOllamaChatStream uses /api/chat (multi-turn)
  test/                111 test files (Vitest, vitest.config.js)
e2e/                   Playwright E2E tests (Chromium installed)
src-tauri/
  src/
    lib.rs             Rust backend (~2,024 lines)
    utils.rs           Shared utilities
    kv_store.rs        KV store module — kv_set, kv_get, save_settings, load_settings
    whatsapp_webhook.rs  WhatsApp webhook module (3 commands, 4 structs)
    native_proof.rs    Native proof module
    runway.rs          Runway video module
    telegram.rs        Telegram Bot API module
    youtube.rs         YouTube upload module
    workspace.rs       Workspace file ops module
    search.rs          Research search module
    connector_commands.rs  Connector Rust backend (14 commands)
    plugin_runtime.rs  Plugin runtime engine
    policy_gate.rs     Policy enforcement backend
    audit_log.rs       Audit chain
    ollama.rs          Ollama backend
    memory_store.rs    Memory persistence
    meta_publish.rs    Meta publishing
  Cargo.toml
docs/                  Documentation and handoff packages
  ALPHONSO_GROUND_TRUTH.md   <- single source of truth
  USER_MANUAL.md       Full user manual (v2.0.2)
  GETTING_STARTED.md   Quick setup guide
  AGENT_GUIDE.md       Agent capabilities and permissions
  TROUBLESHOOTING.md   Common issues and fixes
  CHANGELOG.md
.github/
  workflows/
    ci.yml             Main CI: lint + test + build + cargo clippy/test + Tauri artifact + security audits
    release.yml        Release CI: tag-triggered build + sign + publish
.npmrc                 legacy-peer-deps=true (required for npm ci to work)
playwright.config.js   Playwright config (baseURL :5173, headless Chromium)
vitest.config.js       Vitest config (separate from vite build config)
gateway/
  whatsapp-cloud/      Railway-hosted WhatsApp Cloud gateway (live, deployed)
scripts/               Build, release, and auth helper scripts
```

---

_Last verified: 2026-06-24 — v2.2.3 — Voice OS pipeline (feat/voice-os merged): FastAPI STT+LLM+TTS+VAD+barge-in backend in voice/, Tauri voice_sidecar.rs commands, voiceOsService.js, useJarvisVoice.ts (AudioWorklet), RuntimeManagerView voice-os entry, 5 pytest test files. UI/UX overhaul (feat/ui-ux-overhaul merged): OKLCH token system, framer-motion AnimatePresence on chat messages, motion.ts, OnboardingWizard token sweep, collapsed sidebar tooltips, RightPanel badge fix. v2.2.3 Chat UX fixes: Jose pipeline results + ApprovalPanel + Nova insight + execution receipts consolidated inline in chat thread (isLastAssistantMessage guards), auto-scroll fixed (settings.autoScroll !== false), connector verification fixed to check localStorage credential store in addition to OS env vars, connector auto-verify on save. 144 test files, 1930+ tests passing. Coverage threshold 38%. Run `npm run verify:app` and `cargo clippy -- -D warnings` from src-tauri/ to re-verify._
