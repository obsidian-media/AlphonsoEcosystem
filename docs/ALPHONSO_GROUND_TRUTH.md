# ALPHONSO — Agent Ground Truth & Shared Context
**Last verified:** 2026-06-03 — Session 5 complete  
**Verified by:** Claude Code (live filesystem + all 51 test files, 287+ tests passing, cargo clippy clean)  
**Purpose:** Single source of truth for any agent, Claude session, or human operator starting fresh. Read this before reading any other document. If this file conflicts with an audit report or summary doc, trust this file and update the other.

---

## HOW TO KEEP THIS FILE ACCURATE

This file must be updated whenever:
- A new agent persona is added to `src/agents/`
- A new service is added to `src/services/`
- A test file is added to `src/test/`
- A GitHub Actions workflow is added or changed
- A previously-open gap is closed (move it from "Real Gaps" to the relevant section)
- An audit or summary doc is produced — reconcile it against this file first

Do not trust any audit report, progress summary, or parallel-agent brief that has not been checked against this file. Past audits have contained significant errors (see "Known Audit Errors" section at the bottom).

---

## 1. Project Identity

| Field | Value |
|---|---|
| App name | Alphonso |
| Version | 0.1.0 |
| Type | Tauri v2 desktop app (Windows) |
| Project root | `C:\Users\Shaya\OneDrive\Desktop\ALPHONSO\FILES\local-agent-ui-v2` |
| Backend | Rust 1.77, Tauri 2.11, SQLite (rusqlite bundled), tokio, reqwest |
| Frontend | React 18, Vite 5, Tailwind 3, Lucide React — currently `.jsx` (not `.tsx`) |
| AI layer | Ollama local (`llama3.2:3b` default), Claude API, OpenAI API |
| Deployment | Windows NSIS + MSI installer, Railway static serve (gateway) |

---

## 2. Agent Roster — 9 Agents (not 4)

Every agent has a profile, permissions file, and schema in `src/agents/`. All 9 are registered in `src/agents/agentRegistry.js` and enforced by `src/services/agentContractService.js`.

**Note:** Agent orchestration in this project is managed via OpenCode (opencode.ai), an interactive CLI tool that provides specialized agent skills and subagents for software engineering tasks. OpenCode agents are distinct from the 9 Alphonso agents defined in `src/agents/`.

| Agent | Role | Key constraint |
|---|---|---|
| **Alphonso** | Local operator — execution, verification, packaging | General execution agent |
| **Jose** | Orchestrator — intake, routing, merge, confirm, report | Cannot bypass high-risk restrictions |
| **Hector** | Research + citations, source scan | Cannot execute terminal/filesystem/posting/purchase actions |
| **Miya** | Creative — strategy, script, storyboard, export | Cannot execute system commands or unapproved publishing |
| **Maria** | Governance, audit, risk, approval review | Does not perform destructive execution |
| **Marcus** | Approved distribution execution | Executes distribution only under approved paths |
| **Echo** | Memory historian and archival | Knowledge preservation only |
| **Sentinel** | Security monitoring, automation safety | Safety checks only, no destructive execution |
| **Nova** | Scoring, analysis, opportunity prioritization | Analysis only |

---

## 3. Service Layer — 65+ Services in `src/services/`

Key services that past audits missed or underestimated:

### Orchestration & Governance (fully implemented)
- `orchestrationQueueService.js` — durable queue with state transitions (`new → pending_approval → queued → reported_to_jose → dead_letter/failed`), dead-letter replay, manual interrupt
- `orchestrationReceiptService.js` — receipt events across all flows: assignment creation, policy blocks, retries, dead-letter, merge/confirm, pipeline completion
- `orchestrationGovernanceService.js` — governance layer over orchestration
- `joseCommandRouterService.js` — Jose intake, decomposition, routing
- `joseExecutionEngineService.js` — Jose execution engine
- `packetExecutionService.js` — packet-level execution

