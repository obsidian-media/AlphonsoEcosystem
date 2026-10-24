This repository is governed by `REPO_RULES.md`. Read it before any work.

Non-negotiable gates:
- Branch-only workflow. No direct pushes or commits to `main`.
- CI gate must be green (secret-scan, build, test, doc-freshness, deploy-dry) to merge.
- Update docs in the same pass as code (Rule 2).
- Save audits under `audits/` using `YYYY-MM-DD_<Agent>_<Scope>_Audit.md` (Rule 6).
- Record deferred work in `docs/governance/DEFERRED_WORK.md` (Rule 12).
- No file deletion without Shayan's approval (Rule 14).
- No paid API / infra spend without Shayan's approval (Rule 24).

Run verification with `bash scripts/verify.sh` (or `pwsh scripts/verify.ps1`).

---

# Alphonso — Agent Context

## Project Identity
- **App**: Alphonso — local-first AI desktop companion
- **Stack**: Tauri v2 (Rust backend) + React 19 (Vite 8, Tailwind 4) + Ollama (local LLM)
- **Version**: 2.10.0 (on `main`, not tagged yet; latest release 2.9.0. 546 test files, 6,777 tests, 285 services)
- **Now**: the Jose redesign (phases 1–6b: plans as step graphs, approval by effect, the Requests board) and Miya's content factory (phases 1–4c: from an idea to finished, posted videos, Shorts and carousels, with results, paid engines, brand characters and motion) are on `main`. Jose phase 7 is next.

## Directory Structure
```text
src/                   React frontend (250 .tsx, 73 .jsx — mostly tests and older services)
  agents/              9 agent profiles and schemas (what each may do is src/services/jose/agentPermissionTable.ts)
  components/          175 UI components (incl. miya/, jose/, calendar/ for the content factory, Jose's board and the Calendar)
  services/            285 services (policy-gated, not stubs; 185/185 audited line-by-line 2026-07-28)
    connectors/        Connector outbound dispatch (policy-gated, calls Rust commands via invoke)
    jose/              Jose's planner, step graphs, effects, requests, Telegram, paid models
    contentFactory/    Miya's content factory: projects, brands, steps, media, posts, results, characters, motion
  hooks/               21 custom hooks (useAppShellState, useAppEffects split into 9 concerns)
  lib/                 Utilities (ollama.ts, chatUtils.js, appStorage.ts, randomId.ts, readableValue.ts)
  test/                546 test files, 6,777 tests (Vitest; see ground truth for current verification status)
ios/                   iOS companion app (SwiftUI)
  AlphonsoCompanion/
    AlphonsoCompanionApp.swift    — @main entry point
    ContentView.swift             — tab view container
    Views/                        — PairingView, ChatView, AgentDockView, BoardroomView, SettingsView
    Services/                     — WebSocketService.swift, MDNSService.swift
    Models/                       — ConnectionState.swift
  src-tauri/             Rust backend
  src/lib.rs           ~938 lines, 189 Tauri commands (across 50 modules)
  src/utils.rs         Shared utilities
  src/kv_store.rs      KV store module (SQLite-backed)
  src/whatsapp_webhook.rs  WhatsApp webhook module
  src/native_proof.rs  Native proof/RC0 engine
  src/runway.rs        Runway video generation
  src/connector_commands.rs  Connector Rust backend (14 commands, incl. GitHub & Slack)
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
  src/voice_sidecar.rs Voice sidecar management
  src/os_keychain_store.rs OS keychain credential storage
  src/runtime_manager.rs Runtime process manager
  src/companion_server.rs iOS companion WebSocket server
  src/companion_discovery.rs mDNS companion discovery
  src/companion_auth.rs Companion PIN authentication
  src/companion_types.rs Shared companion data types
  src/companion_router.rs Companion command routing
  src/commands/         Split-out commands (bridge, clipboard, filesystem, jose, notification, ocr, restore, runtime, system, updates, url)
  src/comfyui_installs.rs / comfyui_proxy.rs / comfyui_video_models.rs  Finding ComfyUI, its narrow backend route, pinned video/character/motion models
  src/media_tools.rs   FFmpeg, Kokoro, MusicGen, Whisper, stock clips, video assembly, Shorts, motion clips
  src/media_storage.rs Your own S3-compatible storage (SigV4)
  src/meta_video.rs / meta_media.rs  Reels, Instagram by link, Facebook photo posts
  src/oauth_signin.rs  Sign in to YouTube, Facebook and Instagram from Settings
  src/post_metrics.rs  Post numbers from YouTube, Instagram and Facebook
  src/elevenlabs.rs    ElevenLabs voices, speech, sound effects
  src/higgsfield.rs    Higgsfield pictures, clips, character training, motion
  src/memory_graph.rs / memory_graph_prune.rs  Memory knowledge graph and its retention
scripts/               Build, release, auth, verification scripts
e2e/                   Playwright E2E tests (8 spec files: smoke, boot, a11y, visual, voice, multiagent, content-pipeline, runtime-tools) — web build, Tauri bridge mocked
e2e-desktop/           Desktop E2E suite — real built app via tauri-driver, isolated test data (34 spec files)
gateway/               WhatsApp Cloud gateway (Railway-deployed, live) and the generic webhook gateway
docs/                  195 documentation .md files (209 markdown docs total incl. 14 root-level .md)
```

