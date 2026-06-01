# ALPHONSO — Parallel Sub-Agent Execution Brief
**Date:** 2026-05-31  
**Project:** ALPHONSO  
**Purpose:** Move the project in parallel using up to 8 independent sub-agents.  
**Source:** Based on the ALPHONSO Deep Audit Report dated 2026-05-31.

---

## 0. Shared Project Context — Paste This Into Every Agent

You are working on **ALPHONSO**, a Tauri v2 desktop application with a Rust backend and React frontend.

### Project Snapshot

- **App type:** Tauri v2 desktop app
- **Backend:** Rust 1.77, SQLite, tokio, reqwest
- **Frontend:** React 18, Vite 5, Tailwind 3
- **AI layer:** Ollama local model `llama3.2:3b`, Claude API, OpenAI API
- **Connectors:** Telegram, WhatsApp, YouTube, Meta/Instagram, Notion, ClickUp, ComfyUI, SD-WebUI
- **Deployment:** Windows NSIS/MSI installer and Railway static serve
- **Current audit score:** 6.1/10
- **Main blockers:** Security and testing

### Critical Findings From Audit

1. `tauri.conf.json` has no Content Security Policy.
2. Secrets were committed in `.env`, including API tokens and signing keys.
3. `lib.rs` is roughly 7,200 lines and must be split into modules.
4. There is no real test suite despite Vitest setup.
5. Frontend is `.jsx`, not `.tsx`, so there is no TypeScript safety.

### Global Rules For Every Agent

- Work independently.
- Do not assume another agent has done anything unless you can see it in the repo.
- Keep changes scoped to your assignment.
- Do not modify unrelated files unless necessary.
- Do not commit, print, copy, or expose secrets.
- If you find secrets, report the file and variable names only. Do not repeat secret values.
- Prefer small, reviewable changes.
- Add comments only where they clarify non-obvious logic.
- Leave a clear final report with:
  - Files changed
  - What was completed
  - What was not completed
  - Any risks
  - Manual test steps
  - Next recommended task

### Recommended Parallel Execution

All 8 agents can start at the same time, but these dependencies matter:

- Agent 1 security work is release-blocking.
- Agent 4 testing/CI should coordinate with outputs from Agents 2, 3, and 5 later, but can start with existing code immediately.
- Agent 8 release automation should not publish anything until Agent 1 confirms secrets are removed and rotated.
- Agent 2 backend refactor and Agent 5 connector work may touch nearby Rust files. Avoid editing the same exact functions at the same time unless unavoidable.

---

# Agent 1 — Security Hardening & Secrets Cleanup

## Required Skills

- Tauri v2 security model
- WebView Content Security Policy
- Rust secure coding
- Environment variable hygiene
- Git secret-removal workflow
- API credential rotation process
- Basic Railway and Windows app distribution security

## Mission

Fix the immediate release-blocking security issues: missing CSP, exposed secrets, unsafe app bridge boundaries, weak webhook/input validation, and missing deployment security headers.

## Primary Files / Areas To Inspect

- `src-tauri/tauri.conf.json`
- `.env`
- `.env.example`
- `.gitignore`
- `src-tauri/src/lib.rs`
- Any Rust files containing `#[tauri::command]`
- Railway/static server files, especially `serve-static.mjs`
- Connector/auth/profile storage files
- Webhook-related Rust and Node files

## Tasks

### Security Blockers

- Add a strict CSP to `tauri.conf.json`.
- Ensure Tauri CSP asset modification is not dangerously disabled.
- Add or confirm `.env` is ignored by Git.
- Create or update `.env.example` with placeholder values only.
- Audit repo for committed secret files.
- Identify every leaked credential by variable name only.
- Create a credential rotation checklist for:
  - Tauri signing key
  - Telegram bot token
  - WhatsApp token
  - YouTube refresh token
  - Meta token
  - Claude/OpenAI keys
  - Railway bridge token

### Runtime Hardening

