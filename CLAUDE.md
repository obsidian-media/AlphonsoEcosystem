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
cargo clippy             # Lint Rust code

# Updater / release
npm run release:updater  # One-command release pipeline (NSIS + MSI + signed manifest)
npm run updater:keygen   # Generate Tauri updater signing keys
npm run updater:verify   # Verify updater readiness

# Auth helpers
npm run auth:youtube     # OAuth flow for YouTube
npm run auth:meta        # OAuth flow for Meta/Instagram

# Coverage (requires @vitest/coverage-v8 installed)
npm run test:coverage    # Run tests with 30% line coverage threshold
```

---

## Key Architecture Facts

- **9 agents**: Alphonso, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, Nova — all in `src/agents/`, all enforced by `agentContractService.js`
- **policyEnforcementService.js is fail-closed**: every outbound connector call goes through this gate; if credentials are missing or the action is ambiguous it is blocked, not allowed
- **lib.rs is ~7,200 lines** — the entire Rust backend is a single file; do not try to split it without careful planning
- **All 88 tests are in `src/test/`** — 37 test files covering Jose pipeline, connectors, orchestration, WhatsApp, Ollama, approval enforcement, and more
- **Two CI workflows exist**: `ci.yml` (lint + test + build + Tauri artifact + cargo test/clippy) and `verify-app.yml` (lint + test + build)

---

## Do Not Duplicate — These Already Exist

Before writing any new service, component, or feature, check this list:

| Thing you might think is missing | Where it actually lives |
|---|---|
| Connector health UI | `src/components/ConnectorHealthPanel.jsx` |
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

---

## Before Making Changes

1. Read `docs/ALPHONSO_GROUND_TRUTH.md`
2. Check `src/services/` for an existing service before writing a new one — there are 65+ services
3. Check `src/test/` — there are 37 test files already; add to them, don't create a parallel test system
4. Run `npm run test` before and after any change; all 88 tests must continue to pass
5. For Rust changes, run `cargo check` and `cargo test` from `src-tauri/`
6. Do not commit `.env`, `.tauri-updater-key`, or `.tauri-updater-key.pub` — they are in `.gitignore`

---

## Real Gaps (as of 2026-05-31)

These are confirmed gaps. Check `docs/ALPHONSO_GROUND_TRUTH.md` section 8 for the current state before working on any of them:

- `lib.rs` module splitting (~7,200 lines, deferred)
- WhatsApp Cloud inbound webhook — hosted endpoint not deployed
- No Playwright E2E smoke test
- No onboarding flow for first launch
- No dark/light theme toggle
- Hector research results not persisted to SQLite
- Brave Search connector (`connector_search_brave`) not implemented
- Auto-updater signed manifest hosting not finalized

---

## Project Structure

```
src/                   React frontend (all .jsx, no TypeScript)
  agents/              9 agent profiles, permissions, schemas + agentRegistry.js
  components/          UI components (ConnectorHealthPanel, ApprovalModal, Sidebar, etc.)
  services/            65+ services
  test/                37 test files (Vitest)
src-tauri/
  src/lib.rs           Entire Rust backend (~7,200 lines, single file)
  Cargo.toml
docs/                  Documentation and handoff packages
  ALPHONSO_GROUND_TRUTH.md   ← single source of truth
.github/
  workflows/
    ci.yml             Main CI: lint + test + build + cargo test/clippy + Tauri artifact
    verify-app.yml     Secondary: verify:app script
gateway/
  whatsapp-cloud/      Railway-hosted WhatsApp Cloud gateway (setup_required)
scripts/               Build, release, and auth helper scripts
```
