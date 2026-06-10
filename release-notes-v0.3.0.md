# Alphonso v0.3.0 — Local-First AI Desktop Companion

> Release date: 2026-06-09

Alphonso v0.3.0 is a major leap from the v0.1.0 baseline, adding structured tool use, real agent intelligence, streaming chat, code splitting, Rust backend modularization, and dozens of quality-of-life improvements across the entire stack. 123 services, 952 tests, 17 Rust modules, and a 44% smaller main bundle.

---

## What's New

### Agent Intelligence & Execution

- **Structured tool-use framework** — 12 tools (read/write/delete/move files, search, list dir, run commands, fetch URL, Composio, memory, git) with JSON schemas and max 10-iteration execution loop in `agentBrainService.js`
- **Workflow execution engine** — localStorage-backed run engine with lifecycle (queued → approval_required → approved → in_progress → completed|partial); stages auto-generated from workflow `allowedActions`
- **Proactive agent behavior** — `proactiveAgentService.js` monitors idle time, failed builds, high iterations, low confidence; suggestion banner with action buttons in ChatView
- **Memory unification** — 4 memory systems merged into single `unifiedMemoryService` with shared (1000), miya (700), ecosystem (1500), workflow (2000) namespaces and backward-compatible re-exports
- **9 agents (Alphonso, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, Nova)** — each with profile, permissions, schema, enforced by `agentContractService.js`

### Architecture & Code Quality

- **Rust backend modularization** — 16 modules extracted from `lib.rs`; `lib.rs` reduced from ~5,519 to ~1,455 lines (72% reduction)
- **App.jsx decomposition** — 6 Context providers extracted + CoachWindow component; App.jsx reduced from ~1,585 to ~650 lines
- **Connector registry split** — `connectorRegistryService.js` split into 5 focused modules: registry, auth, polling, outbound, image generators
- **Code splitting** — main chunk reduced from 519KB to 288KB (44% reduction)
- **Error boundaries** — `ViewErrorBoundary` with copy error button, expandable stack trace

### Streaming & Chat UX

- **Real-time streaming** — token-by-token display with live cursor in ChatView
- **Stop generation button** — abort active Ollama request via AbortController
- **Copy button on assistant messages** — hover reveal, "Copied!" confirmation
- **Token counter & elapsed timer** — live streaming status indicator

### Accessibility (WCAG)

- `role="switch"` + `aria-checked` + `aria-label` on all 9 toggle buttons
- `aria-live="polite"` on streaming responses
- `focus-visible:ring` on textarea for keyboard navigation
- Escape key handler in ApprovalModal
- `prefers-reduced-motion` media query

### Connectors & External Tools

- **11 connectors** — Telegram, WhatsApp Cloud, YouTube, Claude, ChatGPT, Notion, ClickUp, SD WebUI, ComfyUI, Brave Search, Ollama — all policy-gated
- **Composio integration** — 1000+ external services (GitHub, Slack, Notion, Jira)
- **Browser automation** — open URL, fetch content, read/write clipboard via Tauri

### Security

- **CSP hardened** — removed `https:` catch-all in `connect-src`
- **HMAC timing attack fix** — `whatsapp_webhook.rs` uses `crypto.timingSafeEqual`
- **Path traversal guard** — in `workspace.rs` for file operations
- **Zero `unwrap()` panics** in runtime paths

### Infrastructure

- **Desktop installer v0.3.0** — NSIS per-user install mode, signing keys generated
- **Tauri auto-updater** — ed25519 signing keypair, endpoint + pubkey pre-configured
- **Railway WhatsApp gateway** — deployment-ready (not yet live)
- **SQLite migration** — persistent storage for connector auth and registry

---

## Installation

### From Installer (Windows)

Download the latest installer from [GitHub Releases](https://github.com/Thatisshayan/AlphonsoEcosystem/releases):

```
Alphonso_0.3.0_x64-setup.exe   (NSIS, ~6.8 MB)
```

### From Source

**Prerequisites:** Node.js 20+, Rust 1.77+, Ollama (`ollama pull llama3.2:3b`)

```bash
git clone https://github.com/Thatisshayan/AlphonsoEcosystem.git
cd AlphonsoEcosystem
npm install
npm run dev          # Vite dev server on http://localhost:5173
npm run desktop:dev  # Tauri dev window
```

### Verify

```bash
npm run verify:app   # lint + test + build
```

---

## Known Issues

- **WhatsApp Cloud gateway** — Railway-deployed endpoint not yet active
- **Coverage gap** — 27.97% (threshold 20%)
- **E2E tests require Ollama** running
- **Windows only** — Linux/macOS Tauri builds not yet tested

---

## Links

| Resource | Location |
|----------|----------|
| Documentation | [docs/](docs/) |
| Changelog | [docs/CHANGELOG.md](docs/CHANGELOG.md) |
| GitHub | https://github.com/Thatisshayan/AlphonsoEcosystem |
| Issues | https://github.com/Thatisshayan/AlphonsoEcosystem/issues |

---

*Built with Tauri v2, React 18, Vite 5, Tailwind 3, and Ollama. 123 services · 952 tests · 17 Rust modules · 9 agents · 11 connectors.*