### Policy & Approval (fully implemented, fail-closed)
- `policyEnforcementService.js` — **centralized policy gate** enforcing: zero-cost mode, approval mode, connector risk classification, auth/allowlist checks. Fails closed with a blocked result object when uncertain or unauthorized.
- `connectorRegistryService.js` — all 9 connector send paths run through policy gate before any external call

### Agent Contracts (fully implemented)
- `agentContractService.js` — per-agent allowed/blocked action prefixes, checked before packet execution
- `agentBusService.js` — inter-agent messaging bus

### Memory & Knowledge
- `memoryService.js` — general memory with governance metadata (workflow owner, sensitivity, retention, privacy)
- `durableMemoryService.js` — SQLite-backed durable memory
- `miyaMemoryService.js` — Miya-specific memory
- `workflowMemoryService.js`, `workflowReceiptService.js`, `workflowTelemetryService.js`
- `sessionIntelligenceService.js`, `workspaceIntelligenceService.js`
- `sourceConfidenceService.js`, `trustModel.js`, `verificationService.js`

### Connector & External
- `connectorRegistryService.js` — all outbound connector paths (policy-gated)
- `whatsappWebhookService.js` — WhatsApp webhook handling
- `marcusPublishService.js` — Marcus-governed distribution
- `metaPublishService.js` — Meta/Instagram publishing
- `hectorResearchService.js` — Hector live research
- `toolConnectionService.js`, `toolNotificationDispatcher.js`

### Workflow Operations (10 structured workflows)
- `workflowOperationsRegistryService.js` — Marketing Ops, Social Media, Content Production, Learning, Startup/Product Dev, Opportunity Discovery, Construction Ops, Knowledge Preservation, Content Repurposing, Automation Governance
- `workflowExecutionService.js`, `workflowBuilderService.js`, `workflowGovernanceService.js`

### Self-Development & Release
- `selfDevelopmentService.js`, `nativeSelfDevelopmentAutostartService.js`
- `productionReadinessService.js`, `rc0EvidenceService.js`, `nativeRc0ProofService.js`
- `runwayService.js`, `appUpdateService.js`
- `repoAuditService.js`

### Other
- `pluginSandboxService.js`, `pluginRegistryService.js`
- `recoveryService.js`, `runtimeLedgerService.js`
- `screenIntelligenceService.js`, `voiceService.js`
- `chatPersistenceService.js`, `notificationService.js`
- `coachModeService.js`, `skillPackService.js`
- `localMarketplaceService.js`, `resourceCostService.js`
- `devPacketService.js`, `serviceScopes.js`
- `agentAvatarService.js`, `agentVisualService.js`
- `devPacketService.js`

---

## 4. Test Suite — 51 Files in `src/test/` (not zero)

The test suite exists and is substantial. Any agent or audit that says "no test suite" or "zero coverage" is wrong.

**Test files (verified 2026-06-03):**
```
accBridgeService.test.js
agentSkills.test.js
approvalEnforcement.test.js
connectorRegistryService.test.js
contentCatalystBridgeService.test.js
contentCatalystService.test.js
devPacketService.test.js
hectorResearchService.test.js
joseCommandRouterService.test.js
joseExecutionEngineService.test.js
josePipelineE2E.test.js
joseZeroCostRouting.test.js
miyaExportPacketService.test.js
miyaWorkflowTemplates.test.js
ollamaReadinessGuide.test.js
ollamaState.test.js
operatorDashboard.test.jsx
pluginSandboxService.test.js
productionReadinessService.test.js
recoveryService.test.js
runtimeLedgerService.test.js
runwayService.test.js
selfDevelopmentService.test.js
setupTests.js
telegramConnectorProof.test.js
toolConnectionLiveProof.test.js
toolConnectionService.test.js
toolNotificationDispatcher.test.js
TrustReceiptBrowser.test.jsx
updaterReleaseUtils.test.js
whatsappCloudGateway.test.js
whatsappCloudGatewayRuntime.test.js
whatsappGatewaySecurity.test.js
whatsappWebhookService.test.js
workflowDurabilityHydration.test.js
workflowExecutionService.test.js
workspaceRootService.test.js
```