- Audit all `#[tauri::command]` functions that accept URLs, command strings, webhook URLs, file paths, or connector payloads.
- Ensure string URL inputs use an allowlist validator before network calls.
- Add rate limiting or throttling to bridge-token validation if applicable.
- Add HTTPS enforcement for non-local webhook calls.
- Add HSTS and HTTP-to-HTTPS redirect to `serve-static.mjs`, if present.

### Tauri Scope

- Review exposed Tauri APIs.
- Restrict allowlist/capabilities to only what the frontend needs.
- Remove broad or unnecessary permissions.

## Deliverables

- Code changes for CSP and security config.
- Updated `.gitignore`.
- Clean `.env.example`.
- `SECURITY_ROTATION_CHECKLIST.md`.
- Final security report.

## Definition Of Done

- No real secrets remain in tracked env/config files.
- CSP is present and strict enough for production.
- Dangerous Tauri permissions are reduced.
- Webhook and bridge surfaces have basic runtime validation.
- The repo has a clear checklist for rotating every leaked credential.

## Do Not Do

- Do not paste secret values in logs or reports.
- Do not actually rotate external credentials unless explicitly authorized.
- Do not loosen CSP just to make the app work without documenting why.

---

# Agent 2 — Rust/Tauri Backend Refactor & IPC Validation

## Required Skills

- Rust module design
- Tauri command architecture
- SQLite access patterns
- Async Rust with tokio and reqwest
- Error handling with `Result`
- Safe API boundary design

## Mission

Break down the 7,200-line Rust monolith into maintainable modules and add validation boundaries around high-risk commands.

## Primary Files / Areas To Inspect

- `src-tauri/src/lib.rs`
- `src-tauri/src/`
- Tauri command registration area
- SQLite/memory-related functions
- Plugin sandbox functions
- Connector command functions

## Tasks

### Module Extraction

Split `lib.rs` into logical Rust modules. Suggested modules:

- `connector_telegram.rs`
- `connector_whatsapp.rs`
- `connector_youtube.rs`
- `connector_meta.rs`
- `connector_claude.rs`
- `connector_openai.rs`
- `connector_clickup.rs`
- `memory_db.rs`
- `plugin_sandbox.rs`
- `research.rs`
- `security.rs`
- `errors.rs`

Keep `lib.rs` as the composition/root registration file.

### Validation

- Add or centralize validators for:
  - Allowed webhook URLs
  - Connector names
  - File paths
  - Plugin command arguments
  - External API target URLs
- Ensure each exposed Tauri command validates inputs before side effects.
- Ensure high-risk actions return clear errors instead of panics.

### Error Handling

- Replace avoidable `unwrap()` / `expect()` in runtime paths.
- Introduce consistent error messages.
- Avoid leaking internal secrets or tokens in error output.

## Deliverables

- Refactored Rust module structure.
- Updated imports and command registration.
- Validation utilities.
- Short `RUST_BACKEND_REFACTOR_REPORT.md`.

## Definition Of Done

- `lib.rs` is significantly smaller and mostly delegates to modules.
- App builds successfully.
- Existing Rust commands remain registered.
- Validation coverage improves for exposed IPC surfaces.

## Do Not Do

- Do not rewrite business logic unless required for the refactor.
- Do not change frontend behavior unless needed for compatibility.
- Do not remove commands without documenting why.

---

# Agent 3 — Frontend TypeScript Migration & React Architecture Cleanup

## Required Skills

- React 18
- Vite 5
- TypeScript migration
- JSX to TSX conversion
- Component extraction
- Frontend state management
- Zod or equivalent schema validation

## Mission

Improve frontend maintainability by migrating critical frontend files from `.jsx` to `.tsx`, extracting large components, and adding typed validation around connector configs and command shapes.

## Primary Files / Areas To Inspect

- `src/`
- `src/App.jsx`
- `src/views/ChatView.jsx`
- `src/services/connectorRegistryService.js`
- `src/services/memoryService.js`
- `src/services/miyaMemoryService.js`
- `src/lib/ollama.js`
- `vite.config.js`
- `vite.config.cjs`
- `tsconfig.json`, if present

