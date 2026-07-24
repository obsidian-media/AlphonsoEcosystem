# AGENTS.md

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
- **Stack**: Tauri v2 (Rust backend) + React 18 (Vite 8, Tailwind 3) + Ollama (local LLM)
- **Version**: 2.6.1 (security hardened, 250 test files, 3,516 tests, 169 services)
- **Target**: v2.5.0 = security hardening complete, test coverage expanded, all connectors policy-gated

## Directory Structure
```
src/                   React frontend (100% .tsx — 116 components, 0 .jsx remaining)
  agents/              9 agent profiles, permissions, schemas
  components/          116 UI components (.tsx)
  services/              169 services (policy-gated, not stubs)
    connectors/        Connector outbound dispatch (policy-gated, calls Rust commands via invoke)
  hooks/               14 custom hooks (useAppShellState, useAppEffects split into 6)
  lib/                 Utilities (ollama.js, chatUtils.js, appStorage.js)
  test/                250 test files, 3,516 tests (Vitest; see ground truth for current verification status)
ios/                   iOS companion app (SwiftUI)
  AlphonsoCompanion/
    AlphonsoCompanionApp.swift    — @main entry point
    ContentView.swift             — tab view container
    Views/                        — PairingView, ChatView, AgentDockView, BoardroomView, SettingsView
    Services/                     — WebSocketService.swift, MDNSService.swift
    Models/                       — ConnectionState.swift
  src-tauri/             Rust backend
  src/lib.rs           ~2,054 lines, 105 Tauri commands (across 25 modules)
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
scripts/               Build, release, auth, verification scripts
e2e/                   Playwright E2E tests (smoke.spec.js, boot.spec.js)
gateway/               WhatsApp Cloud gateway (Railway-deployed, live)
  docs/                  documentation .md files
```

## Build & Test Commands
```bash
npm run dev              # Vite dev server (port 5173)
npm run test             # 3,516 tests (250 files; verified 2026-07-22)
npm run lint             # ESLint on src/
npm run build            # Vite production build (OXC compiler)
npm run verify:app       # lint + test + build in one command
npm run test:coverage    # Coverage report (threshold: 38% lines / 36% branches / 0% functions)
npm run test:e2e         # Playwright smoke test (needs dev server + Ollama)

# From src-tauri/
cargo check              # Verify Rust compiles
cargo test               # 98 Rust unit tests (across 25 modules)
cargo clippy -- -D warnings  # Lint Rust (CI enforces zero warnings)
```

## 9 Agents (Enhanced)
| Agent | Role | Key Constraint | New Capabilities |
|-------|------|----------------|------------------|
| Alphonso | Local operator — execution, verification, packaging | General execution | **18 skill packs**: Full-Stack, TDD, TypeScript, Rust, React, Python, Code Review, Build Verification, Refactoring, Debugging, Runtime Diagnostics, Security Audit, GitHub Integration, Performance Optimization, API Integration, Error Handling |
| Jose | Orchestrator — intake, routing, merge, confirm, report | Cannot bypass high-risk | **22 skill packs**: Orchestration, Task Routing, Approval Gating, Cross-Agent Synthesis, Pipeline Governance, Workflow Design, Strategic Planning, Dependency Mapping, Agent Coordination, Parallel Orchestration, Task Prioritization, Risk Assessment, Quality Gates, Compliance Checks, Progress Tracking, Status Reporting, Performance Metrics, Workflow Optimization, Bottleneck Detection, Continuous Improvement, Stakeholder Communication |
| Hector | Research + citations, source scan | No terminal/filesystem/posting | GitHub research, open source analysis, trend discovery | **22 skill packs**: Professional Marketing, Market Research, Competitive Analysis, Source Verification, RSS Monitoring, Executing Plans, API Documentation Research, API Integration Research, Compliance Research, Security Research, Trend Analysis, Market Intelligence, Content Research, Code Pattern Research, Technical Architecture Research, Open Source Analysis, Data Gathering, Source Curation, Confidence Scoring, Survey Design, Documentation Audit, Research Briefing |
| Miya | Creative — strategy, script, storyboard, export | No system commands | Content Catalyst pipeline | **21 skill packs**: Runway Video Generation, Creative Image, UI/UX Design, Brand Identity, Motion Graphics, Typography System, Color Palette, Content Strategy, Video Storyboarding, Social Media Design, Editorial Design, Animation Design, Illustration Style, Video Editing, Landing Page, Dashboard Design, Brand Guidelines, Icon System, Design System, User Research, Motion System |
| Maria | Governance, audit, risk, approval review | No destructive execution | Enhanced compliance checks | **18 skill packs**: Audit Governance, Trust Verification, Requirements Analysis, Risk Classification, Compliance Auditing, Approval Workflow, Evidence Collection, Claim Verification, Policy Enforcement, Audit Trail, Trust Audit, State Verification, Brand Safety, Content Moderation, Quality Assurance, Documentation Review, Stakeholder Reporting, Incident Response |
| Marcus | Approved distribution execution | Only approved paths | GitHub releases, Slack notifications | **18 skill packs**: Executing Plans, GitHub Releases, Slack Notifications, Distribution Execution, Release Readiness, Security Audit, Risk Detection, Integration Validation, Deployment Execution, Changelog Generation, Asset Distribution, Notification Routing, Approval Gatekeeping, Version Management, Rollback Execution, Release Reporting, Compliance Distribution, Team Communication |
| Echo | Memory historian and archival | Knowledge preservation only | Improved retrieval speed | **17 skill packs**: Memory Synthesis, Decision Capture, Retention Classification, Confidence Normalization, Knowledge Indexing, Historical Context, Audit Trail, Context Retrieval, Memory Pruning, Session Continuity, Memory Validation, Timeline Construction, Knowledge Graph, Memory Reporting, Preference Learning, Decision Diff |
| Sentinel | Security monitoring, automation safety | Safety checks only | Optimized policy checks | **17 skill packs**: Vulnerability Scan, Connector Risk, Secret Hygiene, Permission Audit, Automation Safety, Policy Compliance, Threat Detection, CSP Audit, Dependency Audit, Connector Gating, Runtime Monitoring, Approval Enforcement, Data Protection, Injection Scan, Auth Audit, Risk Scoring, Security Reporting |
| Nova | Scoring, analysis, opportunity prioritization | Analysis only | Cached analytics | **17 skill packs**: Opportunity Analysis, Market Analysis, Prioritization Matrix, Risk-Reward Assessment, Timing Analysis, Effort Estimation, Strategic Alignment, Growth Analysis, Competitive Intelligence, Value Scoring, Resource Optimization, Scenario Modeling, Decision Support, Capability Assessment, Trend Forecasting, Portfolio Analysis, Recommendation Engine |