**What agents working on testing should focus on:**
- Run the existing tests and measure actual pass rate: `npm run test`
- Measure coverage (not yet configured with thresholds)
- Fix any failing tests
- Add GitHub Actions coverage threshold gate
- Add Rust unit tests (these do not exist yet — Rust-side is the real gap)
- Add Playwright E2E smoke test

---

## 5. CI/CD — Two Workflows Already Exist

**`.github/workflows/ci.yml`** — runs on push/PR to main:
- `npm ci` → lint → `npx vitest run --reporter=verbose` → `npm run build`
- `rust-quality` job: `cargo clippy -- -D warnings` + `cargo test`
- On main branch only: Tauri desktop build + NSIS artifact upload

**`.github/workflows/verify-app.yml`** — runs on push/PR to main:
- `npm ci` → `npm run verify:app` (lint + test + build in one command)

**CI status as of 2026-06-01:** Both workflows passing green on `main` (commit `f8e82f1`).

**`.npmrc`** — `legacy-peer-deps=true` required because `@eslint/js@10.x` and `eslint@9.x` are in `package.json` together (peer dep mismatch). Without this, `npm ci` fails with ERESOLVE.

**What does NOT exist yet:**
- ~~Rust `cargo test` step in CI~~ → **DONE** — `rust-quality` job in `ci.yml`
- ~~`cargo clippy` step in CI~~ → **DONE** — included in `rust-quality` job with `-D warnings`
- ~~Coverage threshold enforcement in CI~~ → **DONE** — threshold at **12%** in `vite.config.js`, actual measured **27.83%** (src/ scoped). Coverage include scoped to `src/**/*.{js,jsx,ts,tsx}`. 5 new test files added: `appStorage.test.js`, `chatUtils.test.js`, `ollamaUtils.test.js`, `trustModel.test.js`, `connectorAuditLogService.test.js`, `sourceConfidenceService.test.js`.
- ~~Playwright E2E~~ → **FULLY INSTALLED 2026-06-01 Session 4** — `@playwright/test@1.60.0` installed, Chromium browser installed via `npx playwright install chromium`. Run: `npm run test:e2e` (requires dev server on :5173 + Ollama running).

---

## 6. npm Scripts — Full List

```
dev                      node scripts/run-vite-dev.mjs
desktop:dev              npx.cmd tauri dev
build                    node scripts/run-vite-build.mjs
start                    node scripts/run-vite-preview.mjs
test                     node scripts/run-vitest-programmatic.mjs src
test:watch               node scripts/run-vitest-programmatic.mjs --watch src
lint                     eslint src
verify:app               npm run lint && npm run test && npm run build
verify:desktop:preflight node scripts/verify-desktop-preflight.mjs
verify:desktop           node scripts/verify-desktop.mjs
updater:keygen           node scripts/setup-updater-signing.mjs --generate-only
updater:setup            node scripts/setup-updater-signing.mjs
updater:verify           node scripts/verify-updater-readiness.mjs
release:updater          node scripts/release-updater.mjs
verify:ollama            node scripts/verify-ollama-runtime.mjs
proof:native-selfdev     node scripts/proof-native-selfdev.mjs
proof:rc0                node scripts/proof-native-selfdev.mjs --rc0
auth:youtube             node scripts/auth-youtube.mjs
auth:meta                node scripts/auth-meta.mjs
auth:outlook             node scripts/auth-outlook.mjs
preview                  node scripts/run-vite-preview.mjs
tauri                    tauri
```

---

## 7. Connector Status — Policy-Gated, Not Raw Stubs

All outbound connector paths run through `policyEnforcementService.js` before any external call. They are not raw stubs.

