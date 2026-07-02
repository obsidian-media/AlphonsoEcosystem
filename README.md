<div align="center">

<img src="https://raw.githubusercontent.com/Thatisshayan/AlphonsoEcosystem/main/ALPHONSO_THUMBNAIL.webp" alt="Alphonso" width="180"/>

# Alphonso

> **v2.5.3** — Local-first AI desktop companion with 9 agents, 22 connectors, iOS companion app, Agent OS module system, Boardroom multi-agent sessions, and daily scheduler presets — powered by Ollama

[![Version](https://img.shields.io/badge/version-2.5.3-blue)](https://github.com/Thatisshayan/AlphonsoEcosystem/releases)
[![Tests](https://img.shields.io/badge/tests-3167%20passing-brightgreen)](https://github.com/Thatisshayan/AlphonsoEcosystem)
[![License: All Rights Reserved](https://img.shields.io/badge/License-SHALAUDE%20v1.0-red)](https://github.com/Thatisshayan/AlphonsoEcosystem/blob/main/LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-blue)](https://github.com/Thatisshayan/AlphonsoEcosystem/releases)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%20v2-24C8D8)](https://tauri.app)

**Alphonso is a privacy-first desktop AI companion that runs entirely on your machine.**  
It orchestrates 9 specialized agents, connects to 22 external services, and uses Ollama for local LLM inference — keeping your data off the cloud, always.

**Why Alphonso?** — The only desktop AI with role-specialized agents (not just a single chat model), fail-closed security gates on every action, and 22 policy-enforced connectors — all local-first. See [Comparison](docs/COMPARISON.md).

[**Download v2.4.4**](https://github.com/Thatisshayan/AlphonsoEcosystem/releases/tag/v2.4.4) · [Docs](https://github.com/Thatisshayan/AlphonsoEcosystem/blob/main/docs) · [Architecture](https://github.com/Thatisshayan/AlphonsoEcosystem/blob/main/ARCHITECTURE.md) · [Pricing](docs/PRICING.md) · [Comparison](docs/COMPARISON.md) · [obsidianmedia.online](https://obsidianmedia.online)

</div>

---

## What's New in v2.5.3

- **Fixed the auto-updater** — the app never actually checked for updates: `appUpdateService.checkAppUpdate()` existed and was tested but was never called anywhere, and the "Update & Restart" button was a no-op. Both are now wired: Alphonso checks for updates on boot and the button opens the release download. (Full one-click in-app download+install+relaunch needs `@tauri-apps/plugin-updater` — tracked as a follow-up, not yet installed.)
- **Connector registry completeness** — Ollama, Brave Search, Perplexity, Tavily, DeepSeek, and n8n each had working credential UI and services but were missing from the central connector registry. Added all 6. Connector count: 16 → 22.
- Sprint 3–6 roadmap seeded in `ALPHONSOTOTHEMOON.md`: agent skill-library depth, security hardening (attacker-resistance) pass, service-layer TypeScript migration, and a feature-discoverability audit.

## What's New in v2.5.2

- **Crash-recovery checkpoint** — on boot, Alphonso now recovers any task left stuck in-flight by a prior crash or forced restart instead of leaving it silently orphaned (`recoverInterruptedExecutions()` in `orchestrationQueueService.ts`).
- **Discord connector** — send/edit/delete messages, list channels, read history, react, and webhook posting via the Discord REST API. Credential setup in Settings → Connectors → Discord.
- **Generic inbound webhook connector** — deploy `gateway/generic-webhook/` once and any external service (Stripe, Zapier, a custom script) can push events into Alphonso without a bespoke connector. See `gateway/generic-webhook/README.md`.
- Connector count: 16.

## What's New in v2.5.1

- **SHALAUDE License v1.0** — project now carries an explicit all-rights-reserved, source-visible license (`LICENSE`). Replaces the prior unlicensed/ambiguous public-repo state.
- **`ALPHONSOTOTHEMOON.md`** — roadmap built from a structural comparison against OpenFang and LibreFang's agent-orchestration patterns; tracks what's being adopted, what's deliberately rejected, and sprint-by-sprint progress.
- **Skill pack ↔ agent contract validation** — `validateSkillPackAgainstContract()` in `agentContractService.ts` now blocks a skill pack from granting an agent permissions beyond its execution contract.
- **Default skill packs for all 9 agents** — Alphonso, Marcus, Echo, Sentinel, and Nova each now carry a default `agent_skill` pack (previously only Jose/Hector/Miya/Maria did).
- **Pipeline loop-guard / execution budget** — `runJoseCommandExecutionPipeline` now hard-stops at 50 assignments or 5 minutes wall-clock per run, preventing a malformed command graph or stuck agent from spinning unbounded.

## What's New in v2.4.4

- **iOS Companion App** — Native Swift app for iPhone/iPad. Pairs to the Alphonso desktop via mDNS discovery + ed25519-signed WebSocket. Sends voice commands, approves pending tasks, and receives agent reply notifications — all on-device, no cloud relay. Includes Xcode project, TestFlight upload workflow, and Windows-native signing scripts.
- **69 Rust unit tests across 25 modules** — 104 Tauri commands across the modularised `src-tauri/src/` (up from 18 modules / 82 commands).
- **2,151 tests across 159 test files** — all passing. 0 TypeScript errors. 0 ESLint warnings. Cargo clippy clean.

## What's New in v2.4.2

- **TypeScript Migration Complete** — 94 `.tsx` components across `src/components/`; 20 `.jsx` remaining in subdirectories. Full prop interfaces, typed hooks, and zero typecheck errors.
- **10 Pre-Merge Bugs Fixed** — Orchestrator code review caught and patched: RSS retry abort signal, cron weekday scheduling, scheduler handler stacking, voice watchdog double-toast + backoff cap, A2A message ring overflow, notification persistence wired up, `createSchedule` error surfaced, A2A failed status reachable, `installModule` Tauri CSP fix, bridge `/modules` route added.
- **Dependency Updates** — Rust: rand 0.9.4, mdns-sd 0.20.0, tokio-tungstenite 0.29.0. npm: jsdom 29.1.1. All compile and test clean.
- **158 test files / 2147 tests** — all passing. 0 TypeScript errors. 0 ESLint warnings. Cargo clippy clean.

## What's New in v2.4.1

- **37-task Bug & Gap Closure Sprint** — Voice OS health endpoint, Whisper post-install verification, Docker/Node prereq detection, AudioCraft Python version check, IPC rate limiting (10 calls/min token bucket), WhatsApp HMAC verification, MCP server auth, bridge 1MB body limit, Hector briefing empty-source fallback, Nova insight threshold configurable, agent performance CSV/JSON export, dead-letter queue section, n8n timeouts, ChromaDB error surface.

## What's New in v2.4.0

- **Agent OS Module System** — New pluggable module architecture (`modules/` directory, `moduleRegistryService`, `runtimeApiService`). Install, enable, and run agent modules with a standardized TOML manifest.
- **Boardroom Multi-Agent Sessions** — Convene all 9 agents on a topic, collect responses, get a Hector research briefing, run a Maria risk assessment, and distribute via Marcus — all in one session.
- **Policy DSL** — New `policyDslService` with `policy.yaml` for module-level policy evaluation (separate from the existing `policyEnforcementService`).
- **A2A Protocol** — `a2aProtocolService` for structured agent-to-agent task delegation via the agent bus.
- **5 Daily Scheduler Presets** — Nova daily scan, Sentinel daily summary, Echo nightly consolidation, Hector morning briefing, Maria weekly audit — all wired to their respective agent services.
- **Dark/Light Mode Toggle** — TopBar sun/moon button; preference persisted in localStorage.
- **Keyboard Shortcuts Modal** — Ctrl+? opens a shortcut reference; Ctrl+J/B/R for quick navigation.
- **Agent Performance Export** — CSV and JSON export for orchestration receipts from the performance view.
- **Observability Hardening** — Hector RSS retry with exponential backoff, n8n connector timeouts, ChromaDB write error surface, unified memory namespace eviction, Voice OS health watchdog.
- **/boardroom Telegram command** — Run a multi-agent boardroom session directly from Telegram.
- **Bundle Size CI Check** — GitHub Actions now enforces 10MB total / 2MB per-chunk limits.

## What's New in v2.3.3

- **Voice OS Install Fixed** — Critical: pip packages for Voice OS were silently skipped because `requirements_file` path was relative to the wrong directory. Now uses `pip_packages` list directly — all packages install correctly.
- **Voice OS Start Fixed** — `runtime_start_tool` now resolves `voice/backend/main.py` from the app resource directory (`app.path().resource_dir()`), matching `voice_sidecar.rs`. Jarvis mic button in Chat now works with Desktop app.
- **Agent Pairing View Mounted** — `AgentPairingView.jsx` (define agent-to-agent trigger pairings) was fully built but never accessible. Now mounted as a "Pairings" tab in the All Agents page.
- **Settings Now Persist** — Critical fix: all settings (model, workspace root, theme, output folder, etc.) now properly save to localStorage on every change. Previously only survived the session.
- **Boardroom Added to Sidebar** — The Boardroom (MissionRoom) is now accessible directly from the sidebar under Agents.
- **All Agents Page — 6-Tab Layout** — Tab layout now includes Pairings tab alongside Overview, Queue, Skills, Workflows, and Advanced.
- **Notification Watermark Fixed** — The notification center no longer renders a ghost empty-state div when there are no notifications.
- **Composio Visible in Connectors** — The Connectors page now shows a Composio callout with navigation to Settings → Connectors for API key setup.
- **Connector Architecture Banner** — A clear info banner explains that "Connected" means credentials are stored — agents use them automatically when you ask them to act. No manual connector calls needed.
- **WebView2 Bootstrapper** — The NSIS installer now downloads WebView2 at install time if not already present (fixes black-window-then-disappear on fresh Windows installs).
- **Dead Letter Queue Accessible** — `DeadLetterQueueView` now mounted as a tab in Automation page.
- **Runtime Page Polish** — Repo URL shown on each tool card; web-mode handled cleanly; category filters expanded; Voice OS quick-start callout when not yet installed.

## What's New in v2.3.2

- **Perplexity Connector** — Added 15th connector: `perplexityConnector.js` as a tier-2 Hector research fallback.
- **UI Polish v2** — Design system tokens + Framer Motion applied across all 6 pages.

## What's New in v2.3.0–v2.3.1

- **n8n Workflow Automation** — `n8nConnector.js` + Runtime Hub ToolDef + Marcus distribution target + ConnectorSetupPanel credential section.
- **Jose Scheduled Tasks** — `joseSchedulerService.js` + AutomationView Schedules tab + App.tsx background scheduler wiring.
- **Echo File System Watcher** — `echoFileWatcherService.js` polls `watch_inbox_poll` Tauri command every 30s. Config card in Settings.
- **MCP Bridge Live Responses** — `bridge/server.js` calls Ollama `/api/chat` for live responses; `alphonso_get_status` checks `/api/tags`.
- **21 Telegram Commands** — `/research`, `/memory`, `/receipts`, `/read` added to telegramCompanionService (total: 21 commands).

## What's New in v2.2.4

- **Navigation Consolidated** — Activity moved to a tab inside Runtimes (Runtimes / Activity). Knowledge/Files moved to a tab inside Settings. Both removed from the main sidebar to reduce clutter.
- **AgentDock in Right Panel** — The agent mascot deck is now embedded in the RightPanel Agents tab (inline, full-width, no floating). Live agent companions passed directly from App state.
- **Coach Mode Actually Works** — Clicking Coach Mode now toggles the state and shows a toast confirmation, even in web mode (where the Tauri native window isn't available).
- **ACC Bridge Simplified** — Content page's ACC Bridge section replaced with a compact 2-line status indicator. Full config is in Settings → Connectors where it belongs.
- **Automation Operations Toggleable** — Workflow operations now have Enable/Active buttons. Previously read-only status badges.
- **Telegram: 17 Commands** — Added `/ping`, `/agents`, `/nova`, `/scan` for a total of 17 bot commands.
- **Global Toast Events** — `ToastProvider` now listens to `window.alphonso:toast` so services and contexts outside the React tree can show notifications.

## What's New in v2.2.3-patch2

- **Jarvis Voice Button Wired** — The WebSocket voice pipeline (`useJarvisVoice`) is now a live mic button in the chat input bar. Pulses while listening, shows active agent in tooltip, and auto-populates the input with the transcript. Requires the FastAPI voice server (Runtime Manager → Voice OS).
- **Agents Tab in Right Panel** — The right sidebar now has three tabs: **System | Audit | Agents**. The Agents tab shows live pulsing agent status badges without leaving the chat view.
- **Compact Allowlist Panel** — `SentinelAllowlistPanel` restyled to fit the sidebar without overflowing. Inline form, abbreviated controls, scrollable entry list.
- **Boot Crashes Fixed** — Three `invoke()` calls that silently returned `null` (not threw) were crashing on startup. Fixed with `?? []`/`?? {}` guards.
- **Browse Buttons Fixed in Web Mode** — Output Folder and ComfyUI Dir Browse buttons now fall back to a hidden `<input webkitdirectory>` picker when Tauri's `pick_folder` is unavailable.
- **Coach Mode Fixed in Web Mode** — Coach window button no longer freezes the app outside the Tauri desktop runtime.

## What's New in v2.2.3

- **Chat UX — All Results in One Place** — Jose pipeline results (agent receipts, approval buttons, Nova insights) now appear inline in the chat thread, directly below the last assistant message. No more hunting through floating panels below the chat.
- **Auto-Scroll Fixed** — Chat now scrolls to new messages automatically by default. Previously required opt-in via settings.
- **Connector Verification Fixed** — Credentials saved in Settings → Connectors are now verified correctly. Previously, verification checked OS environment variables (always failing for UI-entered credentials). Now checks the UI credential store. Connectors also auto-verify immediately after you save.

## What's New in v2.2.0+

- **Voice OS Pipeline** — Full real-time STT→LLM→TTS pipeline as a Python FastAPI microservice (`voice/`). Launched as a Tauri sidecar from the Runtime Manager. Uses faster-whisper for transcription, Ollama for agent-aware responses, and Piper for synthesis. Barge-in cancellation and conversation history included.
- **AudioWorklet Voice Hook** — `useJarvisVoice.ts` uses the modern `AudioWorklet` API (replaces deprecated `ScriptProcessor`). Exports `start`/`stop`/`reset`/`state`/`transcript`/`reply`/`activeAgent`/`error`/`isConnected`.
- **OKLCH Design System** — All UI colors migrated to perceptually-uniform `oklch()` syntax in `src/styles/tokens.css`. No hex values.
- **Framer Motion** — `src/lib/motion.ts` with 10 named animation presets. Chat messages animate in/out with `AnimatePresence` + `motion.div`.
- **Premium UI/UX** — Glassmorphism chat input, pill/glow sidebar active state, gradient TopBar separator, collapsed sidebar tooltips, full token sweep across all components.
- **Test coverage** — 144 test files / 1930+ tests (~38%+ coverage). 5 new pytest files for Voice OS backend.

---

## Features

- **9 Enhanced Agents** — Alphonso, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, Nova — each with defined roles, permission contracts, and enforced boundaries. Now with GitHub and Slack capabilities.
- **15 Connectors** — Ollama, Telegram, WhatsApp Cloud, YouTube, GitHub, Slack, Claude API, ChatGPT, Notion, ClickUp, Stable Diffusion WebUI, ComfyUI, Brave Search, Qwen/DashScope, Perplexity
- **1,000+ Integrations** — Composio integration gives access to GitHub, Slack, Jira, Salesforce, Linear, and 1,000+ more services — all policy-gated
- **Local LLM First** — Ollama with model switching (`llama3.2:3b` default); no prompt leaves your device for core operations
- **Fail-Closed Policy Gate** — every outbound action runs through `policyEnforcementService.ts`; if credentials are missing or the action is ambiguous it is blocked, not allowed
- **Durable Orchestration** — queue with state transitions (`queued → approval_required → approved → in_progress → completed`), dead-letter replay, and approval workflows
- **10 Structured Workflows** — Marketing Ops, Social Media, Content Production, Learning, Startup/Product Dev, Opportunity Discovery, Construction Ops, Knowledge Preservation, Content Repurposing, Automation Governance
- **SQLite Memory** — durable memory with governance metadata (owner, sensitivity, retention, privacy policy) in WAL mode
- **Plugin System** — sandboxed plugin runtime + local marketplace
- **Screen Intelligence** — `screenIntelligenceService.js` for on-screen context awareness
- **Voice OS** — Real-time STT→LLM→TTS pipeline (`voice/`) with faster-whisper, Ollama, and Piper. Launched from Runtime Manager as a Tauri sidecar. AudioWorklet-based `useJarvisVoice` hook with barge-in and conversation history.
- **Premium Animated UI** — OKLCH design token system, Framer Motion animations (`AnimatePresence` on chat messages), glassmorphism input, sidebar tooltips.
- **Desktop Native** — Tauri v2 (Rust 1.77) + React 18 + Vite 5; ~6.8MB NSIS/MSI installer for Windows

---

## Installation

### Download the Installer (Windows)

1. Go to [Releases](https://github.com/Thatisshayan/AlphonsoEcosystem/releases)
1. Download the latest `Alphonso_x64-setup.exe`
1. Run the installer (per-user, no admin required)
1. Launch Alphonso — it auto-detects Ollama if running

**Auto-Update:** If you have a previous version installed, Alphonso will prompt you to update automatically via the Tauri updater (ed25519-signed manifests).

### Prerequisites

| Dependency | Version | Purpose |
|-----------|---------------|---------------------------|
| **Node.js** | 20+ | Frontend dev server & build |
| **npm** | 10+ | Package management |
| **Rust** | 1.77+ (`cargo`) | Tauri desktop backend |
| **Ollama** | Latest | Local LLM engine |
| **Git** | Any | Version control |

### Build from Source

```bash
git clone https://github.com/Thatisshayan/AlphonsoEcosystem.git
cd AlphonsoEcosystem
npm install

# Install Ollama and pull a model
# https://ollama.com — then:
ollama pull llama3.2:3b

# Start development
npm run dev          # Web-only mode at http://localhost:5173
npm run desktop:dev  # Full Tauri dev window (requires Rust)
```

### Production Build

```bash
npm run build          # Web build (dist/)
npm run tauri build    # Native installer (src-tauri/target/release/bundle/)
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                  React 18 (Vite 5, Tailwind 3)                   │
│                                                                  │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────────┐  │
│  │  9 Agents     │  │  114 UI          │  │  131+ Services     │  │
│  │  (profiles,   │  │  Components     │  │  (policy-gated,    │  │
│  │   contracts)  │  │  14 Hooks       │  │   orchestrated)    │  │
│  └──────┬────────┘  └─────────────────┘  └──────────┬─────────┘  │
│         │                                            │            │
│         └────────────────┬───────────────────────────┘            │
│                          ▼                                       │
│              ┌────────────────────────┐                           │
│              │  policyEnforcementService.ts  ← fail-closed gate  │
│              │  licenseService.ts            ← tier validation   │
│              │  agentContractService.ts      ← per-agent gates   │
│              │  parallelExecutionService.ts  ← concurrency       │
│              │  cacheService.ts              ← TTL/LRU cache     │
│              └──────────────┬─────────────────────────────────── │
│                             │                                     │
├─────────────────────────────┼───────────────────────────────────┤
│           Tauri v2 (Rust 1.77) — IPC Bridge                      │
│                             ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  lib.rs ~1,975 lines · 104 Tauri commands · 25 modules   │    │
│  │  ├── kv_store.rs          SQLite KV store (WAL mode)     │    │
│  │  ├── policy_gate.rs       Policy enforcement backend     │    │
│  │  ├── audit_log.rs         Immutable audit chain          │    │
│  │  ├── ollama.rs            Ollama inference backend       │    │
│  │  ├── memory_store.rs      Memory persistence             │    │
│  │  ├── telegram.rs          Telegram connector             │    │
│  │  ├── youtube.rs           YouTube upload                 │    │
│  │  ├── whatsapp_webhook.rs  WhatsApp webhook (HMAC-safe)   │    │
│  │  ├── connector_commands.rs  14 commands (GitHub + Slack) │    │
│  │  ├── native_proof.rs      Native proof engine            │    │
│  │  ├── plugin_runtime.rs    Plugin runtime                 │    │
│  │  ├── meta_publish.rs      Meta/Instagram publishing      │    │
│  │  ├── search.rs            Research search                │    │
│  │  ├── workspace.rs         Workspace file ops (path guard)│    │
│  │  ├── runway.rs            Video generation               │    │
│  │  └── utils.rs             Shared utilities               │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  SQLite (WAL) · memory_records · kv_store · runtime_ledger│    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### Key Architecture Rules

- **Fail-closed**: Every outbound connector call runs through `policyEnforcementService.ts` — if credentials are missing or the action is ambiguous, it is blocked, never allowed
- **Agent contracts**: `agentContractService.ts` enforces per-agent allowed/blocked action prefixes on every packet before execution
- **License gates**: `licenseService.ts` validates Free/Pro/Enterprise tier before any premium connector fires
- **Durable queue**: `orchestrationQueueService.js` manages state transitions, dead-letter replay, and approval workflows
- **Parallel execution**: `parallelExecutionService.ts` handles concurrency control and retry logic
- **Memory caching**: `cacheService.ts` provides TTL and LRU eviction for global, connector, and agent caches
- **SQLite in WAL mode**: `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;` for concurrent read/write

---

## The 9 Agents

| Agent | Role | Key Constraint | v2.0.0 Capabilities |
|------------|------------------------------------------------------|-----------------------------------------------|--------------------------------------------------------|
| **Alphonso** | Local operator — execution, verification, packaging | General execution | GitHub code search, issue/PR management, repo analysis |
| **Jose** | Orchestrator — intake, routing, merge, confirm, report | Cannot bypass high-risk restrictions | Parallel execution coordination |
| **Hector** | Research + citations, source scan | No terminal/filesystem/posting/purchase actions | GitHub research, open source analysis, trend discovery |
| **Miya** | Creative — strategy, script, storyboard, export | No unapproved publishing or system commands | Content Catalyst pipeline |
| **Maria** | Governance, audit, risk, approval review | No destructive execution | Enhanced compliance checks |
| **Marcus** | Approved distribution execution | Only executes under approved paths | GitHub releases, Slack notifications, team communication |
| **Echo** | Memory historian and archival | Knowledge preservation only | Improved retrieval speed |
| **Sentinel** | Security monitoring, automation safety | Safety checks only, no destructive execution | Optimized policy checks |
| **Nova** | Scoring, analysis, opportunity prioritization | Analysis only | Cached analytics |

All agents are registered in `src/agents/agentRegistry.js`, enforced by `agentContractService.ts`, and communicate via `agentBusService.js`.

---

## Connectors

| Connector | Status | Env Var |
|--------------|-----------------------|----------------------|
| Ollama | Built-in | None (local) |
| Telegram | Production | `TELEGRAM_BOT_TOKEN` |
| WhatsApp Cloud | Staging | `WHATSAPP_CLOUD_TOKEN` |
| Claude API | Production | `ANTHROPIC_API_KEY` |
| ChatGPT | Production | `OPENAI_API_KEY` |
| **GitHub** | **Production (v2.0.0)** | `GITHUB_TOKEN` |
| **Slack** | **Production (v2.0.0)** | `SLACK_BOT_TOKEN` |
| YouTube | Ready | `YOUTUBE_API_KEY` |
| Notion | Ready | `NOTION_API_KEY` |
| ClickUp | Ready | `CLICKUP_API_KEY` |
| SD WebUI | Ready | `SD_WEBUI_URL` |
| ComfyUI | Ready | `COMFYUI_URL` |
| Brave Search | Ready | `BRAVE_SEARCH_API_KEY` |
| Qwen/DashScope | Ready | `DASHSCOPE_API_KEY` |

All connectors are policy-gated through `connectorRegistryService.js`. See [docs/CONNECTORS.md](docs/CONNECTORS.md) for full setup instructions.

---

## License Tiers

| Tier | Connectors | Price |
|--------------|--------------------------------------------------|------------|
| **Free** | Ollama (local), Brave Search, Telegram, WhatsApp Cloud, YouTube | Free forever |
| **Pro** | + Claude, ChatGPT, GitHub, Slack, Notion, ClickUp, SD WebUI, ComfyUI | $12/mo ($99/yr) |
| **Enterprise** | All 14 connectors + multi-desktop, audit export, priority support | $49/mo ($499/yr) |
| **One-Time** | Same as Pro — perpetual license, 1 year updates | $199 |

See [docs/PRICING.md](docs/PRICING.md) for full tier breakdown and FAQ.

---

## Development

```bash
npm run dev            # Vite dev server (port 5173)
npm run lint           # ESLint on src/
npm run test           # 2,151 tests across 159 files
npm run test:coverage  # Coverage report (~38%+; threshold 35%)
npm run build          # Production build (OXC compiler)
npm run verify:app     # lint + typecheck + test + build in one command
npm run test:e2e       # Playwright smoke tests (needs dev server + Ollama)
```

### Rust Backend

```bash
cd src-tauri
cargo check                    # Verify compilation
cargo test                     # 69 Rust unit tests across 25 modules
cargo clippy -- -D warnings    # Lint (CI enforces zero warnings)
```

---

## Documentation

| Document | Description |
|---------------------------------------------|----------------------------------------------|
| [GETTING_STARTED.md](docs/GETTING_STARTED.md) | Quick setup guide |
| [AGENT_GUIDE.md](docs/AGENT_GUIDE.md) | What each agent does and when to use them |
| [CONNECTORS.md](docs/CONNECTORS.md) | Setup for all 14 connectors (UI-based credential entry) |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues and fixes |
| [USER_MANUAL.md](docs/USER_MANUAL.md) | Full feature reference (v2.0.0) |
| [RELEASE.md](docs/RELEASE.md) | Auto-updater signing and release pipeline |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design and technical details |
| [AGENTS.md](AGENTS.md) | Agent context and directory structure |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting policy |
| [COMPARISON.md](docs/COMPARISON.md) | Feature comparison vs 8 competitors |
| [PRICING.md](docs/PRICING.md) | Free/Pro/Enterprise/One-Time pricing tiers |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, workflow, code style, and PR guidelines |

---

## Release History

| Version | Date | Highlights |
|----------|-------------|-----------------------------------------------------------------------------|
| **v2.4.4** | June 27, 2026 | iOS companion app (Swift, mDNS, ed25519-signed WebSocket, TestFlight workflow); 104 Tauri commands / 25 modules; 2,151 tests / 159 files |
| v2.4.2 | June 27, 2026 | TypeScript migration (94 .tsx); 10 pre-merge bugs patched; rand/mdns-sd/tokio-tungstenite/jsdom dep bumps; 2147 tests / 158 files |
| **v2.4.1** | June 27, 2026 | 37-task bug & gap sprint: Voice OS health, IPC rate limit, MCP auth, bridge hardening, Nova threshold, agent perf export, DLQ section |
| **v2.4.0** | June 27, 2026 | Agent OS module system, Boardroom sessions, A2A protocol, Policy DSL, 5 scheduler presets, dark/light mode, keyboard shortcuts |
| **v2.3.3** | June 26, 2026 | n8n connector, Jose scheduled tasks, Echo file watcher, MCP bridge live responses, 21 Telegram commands |
| **v2.2.4** | June 25, 2026 | Navigation restructure: Activity→Runtimes tab, Knowledge→Settings tab; AgentDock embedded in RightPanel; coach mode fix + toast; ACC Bridge simplified; automation ops toggleable; Telegram 17 commands |
| v2.2.3-patch2 | June 25, 2026 | Jarvis voice button wired in ChatView; Agents tab in RightPanel (3 tabs); compact SentinelAllowlistPanel; boot null-guard fixes; Browse fallbacks; Coach mode fix in web mode |
| v2.2.3-patch1 | June 25, 2026 | Full 16-bug audit: stale state fix, TS types, production voice path, code splitting, O(1) chat render, live connector status, SQLite delete, audit memoization |
| v2.2.3 | June 24, 2026 | Chat UX consolidation: Jose pipeline/approval/Nova results inline in chat; connector verification fixed (UI credential store); auto-scroll fixed |
| v2.2.2 | June 24, 2026 | Voice OS pipeline + OKLCH UI/UX overhaul — 144 test files, 1,930+ tests |
| v2.0.8 | June 22, 2026 | Sprint Next-50: 5 resilience services, 5 new UI panels, 8 test files, ChatView enhancements, 10 TSX components, 1,737+ tests, mobile companion Phase 1–2 (Rust WebSocket server + React pairing UI with QR + mDNS) |
| v2.0.6 | June 22, 2026 | CI rustfmt fix, documentation accuracy pass, mobile companion sprint plan executed (Phase 1–2 complete) |
| v2.0.5 | June 21, 2026 | All 9 agent runtimes, Sprint Next-10 complete, 112 test files, 1,621+ tests, coverage ~35%+, TypeScript migration (5 components), SQLite dual-write |
| v2.0.2 | June 21, 2026 | WhatsApp Cloud end-to-end, auto-updater operational, 1,100 tests |
| v1.0.3 | June 15, 2026 | Installer update |
| v1.0.2 | June 15, 2026 | WebView2 zombie process fix, boot optimizations |
| v1.0.1 | June 15, 2026 | Stability fixes |
| v1.0.0 | June 12, 2026 | Public release — fixed infinite re-render loop, auto-update keys |
| v0.3.0 | June 9, 2026 | Major refactor — lib.rs modularization, streaming, security hardening |
| v0.1.1 | June 4, 2026 | Initial installer release |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, workflow, code style, and PR guidelines.

Before writing any new service, component, or feature, check `CLAUDE.md` for the "Do Not Duplicate" table — 162 services already exist.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting policy and scope.  
Security contact: [security@obsidianmedia.online](mailto:security@obsidianmedia.online)

## License

SHALAUDE License v1.0 — All Rights Reserved, source-visible. See [LICENSE](LICENSE) for details.  
No use, copy, modification, or distribution is permitted without prior written permission from the copyright holder. This is not an OSI-approved open-source license.

---

<div align="center">

Built by [Obsidian Media](https://obsidianmedia.online) · Ontario, Canada  
**Your AI team. Your machine. Your rules.**

</div>
