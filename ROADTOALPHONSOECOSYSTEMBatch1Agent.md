# ROAD TO ALPHONSO ECOSYSTEM — 10/10

**Version baseline:** v2.4.4 | **Date:** 2026-06-29  
**Goal:** Production-grade, secure, fully-tested, 10/10 maturity  
**Strategy:** Two parallel agent batches working on separate branches, each committing after every phase.

---

## HOW TO USE THIS DOCUMENT

- **BATCH 1** → `feat/batch1-security-infra-bobibm` branch
- **BATCH 2** → `feat/batch2-testing-completeness` branch
- Each agent works **independently** — no shared files between batches until merge
- After all phases complete: merge both into `main`, update all docs, cut v2.5.0

---

## FIRST MESSAGE TO BATCH 1 AGENT

```
You are BATCH 1 agent for the Alphonso Ecosystem roadmap.
Working directory: D:\AgentDevWork\repos\AlphonsoEcosystem
Branch: feat/batch1-security-infra (create it from main)

Your mission: Fix the boot crash, harden the Rust/JS security surface,
plug policy gate bypasses, and fix infrastructure gaps.

Start with Phase 1 (boot crash) — the app currently crashes on launch with:
  ReferenceError: Cannot access 'st' before initialization
  at fl (index-FIxVIgkF.js:24:28212)

This is a Temporal Dead Zone error in the Vite/OXC-compiled bundle.
The OXC compiler (Vite 8 + @vitejs/plugin-react-oxc) may reorder
module-level initializations differently than the classic Rollup path.

Read ROADTOALPHONSOECOSYSTEM.md fully before starting.
Commit after every phase. Update CLAUDE.md + ALPHONSO_GROUND_TRUTH.md
after every batch of changes.
```

---

## FIRST MESSAGE TO BATCH 2 AGENT

```
You are BATCH 2 agent for the Alphonso Ecosystem roadmap.
Working directory: D:\AgentDevWork\repos\AlphonsoEcosystem
Branch: feat/batch2-testing-completeness (create it from main)

Your mission: Fix failing tests, expand coverage across 58 untested services,
enrich Echo/Sentinel/Nova agent profiles, complete the voice backend,
wire the dead policyDslService, and improve UX discoverability.

Do NOT touch Rust files or security-critical JS gating logic — that is BATCH 1.
Focus entirely on tests, profiles, voice, and UX.

Read ROADTOALPHONSOECOSYSTEM.md fully before starting.
Commit after every phase. Update CLAUDE.md + ALPHONSO_GROUND_TRUTH.md
after every batch of changes.
```

---

## BATCH 1 — Security · Rust Hardening · Infrastructure

Branch: `feat/batch1-security-infra`

---

### BATCH 1 — Phase 0: Boot Crash Fix (BLOCKER — do this first)

**Problem:** App crashes on every launch with:
```
ReferenceError: Cannot access 'st' before initialization
  at fl (http://tauri.localhost/assets/index-FIxVIgkF.js:24:28212)
```

**Root cause hypothesis:** OXC compiler (Vite 8 + `@vitejs/plugin-react-oxc`) reorders
module initialization differently than classic Rollup. A `const`/`class` at module scope
is referenced before it is initialized in the bundled output.

**Tasks:**

- [ ] **B1-P0-T1: Identify the crashing symbol**
  - Run `npm run build` to get a fresh bundle with source maps
  - Use `npx source-map-explorer dist/assets/index-*.js` or open Chrome DevTools
  - Map minified `st` / function `fl` back to the original source symbol
  - Look in: `src/App.tsx`, context providers, any file that exports a `const` that
    is used at module-level by another file (not inside a function)

- [ ] **B1-P0-T2: Reproduce in dev mode**
  - Run `npm run dev` (Vite dev, not bundled)
  - If crash does NOT happen in dev: the bug is in the OXC bundler output, not source
  - If crash DOES happen in dev: it is a genuine circular/TDZ issue in source

- [ ] **B1-P0-T3: Try switching compiler to verify**
  - In `vite.config.js` temporarily switch from `@vitejs/plugin-react-oxc`
    to `@vitejs/plugin-react` (classic SWC/Babel path)
  - Build and test: if crash disappears, the OXC plugin has a bug with this code pattern
  - This narrows root cause to compiler vs source

- [ ] **B1-P0-T4: Fix the identified initialization**
  - If OXC bug: wrap the problematic export in a lazy getter or move to a
    function-scoped constant (not module-level)
  - If source bug: fix the circular/early-use pattern directly
  - Ensure `npm run test` still passes after fix

- [ ] **B1-P0-T5: Verify app launches cleanly**
  - Run `npm run tauri dev` (or `npm run dev` for web mode)
  - Confirm no boot error in console
  - Commit: `fix(boot): resolve TDZ crash on app launch`

- [ ] **B1-P0-T6: Update docs**
  - Update `ALPHONSO_GROUND_TRUTH.md` — note boot crash resolved, root cause found
  - Update `CLAUDE.md` if the fix requires a permanent pattern change

---

### BATCH 1 — Phase 1: Critical Security Fixes

**Tasks:**

- [ ] **B1-P1-T1: Purge iOS certs from git (C-1)**
  - Files: `scripts/certs/private_key.pem`, `private_key_rsa.pem`, `key_only.pem`, `combined.pem`
  - Run: `git rm --cached -r scripts/certs/`
  - Use `git filter-branch` or `bfg-repo-cleaner` to purge from full history
  - Add `scripts/certs/` to `.gitignore` if not already fully covered
  - **Alert user to rotate the iOS Distribution certificate in Apple Developer Portal**
  - Commit: `security(C-1): remove iOS certs from git history, update gitignore`

- [ ] **B1-P1-T2: Path validation — transcribe_audio_file (C-4)**
  - File: `src-tauri/src/workspace.rs` around line 1874
  - Add `fs::canonicalize(&audio_path)?` and verify result starts with allowed runtime path
  - Pattern to follow: `write_workspace_text_file` (line 761–764) already does this correctly
  - Add Rust unit test for the path validation
  - Commit: `security(C-4): add canonicalize + starts_with guard to transcribe_audio_file`

- [ ] **B1-P1-T3: Path validation — save_image_to_folder (C-5)**
  - File: `src-tauri/src/lib.rs` around line 1506
  - Canonicalize `folder + filename`, verify starts with workspace root or allowed output dir
  - Commit: `security(C-5): add path traversal protection to save_image_to_folder`

- [ ] **B1-P1-T4: Add policy gate to 6 bypass connectors (C-2)**
  - Files: `deepseekConnector.js`, `perplexityConnector.js`, `tavilyConnector.js`,
    `n8nConnector.js`, `githubConnector.ts`, `slackConnector.ts`
  - Import `gateConnectorAction` from `connectorRegistry.js`
  - Add `const gate = await gateConnectorAction(connectorId, action, payload, options)`
    before every `fetch()` call; return early if `!gate.ok`
  - Commit: `security(C-2): wire policy gate to 6 browser-only connectors`

- [ ] **B1-P1-T5: Add policy gate to getComfyUiVideoHistory (C-3)**
  - File: `src/services/connectors/connectorImageGenerators.js` around line 323
  - Add `gateConnectorAction('comfyui_video', 'video_history', ...)` before line 334
  - Commit: `security(C-3): add policy gate to getComfyUiVideoHistory`

