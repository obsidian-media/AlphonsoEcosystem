# Alphonso — Claude Code Guide

## ALWAYS READ FIRST

`docs/ALPHONSO_GROUND_TRUTH.md` — verified facts about what exists in this repo. Do not trust any audit report or summary document that contradicts it. Past audits contained significant errors (see "Known Audit Errors" section in that file).

---

## Build Commands

```bash
npm run dev              # Vite dev server only (port 5173)
npm run tauri dev        # Full Tauri dev with Rust backend (kill port 5173 first if busy)
npm run test             # Run all 88 tests across 37 files — all should pass
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

# Coverage (actual measured: 9.22%, threshold: 9%)
npm run test:coverage    # Run tests with 9% line coverage threshold

# E2E (requires: npm install --save-dev @playwright/test && npx playwright install chromium)
# Also requires: npm run dev running on :5173 + Ollama running with a model
npm run test:e2e         # Run Playwright golden-path smoke test
```

---

## Key Architecture Facts

- **9 agents**: Alphonso, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, Nova — all in `src/agents/`, all enforced by `agentContractService.js`
- **policyEnforcementService.js is fail-closed**: every outbound connector call goes through this gate; if credentials are missing or the action is ambiguous it is blocked, not allowed
- **lib.rs is ~7,100 lines** — first module extracted: `whatsapp_webhook.rs` (220 lines). Do not split further without careful planning (see Ground Truth section 8).
- **All 88 tests are in `src/test/`** — 37 test files; Vitest is scoped to `src/` via `include` pattern in `vite.config.js`
- **Two CI workflows exist**: `ci.yml` (lint + test + build + Tauri artifact + cargo test/clippy) and `verify-app.yml` (lint + test + build). Both passing green.
- **`.npmrc`** has `legacy-peer-deps=true` — required because `@eslint/js@10` and `eslint@9` have a peer dep mismatch. Do not remove.

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
| Playwright config + E2E test | `playwright.config.js` + `e2e/smoke.spec.js` |

---

## Before Making Changes

1. Read `docs/ALPHONSO_GROUND_TRUTH.md`
2. Check `src/services/` for an existing service before writing a new one — there are 65+ services
3. Check `src/test/` — there are 37 test files already; add to them, don't create a parallel test system
4. Run `npm run test` before and after any change; all 88 tests must continue to pass
5. For Rust changes, run `cargo check` AND `cargo clippy -- -D warnings` from `src-tauri/` — CI enforces `-D warnings`
6. Do not commit `.env`, `.tauri-updater-key`, or `.tauri-updater-key.pub` — they are in `.gitignore`

---

## Real Gaps (as of 2026-06-01)

These are confirmed gaps. Check `docs/ALPHONSO_GROUND_TRUTH.md` section 8 for the current state before working on any of them:

- `lib.rs` further module splitting — next candidate: KV store block (~lines 1000–1072) or Telegram connector block (~lines 1543–1757)
- WhatsApp Cloud inbound webhook — hosted endpoint not deployed
- Playwright E2E — scaffold exists (`e2e/smoke.spec.js`), but `@playwright/test` + browser install not done on CI yet
- No onboarding flow for first launch
- localStorage → SQLite migration — top 5 keys identified; `kv_set`/`kv_get` commands exist
- Coverage threshold at 9% — needs tests to reach staged targets (12→20→30)
- Auto-updater signed manifest hosting not finalized
- `appendAgentActivity` calls not yet wired into actual agent services (Activity tab shows no data)
- Multi-turn context window for Ollama (currently stateless per message)
- Markdown rendering in chat messages

---

## Project Structure

```
src/                   React frontend (all .jsx, no TypeScript except memoryService.ts)
  agents/              9 agent profiles, permissions, schemas + agentRegistry.js
  components/          UI components
    ConnectorHealthPanel.jsx        — full connector panel (lazy chunk)
    ConnectorStatusIndicators.jsx   — small dot/strip components (static-safe import)
    AgentActivityLog.jsx            — activity timeline tab
  services/            65+ services
  test/                37 test files (Vitest, scoped to src/)
e2e/                   Playwright E2E tests
src-tauri/
  src/
    lib.rs             Rust backend (~7,100 lines)
    whatsapp_webhook.rs  First extracted module (3 commands, 4 structs)
    native_proof.rs    Native proof module
    runway.rs          Runway video module
  Cargo.toml
docs/                  Documentation and handoff packages
  ALPHONSO_GROUND_TRUTH.md   <- single source of truth
  CHANGELOG.md
.github/
  workflows/
    ci.yml             Main CI: lint + test + build + cargo clippy/test + Tauri artifact
    verify-app.yml     Secondary: verify:app script
.npmrc                 legacy-peer-deps=true (required for npm ci to work)
playwright.config.js   Playwright config (baseURL :5173, headless Chromium)
gateway/
  whatsapp-cloud/      Railway-hosted WhatsApp Cloud gateway (setup_required)
scripts/               Build, release, and auth helper scripts
```

---

_Last verified: 2026-06-01 — Session 3 complete. CI green (f8e82f1). Run `npm run verify:app` and `cargo clippy -- -D warnings` from src-tauri/ to re-verify._
