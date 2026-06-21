# Alphonso — Claude Code Guide

## ALWAYS READ FIRST

`docs/ALPHONSO_GROUND_TRUTH.md` — verified facts about what exists in this repo. Do not trust any audit report or summary document that contradicts it. Past audits contained significant errors (see "Known Audit Errors" section in that file).

---

## Build Commands

```bash
npm run dev              # Vite dev server only (port 5173)
npm run tauri dev        # Full Tauri dev with Rust backend (kill port 5173 first if busy)
npm run test             # Run all 1439+ tests across 101 files — all should pass
npm run test:watch       # Watch mode
npm run build            # Web build only (no Tauri/Rust)
npm run verify:app       # lint + test + build in one command
npm run lint             # ESLint on src/

# Rust (run from src-tauri/ directory)
cargo check              # Verify Rust compiles
cargo test               # Run 60 Rust unit tests
cargo clippy -- -D warnings  # Lint Rust — must be zero warnings (CI enforces this)

# Updater / release
npm run release:updater  # One-command release pipeline (NSIS + MSI + signed manifest)
npm run updater:keygen   # Generate Tauri updater signing keys
npm run updater:verify   # Verify updater readiness

# Auth helpers
npm run auth:youtube     # OAuth flow for YouTube
npm run auth:meta        # OAuth flow for Meta/Instagram

# Coverage (actual measured: 27.97%, threshold: 20%, scoped to src/)
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
- **lib.rs is ~1,585 lines** — 18 modules in src-tauri/src/ (audit_log, connector_commands, kv_store, main, memory_store, meta_publish, native_proof, ollama, plugin_runtime, policy_gate, runway, search, telegram, utils, whatsapp_webhook, workspace, youtube)
- **All 1439+ tests are in `src/test/`** — 101 test files; Vitest via vitest.config.js (separate from vite build config)
- **Two CI workflows**: `ci.yml` (lint + test + build + Tauri artifact + cargo test/clippy + npm audit + cargo audit) and `release.yml` (tag-triggered build + sign + publish).
- **`.npmrc`** has `legacy-peer-deps=true` — required because `@eslint/js@10` and `eslint@9` have a peer dep mismatch. Do not remove.
- **Multi-turn Ollama**: `generateOllamaChatStream` in `src/lib/ollama.js` uses `/api/chat` — full conversation history is passed per message. `ChatView.jsx` captures history snapshot before React state updates.
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
| Updater release script | `npm run release:updater` |
| Auth scripts (YouTube, Meta) | `npm run auth:youtube`, `npm run auth:meta` |
| Desktop preflight / verify | `npm run verify:desktop:preflight`, `npm run verify:desktop` |
| CI workflows | `.github/workflows/ci.yml`, `.github/workflows/release.yml` |
| WhatsApp webhook Rust commands | `src-tauri/src/whatsapp_webhook.rs` |
| KV store Rust commands | `src-tauri/src/kv_store.rs` — `kv_set`, `kv_get`, `save_settings`, `load_settings` |
| Playwright config + E2E test | `playwright.config.js` + `e2e/smoke.spec.js` (Chromium installed) |
| Multi-turn Ollama chat | `generateOllamaChatStream` in `src/lib/ollama.js` (uses `/api/chat`) |
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
| Workflow visual builder UI | `src/components/WorkflowBuilderView.jsx` — two-panel editor, 9 node types, reorder, save |
| Nova insight card | `src/components/ChatView.jsx` — `novaInsight` state, score ring, fires after Jose pipeline |
| Sentinel quick-scan in sidebar | `src/components/RightPanel.jsx` — `sentinelScan` state, `runQuickScan()`, Security section |
| Echo memory timeline | `src/components/SettingsView.jsx` — `EchoTimeline` component, retention tier grouping |
| Composio toolkit toggles | `src/components/SettingsView.jsx` — `enabledToolkits` Set, `toggleComposioToolkit()` |
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
| ChatView drag-and-drop | `src/components/ChatView.jsx` — `attachedFiles` state, drag-zone, pill badges, filenames appended to command |
| Hector briefing card | `src/components/ChatView.jsx` — sky-tinted `hectorBriefing` card after pipeline, shows top 3 sources |
| Sentinel scheduled scans | `src/services/sentinelSecurityService.js` — `startScheduledScans(intervalMs, onResult)` interval export |
| Nova opportunity history | `src/services/novaAnalysisService.js` — `saveOpportunityScore` / `getOpportunityHistory`, 30-entry localStorage |
| RightPanel audit tab | `src/components/RightPanel.jsx` — System/Audit tab switcher, last 10 approval events with outcome badges |
| RightPanel auto-refresh | `src/components/RightPanel.jsx` — 10-min `setInterval` calling `runQuickScan()` |

---

## Before Making Changes

1. Read `docs/ALPHONSO_GROUND_TRUTH.md`
2. Check `src/services/` for an existing service before writing a new one — there are 130+ services
3. Check `src/test/` — there are 101 test files already; add to them, don't create a parallel test system
4. Run `npm run test` before and after any change; all 1439+ tests must continue to pass
5. For Rust changes, run `cargo check` AND `cargo clippy -- -D warnings` from `src-tauri/` — CI enforces `-D warnings`
6. Do not commit `.env`, `.tauri-updater-key`, or `.tauri-updater-key.pub` — they are in `.gitignore`

---

## Real Gaps (as of 2026-06-21 — v2.0.5 + All 5 Directions complete)

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
- localStorage → SQLite migration — completed for 5 keys. Remaining: durable runtime data migration
- Coverage at ~30% — next staged target 35%
- TypeScript migration — partial; 9 .ts services exist in src/services/, components still .jsx

---

## Project Structure

```
src/                   React frontend (all .jsx, 9 .ts services)
  agents/              9 agent profiles, permissions, schemas + agentRegistry.js
  components/          UI components
    ConnectorHealthPanel.jsx        — full connector panel (lazy chunk)
    ConnectorStatusIndicators.jsx   — small dot/strip components (static-safe import)
    AgentActivityLog.jsx            — activity timeline tab (appendAgentActivity wired)
  services/            130 services
    connectors/        GitHub, Slack, and other connector implementations
  hooks/               14 custom hooks (useAppShellState, useAppEffects split into 6)
  lib/
    ollama.js          Ollama client — generateOllamaChatStream uses /api/chat (multi-turn)
  test/                101 test files (Vitest, vitest.config.js)
e2e/                   Playwright E2E tests (Chromium installed)
src-tauri/
  src/
    lib.rs             Rust backend (~1,585 lines)
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

_Last verified: 2026-06-21 — All 5 Directions complete. 101 test files, 1439+ tests, all passing. All 9 agents have production runtimes + UI surfaces. Coverage ~30%+ (threshold 20%). v2.0.5 live. cargo clippy clean. CI: ci.yml + release.yml. Run `npm run verify:app` and `cargo clippy -- -D warnings` from src-tauri/ to re-verify._