- [ ] **B1-P1-T6: Fix OAuth scripts — add state param + redact tokens (C-6)**
  - Files: `scripts/auth-youtube.mjs`, `scripts/auth-meta.mjs`, `scripts/auth-outlook.mjs`
  - Generate `crypto.randomUUID()` as `state`, include in auth URL, validate in callback
  - Replace `console.error('Raw response:', JSON.stringify(tokens, null, 2))` with
    redacted output: log only `error_description`, never raw token fields
  - Commit: `security(C-6): add OAuth state param and redact token error logs`

- [ ] **B1-P1-T7: Update docs after Phase 1**
  - Update `ALPHONSO_GROUND_TRUTH.md` — security status section
  - Update `CLAUDE.md` — note all 6 critical findings addressed

---

### BATCH 1 — Phase 2: High-Severity Security Fixes

- [ ] **B1-P2-T1: Remove shell interpreters from allowed programs (H-1)**
  - File: `src-tauri/src/policy_gate.rs` lines 24, 34
  - Remove `cmd.exe`, `powershell.exe`, `pwsh.exe` from `allowed_program()`
  - If shell access is required for a specific command, create a dedicated Tauri command
    with validated argument structure instead
  - Run `cargo clippy -- -D warnings` and `cargo test` after change
  - Commit: `security(H-1): remove shell interpreters from allowed_program list`

- [ ] **B1-P2-T2: Add private IP blocking to SSRF surfaces (H-3, H-4)**
  - File: `src-tauri/src/lib.rs` around line 1218 (`fetch_url_content`)
  - File: `src-tauri/src/search.rs` around line 247 (`fetch_research_sources`)
  - Block: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `::1`
  - Parse the URL host, resolve to IP, check against blocklist before making request
  - Add unit tests for the IP blocking logic
  - Commit: `security(H-3,H-4): add private IP blocklist to fetch commands (SSRF fix)`

- [ ] **B1-P2-T3: Add symlink-escape protection to workspace read/delete/move (H-5)**
  - File: `src-tauri/src/workspace.rs` lines 995–1122
  - Add `fs::canonicalize()` + `starts_with(&root_abs)` to:
    `read_workspace_file`, `delete_workspace_file`, `move_workspace_file`
  - Pattern to follow: `write_workspace_text_file` at line 761–764
  - Commit: `security(H-5): add symlink escape protection to workspace file ops`

- [ ] **B1-P2-T4: Protect watch_inbox_poll absolute path (H-6)**
  - File: `src-tauri/src/workspace.rs` around line 1939
  - Canonicalize absolute inbox paths, verify they start with canonicalized workspace root
  - Commit: `security(H-6): canonicalize inbox path in watch_inbox_poll`

- [ ] **B1-P2-T5: Redact gateway /health endpoint (H-7)**
  - File: `gateway/whatsapp-cloud/src/server.js` around line 72
  - Change response to: `{ ok: true, status: "ready" }` — remove secret config state
  - Optionally add rate limiting to `/health`
  - Commit: `security(H-7): redact health endpoint, remove config state leak`

- [ ] **B1-P2-T6: Add exception safety to gateConnectorAction (M-2)**
  - File: `src/services/connectors/connectorRegistry.js` around line 382
  - Wrap function body in `try/catch` returning
    `{ ok: false, blocked: true, reason: 'Policy gate internal error' }` on exception
  - Commit: `security(M-2): add exception safety to gateConnectorAction`

- [ ] **B1-P2-T7: Fix Meta OAuth client_secret in URL param (M-3)**
  - File: `scripts/auth-meta.mjs` lines 138–158
  - Move `client_secret` to POST body (match YouTube/Outlook pattern)
  - Commit: `security(M-3): send Meta client_secret in POST body not URL query param`

- [ ] **B1-P2-T8: Add output redaction to execute_command_verified (H-2)**
  - File: `src-tauri/src/lib.rs` around line 456
  - Before returning stdout/stderr to frontend, scan for patterns like
    `api_key`, `token`, `secret`, `password`, `Bearer ` and redact values
  - Commit: `security(H-2): redact secret patterns in command execution output`

- [ ] **B1-P2-T9: Update docs after Phase 2**
  - Update `ALPHONSO_GROUND_TRUTH.md` — all HIGH findings addressed
  - Update `CLAUDE.md` — security section current

---

### BATCH 1 — Phase 3: Infrastructure & Polish

- [ ] **B1-P3-T1: Verify and repair CI workflows + add cargo audit**
  - Files: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/ios-build.yml`
  - Read each workflow and verify all steps are current (test counts, paths, commands)
  - Fix any stale references (e.g., old binary names, outdated Node versions)
  - Add `npm audit --audit-level=high` step if not present (verify it's actually there)
  - Add `cargo audit` step to ci.yml — install via `cargo install cargo-audit` then
    run `cargo audit` from `src-tauri/` — catches known vulnerable Rust crate versions
  - Add `cargo deny check` if `deny.toml` exists, otherwise just `cargo audit`
  - Commit: `ci: verify CI workflows, add cargo audit for Rust dependency scanning`

- [ ] **B1-P3-T2: Wire policyDslService into gateConnectorAction or delete it (M-1)**
  - File: `src/services/policyDslService.ts` — currently dead code
  - Decision: if the DSL rules are meant to augment the policy gate, call
    `evaluateAction(action, context)` inside `gateConnectorAction()` and merge results
  - If redundant, remove the file and its test (if any) entirely
  - Commit: `feat(policy): wire policyDslService into connector gate (or remove dead code)`

- [ ] **B1-P3-T3: Fix pick_file / pick_folder to use Tauri native dialog (M-8)**
  - File: `src-tauri/src/lib.rs` around line 1352
  - Replace PowerShell WinForms script with Tauri's native dialog API
  - Ensure existing callers (`whisperTranscriptionService`, `SettingsView`) still work
  - Commit: `fix(M-8): use Tauri native dialog for pick_file / pick_folder`

- [ ] **B1-P3-T4: Fix clipboard to use arboard crate (M-7)**
  - File: `src-tauri/src/lib.rs` around line 1282
  - Replace `powershell -Command Get-Clipboard / Set-Clipboard` with `arboard::Clipboard`
  - Add `arboard` to `src-tauri/Cargo.toml`
  - Commit: `fix(M-7): use arboard crate for clipboard instead of PowerShell`

- [ ] **B1-P3-T5: Add .nvmrc and .editorconfig**
  - Create `.nvmrc` with current Node version (check `package.json` engines or current runtime)
  - Create `.editorconfig` with standard indent/charset rules
  - Commit: `chore: add .nvmrc and .editorconfig`

- [ ] **B1-P3-T6: Fix stale version in build.ps1**
  - File: `scripts/build.ps1` line 21–22
  - Update output path comment from `Alphonso_0.1.0_x64-setup.exe` to current version
  - Commit: `chore: fix stale version string in build.ps1 comments`

- [ ] **B1-P3-T7: Fix Docker port inconsistency**
  - Root `docker-compose.yml` maps `3000:3000`
  - `gateway/docker-compose.yml` maps `${PORT:-8080}:8080`
  - Align them: pick one port and document it clearly in both files
  - Commit: `fix(docker): align port mapping between root and gateway compose files`

- [ ] **B1-P3-T8: Initialize Husky git hooks**
  - `package.json` has `prepare: husky` but no `.husky/` directory
  - Run `npx husky init` and add a pre-commit hook: `npm run lint`
  - Commit: `chore: initialize husky pre-commit hook`

- [ ] **B1-P3-T9: FINAL BATCH 1 PHASE 3 DOC UPDATE**
  - Update `ALPHONSO_GROUND_TRUTH.md` — full status refresh
  - Update `CLAUDE.md` — all batch 1 changes reflected
  - Update `docs/CHANGELOG.md` — v2.4.5 security release entry
  - Commit: `docs: BATCH 1 Phase 3 complete — update GROUND_TRUTH, CLAUDE.md, CHANGELOG`

---

### BATCH 1 — Phase 4: Remaining Medium & Low Security Findings

**These were in the audit but not yet assigned tasks. Required for a true 10/10 security posture.**

- [ ] **B1-P4-T1: Add PKCE to all three OAuth scripts (M-4)**
  - Files: `scripts/auth-youtube.mjs`, `scripts/auth-meta.mjs`, `scripts/auth-outlook.mjs`
  - Generate `code_verifier` (43–128 random chars, URL-safe), compute
    `code_challenge = base64url(sha256(code_verifier))`
  - Include `code_challenge` + `code_challenge_method=S256` in the authorization URL
  - Include `code_verifier` in the token exchange POST body
  - Use Node's built-in `crypto.subtle.digest` (no extra dep)
  - Commit: `security(M-4): add PKCE to all three OAuth scripts`

- [ ] **B1-P4-T2: Replace open_url shell command with Tauri opener (M-5)**
  - File: `src-tauri/src/lib.rs` around line 1190
  - Currently: `cmd /C start <url>` on Windows, `open <url>` on macOS
  - Replace with the `tauri-plugin-opener` crate (`opener::open_browser(url)`)
  - Add `tauri-plugin-opener` to `src-tauri/Cargo.toml`
  - Register the plugin in `lib.rs` setup
  - Verify `invoke('open_url', { url })` callers still work
  - Run `cargo clippy -- -D warnings`
  - Commit: `security(M-5): replace shell-based open_url with Tauri opener plugin`

- [ ] **B1-P4-T3: Use shared http_client in alphonso_bridge_send_packet (M-6)**
  - File: `src-tauri/src/lib.rs` around line 574
  - Currently: creates `new reqwest::Client()` per call — no connection pooling
  - Replace with `state.http_client.clone()` from managed state (already available)
  - Commit: `fix(M-6): use shared reqwest::Client in alphonso_bridge_send_packet`

- [ ] **B1-P4-T4: Fix upsertEnvVar value escaping in Meta + Outlook scripts (L-3)**
  - Files: `scripts/auth-meta.mjs` lines 59–64, `scripts/auth-outlook.mjs` lines 43–48
  - Values containing `#`, spaces, or newlines corrupt the `.env` file
  - Copy the escaping logic from `scripts/auth-youtube.mjs` (already correct)
  - Commit: `fix(L-3): escape .env values in Meta and Outlook auth scripts`