| Connector | Frontend path | Rust command | Live status |
|---|---|---|---|
| Telegram | `connectorRegistryService.sendTelegramConnectorMessage` | Yes | Credential-dependent |
| WhatsApp outbound | `connectorRegistryService.sendWhatsAppConnectorMessage` | Yes | Credential-dependent |
| WhatsApp inbound (Twilio poll) | `whatsappWebhookService.js` | Yes | Credential-dependent |
| WhatsApp inbound (Cloud webhook) | Payload normalizer exists | Not deployed | Requires hosted endpoint |
| YouTube upload | `connectorRegistryService.uploadYouTubeConnectorVideo` | Yes | OAuth-dependent |
| Notion | `connectorRegistryService.sendNotionConnectorEntry` | Yes | Token-dependent |
| ClickUp | `connectorRegistryService.sendClickUpConnectorTask` | Yes | Token-dependent |
| Claude | `connectorRegistryService.sendClaudeConnectorMessage` | Yes | API key-dependent |
| ChatGPT/OpenAI | `connectorRegistryService.sendChatGptConnectorMessage` | Yes | API key-dependent |
| SD WebUI | `connectorRegistryService.generateSdWebUiImage` | Yes | Local service-dependent |
| ComfyUI | `connectorRegistryService.queueComfyUiVideo` | Yes | Local service-dependent |

All paths: fail-closed on missing credentials, blocked in zero-cost mode unless explicitly overridden, approval-gated for risky external actions.

---

## 8. Real Gaps — What Actually Needs Work

These are confirmed gaps as of 2026-05-31. Any agent working on these areas should check current state before implementing — some may have been partially addressed since this file was last updated.

### SECURITY
- [x] **CSP fixed** — `"security": { "csp": null }` replaced with full production policy string in `tauri.conf.json` (2026-05-31, Agent A). See `docs/SECURITY_CONFIG_REPORT.md`.
- [x] **GPU flags removed** — `--disable-gpu --disable-gpu-compositing --use-angle=swiftshader` deleted; hardware acceleration now active (2026-05-31, Agent A).
- [x] **Window size fixed** — changed to 1280×800, `minWidth: 1024`, `minHeight: 700` (2026-05-31, Agent A)
- [x] **.env.example sanitized** — real phone numbers in `WHATSAPP_ALLOWED_NUMBERS` replaced with placeholders (2026-05-31, Agent A)
- [x] **.gitignore verified** — `.env`, `.env.*`, `.tauri-updater-key`, `.tauri-updater-key.pub` all correctly excluded
- [x] **Git history audit** — DONE (2026-06-01, Session 3). `git log --follow -- .env` returned empty — `.env` was NEVER committed. History is clean. No rotation needed.
- [x] **Tauri capability scoping** — DONE (2026-06-01, Session 3). Findings: `src-tauri/capabilities/default.json` grants only `core:default`, `notification:default`, `global-shortcut:default`. All file-write commands include path-traversal guards. One mild finding: `check_env_vars_presence` accepts arbitrary env var names (probes presence only, no value leakage). No action required; document for awareness.

