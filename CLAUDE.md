# Alphonso — Claude Code Guide

## ALWAYS READ FIRST

`docs/ALPHONSO_GROUND_TRUTH.md` — verified facts about what exists in this repo. Do not trust any audit report or summary document that contradicts it. Past audits contained significant errors (see "Known Audit Errors" section in that file).

---

## Build Commands

```bash
npm run dev              # Vite dev server only (port 5173)
npm run tauri dev        # Full Tauri dev with Rust backend (kill port 5173 first if busy)
npm run test             # Run all 180+ tests across 47 files — all should pass
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

# Coverage (actual measured: 27.83%, threshold: 12%, scoped to src/)
npm run test:coverage    # Run tests with coverage report

# E2E — Playwright installed (no extra install needed)
# Requires: npm run dev running on :5173 + Ollama running with a model
npm run test:e2e         # Run Playwright golden-path smoke test
```

---

## Key Architecture Facts

- **9 agents**: Alphonso, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, Nova — all in `src/agents/`, all enforced by `agentContractService.js`
- **policyEnforcementService.js is fail-closed**: every outbound connector call goes through this gate; if credentials are missing or the action is ambiguous it is blocked, not allowed
- **lib.rs is ~7,078 lines** — two modules extracted: `whatsapp_webhook.rs` (Session 3) + `kv_store.rs` (Session 4). Next candidate: Telegram connector block.
- **All 180+ tests are in `src/test/`** — 47 test files; Vitest is scoped to `src/` via `include` pattern in `vite.config.js`
- **One CI workflow exists**: `ci.yml` (lint + test + build + Tauri artifact + cargo test/clippy + npm audit + cargo audit). Passing green.
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
| CI workflows | `.github/workflows/ci.yml`, `.github/workflows/verify-app.yml` |
| WhatsApp webhook Rust commands | `src-tauri/src/whatsapp_webhook.rs` |
| KV store Rust commands | `src-tauri/src/kv_store.rs` — `kv_set`, `kv_get`, `save_settings`, `load_settings` |
| Playwright config + E2E test | `playwright.config.js` + `e2e/smoke.spec.js` (Chromium installed) |
| Multi-turn Ollama chat | `generateOllamaChatStream` in `src/lib/ollama.js` (uses `/api/chat`) |
| Agent activity log wiring | `appendAgentActivity` imported in `joseExecutionEngineService` + `connectorRegistryService` |

---

## Before Making Changes

1. Read `docs/ALPHONSO_GROUND_TRUTH.md`
2. Check `src/services/` for an existing service before writing a new one — there are 89+ services
3. Check `src/test/` — there are 47 test files already; add to them, don't create a parallel test system
4. Run `npm run test` before and after any change; all 180+ tests must continue to pass
5. For Rust changes, run `cargo check` AND `cargo clippy -- -D warnings` from `src-tauri/` — CI enforces `-D warnings`
6. Do not commit `.env`, `.tauri-updater-key`, or `.tauri-updater-key.pub` — they are in `.gitignore`

---

## Real Gaps (as of 2026-06-01 Session 4)

These are confirmed gaps. Check `docs/ALPHONSO_GROUND_TRUTH.md` section 8 for the current state before working on any of them:

- `lib.rs` further module splitting — next candidate: Telegram connector block (~lines 1543–1757, shifted after KV extraction)
- WhatsApp Cloud inbound webhook — hosted endpoint not deployed
- localStorage → SQLite migration — 3 keys remaining: `alphonso_messages_${id}`, `alphonso_connector_auth_profiles_v1`, `alphonso_connector_registry_v2`
- No onboarding flow for first launch
- Coverage at 27.83% — next staged target 30%
- Auto-updater signed manifest hosting not finalized
- Markdown rendering in chat messages
- Image compression — jose: 236KB, alphonso: 243KB mascot assets still heavy

---

## Project Structure

```
src/                   React frontend (all .jsx, no TypeScript except memoryService.ts)
  agents/              9 agent profiles, permissions, schemas + agentRegistry.js
  components/          UI components
    ConnectorHealthPanel.jsx        — full connector panel (lazy chunk)
    ConnectorStatusIndicators.jsx   — small dot/strip components (static-safe import)
    AgentActivityLog.jsx            — activity timeline tab (appendAgentActivity wired)
  services/            89+ services
  lib/
    ollama.js          Ollama client — generateOllamaChatStream uses /api/chat (multi-turn)
  test/                47 test files (Vitest, scoped to src/)
e2e/                   Playwright E2E tests (Chromium installed)
src-tauri/
  src/
    lib.rs             Rust backend (~7,078 lines)
    kv_store.rs        KV store module — kv_set, kv_get, save_settings, load_settings
    whatsapp_webhook.rs  WhatsApp webhook module (3 commands, 4 structs)
    native_proof.rs    Native proof module
    runway.rs          Runway video module
  Cargo.toml
docs/                  Documentation and handoff packages
  ALPHONSO_GROUND_TRUTH.md   <- single source of truth
  CHANGELOG.md
.github/
  workflows/
    ci.yml             Main CI: lint + test + build + cargo clippy/test + Tauri artifact + security audits
.npmrc                 legacy-peer-deps=true (required for npm ci to work)
playwright.config.js   Playwright config (baseURL :5173, headless Chromium)
gateway/
  whatsapp-cloud/      Railway-hosted WhatsApp Cloud gateway (setup_required)
scripts/               Build, release, and auth helper scripts
```

---

_Last verified: 2026-06-03 — OpenCode audit. 47 test files, 180+ tests, all passing. Coverage 27.83% (threshold 12%). cargo clippy clean. CI consolidated (verify-app.yml removed, security audits added). Run `npm run verify:app` and `cargo clippy -- -D warnings` from src-tauri/ to re-verify._