- [ ] **B1-P4-T5: Use separate auth token for gateway /queue/drain (L-4)**
  - File: `gateway/whatsapp-cloud/src/server.js` around line 40
  - Currently: reuses `WHATSAPP_VERIFY_TOKEN` for both webhook verification and queue drain
  - Add a new env var `ALPHONSO_DRAIN_TOKEN` for queue drain authorization
  - Update `.env.example` and `README.md` in the gateway
  - Commit: `security(L-4): use dedicated ALPHONSO_DRAIN_TOKEN for queue drain endpoint`

- [ ] **B1-P4-T6: Bind OAuth listeners to 127.0.0.1 not 0.0.0.0 (L-5)**
  - Files: `scripts/auth-youtube.mjs`, `scripts/auth-meta.mjs`, `scripts/auth-outlook.mjs`
  - Change `server.listen(PORT)` to `server.listen(PORT, '127.0.0.1')`
  - Commit: `security(L-5): bind OAuth callback servers to 127.0.0.1`

- [ ] **B1-P4-T7: Add per-program argument validation to allowed_program (L-6)**
  - File: `src-tauri/src/policy_gate.rs`
  - `allowed_program()` currently only checks the program name — `git clone evil.com` passes
  - For each sensitive allowed program (`git`, `cargo`, `docker`, etc.), define an
    allowed argument prefix list (e.g., `git` → only `["status", "log", "diff", "pull"]`)
  - Return `false` if args contain anything not on the per-program list
  - Add `cargo clippy` and unit tests for the new logic
  - Commit: `security(L-6): add per-program argument allowlist to policy_gate`

- [ ] **B1-P4-T8: Narrow connect-src localhost wildcard (L-1)**
  - File: `src-tauri/tauri.conf.json` line 36
  - Replace `http://localhost:*` with explicit ports:
    `http://localhost:11434` (Ollama), `http://localhost:5173` (dev), `http://localhost:4444` (bridge),
    `http://localhost:7860` (SD WebUI), `http://localhost:8188` (ComfyUI),
    `http://localhost:5678` (n8n), `ws://localhost:8765` (Voice OS), `ws://127.0.0.1:8765` (Voice OS)
  - Test that all existing features still work
  - Commit: `security(L-1): narrow connect-src from localhost:* to explicit ports`

- [ ] **B1-P4-T9: FINAL BATCH 1 DOC UPDATE**
  - Update `ALPHONSO_GROUND_TRUTH.md` — all security findings closed
  - Update `CLAUDE.md` — security status current
  - Update `docs/CHANGELOG.md` — v2.4.5 full security entry
  - Commit: `docs: BATCH 1 fully complete — all security findings resolved`

---

## BATCH 2 — Tests · Profiles · Voice · UX Completeness

Branch: `feat/batch2-testing-completeness`

---

### BATCH 2 — Phase 0: Fix Failing Tests (BLOCKER — do this first)

**8 failing tests across 4 files:**

- [ ] **B2-P0-T1: Fix connectorCircuitBreakerService.test.js**
  - Issue: imports `../../lib/durableStore.js` which doesn't exist at that path
  - Find where `durableStore.js` actually lives (`src/lib/durableStore.js`)
  - Fix the import path in the test file
  - Run: `npm run test -- connectorCircuitBreaker` to confirm all tests pass
  - Commit: `fix(test): correct durableStore import path in connectorCircuitBreakerService.test`

- [ ] **B2-P0-T2: Fix CompanionPairingPanel.test.jsx (3 tests)**
  - Issue: `localIps.map is not a function` — mock returns non-array
  - Find the test's mock for whatever returns `localIps`
  - Fix mock to return an array: `localIps: ['192.168.1.1']`
  - Commit: `fix(test): fix localIps mock in CompanionPairingPanel test`

- [ ] **B2-P0-T3: Fix policyEnforcementService.test.js (3 tests)**
  - Issue: `getRuntimePolicySettings` returns different results than expected (caching regression)
  - Inspect the test — likely needs `localStorage.clear()` in `beforeEach`
    or a cache invalidation call after settings are set
  - Fix to match actual behavior without changing production code behavior
  - Commit: `fix(test): fix policyEnforcementService cache regression in tests`

- [ ] **B2-P0-T4: Fix policyEnforcementCaching.test.ts (1 test)**
  - Same root cause as T3 — fix together or separately
  - Commit: `fix(test): fix policyEnforcementCaching test cache regression`

- [ ] **B2-P0-T5: Verify all 2144+ tests pass**
  - Run full suite: `npm run test`
  - Confirm 0 failures
  - Commit if any additional fixes needed: `fix(test): resolve all pre-existing test failures`

---

### BATCH 2 — Phase 1: Agent Profile Enrichment

**Echo, Sentinel, Nova have 8 properties. Other agents have 20–27. This is the profile debt.**

