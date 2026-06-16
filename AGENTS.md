# Alphonso — Agent Context

## Project Identity
- **App**: Alphonso — local-first AI desktop companion
- **Stack**: Tauri v2 (Rust backend) + React 18 (Vite 5, Tailwind 3) + Ollama (local LLM)
- **Version**: 2.0.0 (Enhanced agents, GitHub/Slack connectors, performance optimizations)
- **Target**: v2.0.0 = production-ready, enhanced agents, new connectors, performance optimized

## Directory Structure
```
src/                   React frontend (.jsx, not .tsx)
  agents/              9 agent profiles, permissions, schemas
  components/          82 UI components
  services/            124 services (policy-gated, not stubs)
    connectors/        GitHub, Slack, and other connector implementations
  hooks/               14 custom hooks (useAppShellState, useAppEffects split into 6)
  lib/                 Utilities (ollama.js, chatUtils.js, appStorage.js)
  test/                76 test files, 1015 tests (Vitest)
src-tauri/             Rust backend
  src/lib.rs           ~1,455 lines, 76 Tauri commands (across 16 modules)
  src/utils.rs         Shared utilities
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
e2e/                   Playwright E2E tests (smoke.spec.js, boot.spec.js)
gateway/               WhatsApp Cloud gateway (Railway-ready, not deployed)
docs/                  120+ documentation files
```

## Build & Test Commands
```bash
npm run dev              # Vite dev server (port 5173)
npm run test             # All 1015 tests across 76 files
npm run lint             # ESLint on src/
npm run build            # Vite production build (OXC compiler)
npm run verify:app       # lint + test + build in one command
npm run test:coverage    # Coverage report (actual: ~28%, threshold: 20%)
npm run test:e2e         # Playwright smoke test (needs dev server + Ollama)

# From src-tauri/
cargo check              # Verify Rust compiles
cargo test               # 14 Rust unit tests
cargo clippy -- -D warnings  # Lint Rust (CI enforces zero warnings)
```

## 9 Agents (Enhanced)
| Agent | Role | Key Constraint | New Capabilities |
|-------|------|----------------|------------------|
| Alphonso | Local operator — execution, verification, packaging | General execution | GitHub code search, issue/PR management, repo analysis |
| Jose | Orchestrator — intake, routing, merge, confirm, report | Cannot bypass high-risk | Parallel execution coordination |
| Hector | Research + citations, source scan | No terminal/filesystem/posting | GitHub research, open source analysis, trend discovery |
| Miya | Creative — strategy, script, storyboard, export | No system commands | Content Catalyst pipeline |
| Maria | Governance, audit, risk, approval review | No destructive execution | Enhanced compliance checks |
| Marcus | Approved distribution execution | Only approved paths | GitHub releases, Slack notifications |
| Echo | Memory historian and archival | Knowledge preservation only | Improved retrieval speed |
| Sentinel | Security monitoring, automation safety | Safety checks only | Optimized policy checks |
| Nova | Scoring, analysis, opportunity prioritization | Analysis only | Cached analytics |

## Key Architecture Rules
- **policyEnforcementService.ts** is fail-closed — every outbound connector call goes through this gate
- **licenseService.ts** — license tier validation (Free/Pro/Enterprise) gates premium connectors
- **agentContractService.ts** enforces per-agent allowed/blocked action prefixes
- **parallelExecutionService.ts** — parallel task execution with concurrency control and retry
- **cacheService.ts** — memory caching with TTL and LRU eviction
- **orchestrationQueueService.js** manages durable queue with dead-letter replay
- All 13 connectors (Telegram, WhatsApp, YouTube, GitHub, Slack, Claude, ChatGPT, Notion, ClickUp, SD WebUI, ComfyUI, Brave Search, Ollama) are policy-gated
- `externalAgentAdapter.js` is the only intentional placeholder (returns "not_wired" for all providers)
- Window close now calls `std::process::exit(0)` to prevent WebView2 zombie process leak

## Do Not Duplicate
Before writing any new service, component, or feature, check `CLAUDE.md` "Do Not Duplicate" table at project root. 124 services already exist.

## Truth Source
`docs/ALPHONSO_GROUND_TRUTH.md` is the single source of truth. If any other document conflicts, trust the ground truth file.

## Version Rules
- v0.1.0: local install/build/test/release pipeline works
- v1.0.0: publicly installable + runtime proof — achieved
- v1.0.2: WebView2 leak fix + boot optimizations — achieved
- v2.0.0: enhanced agents, GitHub/Slack connectors, performance optimizations — achieved
- Never fake readiness — use truth labels: COMPLETE / PARTIAL / PLACEHOLDER / FAKE

## Known Staleness
- ARCHITECTURE.md says lib.rs "~7,200 lines" — actual is ~1,455 (after 16 module extractions)
- Ground truth last verified 2026-06-15 — some gaps may have been addressed since
