# Alphonso — Claude Code Guide

## ALWAYS READ FIRST

`docs/ALPHONSO_GROUND_TRUTH.md` — verified facts about what exists in this repo. Do not trust any audit report or summary document that contradicts it. Past audits contained significant errors (see "Known Audit Errors" section in that file).

---

## Build Commands

```bash
npm run dev              # Vite dev server only (port 5173)
npm run tauri dev        # Full Tauri dev with Rust backend (kill port 5173 first if busy)
npm run test             # Run all 952 tests across 72 files — all should pass
npm run test:watch       # Watch mode
npm run build            # Web build only (no Tauri/Rust)
npm run verify:app       # lint + test + build in one command
npm run lint             # ESLint on src/

# Rust (run from src-tauri/ directory)
cargo check              # Verify Rust compiles
cargo test               # Run 14 Rust unit tests
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

- **9 agents**: Alphonso, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, Nova — all in `src/agents/`, all enforced by `agentContractService.js`
- **policyEnforcementService.js is fail-closed**: every outbound connector call goes through this gate; if credentials are missing or the action is ambiguous it is blocked, not allowed
- **lib.rs is ~1,455 lines** — 16 modules extracted (whatsapp_webhook, kv_store, native_proof, plugin_runtime, policy_gate, audit_log, ollama, memory_store, meta_publish, connector_commands, search, telegram, workspace, youtube, runway, main). Next candidate: further utility splitting.
- **All 952 tests are in `src/test/`** — 72 test files; Vitest via vitest.config.js (separate from vite build config)
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
| Policy / approval enforcement | `src/services/policyEnforcementService.js` |
| Orchestration queue + dead-letter | `src/services/orchestrationQueueService.js` |
| Receipt / audit events | `src/services/orchestrationReceiptService.js` |
| Zero-cost mode logic | `policyEnforcementService.js` + Jose routing |
| Agent contract boundaries | `src/services/agentContractService.js` |
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

---

## Before Making Changes

1. Read `docs/ALPHONSO_GROUND_TRUTH.md`
2. Check `src/services/` for an existing service before writing a new one — there are 123 services
3. Check `src/test/` — there are 72 test files already; add to them, don't create a parallel test system
4. Run `npm run test` before and after any change; all 952 tests must continue to pass
5. For Rust changes, run `cargo check` AND `cargo clippy -- -D warnings` from `src-tauri/` — CI enforces `-D warnings`
6. Do not commit `.env`, `.tauri-updater-key`, or `.tauri-updater-key.pub` — they are in `.gitignore`

---

## Real Gaps (as of 2026-06-09 Session 12)

These are confirmed gaps. Check `docs/ALPHONSO_GROUND_TRUTH.md` for the current state before working on any of them:

- `lib.rs` further utility splitting — shared functions (jose, OCR, clipboard, URL helpers)
- WhatsApp Cloud inbound webhook — hosted endpoint not deployed (Railway config exists)
- localStorage → SQLite migration — completed for 5 keys. Remaining: durable runtime data migration
- Coverage at 27.97% — next staged target 30%
- Auto-updater signed manifest hosting — keypair generated, needs GitHub Secrets added
- Markdown rendering in chat messages
- Image compression — mascots converted to WebP (~89% reduction)
- TypeScript migration — not started for frontend; 9 .ts services exist in src/services/

---

## Project Structure

```
src/                   React frontend (all .jsx, 9 .ts services)
  agents/              9 agent profiles, permissions, schemas + agentRegistry.js
  components/          UI components
    ConnectorHealthPanel.jsx        — full connector panel (lazy chunk)
    ConnectorStatusIndicators.jsx   — small dot/strip components (static-safe import)
    AgentActivityLog.jsx            — activity timeline tab (appendAgentActivity wired)
  services/            123 services
  lib/
    ollama.js          Ollama client — generateOllamaChatStream uses /api/chat (multi-turn)
  test/                72 test files (Vitest, vitest.config.js)
e2e/                   Playwright E2E tests (Chromium installed)
src-tauri/
  src/
    lib.rs             Rust backend (~1,455 lines)
    kv_store.rs        KV store module — kv_set, kv_get, save_settings, load_settings
    whatsapp_webhook.rs  WhatsApp webhook module (3 commands, 4 structs)
    native_proof.rs    Native proof module
    runway.rs          Runway video module
    telegram.rs        Telegram Bot API module
    youtube.rs         YouTube upload module
    workspace.rs       Workspace file ops module
    search.rs          Research search module
    connector_commands.rs  Connector Rust backend (12 commands)
    plugin_runtime.rs  Plugin runtime engine
    policy_gate.rs     Policy enforcement backend
    audit_log.rs       Audit chain
    ollama.rs          Ollama backend
    memory_store.rs    Memory persistence
    meta_publish.rs    Meta publishing
  Cargo.toml
docs/                  Documentation and handoff packages
  ALPHONSO_GROUND_TRUTH.md   <- single source of truth
  CHANGELOG.md
.github/
  workflows/
    ci.yml             Main CI: lint + test + build + cargo clippy/test + Tauri artifact + security audits
    release.yml        Release CI: tag-triggered build + sign + publish
.npmrc                 legacy-peer-deps=true (required for npm ci to work)
playwright.config.js   Playwright config (baseURL :5173, headless Chromium)
vitest.config.js       Vitest config (separate from vite build config)
gateway/
  whatsapp-cloud/      Railway-hosted WhatsApp Cloud gateway (setup_required)
scripts/               Build, release, and auth helper scripts
```

---

_Last verified: 2026-06-09 — Session 12 complete. 72 test files, 952 tests, all passing. Coverage 27.97% (threshold 20%). cargo clippy clean. CI: ci.yml + release.yml. Version 0.3.0 tagged. Auto-updater keypair generated (TAURI_SIGNING_PRIVATE_KEY needs GitHub Secrets). Run `npm run verify:app` and `cargo clippy -- -D warnings` from src-tauri/ to re-verify._