- [ ] **B2-P1-T1: Enrich Echo profile**
  - File: `src/agents/echo/echoProfile.js`
  - Add all 17 missing properties (matching format of `marcusProfile.js` as reference):
    `title`, `purpose`, `accentColor`, `visualIdentity`, `personality`,
    `strengths` (array), `limitations` (array), `allowedActions` (array from permissions file),
    `blockedActions` (array from permissions file), `outputTypes`, `requiresApprovalFor`,
    `defaultPrompt`, `skillPackIds`, `skillFocus`, `exampleTasks` (5 tasks), `hierarchyRank`, `mascotPath`
  - Keep existing 8 properties intact, add to them
  - Migrate to use `createPermissionProfile` from shared `permissionModel.js`
  - Commit: `feat(agents): enrich Echo profile to full 25-property format`

- [ ] **B2-P1-T2: Enrich Sentinel profile**
  - File: `src/agents/sentinel/sentinelProfile.js`
  - Same as T1 but for Sentinel (security/scanning agent)
  - Sentinel's strengths: threat detection, policy scanning, audit trail, compliance checking
  - Commit: `feat(agents): enrich Sentinel profile to full 25-property format`

- [ ] **B2-P1-T3: Enrich Nova profile**
  - File: `src/agents/nova/novaProfile.js`
  - Same as T1 but for Nova (opportunity analysis agent)
  - Nova's strengths: market insight, trend detection, opportunity scoring, growth analysis
  - Commit: `feat(agents): enrich Nova profile to full 25-property format`

- [ ] **B2-P1-T4: Add agent profile tests**
  - Create `src/test/agents/agentProfiles.test.js`
  - Test that ALL 9 agents have the required 20+ properties
  - Test that `hierarchyRank` is defined and unique for all agents
  - Test that `allowedActions` and `blockedActions` are non-empty arrays
  - Commit: `test(agents): add profile completeness tests for all 9 agents`

- [ ] **B2-P1-T5: Update docs**
  - Update `ALPHONSO_GROUND_TRUTH.md` — agent profile status
  - Update `CLAUDE.md` — agent section current

---

### BATCH 2 — Phase 2: Test Coverage Expansion (Priority Services)

**58 services have zero tests. Prioritize by risk and call frequency.**

**Priority Tier 1 — Critical infrastructure:**

- [ ] **B2-P2-T1: Tests for verificationService.js + verificationChainService.js**
  - Create: `src/test/services/verificationService.test.js`
  - Create: `src/test/services/verificationChainService.test.js`
  - Cover: main verification flow, chain integrity, failure cases
  - Target: 15+ tests each

- [ ] **B2-P2-T2: Tests for a2aProtocolService.ts**
  - Create: `src/test/services/a2aProtocolService.test.ts`
  - Cover: `delegate`, `getTaskStatus`, `updateTaskResult`, `listActiveTasks`, `listTasksByAgent`
  - Target: 20+ tests

- [ ] **B2-P2-T3: Tests for workflowBuilderService.js**
  - Create: `src/test/services/workflowBuilderService.test.js`
  - Cover: node operations, workflow save/load, visual builder state
  - Target: 15+ tests

- [ ] **B2-P2-T4: Tests for moduleRegistryService.ts**
  - Create: `src/test/services/moduleRegistryService.test.ts`
  - Cover: `installModule`, `enableModule`, `disableModule`, `listModules`, `uninstallModule`
  - Target: 15+ tests

- [ ] **B2-P2-T5: Tests for runtimeApiService.ts**
  - Create: `src/test/services/runtimeApiService.test.ts`
  - Cover: `listModulesRemote`, `runModule`, `getRunStatus`, `publishEvent`, offline fallback
  - Target: 12+ tests

**Priority Tier 2 — Agent-related services:**

- [ ] **B2-P2-T6: Tests for connectorOutbound.js**
  - Create: `src/test/services/connectorOutbound.test.js`
  - Cover: gate calls, circuit breaker integration, fallback paths for key connectors
  - Target: 20+ tests (mock fetch and invoke)

- [ ] **B2-P2-T7: Tests for approvalService.js**
  - Create: `src/test/services/approvalService.test.js`
  - Cover: approval creation, timeout, accept/reject flow
  - Target: 15+ tests

- [ ] **B2-P2-T8: Tests for offlineChatService.js**
  - Create: `src/test/services/offlineChatService.test.js`
  - Cover: IndexedDB save, retrieve, mark synced — mock IndexedDB
  - Target: 10+ tests

- [ ] **B2-P2-T9: Tests for coachModeService.js**
  - Create: `src/test/services/coachModeService.test.js`
  - Cover: mode toggle, session tracking, label retrieval
  - Target: 10+ tests

- [ ] **B2-P2-T10: Tests for policyDslService.ts**
  - Create: `src/test/services/policyDslService.test.ts`
  - Cover: rule evaluation, `evaluateAction`, fail-closed defaults
  - Target: 15+ tests (regardless of whether BATCH 1 wires it or removes it)
  - Note: If BATCH 1 removes the file, skip this task and note in CHANGELOG

**Priority Tier 3 — Hooks:**

- [ ] **B2-P2-T11: Tests for useAppShellState hook**
  - Create: `src/test/hooks/useAppShellState.test.js`
  - Cover: key state transitions, callback firing, tab switching
  - Target: 15+ tests using `renderHook` from @testing-library/react

- [ ] **B2-P2-T12: Tests for useJarvisVoice hook**
  - Create: `src/test/hooks/useJarvisVoice.test.ts`
  - Cover: connect/disconnect lifecycle, transcript state, error handling
  - Mock WebSocket with ws (already in devDependencies)
  - Target: 12+ tests

**Priority Tier 4 — Agent-adjacent & communication services (no tests):**

- [ ] **B2-P2-T13: Tests for agentRunnerService.js**
  - Create: `src/test/services/agentRunnerService.test.js`
  - Cover: agent dispatch, result handling, error recovery
  - Target: 10+ tests

- [ ] **B2-P2-T14: Tests for agentPairingRegistryService.js**
  - Create: `src/test/services/agentPairingRegistryService.test.js`
  - Cover: `resolveAgentPairingRoute`, `listAvailablePairings`, `isAgentPairingRoute`
  - Target: 8+ tests

- [ ] **B2-P2-T15: Tests for agentPerformanceService.js**
  - Create: `src/test/services/agentPerformanceService.test.js`
  - Cover: success/error/latency recording, per-agent aggregation
  - Target: 10+ tests

- [ ] **B2-P2-T16: Tests for joseOrchestrationService.js**
  - Create: `src/test/services/joseOrchestrationService.test.js`
  - Cover: task decomposition, routing logic, handoff creation
  - Target: 12+ tests

- [ ] **B2-P2-T17: Tests for marcusAuditService.js**
  - Create: `src/test/services/marcusAuditService.test.js`
  - Cover: audit entry creation, retrieval, filtering by type
  - Target: 8+ tests

- [ ] **B2-P2-T18: Tests for mariaWeeklyReportService.js**
  - Create: `src/test/services/mariaWeeklyReportService.test.js`
  - Cover: report generation, risk aggregation, period filtering
  - Target: 8+ tests

- [ ] **B2-P2-T19: Tests for hectorBookmarkService.js**
  - Create: `src/test/services/hectorBookmarkService.test.js`
  - Cover: bookmark save/retrieve/delete, dedup by URL
  - Target: 8+ tests

- [ ] **B2-P2-T20: Tests for miyaMemoryService.js**
  - Create: `src/test/services/miyaMemoryService.test.js`
  - Cover: memory save, retrieval, TTL expiry
  - Target: 8+ tests

**Priority Tier 5 — Connector & storage services (no tests):**