## Tasks

### TypeScript Migration

- Add or tighten TypeScript config.
- Convert service files first:
  - connector registry service
  - memory service
  - Ollama service
- Convert core hooks/utilities next.
- Convert components only after service typing is stable.
- Add `strict: true` if feasible. If too large, document blockers.

### Component Extraction

Refactor `ChatView.jsx` into smaller pieces:

- `ChatMessageList`
- `ChatInput`
- `ChatSearch`
- `VoiceButton`
- `FileAttachmentPreview`
- `PersonaSelector`, if relevant

### Config Cleanup

- Delete duplicate Vite config by consolidating `vite.config.js` and `vite.config.cjs`.
- Ensure build/dev scripts point to the correct config.

### Schema Validation

- Add Zod validation for connector config objects.
- Define a typed JOSE command schema:
  - `type`
  - `payload`
  - `target`
  - `riskLevel`, if needed
- Validate command objects before routing.

## Deliverables

- TSX/TypeScript migration PR-style changes.
- Extracted ChatView subcomponents.
- Zod schemas for connector config and command routing.
- `FRONTEND_ARCHITECTURE_REPORT.md`.

## Definition Of Done

- App builds.
- Core service layer is typed.
- ChatView is smaller and easier to review.
- Duplicate Vite config is removed or clearly resolved.
- Connector config has runtime validation.

## Do Not Do

- Do not attempt to migrate every single frontend file in one pass.
- Do not introduce heavy state libraries unless clearly necessary.
- Do not change UX design beyond what is required by extraction.

---

# Agent 4 — Testing, CI/CD & Quality Gates

## Required Skills

- Vitest
- React Testing Library
- Rust unit tests
- Cargo test and clippy
- GitHub Actions
- Playwright
- Tauri testing basics
- Mocking external APIs

## Mission

Create the first real quality gate for ALPHONSO: unit tests, CI workflow, coverage threshold, clippy, and a basic E2E smoke test.

## Primary Files / Areas To Inspect

- `package.json`
- `vitest.config.*`
- `setupTests.js`
- `src/lib/ollama.js`
- `src/services/connectorRegistryService.js`
- `src-tauri/src/lib.rs`
- `.github/workflows/`
- Existing proof scripts in `package.json`

## Tasks

### Frontend Unit Tests

Write at least 10 meaningful Vitest tests covering:

- `src/lib/ollama.js`
  - successful fetch
  - timeout
  - retry
  - failed response
  - streaming behavior if present
- `connectorRegistryService.js`
  - valid connector lookup
  - invalid connector
  - missing config
  - schema validation
  - fallback behavior

### Rust Tests

Add Rust unit tests for:

- `allowed_program()`
- `plugin_blocked_token_present()`
- `validate_plugin_extra_args()`
- `meta_appsecret_proof()`
- SQLite `kv_set` / `kv_get` round trip, if feasible

### CI

Create `.github/workflows/ci.yml` that runs:

- `npm ci`
- `npm run lint`
- `npm run test`
- `cargo test`
- `cargo clippy`
- existing `proof:rc0` or `verify:app` scripts if available

### Coverage

- Add `npm run test:coverage`.
- Start with a realistic threshold, such as 40% lines.
- Document how to raise it over time.

### E2E Smoke Test

- Add a basic Playwright smoke test.
- Test the app’s golden path:
  - launch
  - open chat
  - send a local message or mocked Ollama request
  - verify response appears

## Deliverables

- Unit tests.
- Rust tests.
- GitHub Actions CI file.
- Coverage config.
- Optional Playwright smoke test.
- `TESTING_AND_CI_REPORT.md`.

## Definition Of Done

- Test commands run locally.
- CI workflow is present.
- At least 10 frontend tests exist.
- At least 4 Rust tests exist.
- The project has a repeatable quality gate.

## Do Not Do