## Key Architecture Rules
- **policyEnforcementService.ts** is fail-closed on missing credentials and Zero-Cost Mode (blocks paid connectors). The supplemental connector DSL (`policyDslService.ts`) is default-deny: unmatched actions deny and costly/irreversible actions require explicit consent. Every outbound connector call goes through the connector gate.
- **licenseService.ts** — license tier validation (Free/Pro/Enterprise) gates premium connectors
- **agentContractService.ts** enforces per-agent allowed/blocked action prefixes
- **parallelExecutionService.ts** — parallel task execution with concurrency control and retry
- **cacheService.ts** — memory caching with TTL and LRU eviction
- **orchestrationQueueService.js** manages durable queue with dead-letter replay
- **coachEngineService.ts** — Session Coach detection engine: 11 local detectors (agent whiplash, boardroom hedge pileup, unused surface area, license wall, critical override pattern, late-night approval, repeated pipeline failure, dead-letter graveyard, confidence decay, approval rubber-stamp, long unbroken session), each with cooldown/dedup and 3 configurable message styles (direct/balanced/gentle)
- All 22 connectors (Telegram, WhatsApp Cloud, YouTube, mobile_bridge, ChatGPT, Claude, Qwen, Notion, ClickUp, SD WebUI, ComfyUI Video, Runway, GitHub, Slack, Discord, Generic Webhook, Ollama, Brave Search, Perplexity, Tavily, DeepSeek, n8n) are policy-gated with real Test-button health checks (not stubs)
- `externalAgentAdapter.js` is the only intentional placeholder — returns `not_wired` for `acc` and `gemini` providers only; real implementations exist for deepseek/openai/claude/ollama
- Window close now calls `std::process::exit(0)` to prevent WebView2 zombie process leak

## Do Not Duplicate
Before writing any new service, component, or feature, check `CLAUDE.md` "Do Not Duplicate" table at project root. 169 services already exist.

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
- Never fake readiness — use truth labels: COMPLETE / PARTIAL / PLACEHOLDER / FAKE

## Known Staleness
- ARCHITECTURE.md previously claimed lib.rs "~7,200 lines" (~1,585 / 18 modules) — **corrected 2026-07-08**: actual is ~2,054 lines, 105 commands, 25 modules.
- Ground truth last verified 2026-07-23 (Session Coach Phase 3 + connector health checks).
- **This file's counts (services/tests/lib.rs/Tauri commands/modules) are enforced fresh by `scripts/verify-doc-counts.mjs` (`Doc Count Freshness` CI check) — do not hand-edit a number here without also checking `node scripts/verify-doc-counts.mjs` passes.** This file was restored 2026-07-24 after the repo-governance bootstrap pass (commit `46a1eb0`) had replaced its full content with a short governance-pointer stub, which silently broke that check — see `docs/governance/DEFERRED_WORK.md` if a similar regression needs tracking in the future.