- [ ] **B2-P2-T21: Tests for connectorImageGenerators.js**
  - Create: `src/test/services/connectorImageGenerators.test.js`
  - Cover: SD WebUI dispatch, ComfyUI queue + history, circuit breaker check
  - Mock `invoke` for Tauri commands
  - Target: 12+ tests

- [ ] **B2-P2-T22: Tests for connectorPolling.js**
  - Create: `src/test/services/connectorPolling.test.js`
  - Cover: poll interval setup/teardown, result dispatch, error handling
  - Target: 10+ tests

- [ ] **B2-P2-T23: Tests for whatsappBrowserConnector.js**
  - Create: `src/test/services/whatsappBrowserConnector.test.js`
  - Cover: `browserSendWhatsApp`, `browserPollWhatsAppGateway`, credential check
  - Mock fetch
  - Target: 10+ tests

- [ ] **B2-P2-T24: Tests for chatgptService.js**
  - Create: `src/test/services/chatgptService.test.js`
  - Cover: SSE streaming, reconnection, error states, model selection
  - Target: 10+ tests

- [ ] **B2-P2-T25: Tests for claudeService.js**
  - Create: `src/test/services/claudeService.test.js`
  - Cover: SSE streaming, anthropic-version header, error extraction
  - Target: 10+ tests

- [ ] **B2-P2-T26: Tests for providerAdapterService.js**
  - Create: `src/test/services/providerAdapterService.test.js`
  - Cover: provider routing, fallback chains, credential delegation
  - Target: 10+ tests

**Priority Tier 6 — System & infrastructure services (no tests):**

- [ ] **B2-P2-T27: Tests for systemHealthService.js**
  - Create: `src/test/services/systemHealthService.test.js`
  - Cover: health snapshot, degraded detection, service aggregation
  - Target: 10+ tests

- [ ] **B2-P2-T28: Tests for memoryMonitorService.js**
  - Create: `src/test/services/memoryMonitorService.test.js`
  - Cover: snapshot collection, trend detection, threshold alerts
  - Target: 8+ tests

- [ ] **B2-P2-T29: Tests for contextEngineeringService.js**
  - Create: `src/test/services/contextEngineeringService.test.js`
  - Cover: context assembly, token budget enforcement, truncation strategies
  - Target: 10+ tests

- [ ] **B2-P2-T30: Tests for traceabilityService.js**
  - Create: `src/test/services/traceabilityService.test.js`
  - Cover: trace creation, parent/child linking, retrieval by scope
  - Target: 8+ tests

- [ ] **B2-P2-T31: Tests for diffProposalService.js**
  - Create: `src/test/services/diffProposalService.test.js`
  - Cover: diff creation, approval state machine, apply/reject flow
  - Target: 10+ tests

- [ ] **B2-P2-T32: Inspect and test 5 suspiciously thin service files**
  - The audit flagged these as <16 lines, possibly re-export stubs or dead code:
    `workflowMemoryService.js`, `ecosystemMemoryService.js`,
    `connectorRegistryService.js`, `agentAuditService.js`,
    `workspaceArtifactService.js`, `aiReviewPolicyService.js`
  - For each: read the file, determine if it is (a) a pure barrel re-export,
    (b) a thin-but-complete service, or (c) dead code
  - If barrel: add a test that the re-exported symbols are accessible
  - If thin-complete: add 5+ tests covering its narrow scope
  - If dead code: remove the file and any consumers, add to CHANGELOG
  - Commit: `test/refactor: inspect and address 6 suspiciously thin service files`

- [ ] **B2-P2-T33: Tests for nativeSelfDevelopmentAutoStartService.js**
  - This service is imported directly in `main.jsx` and auto-starts on every boot
  - Currently has zero tests despite running unconditionally
  - Create: `src/test/services/nativeSelfDevelopmentAutoStartService.test.js`
  - Cover: start trigger, already-running guard, failure recovery
  - Target: 8+ tests
  - Commit: `test: add tests for nativeSelfDevelopmentAutoStartService (runs on every boot)`

- [ ] **B2-P2-T34: Tests for workflowReceiptService.js + workflowTelemetryService.js**
  - Create: `src/test/services/workflowReceiptService.test.js`
  - Create: `src/test/services/workflowTelemetryService.test.js`
  - Cover: receipt creation, telemetry event emission, aggregation
  - Target: 10+ tests each

- [ ] **B2-P2-T35: Tests for orchestrationGovernanceService.js**
  - Create: `src/test/services/orchestrationGovernanceService.test.js`
  - Cover: governance rules evaluation, block/allow decisions, audit emission
  - Target: 12+ tests

- [ ] **B2-P2-T36: Tests for projectExecutionService.js + projectDnaService.js**
  - Create: `src/test/services/projectExecutionService.test.js`
  - Create: `src/test/services/projectDnaService.test.js`
  - Cover: execution lifecycle, DNA fingerprint generation, match scoring
  - Target: 10+ tests each

- [ ] **B2-P2-T37: Tests for toolRegistryService.js**
  - Create: `src/test/services/toolRegistryService.test.js`
  - Cover: tool registration, lookup by name, permission checking
  - Target: 10+ tests

- [ ] **B2-P2-T38: Tests for reviewPolicyService.js + aiReviewPolicyService.js**
  - Create: `src/test/services/reviewPolicyService.test.js`
  - Create: `src/test/services/aiReviewPolicyService.test.js`
  - Cover: policy evaluation, AI-assisted review triggers, override handling
  - Target: 10+ tests each

**Priority Tier 6b — Previously missed services (no tests):**

- [ ] **B2-P2-T38b: Tests for MCP bridge server (bridge/server.js)**
  - The bridge exposes 5 MCP tools callable from Claude Desktop/Cursor/Windsurf
  - Currently has zero tests — it's the external integration surface
  - Create: `bridge/tests/server.test.js` (or `src/test/bridge/mcpBridge.test.js`)
  - Cover: each of the 5 tool endpoints, Ollama forwarding, error handling,
    `alphonso_get_status` health check, 404 on unknown tool
  - Target: 12+ tests (use supertest or plain node fetch against a started instance)
  - Commit: `test(bridge): add MCP bridge server tests for all 5 tool endpoints`

- [ ] **B2-P2-T38c: Tests for voiceOsService.js**
  - File: `src/services/voiceOsService.js` — starts/stops/monitors Voice OS backend
  - No current tests despite running a background process
  - Create: `src/test/services/voiceOsService.test.js`
  - Cover: `startVoiceServer`, `stopVoiceServer`, `getVoiceServerStatus`, watchdog retry logic
  - Mock `invoke` for Tauri calls
  - Target: 10+ tests
  - Commit: `test: add tests for voiceOsService start/stop/watchdog lifecycle`

- [ ] **B2-P2-T38d: Tests for whisperTranscriptionService.js**
  - File: `src/services/whisperTranscriptionService.js`
  - Critical path: transcription → Ollama summary → memory storage
  - Create: `src/test/services/whisperTranscriptionService.test.js`
  - Cover: `transcribeAndIngest`, progress callback, file path validation, Ollama failure fallback
  - Target: 10+ tests
  - Commit: `test: add tests for whisperTranscriptionService transcription pipeline`

- [ ] **B2-P2-T38e: Tests for operationalModeService.js + executionModeService.js**
  - Create: `src/test/services/operationalModeService.test.js`
  - Create: `src/test/services/executionModeService.test.js`
  - Cover: mode read/write, mode validation, zero-cost mode detection
  - Target: 8+ tests each
  - Commit: `test: add tests for operational and execution mode services`