- Do not require live external API keys for tests.
- Mock Claude, OpenAI, Telegram, WhatsApp, and other external services.
- Do not make CI depend on local Ollama unless mocked.

---

# Agent 5 — Connector Transport Completion & Health Dashboard

## Required Skills

- Tauri frontend/backend communication
- Rust async HTTP clients
- Claude API and OpenAI API integration patterns
- Brave Search API
- Connector architecture
- React dashboard UI
- Error and latency reporting

## Mission

Finish incomplete connector flows and make connector status visible and debuggable.

## Primary Files / Areas To Inspect

- Rust connector commands in `src-tauri/src/lib.rs` or extracted modules
- Frontend connector stubs
- `connectorRegistryService.js`
- Connector settings UI
- Chat transport/routing files
- Any existing proof/audit trail types:
  - `ConnectorSendProof`
  - `ConnectorPollProof`

## Tasks

### Claude Connector

- Find existing `connector_send_claude` Rust command.
- Wire frontend connector call to invoke it.
- Support streaming if feasible.
- Add clear error messages for missing API key, rate limit, bad response, and timeout.

### ChatGPT / OpenAI Connector

- Find existing `connector_send_chatgpt` Rust command.
- Wire frontend connector call to invoke it.
- Support model selection if already partially available.
- Add clear error states.

### Brave Search For Hector

- Implement `connector_search_brave` using `BRAVE_SEARCH_API_KEY`.
- Add frontend path from Hector Research Desk to the Brave connector.
- Return structured results:
  - title
  - URL
  - snippet
  - source
  - timestamp if available

### Connector Health Dashboard

Create a connector health dashboard showing:

- Connector name
- Status: live, missing config, failing, disabled
- Last ping time
- Last error
- Latency
- Test button
- Required env vars

### Proof Trail

- Ensure connector sends/polls leave proof objects where the existing architecture expects them.
- Document any proof gaps.

## Deliverables

- Working Claude connector path.
- Working ChatGPT/OpenAI connector path.
- Brave Search connector path.
- Connector health dashboard UI.
- `CONNECTOR_COMPLETION_REPORT.md`.

## Definition Of Done

- Claude and OpenAI are no longer frontend-only stubs.
- Missing API keys produce friendly UI errors.
- Hector can search Brave, if key is configured.
- Connector health is visible in one place.
- No tests require real keys unless explicitly marked integration-only.

## Do Not Do

- Do not hardcode API keys.
- Do not log prompt contents unless user explicitly opts into debug logging.
- Do not block app startup when optional connectors are missing.

---

# Agent 6 — Performance, Reliability & Local Data Stability

## Required Skills

- React performance profiling
- Tauri/WebView2 performance
- SQLite tuning
- Rust reqwest client reuse
- Async retry/backoff patterns
- Vite bundle optimization
- Local app reliability

## Mission

Make ALPHONSO faster and more stable by fixing obvious performance bottlenecks, reducing bundle weight, improving SQLite behavior, and standardizing retry/client reuse.

## Primary Files / Areas To Inspect

- Tauri launch/config files
- `src-tauri/src/lib.rs`
- SQLite initialization code
- `src/lib/ollama.js`
- Chat input components
- Vite build config
- Heavy views:
  - MiyaStudio
  - HectorResearchDesk
- Memory record retrieval code

## Tasks

### Rendering / GPU

- Investigate why GPU rendering is disabled with flags like:
  - `--disable-gpu`
  - `--use-angle=swiftshader`
- Remove software rendering flags if safe.
- Document the root cause if they must remain.

### SQLite Reliability

- Enable SQLite WAL mode:
  - `PRAGMA journal_mode=WAL`
- Add pagination/cursoring for memory record reads.
- Avoid unbounded `SELECT *` calls.

### HTTP Reliability

- Replace per-command `reqwest::Client` creation with a shared client in Tauri state.
- Add a reusable retry-with-exponential-backoff helper.
- Apply it to:
  - Ollama calls
  - WhatsApp polling
  - connector requests where safe

