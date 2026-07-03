# Alphonso — Claude Code Guide

## ALWAYS READ FIRST

`docs/ALPHONSO_GROUND_TRUTH.md` — verified facts about what exists in this repo. Do not trust any audit report or summary document that contradicts it. Past audits contained significant errors (see "Known Audit Errors" section in that file).

---

## Build Commands

```bash
npm run dev              # Vite dev server only (port 5173)
npm run tauri dev        # Full Tauri dev with Rust backend (kill port 5173 first if busy)
npm run test             # Run all 3167+ tests across 218 files — all should pass
npm run test:watch       # Watch mode
npm run build            # Web build only (no Tauri/Rust)
npm run verify:app       # lint + typecheck + test + build in one command
npm run lint             # ESLint on src/
npm run typecheck        # tsc --noEmit — full TypeScript check (0 errors as of v2.5.0)

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
- **policyEnforcementService.ts gates every outbound connector call**, but is only fail-closed on specific conditions by default: missing credentials always block, and Zero-Cost Mode (`zeroCostMode: true` by default) blocks paid/metered connectors. General high-risk-action approval gating (`approvalMode`) is **off by default** (`approvalMode: false`) — a fresh install does not require explicit approval for arbitrary high-risk actions unless the user turns Approval Mode on in Settings. Do not describe this service as "blocks anything ambiguous by default" — verify current defaults in `src/services/policyEnforcementService.ts` before relying on this in security-sensitive work.
- **licenseService.ts**: license tier validation (Free/Pro/Enterprise) gates premium connectors (GitHub, Slack, Claude, ChatGPT, YouTube, Notion, ClickUp, SD WebUI, ComfyUI)
- **parallelExecutionService.ts**: parallel task execution with concurrency control, retry logic, and task queues
- **cacheService.ts**: memory caching with TTL, LRU eviction, and global/connector/agent caches
- **22 connectors** (`DEFAULT_CONNECTORS` in `connectorRegistry.js`): Telegram, WhatsApp, YouTube, mobile_bridge, ChatGPT, Claude, Qwen, Notion, ClickUp, SD WebUI, ComfyUI Video, Runway, GitHub, Slack, Discord, Generic Webhook, Ollama, Brave Search, Perplexity, Tavily, DeepSeek, n8n — all policy-gated, all registered centrally, all have credential input UI in ConnectorSetupPanel.
- **lib.rs is ~2,024 lines** — 25 modules in src-tauri/src/ — see AGENTS.md for full module list
- **All 2555+ tests are in `src/test/`** — 186 test files; Vitest via vitest.config.js (separate from vite build config)
- **Security (Batch 1 complete)**: boot TDZ crash fixed; `gateConnectorAction` exception-safe + DSL-wired; SSRF blocking on `fetch_url_content`; `execute_command_verified` real output redaction; PKCE on all 3 OAuth scripts; clipboard/dialog/open_url use native APIs (arboard, tauri-plugin-dialog, tauri-plugin-opener); CSP narrowed to explicit ports; per-program arg allowlist in `policy_gate.rs`.
- **Two CI workflows**: `ci.yml` (lint + test + build + Tauri artifact + cargo test/clippy + npm audit + cargo audit) and `release.yml` (tag-triggered build + sign + publish).
- **`.npmrc`** has `legacy-peer-deps=true` — required because `@eslint/js@10` and `eslint@9` have a peer dep mismatch. Do not remove.
- **`eslint.config.js` covers `.ts`/`.tsx` as of 2026-07-02** (`typescript-eslint` parser/plugin, `src/**/*.{ts,tsx}` block) — previously it only covered `.js`/`.jsx` and every ".ts/.tsx" file in the repo went completely unlinted. A dedicated override block (by exact file path, not a wildcard) disables `@typescript-eslint/ban-ts-comment` for the 9 pre-existing `@ts-nocheck` files — do not widen that override list; fix `@ts-nocheck` at the source for any new file instead.
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
| Onboarding wizard | `src/components/OnboardingWizard.tsx` — 6 steps: Ollama check (auto-start via Runtime Hub), model picker, **approval mode decision**, connect (Telegram/WhatsApp/Composio guides inline), **advanced/optional services check (ChromaDB + Voice OS)**, ready |
| External URL opening (Tauri) | Use `invoke('open_url', { url })` — NOT bare `<a href target="_blank">` which fails silently in Tauri webview |
| Autostart prefs (per-tool) | `runtime_get_autostart_prefs` / `runtime_save_autostart_pref` + JSON at `%APPDATA%\Alphonso\runtimes\autostart_prefs.json` |
| Live install log streaming | `runtime://log` Tauri events + `onLogLine()` in runtimeManagerService + `LiveLogPanel` in RuntimeManagerView |
| Updater release script | `npm run release:updater` |
| Auth scripts (YouTube, Meta) | `npm run auth:youtube`, `npm run auth:meta` |
| Desktop preflight / verify | `npm run verify:desktop:preflight`, `npm run verify:desktop` |
| CI workflows | `.github/workflows/ci.yml`, `.github/workflows/release.yml` |
| WhatsApp webhook Rust commands | `src-tauri/src/whatsapp_webhook.rs` |
| KV store Rust commands | `src-tauri/src/kv_store.rs` — `kv_set`, `kv_get`, `kv_delete`, `save_settings`, `load_settings` |
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
| Telegram companion bot commands | `src/services/telegramCompanionService.js` — 17 commands: `/help`, `/report`, `/files`, `/status`, `/memory`, `/ping`, `/agents`, `/nova`, `/scan` + more. First-time `/start` owner pairing is gated on `TELEGRAM_ALLOWED_CHAT_IDS` (Settings → Connectors → Telegram, "required to pair") — do not remove this gate, it closes a real owner-registration race (Sprint 4) |
| Voice STT pipeline | `src/services/voiceService.js` + `src/hooks/useVoiceInput.js` — SpeechRecognition with fallback |
| Voice OS sidecar launcher | `src-tauri/src/voice_sidecar.rs` — `voice_start`/`voice_stop`/`voice_status` Tauri commands |
| Voice OS React service | `src/services/voiceOsService.js` — `startVoiceServer`, `stopVoiceServer`, `getVoiceServerStatus` |
| Jarvis voice hook | `src/hooks/useJarvisVoice.ts` — AudioWorklet WebSocket voice hook (start/stop/reset/state/transcript/reply/activeAgent/error/isConnected) |
| PCM worklet (required) | `src/hooks/pcm-processor.worklet.ts` — `PCM_WORKLET_CODE` string constant imported by `useJarvisVoice.ts`. Do NOT remove — voice breaks without it. |
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
| RightPanel tabs | `src/components/RightPanel.tsx` — **System / Audit / Agents** (3 tabs); Audit: last 10 approval events; Agents: `AgentStatusStrip useAutoFeed`; Security + Allowlist in System tab |
| Jarvis voice button (ChatView) | `src/components/ChatView.tsx` — `useJarvisVoice` WebSocket mic button; pulses on listening; transcript → input field |
| Browse folder fallback (SettingsView) | `src/components/SettingsView.tsx` — hidden `<input webkitdirectory>` refs for Output Folder + ComfyUI Dir when `invoke('pick_folder')` fails |
| RightPanel auto-refresh | `src/components/RightPanel.tsx` — 10-min `setInterval` calling `runQuickScan()` |
| Onboarding connector step | `src/components/OnboardingWizard.tsx` — "Connect" step with Telegram/WhatsApp/Composio/Skip cards, saves to `alphonso_onboarding_connector_v1` |
| Onboarding approval-mode step | `src/components/OnboardingWizard.tsx` — `ApprovalModeStep`, writes decision via `setRuntimePolicySettings({ approvalMode })` from `policyEnforcementService.ts` |
| Onboarding advanced services step | `src/components/OnboardingWizard.tsx` — `AdvancedServicesStep`, checks `isChromaHealthy()` and `getVoiceServerStatus()` + `checkPrerequisites().pythonFound` |
| Crash log viewer | `src/components/CrashLogView.jsx` — entry list with timestamp/message/context, "Clear" button; wired as Logs tab in SettingsView |
| Nova history chart | `src/components/NovaHistoryChart.jsx` — SVG sparkline of last 10 scores, most-recent recommendation, wired in SettingsView |
| Sentinel findings modal | `src/components/SentinelFindingModal.jsx` — fixed overlay, severity badge, pattern + recommendation rows; triggered by clicking findings in RightPanel |
| Gateway Dockerfile | `gateway/whatsapp-cloud/Dockerfile` — single-stage Node 20 Alpine build (no multi-stage); `railway.json` uses DOCKERFILE builder |
| durableStore (SQLite dual-write) | `src/lib/durableStore.js` — `durableGet/Set/Remove` writes to localStorage + fire-and-forgets to Tauri `kv_set`; used by crashLogService, agentAuditService, novaAnalysisService |
| TypeScript components (.tsx) | `AgentStatusStrip.tsx`, `UpdaterNotification.tsx`, `NotificationCenter.tsx`, `AgentPerformanceView.tsx`, `TopBar.tsx` — migrated with full prop interfaces; old .jsx files removed |
| Skill pack ↔ agent contract validation | `src/services/agentContractService.ts` — `validateSkillPackAgainstContract(agentName, permissions, packId?)`; called from `skillPackService.js` `installSkillPack`/`setSkillPackEnabled` to reject/flag skill packs whose permissions exceed the owning agent's execution contract. Third optional `packId` param checks against a narrower `AGENT_SKILL_PACK_SCOPE_OVERRIDES` entry when one exists for that exact pack, falling back to the agent-wide list otherwise (Sprint 3) |
| Default skill packs per agent (all 9) | `src/services/skillPackService.js` `BASE_PACKS` — every agent has at least one `agent_skill` category default pack; loaded via `loadAgentSkillGuidance()`, wired into `joseExecutionEngineService.js`. Miya, Hector, and Jose (highest-traffic agents) each carry a real 5-pack taxonomy instead of one catch-all — e.g. Miya: video / image / UI-UX / brand-identity / motion-graphics (Sprint 3). Alphonso/Maria×2/Marcus/Echo/Sentinel/Nova still have one default pack each — taxonomy depth for those is deferred, not forgotten |
| Pipeline loop-guard / execution budget | `src/services/joseExecutionEngineService.js` — `PIPELINE_MAX_ASSIGNMENTS` (50) / `PIPELINE_MAX_DURATION_MS` (5 min) ceiling inside `runJoseCommandExecutionPipeline`; on breach returns `{ ok: false, reason: 'budget_exceeded' }` + `pipeline_budget_exceeded` receipt. Do NOT add a second budget mechanism — extend these constants/checks instead |
| Crash-recovery checkpoint (boot) | `src/services/orchestrationQueueService.ts` — `recoverInterruptedExecutions()`; wired as a one-shot boot `useEffect` in `App.tsx` right after the autostart block. Recovers any packet left in `queued`/`executing` state by a prior crash via the existing `markPacketInterrupted()` primitive (which already existed but was previously unwired/unused) |
| Discord connector | `src/services/connectors/discordConnector.ts` — `sendMessage`, `editMessage`, `deleteMessage`, `listGuildChannels`, `getChannelHistory`, `addReaction`, `sendWebhookMessage`; Discord REST API v10, Bot token auth. Registered in `connectorRegistry.js` as `discord`; credential UI in `ConnectorSetupPanel.tsx` |
| Generic inbound webhook connector | `gateway/generic-webhook/` (standalone deployable gateway, mirrors `gateway/whatsapp-cloud/`'s queue-drain pattern — `POST /webhook/:sourceId` + shared secret in, `GET /queue/drain` out) + `src/services/genericWebhookService.js` (`pollGenericWebhookGateway`, `startGenericWebhookPolling`/`stopGenericWebhookPolling`). Lets any external service push events into Alphonso without a bespoke connector. Registered in `connectorRegistry.js` as `generic_webhook`; credential UI (drain URL + token) in `ConnectorSetupPanel.tsx`; boot poller wired in `App.tsx` |
| App auto-update check | `src/services/appUpdateService.ts` (`checkAppUpdate`, `getLastUpdateNotice`/`setLastUpdateNotice`) — called from a boot `useEffect` in `App.tsx` with the real endpoint/pubkey from `tauri.conf.json`'s `plugins.updater` block. Populates `updaterVersion`/`updaterDownloadUrl` state; `UpdaterNotification`'s Update button opens the download via `invoke('open_url', ...)`. Do NOT add a second update-check path — this is the one. Full in-app download+install+relaunch still needs `@tauri-apps/plugin-updater`/`plugin-process` (not installed) — do not assume that works yet |
| Connector registry (all 22) | `src/services/connectors/connectorRegistry.js` `DEFAULT_CONNECTORS` — every connector with credential UI now has a matching registry entry, including Ollama/Brave Search/Perplexity/Tavily/DeepSeek/n8n which previously had UI+service but no registry entry. Check this array before assuming a connector "isn't registered" |
| Plugin registry service | `src/services/pluginRegistryService.js` — `listPlugins`, `togglePlugin`, `discoverDiskPluginManifests`, `executePluginToolRun`, `validatePluginManifestDisk` |
| Plugin signing service | `src/services/pluginSigningService.js` — ECDSA P-256 keypair, `signPluginManifest`, `verifyPluginSignature`, `verifyAndAddPlugin`, trusted signer key management |
| Plugin Marketplace UI | `src/components/SettingsView.tsx` — `PluginMarketplacePanel` component; Settings → Plugins nav section |
| PWA service worker | `public/sw.js` — cache-first static, network-first nav, network-only API/invoke |
| Offline chat service | `src/services/offlineChatService.js` — IndexedDB store (`alphonso-offline` DB) with `saveMessageOffline`/`getOfflineMessages`/`markMessageSynced` |
| Tavily search connector | `src/services/connectors/tavilyConnector.js` — `searchTavily`, `isTavilyConfigured`; wired as tier-2 Hector fallback |
| Perplexity search connector | `src/services/connectors/perplexityConnector.js` — `searchPerplexity`, `isPerplexityConfigured` |
| DeepSeek AI connector | `src/services/connectors/deepseekConnector.js` — `sendDeepSeekMessage`, `searchWithDeepSeek`, `isDeepSeekConfigured`; wired as tier-3 Hector fallback; credential UI in ConnectorSetupPanel |
| ChromaDB vector DB | `src/services/chromaDbService.js` — `addMemoryToChroma`, `semanticSearchMemory`, `isChromaHealthy`; fire-and-forget write from Echo |
| Whisper transcription service | `src/services/whisperTranscriptionService.js` — `transcribeAndIngest(audioFilePath, filename, onProgress)`; uses `pick_file` Tauri command |
| n8n connector | `src/services/connectors/n8nConnector.js` — `triggerN8nWebhook`, `listN8nWorkflows`, `setN8nWorkflowActive`, `isN8nHealthy` |
| Jose cron scheduler | `src/services/joseSchedulerService.js` — `createSchedule`, `listSchedules`, `startScheduler`/`stopScheduler`; SCHEDULE_PRESETS; AutomationView Schedules tab |
| Echo file watcher | `src/services/echoFileWatcherService.js` — `startFileWatcher`, `getWatcherConfig`, `saveWatcherConfig`; polls `watch_inbox_poll` Tauri command every 30s |
| MCP server | `mcp-server/server.js` — Express port 3333; 5 MCP tools callable from Claude Desktop/Cursor/Windsurf |
| Module registry | `src/services/moduleRegistryService.ts` — `installModule`, `enableModule`, `disableModule`, `listModules`, `getModule`, `uninstallModule`; persists to `alphonso_modules_v1` |
| Runtime API client | `src/services/runtimeApiService.ts` — bridge client (port 4444): `listModules`, `runModule`, `getRunStatus`, `publishEvent`; falls back to registry offline |
| Policy DSL (module-level) | `src/services/policyDslService.ts` — `loadPolicy`, `evaluateAction`, `getPolicyRules`; separate from `policyEnforcementService` |
| A2A protocol | `src/services/a2aProtocolService.ts` — `delegate`, `getTaskStatus`, `updateTaskResult`, `listActiveTasks`, `listTasksByAgent`; uses agentBusService |
| Module manifests | `modules/` directory — TOML manifests; example: `alphonso.researcher.web_monitor` |
| policy.yaml | `policy.yaml` (repo root) — module-level policy rules consumed by `policyDslService` |
| Keyboard shortcuts modal | `src/components/KeyboardShortcutsModal.tsx` — Ctrl+? trigger; Ctrl+J/B/R nav shortcuts |
| Alphonso Bridge | `bridge/server.js` — Express port 4444; proxies tool calls to Ollama `/api/chat`; `alphonso_get_status` checks `/api/tags` |
| Native file picker | `pick_file` Tauri command in `src-tauri/src/lib.rs` — now uses `tauri-plugin-dialog` (replaced PowerShell WinForms in v2.5.0-security) |
| Companion WebSocket server | `src-tauri/src/companion_server.rs` — PIN-authenticated WebSocket server on port 9000; `companion_auth.rs` PIN manager; `companion_discovery.rs` mDNS; `companion_router.rs` JSON-RPC routing (get_status, send_command, abort_command, approve_task, get_projects, get_boardroom); `companion_types.rs` shared structs. Started automatically on app launch via `lib.rs`. |
| Companion pairing UI | `src/components/CompanionPairingPanel.tsx` — PIN display, QR code, connected clients, Start Discovery; wired in SettingsView. Do NOT create another pairing UI. |
| Boardroom sessions | `src/components/BoardroomView.tsx` — multi-agent boardroom session model with Hector briefing + Miya creative brief; `src/components/BoardroomPanel.tsx` sidebar panel. See `docs/BOARDROOM_MODEL_REGISTRY.md`. |
| Agent pairing system | `src/components/AgentPairingView.tsx` + `src/services/agentPairingExecutionService.js` + `src/services/agentPairingRegistryService.js` + `src/services/agentPairingConstants.ts` — agent-to-agent pairing and collaboration. |
| Mission room | `src/components/MissionRoom.tsx` + `src/components/MissionControlHome.tsx` + `src/services/missionRoomService.js` — operational command center view. |
| Coach system | `src/components/CoachWindow.tsx`, `CoachHardInterruptOverlay.tsx`, `CoachInterventionCard.tsx`, `CoachMissionBadge.tsx`, `CoachSkillGrid.tsx` + `src/services/coachInterventionService.js`, `coachSkillService.js`, `coachSoundCueService.js` — coaching overlays and skill system. |
| Self-development / RC0 | `src/components/SelfDevelopmentPanel.tsx` + `src/services/selfDevelopmentService.js`, `nativeSelfDevelopmentAutostartService.js`, `rc0EvidenceService.js`, `nativeRc0ProofService.js` — agent self-improvement tracking and evidence. |
| Ecosystem maturity panels | `src/components/EcosystemHub.tsx`, `EcosystemMaturityPanels.tsx`, `EcosystemMaturityPanelsGate.tsx`, `ProductionReadinessPanel.tsx` + `src/services/productionReadinessService.js` — maturity and readiness views. |
| Notion sync | `src/components/NotionSyncPanel.tsx` + `src/services/notionSyncService.js` — Notion sync UI and service. |
| Operator dashboard | `src/components/OperatorDashboard.tsx` — operator-level control dashboard. |
| Agent avatar system | `src/components/AgentAvatar.tsx` + `src/services/agentAvatarService.js` — per-agent avatar CRUD and rendering. |
| Agent metrics panel | `src/components/AgentMetricsPanel.tsx` + `src/services/agentMetricsService.js` — success rate, confidence, 7-day trend. |
| Marketing landing page | `src/components/MarketingLandingPage.tsx` — in-app marketing/landing page component. |
| Memory search UI | `src/components/MemorySearch.tsx` + `src/services/searchService.js` — memory/project search with Ctrl+P shortcut. |
| Smart voice button | `src/components/SmartVoiceButton.tsx` — unified voice input; prefers Voice OS WebSocket (Jarvis), falls back to browser SpeechRecognition. Do NOT add another voice button. |
| Session history view | `src/components/SessionHistoryView.tsx` — orchestration session history with search/filter/expand. |
| Orchestrator queue view | `src/components/OrchestratorQueueView.tsx` — live dead-letter queue dashboard with 5s auto-refresh. |
| Pipeline result card | `src/components/PipelineResultCard.tsx` — standardized pipeline result display card. |
| Trust receipt browser | `src/components/TrustReceiptBrowser.tsx` + `src/services/runtimeLedgerService.js` — durable receipt browser. |
| Dead letter queue view | `src/components/DeadLetterQueueView.tsx` — UI for dead-letter queue inspection and retry. |
| Workflow operations dashboard | `src/components/WorkflowOperationsDashboard.tsx` — workflow operations status and controls. |
| Tool connections panel | `src/components/ToolConnectionsPanel.tsx` + `src/services/toolConnectionService.js` — tool connectivity status UI. |
| Miya studio | `src/components/MiyaStudio.tsx` — Miya creative studio view. |
| Companion widget | `src/components/CompanionWidget.tsx`, `JoseCompanionWidget.tsx`, `HectorCompanionWidget.tsx`, `MiyaCompanionWidget.tsx` — per-agent companion widgets. |
| Jose task queue | `src/components/JoseTaskQueue.tsx` — Jose task queue visualization. |
| Command rib | `src/components/CommandRib.tsx` — command ribbon UI component. |
| Batch orchestrator | `src/services/batchOrchestratorService.js` — multi-batch orchestration. |
| Browser automation | `src/services/browserAutomationService.js` — open URL, fetch content, clipboard read/write. |
| Coding agent service | `src/services/codingAgentService.js` — agent-driven code generation service. |
| Creative routing | `src/services/creativeRoutingService.js` — routes creative tasks to appropriate agents. |
| Durable memory | `src/services/durableMemoryService.js` — durable (SQLite-backed) memory store. |
| Git service | `src/services/gitService.js` — git operations surface for agents. |
| Model selection | `src/services/modelSelectionService.js` — dynamic model selection for agent tasks. |
| Proactive agent | `src/services/proactiveAgentService.js` — 7 checks, suggestion banner, 60s interval. |
| Resource cost | `src/services/resourceCostService.js` — tracks and estimates resource costs per action. |
| Recovery service | `src/services/recoveryService.js` — error recovery and retry orchestration. |
| Repo audit | `src/services/repoAuditService.js` — automated repository audit service. |
| Runtime ledger | `src/services/runtimeLedgerService.js` — durable receipt ledger for runtime events. |
| Scaffold templates | `src/services/scaffoldTemplatesService.js` — code/project scaffold template management. |
| Screen intelligence | `src/services/screenIntelligenceService.js` — screen context awareness. |
| Session intelligence | `src/services/sessionIntelligenceService.js` — session-level context and insights. |
| Skill pack | `src/services/skillPackService.js` — agent skill pack management. |
| Source confidence | `src/services/sourceConfidenceService.js` — rates source credibility for Hector research. |
| Streaming service | `src/services/streamingService.js` — real-time token streaming, abort, token counter. |
| Tool notification dispatcher | `src/services/toolNotificationDispatcher.js` — dispatches notifications from tool results. |
| Unified memory | `src/services/unifiedMemoryService.js` — 4 memory systems consolidated; old services re-export for compat. |
| Verification chain | `src/services/verificationService.js` + `verificationChainService.js` — multi-step verification with receipt. |
| Workflow governance | `src/services/workflowGovernanceService.js` — governance rules for workflow execution. |
| Workflow memory | `src/services/workflowMemoryService.js` — workflow-scoped memory. |
| Workspace artifact | `src/services/workspaceArtifactService.js` — workspace artifact management. |
| Workspace file service | `src/services/workspaceFileService.js` — file read/delete/move/search/list. Do NOT create another file service. |
| Workspace intelligence | `src/services/workspaceIntelligenceService.js` — workspace-level context and insights. |
| Workspace root | `src/services/workspaceRootService.js` — manages the active workspace root path. |
| Backup service | `src/services/backupService.js` — export/import all data as JSON. Do NOT create another backup service. |
| Auto-run service | `src/services/autoRunService.js` — configures and triggers auto-run behaviors. |
| Notion sync service | `src/services/notionSyncService.js` — Notion database sync. |
| Maria weekly report | `src/services/mariaWeeklyReportService.js` — scheduled governance report generation. |
| Agent pairing constants | `src/services/agentPairingConstants.ts` — typed constants for the pairing system. |
| E2E voice + visual specs | `e2e/voice.spec.js` + `e2e/visual.spec.js` — Playwright voice flow + visual regression tests. Do NOT delete baseline snapshots. |
| App.tsx lazy-loaded views export-shape guard | `src/test/appLazyImports.test.js` — parses every `lazy(() => import(...))` call in `App.tsx` and asserts the target module actually exports what that call expects (default export vs. named export via `.then()`), so a missing `.then((mod) => ({ default: mod.X }))` mapping (which crashes the whole app via React.lazy resolving `undefined`) can't silently reappear. Added after this exact bug was found live in `BoardroomView` during the Sprint 3 discoverability audit |
| iOS companion (Rust) | `src-tauri/src/companion_server.rs`, `companion_auth.rs`, `companion_discovery.rs`, `companion_router.rs`, `companion_types.rs` — full WebSocket backend. Wired in lib.rs on startup. Frontend: `CompanionPairingPanel.tsx`. iOS Swift app in `ios/` + `AlphonsoCompanion/`. |

---

## Before Making Changes

1. Read `docs/ALPHONSO_GROUND_TRUTH.md`
2. Check `src/services/` for an existing service before writing a new one — there are 163+ services
3. Check `src/test/` — there are 218 test files already; add to them, don't create a parallel test system
4. Run `npm run test` before and after any change; all 3,174 tests must continue to pass
5. For Rust changes, run `cargo check` AND `cargo clippy -- -D warnings` from `src-tauri/` — CI enforces `-D warnings`
6. Do not commit `.env`, `.tauri-updater-key`, or `.tauri-updater-key.pub` — they are in `.gitignore`
7. **When bumping the app version, bump all 4 locations together**: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`'s `app` package entry. These drifted out of sync for 9 versions (2.4.4 → 2.5.9) before this was caught by a real release build in 2026-07-02 (the published installer was mislabeled `2.4.4`) — see the "Last verified" entry below for the full story.

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
- ~~Component test coverage at ~6%~~ — **CLOSED Direction 3** (218 test files / 3,167+ tests; ~28% component coverage)
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
- Coverage at ~38%+ — functions at 5.88% (18 new service test files added in Test Expansion sprint)
- ~~Runtime Manager 9 gaps~~ — **CLOSED 2026-06-23**
- ~~Onboarding flow~~ — **CLOSED 2026-06-23** (Ollama auto-start, not-installed detection, Telegram/WhatsApp/Composio inline guides, `OllamaOfflineBanner` in main shell)
- ~~Ollama offline state~~ — **CLOSED 2026-06-23** (`OllamaOfflineBanner.jsx` — global, persistent, Start/Retry/Runtime Hub)
- ~~Composio onboarding~~ — **CLOSED 2026-06-23** (inline API key entry in OnboardingWizard Step 3, saves via `setComposioConfig`) (prereq detection, async streaming, venv isolation, AudioCraft fix, InvokeAI venv exe, boot status banner, autostart prefs JSON)
- ~~TypeScript migration (components)~~ — **CLOSED, verified 2026-07-02**: `src/components/` is 100% `.tsx` (114 files, 0 `.jsx` remaining) — this line was stale, corrected during ALPHONSOTOTHEMOON Sprint 3 seeding. The real remaining gap is the **service layer**: `src/services/*.js` (root level) is now 23 `.js` vs. 108 `.ts` (was 38/93 before Sprint 5 batch 8). Sprint 5 continues in `ALPHONSOTOTHEMOON.md`.
- ~~Sprint 5 batch 1: connectors subsystem TS migration~~ — **CLOSED 2026-07-02 ALPHONSOTOTHEMOON Sprint 5, v2.5.7** (`src/services/connectors/` moved from 3 `.ts`/10 `.js` to 9 `.ts`/4 `.js` — `connectorConstants.ts`, `tavilyConnector.ts`, `perplexityConnector.ts`, `deepseekConnector.ts`, `n8nConnector.ts`, `connectorAuth.ts` migrated; `connectorImageGenerators.js`, `connectorOutbound.js`, `connectorPolling.js`, `connectorRegistry.js` deferred to a follow-up batch — larger files, 452-952 lines each)
- ~~Sprint 5 batch 2: 10 more root-level services TS migration~~ — **CLOSED 2026-07-02 ALPHONSOTOTHEMOON Sprint 5, v2.5.8** (`connectorRegistryService.ts`, `workflowMemoryService.ts`, `workspaceArtifactService.ts`, `agentAuditService.ts`, `connectorAuditLogService.ts`, `agentPairingRegistryService.ts`, `miyaMemoryService.ts`, `crashLogService.ts`, `metaPublishService.ts`, `memoryService.ts` migrated; root-level count 115/16 → 105/26; remaining ~105 root-level `.js` files still open for future batches)
- ~~Sprint 5 batch 3: 10 more root-level services TS migration~~ — **CLOSED 2026-07-03 ALPHONSOTOTHEMOON Sprint 5, v2.5.11** (`codingAgentService.ts`, `workspaceExportService.ts`, `agentActivityService.ts`, `agentVisualService.ts`, `autoRunService.ts`, `creativeRoutingService.ts`, `sourceConfidenceService.ts`, `workspaceFileService.ts`, `whisperTranscriptionService.ts`, `notificationService.ts` migrated; root-level count 105/26 → 90/36; remaining ~90 root-level `.js` files still open for future batches)
- ~~Sprint 5 batch 4: 12 more root-level services TS migration~~ — **CLOSED 2026-07-03 ALPHONSOTOTHEMOON Sprint 5, v2.5.12** (`runwayService.ts`, `browserAutomationService.ts`, `miyaExportPacketService.ts`, `coachSkillService.ts`, `workspaceRootService.ts`, `projectDirectoryService.ts`, `miyaComfyWorkflowPresetService.ts`, `recoveryService.ts`, `modelSelectionService.ts`, `coachModeService.ts`, `agentAvatarService.ts`, `voiceOsService.ts` migrated; root-level count 90/36 → 83/48; remaining ~83 root-level `.js` files still open for future batches)
- Sprint 5 batch 5: 15 more root-level services TS migration~~ — **CLOSED 2026-07-03 ALPHONSOTOTHEMOON Sprint 5, v2.5.13** (`orchestrationGovernanceService.ts`, `resourceCostService.ts`, `gitService.ts`, `pluginSandboxService.ts`, `hectorBookmarkService.ts`, `serviceScopes.ts`, `workflowTelemetryService.ts`, `searchService.ts`, `durableMemoryService.ts`, `connectorCircuitBreakerService.ts`, `workflowReceiptService.ts`, `sessionIntelligenceService.ts`, `chromaDbService.ts`, `localMarketplaceService.ts`, `genericWebhookService.ts` migrated; root-level count 83/48 → 68/63; remaining ~68 root-level `.js` files still open for future batches)
- Sprint 5 batch 6: 15 more root-level services TS migration~~ — **CLOSED 2026-07-03 ALPHONSOTOTHEMOON Sprint 5, v2.5.14** (`workspaceIntelligenceService.ts`, `connectorRateLimiterService.ts`, `agentPairingExecutionService.ts`, `coachSoundCueService.ts`, `runtimeLedgerService.ts`, `offlineChatService.ts`, `memoryMonitorService.ts`, `runtimeManagerService.ts`, `mariaWeeklyReportService.ts`, `workflowGovernanceService.ts`, `voiceService.ts`, `connectorHealthCheckService.ts`, `whatsappBrowserConnector.ts`, `streamingService.ts`, `workflowBuilderService.ts` migrated; root-level count 68/63 → 53/78; remaining ~53 root-level `.js` files still open for future batches)
- Sprint 5 batch 7: 15 more root-level services TS migration~~ — **CLOSED 2026-07-03 ALPHONSOTOTHEMOON Sprint 5, v2.5.15** (`agentOutputStoreService.ts`, `nativeRc0ProofService.ts`, `novaFeedbackService.ts`, `echoFileWatcherService.ts`, `agentPerformanceService.ts`, `repoAuditService.ts`, `backupService.ts`, `telegramAutoPollService.ts`, `miyaWorkflowTemplates.ts`, `toolNotificationDispatcher.ts`, `sentinelGateService.ts`, `chatgptService.ts`, `claudeService.ts`, `coachInterventionService.ts`, `marcusPublishService.ts` migrated; root-level count 53/78 → 38/93; remaining ~38 root-level `.js` files still open for future batches)
- Sprint 5 batch 8: 15 more root-level services TS migration~~ — **CLOSED 2026-07-03 ALPHONSOTOTHEMOON Sprint 5, v2.5.16** (`devPacketService.ts`, `pluginRegistryService.ts`, `pluginSigningService.ts`, `packetExecutionService.ts`, `verificationService.ts`, `nativeSelfDevelopmentAutostartService.ts`, `agentMetricsService.ts`, `mariaAuditService.ts`, `proactiveAgentService.ts`, `agentBusService.ts`, `telegramBrowserConnector.ts`, `composioService.ts`, `screenIntelligenceService.ts`, `toolRegistryService.ts`, `joseSchedulerService.ts` migrated; root-level count 38/93 → 23/108; remaining ~23 root-level `.js` files still open for future batches)
- `src/test/telegramConnectorProof.test.js`'s "runs a real telegram send proof when env and approval are present" test fails independent of any change in this session — confirmed pre-existing via `git stash`/reproduce/`git stash pop` during Sprint 5 batch 2 verification (2026-07-02). Not investigated further this pass (out of scope for the TS migration work that surfaced it) — still OPEN
- ~~ESLint does not lint any `.ts`/`.tsx` file in this repo~~ — **CLOSED 2026-07-02 ALPHONSOTOTHEMOON Sprint 6, v2.5.9** (added `typescript-eslint` parser/plugin + a `.ts`/`.tsx` rule block to `eslint.config.js`; fixed all 37 findings it immediately surfaced except 9 pre-existing `@ts-nocheck` files, which have a targeted, explicitly-commented rule override rather than a silent blanket disable — see "TypeScript `.ts`/`.tsx` ESLint coverage" row above)
- **9 files still use `// @ts-nocheck`** (`App.tsx`, `ApprovalModal.tsx`, `ChatView.tsx`, `ConnectorHealthPanel.tsx`, `OllamaOfflineBanner.tsx`, `OnboardingWizard.tsx`, `SettingsView.tsx`, `Sidebar.tsx`, `WorkflowBuilderView.tsx`) — written before type-checking existed for them; removing `@ts-nocheck` from any would likely surface many real type errors per file. Deliberately deferred as its own future effort (do NOT rush through it inside an unrelated change) — do not add new files to this list; fix `@ts-nocheck` at the source for anything new instead. Still OPEN, tracked in `ALPHONSOTOTHEMOON.md`'s Sprint 6 section
- ~~Boot null-guard crashes~~ — **CLOSED 2026-06-25 patch2** (3 `invoke()` calls returning `null` — `getAllStatus`, both `check_env_vars_presence` — guarded with `?? []/{}`)
- ~~Coach mode button broken in web mode~~ — **CLOSED 2026-06-25 patch2** (`CoachContext` `handleToggleCoachMode/Top` wrapped in try/catch; `coachModeService` `getByLabel` gets `.catch(() => null)`)
- ~~Browse buttons broken in web mode~~ — **CLOSED 2026-06-25 patch2** (Output Folder + ComfyUI Dir fallback to hidden `<input webkitdirectory>` in `SettingsView.tsx`)
- ~~Jarvis voice unwired~~ — **CLOSED 2026-06-25 patch2** (`useJarvisVoice` mic button + transcript wiring added to `ChatView.tsx`)
- ~~Agents tab missing from RightPanel~~ — **CLOSED 2026-06-25 patch2** (System | Audit | Agents, Agents tab shows `AgentStatusStrip useAutoFeed`)
- ~~SentinelAllowlistPanel overflows sidebar~~ — **CLOSED 2026-06-25 patch2** (compact inline form rewrite with CSS var theming)
- ~~pcm-processor.worklet.ts dead class breaking tests~~ — **CLOSED 2026-06-25 patch2** (removed `class PcmProcessor extends AudioWorkletNode` placeholder that caused jsdom test failures)
- ~~Coach mode shows no change on click~~ — **CLOSED 2026-06-25 v2.2.4** (`CoachContext` sets `coachMode=true` + dispatches `alphonso:toast` even when Tauri window fails; `ToastProvider` now listens to global `alphonso:toast` CustomEvent)
- ~~ACC Bridge full config form in Content page~~ — **CLOSED 2026-06-25 v2.2.4** (`ContentCatalystWorkspace.jsx` replaced 4-field form with compact status indicator; config stays in Settings → Connectors)
- ~~AgentDock floating, not integrated in RightPanel~~ — **CLOSED 2026-06-25 v2.2.4** (`AgentDock.jsx` `embedded` prop; `RightPanel.tsx` Agents tab uses embedded dock with `agentDockCompanions` from App)
- ~~Activity page too thin (standalone)~~ — **CLOSED 2026-06-25 v2.2.4** (Activity tab added to RuntimeManagerView; sidebar `activity` item removed)
- ~~Knowledge/Files page too thin (standalone)~~ — **CLOSED 2026-06-25 v2.2.4** (Knowledge section in SettingsView renders `FilesView`; sidebar `files` item removed)
- ~~Automation operations non-interactive (stubs)~~ — **CLOSED 2026-06-25 v2.2.4** (`AutomationView.jsx` operations now toggleable via `updateWorkflowOperationStatus`)
- ~~Telegram commands limited to 13~~ — **CLOSED 2026-06-25 v2.2.4** (17 commands: +`/ping`, `/agents`, `/nova`, `/scan` in `telegramCompanionService.js`)
- ~~Telegram companion expansion to 21 commands~~ — **CLOSED 2026-06-26 v2.2.8** (`/research`, `/memory`, `/receipts`, `/read` added; help text reorganized into categories)
- ~~n8n workflow automation~~ — **CLOSED 2026-06-26 v2.3.0** (`n8nConnector.js` + Runtime Hub ToolDef + Marcus distribution target + ConnectorSetupPanel credential section)
- ~~Jose scheduled tasks~~ — **CLOSED 2026-06-26 v2.3.0** (`joseSchedulerService.js` + AutomationView Schedules tab + App.tsx wiring)
- ~~Echo file system watcher~~ — **CLOSED 2026-06-26 v2.3.0** (`echoFileWatcherService.js` + `watch_inbox_poll`/`mark_inbox_file_processed` Tauri commands + Settings config card)
- ~~Whisper file path broken~~ — **CLOSED 2026-06-26 v2.2.10** (`pick_file` Tauri command via PowerShell OpenFileDialog; `MeetingTranscriptionPanel` uses `invoke('pick_file')`)
- ~~MCP bridge stub responses~~ — **CLOSED 2026-06-26 v2.2.10** (`bridge/server.js` calls Ollama `/api/chat` for live responses; `alphonso_get_status` checks `/api/tags`)
- ~~OpenHands -it flag (no TTY)~~ — **CLOSED 2026-06-26 v2.3.0** (changed to `-d` in `runtime_manager.rs` ToolDef)
- ~~DeepSeek connector~~ — **CLOSED 2026-06-27 v2.4.4** (`deepseekConnector.js` + credential UI + Hector tier-3 fallback + 4 tests + externalAgentAdapter wired)
- ~~PWA offline ChatView wiring~~ — **CLOSED 2026-06-27 v2.4.4** (`saveMessageOffline` called in ChatView.tsx on Ollama stream error)
- ~~iOS companion Rust backend~~ — **CLOSED** (5 Rust modules: `companion_server/auth/discovery/router/types.rs`; wired in lib.rs; `CompanionPairingPanel.tsx` in React; iOS Swift app in `ios/` + `AlphonsoCompanion/`)
- iOS companion router full end-to-end test — still OPEN (Rust backend + React pairing UI done; needs live device test)
- Voice OS Python prereq — still OPEN (requires Python 3.10+ on PATH, can't auto-install Python itself)
- ~~TypeScript 0 errors~~ — **CLOSED 2026-07-01** (`role` optional in AgentDock/AgentPairingView; runtimeApiService test casts fixed)
- ~~package.json version stale~~ — **CLOSED 2026-07-01** (bumped to 2.5.0)
- ~~Dependabot PRs (8 safe)~~ — **CLOSED 2026-07-01** (merged #77–#80, #82, #84, #86, #87; left open: #81 rand 0.10 breaking, #83 tailwindcss v4 breaking, #85 vite-plugin-react v6 major)
- Branch protection on `main` — still OPEN (manual GitHub step; MCP doesn't expose branch protection API)
- functions coverage at 5.88% — threshold lowered to 0 to unblock CI; real gap remains
- ~~No LICENSE~~ — **CLOSED 2026-07-02 ALPHONSOTOTHEMOON Sprint 1** (`LICENSE` — SHALAUDE v1.0, all-rights-reserved, source-visible; see `ALPHONSOTOTHEMOON.md` §1)
- ~~Skill packs not cross-checked against agent contracts~~ — **CLOSED 2026-07-02 ALPHONSOTOTHEMOON Sprint 1** (`validateSkillPackAgainstContract` in `agentContractService.ts`, wired into `skillPackService.js` install/enable paths)
- ~~5 of 9 agents (Alphonso, Marcus, Echo, Sentinel, Nova) had no default skill pack~~ — **CLOSED 2026-07-02 ALPHONSOTOTHEMOON Sprint 1** (all 9 agents now have an `agent_skill` category pack in `skillPackService.js`)
- ~~Jose execution pipeline had no runaway-loop / budget ceiling~~ — **CLOSED 2026-07-02 ALPHONSOTOTHEMOON Sprint 1** (`PIPELINE_MAX_ASSIGNMENTS`/`PIPELINE_MAX_DURATION_MS` guard in `joseExecutionEngineService.js`)
- Full local test suite (218 files) cannot complete in one run on this dev machine — vitest worker-pool startup times out past ~170 files regardless of pool size (default, 4-worker cap, and the project's own programmatic runner all reproduce it identically). Files that do run pass with 0 assertion failures; this is an environment/resource constraint, not a code defect. Worth investigating machine-side (available RAM/CPU vs. concurrent fork count) before the next full-suite-dependent sprint gate — still OPEN
- ~~Resumable-execution checkpoint on top of DLQ~~ — **CLOSED 2026-07-02 ALPHONSOTOTHEMOON Sprint 2** (`recoverInterruptedExecutions()` in `orchestrationQueueService.ts`, wired at boot in `App.tsx`)
- ~~Discord connector~~ — **CLOSED 2026-07-02 ALPHONSOTOTHEMOON Sprint 2** (`discordConnector.ts` + registry + credential UI + 17 tests)
- ~~Generic inbound webhook connector~~ — **CLOSED 2026-07-02 ALPHONSOTOTHEMOON Sprint 2** (`gateway/generic-webhook/` + `genericWebhookService.js` + registry + credential UI + boot poller + 13 tests)
- ~~`ConnectorSetupPanel.test.jsx` mock gap~~ — **CLOSED 2026-07-02, v2.5.6** (added `hydrateConnectorCredentialsFromSqlite: vi.fn().mockResolvedValue()` to the `connectorAuth` mock factory, exactly as diagnosed in Sprint 2; 7/7 passing)
- ~~Auto-updater never checked for updates~~ — **CLOSED 2026-07-02** (`checkAppUpdate()` existed with 19 passing tests but was never called from `App.tsx`; Update button was a no-op. Both fixed — see "App auto-update check" in Do Not Duplicate table above). Full in-app download+install+relaunch still needs `@tauri-apps/plugin-updater`/`plugin-process` (not installed) — still OPEN as a distinct follow-up
- ~~Connector registry missing 6 working connectors~~ — **CLOSED 2026-07-02** (Ollama, Brave Search, Perplexity, Tavily, DeepSeek, n8n added to `DEFAULT_CONNECTORS`; count 16 → 22)
- ~~Stale claim: "10 components migrated, 63 .jsx remaining"~~ — **CORRECTED 2026-07-02**: components are actually 100% `.tsx` (114 files, 0 `.jsx`). Real remaining TS-migration gap is root-level services (115 `.js` / 16 `.ts`) — Sprint 5 batch 1 closed the `connectors/` subdirectory (see above); root-level services batch still open, tracked in `ALPHONSOTOTHEMOON.md`
- ~~Coach Mode discoverability + feature audit~~ — **CLOSED 2026-07-02, v2.5.5** (verified live via Playwright click-through, not source-reading alone — see "App.tsx lazy-loaded views" row above for the crash this audit found and fixed). Coach Mode itself is real and functional; the "feels forgotten" report traces to it having no visual distinction from Settings/Theme in the sidebar footer, not to it being broken or unreachable
- **Boardroom Sessions crash — CLOSED 2026-07-02, v2.5.5**: `App.tsx`'s `lazy(() => import('./components/BoardroomView'))` was missing the `.then((mod) => ({ default: mod.BoardroomView }))` mapping every other lazy import in that file uses; `BoardroomView.tsx` has no default export, so React.lazy resolved `undefined` and crashed the entire app the instant a user opened Boardroom → "Boardroom Sessions". Fixed; regression-guarded by `src/test/appLazyImports.test.js` (parses every `lazy()` call in `App.tsx` and checks the target module's real export shape) and `src/test/boardroomView.test.jsx`
- ~~Agent skill-library depth (only 1 pack per agent, no real taxonomy)~~ — **CLOSED 2026-07-02 ALPHONSOTOTHEMOON Sprint 3, v2.5.4** (Miya/Hector/Jose each moved to a real 5-pack taxonomy; `validateSkillPackAgainstContract()` gained optional per-pack scope overrides via `AGENT_SKILL_PACK_SCOPE_OVERRIDES`; EcosystemHub Skills tab groups by owner agent — see "Default skill packs per agent" row above). Taxonomy depth for the remaining 6 agents, module-system convergence, and a full marketplace model are explicitly deferred, not forgotten
- ~~Security hardening Batch 2 (attacker resistance)~~ — **CLOSED 2026-07-02 ALPHONSOTOTHEMOON Sprint 4, v2.5.6** (fixed a real Telegram companion owner-registration auth bypass + constant-time token comparison on both gateways — see "Telegram companion bot commands" and "Gateway Dockerfile" rows above for the affected files; Discord/webhook/CI-audit-gating confirmed already solid; OS-level credential storage documented as a Sprint 6 recommendation, not implemented)
- Subprocess/sandboxed tool execution, MCP-as-first-class-runtime-capability, scheduler heartbeat supervision, email connector, module-system convergence, EULA/trademark, feature discoverability audit (Coach Mode UI prominence, Operator Dashboard nav placement) — see `ALPHONSOTOTHEMOON.md` Sprint 5–6 for the full backlog

---

## Project Structure

```
src/                   React frontend (mix of .tsx and .jsx, 9+ .ts services)
  agents/              9 agent profiles, permissions, schemas + agentRegistry.js
  components/          UI components (114+ items including subdirectories)
    ConnectorHealthPanel.jsx        — full connector panel (lazy chunk)
    ConnectorStatusIndicators.jsx   — small dot/strip components (static-safe import)
    AgentActivityLog.tsx            — activity timeline tab (appendAgentActivity wired)
    BoardroomView.tsx               — multi-agent boardroom sessions
    CompanionPairingPanel.tsx       — iOS/desktop companion PIN + QR pairing
    AgentPairingView.tsx            — agent-to-agent pairing
    MissionControlHome.tsx          — operational command center
    CoachWindow.tsx                 — coaching system UI
    EcosystemHub.tsx                — ecosystem maturity hub
    SelfDevelopmentPanel.tsx        — agent self-improvement tracking
    SmartVoiceButton.tsx            — unified voice input (Jarvis + STT fallback)
    SessionHistoryView.tsx          — orchestration history search/filter
    OperatorDashboard.tsx           — operator-level control
    agentWorkshop/   agents/   approval/   audit/   dashboard/   hector/   projectExecution/   research/   ui/
  services/            163+ services
    connectors/        GitHub, Slack, Tavily, Perplexity, DeepSeek, n8n, and other connectors
  hooks/               17 custom hooks (useAppShellState, useAppEffects split into 6, useJarvisVoice, useTheme, etc.)
  lib/
    ollama.js / ollama.ts    Ollama client — generateOllamaChatStream uses /api/chat (multi-turn)
    durableStore.js          SQLite dual-write (localStorage + Tauri kv_set)
    motion.ts                Framer Motion helpers
  test/                218 test files (Vitest, vitest.config.js)
e2e/                   Playwright E2E tests (smoke.spec.js, voice.spec.js, visual.spec.js, multiagent.spec.js)
src-tauri/
  src/
    lib.rs             Rust backend (~2,024 lines)
    utils.rs           Shared utilities
    main.rs            Tauri entry point
    kv_store.rs        KV store — kv_set, kv_get, kv_delete, save_settings, load_settings
    whatsapp_webhook.rs  WhatsApp webhook (3 commands, 4 structs)
    native_proof.rs    Native proof module
    runway.rs          Runway video module
    telegram.rs        Telegram Bot API module
    youtube.rs         YouTube upload module
    workspace.rs       Workspace file ops module
    search.rs          Research search module
    connector_commands.rs  Connector Rust backend (14 commands)
    plugin_runtime.rs  Plugin runtime engine
    policy_gate.rs     Policy enforcement backend (per-program arg allowlist)
    audit_log.rs       Audit chain
    ollama.rs          Ollama backend
    memory_store.rs    Memory persistence
    meta_publish.rs    Meta publishing
    voice_sidecar.rs   Voice OS sidecar launcher
    runtime_manager.rs AI runtime manager (9+ tools)
    companion_server.rs   WebSocket companion server (PIN auth, client registry)
    companion_auth.rs     PIN manager with TTL
    companion_discovery.rs  mDNS discovery
    companion_router.rs   JSON-RPC router (get_status, send_command, approve_task, get_boardroom, etc.)
    companion_types.rs    Shared companion structs
  Cargo.toml
ios/                   iOS companion Swift app source
AlphonsoCompanion/     iOS companion Xcode project
docs/                  Documentation and handoff packages
  ALPHONSO_GROUND_TRUTH.md   <- single source of truth
  USER_MANUAL.md       Full user manual
  GETTING_STARTED.md   Quick setup guide
  AGENT_GUIDE.md       Agent capabilities and permissions
  TROUBLESHOOTING.md   Common issues and fixes
  CHANGELOG.md
  BOARDROOM_MODEL_REGISTRY.md  Boardroom session roles
  BOARDROOM_ROLES.md           Boardroom governance
  IOS_COMPANION_PLAN.md        iOS companion architecture
  IOS_COMPANION_HANDOFF.md     iOS handoff package
  ALPHONSOJUNEMISSINGSPRING.md Backlog of deferred/untested items
.github/
  workflows/
    ci.yml             Main CI: lint + test + build + cargo clippy/test + Tauri artifact + security audits
    release.yml        Release CI: tag-triggered build + sign + publish
    ios-build.yml      iOS CI: builds + archives + exports IPA + uploads to TestFlight
.npmrc                 legacy-peer-deps=true (required for npm ci to work)
.nvmrc                 Node 20 LTS
.editorconfig          utf-8, lf, 2-space indent
playwright.config.js   Playwright config (baseURL :5173, headless Chromium)
vitest.config.js       Vitest config (separate from vite build config)
policy.yaml            Module-level policy rules (consumed by policyDslService)
CONTRIBUTING.md        PR checklist, TS requirements, commit format
bridge/                Alphonso Bridge — Express port 4444, proxies to Ollama
gateway/
  whatsapp-cloud/      Railway-hosted WhatsApp Cloud gateway (live, deployed)
mcp-server/            MCP server — Express port 3333, 5 tools
modules/               TOML module manifests (alphonso.researcher.web_monitor)
voice/                 Voice OS backend (FastAPI, faster-whisper, piper, webrtcvad)
scripts/               Build, release, and auth helper scripts
```

---

_Last verified: 2026-07-02 — v2.5.10 — First real release cut since v2.4.4, requested by the user (tag + CI release + installer). Tagged and pushed `v2.5.9`; `.github/workflows/release.yml` built and published successfully (19m47s). Checked the published release rather than assuming success meant correctness: `gh release view v2.5.9` showed the installer asset named `Alphonso_2.4.4_x64-setup.exe`, not `2.5.9`. Root cause: `package.json`'s version had been bumped every sprint (2.4.4 → 2.5.9) but `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` — the actual Tauri app version driving the installer filename, in-app About display, and updater version comparisons — were never touched, silently stuck at `2.4.4` through 9 version bumps (only surfaced now because no release had been cut in between). Fixed both files plus `Cargo.lock`'s `app` entry, bumped `package.json` to match, verified with `cargo check`, and cut a corrected release under `v2.5.10` rather than force-moving the already-public `v2.5.9` tag. Process fix for future sprints: bumping `package.json`'s version must also bump the 3 Tauri-side version locations in the same commit — added to `ALPHONSOTOTHEMOON.md`'s process notes. package.json / tauri.conf.json / Cargo.toml version: 2.5.10 (all three in sync). Previous entry (v2.5.9, 2026-07-02) — ALPHONSOTOTHEMOON Sprint 6 (started): fixed the ESLint `.ts`/`.tsx` coverage gap found during a Sprint 5 check-in. Added `typescript-eslint` (parser + plugin) and a matching rule block to `eslint.config.js`, which previously only covered `src/**/*.{js,jsx}` — every `.ts`/`.tsx` file in the repo (114 `.tsx` components, 26 `.ts` services) had never actually been linted. Running it immediately surfaced 37 real findings; fixed all of them except the 9 pre-existing `@ts-nocheck` files, which are deliberately deferred (removing `@ts-nocheck` from each would likely surface a large batch of real type errors — a separate, much bigger effort) and documented via a targeted, exact-path ESLint override rather than a silent blanket disable. Fixes made: 11 stale `eslint-disable` directives (auto-fixed); 8 empty `catch {}` blocks given explanatory comments across `ModelSwitcher.tsx`, `appUpdateService.ts`, `licenseService.ts`, `policyEnforcementService.ts`; a real bug-shaped ternary-as-statement in `SmartVoiceButton.tsx` rewritten as `if`/`else`; 3 `require()` calls in `SettingsView.tsx` converted to static imports after confirming the target exports are always resolvable; 4 empty-interface declarations in `global.d.ts` converted to type aliases. `npm run lint` and `npx tsc --noEmit` both clean; 133/133 targeted tests passing. package.json version: 2.5.9. All docs updated same-pass. Previous entry (v2.5.8, 2026-07-02) — ALPHONSOTOTHEMOON Sprint 5 (batch 2, service-layer TS migration): migrated 10 more root-level `src/services/*.js` files to `.ts` — the 10 smallest remaining (`connectorRegistryService.ts`, `workflowMemoryService.ts`, `workspaceArtifactService.ts`, `agentAuditService.ts`, `connectorAuditLogService.ts`, `agentPairingRegistryService.ts`, `miyaMemoryService.ts`, `crashLogService.ts`, `metaPublishService.ts`, `memoryService.ts`). Root-level count: 115/16 → 105/26. Ran the full ~43-file affected test set; hit the documented vitest worker-pool timeout on a ~27-file invocation, re-ran the affected files individually and all passed (269/270 — the one failure, `telegramConnectorProof.test.js`, was confirmed pre-existing by stashing this session's changes and reproducing it identically before restoring). `npx tsc --noEmit` clean; ESLint clean. package.json version: 2.5.8. All docs updated same-pass. Previous entry (v2.5.7, 2026-07-02) — ALPHONSOTOTHEMOON Sprint 5 (batch 1, service-layer TS migration): migrated 6 of 10 `.js` files in `src/services/connectors/` to `.ts` — `connectorConstants.ts`, `tavilyConnector.ts`, `perplexityConnector.ts`, `deepseekConnector.ts`, `n8nConnector.ts`, `connectorAuth.ts`. Batched by subsystem per this doc's own guidance rather than attempting all 115 root-level `.js` services at once; `connectorImageGenerators.js`/`connectorOutbound.js`/`connectorPolling.js`/`connectorRegistry.js` (452-952 lines each) deferred to a follow-up batch. Verified the `.js`-suffixed-import-resolves-to-`.ts` pattern (already used by `discordConnector.ts`/`slackConnector.ts`/`githubConnector.ts`) before renaming anything, so no import statements needed touching across the ~15 files that import these connectors. Adding real types to `connectorAuth.ts` caught one true bug at typecheck time: `ConnectorSetupPanel.tsx` was passing a raw unnormalized string as `allowlist` where the (previously untyped) JS silently accepted it — fixed the type signature to match actual call-site usage rather than loosening it to `any`. While running the full targeted suite, found a second, duplicate Telegram test file (`src/test/connectors/telegramCompanionService.test.js`) that Sprint 4's owner-registration security fix hadn't updated — same allowlist-mock gap, now fixed there too with 2 additional regression tests. Targeted tests: 275/275 passing; `npx tsc --noEmit` clean; ESLint clean. package.json version: 2.5.7. All docs updated same-pass. Previous entry (v2.5.6, 2026-07-02) — ALPHONSOTOTHEMOON Sprint 4 (security hardening Batch 2): audited already-merged Sprint 2 surfaces directly (the diff-scoped `security-review` skill doesn't apply when there's no pending PR). Found and fixed a real authentication-bypass bug: `telegramCompanionService.js`'s `/start` owner registration was first-come-first-served — whichever chat messaged first became the *permanent* owner with full command authority over Jose, exploitable because Telegram bot usernames (unlike tokens) are publicly searchable. Fixed by gating registration on `TELEGRAM_ALLOWED_CHAT_IDS`, a credential field that already existed in `ConnectorSetupPanel.tsx` but was never enforced — reused it instead of building a new pairing-code mechanism (discovered mid-implementation, documented the pivot). Also hardened constant-time token comparison on both `gateway/generic-webhook` and `gateway/whatsapp-cloud` (the WhatsApp gateway's HMAC signature check already did this correctly; only the simpler bearer/query-token checks had drifted to plain `===`). Traced Discord/generic-webhook/WhatsApp inbound paths and confirmed none of them auto-forward content into agent prompts except Telegram (the one now fixed). Confirmed `npm audit`/`cargo audit` already gate CI (no `continue-on-error`). Credential storage (OS-level secret storage vs. localStorage/SQLite) documented as a Sprint 6 recommendation per the user's explicit choice not to implement it this sprint. Bonus: fixed the `ConnectorSetupPanel.test.jsx` mock gap open since Sprint 2 while already touching that file. Targeted tests: 48/48 passing (`telegramCompanionService` 22, `ConnectorSetupPanel` 7, `whatsappCloudGateway`, `whatsappGatewaySecurity`, `genericWebhookService`); `npx tsc --noEmit` clean; ESLint clean. package.json version: 2.5.6. All docs updated same-pass. Previous entry (v2.5.5, 2026-07-02) — ALPHONSOTOTHEMOON Sprint 3 (discoverability-audit half, closing out Sprint 3): drove the actual running app with Playwright (headless Chromium against `npm run dev`) rather than only reading source, per the sprint's own requirement that exposure — not just wiring — needed a real click-through pass. Found and fixed a critical bug this way: opening Sidebar → Boardroom → "Boardroom Sessions" crashed the entire app with an uncaught `TypeError` inside React's own lazy-loading path, because `App.tsx`'s `lazy(() => import('./components/BoardroomView'))` was missing the `.then((mod) => ({ default: mod.BoardroomView }))` mapping that all 25 other lazy-loaded views in that file use — `BoardroomView.tsx` only has a named export, so React.lazy resolved `undefined` as the component type. Fixed and verified live (renders correctly, zero console errors); added two regression tests (`boardroomView.test.jsx`, `appLazyImports.test.js` — the latter statically checks all 26 lazy imports in `App.tsx`, confirming this was the only mismatch). Confirmed live: Coach Mode is real/functional (not a bug, just visually understated next to Settings/Theme); Agent Pairing and Ecosystem Maturity/Self-Development panels are real and render correctly but sit 2 clicks deep behind generic tab labels; Operator Dashboard has no sidebar entry at all — reachable only via a Dashboard quick-launch card, and shows nothing but a bare "Enable" gate when Operator Mode is off. No further code changes made for these UI-placement findings this pass — logged as a follow-up UX decision, not silently fixed or silently dropped. package.json version: 2.5.5. Targeted tests: 46/46 passing across `boardroomView`, `appLazyImports`, `ecosystemHub`, `agentPairingView`, `selfDevelopmentService`; `npx tsc --noEmit` clean. All docs updated same-pass. Previous entry (v2.5.4, 2026-07-02) — ALPHONSOTOTHEMOON Sprint 3 (skill-library-depth half): Miya, Hector, and Jose each moved from one catch-all skill pack to a real 5-pack taxonomy (Miya: video/image/UI-UX/brand-identity/motion-graphics; Hector: marketing/market-research/competitive-analysis/source-verification/RSS-monitoring; Jose: orchestration/task-routing/approval-gating/cross-agent-synthesis/pipeline-governance). `validateSkillPackAgainstContract()` in `agentContractService.ts` gained an optional `packId` parameter and a new `AGENT_SKILL_PACK_SCOPE_OVERRIDES` map so an individual pack can be scoped narrower than its owning agent's default boundary — fully backward compatible (no `packId` = original agent-wide behavior). `EcosystemHub.tsx`'s Skills tab now groups packs by owner agent instead of one flat list. Agent profiles (`miyaProfile.js`/`hectorProfile.js`/`joseProfile.js`) and their `skillFocus` strings updated to match. 12 new packs added (skill-pack count 11 → 23 `agent_skill`-category packs); `SKILL_WORKFLOW_GUIDANCE` extended with real guidance for all of them. Explicitly deferred, not forgotten: taxonomy depth for the remaining 6 agents, module-system convergence (`modules/` vs. skill packs), a full marketplace model, and the discoverability-audit half of Sprint 3 (Coach Mode et al. — still needs a live browser click-through). Targeted tests: 99/99 passing (`skillPackService`, `agentSkills`, `agentContractService`, `services/agentContract`) plus `ecosystemHub.test.jsx` 8/8; `npx tsc --noEmit` clean; ESLint clean. package.json version: 2.5.4. `docs/CHANGELOG.md`, `README.md`, `docs/ALPHONSO_GROUND_TRUTH.md`, and `ALPHONSOTOTHEMOON.md` updated same-pass. Previous entry (v2.5.3, 2026-07-02) — Fixed the auto-updater: `checkAppUpdate()` in `appUpdateService.ts` existed with 19 passing tests but was never called from `App.tsx`, and the Update button was a no-op; both wired now (boot check + `open_url` on click). Full in-app download+install+relaunch still needs `@tauri-apps/plugin-updater`/`plugin-process` — not installed, tracked as a follow-up, not silently dropped. Closed a connector registry gap: Ollama, Brave Search, Perplexity, Tavily, DeepSeek, n8n each had working credential UI/service but no `DEFAULT_CONNECTORS` entry — added all 6 (16 → 22). Corrected a stale claim that TypeScript component migration was "10 done, 63 .jsx remaining" — verified `src/components/` is actually 100% `.tsx` (114 files, 0 `.jsx`); real remaining TS gap is services (115 `.js`/16 `.ts`). Investigated a "Coach Mode feels forgotten" report — confirmed it's wired (reachable via main `Sidebar` + `OperatorDashboard`), not dead code; UI prominence unverified, no browser tool available this session. Seeded Sprint 3 (skill-library depth + discoverability audit), Sprint 4 (security hardening Batch 2 — adversarial pass), Sprint 5 (service-layer TS migration), Sprint 6 (runtime-hardening carryover) in `ALPHONSOTOTHEMOON.md`. Confirmed via `.github/workflows/release.yml` that installer releases are built entirely by CI on tag push (signed with a repo secret) — this dev machine correctly has no local signing key. TypeScript: 0 errors. Targeted tests: 183/183 passing. package.json version: 2.5.3. `docs/CHANGELOG.md`, `README.md`, and `docs/ALPHONSO_GROUND_TRUTH.md` updated same-pass. Previous entry (v2.5.2, 2026-07-02): ALPHONSOTOTHEMOON Sprint 2 — crash-recovery checkpoint, Discord connector, generic inbound webhook connector; connector count 14 → 16; found (documented, not fixed) a pre-existing `ConnectorSetupPanel.test.jsx` failure unrelated to any session change. Previous entry (v2.5.1, 2026-07-02): ALPHONSOTOTHEMOON Sprint 1 — SHALAUDE License v1.0 added, `validateSkillPackAgainstContract()` added, default skill packs added for all 9 agents, loop-guard/execution budget added to `runJoseCommandExecutionPipeline`. Full 218-file suite still cannot complete in one run on this dev machine — vitest worker-pool startup times out past ~170 files regardless of pool size; open environment item, not a code defect. Prior entry (v2.5.0, 2026-07-02): Security hardening (Batch 1) complete — SSRF blocking, PKCE OAuth, tauri-plugin-dialog, arboard clipboard, per-program arg allowlist, policyDslService wired, CSP narrowed; 218 files / 3,174+ tests passing; Rust 91 passed / 3 pre-existing failures unchanged; 35+ new components and 40+ new services added since v2.0.5 — see Do Not Duplicate table above._