- [ ] **B2-P2-T38f: Tests for rc0EvidenceService.js + repoAuditService.js**
  - Create: `src/test/services/rc0EvidenceService.test.js`
  - Create: `src/test/services/repoAuditService.test.js`
  - Cover: evidence collection, audit entry format, score computation
  - Target: 8+ tests each
  - Commit: `test: add tests for RC0 evidence and repo audit services`

- [ ] **B2-P2-T38g: Tests for workContractService.js + workshopSessionService.js**
  - Create: `src/test/services/workContractService.test.js`
  - Create: `src/test/services/workshopSessionService.test.js`
  - Cover: contract creation, session lifecycle, assignment tracking
  - Target: 8+ tests each
  - Commit: `test: add tests for work contract and workshop session services`

**Priority Tier 7 — Thin test file expansion (34 files with <5 tests):**

The following existing test files have fewer than 5 tests and need expansion.
For each, open the file, identify what the tested service does, and add tests
to reach at least 8 tests per file:

- [ ] **B2-P2-T39: Expand thin service tests (Batch A)**
  - `devPacketService.test.js` (2 tests → 10+): dev packet creation, metadata, expiry
  - `workspaceRootService.test.js` (2 tests → 8+): validation paths, missing entries
  - `workflowDurabilityHydration.test.js` (2 tests → 8+): hydration from storage, failure
  - `selfDevelopmentService.test.js` (2 tests → 8+): self-dev trigger, result handling
  - `miyaExportPacketService.test.js` (2 tests → 8+): export structure, content validation
  - `runtimeLedgerService.test.js` (2 tests → 8+): ledger entry CRUD, pagination
  - Commit: `test: expand 6 thin test files to 8+ tests each (Batch A)`

- [ ] **B2-P2-T40: Expand thin service tests (Batch B)**
  - `telegramConnectorProof.test.js` (2 tests → 8+): proof structure, trust states
  - `toolConnectionLiveProof.test.js` (2 tests → 8+): live connection assertions
  - `TrustReceiptBrowser.test.jsx` (2 tests → 8+): receipt rendering, click handling
  - `whatsappCloudGatewayRuntime.test.js` (2 tests → 8+): gateway runtime checks
  - `workflowExecutionService.test.js` (3 tests → 10+): step execution, rollback, timeout
  - `runwayService.test.js` (3 tests → 10+): video generation, polling, download
  - Commit: `test: expand 6 more thin test files to 8+ tests each (Batch B)`

- [ ] **B2-P2-T41: Bump coverage threshold**
  - After all new tests land, run `npm run test:coverage`
  - Update threshold in `vitest.config.js` to the new measured value
  - Target: push threshold to **50%+** (up from the fictional 38%)
  - Commit: `test: bump coverage threshold to 50%+ — all 58 uncovered services addressed`

- [ ] **B2-P2-T42: Update docs after Phase 2**
  - Update `ALPHONSO_GROUND_TRUTH.md` — test count, file count, coverage %
  - Update `CLAUDE.md` — test section fully current
  - Commit: `docs: Phase 2 test coverage complete — update all doc counts`

---

### BATCH 2 — Phase 3: Voice Backend Completion

- [ ] **B2-P3-T1: Complete vad.py (WebRTC VAD)**
  - File: `voice/backend/vad.py` — currently a 6-line energy heuristic stub
  - Replace with proper WebRTC VAD using `webrtcvad` (already listed in requirements.txt)
  - Implement: `webrtcvad.Vad(aggressiveness=2)`, process 10/20/30ms frames at 16kHz
  - Handle frame padding for non-aligned audio chunks
  - Update `voice/backend/tests/test_router.py` and add VAD-specific tests
  - Commit: `feat(voice): implement WebRTC VAD in vad.py (replace energy heuristic stub)`

- [ ] **B2-P3-T2: Complete router.py (9-agent routing)**
  - File: `voice/backend/router.py` — currently always returns `'alphonso_core'`
  - Implement regex/keyword routing for all 9 agents:
    - `jose` → task planning, project, schedule, delegate
    - `hector` → research, search, find, look up, what is
    - `miya` → design, UI, content, campaign, creative
    - `maria` → audit, risk, compliance, governance
    - `marcus` → publish, release, deploy, send, distribute
    - `echo` → remember, memory, save, store, recall
    - `sentinel` → scan, security, threat, vulnerability, check
    - `nova` → opportunity, market, growth, trend, analysis
    - `alphonso` → default/fallback
  - Update `voice/backend/tests/test_router.py` with routing tests for all 9 agents
  - Commit: `feat(voice): implement 9-agent routing in router.py (replace stub)`

- [ ] **B2-P3-T3: Update all Python voice backend tests after fixes**
  - After T1 (vad.py) and T2 (router.py) are done, the existing Python tests will be stale
  - Files: `voice/backend/tests/test_vad.py`, `voice/backend/tests/test_router.py`,
    `voice/backend/tests/test_pipeline.py`
  - `test_router.py`: replace stub assertions with real 9-agent routing assertions
    (each keyword routes to the correct agent)
  - `test_vad.py` (create if missing): test WebRTC VAD with real audio frames
    (silence → not speech, loud signal → speech, padding edge cases)
  - `test_pipeline.py`: verify VAD → STT → LLM → TTS chain still flows correctly
    after real VAD replaces the energy heuristic
  - Run: `cd voice/backend && python -m pytest tests/ -v` — all must pass
  - Commit: `test(voice): update Python tests for real VAD and 9-agent routing`

- [ ] **B2-P3-T4: Pin requirements.txt versions**
  - File: `voice/backend/requirements.txt`
  - Pin all 7 dependencies to exact versions (`==`) for reproducible installs
  - Commit: `chore(voice): pin requirements.txt to exact versions`

- [ ] **B2-P3-T5: Update docs after Phase 3**
  - Update `ALPHONSO_GROUND_TRUTH.md` — voice backend status
  - Update `CLAUDE.md` — voice section current

---

### BATCH 2 — Phase 4: UX Completeness & Discoverability

- [ ] **B2-P4-T1: Add Voice sidebar nav entry**
  - File: `src/components/Sidebar.tsx` (or `.jsx`)
  - Add "Voice" navigation item under the System section
  - On click: navigate to a new `VoiceSettingsView` or the existing RuntimeManagerView
    filtered to the Voice OS tool
  - Icon: `Mic` from lucide-react
  - Commit: `feat(ux): add Voice nav item to sidebar`

- [ ] **B2-P4-T2: Consolidate chat toolbar voice buttons**
  - File: `src/components/ChatView.tsx`
  - Currently: two separate buttons side by side (VoiceInputButton + Jarvis mic button)
  - Merge into one smart `<SmartVoiceButton>` component:
    - Prefers Voice OS WebSocket when available and connected
    - Falls back to browser SpeechRecognition when Voice OS is unavailable
    - Shows status tooltip explaining which mode is active
  - Commit: `feat(ux): consolidate two voice buttons into single smart voice button`

- [ ] **B2-P4-T3: Surface Voice OS setup prompt on connection failure**
  - File: `src/hooks/useJarvisVoice.ts`
  - When WebSocket fails to connect (error state), dispatch an `alphonso:toast` with:
    `"Voice OS not running — start it from Runtime Manager to use voice"`
  - Include a direct link/button to the Runtime Manager
  - Commit: `feat(ux): surface Voice OS setup guidance on connection failure`

- [ ] **B2-P4-T4: Reduce useAppShellState complexity**
  - File: `src/hooks/useAppShellState.js` (294 lines, ~30 state vars, ~50 callbacks)
  - Extract at least 2 logical groupings into sub-hooks (e.g., `useVoiceState`, `useConnectorState`)
  - Goal: reduce the main hook to under 200 lines
  - All existing behavior must be preserved — run full test suite after
  - Commit: `refactor(ux): extract sub-hooks from useAppShellState to reduce complexity`