### RUST BACKEND
- [x] **`lib.rs` modular split started** — Phase 1 extraction done (2026-06-01, Session 3): `src-tauri/src/whatsapp_webhook.rs` created (~220 lines). Moved: `verify_whatsapp_cloud_webhook_challenge`, `verify_whatsapp_cloud_webhook_signature`, `normalize_whatsapp_cloud_inbound` + 4 structs (`ConnectorInboundMessage`, `WhatsAppWebhookVerifyProof`, `WhatsAppWebhookSignatureProof`, `WhatsAppCloudInboundNormalizeProof`). `now_ms`/`to_hex` marked `pub(crate)`. **lib.rs is now ~7,100 lines.** `cargo check` clean, `cargo clippy -- -D warnings` clean.
- [x] **lib.rs KV store split** — `src-tauri/src/kv_store.rs` created (2026-06-01, Session 4): `ensure_kv_table`, `kv_set`, `kv_get`, `save_settings`, `load_settings` extracted. `open_memory_db` marked `pub(crate)`. **lib.rs now ~6,993 lines.** `cargo check` + `cargo clippy -- -D warnings` clean.
- [ ] **lib.rs further splitting** — Next candidate: Telegram connector block (~lines 1543–1757 in original, now shifted).
- [x] **Rust unit tests added** — 14 tests in `#[cfg(test)] mod tests` covering `allowed_program`, `plugin_blocked_token_present`, `validate_plugin_extra_args`, `trim_trailing_slashes`, `wal_pragma_applies_on_in_memory_db`, `to_hex` — all passing (verified `cargo test` 2026-05-31, Agent D)
- [x] **Shared `reqwest::Client`** — built at startup, registered via `.manage()`, used by `connector_poll_telegram`, `connector_send_telegram`, `connector_send_chatgpt`, `connector_send_claude` (2026-05-31, Agent D).
- [x] **SQLite WAL mode + cache** — `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-65536;` in `open_memory_db()` — 64MB page cache added (2026-06-01, Agent 3)
- [x] **`unwrap()` audit done** — 1 runtime `.unwrap()` found, replaced with safe `match + continue`. Two startup-only `.expect()` calls intentionally kept.
- [x] **Clippy clean** — All 27 pre-existing clippy warnings fixed (2026-06-01, Session 3): `&PathBuf→&Path` in 7 functions across `lib.rs`/`runway.rs`, identity map removed, `.clamp()` used, `sort_by_key`, `#[allow(too_many_arguments)]` on 3 functions. `cargo clippy -- -D warnings` now passes on CI.

### FRONTEND
- [x] **TypeScript foundation added** — `tsconfig.json` + `tsconfig.node.json` created at project root (`strict: false`, `allowJs: true` for safe incremental migration). TypeScript installed as devDependency (2026-05-31, Agent E)
- [x] **`memoryService.ts` created** — first TypeScript service migration with `MemoryRecord`, `MemoryWriteOptions`, `MemoryFilters` interfaces. Original `.js.bak` preserved. Vite resolves `.ts` before `.js` so all importers pick it up automatically (2026-05-31, Agent E)
- [x] **`serviceScopes.js` documented** — all 24 exported constants have JSDoc comments (what data, which service owns it) (2026-05-31, Agent E)
- [x] **Duplicate Vite config removed** — `vite.config.cjs` deleted; `vite.config.js` is now the only config (2026-05-31, Agent E)
- [ ] **Remaining 50+ services still `.js`** — migration pattern documented in `docs/FRONTEND_MIGRATION_REPORT.md`; do next services in order listed there
- [x] **`alphonso_settings` → SQLite** — already done (Sessions 3). Both persist to localStorage + SQLite; SQLite hydrated on boot.
- [x] **`alphonso_conversations` → SQLite** — DONE (2026-06-01, Session 4): `App.jsx` now calls `invoke('kv_set', ...)` on every conversations change and hydrates from `kv_get` on boot. localStorage kept as fallback.
- [x] **`alphonso_connector_auth_profiles_v1` → SQLite** — DONE (2026-06-03, Session 5): persisted via `kv_set`/`kv_get` with localStorage fallback.
- [x] **`alphonso_connector_registry_v2` → SQLite** — DONE (2026-06-03, Session 5): persisted via `kv_set`/`kv_get` with localStorage fallback.
- [ ] **localStorage + SQLite remaining 1 key** — `alphonso_messages_${id}` (partially via chatPersistenceService). `kv_set`/`kv_get` commands exist for all.

### TESTING
- [x] **Coverage threshold** — set to 9% in `vite.config.js` (actual measured: 9.22%). Staged path: write tests to hit 12→20→30. `@vitest/coverage-v8@2.1.9` installed and version-matched.
- [x] **Vitest scoped to src/** — `include: ['src/**/*.{test,spec}.{js,jsx}']` added to prevent Vitest from picking up Playwright `e2e/` files.
- [x] **`cargo test` + `cargo clippy` in CI** — `rust-quality` job passing; `clippy -- -D warnings` now clean.
- [x] **Rust unit tests** — 14 tests added, all passing.
- [x] **Playwright scaffold** — `playwright.config.js` + `e2e/smoke.spec.js` created (2026-06-01). `@playwright/test` added to `package.json`. To run: `npm install --save-dev @playwright/test && npx playwright install chromium && npm run test:e2e`. Requires: dev server on :5173 and Ollama running.
- [x] **Test suite confirmed passing** — **51 test files, 287+ tests, all passing** (verified 2026-06-03, Session 5). 9 new test files added since Session 4: `appStorage.test.js`, `chatUtils.test.js`, `ollamaUtils.test.js`, `trustModel.test.js`, `connectorAuditLogService.test.js`, `sourceConfidenceService.test.js`, `orchestrationQueueService.test.js`, `orchestrationReceiptService.test.js`, `orchestrationGovernanceService.test.js`.

