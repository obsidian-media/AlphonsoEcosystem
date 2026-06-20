# Alphonso Infrastructure & Documentation Report

**Generated:** 2026-05-31  
**Session:** Claude Code infrastructure documentation pass

---

## Files Created This Session

| File | Description |
|---|---|
| `ARCHITECTURE.md` | Full architecture reference: stack table, IPC flow, 9-agent roster, service layer groups, storage model, security model, deployment targets, known tech debt |
| `CLAUDE.md` | Claude Code session guide: build commands, key architecture facts, do-not-duplicate list, real gaps, project structure — read automatically at session start |
| `docs/CONNECTORS.md` | Per-connector reference for all 11 connectors + Runway: required env vars, how to get credentials, how to test, known limitations, setup doc cross-references |
| `docs/CHANGELOG.md` | Keep a Changelog format: Unreleased entries for 2026-05-31 Agent A/B/C/D changes; [0.1.0] summary from production completion report |
| `.github/dependabot.yml` | Dependabot auto-update config: npm (weekly, limit 5 PRs), Cargo (weekly, limit 5 PRs), GitHub Actions (weekly, limit 3 PRs) |
| `docs/INFRA_DOCS_REPORT.md` | This file |

---

## Running the App from Scratch (New Developer)

### Prerequisites

1. **Rust toolchain** — Install from `rustup.rs` (Rust 1.77+)
2. **Node.js** — v18+ recommended
3. **Tauri prerequisites** — Install per `tauri.app/guides/prerequisites` (Windows: WebView2, Visual Studio C++ Build Tools)
4. **Ollama** (optional but recommended for local AI) — Install from `ollama.ai`, then pull the default model:
   ```
   ollama pull llama3.2:3b
   ```

### Setup

```powershell
# 1. Clone the repo and navigate to the project root
cd C:\path\to\local-agent-ui-v2

# 2. Install Node dependencies
npm ci

# 3. Copy and configure environment variables
copy .env.example .env
# Edit .env — fill in any connector credentials you want to use
# At minimum, no credentials are required to run the app in zero-cost mode

# 4. Run the web dev server (frontend only, no Rust)
npm run dev
# App is available at http://localhost:5173

# OR run the full Tauri desktop app (requires Rust + Tauri prerequisites)
npm run tauri dev
```

### Verify Everything Works

```powershell
# Run the full test suite (88 tests, all should pass)
npm run test

# Run the full verify pipeline (lint + test + build)
npm run verify:app

# Check Rust compiles
cd src-tauri
cargo check
cargo test
cd ..
```

### Connector Setup

After the app starts, open the **Connector Setup** panel inside the app to:
1. See which connectors have credentials configured (green = present, red = missing)
2. Run supervised test actions for each connector
3. See detailed setup instructions per connector in `docs/CONNECTORS.md`

---

## Cutting a Release (Maintainer)

### Prerequisites for Signing

```powershell
# Generate Tauri updater signing keys (one-time setup)
npm run updater:keygen
# This creates .tauri-updater-key and .tauri-updater-key.pub
# Add TAURI_SIGNING_PRIVATE_KEY to your .env
# NEVER commit these files — they are in .gitignore
```

### Release Pipeline

```powershell
# 1. Verify updater readiness
npm run updater:verify

# 2. Run the one-command release pipeline
npm run release:updater
# This performs:
#   - npm run build (Vite web build)
#   - Tauri desktop build (NSIS + MSI installer artifacts)
#   - Signs the update manifest with your private key
#   - Outputs installer artifacts to release/
```

### Artifacts

After a successful release, the following are produced in `release/`:
- `Alphonso_<version>_x64-setup.exe` — NSIS installer
- `Alphonso_<version>_x64_en-US.msi` — MSI installer
- `latest.json` — signed Tauri updater manifest (host this at `ALPHONSO_UPDATE_BASE_URL`)

### Gateway (WhatsApp Cloud inbound)

If deploying the WhatsApp Cloud webhook gateway:
1. Push `gateway/whatsapp-cloud/` to Railway
2. Set all required env vars in the Railway service (see `docs/RAILWAY_WHATSAPP_GATEWAY.md`)
3. Configure the Meta webhook callback URL to point at the Railway service `/webhook` endpoint
4. Verify `/health` returns 200 and the challenge token handshake passes before treating as live

### CI

All pushes and PRs to `main` automatically run:
- `.github/workflows/ci.yml` — lint + test (88 JS tests) + web build + `cargo clippy` + `cargo test` (14 Rust tests) + Tauri NSIS/MSI artifact (main branch only)
- `.github/workflows/verify-app.yml` — lint + test + build via `npm run verify:app`

Dependabot (`.github/dependabot.yml`) will open weekly PRs for npm, Cargo, and GitHub Actions dependency updates.

---

## Key Files for Ongoing Maintenance

| File | Purpose |
|---|---|
| `docs/ALPHONSO_GROUND_TRUTH.md` | Single source of truth — update whenever agents, services, or tests are added |
| `docs/SECURITY_ROTATION_CHECKLIST.md` | Rotate all 26 credentials if any secret is suspected compromised |
| `docs/CONNECTORS.md` | Connector credential reference (this session) |
| `docs/CHANGELOG.md` | Running changelog — update with every significant change |
| `ARCHITECTURE.md` | Architecture reference (this session) |
| `CLAUDE.md` | Claude Code session guide (this session) |
| `src-tauri/src/lib.rs` | Entire Rust backend (~7,200 lines) — the most critical single file |
| `src/services/policyEnforcementService.js` | Fail-closed policy gate — do not modify without thorough testing |
| `src/agents/agentRegistry.js` | Agent registry — update when adding or removing agents |