## Build & Test Commands
```bash
npm run dev              # Vite dev server (port 5173)
npm run test             # 6,777 tests (546 files; also runs bridge/)
npm run lint             # ESLint on src/
npm run build            # Vite production build (OXC compiler)
npm run verify:app       # lint + test + build in one command
npm run test:coverage    # Coverage report (actual 2026-09-05: 57.81% lines / 45.62% branches / 50.32% functions / 55.65% statements; enforced floors: 48% lines / 38% branches / 30% functions / 48% statements)
npm run test:e2e         # Playwright smoke test (web build, Tauri bridge mocked; needs dev server + Ollama)
npm run test:e2e:desktop # Desktop end-to-end suite against the real built app (WebdriverIO + tauri-driver)

# From src-tauri/
cargo check              # Verify Rust compiles
cargo test                # 357 Rust `#[test]`-attributed unit tests (across 50 modules; cargo test itself reports 370 passing, since it also runs the #[tokio::test] async tests this static count doesn't match)
cargo clippy -- -D warnings  # Lint Rust (CI enforces zero warnings)
```

## 9 Agents
What each agent may do is one table, `src/services/jose/agentPermissionTable.ts`: everyone may read and write its own work; only Alphonso may run code or change project files; only Marcus may publish or send; Jose and Marcus may spend, and Miya's paid media steps (voice, pictures, clips, Shorts, sound effects, character training) may too; spending always asks. Every plan Jose makes is checked against it.

| Agent | Role | Key Constraint | Skill packs |
|-------|------|----------------|------------------|
| Alphonso | Local operator — execution, verification, packaging; assembles the content factory's videos | The only agent that runs code or changes project files | **18 skill packs**: Full-Stack, TDD, TypeScript, Rust, React, Python, Code Review, Build Verification, Refactoring, Debugging, Runtime Diagnostics, Security Audit, GitHub Integration, Performance Optimization, API Integration, Error Handling |
| Jose | Orchestrator — answers or plans every request as steps, runs them, reports | Never runs code or publishes; may spend only on a paid-model step, which always asks; plans are checked against the permission table | **21 skill packs**: Orchestration, Task Routing, Approval Gating, Cross-Agent Synthesis, Pipeline Governance, Workflow Design, Strategic Planning, Dependency Mapping, Agent Coordination, Parallel Orchestration, Task Prioritization, Risk Assessment, Quality Gates, Compliance Checks, Progress Tracking, Status Reporting, Performance Metrics, Workflow Optimization, Bottleneck Detection, Continuous Improvement, Stakeholder Communication |
| Hector | Research — facts, sources, citations; what goes viral; stock clips | Read and write its own work only | **21 skill packs**: Professional Marketing, Market Research, Competitive Analysis, Source Verification, RSS Monitoring, Executing Plans, API Documentation Research, API Integration Research, Compliance Research, Security Research, Trend Analysis, Market Intelligence, Content Research, Code Pattern Research, Technical Architecture Research, Open Source Analysis, Data Gathering, Source Curation, Confidence Scoring, Survey Design, Documentation Audit, Research Briefing |
| Miya | Creative — the content factory: scripts, storyboards, pictures, voice, music, clips, Shorts, carousels, campaigns; front-end drafts | Read and write its own work only | **21 skill packs**: Runway Video Generation, Creative Image, UI/UX Design, Brand Identity, Motion Graphics, Typography System, Color Palette, Content Strategy, Video Storyboarding, Social Media Design, Editorial Design, Animation Design, Illustration Style, Video Editing, Landing Page, Dashboard Design, Brand Guidelines, Icon System, Design System, User Research, Motion System |
| Maria | Governance & Risk Lead — governance, risk and quality reviews (scripts, quality gate) | Read and write its own work only | **18 skill packs**: Audit Governance, Trust Verification, Requirements Analysis, Risk Classification, Compliance Auditing, Approval Workflow, Evidence Collection, Claim Verification, Policy Enforcement, Audit Trail, Trust Audit, State Verification, Brand Safety, Content Moderation, Quality Assurance, Documentation Review, Stakeholder Reporting, Incident Response |
| Marcus | Distribution & Release Manager — posts and schedules (the one post scheduler) | The only agent that publishes or sends, after approval | **15 skill packs** (security and risk packs moved to Sentinel and Maria, 2026-10-23): Executing Plans, GitHub Releases, Slack Notifications, Distribution Execution, Release Readiness, Integration Validation, Deployment Execution, Changelog Generation, Asset Distribution, Notification Routing, Approval Gatekeeping, Version Management, Rollback Execution, Release Reporting, Compliance Distribution, Team Communication |
| Echo | Memory historian and archival; saves a finished request's decisions | Read and write its own work only | **17 skill packs**: Memory Synthesis, Decision Capture, Retention Classification, Confidence Normalization, Knowledge Indexing, Historical Context, Audit Trail, Context Retrieval, Memory Pruning, Session Continuity, Memory Validation, Timeline Construction, Knowledge Graph, Memory Reporting, Preference Learning, Decision Diff |
| Sentinel | Security only — scans, connector risk, the content security check | Read and write its own work only | **17 skill packs**: Vulnerability Scan, Connector Risk, Secret Hygiene, Permission Audit, Automation Safety, Policy Compliance, Threat Detection, CSP Audit, Dependency Audit, Connector Gating, Runtime Monitoring, Approval Enforcement, Data Protection, Injection Scan, Auth Audit, Risk Scoring, Security Reporting |
| Nova | Scoring and analysis — market checks, post times, results, lessons and ideas | Read and write its own work only | **17 skill packs**: Opportunity Analysis, Market Analysis, Prioritization Matrix, Risk-Reward Assessment, Timing Analysis, Effort Estimation, Strategic Alignment, Growth Analysis, Competitive Intelligence, Value Scoring, Resource Optimization, Scenario Modeling, Decision Support, Capability Assessment, Trend Forecasting, Portfolio Analysis, Recommendation Engine |

## Key Architecture Rules
- **policyEnforcementService.ts** is fail-closed on missing credentials and Zero-Cost Mode (blocks paid connectors). The supplemental connector DSL (`policyDslService.ts`) is default-deny: unmatched actions deny and costly/irreversible actions require explicit consent. Every outbound connector call goes through the connector gate.
- **licenseService.ts** — license tier validation (Free/Pro/Enterprise); inert at launch (no vendor key configured), so every connector is usable
- **agentContractService.ts** checks every packet against the one permission table (`jose/agentPermissionTable.ts`); approval is by effect (`jose/joseEffects.ts`): spend, publish and delete always ask
- **parallelExecutionService.ts** — parallel task execution with concurrency control and retry
- **cacheService.ts** — memory caching with TTL and LRU eviction
- **orchestrationQueueService.js** manages durable queue with dead-letter replay
- All 33 connectors (ElevenLabs and Higgsfield since content factory phase 4b; Telegram, WhatsApp Cloud, YouTube, Meta (Facebook and Instagram), mobile_bridge, ChatGPT, Claude, Qwen, Notion, ClickUp, SD WebUI, ComfyUI Video, Runway, GitHub, Slack, Discord, Generic Webhook, Ollama, Brave Search, Perplexity, Tavily, DeepSeek, NVIDIA NIM, Gemini, n8n, Hermes Agents, CALL-E, Pexels, Pixabay, Coverr, Your storage) are policy-gated
- `externalAgentAdapter.js` (Agent Workshop) returns `not_wired` for any provider other than deepseek, openai, claude and ollama
- Window close now calls `std::process::exit(0)` to prevent WebView2 zombie process leak

## Do Not Duplicate
Before writing any new service, component, or feature, check `CLAUDE.md` "Do Not Duplicate" table at project root. 285 services already exist.

## Truth Source
`docs/ALPHONSO_GROUND_TRUTH.md` is the single source of truth. If any other document conflicts, trust the ground truth file.

## Mandatory Work Queue
Before starting maintenance, security, dependency, release, agent-contract, iOS,
voice, or documentation work, read and update
[`docs/TRUTH_FIRST_EXECUTION_PLAN.md`](docs/TRUTH_FIRST_EXECUTION_PLAN.md).
Use its checkboxes and evidence rules; do not mark work complete without the
required verification evidence.

## Version Rules
- v0.1.0: local install/build/test/release pipeline works
- v1.0.0: publicly installable + runtime proof — achieved
- v1.0.2: WebView2 leak fix + boot optimizations — achieved
- v2.0.0: enhanced agents, GitHub/Slack connectors, performance optimizations — achieved
- v2.0.2: WhatsApp Cloud end-to-end, auto-updater live, 1,100 tests — achieved
- v2.6.0–v2.9.0: Boardroom rebuild, in-app updates, memory knowledge graph, Smart Installer, desktop end-to-end suite — released
- v2.10.0: Jose redesign and Miya's content factory — on `main`, not tagged yet
- Never fake readiness — use truth labels: COMPLETE / PARTIAL / PLACEHOLDER / FAKE

## Known Staleness
- ARCHITECTURE.md previously claimed lib.rs "~7,200 lines" (~1,585 / 18 modules) — **corrected 2026-07-08**: actual is ~2,197 lines, 105 commands, 25 modules. AGENTS.md itself was stale on component count (82 `.jsx` → 114 `.tsx`), connector count (13 → 22), and service count (130 → 165); all corrected in this pass.
- Ground truth last verified 2026-10-25 (2.10.0 on `main`). WhatsApp deployment finalized.
- **This file was reconciled against real code again on 2026-10-25** (first on 2026-07-08 — see `docs/AUDIT_REPORT_2026-07-08.md`). Trust ground truth over this file if any remaining discrepancy is found.