### Frontend Performance

- Debounce chat input updates at roughly 150ms.
- Lazy-load heavier views:
  - MiyaStudio
  - HectorResearchDesk
- Add or run bundle analyzer.
- Reduce main chunk under the warning threshold.

### Window State

- Add Tauri window state persistence if the plugin is already available.
- Save and restore size/position.

## Deliverables

- Performance code changes.
- SQLite WAL and pagination changes.
- Shared HTTP client.
- Retry helper.
- Lazy-loaded heavy views.
- `PERFORMANCE_RELIABILITY_REPORT.md`.

## Definition Of Done

- App remains functional.
- Main bundle size is improved or measured with clear next steps.
- SQLite writes are less likely to freeze reads.
- HTTP clients are reused.
- Memory queries no longer fetch unbounded records.

## Do Not Do

- Do not hide real errors with infinite retries.
- Do not add telemetry without explicit opt-in.
- Do not change data schema destructively without migration.

---

# Agent 7 — UX/UI Product Polish & Onboarding

## Required Skills

- Product design
- React component design
- Tailwind CSS
- Tauri desktop UX
- Onboarding flows
- Accessibility basics
- Toast/notification UX
- Approval and risk UX

## Mission

Make ALPHONSO feel like a serious multi-agent command center instead of a rough prototype by improving first-run onboarding, window layout, connector visibility, approval modals, and memory visibility.

## Primary Files / Areas To Inspect

- `src/App.jsx`
- Chat layout/views
- Sidebar/nav components
- Settings UI
- Connector UI
- Approval modal components
- File attachment UI
- Theme/settings persistence
- `src-tauri/tauri.conf.json`

## Tasks

### Window + Layout

- Increase default window size from 800×600 to 1280×800.
- Add minimum width and height.
- Improve layout for multi-panel usage.

### Onboarding

Create a first-launch onboarding flow:

1. Ollama install check.
2. Local model availability check.
3. Model download guidance.
4. Connector setup intro.
5. Privacy/local data explanation.
6. First message prompt.

### Connector Visibility

- Add connector status dots in sidebar/nav.
- Link status indicators to the connector health dashboard if Agent 5 creates it.
- Show disabled/missing-config states clearly.

### Approval Modal

Improve high-risk action approval modal with:

- Action name
- Connector involved
- Data being sent
- Destination
- Reversibility
- Risk level
- Confirm/cancel buttons
- “Always require approval for this connector” option if supported

### Theme + Shortcuts

- Add dark/light theme toggle.
- Persist theme via SQLite/settings path, not only localStorage if available.
- Add keyboard shortcut help overlay.

### File & Memory UX

- Add drag-and-drop file attach to chat.
- Show image thumbnails before attach.
- Keep or document current 500KB text-only cap if not changed.
- Add memory timeline view for SQLite memory records.
- Include delete/forget affordance if supported.

## Deliverables

- UX/UI code changes.
- Onboarding flow.
- Improved approval modal.
- Sidebar connector status indicators.
- `UX_UI_POLISH_REPORT.md`.

## Definition Of Done

- New user is guided through first launch.
- Window size is usable for command-center layout.
- Risky actions explain what will happen.
- Connector status is visible.
- The app feels more complete without requiring backend rewrites.

## Do Not Do

- Do not fake connector status. Use real status, missing config, or unknown.
- Do not add decorative UI that hides broken functionality.
- Do not remove approval gates to simplify the UX.

---

# Agent 8 — Infrastructure, Release Pipeline & Documentation

## Required Skills

- GitHub Actions release workflows
- Tauri build/release process
- Windows NSIS/MSI distribution
- Railway deployment
- Docker
- Dependabot
- Technical documentation
- Security documentation
- Contributor onboarding

## Mission

Make ALPHONSO easier to build, deploy, release, and understand by adding release automation, deployment hygiene, dependency automation, and core project documentation.

## Primary Files / Areas To Inspect