### CONNECTORS & FEATURES
- [x] **Claude + ChatGPT structured error handling** — both connectors now return `{ success, code, error }` with codes `MISSING_KEY`, `TIMEOUT`, `RATE_LIMITED`. 30s timeout, pre-flight key check (2026-05-31, Agent F)
- [x] **Brave Search for Hector** — `search_brave_sources` Rust command exists (line 5965 in lib.rs). Added frontend `searchBrave()` with dual-path: Rust first, then `VITE_BRAVE_SEARCH_API_KEY` frontend fallback (2026-05-31, Agent F)
- [x] **Model switcher UI** — `src/components/ModelSwitcher.jsx` created. Fetches Ollama `/api/tags`, shows dropdown in ChatView header, persists to `alphonso_selected_model_v1`, shows "Ollama offline" pill if unreachable (2026-05-31, Agent F)
- [x] **Connector health dashboard** — `ConnectorHealthPanel.jsx` with status for all 11 connectors (2026-05-31, Agent C)
- [ ] **WhatsApp Cloud inbound webhook** — normalizer exists, but hosted endpoint + signature validation not deployed
- [x] **Hector research persistence** — `persistResearchResult(query, results)` added to `hectorResearchService.js`; called at all exit points of `discoverResearchSourcesBrave`; writes via `pushMemoryItem` with `category: 'research_memory'` (2026-06-01, Agent 4)
- [ ] **True streaming for Claude/ChatGPT** — currently one-shot invoke; SSE/streaming path not yet implemented

### INFRASTRUCTURE & DOCS
- [x] **`ARCHITECTURE.md`** — created at project root: full stack, IPC flow, 9-agent roster, orchestration flow, service groups, storage model, security model, deployment (2026-05-31, Agent H)
- [x] **`CLAUDE.md`** — created at project root: session-start guide, all npm + cargo commands, do-not-duplicate table, real gaps, directory tree (2026-05-31, Agent H)
- [x] **`docs/CONNECTORS.md`** — all 11 connectors documented: env vars, credential steps, test procedure, limitations (2026-05-31, Agent H)
- [x] **`docs/CHANGELOG.md`** — created with Unreleased entries for all Agent A–D changes + [0.1.0] summary (2026-05-31, Agent H)
- [x] **`.github/dependabot.yml`** — npm (weekly), Cargo (weekly), GitHub Actions (weekly) (2026-05-31, Agent H)
- [ ] **Auto-updater signing pipeline** — `release:updater` script exists; full key management + hosted signed manifest not finalized
- [ ] **Gateway Dockerfile** — `gateway/` service not containerized
- [ ] **Branch protection on `main`** — CI not yet required before merge

### PERFORMANCE
- [x] **Lazy loading** — 14 heavy views lazy-loaded. Session 2 added 3 more. Main chunk history: 331KB → 320KB (session 2) → **330KB** (session 3 temporarily, when `ConnectorHealthPanel` was pulled into main via `Sidebar.jsx` static import) → **330KB fixed** (session 3 fix: `ConnectorStatusIndicators.jsx` extraction restores `ConnectorHealthPanel` as a proper 9.7KB lazy chunk). Net: main bundle 330KB.
- [ ] **Image asset compression** — mascot PNGs/WebPs still heavy in build output (jose: 236KB, alphonso: 243KB)