- [ ] **B2-P4-T5: Increase E2E test coverage**
  - Add E2E tests for the voice flow in `e2e/smoke.spec.js` or a new `e2e/voice.spec.js`
  - Add a test for the policy gate UI (triggering an approval modal)
  - Target: bring E2E test count from ~19 to ~30
  - Commit: `test(e2e): add voice flow and policy gate E2E tests`

- [ ] **B2-P4-T6: Add visual regression baseline snapshots**
  - The audit explicitly calls out: "No visual regression testing"
  - Playwright already installed — use `expect(page).toHaveScreenshot()` (built-in)
  - Create `e2e/visual.spec.js` with snapshots for:
    - App shell (sidebar + topbar + main area at 1280×800)
    - ChatView with messages
    - SettingsView (connectors tab)
    - ApprovalModal (triggered state)
    - RightPanel (open state)
  - Run once to generate `.png` baselines in `e2e/snapshots/`
  - Add `e2e/snapshots/` to `.gitignore` or commit them — document the decision
  - Commit: `test(visual): add Playwright visual regression baseline snapshots for 5 views`

- [ ] **B2-P4-T7: Implement PWA service worker caching strategy**
  - File: `public/sw.js` — currently registered but has no meaningful caching strategy
  - The audit notes: "No service worker caching strategy for offline mode
    (PWA registration exists but no custom caching)"
  - Implement a proper Workbox-style strategy:
    - **Cache-first** for static assets (JS/CSS/fonts)
    - **Network-first** for navigation (HTML)
    - **Network-only** for API/Tauri invoke calls (these can't be cached)
    - **Stale-while-revalidate** for images and icons
  - Add offline fallback page: when network fails on navigation, serve cached shell
  - Test: disable network in DevTools, reload — app shell should load from cache
  - Commit: `feat(pwa): implement proper service worker caching strategy with offline fallback`

- [ ] **B2-P4-T9: FINAL BATCH 2 PHASE 4 DOC UPDATE**
  - Update `ALPHONSO_GROUND_TRUTH.md` — UX changes, visual regression baseline, PWA strategy noted
  - Update `CLAUDE.md` — voice + UX section current
  - Commit: `docs: BATCH 2 Phase 4 complete — UX, visual regression, PWA strategy`

---

### BATCH 2 — Phase 5: ExternalAgentAdapter — Wire Real Providers

**Currently: 5 of 6 providers return `not_wired`. This is honest but it means the
"external agent" abstraction barely exists. For 10/10 completeness, wire at least
the three providers whose credentials already exist in the system.**

- [ ] **B2-P5-T1: Wire OpenAI path in externalAgentAdapter.js**
  - File: `src/services/externalAgentAdapter.js`
  - Import `chatgptService.js` (already exists, full SSE streaming)
  - In `runExternalAgentTask()` for provider `openai`: call `sendChatGptMessage(task.prompt, options)`
  - Add credential check: `isConnectorAuthenticated('chatgpt')` before calling
  - Update `listSupportedExternalProviders()`: set `openai` status to `'live'`
  - Commit: `feat(adapter): wire OpenAI provider in externalAgentAdapter`

- [ ] **B2-P5-T2: Wire Claude/Anthropic path in externalAgentAdapter.js**
  - Import `claudeService.js` (already exists, full SSE streaming)
  - Same pattern as T1 for provider `claude`
  - Credential check: `isConnectorAuthenticated('claude')`
  - Commit: `feat(adapter): wire Claude provider in externalAgentAdapter`

- [ ] **B2-P5-T3: Wire Ollama path in externalAgentAdapter.js**
  - Import `generateOllamaChatStream` from `src/lib/ollama.js`
  - For provider `ollama`: stream a response using the configured model
  - No credential check needed — Ollama is local
  - Commit: `feat(adapter): wire Ollama provider in externalAgentAdapter`

- [ ] **B2-P5-T4: Wire Gemini path (if API key support is added) OR document as future**
  - Assess: does `gemini` need a new `geminiService.js` connector?
  - If yes: create a minimal `src/services/connectors/geminiConnector.js` that calls
    `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
    with `GEMINI_API_KEY` from env
  - If decided out of scope: update `externalAgentAdapter.js` comment to clearly say
    "Gemini: planned for v2.6 — requires Google AI Studio key" and mark as `'planned'`
  - Commit: `feat(adapter): wire Gemini or document as v2.6 planned`

- [ ] **B2-P5-T5: Wire ACC path in externalAgentAdapter.js**
  - ACC is the other Alphonso project (sibling repo at `D:\AgentDevWork\repos\ACC`)
  - The adapter should call the ACC MCP server (`mcp-server/server.js` at port 3333)
    using a simple `fetch('http://localhost:3333/mcp/tool/...')` call
  - Add auth check: `ACC_MCP_URL` and `ACC_MCP_TOKEN` from env
  - Commit: `feat(adapter): wire ACC provider via MCP server in externalAgentAdapter`

- [ ] **B2-P5-T6: Add tests for externalAgentAdapter.js**
  - Create: `src/test/services/externalAgentAdapter.test.js`
  - Cover: each live provider dispatches correctly, not_wired providers return cleanly,
    credential-missing path returns expected error, `listSupportedExternalProviders` counts
  - Target: 15+ tests
  - Commit: `test(adapter): add tests for externalAgentAdapter all-provider paths`

- [ ] **B2-P5-T7: Update docs after Phase 5**
  - Update `ALPHONSO_GROUND_TRUTH.md` — externalAgentAdapter status (was "only intentional placeholder", now partially wired)
  - Update `CLAUDE.md` — "Do Not Duplicate" table entry for externalAgentAdapter
  - Commit: `docs: Phase 5 complete — externalAgentAdapter providers wired`

---

### BATCH 2 — Phase 6: iOS Companion Verification & Stabilization

**The Rust iOS companion stack (5 files, 527 lines: WebSocket server, PIN auth,
mDNS, JSON-RPC) is confirmed complete. But the Swift client files in `ios/` have
never been verified to compile. This phase makes the iOS story fully honest.**

- [ ] **B2-P6-T1: Audit the Swift files in ios/**
  - Read all Swift files in `ios/` directory
  - Document: how many files, what they do, whether they reference the Rust WebSocket API correctly
  - Check: PIN auth flow, mDNS discovery calls, WebSocket connection handling
  - Report findings in a comment commit or directly fix issues found
  - Commit: `chore(ios): audit Swift companion files and document status`

- [ ] **B2-P6-T2: Verify the companion pairing flow end-to-end**
  - With Alphonso running (`npm run tauri dev`), test the companion WebSocket server
  - Use a WebSocket client (wscat or Insomnia) to connect to the companion port
  - Test PIN auth handshake (the Rust server generates a PIN via `rand`)
  - Test mDNS discovery (if on the same network)
  - Document what works and what doesn't
  - Commit: `test(ios): verify companion WebSocket + PIN auth flow`

- [ ] **B2-P6-T3: Fix any discovered iOS companion issues**
  - Based on T1 + T2 findings, fix any mismatches between the Swift client
    and the Rust JSON-RPC protocol definitions in `companion_router.rs`
  - Ensure `companion_types.rs` structs match what Swift expects
  - Commit: `fix(ios): resolve Swift ↔ Rust protocol mismatches in companion`

- [ ] **B2-P6-T4: Add iOS companion integration test**
  - Create: `src/test/services/companionIntegration.test.js` (or a Playwright E2E spec)
  - Test: companion WebSocket server starts with the app, responds to ping, enforces PIN
  - This can be a mock-level test if a real iOS device is not available
  - Target: 8+ tests
  - Commit: `test(ios): add companion integration tests`

- [ ] **B2-P6-T5: Update iOS companion docs**
  - Update `ALPHONSO_GROUND_TRUTH.md` — iOS companion fully verified or clearly marked as "Rust complete / Swift unverified"
  - Update `CLAUDE.md` — iOS companion status
  - Commit: `docs: Phase 6 complete — iOS companion status documented`

---

### BATCH 2 — Phase 7: Final Sweep & 10/10 Certification

**This phase is a pass over everything before declaring done.**

- [ ] **B2-P7-T1: Full test suite run — zero failures required**
  - Run `npm run test` — must show 0 failures
  - Run `npm run test:coverage` — must show 50%+ across lines/branches/functions
  - Document the exact numbers in `ALPHONSO_GROUND_TRUTH.md`

- [ ] **B2-P7-T2: Full Rust verification**
  - Run `cargo clippy -- -D warnings` — must show 0 warnings
  - Run `cargo test` — all Rust tests must pass
  - Run `cargo fmt --all -- --check` — no formatting violations

- [ ] **B2-P7-T3: Full verify:app run**
  - Run `npm run verify:app` (lint + typecheck + test + build)
  - Must complete with 0 errors

- [ ] **B2-P7-T4: E2E smoke test**
  - Start `npm run dev`, then run `npm run test:e2e`
  - All ~30+ E2E tests must pass
  - Confirm app boots without errors in both web and Tauri modes

- [ ] **B2-P7-T5: Visual spot-check of 5 key flows**
  - Boot → no crash, no banner errors
  - Chat → send a message via Ollama, Jose pipeline fires, Nova score appears
  - Voice → click smart voice button, confirm correct mode activates
  - Settings → connectors tab, confirm all 19 connectors show correct status
  - Automation → schedules tab, create and list a schedule

- [ ] **B2-P7-T6: FINAL BATCH 2 DOC UPDATE — 10/10 DECLARATION**
  - Update `ALPHONSO_GROUND_TRUTH.md` — complete v2.5.0 state
    (exact test count, exact coverage %, all gaps status, all agents status)
  - Update `CLAUDE.md` — every stale count corrected (components, hooks, services, Rust lines)
  - Update `docs/CHANGELOG.md` — full v2.5.0 release notes
  - Update `docs/USER_MANUAL.md` — any new features from both batches
  - Update `docs/AGENT_GUIDE.md` — enriched Echo/Sentinel/Nova profiles documented
  - Commit: `docs: BATCH 2 fully complete — v2.5.0 10/10 certification`

---

## MERGE PHASE — After Both Batches Complete

When both branches are done:

1. Merge `feat/batch1-security-infra` → `main`
2. Resolve any conflicts with `feat/batch2-testing-completeness`
3. Merge `feat/batch2-testing-completeness` → `main`
4. Run full verification: `npm run verify:app` — must pass
5. Run Rust: `cargo clippy -- -D warnings` and `cargo test` — must pass
6. Run E2E: `npm run test:e2e` — must pass
7. Bump version to `2.5.0`
8. Cut release: `npm run release:updater`
9. Final doc pass: ensure `ALPHONSO_GROUND_TRUTH.md` and `CLAUDE.md` reflect v2.5.0 reality

---

## MATURITY SCORECARD

| Dimension | v2.4.4 | v2.5.0 Target | Owner |
|---|---|---|---|
| Boot stability | ❌ Crashes on launch | ✅ Clean launch | BATCH 1 P0 |
| Critical security (C-1→C-6) | ❌ 6 findings open | ✅ All resolved | BATCH 1 P1 |
| High security (H-1→H-7) | ❌ 7 findings open | ✅ All resolved | BATCH 1 P2 |
| Medium security (M-1→M-8) | ❌ 8 findings open | ✅ All resolved | BATCH 1 P2+P4 |
| Low security (L-1→L-6) | ⚠️ 6 findings open | ✅ All resolved | BATCH 1 P4 |
| Policy gate coverage | ⚠️ 6 connectors bypass | ✅ All 19 connectors gated | BATCH 1 P1 |
| Test pass rate | ⚠️ 99.6% (8 failing) | ✅ 100% | BATCH 2 P0 |
| Test coverage | ⚠️ ~28% actual vs 38% threshold | ✅ 50%+ with honest threshold | BATCH 2 P2 |
| Services with tests | ⚠️ 65% (58 uncovered) | ✅ 90%+ (all 58 addressed) | BATCH 2 P2 |
| Thin test files (34 files <5 tests) | ⚠️ Exists | ✅ All expanded to 8+ tests | BATCH 2 P2 |
| Hook test coverage | ❌ 7% (1 of 14 tested) | ✅ 3+ key hooks covered | BATCH 2 P2 |
| Agent profiles | ⚠️ 3 thin (Echo/Sentinel/Nova) | ✅ All 9 full 25-property profiles | BATCH 2 P1 |
| Voice backend | ⚠️ vad.py + router.py are stubs | ✅ WebRTC VAD + 9-agent routing | BATCH 2 P3 |
| Voice discoverability | ⚠️ Buried in chat toolbar | ✅ Sidebar nav + unified smart button | BATCH 2 P4 |
| Visual regression tests | ❌ None exist | ✅ Playwright baseline snapshots for 5 views | BATCH 2 P4 |
| PWA / offline caching | ⚠️ SW registered, no strategy | ✅ Cache-first static, network-first nav, offline fallback | BATCH 2 P4 |
| ExternalAgentAdapter | ⚠️ 1/6 providers live | ✅ 4+/6 providers live (OpenAI, Claude, Ollama, ACC) | BATCH 2 P5 |
| iOS companion | ⚠️ Rust complete, Swift unverified | ✅ End-to-end verified + integration tests | BATCH 2 P6 |
| MCP bridge tests | ❌ 0 tests for 5 MCP tools | ✅ 12+ tests for all tool endpoints | BATCH 2 P2 |
| Thin service files (<16 lines) | ⚠️ 6 files uninspected | ✅ Inspected, tested or removed | BATCH 2 P2 |
| Python voice tests | ⚠️ Tests cover stub behavior | ✅ Updated for real VAD + 9-agent routing | BATCH 2 P3 |
| cargo audit in CI | ❌ Not in CI pipeline | ✅ Added — scans Rust deps for CVEs | BATCH 1 P3 |
| policyDslService | ❌ Dead code (never called) | ✅ Wired or removed | BATCH 1 P3 |
| CI/CD | ✅ Exists (audit was wrong) | ✅ Verified + updated + cargo audit | BATCH 1 P3 |
| Documentation accuracy | ⚠️ Multiple stale counts | ✅ All 5 docs match reality | Both P-final |
| **Overall** | **6–7/10** | **10/10** | |

---

## TASK COUNT SUMMARY

| Batch | Phases | Total Tasks |
|---|---|---|
| BATCH 1 | P0 (6) + P1 (7) + P2 (9) + P3 (9) + P4 (9) | **40 tasks** |
| BATCH 2 | P0 (5) + P1 (5) + P2 (49) + P3 (5) + P4 (9) + P5 (7) + P6 (5) + P7 (6) | **91 tasks** |
| **Total** | | **~131 tasks across 13 phases** |

---

_Document owner: update after every sprint. Do not let docs drift._  
_Last updated: 2026-06-29 — v2.4.4 baseline_
