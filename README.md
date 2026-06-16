# Alphonso

> Local-first AI desktop companion powered by Ollama — **v1.0.3**

[![CI](https://github.com/AlphonsoEcosystem/local-agent-ui-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/AlphonsoEcosystem/local-agent-ui-v2/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Tests](https://img.shields.io/badge/tests-978%20passing-brightgreen)
![Version](https://img.shields.io/badge/version-1.0.3-blue)

Alphonso is a privacy-first desktop AI assistant that runs entirely on your machine. It orchestrates 9 specialized agents, connects to 11 external services, and uses Ollama for local LLM inference — keeping your data off the cloud.

## Features

- **9 Agent System** — Alphonso, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, Nova — each with defined roles, permissions, and contracts
- **11 Connectors** — Telegram, WhatsApp Cloud, YouTube, Claude, ChatGPT, Notion, ClickUp, Stable Diffusion WebUI, ComfyUI, Brave Search, Ollama
- **Local LLM** — Ollama integration with model switching (`llama3.2:3b` default)
- **Policy Enforcement** — Fail-closed gate for all outbound actions; per-agent permission contracts
- **Durable Orchestration** — Queue with state transitions, dead-letter replay, and approval workflows
- **Memory** — SQLite-backed durable memory with governance metadata and retention policies
- **Desktop Native** — Tauri v2 (Rust backend) + React 18 frontend; NSIS/MSI installers
- **978 Unit Tests** — 73 test files, all passing; 27.97% code coverage

## Documentation

- [Getting Started](docs/GETTING_STARTED.md) — Quick setup guide
- [Agent Guide](docs/AGENT_GUIDE.md) — What each agent does and when to use them
- [Connectors](docs/CONNECTORS.md) — Setup for all 11 external integrations
- [Troubleshooting](docs/TROUBLESHOOTING.md) — Common issues and fixes
- [User Manual](docs/USER_MANUAL.md) — Full feature reference
- [Architecture](ARCHITECTURE.md) — System design and technical details

## Installation

### Prerequisites

| Dependency | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 20+ | Frontend dev server & build |
| **npm** | 10+ | Package management |
| **Rust** | 1.77+ (`cargo`) | Tauri desktop backend |
| **Ollama** | Latest | Local LLM engine |
| **Git** | Any | Version control |

### Desktop App (Windows)

```bash
git clone https://github.com/AlphonsoEcosystem/local-agent-ui-v2.git
cd local-agent-ui-v2
npm install

# Install Ollama and pull a model
# https://ollama.com — then:
ollama pull llama3.2:3b

# Start development
npm run dev          # Web-only mode at http://localhost:5173

# Or full native desktop
npm run desktop:dev  # Tauri dev window
```

### Web-Only Mode

```bash
npm install
npm run dev          # http://localhost:5173
```

### Production Build

```bash
npm run build                    # Web build (dist/)
npm run tauri build              # Native installer (src-tauri/target/release/bundle/)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    React 18 (Vite 5, Tailwind 3)                │
│                                                                 │
│   ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│   │  9 Agents    │  │ 76+ UI       │  │ 123 Services         │  │
│   │ (profiles,   │  │ Components   │  │ (policy-gated,      │  │
│   │  contracts)  │  │              │  │  orchestrated)       │  │
│   └──────┬───────┘  └──────────────┘  └──────────┬───────────┘  │
│          │                                        │             │
│          └─────────────┬──────────────────────────┘             │
│                        ▼                                       │
│            ┌──────────────────────┐                             │
│            │  policyEnforcement   │  ← fail-closed gate         │
│            │    Service.js        │                             │
│            └──────────┬───────────┘                             │
│                       │                                         │
├───────────────────────┼─────────────────────────────────────────┤
│            Tauri v2 (Rust 1.77)   │                             │
│                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  lib.rs  ~1,455 lines · 63 Tauri commands               │    │
│  │  ├── kv_store.rs        SQLite-backed KV store          │    │
│  │  ├── policy_gate.rs     Policy enforcement backend      │    │
│  │  ├── audit_log.rs       Audit chain                     │    │
│  │  ├── ollama.rs          Ollama inference backend        │    │
│  │  ├── memory_store.rs    Memory persistence              │    │
│  │  ├── telegram.rs        Telegram connector              │    │
│  │  ├── youtube.rs         YouTube upload                  │    │
│  │  ├── whatsapp_webhook.rs WhatsApp webhook               │    │
│  │  ├── connector_commands.rs 12 connector commands        │    │
│  │  ├── native_proof.rs    Native proof engine             │    │
│  │  ├── plugin_runtime.rs  Plugin runtime                  │    │
│  │  ├── meta_publish.rs    Meta publishing                 │    │
│  │  ├── search.rs          Research search                 │    │
│  │  ├── workspace.rs       Workspace ops                   │    │
│  │  └── runway.rs          Video generation                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Ollama (local)  ←→  Connectors  (Telegram, WhatsApp,   │   │
│  │                        Claude, ChatGPT, Notion, ClickUp, │   │
│  │                        SD WebUI, ComfyUI, Brave Search)  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Architecture Rules

- **Fail-closed**: Every outbound connector call goes through `policyEnforcementService.js` — if credentials are missing or the action is ambiguous, it is blocked, not allowed.
- **Agent contracts**: `agentContractService.js` enforces per-agent allowed/blocked action prefixes.
- **Durable queue**: `orchestrationQueueService.js` manages state transitions, dead-letter replay, and approval workflows.
- **Memory**: SQLite-backed via `kv_store.rs` with governance metadata and retention policies.
- **Security**: CSP enforced at Tauri level; updater signatures via `tauri-plugin-updater`.

## Development

```bash
npm run dev            # Start Vite dev server
npm run lint           # ESLint on src/
npm run test           # Run all 952 tests across 72 files
npm run test:coverage  # Coverage report (threshold 20%)
npm run build          # Production build
npm run verify:app     # lint + test + build in one command
```

### Rust Backend

```bash
cd src-tauri
cargo check                        # Verify compilation
cargo test                         # Run 14 Rust unit tests
cargo clippy -- -D warnings        # Lint (CI enforces zero warnings)
```

### E2E Tests

```bash
npx playwright install chromium    # One-time browser install
npm run dev                        # Dev server must be running
npm run test:e2e                   # Playwright smoke tests
```

## Connectors

Each connector requires specific environment variables. See [docs/CONNECTORS.md](docs/CONNECTORS.md) for setup instructions, credentials, and test procedures.

| Connector | Status | Env Var Required |
|-----------|--------|-----------------|
| Ollama | Built-in | None (local) |
| Telegram | Production | `TELEGRAM_BOT_TOKEN` |
| WhatsApp Cloud | Staging | `WHATSAPP_CLOUD_TOKEN` |
| Claude | Production | `ANTHROPIC_API_KEY` |
| ChatGPT | Production | `OPENAI_API_KEY` |
| YouTube | Ready | `YOUTUBE_API_KEY` |
| Notion | Ready | `NOTION_API_KEY` |
| ClickUp | Ready | `CLICKUP_API_KEY` |
| SD WebUI | Ready | `SD_WEBUI_URL` |
| ComfyUI | Ready | `COMFYUI_URL` |
| Brave Search | Ready | `BRAVE_SEARCH_API_KEY` |

## Agents

| Agent | Role |
|-------|------|
| Alphonso | Local operator — execution, verification, packaging |
| Jose | Orchestrator — intake, routing, merge, confirm, report |
| Hector | Research + citations, source scan |
| Miya | Creative — strategy, script, storyboard, export |
| Maria | Governance, audit, risk, approval review |
| Marcus | Approved distribution execution |
| Echo | Memory historian and archival |
| Sentinel | Security monitoring, automation safety |
| Nova | Scoring, analysis, opportunity prioritization |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, workflow, code style, and PR guidelines.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting policy and scope.

## License

MIT — see [LICENSE](LICENSE) for details.