### TOOLING
- [x] **eslint-plugin-security** — installed + wired in `eslint.config.js` (2026-05-31, autonomous)
- [x] **eslint-plugin-react-hooks** — already in config pre-session; confirmed present
- [x] **TypeScript** — installed as devDependency; `tsconfig.json` + `tsconfig.node.json` created (2026-05-31, Agent E)

### UX/UI
- [x] **Connector health dashboard** — `src/components/ConnectorHealthPanel.jsx` created with `ConnectorHealthPanel` (full panel), `ConnectorStatusStrip` (compact sidebar count), `ConnectorStatusDot` (per-connector dot). Mounted as `connectors` tab in `src/App.jsx` (2026-05-31, Agent C)
- [x] **Sidebar connector status** — `src/components/Sidebar.jsx` updated with "Connectors" nav item + inline `ConnectorStatusStrip` showing live/missing/disabled counts (2026-05-31, Agent C)
- [x] **Approval modal improved** — `src/components/ApprovalModal.jsx` now shows connector badge, colored risk level (high/medium/low), irreversibility warning banner, red confirm button for high-risk actions — backward compatible with existing `label` prop (2026-05-31, Agent C)
- [ ] **No onboarding flow** — first-launch experience does not guide through Ollama check → model download → connector setup
- [x] **Dark/light theme toggle** — `Sidebar.jsx` has Moon/Sun toggle persisting to `alphonso_theme_v1`; applies `.light` class to `<html>`; basic CSS variables in `index.css` (2026-06-01, Agent 1). Full Tailwind token propagation is a future task.
- [ ] **Toast notifications** — `ToastProvider` already mounted in `main.jsx`; inbound message toasts already wired in `App.jsx` — no gap here

---

## 9. What Has Been Built — Do NOT Duplicate

Before writing any new service or feature, verify it does not already exist:

- **Connector health UI** → `src/components/ConnectorHealthPanel.jsx` — full panel (lazy-loaded from App.jsx). `ConnectorStatusStrip` and `ConnectorStatusDot` live in **`src/components/ConnectorStatusIndicators.jsx`** (small, statically importable). Do NOT import `ConnectorStatusStrip`/`ConnectorStatusDot` directly from `ConnectorHealthPanel.jsx` in static contexts — use `ConnectorStatusIndicators.jsx` to avoid lazy-chunk collapse.
- **Approval modal** → `src/components/ApprovalModal.jsx` — already shows connector, risk level, irreversibility warning
- **Toast notifications** → `ToastProvider` already in `main.jsx`, inbound toasts already wired in `App.jsx`
- **Policy enforcement** → `policyEnforcementService.js` (do not recreate approval/risk logic)
- **Orchestration queue + receipts** → `orchestrationQueueService.js` + `orchestrationReceiptService.js`
- **Dead-letter replay** → already in `orchestrationQueueService.js`
- **Zero-cost mode** → enforced in Jose routing and `policyEnforcementService.js`
- **Agent contracts/boundaries** → `agentContractService.js` (do not add per-agent logic elsewhere)
- **10 workflow operations** → `workflowOperationsRegistryService.js`
- **Updater release script** → `npm run release:updater` (do not write a new one)
- **Architecture doc** → `ARCHITECTURE.md` at project root
- **Developer guide** → `CLAUDE.md` at project root (read at every session start)
- **Connector docs** → `docs/CONNECTORS.md`
- **Changelog** → `docs/CHANGELOG.md` — add to this, don't create a new one
- **Dependabot** → `.github/dependabot.yml` already exists
- **ModelSwitcher** → `src/components/ModelSwitcher.jsx` — Ollama model dropdown, already mounted in ChatView. Fixed 2026-06-01: now syncs model to parent on mount (was blocking all chat responses)
- **AgentActivityLog** → `src/components/AgentActivityLog.jsx` — activity timeline tab, auto-refreshes every 3s
- **connectorAuditLogService** → `src/services/connectorAuditLogService.js` — ring buffer for last 100 connector call results
- **Brave Search** → already wired in `hectorResearchService.js` with Rust + VITE_ fallback
- **Auth scripts** → `auth:youtube`, `auth:meta`, `auth:outlook` already exist
- **Desktop preflight/verify** → `verify:desktop:preflight`, `verify:desktop` already exist
- **CI workflows** → `ci.yml` and `verify-app.yml` already exist and passing green (extend, do not replace)
- **WhatsApp webhook Rust module** → `src-tauri/src/whatsapp_webhook.rs` — `verify_whatsapp_cloud_webhook_challenge`, `verify_whatsapp_cloud_webhook_signature`, `normalize_whatsapp_cloud_inbound` + 4 structs live here. Do not re-add to `lib.rs`.
- **KV store Rust module** → `src-tauri/src/kv_store.rs` — `kv_set`, `kv_get`, `save_settings`, `load_settings`, `ensure_kv_table`. Do not re-add to `lib.rs`.
- **Multi-turn Ollama chat** → `src/lib/ollama.js` — `generateOllamaChatStream` uses `/api/chat` endpoint with full `messages` array. `ChatView.jsx` captures history snapshot before state updates and passes it. Do not recreate.
- **appendAgentActivity wiring** → wired in `joseExecutionEngineService.js` (`executeAssignment`) and `connectorRegistryService.js` (`appendConnectorAudit`). Both import from `../components/AgentActivityLog`.
- **Playwright browser installed** → `@playwright/test@1.60.0` + Chromium installed. `npm run test:e2e` is ready to run (needs dev server + Ollama).
- **Playwright config** → `playwright.config.js` at project root; tests in `e2e/`. Do not create another E2E config.
- **`.npmrc`** — `legacy-peer-deps=true` already set at project root. Do not remove.

