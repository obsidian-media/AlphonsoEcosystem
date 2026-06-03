# Alphonso

> Local-first AI desktop companion powered by Ollama

[![CI](https://github.com/AlphonsoEcosystem/local-agent-ui-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/AlphonsoEcosystem/local-agent-ui-v2/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Alphonso is a privacy-first desktop AI assistant that runs entirely on your machine. It orchestrates 9 specialized agents, connects to 11 external services, and uses Ollama for local LLM inference — keeping your data off the cloud.

## Features

- **9 Agent System** — Alphonso, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, Nova — each with defined roles, permissions, and contracts
- **11 Connectors** — Telegram, WhatsApp Cloud, YouTube, Claude, ChatGPT, Notion, ClickUp, Stable Diffusion WebUI, ComfyUI, Brave Search, Ollama
- **Local LLM** — Ollama integration with model switching (`llama3.2:3b` default)
- **Policy Enforcement** — Fail-closed gate for all outbound actions; per-agent permission contracts
- **Durable Orchestration** — Queue with state transitions, dead-letter replay, and approval workflows
- **Memory** — SQLite-backed durable memory with governance metadata and retention policies
- **Desktop Native** — Tauri v2 (Rust backend) + React 18 frontend; NSIS/MSI installers

## Quick Start

### Prerequisites

- **Node.js** 20+
- **Rust** 1.77+ (with `cargo`)
- **Ollama** — [install & start](https://ollama.com), pull a model: `ollama pull llama3.2:3b`

### Install & Run

```bash
git clone https://github.com/AlphonsoEcosystem/local-agent-ui-v2.git
cd local-agent-ui-v2
npm install
npm run dev          # Vite dev server on http://localhost:5173
```

For the native desktop app:

```bash
npm run desktop:dev  # Tauri dev window (requires Rust toolchain)
```

## Development

```bash
npm run dev            # Start Vite dev server
npm run lint           # ESLint on src/
npm run test           # Run all tests
npm run test:coverage  # Coverage report
npm run build          # Production build
npm run verify:app     # lint + test + build in one command
```

### Rust Backend

```bash
cd src-tauri
cargo check                        # Verify compilation
cargo test                         # Run 14 unit tests
cargo clippy -- -D warnings        # Lint (CI enforces zero warnings)
```

### E2E Tests

```bash
npx playwright install chromium    # One-time browser install
npm run dev                        # Dev server must be running
npm run test:e2e                   # Playwright smoke tests
```

## Architecture

```
React 18 (Vite 5, Tailwind 3)        Tauri v2 (Rust 1.77)
├── 76+ UI components                 ├── lib.rs (~7K lines, 63 commands)
├── 89+ services (policy-gated)       ├── kv_store.rs (SQLite)
├── 9 agent profiles                  ├── whatsapp_webhook.rs
└── Ollama local inference            └── native_proof.rs
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full stack diagram, agent roster, orchestration flow, and security model.

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