- `.github/workflows/`
- `package.json`
- `src-tauri/tauri.conf.json`
- Tauri updater config/latest.json
- Railway config/files
- gateway service files
- `docs/`
- root markdown files

## Tasks

### Release Pipeline

- Add GitHub Actions release workflow for tags like `v*`.
- Build Tauri app.
- Upload NSIS/MSI artifacts to GitHub Releases.
- Generate/update `latest.json` for Tauri auto-updater.
- Do not publish unless secrets and signing are properly configured.

### Auto-Updater

- Replace hardcoded `v0.1.0` update JSON with a dynamic release workflow.
- Document update signing requirements.
- Keep staging and production update channels separate if possible.

### Railway / Gateway

- Add Dockerfile for gateway service.
- Add `.dockerignore`.
- Add Railway staging environment documentation.
- Ensure Railway secrets are expected from environment variables, not committed files.

### Dependency Management

- Add `dependabot.yml` for:
  - npm
  - Cargo
  - GitHub Actions
- Add dependency update notes.

### Documentation

Create or update:

- `ARCHITECTURE.md`
- `CLAUDE.md`
- `CONNECTORS.md`
- `SECURITY.md`
- `CHANGELOG.md`
- `docs/PROOF_AUDIT_TRAIL.md`
- Inline docs for major Rust `#[tauri::command]` functions
- Comments for `serviceScopes.js` storage keys

### Health Check

- Add internal health check command or document how to test:
  - Ollama
  - SQLite
  - connector reachability
  - updater config

## Deliverables

- GitHub Actions release workflow.
- Gateway Dockerfile.
- Dependabot config.
- Core documentation files.
- `INFRA_RELEASE_DOCS_REPORT.md`.

## Definition Of Done

- A new contributor can understand how to run the app.
- A maintainer can cut a release from a tag.
- Deployment expects secrets from environment variables.
- Core architecture and connector setup are documented.
- Dependency update automation exists.

## Do Not Do

- Do not publish a release without explicit approval.
- Do not commit signing keys.
- Do not document fake features as completed.

---

# Recommended Assignment Order

If you only have 5 to 6 agents, use this priority order:

1. Agent 1 — Security Hardening & Secrets Cleanup
2. Agent 4 — Testing, CI/CD & Quality Gates
3. Agent 2 — Rust/Tauri Backend Refactor & IPC Validation
4. Agent 5 — Connector Transport Completion & Health Dashboard
5. Agent 3 — Frontend TypeScript Migration & React Architecture Cleanup
6. Agent 7 — UX/UI Product Polish & Onboarding

If you have 7 agents, add:

7. Agent 6 — Performance, Reliability & Local Data Stability

If you have 8 agents, add:

8. Agent 8 — Infrastructure, Release Pipeline & Documentation

---

# Suggested One-Message Spawn Format

Copy this message and replace `[AGENT NUMBER]` with the agent section you want to assign:

```text
You are Agent [NUMBER] for the ALPHONSO project.

You start fresh and do not share memory with other agents.

Read the shared project context and your assigned section carefully. Work only on your assigned mission unless a dependency forces a small supporting change.

Before editing, inspect the repo and identify the exact files involved. Then implement the task in small, reviewable changes.

Do not expose secrets. Do not hardcode credentials. Do not fake completed work.

When finished, report:

1. Summary
2. Files changed
3. Completed tasks
4. Not completed / blocked tasks
5. Risks
6. How to test
7. Recommended next step
```

---

# Final Coordination Notes For The Human Operator

- Start all agents at the same time if possible.
- Tell every agent to create a final report file.
- After all agents finish, run a merge/reconciliation pass.
- Expect conflicts between:
  - Agent 2 and Agent 5 in Rust connector files
  - Agent 3 and Agent 7 in React UI files
  - Agent 4 and all agents if tests are added around changed code
  - Agent 8 and Agent 1 around env/release/security docs
- Merge security changes first.
- Run tests after every merge.
- Do not ship until Agent 1 and Agent 4 both pass.
