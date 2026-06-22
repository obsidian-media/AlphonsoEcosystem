<div align="center">

<img src="https://raw.githubusercontent.com/Thatisshayan/AlphonsoEcosystem/main/ALPHONSO_THUMBNAIL.webp" alt="Alphonso" width="180"/>

# Alphonso

> **v2.0.5** — Local-first AI desktop companion powered by Ollama

[![Version](https://img.shields.io/badge/version-2.0.6-blue)](https://github.com/Thatisshayan/AlphonsoEcosystem/releases/tag/v2.0.6)
[![Tests](https://img.shields.io/badge/tests-1621%2B%20passing-brightgreen)](https://github.com/Thatisshayan/AlphonsoEcosystem)
[![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-orange)](https://github.com/Thatisshayan/AlphonsoEcosystem/blob/main/LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-blue)](https://github.com/Thatisshayan/AlphonsoEcosystem/releases)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%20v2-24C8D8)](https://tauri.app)

**Alphonso is a privacy-first desktop AI companion that runs entirely on your machine.**  
It orchestrates 9 specialized agents, connects to 14 external services, and uses Ollama for local LLM inference — keeping your data off the cloud, always.

**Why Alphonso?** — The only desktop AI with role-specialized agents (not just a single chat model), fail-closed security gates on every action, and 14 policy-enforced connectors — all local-first. See [Comparison](docs/COMPARISON.md).

[**Download v2.0.6**](https://github.com/Thatisshayan/AlphonsoEcosystem/releases/tag/v2.0.6) · [Docs](https://github.com/Thatisshayan/AlphonsoEcosystem/blob/main/docs) · [Architecture](https://github.com/Thatisshayan/AlphonsoEcosystem/blob/main/ARCHITECTURE.md) · [Pricing](docs/PRICING.md) · [Comparison](docs/COMPARISON.md) · [obsidianmedia.online](https://obsidianmedia.online)

</div>

---

## What's New in v2.0.6

- **CI rustfmt fix** — `src-tauri/rustfmt.toml` added; all 19 Rust source files formatted to 2-space standard; `cargo fmt --check` now passes in CI
- **Documentation accuracy pass** — all test counts, version numbers, and CI workflow references corrected across 6 doc files
- **Mobile companion sprint plan** — `docs/MOBILE_COMPANION_SPRINT.md` — full 5-phase iOS companion implementation guide with complete Rust + Swift code templates ready for parallel development

---

## Features

- **9 Enhanced Agents** — Alphonso, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, Nova — each with defined roles, permission contracts, and enforced boundaries. Now with GitHub and Slack capabilities.
- **14 Connectors** — Ollama, Telegram, WhatsApp Cloud, YouTube, GitHub, Slack, Claude API, ChatGPT, Notion, ClickUp, Stable Diffusion WebUI, ComfyUI, Brave Search, Qwen/DashScope
- **1,000+ Integrations** — Composio integration gives access to GitHub, Slack, Jira, Salesforce, Linear, and 1,000+ more services — all policy-gated
- **Local LLM First** — Ollama with model switching (`llama3.2:3b` default); no prompt leaves your device for core operations
- **Fail-Closed Policy Gate** — every outbound action runs through `policyEnforcementService.ts`; if credentials are missing or the action is ambiguous it is blocked, not allowed
- **Durable Orchestration** — queue with state transitions (`queued → approval_required → approved → in_progress → completed`), dead-letter replay, and approval workflows
- **10 Structured Workflows** — Marketing Ops, Social Media, Content Production, Learning, Startup/Product Dev, Opportunity Discovery, Construction Ops, Knowledge Preservation, Content Repurposing, Automation Governance
- **SQLite Memory** — durable memory with governance metadata (owner, sensitivity, retention, privacy policy) in WAL mode
- **Plugin System** — sandboxed plugin runtime + local marketplace
- **Screen Intelligence** — `screenIntelligenceService.js` for on-screen context awareness
- **Voice Service** — `voiceService.js` for voice interaction
- **Desktop Native** — Tauri v2 (Rust 1.77) + React 18 + Vite 5; ~6.8MB NSIS/MSI installer for Windows

---

## Installation

### Download the Installer (Windows)

1. Go to [Releases](https://github.com/Thatisshayan/AlphonsoEcosystem/releases/tag/v2.0.5)
1. Download `Alphonso_2.0.6_x64-setup.exe`
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
│  │  9 Agents     │  │  82 UI           │  │  130 Services      │  │
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
│  │  lib.rs ~1,584 lines · 82 Tauri commands · 18 modules    │    │
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
npm run test           # 1,621+ tests across 112 files
npm run test:coverage  # Coverage report (~35%+; threshold 20%)
npm run build          # Production build (OXC compiler)
npm run verify:app     # lint + test + build in one command
npm run test:e2e       # Playwright smoke tests (needs dev server + Ollama)
```

### Rust Backend

```bash
cd src-tauri
cargo check                    # Verify compilation
cargo test                     # 14 Rust unit tests (18 modules)
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
| **v2.0.6** | June 22, 2026 | CI rustfmt fix, documentation accuracy pass, mobile companion sprint plan |
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

Before writing any new service, component, or feature, check `CLAUDE.md` for the "Do Not Duplicate" table — 130 services already exist.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting policy and scope.  
Security contact: [security@obsidianmedia.online](mailto:security@obsidianmedia.online)

## License

Business Source License 1.1 (BSL 1.1) — see [LICENSE](LICENSE) for details.  
Change date: four years from release. Personal use is free. Commercial use requires a license.

---

<div align="center">

Built by [Obsidian Media](https://obsidianmedia.online) · Ontario, Canada  
**Your AI team. Your machine. Your rules.**

</div>
