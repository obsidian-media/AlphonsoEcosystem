# Alphonso — Agent Context

## Project Identity
- **App**: Alphonso — local-first AI desktop companion
- **Stack**: Tauri v2 (Rust backend) + React 18 (Vite 5, Tailwind 3) + Ollama (local LLM)
- **Version**: 0.3.0 (local capable, not yet publicly installable)
- **Target**: v1.0.0 = publicly installable, runtime-proven, release-hardened

## Directory Structure
```
src/                   React frontend (.jsx, not .tsx)
  agents/              9 agent profiles, permissions, schemas
  components/          76+ UI components
  services/            123 services (policy-gated, not stubs)
  lib/                 Utilities (ollama.js, chatUtils.js, appStorage.js)
  test/                72 test files, 952 tests (Vitest)
src-tauri/             Rust backend
  src/lib.rs           ~1,455 lines, 63 Tauri commands
  src/kv_store.rs      KV store module (SQLite-backed)
  src/whatsapp_webhook.rs  WhatsApp webhook module
  src/native_proof.rs  Native proof/RC0 engine
  src/runway.rs        Runway video generation
  src/connector_commands.rs  Connector Rust backend (12 commands)
  src/telegram.rs      Telegram connector
  src/youtube.rs       YouTube upload
  src/workspace.rs     Workspace file ops
  src/search.rs        Research search
  src/plugin_runtime.rs Plugin runtime engine
  src/policy_gate.rs   Policy enforcement backend
  src/audit_log.rs     Audit chain
  src/ollama.rs        Ollama backend
  src/memory_store.rs  Memory persistence
  src/meta_publish.rs  Meta publishing
scripts/               Build, release, auth, verification scripts
e2e/                   Playwright E2E tests
gateway/               WhatsApp Cloud gateway (Railway-ready, not deployed)
docs/                  52+ documentation files
```

## Build & Test Commands
```bash
npm run dev              # Vite dev server (port 5173)
npm run test             # All 952 tests across 72 files
npm run lint             # ESLint on src/
npm run build            # Vite production build
npm run verify:app       # lint + test + build in one command
npm run test:coverage    # Coverage report (actual: 27.97%, threshold: 20%)
npm run test:e2e         # Playwright smoke test (needs dev server + Ollama)

# From src-tauri/
cargo check              # Verify Rust compiles
cargo test               # 14 Rust unit tests
cargo clippy -- -D warnings  # Lint Rust (CI enforces zero warnings)
```

## 9 Agents
| Agent | Role | Key Constraint |
|-------|------|----------------|
| Alphonso | Local operator — execution, verification, packaging | General execution |
| Jose | Orchestrator — intake, routing, merge, confirm, report | Cannot bypass high-risk |
| Hector | Research + citations, source scan | No terminal/filesystem/posting |
| Miya | Creative — strategy, script, storyboard, export | No system commands |
| Maria | Governance, audit, risk, approval review | No destructive execution |
| Marcus | Approved distribution execution | Only approved paths |
| Echo | Memory historian and archival | Knowledge preservation only |
| Sentinel | Security monitoring, automation safety | Safety checks only |
| Nova | Scoring, analysis, opportunity prioritization | Analysis only |

## Key Architecture Rules
- **policyEnforcementService.js** is fail-closed — every outbound connector call goes through this gate
- **agentContractService.js** enforces per-agent allowed/blocked action prefixes
- **orchestrationQueueService.js** manages durable queue with dead-letter replay
- All 9 connectors (Telegram, WhatsApp, YouTube, Claude, ChatGPT, Notion, ClickUp, SD WebUI, ComfyUI) are policy-gated, not raw stubs
- `externalAgentAdapter.js` is the only intentional placeholder (returns "not_wired" for all providers)

## Do Not Duplicate
Before writing any new service, component, or feature, check `CLAUDE.md` "Do Not Duplicate" table at project root. 123 services already exist.

## Truth Source
`docs/ALPHONSO_GROUND_TRUTH.md` is the single source of truth. If any other document conflicts, trust the ground truth file.

## Version Rules
- v0.1.0: local install/build/test/release pipeline works
- v1.0.0: publicly installable + runtime proof — NOT achievable until: hosted updater, public installer, deployed gateway, component coverage >15%, E2E in CI
- Never promote to v1.0.0 until public install + proof are both real
- Never fake readiness — use truth labels: COMPLETE / PARTIAL / PLACEHOLDER / FAKE

## Known Staleness
- CLAUDE.md says "42 test files, 158 tests" — actual count is 47 test files, 180+ tests
- ARCHITECTURE.md says lib.rs "~7,200 lines" — actual is ~7,078
- Ground truth last verified 2026-06-01 — some gaps may have been addressed since