---

## 10. Global Rules for Every Agent

- Read this file before any other document.
- Inspect the actual filesystem before assuming anything is missing or present.
- Do not commit, print, copy, or expose secret values. If you find secrets, report variable names only.
- Do not fake completed work. Mark scaffold/partial items explicitly.
- Keep changes scoped to your assignment.
- Leave a final report with: files changed, completed, not completed, risks, how to test, next step.
- If you add a service, test, workflow, or agent, update this file.

---

## 11. Known Audit Errors (for future reference)

These errors appeared in `ALPHONSO-AUDIT-2026-05-31.md` and `ALPHONSO_PARALLEL_SUBAGENTS_2026-05-31.md`. They are recorded here so future sessions do not repeat them.

| What the audit said | What is actually true |
|---|---|
| "No real test suite — zero coverage, no test files found" | 37 test files exist in `src/test/` covering Jose pipeline, connectors, Ollama, approval enforcement, WhatsApp, workflows, and more |
| "Testing score: 4.0/10 F" | The gap is Rust tests + coverage thresholds + E2E, not absence of tests |
| "Claude and ChatGPT connectors are frontend-only stubs" | Both run through `policyEnforcementService.js` and `connectorRegistryService.js` with policy gating, audit receipts, and fail-closed behavior |
| "4 agent personas: Alphonso, Jose, Hector, Miya" | 9 agents: + Maria, Marcus, Echo, Sentinel, Nova — all with profile + permissions files and `agentContractService.js` enforcement |
| "No CI/CD" (implied by Testing F grade) | Two GitHub Actions workflows already exist: `ci.yml` and `verify-app.yml` |
| ".env not in .gitignore" (implied) | `.env` and `.env.*` are correctly listed in `.gitignore`; the concern is git history, not current config |

**Root cause of all errors:** The audit was produced without reading `src/test/`, `src/agents/`, all of `src/services/`, or `.github/workflows/`. Future audits must verify all four directories before scoring any dimension.

---

_Last verified: 2026-06-03 — Session 5 complete. 51 test files, 287+ tests, all passing. Coverage 27.83% (threshold 12%, src/ scoped). cargo clippy clean. Run `npm run verify:app` and `cargo clippy -- -D warnings` from src-tauri/ to re-verify._
