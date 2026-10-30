# ALPHONSO — Agent Ground Truth & Shared Context
**Last verified:** 2026-10-27 — **v2.10.0 tagged and released** (§11.51) after a whole documentation pass. Current numbers: 9 agents, 34 connectors, 328 services, 175 components, 21 hooks, 593 test files with 6,886 Vitest tests (594 with `bridge/tests`), 384 Rust `#[test]`s, 201 Tauri commands, 53 Rust source files, 46 desktop end-to-end spec files with 131 checks, 60 built-in skills.

**Last verified before that:** 2026-10-25 — every document reconciled with the code (§11.38). Version 2.10.0 is on `main` and **not tagged**; the latest release is v2.9.0 (2026-10-12). Since 2026-10-21, `main` gained the Jose redesign (phases 1–6b, §11.36) and Miya's content factory (phases 1–4c, §11.37). Current numbers: 9 agents, 34 connectors, 290 services, 175 components, 21 hooks, 556 test files with 6,832 Vitest tests, 357 Rust `#[test]`s (370 with the async ones), 189 Tauri commands, 50 Rust modules, 34 desktop end-to-end spec files.

**Last verified before that:** 2026-09-30 — pre-launch all-angle audit and fix pass on branch `fix/prelaunch-audit-2026-09-30` (see §11.28). Version is still 2.8.0; nothing has been released since. Work between 2026-09-09 and 2026-09-21 (SSRF redirect fix, ChatView hydration race, Hermes loopback check, Cloud Voice model pin, macOS boot-crash build target, Runway gate, fan-out budget) is recorded in `CLAUDE.md`'s dated entries and `docs/CHANGELOG.md`.

**Last verified before that:** 2026-09-09 — **v2.8.0 tagged and released.** See §11.27 for the actual release cut (PR #238 merged into `main` as `f3cdb03`, version bumped across all 4 locations, tag `v2.8.0` pushed to trigger `release.yml`'s real signed Windows/Linux builds) and §11.26 for the branch work that shipped in it (Dependency Bundling Plan O2, full WCAG sweep, first real live `npm run tauri dev` verification pass). `main` also carries the UI/UX redesign (PR #237) and Smart Installer (PR #233) from just before this. §11.1 onward below (dated 2026-09-07 and earlier) describes CALL-E and prior work and is still accurate as history, just no longer the most recent entry.

**Last verified before that:** 2026-09-07 — v2.7.1 (unchanged — no release cut), PR #230 merged (`095f7c4`),
CALL-E outreach connector (Phase 1 REST + Phase 2 conversational MCP). Two sessions: build,
then a live-verification + review-fix pass once the user obtained a real `CALLE_API_KEY` and
completed a real MCP browser login.

**Build:** `src/services/connectors/calleConnector.ts` (REST, `createCall`/`getCall`/
`pollCallUntilTerminal`, `Idempotency-Key` on every create) + `src/services/calleOutreachService.ts`
(`OutreachCallRecord` persistence/recovery) + `src/components/calle/CalleOutreachPanel.tsx`
(Phase 1 UI; wired into Settings -> Connectors as its own "CALL-E Outreach"
section on 2026-09-07 — it was reachable from nowhere in the app before that, which is why it
had never been live-verified) +
`src/services/calleMcpAuthService.ts` (brokered OAuth, no loopback server) +
`src/services/connectors/calleMcpConnector.ts` (MCP JSON-RPC, no SDK) +
`src/services/calleMcpOutreachService.ts` (clarifying-question state machine, wired into
`ChatView.tsx`). Registered as connector #26 in `connectorRegistry.js`, unconditionally
high-risk/paid in `policyEnforcementService.ts`.

**Review-fix pass (`50bf1d0`/`2af3a16`):** CodeRabbit found 18 real, mostly-severe issues on
first review, all fixed — highest-impact: `calleMcpConnector.ts` returned the raw MCP
`CallToolResult` envelope instead of unwrapping `structuredContent`, so every field read by
`planCall`/`runCall`/`getCallRun` was always `undefined`; `calleConnector.ts` gated `getCall()`
status reads behind the same approval gate as call creation, blocking all polling/recovery once
Approval Mode was on; `chatUtils.js`'s `shouldRouteThroughCalleMcp` matched "call" as a bare
substring anywhere in a message (CWE-201 — forwarded "How do I call a REST API?" straight to
CALL-E before any confirmation UI); `run_call` had no idempotency-failure recovery path (fixed
with a durable `submitting` stage, since that tool has zero idempotency key). Also fixed the
`connectorGitHubSlack.test.ts` connector-count assertion (25→26) and 5 stale doc-count claims.

**Live-verification pass (`5cfc680`), once a real API key + MCP login were available:** a safe
read-only `GET /v1/calls/{bogus-id}` (404, not 401) confirmed `CALLE_API_KEY` is valid and
confirmed the REST field mapping is correct. A real authenticated `tools/list` plus a real
planning-only `plan_call` round trip (via the official `calle` CLI, skills.sh skill — no call
placed) surfaced **two real design bugs vs. what was built from docs prose alone**: `plan_call`
has no `conversation_history` parameter at all (it tracks state itself via an opaque `plan_id`
threaded through each turn's raw `user_input`), and the response never echoes a phone number
(`isPhoneAlreadyInFlight`'s cross-chat duplicate-call guard was dead code from day one — removed,
not patched around). Both fixed; 19+9 rewritten tests, 143 total across the CALL-E suite passing.

**Full browser UI walkthrough** (`npm run dev` + Playwright, browser-only — not the native Tauri
app) confirmed both Phase 1/2 credential UI renders correctly and, sending a real chat message
("call Joe's Pizza and ask if they'd like a free website audit"), confirmed **the entire Phase 2
pipeline fires correctly end-to-end** through to a correct "not connected" error with zero stray
MCP network calls before auth. One false alarm during this pass, root-caused before concluding
anything: an unrelated 14-hour-old stale dev server process made CALL-E look completely absent
from the Connectors panel — restarting the server resolved it; not a code bug.

**Not yet verified — needs the native Tauri app:** a real MCP login completed through Alphonso's
own `calleMcpAuthService.ts` (the CLI's login was a separate session), a credential surviving
reload via the real OS keychain (confirmed Tauri-native-only, no browser fallback, by design),
and an actual placed call (`run_call`) — not attempted without a real recipient and explicit
go-ahead, since it rings a real person. **Cost, confirmed 2026-09-07** against
heycall-e.com/pricing: "All new CALL-E users gain 20 free calls after sign-up," then a flat
$0.05 per billable call — so the outstanding verification call is free against the trial
allowance, and the earlier "costs money" framing overstated the barrier. J3 now carries
explicit 4-point Done-when criteria (nav reachability — done; native MCP login; keychain
survival across restart; one real terminal-status call with an audit row). Full narrative:
`docs/TRUTH_FIRST_EXECUTION_PLAN.md`'s J3 entry.

**Previous entry (2026-09-04):** v2.7.0 (PRs #210-#215, #219). The memory
knowledge graph project's full 4-phase roadmap shipped through Phase 3:
Foundation (schema, manual edges, one-hop reads), Expansion (3 more writers,
multi-hop traversal), and Intelligence & Visualization (a 3D force-directed
viewer via `react-force-graph-3d`, plus automated structural edge inference —
common-neighbor + shared-event link prediction, auto-written with
`confidence: 'inferred'`, triggered on every write / a 30-min schedule / an
on-demand viewer button). Phase 4 (Governance — retention/pruning) is
explicitly deferred, logged in `docs/governance/DEFERRED_WORK.md`. Separately,
found and fixed two real, current bugs while preparing this release: **(1)**
Gemini's shipped default model (`gemini-2.5-flash-lite`) was silently retired
by Google — confirmed live with a real key, switched to
`gemini-3.5-flash-lite`/`gemini-3.6-flash` (Google's own recommended
replacements); **(2)** Hermes had a Settings-only toggle with zero
send-routing in the main `ChatView.tsx` picker — wired end-to-end (real
`sendHermesAgentMessage` branch in the send path, `agentId="alphonso"` passed
into the picker), which also surfaced and fixed a deeper pre-existing bug:
`ChatView`'s `settings.selectedProvider` and Settings' per-agent provider
store were never actually synchronized despite a code comment claiming
otherwise. Verification: `tsc --noEmit` clean, targeted `eslint` clean, the
Gemini fix live-verified against the real API. Local Vitest could not start
its worker pool during significant portions of this session (severe memory
pressure from unrelated concurrent processes on this dev machine, confirmed
via many repeated retries across a wide range of available-memory levels) —
CI's clean runner is the authoritative test verification for this release,
not local execution.

**Previous entry (2026-08-25):** v2.6.5 (PR #189 + #190). User reported the installed v2.6.4 app "not functional," specifically Hermes Agents and Voice OS still broken despite the 2026-08-22 CSP/ACL/timeout fixes. Full source-level health check on `main` found the app itself sound (dev-mode click-through across all 14 sections + a real Ollama chat round-trip, zero console/page errors — this dev machine doesn't have the app installed, so the *installed* build couldn't be driven directly). Root-caused and fixed 2 real bugs the prior fixes had missed: **(1) PR #189** — `voice_start` in `voice_sidecar.rs` conflated "sidecar is slow to start" with "sidecar crashed immediately" into the identical generic "did not become ready within 15 seconds" message; the 2026-08-22 timeout bump only fixed the slow-start case. Now captures the sidecar's last 20 stderr lines and checks for early process exit on every poll, surfacing the real crash reason instead. **(2) PR #190** — the actual root cause of Hermes's "Failed to fetch": every Hermes call used the webview's own `fetch()`, which is subject to browser CORS; Hermes Agent is a third-party process the user runs on their own arbitrary local port and has no reason to send CORS headers, so a cross-origin `fetch()` from the Tauri webview was silently blocked regardless of whether the profile was actually running and reachable (confirmed connected in this case). The 2026-08-22 CSP allowlist fix addressed Content-Security-Policy — a different browser mechanism — so it could never have fixed this. Added `connector_hermes_agent_request`, a native Rust `reqwest`-backed Tauri command (mirrors the existing `connector_github_action`/`probe_local_runtime_health` pattern), not subject to CORS; `hermesAgentConnector.ts` routes through it inside Tauri, falls back to the original `fetch()` outside Tauri (dev mode / this file's unchanged unit tests). Verified: `cargo check`/`clippy -D warnings`/`fmt --check` clean, `tsc --noEmit` clean, `npx eslint` clean, 3 existing `voice_sidecar` Rust tests + 27 existing `hermesAgentConnector` tests all passing. **Not yet live-verified** against a real Voice OS crash or a real Hermes profile in a packaged v2.6.5 build — flagged, not assumed working. This dev machine's Vitest `forks` pool has a pre-existing startup-timeout issue (documented below) that also affected a single-file run this session; `--pool=threads` worked around it for local verification only, CI is unaffected.
**Previous entry (2026-08-20):** `recover/hook-test-coverage` (PR #151): the 5 hook test files flagged 2026-08-14/2026-08-19 as failing under Vitest 4's `vi.mock` hoisting semantics (`useAppShellState`, `useBootEffects`, `usePersistenceEffects`, `useSessionEffects`, `useTrayEffects`) are now fixed, plus `useKeyboardShortcuts` (found failing during verification, not in the original 5). Full `src/test/hooks/` suite: 15 files / 345 tests, 0 failures. Branch merged with `main` (zero conflicts) and pushed; PR #151 CI re-triggered. See `docs/governance/DEFERRED_WORK.md`'s 2026-08-20 update and `docs/handoffs/2026-08-19_OpenCode_HookTestCoverageRecovery_Handoff.md` for the resolved handoff.
**Previous entry (2026-08-14):** v2.6.2 (post-PR #143 stabilization pass: branch/stash audit, security patch, CI hardening, real bug fixes, 8 Dependabot merges, release cut)
**Verified by:** Claude Code session — the user asked for a full repo-hygiene pass after PR #143 (iOS companion operations area) landed. Work done, each verified against real test/CI output rather than assumed: **(1)** patched `requests` 2.32.5→2.33.0 in the voice backend (GHSA-gc5v-m9x4-r6x2), 37/37 voice-backend pytest passing (PR #145, merged); the paired `glib` Dependabot alert is documented as blocked on Tauri's own `gtk = "^0.18"` pin, not fixable from this repo. **(2)** wired `AlphonsoCompanionTests` (5 files, previously never executed anywhere) into `ios-build.yml` ahead of the signing/archive/upload steps (PR #146, merged). **(3)** audited all 7 local branches and 16 git stashes: 6 branches confirmed to have zero unique commits vs. `main` (deleted, local+remote); 15 of 16 stashes traced and confirmed superseded or trivial (dropped) — one, a stash from 2026-07-10 containing 7,243 lines of never-committed hook test coverage (14 new test files under `src/test/hooks/`), was genuinely unrecovered work and rescued onto branch `recover/hook-test-coverage` (pushed, no PR — 257+/396 passing; the remaining 132 failures trace to a Vitest 2.1.9→4.1.8 major-version jump changing `vi.mock` hoisting semantics, tracked in `docs/governance/DEFERRED_WORK.md`, not force-fixed blind). **(4)** found and fixed a real, silent duplicate-file bug: `src/lib/appStorage.ts`/`ollama.ts` existed alongside their already-migrated `.ts` counterparts, and Vite's default resolve order was silently running the untyped `.js` files; deleting them surfaced a genuine behavior regression in `ollama.ts`'s `classifyOllamaError` (required a literal `DOMException` instance to classify aborts as `'timeout'`, which the tested `.js` version didn't require — non-`DOMException` abort errors were silently misclassified as `'disconnected'`), fixed to match tested behavior (PR #147, merged). **(5)** fixed all 5 pre-existing `tsc --noEmit` errors — one of which was not cosmetic: `App.tsx`'s iOS "steer boardroom" handler called `addThreadMessage(sessionId, 'shayan', guidance)` with 3 positional arguments against a function that takes a single options object, so every boardroom-steering message sent from the iOS companion since PR #143 shipped has silently no-opped (destructuring a string as `{threadId, speaker, content}` yields all `undefined`, and the function returns `null` on empty content) — fixed to pass the object form (PR #148, merged). **(6)** merged 8 green Dependabot PRs (`actions/setup-python`, `actions/setup-node`, `softprops/action-gh-release`, `mdns-sd`, `eslint`, `tokio-tungstenite`, `@types/node`, `@vitejs/plugin-react`); left `tailwindcss` v4 (#131) and `rand` 0.10 (#92) deferred as previously decided (major breaking bumps, CI red). **Not verified live:** iOS companion pairing on a real device, and the boardroom-steering fix above — both still need a real phone in hand, flagged explicitly rather than assumed working from code alone.
**Previous entry (2026-08-12):** v2.6.1 (Mobile companion operations + ChatView race condition fix: added Task Launcher bento card, Agent Dock Interlock profiles sheet, and Boardroom live steering; resolved the chat-loading race bug; branch `fix/pr140-review-followup`) — OpenCode session. Designed and implemented premium "Midnight Editorial Cyberpunk" UI/UX styling for the iOS Companion using the `ultimate-frontend-design` framework and real cloud-hosted portrait assets; resolved a major latent race condition bug in `ChatView.tsx` by introducing synchronous message list clearing on activeChatId changes. Integrated remote image loading with AsyncImage, dual-storage updates in `approvalService.js` via `durableSet`, and JSON-RPC dispatch mappings in `companion_router.rs`. Current repo totals at that time: 263 test files, 3,758 tests, 185 services, 24 connectors.
**Previous entry (2026-07-24, Phase 4):** v2.6.1 (Session Coach Phase 4: optional Ollama-narrative layer, gated off by default) — implemented `generateNarrativeCoachMessage()` in `coachEngineService.ts` per §11, wired into `CoachContext.jsx` as an immediate-display-then-swap-in pattern so the LLM call never blocks the rule-based intervention. 100/100 `coachEngineService.test.js` tests passing, `tsc --noEmit` clean, lint clean.
**Previous entry (2026-07-23):** v2.6.1 (Session Coach Phase 3: 3 configurable message styles per detector — direct/balanced/gentle; 33 hand-written message variants, 3,619 tests; no version bump) — Claude Code session reconciled the root docs against recent voice/mobile commits already on `main` (desktop Voice OS, iOS companion Voice tab, cloud voice, Farsi routing, Supabase device enrollment), reviewed branch `sprint-5-kilo-cli` for PR readiness against current `main`, and corrected the failing README Rust test count so `npm run verify:docs` passes on `main`. Full details: sections 11.19 and 11.20.
**Version:** 2.6.0 (unchanged — no release cut; this pass verified current docs against recent `main` history and branch state rather than running the full app/build matrix)
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

## Active execution queue

[`TRUTH_FIRST_EXECUTION_PLAN.md`](TRUTH_FIRST_EXECUTION_PLAN.md) is the
repository-wide remediation backlog. Every human and agent must read it before
starting maintenance, security, dependency, release, agent-contract, iOS, voice,
or documentation work. Update its checkbox and evidence record with this file in
the same change; no task is complete without the plan's stated verification.

---

## 1. Project Identity

| Field | Value |
|---|---|
| App name | Alphonso |
| Version | 2.10.0 |
| Type | Tauri v2 desktop app (Windows; macOS Apple Silicon and Linux builds too) |
| Project root | `D:\AgentDevWork\repos\AlphonsoEcosystem` |
| Backend | Rust (minimum 1.77.2), Tauri 2.12, SQLite (rusqlite bundled), the OS keychain, tokio, reqwest, tokio-tungstenite (companion) |
| Frontend | React 19, Vite 8, Tailwind 4, Lucide React, Framer Motion — new UI work is `.tsx`; legacy production `.jsx` contexts and Content Catalyst files remain and are tracked for migration. |
| UI System | **OKLCH** CSS design token system (`src/styles/tokens.css` — all colors in `oklch()` syntax), Framer Motion animation library (`src/lib/motion.ts` — spring/tween/fadeUp/fadeIn/slideInRight/scaleIn/staggerContainer/staggerItem/messageIn/panelIn), component library in `src/components/ui/` (Button, Badge, Card, Input, Tabs, Modal, EmptyState, StatusDot, LoadingState, ProgressRing, Skeleton, index.ts) |
| AI layer | Ollama local (`llama3.2:3b` starter model, or the model you choose), NVIDIA NIM and Gemini (free tiers), Hermes Agents (self-hosted), Claude and ChatGPT (paid; used for Jose's steps only when you allow paid models) |
| Media | FFmpeg (bundled on Windows), Kokoro, MusicGen, Whisper, ComfyUI (pictures, AI clips, the character reference model, motion transfer); paid and optional: Runway, ElevenLabs, Higgsfield |
| Voice OS | FastAPI + Python microservice in `voice/` — STT (faster-whisper), LLM (Ollama `/api/chat`), TTS (piper), VAD (webrtcvad), barge-in cancellation. Launched as Tauri sidecar via `voice_sidecar.rs`. |
| Deployment | Windows NSIS + MSI installers, macOS DMG and Linux AppImage (`release.yml`), Railway (WhatsApp gateway, Farsi Piper), AWS ECS (Cloud Voice compute; did not resolve on 2026-10-20) |

---

## 2. Agent Roster — 9 Agents (not 4)

Every agent has a profile and schema in `src/agents/`. All 9 are registered in `src/agents/agentRegistry.js`. What each may do is one table, `src/services/jose/agentPermissionTable.ts` (Jose redesign phase 1, 2026-10-23): everyone may read and write its own work; only Alphonso may run code or change project files; only Marcus may publish or send; Jose and Marcus may spend, and so may Miya's paid media steps (`checkPlan()` allows them by action type); spending always asks. `agentContractService.ts` and Jose's plan check (`jose/stepGraph.ts`) enforce it. The `…Permissions.js` files in `src/agents/` are descriptive only.

**Note:** this repository is developed with coding agents (Claude Code, OpenCode, Codex). Those are distinct from the 9 Alphonso agents defined in `src/agents/`.

| Agent | Role | Key constraint |
|---|---|---|
| **Alphonso** | Local operator — execution, verification, packaging; assembles the content factory's videos | The only agent that may run code or change project files |
| **Jose** | Orchestrator — answers or plans every request as a step graph, runs it, reports | Never runs code or publishes; may spend only on a paid-model step, which always asks; every plan is checked before anything runs |
| **Hector** | Research — facts, sources, citations, what goes viral, stock clips | Read and write its own work only |
| **Miya** | Creative — the content factory (script, scenes, pictures, voice, music, clips, Shorts, carousels, campaign), front-end drafts | Read and write its own work only; paid engines only inside an approved step |
| **Maria** | Governance & Risk Lead — governance, risk and quality reviews | Read and write its own work only; Ollama-powered with deterministic fallback, and says which one gave the verdict |
| **Marcus** | Distribution & Release Manager — posts and schedules; the one scheduler for posts | The only agent that may publish or send, always after approval |
| **Echo** | Knowledge Historian — memory synthesis, retention classification, a finished request's decisions | Read and write its own work only; Ollama-powered with deterministic fallback |
| **Sentinel** | Security only — threat detection, permission audit, the content security check | Read and write its own work only |
| **Nova** | Analyst — scoring, market checks, post times, results, lessons and ideas | Read and write its own work only |

---

## 3. Service Layer — 285 Services in `src/services/`

Key services that past audits missed or underestimated:

### Orchestration & Governance (fully implemented)
- `orchestrationQueueService.ts` — durable queue with state transitions (`new → pending_approval → queued → reported_to_jose → dead_letter/failed`), dead-letter replay, manual interrupt
- `orchestrationReceiptService.ts` — receipt events across all flows: assignment creation, policy blocks, retries, dead-letter, merge/confirm, pipeline completion
- `orchestrationGovernanceService.ts` — governance layer over orchestration
- `joseCommandRouterService.ts` — routes a plan's steps into packets (only Jose's own code calls it; `src/test/joseEntryPoints.test.js` enforces this)
- `joseExecutionEngineService.ts` — Jose execution engine: runs, resumes after an approval, carries on an interrupted request
- `packetExecutionService.ts` — packet-level execution

### Jose (redesign phases 1–6b, 2026-10-23)
- `jose/joseInbound.ts` (`answerOrPlan()`), `jose/joseDecision.ts`, `jose/submitToJose.ts` — every caller's entry point
- `jose/josePlanner.ts`, `jose/joseTemplates.ts`, `jose/joseUserTemplates.ts` — plans from templates or fresh
- `jose/stepGraph.ts`, `jose/agentPermissionTable.ts`, `jose/joseEffects.ts` — the plan check, the one permission table, approval by effect
- `jose/joseRequestStore.ts`, `jose/joseStepOutputs.ts` — saved requests and each step's output
- `jose/joseAdapt.ts`, `jose/joseReviewLoop.ts`, `jose/joseHelp.ts`, `jose/joseModels.ts`, `jose/joseSpend.ts` — plans that change while they run, larger models, paid models
- `jose/joseTelegram.ts`, `jose/joseExpiry.ts`, `jose/joseFinish.ts` — Telegram approvals, expiry, Echo's save
- Screens: `src/components/jose/` (plan map, Requests board, editor, Chat card, step output)

### Miya's content factory (phases 1–4c, 2026-10-22 to 2026-10-25)
- `contentFactory/` — 46 services: projects, brands, the project plan, step prompts and executors, media (voice, music, stock clips, AI clips, assembly, captions), Shorts, carousels, posts and the one publishing path, post moves, the Calendar's items, sign-in expiry, daily limits, results, lessons, ideas, paid engines, characters and motion. Rows for each are in `CLAUDE.md`'s Do Not Duplicate table.
- Screens: `src/components/miya/` (the studio tabs), `src/components/calendar/` (the Calendar)

### Policy & Approval (fully implemented, fail-closed)
- `policyEnforcementService.ts` — **centralized policy gate** enforcing: zero-cost mode, approval mode, connector risk classification, auth/allowlist checks. Fails closed with a blocked result object when uncertain or unauthorized.
- `connectorRegistryService.ts` — all 35 connectors' send paths run through policy gate before any external call

### Agent Contracts (fully implemented)
- `agentContractService.ts` — per-agent allowed/blocked action prefixes, checked before packet execution
- `agentBusService.ts` — inter-agent messaging bus

### Memory & Knowledge
- `unifiedMemoryService.js` — **unified memory** consolidating 4 separate systems (shared 1000, miya 700, ecosystem 1500, workflow 2000) into single API with namespace/category filters. All old services re-export from unified service (backward compatible).
- `memoryService.ts` — re-exports from unifiedMemoryService
- `miyaMemoryService.ts` — re-exports from unifiedMemoryService
- `memory/ecosystemMemoryService.js` — re-exports from unifiedMemoryService
- `durableMemoryService.ts` — re-exports from unifiedMemoryService + migration helpers
- `workflowMemoryService.ts` — re-exports from unifiedMemoryService
- `sessionIntelligenceService.ts`, `workspaceIntelligenceService.ts`
- `sourceConfidenceService.ts`, `trustModel.ts`, `verificationService.ts`

### Connector & External
- `connectorRegistryService.ts` — all outbound connector paths (policy-gated)
- `whatsappWebhookService.ts` — WhatsApp webhook handling
- `marcusPublishService.ts` — Marcus-governed distribution
- `metaPublishService.ts` — Meta/Instagram publishing
- `hectorResearchService.js` — Hector live research
- `toolConnectionService.ts`, `toolNotificationDispatcher.ts`

### Workflow Operations (16 structured workflows)
- `workflowOperationsRegistryService.ts` — Marketing Ops, Social Media, Content Production, Learning, Startup/Product Dev, Opportunity Discovery, Construction Ops, Knowledge Preservation, Content Repurposing, Automation Governance, Research Operations, Crisis Management, Ecosystem Learning, Human Collaboration, Financial Intelligence, Reputation and Brand Monitoring
- `workflowExecutionService.js`, `workflowBuilderService.ts`, `workflowGovernanceService.ts`

### Self-Development & Release
- `selfDevelopmentService.ts`, `nativeSelfDevelopmentAutostartService.ts`
- `productionReadinessService.js`, `rc0EvidenceService.ts`, `nativeRc0ProofService.ts`
- `runwayService.ts`, `appUpdateService.ts`
- `repoAuditService.ts`

### Agent Brain & Execution
- `agentBrainService.js` — Brain 1-9: context reader, clarifying questions, plan preview, pattern memory (200 cap), thinking loop with error feedback, optimized Ollama params, multi-step decomposition (12+ patterns), git auto-commit, auto-run dev server, Composio external tool detection, post-write validation loop (build/lint after generation), self-evaluation (confidence 0-100), structured tool use (`executeWithTools` loop with 16 tools, max 10 iterations)
- `toolRegistryService.ts` — 16 tools with JSON schemas: read/write/delete/move files, search, list dir, run commands, fetch URL, open URL, clipboard read/write, Composio, memory save/search, git commit/status
- `streamingService.ts` — real-time token streaming with state persistence, subscriber pattern, abort support
- `composioService.ts` — Composio SDK integration: API key config, toolkit discovery, action execution, agent tool selection via LLM, health check
- `agentMetricsService.ts` — execution recording, success rate, confidence tracking, validation pass rate, 7-day trend, top commands, error patterns, per-agent breakdown
- `proactiveAgentService.ts` — 7 proactive checks (failed builds, validation failures, high iterations, low confidence, project staleness, idle time, unused memory), suggestion banner with action buttons, 60s interval with 5min cooldown per type
- `workspaceFileService.ts` — frontend wrapper for Tauri file operations: read, delete, move, search, list directory, tree builder
- `browserAutomationService.ts` — open URL, fetch content (HTML stripping, title extraction), clipboard read/write
- `backupService.ts` — full export/import of localStorage + SQLite + KV store as JSON, size estimation, file download/upload
- `searchService.ts` — memory/project search with relevance scoring, category/agent filters, date range, suggestions
- `modelSelectionService.ts` — multi-model selection, task-type routing, per-task override
- `autoRunService.ts` — auto-run dev server after build, opt-out toggle
- `gitService.ts` — git revert, log, status, diff for rollback
- `scaffoldTemplatesService.js` — 8 project templates (React, Next.js, Express, full-stack, vanilla)

### Resilience & Monitoring (added Sprint Next-50)
- `connectorCircuitBreakerService.ts` — localStorage-backed circuit breaker per connector; 5-failure threshold, 60s cooldown, half-open recovery
- `connectorRateLimiterService.ts` — in-memory token-bucket rate limiter; 60 req/min default, per-connector config
- `memoryMonitorService.ts` — localStorage usage monitor; byte counts, threshold alerts (5MB warn / 8MB critical), pruneOldest helper

### Agent Intelligence (added Sprint Next-50)
- `hectorBookmarkService.ts` — Hector research bookmark ring (200 cap); tag/search filter, JSON export
- `mariaWeeklyReportService.ts` — Maria governance weekly report; reads audit + receipt logs, risk breakdown, scheduleWeeklyGeneration

### Voice OS (added feat/voice-os sprint)
- `src/services/voiceOsService.ts` — Tauri `invoke` wrappers: `startVoiceServer`, `stopVoiceServer`, `getVoiceServerStatus`, `getVoiceWebSocketUrl`. Appends `agentActivityService` (now `.ts`) events on start/stop.
- `src/hooks/useJarvisVoice.ts` — React hook for voice WebSocket: `start`, `stop`, `reset`, `state`, `transcript`, `reply`, `activeAgent`, `error`, `isConnected`. Uses **AudioWorklet** (not deprecated ScriptProcessor).
- `src-tauri/src/voice_sidecar.rs` — `VoiceSidecar` state struct + `voice_start`/`voice_stop`/`voice_status` Tauri commands. `voice_start` accepts `app: tauri::AppHandle` and resolves the backend path via `app.path().resource_dir().join("voice/backend")` — works in both dev and production installs. `voice/backend/**` is included in bundle resources via `tauri.conf.json`.
- `voice/backend/` — Python FastAPI: `main.py` (lifespan preload, CORSMiddleware, `/health`, barge-in, conversation history), `pipeline.py` (async generator: VAD→STT→agent→LLM→TTS), `router.py` (9-agent regex routing), `state.py` (per-session `get_state`/`set_state`/`remove_state`), `session.py` (task registry, barge-in cancel), `stt.py` (faster-whisper + lru_cache), `tts.py` (piper + ThreadPoolExecutor, async `synthesize()`), `vad.py` (webrtcvad `is_speech()`)
- `voice/backend/tests/` — `test_state.py`, `test_session.py`, `test_router.py`, `test_stt.py`, `test_pipeline.py`
- `voice/frontend/src/useJarvisVoice.ts` — Standalone frontend hook (AudioWorklet, all exports)
- `voice/frontend/src/pcm-processor.worklet.ts` — AudioWorklet processor (PCM float32→int16)
- `src/hooks/pcm-processor.worklet.ts` — **copy required by `useJarvisVoice.ts`** (the hook imports from `./pcm-processor.worklet`; the voice/frontend version is a separate package). Do NOT remove this file.
- `voice/cloud-backend/` — Cloud Voice FastAPI service (on Railway at first). Cloud Voice compute moved to AWS ECS (`voice.obsidianmedia.online`, the iOS app's built-in address) in September 2026; the Farsi Piper voice is still on Railway, and Railway is kept as the rollback. On 2026-10-20 the AWS address did not resolve (`audits/2026-10-20_Codex_CloudVoice_Production_Recheck_Audit.md`), so it needs the infrastructure owner before a device test. It validates bearer-authenticated requests, applies one of nine voice personas, uses NVIDIA NIM for replies, NVIDIA TTS for non-Farsi replies, and private Railway Piper for `fa-IR` (`mana`/`manta`). `/health` and `/ready` were verified live on 2026-07-13.
- `voice/piper-farsi/` — token-protected Railway Piper service with a persistent `/data` model cache. `/health` was verified live on 2026-07-13 and reports `mana` and `manta`.
- **Cloud Voice access truth: PARTIAL.** The iOS Voice UI no longer exposes provider credentials, carries selected agent/language metadata, uses Supabase email OTP with a Keychain session, and enrolls a stable device UUID. Cloud Voice validates the Supabase user session plus active device on each request. The server and migration were deployed on 2026-07-13; physical iPhone sign-in, English speech, and Farsi speech acceptance still require verification before public-ready status.

### UI Polish Sprint (v2.3.1)
- `src/services/connectors/perplexityConnector.ts` — Perplexity AI search: `isPerplexityConfigured`, `searchPerplexity`. Called `/chat/completions` with `llama-3.1-sonar-small-128k-online` at first; since 2026-10-21 it uses Perplexity's Search API (`POST /search`), as that model was retired.
- **6 pages tab-overhauled**: `ProjectExecutionMode.tsx` (4 tabs), `HectorResearchDesk.tsx` (3 tabs), `OrchestratorView.tsx` (4 tabs), `MiyaStudio.tsx` (tab-conditional layout), `EcosystemHub.tsx` (flat header + pill toggle), `ContentCatalystWorkspace.jsx` (max-w-5xl wrapper).

### JUNE CANDY Additions (v2.2.8 – v2.3.0)
- `src/services/connectors/tavilyConnector.ts` — Tavily AI search (free tier 1K/mo), `searchTavily`, `isTavilyConfigured`. Wired as tier-2 fallback in `hectorResearchService.js` (Brave → Tavily → DuckDuckGo → RSS).
- `src/services/chromaDbService.ts` — ChromaDB local vector DB (port 8000): `addMemoryToChroma`, `semanticSearchMemory`, `deleteMemoryFromChroma`, `isChromaHealthy`. Fire-and-forget write from `echoMemoryService.runEchoPreservation`.
- `src/services/whisperTranscriptionService.ts` — Whisper meeting transcription: `transcribeAndIngest(audioFilePath, filename, onProgress)` — calls `transcribe_audio_file` Tauri command → Ollama summarize → Echo `pushMemoryItem`.
- `src/services/connectors/n8nConnector.ts` — n8n workflow automation: `isN8nHealthy`, `triggerN8nWebhook`, `listN8nWorkflows`, `setN8nWorkflowActive`. Wired as Marcus distribution target (`n8n|workflow.*trigger`). All endpoints have AbortController timeouts (15s/10s/5s).
- `src/services/moduleRegistryService.ts` — Agent OS module registry: `installModule`, `enableModule`, `disableModule`, `listModules`, `getModule`, `uninstallModule`. Persisted via durableStore as `alphonso_modules_v1`. Reads `module.toml` manifests.
- `src/services/runtimeApiService.ts` — Bridge client (port 4444) for module lifecycle: `listModules`, `runModule`, `getRunStatus`, `publishEvent`. Falls back to registry when bridge offline. 10s AbortController timeout.
- `src/services/policyDslService.ts` — Module-level policy evaluation: `loadPolicy`, `evaluateAction`, `getPolicyRules`. Uses hardcoded rules from `policy.yaml` spec. Separate from `policyEnforcementService`.
- `src/services/a2aProtocolService.ts` — A2A task delegation: `delegate`, `getTaskStatus`, `updateTaskResult`, `listActiveTasks`, `listTasksByAgent`. Uses agentBusService for message passing; persists to `alphonso_a2a_tasks_v1`.
- `src/services/joseSchedulerService.ts` — Jose cron scheduler: `createSchedule`, `listSchedules`, `saveSchedule`, `deleteSchedule`, `startScheduler`, `stopScheduler`. `SCHEDULE_PRESETS`: 30min/hourly/daily/weekly. Polls every 60s, fires callback when due. Started in `App.tsx`.
- `src/services/echoFileWatcherService.ts` — Echo inbox file watcher: `startFileWatcher`, `stopFileWatcher`, `getWatcherConfig`, `saveWatcherConfig`. Polls via `watch_inbox_poll` Tauri command every 30s, auto-summarizes with Ollama, saves to Echo via `runEchoPreservation`, deduplicates via `.processed` suffix. Started in `App.tsx`.
- `mcp-server/server.js` — MCP server (port 3333): 5 tools (`alphonso_run_pipeline`, `alphonso_search_memory`, `alphonso_research`, `alphonso_get_status`, `alphonso_get_receipts`), callable from Claude Desktop/Cursor/Windsurf.
- `bridge/server.js` — Alphonso Bridge (port 4444): proxies MCP tool calls to Ollama `/api/chat` for live responses; `alphonso_get_status` checks Ollama `/api/tags` for real health + model list.

### Other
- `pluginSandboxService.ts`, `pluginRegistryService.ts`
- `recoveryService.ts`, `runtimeLedgerService.ts`
- `screenIntelligenceService.ts`, `voiceService.ts`
- `chatPersistenceService.ts`, `notificationService.ts`
- `coachModeService.ts`, `skillPackService.ts`
- `localMarketplaceService.ts`, `resourceCostService.ts`
- `devPacketService.ts`, `serviceScopes.ts`
- `agentAvatarService.ts`, `agentVisualService.ts`

---

## 4. Test Suite — 546 Files in `src/test/` and `bridge/tests/` (not zero)

The test suite exists and is substantial. Any agent or audit that says "no test suite" or "zero coverage" is wrong.

**Test files (verified 2026-06-30 v2.5.0, all passing):**
- 250 test files, 3590 tests passing (re-verified in isolation 2026-07-02; +7 tests added for onboarding wizard approval-mode/advanced-services steps)
- 94 Rust unit tests total (`cargo test` in src-tauri/): 91 passing, 3 known pre-existing failures unrelated to any recent change — tracked in `todo.md` (`runtime_manager::tests::all_tools_have_unique_ports`, `runtime_manager::tests::autostart_prefs_defaults_ollama_only`, `workspace::tests::absolute_path_detected`). Re-verified in isolation 2026-07-02; count grew from the historical "14" figure as more modules gained test coverage over time — that figure is stale, do not cite it as current.
- 22+ new test files added in Batch 2 (feat/batch2-testing-completeness)
```
a2aProtocolService.test.ts          ← added Batch 2 (20+ tests)
agentProfiles.test.js               ← added Batch 2 (9-agent profile completeness)
approvalService.test.js             ← added Batch 2 (15+ tests)
chatgptService.test.js              ← added Batch 2 (10+ tests)
claudeService.test.js               ← added Batch 2 (10+ tests)
coachModeService.test.js            ← added Batch 2 (10+ tests)
companionIntegration.test.js        ← added Batch 2 (8+ tests)
connectorHealthCheckService.test.js ← added Batch 2 (10+ tests)
connectorImageGenerators.test.js    ← added Batch 2 (12+ tests)
connectorPolling.test.js            ← added Batch 2 (10+ tests)
connectorRateLimiterService.test.js ← added Batch 2 (10+ tests)
externalAgentAdapter.test.js        ← added Batch 2 (21 tests)
memoryMonitorService.test.js        ← added Batch 2 (8+ tests)
moduleRegistryService.test.ts       ← added Batch 2 (15+ tests)
offlineChatService.test.js          ← added Batch 2 (10+ tests)
orchestrationGovernanceService.test.js ← added Batch 2 (12+ tests)
runtimeApiService.test.ts           ← added Batch 2 (12+ tests)
toolRegistryService.test.js         ← added Batch 2 (10+ tests)
verificationChainService.test.js    ← added Batch 2 (15+ tests)
verificationService.test.js         ← added Batch 2 (15+ tests)
voiceOsService.test.js              ← added Batch 2 (10+ tests)
whatsappBrowserConnector.test.js    ← added Batch 2 (10+ tests)
whisperTranscriptionService.test.js ← added Batch 2 (10+ tests)
workflowBuilderService.test.js      ← added Batch 2 (15+ tests)
workflowReceiptService.test.js      ← added Batch 2 (10+ tests)
workflowTelemetryService.test.js    ← added Batch 2 (10+ tests)
accBridgeService.test.js
agentBusService.test.js
agentContractService.test.js
agentOutputStoreService.test.js
agentPairingConstants.test.js
agentPairingExecutionService.test.js
agentSkills.test.js
approvalEnforcement.test.js
appStorage.test.js
appUpdateService.test.js
ApprovalPanel.test.jsx
batchOrchestratorService.test.js
cacheService.test.ts
chatPersistenceService.test.js
chatUtils.test.js
coachInterventionService.test.js
coachSkillService.test.js
coachSoundCueService.test.js
connectorAuditLogService.test.js
connectorGitHubSlack.test.ts
connectorRegistryService.test.js
contentCatalystBridgeService.test.js
contentCatalystService.test.js
devPacketService.test.js
durableMemoryService.test.js
eventsService.test.js
githubConnector.test.js          ← added PR #41 (20 tests)
hectorResearchService.test.js
joseCommandRouterService.test.js
joseExecutionEngineService.test.js
josePipelineE2E.test.js
joseZeroCostRouting.test.js
licenseService.test.ts
localMarketplaceService.test.js
memoryService.test.js
missionRoomService.test.js
miyaComfyWorkflowPresetService.test.js
miyaExportPacketService.test.js
miyaWorkflowTemplates.test.js
notificationService.test.js
notionSyncService.test.js
novaFeedbackService.test.js
ollamaReadinessGuide.test.js
ollamaState.test.js
ollamaUtils.test.js
OllamaPreflightPanel.test.jsx
operatorDashboard.test.jsx
orchestrationQueueService.test.js
orchestrationReceiptService.test.js
parallelExecutionService.test.ts
pluginRegistryService.test.js
AgentActivityLog.test.jsx          ← added Direction 3 (6 tests)
ApprovalModal.test.jsx             ← added Direction 3 (10 tests)
ChatView.test.jsx                  ← added Direction 3 (8 tests)
ConnectorSetupPanel.test.jsx       ← added Direction 3 (7 tests)
MicrophoneStatus.test.jsx          ← added Direction 3 (5 tests)
RightPanel.test.jsx                ← added Direction 3 (8 tests)
VoiceInputButton.test.jsx          ← added Direction 3 (6 tests)
voiceService.test.js               ← added Direction 3 (10 tests)
CompanionPairingPanel.test.jsx      ← added companion Phase 2 (7 tests)
WorkflowBuilderView.test.jsx       ← added Direction 3 (7 tests)
useVoiceInput.test.js              ← added Direction 3 (7 tests)
telegramCompanionService.test.js   ← added Direction 1
pluginSandboxService.test.js
policyEnforcementCaching.test.ts
policyEnforcementService.test.js
productionReadinessService.test.js
recoveryService.test.js
runtimeLedgerService.test.js
runwayService.test.js
selfDevelopmentService.test.js
sentinelGateService.test.js
services/agentContract.test.ts
sessionIntelligenceService.test.js
slackConnector.test.js           ← added PR #41 (16 tests)
mariaAuditService.test.js        ← added Phase 3 (33 tests)
echoMemoryService.test.js        ← added Phase 3 (35 tests)
marcusExecutionService.test.js   ← added Phase 3 (23 tests)
sentinelSecurityService.test.js  ← added Phase 1 (33 tests)
novaAnalysisService.test.js      ← added Phase 1 (36 tests)
connectorAuth.test.js            ← added Phase 1 Stage 3 (coverage push)
agentMetricsService.test.js      ← added Phase 1 Stage 3 (coverage push)
modelSelectionService.test.js    ← added Phase 1 Stage 3 (coverage push)
sourceConfidenceService.test.js
telegramAutoPollService.test.js
telegramConnectorProof.test.js
toolConnectionLiveProof.test.js
toolConnectionService.test.js
toolNotificationDispatcher.test.js
trustModel.test.js
TrustReceiptBrowser.test.jsx
updaterReleaseUtils.test.js
whatsappCloudGateway.test.js
whatsappCloudGatewayRuntime.test.js
whatsappGatewaySecurity.test.js
whatsappWebhookService.test.js
workflowDurabilityHydration.test.js
workflowExecutionService.test.js
workflowGovernanceService.test.js
workflowOperationsRegistryService.test.js
workspaceRootService.test.js
agentAuditService.test.js      ← added Direction 5 (5 tests)
workspaceExportService.test.js ← added Direction 5 (9 tests)
agentBrainService.test.js      ← added Sprint Next-10 T3 (27 tests)
workspaceFileService.test.js   ← added Sprint Next-10 T3 (17 tests)
proactiveAgentService.test.js  ← added Sprint Next-10 T3 (14 tests)
streamingService.test.js       ← added Sprint Next-10 T3 (19 tests)
browserAutomationService.test.js ← added Sprint Next-10 T3 (16 tests)
backupService.test.js          ← added Sprint Next-10 T3 (16 tests)
composioService.test.js        ← added Sprint Next-10 T3 (26 tests)
agentActivityService.test.js   ← added Sprint Next-10 T3 (9 tests)
resourceCostService.test.js    ← added Sprint Next-10 T3 (16 tests)
marcusPublishService.test.js   ← added Sprint Next-10 T3 (22 tests)
gitService.test.js             ← added Sprint Next-50 D3 (12 tests)
skillPackService.test.js       ← added Sprint Next-50 D3 (12 tests)
workspaceIntelligenceService.test.js ← added Sprint Next-50 D3 (11 tests)
screenIntelligenceService.test.js    ← added Sprint Next-50 D3 (11 tests)
scaffoldTemplatesService.test.js     ← added Sprint Next-50 D3 (12 tests)
metaPublishService.test.js           ← added Sprint Next-50 D3 (11 tests)
workspaceArtifactService.test.js     ← added Sprint Next-50 D3 (8 tests)
telegramBrowserConnector.test.js     ← added Sprint Next-50 D3 (19 tests)
tavilyConnector.test.js              ← added JUNE CANDY v2.2.8 (5 tests)
chromaDbService.test.js              ← added JUNE CANDY v2.2.9 (8 tests)
n8nConnector.test.js                 ← added JUNE CANDY v2.3.0 (12 tests)
joseSchedulerService.test.js         ← added JUNE CANDY v2.3.0 (14 tests)
echoFileWatcherService.test.js       ← added JUNE CANDY v2.3.0 (14 tests)
```

**Rust tests (verified 2026-06-15, Session 13):**
- 17 tests in `src-tauri/src/lib.rs`, `src-tauri/src/companion_auth.rs`, `kv_store.rs`, `whatsapp_webhook.rs` — all passing
- `cargo clippy -- -D warnings` clean

**What agents working on testing should focus on:**
- 556 test files / 6,832 tests, all passing (2026-10-24, agent roles Part A); 218 files / 3,167 tests on 2026-07-01
- 357 Rust `#[test]`s (370 with the async `#[tokio::test]` cases), all passing
- Desktop end-to-end: 34 spec files in `e2e-desktop/specs/`, run against the real built app (CI job `Desktop E2E (real Tauri binary)`)
- Coverage expanded significantly across agent adapters, connector services, voice OS, workflow services
- Run `npm run test:coverage` to see current state

---

## 5. CI/CD — Six Workflows

Workflows in `.github/workflows/`: `ci.yml` (below), `release.yml` (tag-triggered build, sign and publish for Windows, macOS and Linux), `gate.yml` (governance gate, a required check), `ios-build.yml` (iOS companion build, tests and TestFlight), `deploy-cloud-voice.yml` (Cloud Voice on AWS) and `security-audit.yml` (weekly npm and cargo audit).

**`.github/workflows/ci.yml`** — runs on push/PR to main (since 2026-10: also desktop E2E, doc-count, Do-Not-Duplicate, CREATE_NO_WINDOW and Tauri version checks):
- `npm ci` → `npm audit --audit-level=high` → lint → `npm test` → `npm run build`
- `rust-quality` job: runs on **ubuntu-latest** (Windows App Control was blocking DLL loading), `cargo clippy -- -D warnings` + `cargo test`
- On main branch only: Tauri desktop build + NSIS artifact upload

**Note:** `verify-app.yml` does NOT exist as a separate workflow file. `npm run verify:app` (lint + test + build) is run as part of `ci.yml`. Do not reference `verify-app.yml`.

**CI status as of 2026-06-22:** `test` job passing green on `main`. `rust-quality` switched to ubuntu-latest to avoid Windows App Control DLL blocking. `npm audit` fixed (vite 8.0.16, vitest 4.1.8 — 0 vulnerabilities).

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
test                     node scripts/run-vitest-programmatic.mjs src bridge
test:watch               node scripts/run-vitest-programmatic.mjs --watch src bridge
lint                     eslint src
typecheck                tsc --noEmit
verify:app               npm run lint && npm run typecheck && npm run test && npm run build
verify:desktop:preflight node scripts/verify-desktop-preflight.mjs
verify:desktop           node scripts/verify-desktop.mjs
updater:keygen           node scripts/setup-updater-signing.mjs --generate-only
updater:setup            node scripts/setup-updater-signing.mjs
updater:verify           node scripts/verify-updater-readiness.mjs
release:updater          node scripts/release-updater.mjs
verify:ollama            node scripts/verify-ollama-runtime.mjs
export:ground-truth      node scripts/export-ground-truth.mjs
verify:docs              node scripts/verify-doc-counts.mjs
verify:dnd-coverage      node scripts/verify-dnd-coverage.mjs
generate:dnd-map         node scripts/generate-dnd-map.mjs
verify:dnd-map           node scripts/generate-dnd-map.mjs --check
verify:no-window-coverage node scripts/verify-no-window-coverage.mjs
verify:npm-audit         node scripts/verify-npm-audit.mjs
verify:tauri-versions    node scripts/verify-tauri-versions.mjs
proof:native-selfdev     node scripts/proof-native-selfdev.mjs
proof:rc0                node scripts/proof-native-selfdev.mjs --rc0
auth:youtube             node scripts/auth-youtube.mjs
auth:meta                node scripts/auth-meta.mjs
auth:outlook             node scripts/auth-outlook.mjs
preview                  node scripts/run-vite-preview.mjs
e2e:server               node scripts/run-e2e-server.mjs
tauri                    tauri
test:file                vitest run
test:coverage            vitest run --coverage src bridge --pool=forks
test:e2e                 playwright test
test:e2e:desktop         wdio run e2e-desktop/wdio.conf.mjs
test:rust                cd src-tauri && cargo test
version:bump             node scripts/bump-version.mjs
prepare                  husky
```

---

## 7. Connector Status — Policy-Gated, Not Raw Stubs

All outbound connector paths run through `policyEnforcementService.ts` before any external call. They are not raw stubs.

| Connector | Frontend path | Rust command | Live status |
|---|---|---|---|
| Telegram | `connectorRegistryService.sendTelegramConnectorMessage` | Yes | Credential-dependent |
| WhatsApp outbound | `connectorRegistryService.sendWhatsAppConnectorMessage` | Yes (+ browser fallback) | Credential-dependent |
| WhatsApp inbound (Cloud webhook) | `browserPollWhatsAppGateway` → Railway queue drain | Browser fallback | Live — requires Railway gateway + 5 credentials in UI |
| YouTube upload | `connectorRegistryService.uploadYouTubeConnectorVideo` | Yes | OAuth-dependent |
| Notion | `connectorRegistryService.sendNotionConnectorEntry` | Yes | Token-dependent |
| ClickUp | `connectorRegistryService.sendClickUpConnectorTask` | Yes | Token-dependent |
| Claude | `connectorRegistryService.sendClaudeConnectorMessage` | Yes | API key-dependent |
| ChatGPT/OpenAI | `connectorRegistryService.sendChatGptConnectorMessage` | Yes | API key-dependent |
| SD WebUI | `connectorRegistryService.generateSdWebUiImage` | Yes | Local service-dependent |
| ComfyUI | `connectorRegistryService.queueComfyUiVideo` | Yes | Local service-dependent |
| Brave Search | `connectorRegistryService` via `hectorResearchService` | No | API key-dependent |
| Tavily | `tavilyConnector.searchTavily` | No | API key-dependent (tier-2 Hector fallback) |
| n8n | `n8nConnector.triggerN8nWebhook` | No | Local service at localhost:5678; Marcus distribution target |
| Meta (Facebook, Instagram) | `metaPublishService.ts`, `publishMetaVideo()`, `publishPost()` | Yes (`meta_publish.rs`, `meta_video.rs`, `meta_media.rs`) | Sign in from Settings; not checked with a real account yet |
| Pexels, Pixabay, Coverr | `stockFootageConnector.ts` | Yes (`content_stock_search`, `content_download_media`) | Free key-dependent |
| Your storage (S3-compatible) | `mediaStorageService.ts` | Yes (`media_storage.rs`) | Optional; used only inside an approved post |
| ElevenLabs | `elevenLabsConnector.ts` | Yes (`elevenlabs.rs`) | Paid; not checked with a real account yet |
| Higgsfield | `higgsfieldConnector.ts` | Yes (`higgsfield.rs`) | Paid; not checked with a real account yet; some request fields unconfirmed |
| Runway | `runwayService.ts`, `runwayClip.ts` | Yes (`runway.rs`) | Paid; not checked live |
| CALL-E | `calleConnector.ts`, `calleMcpConnector.ts` | No | Paid (real phone calls) |

WhatsApp is Meta Cloud API only; Twilio support was removed on 2026-10-21.

All paths: fail-closed on missing credentials, blocked in zero-cost mode unless explicitly overridden, approval-gated for risky external actions.

---

## 8. Real Gaps — What Actually Needs Work

These are confirmed gaps as of 2026-07-02. Any agent working on these areas should check current state before implementing.

### CLOSED — 2026-07-10 (user bug-report pass — full detail in section 11.15)
- [x] **Telegram bot never responded** — wrong Tauri command names (`telegram_get_updates`/`telegram_send_message` vs. real `connector_poll_telegram`/`connector_send_telegram`) silently swallowed by a bare catch; also fixed a `return`-vs-`continue` bug that dropped every message after the first in a poll batch, and a dead `/memory <query>` search branch.
- [x] **CMD windows flashing open/closed** — `CREATE_NO_WINDOW` missing at multiple `Command::new()` sites across `lib.rs`/`plugin_runtime.rs`/`voice_sidecar.rs`/`workspace.rs`/`runtime_manager.rs`'s polled health-check helpers.
- [x] **Sidebar nav items unreachable on short windows** — `Sidebar.tsx` nav list was `shrink-0` inside `overflow-hidden` with no scroll of its own.
- [x] **Coach Mode non-functional** — the Coach webview window had zero Tauri capability grants (`capabilities/default.json` only listed `"main"`); also fixed a silent-failure bug where window creation never confirmed success, at 4 call sites in `CoachContext.jsx`.
- [x] **Voice OS completely non-functional** — `voice/backend/pipeline.py` called a nonexistent LLM function with the wrong signature (crashed every request), never `await`ed the async TTS call, had no VAD gate. Fully rewritten against the pre-existing test contract.
- [x] **Mobile Companion pairing P0** — port 8765 double-booked between the Companion WebSocket server and Voice OS; whichever started first silently won the bind. Voice OS moved to port 8766 (iOS hardcodes 8765 for Companion).
- [x] **WhatsApp had no command handling and no auto-start** — new `whatsappCompanionService.ts` (9 real commands, mirrors Telegram's pattern); also found `WHATSAPP_CLOUD_GATEWAY_DRAIN_URL` had no UI field anywhere, making inbound polling unconfigurable regardless of credentials.
- [x] **`voice/backend/router.py` keyword-routing bugs** — hector's broad keywords stole matches meant for nova/sentinel; miya was missing write/blog/draft keywords entirely.
- [x] **Stale Boardroom docs referencing nonexistent "Hermes"/"Kairo" agents** — correction banners added to `BOARDROOM_ROLES.md`/`BOARDROOM_MODEL_REGISTRY.md`.
- [x] **Auto-update full in-app download+install+relaunch** — handed off as `docs/AUTO_UPDATE_HANDOFF.md` + PR #98; merged in v2.6.0 and confirmed against a real signed release on 2026-09-05 (v2.7.0 → v2.7.1).
- [x] **`companionIntegration.test.js` asserts against fabricated Tauri command names** — closed 2026-10-06: rewritten as a source-reading contract test (§11.29).
- [x] **Mobile Companion pairing not independently re-verified live** — confirmed on a real device on 2026-07-25 (PR #121, after a second fix to the host-name suffix).

### CLOSED — 2026-07-02 (iOS companion pairing fix, post-audit Phase 1)
- [x] **iOS companion pairing — phone could not find/connect to desktop** — Root cause: `companion_discovery.rs`'s `advertise()` passed the bare OS hostname (e.g. `"DESKTOP-ABC123"`) as the mDNS `ServiceInfo::new` host name. The `mdns-sd` crate does NOT append `".local."` automatically — its `normalize_hostname()` only dedupes an already-doubled `".local.local."` suffix (confirmed by reading the crate source at `mdns-sd-0.20.1/src/service_info.rs`). This registered a service whose SRV target was not a valid mDNS host record, so iOS's `NWBrowser`/`NWConnection` (in `MDNSService.swift`) could discover the service instance but fail to resolve it to a connectable address — exactly matching "can't pair with my phone." Fixed by adding `to_mdns_host_name()` (always ends in `.local.`, with 3 new unit tests) and using it in `advertise()`. Also confirmed (by reading `mdns-sd`'s `ServiceDaemon::new_with_port` source) that the `ServiceDaemon`/`CompanionDiscovery` handle can be safely dropped after calling `advertise()` — the crate spawns a detached background thread holding its own sender clone, so the advertisement is NOT torn down when the caller's handle goes out of scope. That is not a bug; no change needed there. Also added a visible error message in `CompanionPairingPanel.tsx` when `companion_start_discovery` fails — previously the button just silently reset to "Start Discovery" with zero user feedback.

### CLOSED — 2026-07-02 (User-reported bug batch, post-audit Phase 1)
- [x] **Connector credentials appeared to not save (Telegram bot token example)** — Root cause was two-fold: (1) `hydrateConnectorCredentialsFromSqlite()` in `connectors/connectorAuth.ts` was dead code, never called at app boot or component mount, so the in-memory credential cache permanently locked itself to `{}` on first read before SQLite ever got consulted; (2) `getStoredCredential()` in `connectors/connectorRegistry.js` and `getConnectorEnvironment()` in `connectors/connectorOutbound.js` both read directly from `localStorage.getItem('alphonso_connector_credentials_v1')` — a key that the KV-primary migration (see CLOSED audit-sprint-26jun entry below) stopped writing to and actively clears. So a credential saved via the UI persisted correctly to SQLite but both verification and the actual Telegram send path read a dead, always-empty key and reported "not configured" / "token is not configured". Fixed: `ConnectorSetupPanel.tsx` now hydrates+re-syncs all 20 credential fields on mount; `useDataHydration.js` hydrates the cache at boot (with `force=true` to guarantee a real SQLite read); both stale localStorage readers now delegate to `getConnectorCredential()`.
- [x] **ComfyUI reported "not running" in Content Catalyst while Runtime Hub showed it running** — `connectorImageGenerators.js`'s `generateComfyUiImage()` talks to ComfyUI via raw browser `fetch()` (not a Tauri command), using `http://127.0.0.1:8188` as the default endpoint. `tauri.conf.json`'s CSP `connect-src` only allowlisted `http://localhost:8188`, not the `127.0.0.1` form — browsers do not treat these as equivalent origins for CSP purposes — so the fetch was silently blocked and `contentCatalystService.js` reported a hardcoded "ComfyUI not running" message regardless of the actual failure. Fixed: added `http://127.0.0.1:8188` to CSP; the toast now surfaces the real underlying error instead of a hardcoded guess.
- [x] **No submit/input affordance on the Projects page** — `ProjectExecutionMode.tsx`'s intake form (Setup tab, via `ProjectIntakePanel`) had zero call-to-action; the only "Generate" submit button lived on a separate Execution tab with no link between them. Added a "Continue to Execution →" button directly under the intake form.
- [x] **Hector research output showed unclickable link-like text, no proper report** — Confirmed real bug: `CitationPanel.tsx`, `SourceBoard.tsx`, and `ResearchReportPanel.tsx` rendered source URLs as plain `<div>`/string text with no anchor or click handler at all. Separately, `ChatView.tsx`'s inline Hector citation chips called bare `window.open()`, which silently no-ops in the Tauri webview (same class of bug CLAUDE.md already documents for `<a target="_blank">`). Fixed: added `openExternalUrl()` to `browserAutomationService.ts` (tries `invoke('open_url', ...)`, falls back to `window.open` only outside Tauri) and wired it into all four surfaces. Note: `HectorResearchDesk.tsx` already had a working Markdown export button (`exportReport()`) — that part of the "proper output format" request was already implemented and did not need a fix.

### CLOSED — 2026-07-02 (Onboarding wizard expansion, post-audit)
- [x] **Approval mode default was invisible to users** — `OnboardingWizard.tsx` now has a dedicated "Approval mode" step (new step 3 of 6) that asks the user explicitly whether Alphonso should ask before high-risk actions, defaulting to ON during onboarding, and writes the choice via `setRuntimePolicySettings({ approvalMode })`. Previously `approvalMode: false` was silently the default with no onboarding-time decision point (flagged as a P0 risk in `ALPHONSOAUDIT25.06.2026.md`'s completion report).
- [x] **Connect step copy overstated connector readiness** — `ConnectChannelStep` copy changed from "pick a channel" to explicitly state every connector stays disabled until credentials are added and skipping is normal — addresses the audit finding that a fresh install has zero working connectors and users were not told this.
- [x] **Optional/external-dependency services were silent** — New "Advanced" onboarding step (`AdvancedServicesStep`, step 5 of 6) surfaces ChromaDB (semantic memory) and Voice OS (Python-dependent) with live status checks (`isChromaHealthy`, `getVoiceServerStatus` + `checkPrerequisites().pythonFound`) instead of failing silently later. No new backend surface added — reuses existing Tauri commands only.
- [x] **Onboarding wizard is now 6 steps**, not 4: Check Ollama → Pick a model → **Approval mode (new)** → Connect → **Advanced services (new)** → Ready. `StepIndicator` and both test files (`src/test/OnboardingWizard.test.jsx`, `src/test/components/OnboardingWizard.test.tsx`) updated accordingly.

### OPEN GAPS (as of v2.5.0-security)
- [x] **Voice OS Python dependency** — closed: `runtime_install_prerequisite` installs Python with winget/brew/apt (since 2026-06-23, noticed 2026-09-02), and since 2026-10-22 `find_python()` picks a suitable 3.10–3.14.
- [x] **CLOSED 2026-07-02 — Plugin execution isolation (corrected from a stale/incorrect prior claim)** — This entry previously claimed "Plugin tools run in the main thread" with "no Web Worker, iframe, or subprocess isolation." That claim was **wrong** and was never re-verified against the actual Rust implementation before being written. In reality: `executePluginToolRun` (`pluginRegistryService.ts`) invokes the Tauri command `execute_plugin_tool` in `plugin_runtime.rs`, which runs plugin tools as **native OS subprocesses** via `Command::new(&tool.program)` — never as in-process JavaScript, and never in the browser/renderer main thread. There is no `eval()`/dynamic `import()` of plugin code anywhere in the JS layer to isolate in the first place; manifests are purely declarative (`tool.id` → fixed `program` + `args`), not executable plugin code. Execution was already gated by: manifest `tools.execute`/`command.execute` permission checks, the shared `allowed_program()` system allowlist, `validate_plugin_extra_args()` (arg count/length/blocked-token checks), and workspace-root-scoped `cwd` resolution. The one real gap — that any plugin could declare `program` as anything already in the *shared, system-wide* allowlist (git/npm/docker/etc.), with no per-plugin scoping — is now closed: manifests may declare `declared_programs: string[]`; when present, `execute_plugin_tool` rejects any `tool.program` not in that plugin's own list, enforced on top of (not instead of) the shared allowlist. `validate_plugin_manifest_disk` now warns when a manifest omits `declared_programs` and errors if a tool's program isn't listed in a declared set. Optional field — fully backward compatible with any manifest written before this change. 4 new Rust unit tests added (`program_allowed_by_manifest_*`) in `plugin_runtime.rs`. **Correction note for future audits: verify claims like "runs in the main thread" against the actual Tauri command implementation before repeating them — this file itself was the source of the stale claim.**
- [x] **Rust cargo check for new crates (arboard, tauri-plugin-dialog, tauri-plugin-opener)** — compiled and passed Clippy in CI on every run since Batch 1.

### CLOSED — Batch 1 Security Sprint (2026-07-02, Bob/IBM)
- [x] **Boot crash: TDZ ReferenceError on launch** — `appConstants.js` imported `VOICE_STATES` from `voiceService.ts` at module scope. Rollup couldn't safely order the module initialization chain, causing a TDZ crash. Fixed by inlining `VOICE_STATES` as a literal const inside `appConstants.js`. Build ✓ Tests ✓ (2,555 passing).
- [x] **C-2: Policy gate — 6 browser-only connectors** — verified already wired (`deepseekConnector`, `perplexityConnector`, `tavilyConnector`, `n8nConnector`, `githubConnector`, `slackConnector` all call `evaluatePolicyGate`).
- [x] **C-3: getComfyUiVideoHistory missing policy gate** — `gateConnectorAction` now called at top of function before circuit breaker.
- [x] **C-4/C-5: Path traversal in transcribe_audio_file + save_image_to_folder** — verified already protected.
- [x] **C-6: OAuth state + token redaction** — verified all 3 scripts already have proper state validation and safe error logging.
- [x] **H-1: Shell interpreters in policy_gate.rs** — verified `cmd.exe`, `powershell.exe`, `pwsh.exe` already removed.
- [x] **H-2: sanitize() in execute_command_verified was a no-op** — `String::replace()` does literal matching; pattern was never applied. Replaced with real line-by-line redaction scanning for api_key/token/secret/password/bearer patterns.
- [x] **H-3/H-4: SSRF — fetch_url_content had no IP blocklist** — `crate::search::is_private_ip()` now called before every fetch. `fetch_research_sources` was already protected against the *initial* URL's host — see §12's table for the redirect-hop gap this claim didn't cover, closed 2026-09-16.
- [x] **H-5/H-6: Symlink escape + watch_inbox_poll** — verified already protected via `canonicalize` + `starts_with`.
- [x] **H-7: Gateway /health leak** — verified already returns `{ ok: true, status: "ok" }` only.
- [x] **M-1: policyDslService dead code** — wired into `gateConnectorAction` as a DSL pre-check layer (deny rules block before main gate evaluation).
- [x] **M-2: gateConnectorAction exception safety** — wrapped in try/catch returning `{ ok: false, blocked: true, reason: 'Policy gate internal error' }`.
- [x] **M-3: Meta OAuth client_secret in URL** — both token exchanges now POST body.
- [x] **M-4: PKCE missing from all 3 OAuth scripts** — `code_verifier`/`code_challenge` (S256) added to YouTube, Meta, Outlook.
- [x] **M-5: open_url used shell (cmd /C start)** — replaced with `tauri-plugin-opener`.
- [x] **M-6: alphonso_bridge_send_packet created new reqwest::Client per call** — now uses managed shared `reqwest::Client` from Tauri state.
- [x] **M-7: Clipboard used PowerShell** — replaced with `arboard` crate.
- [x] **M-8: pick_file/pick_folder used PowerShell WinForms** — replaced with `tauri-plugin-dialog`.
- [x] **L-1: connect-src CSP was localhost:* wildcard** — narrowed to explicit ports (11434/5173/4444/4000/7860/8188/5678/8765 + ws:// variants).
- [x] **L-3: .env value escaping in Meta + Outlook auth scripts** — backslash/newline/hash now escaped.
- [x] **L-4: Queue drain used same token as webhook verification** — `ALPHONSO_DRAIN_TOKEN` env var added with fallback to `VERIFY_TOKEN`.
- [x] **L-5: OAuth callback servers bound to 0.0.0.0** — all 3 scripts now bind to `127.0.0.1`.
- [x] **L-6: policy_gate.rs allowed any args for sensitive programs** — `allowed_args()` function added for git/cargo/docker/npm with subcommand allowlists; wired into `execute_command_verified`.
- [x] **Infrastructure: .nvmrc + .editorconfig missing** — both created.
- [x] **Infrastructure: build.ps1 had stale 0.1.0 version** — updated to 2.4.4.

### CLOSED — v2.4.4 (2026-06-28)
- [x] **iOS companion router — events emitted but no frontend listener** — Already closed: `App.tsx` line 375+ listens for `companion://command`, `companion://abort`, `companion://approve` events and routes them to the execution engine. Swift WebSocketService (MDNSService.swift, WebSocketService.swift) matches Rust JSON-RPC protocol (companion_router.rs). 12 integration tests added in `companionIntegration.test.js`.
- [x] **DeepSeek connector** — `src/services/connectors/deepseekConnector.ts` created: `isDeepSeekConfigured`, `sendDeepSeekMessage`, `searchWithDeepSeek`. Credential UI added to ConnectorSetupPanel. `externalAgentAdapter.js` wired: `runExternalAgentTask('deepseek', task)` calls DeepSeek API live. Hector tier-3 fallback added. 4 tests in `deepseekConnector.test.js`.
- [x] **PWA offline ChatView wiring** — `saveMessageOffline()` from `offlineChatService.ts` now called in ChatView.tsx (import added line 43; called on Ollama stream error at line 687). Messages are saved to IndexedDB when Ollama is unreachable.
- [x] **Runway API key credential UI** — Already closed in prior sprint (ConnectorSetupPanel.tsx line 701). Ground Truth was stale.
- [x] **Plugin sandbox wiring** — Already closed: `PluginContext.jsx` imports and calls `evaluatePluginExecutionPolicy` before every tool run. Ground Truth was stale (incorrect "never imported" claim).
- [x] **agentContractService alphonso allowedActionPrefixes** — `execute_command` and `filesystem_` added to alphonso's allowed prefixes. Fixes test `allows alphonso execute_command`. Alphonso is the operator agent and CAN run commands and filesystem ops.

### CLOSED (historical — do not re-implement)

### SECURITY
- [x] **CSP fixed** — `"security": { "csp": null }` replaced with full production policy string in `tauri.conf.json` (2026-05-31, Agent A). See `docs/SECURITY_CONFIG_REPORT.md`.
- [x] **GPU flags removed** — `--disable-gpu --disable-gpu-compositing --use-angle=swiftshader` deleted; hardware acceleration now active (2026-05-31, Agent A).
- [x] **Window size fixed** — changed to 1280×800, `minWidth: 1024`, `minHeight: 700` (2026-05-31, Agent A)
- [x] **.env.example sanitized** — real phone numbers in `WHATSAPP_ALLOWED_NUMBERS` replaced with placeholders (2026-05-31, Agent A)
- [x] **.gitignore verified** — `.env`, `.env.*`, `.tauri-updater-key`, `.tauri-updater-key.pub` all correctly excluded
- [x] **Git history audit** — DONE (2026-06-01, Session 3). `git log --follow -- .env` returned empty — `.env` was NEVER committed. History is clean. No rotation needed.
- [x] **Tauri capability scoping** — DONE (2026-06-01, Session 3). Findings: `src-tauri/capabilities/default.json` grants only `core:default`, `notification:default`, `global-shortcut:default`. All file-write commands include path-traversal guards. One mild finding: `check_env_vars_presence` accepts arbitrary env var names (probes presence only, no value leakage). No action required; document for awareness.

### RUST BACKEND
- [x] **`lib.rs` modular split completed** — Phases 1+2 extraction done (2026-06-09): `lib.rs` is now ~2,024 lines (grew with Runtime Manager additions), down from original 7,078 (5,623 lines extracted across 16 modules: whatsapp_webhook, kv_store, native_proof, plugin_runtime, policy_gate, audit_log, ollama, memory_store, meta_publish, connector_commands, search, telegram, workspace, youtube, runway, main).
- [x] **lib.rs KV store split** — `src-tauri/src/kv_store.rs` created (2026-06-01, Session 4): `ensure_kv_table`, `kv_set`, `kv_get`, `kv_delete`, `save_settings`, `load_settings` extracted. `kv_delete` added 2026-06-25 (previously missing — `durableRemove` was setting keys to `''` instead of deleting). `open_memory_db` marked `pub(crate)`.
- [x] **lib.rs continued splitting + plugins extracted** — DONE (2026-06-07, OpenCode): `plugin_runtime.rs`, `policy_gate.rs`, `audit_log.rs`, `ollama.rs`, `memory_store.rs`, `meta_publish.rs`, `runway.rs`, `native_proof.rs` now own their own modules. `cargo check` clean, `cargo clippy -- -D warnings` clean, `cargo test` clean (14 Rust unit tests passing).
- [x] **Policy gate expanded** — `policy_gate.rs` whitelist expanded from 8 to 40+ programs: python, pip, cargo, npx, yarn, pnpm, curl, wget, ffmpeg, docker, pwsh, explorer, chrome, copy, xcopy, robocopy, mkdir, del, and more. Still blocks: cmd, rm, shutdown, format, net, reg.
- [x] **New Tauri commands** — `read_workspace_file`, `delete_workspace_file`, `move_workspace_file`, `search_workspace_files`, `list_workspace_directory`, `open_url`, `fetch_url_content`, `read_clipboard`, `write_clipboard`. All with safe path validation (no escape from workspace root).
- [x] **Voice sidecar module** — `src-tauri/src/voice_sidecar.rs` added (2026-06-24, feat/voice-os): `VoiceSidecar(Mutex<Option<Child>>)` state, `voice_start`/`voice_stop`/`voice_status` Tauri commands registered in `lib.rs`. `cargo clippy -- -D warnings` clean. **P1-08 CLOSED 2026-06-27**: `Stdio::null()` → `Stdio::piped()` for stdout+stderr; `BufReader` threads pipe to `log::info!`/`log::warn!` so voice OS subprocess errors are no longer invisible.
- [ ] **lib.rs further splitting** — Optional: Telegram connector block can be extracted further if needed.
- [x] **Rust unit tests added** — 14 tests in `#[cfg(test)] mod tests` covering `allowed_program`, `plugin_blocked_token_present`, `validate_plugin_extra_args`, `trim_trailing_slashes`, `wal_pragma_applies_on_in_memory_db`, `to_hex` — all passing (verified `cargo test` 2026-05-31, Agent D)
- [x] **Shared `reqwest::Client`** — built at startup, registered via `.manage()`, used by `connector_poll_telegram`, `connector_send_telegram`, `connector_send_chatgpt`, `connector_send_claude` (2026-05-31, Agent D).
- [x] **SQLite WAL mode + cache** — `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-65536;` in `open_memory_db()` — 64MB page cache added (2026-06-01, Agent 3)
- [x] **`unwrap()` audit done** — 1 runtime `.unwrap()` found, replaced with safe `match + continue`. Two startup-only `.expect()` calls intentionally kept.
- [x] **Clippy clean** — All 27 pre-existing clippy warnings fixed (2026-06-01, Session 3): `&PathBuf→&Path` in 7 functions across `lib.rs`/`runway.rs`, identity map removed, `.clamp()` used, `sort_by_key`, `#[allow(too_many_arguments)]` on 3 functions. `cargo clippy -- -D warnings` now passes on CI.

### FRONTEND
- [x] **OKLCH design token system** — `src/styles/tokens.css` uses `oklch()` color syntax for all surface, accent, text, and agent color variables. No hex hardcoding. (2026-06-24, feat/ui-ux-overhaul)
- [x] **Framer Motion animation library** — `framer-motion` in `package.json`. `src/lib/motion.ts` exports: `spring`, `tween`, `fadeUp`, `fadeIn`, `slideInRight`, `scaleIn`, `staggerContainer`, `staggerItem`, `messageIn`, `panelIn`. Chat messages wrapped in `AnimatePresence` with `motion.div` per message using `messageIn` variants. (2026-06-24, feat/ui-ux-overhaul)
- [x] **Full token sweep** — `OnboardingWizard`, `AgentStatusStrip`, `AutomationView`, `SettingsView EchoTimeline`, `RightPanel`, `TopBar`, `MissionControlHome` — all `zinc-*/indigo-*` hardcoded classes replaced with CSS var tokens. (2026-06-24, feat/ui-ux-overhaul)
- [x] **Sidebar collapsed tooltips** — collapsed sidebar nav buttons show `title` + `aria-label` for keyboard and hover accessibility. (2026-06-24, feat/ui-ux-overhaul)
- [x] **Voice OS sidecar integration** — `RuntimeManagerView` has `voice-os` entry in `TOOL_META`; `voiceOsService.ts` wires Tauri commands; `useJarvisVoice.ts` hook uses AudioWorklet. (2026-06-24, feat/voice-os)
- [x] **Design system created** — `tailwind.config.js` tokens (since Tailwind v4, 2026-10-12, the tokens live in `src/styles/tokens.css` and `src/index.css`; there is no `tailwind.config.js`) (surface-0..4, accent, success/warning/danger), CSS component classes (.panel, .card, .btn-*, .badge-*, .input, .section-label), Manrope font, ambient glow, custom scrollbar.
- [x] **Font size standardization** — Eliminated all `text-[8px]`/`[9px]` across AgentDock, ChatView, BoardroomPanel, App, TopBar, RightPanel, Badge. Standardized to `text-2xs` (10px) and `text-xs` (12px).
- [x] **Streaming UX** — Real-time token display while 7B model generates, abort button with stop/cancel, token counter, elapsed time ticker, live streaming status indicator with green pulse dot.
- [x] **Keyboard shortcuts** — 12 shortcuts: Ctrl+N new chat, Ctrl+K or / focus input, Esc abort, Ctrl+P search, ? help modal. `useKeyboardShortcuts` hook.
- [x] **Memory search** — `MemorySearch` modal with debounced search, relevance scoring, category/agent filter chips, suggestions, result preview with metadata.
- [x] **Agent metrics** — `AgentMetricsPanel` with 6 stat cards (success rate, validation pass, avg files, avg duration, avg confidence, avg iterations), top commands, error patterns, 7-day trend chart, per-agent breakdown. Wired into SettingsView.
- [x] **Backup/restore** — SettingsView UI with export button (shows size estimate), import button, success/error feedback, auto-reload after restore.
- [x] **Proactive suggestions** — Banner in ChatView with action buttons. 7 checks: failed builds, validation failures, high iterations, low confidence, project staleness, idle time, unused memory. 60s interval, 5min cooldown per type.
- [x] **Composio settings** — API key input, user ID, health check, toolkit list display in SettingsView.
- [x] **Navigation simplified** — 15 sidebar tabs → 8 items in 4 sections. CommandRib reduced to agent indicator + theme switcher + status dot. RightPanel reduced to 4 diagnostics.
- [x] **Rich project summary** — `buildProjectSummary()` in ChatView constructs rich markdown from execution receipts (file explanations, run instructions, next steps).
- [x] **Jose pipeline output consolidated** — All pipeline results (`PipelineResultCard`, `ApprovalPanel`, execution receipts, Nova insight) render inline under the last assistant message. Previously floated in 4 separate panels below the chat. Approval buttons appear directly in the chat thread. (2026-06-24, v2.2.3)
- [x] **Auto-scroll fixed** — Chat now scrolls to new messages by default (`settings.autoScroll !== false`). Previously required opt-in via `settings.autoScroll === true`. (2026-06-24, v2.2.3)
- [x] **Connector verification fixed** — `verifyConnectorEnvironment` now checks UI credential store (localStorage `alphonso_connector_credentials_v1`) in addition to OS env vars. Credentials entered in the settings panel now correctly verify. `saveConnectorApiKey` and `saveTelegramCredentials` auto-verify after save. (2026-06-24, v2.2.3)
- [x] **Connector status live refresh** — `ConnectorStatusDot` and `ConnectorStatusStrip` now poll every 5s and listen for `alphonso-connector-saved` CustomEvent. `ConnectorSetupPanel.refresh()` dispatches this event so status dots update instantly after saving credentials, without requiring a page reload. (2026-06-25, patch1)
- [x] **Null-guard boot fixes** — Three `invoke()` calls that return `null` (not throw) were crashing on boot. Fixed: `RuntimeManagerView` `getAllStatus()` uses `?? []`; `connectorRegistryService` both `check_env_vars_presence` calls use `?? {}`; `coachModeService` `getByLabel()` calls append `.catch(() => null)`. `CoachContext` `handleToggleCoachMode/Top` wrapped in try/catch — no-ops cleanly in web mode. (2026-06-25, patch2)
- [x] **Browse fallbacks in SettingsView** — Output Folder and ComfyUI Dir "Browse" buttons now fall back to hidden `<input type="file" webkitdirectory>` when `invoke('pick_folder')` fails in web mode. Added: `outputFolderPickerRef`, `comfyuiDirPickerRef`, `handleOutputFolderPick`, `handleComfyUIDirPick`. (2026-06-25, patch2)
- [x] **Jarvis voice button in ChatView** — `useJarvisVoice` WebSocket pipeline (AudioWorklet) now wired into `ChatView.tsx`: mic button next to SpeechRecognition button, pulses while listening, shows active agent in tooltip, transcript populates the input field. Requires FastAPI voice server running (`voice/backend/`). (2026-06-25, patch2)
- [x] **Agents tab in RightPanel** — Tab bar is now **System | Audit | Agents**. Agents tab renders `AgentStatusStrip useAutoFeed` — live pulsing agent badges in the right sidebar. (2026-06-25, patch2)
- [x] **SentinelAllowlistPanel compact rewrite** — Fully restyled for sidebar embedding: inline form row, `flex-1 min-w-0` inputs, abbreviated type options (dom/path/ip), list capped at `max-h-48 overflow-y-auto`, CSS variable theming. No longer overflows RightPanel width. (2026-06-25, patch2)
- [x] **pcm-processor.worklet.ts dead class removed** — Dead `class PcmProcessor extends AudioWorkletNode` placeholder existed at module level. `AudioWorkletNode` is browser-only; jsdom test environment does not define it. Adding `useJarvisVoice` to `ChatView.tsx` pulled this file into the test graph and caused 1 test failure. Only `PCM_WORKLET_CODE` string export is needed — placeholder class removed. All 144 test files now pass. (2026-06-25, patch2)
- [x] **`alphonso_settings` → SQLite** — already done (Sessions 3). Both persist to localStorage + SQLite; SQLite hydrated on boot.
- [x] **`alphonso_conversations` → SQLite** — DONE (2026-06-01, Session 4): `App.tsx` now calls `invoke('kv_set', ...)` on every conversations change and hydrates from `kv_get` on boot. localStorage kept as fallback.
- [x] **`alphonso_connector_auth_profiles_v1` → SQLite** — DONE (2026-06-03, Session 5): persisted via `kv_set`/`kv_get` with localStorage fallback.
- [x] **`alphonso_connector_registry_v2` → SQLite** — DONE (2026-06-03, Session 5): persisted via `kv_set`/`kv_get` with localStorage fallback.
- [x] **`alphonso_messages_${id}` → SQLite** — DONE (2026-06-03, Session 6): `chatPersistenceService.ts` persists via `upsert_memory_records`/`list_memory_records`; `ChatView.tsx` also calls `kv_set`/`kv_get` for secondary SQLite path. localStorage kept as fallback. All message keys now dual-write.

### TESTING
- [x] **Coverage threshold** — set to 9% in `vite.config.js` (actual measured: 9.22%). Staged path: write tests to hit 12→20→30. `@vitest/coverage-v8@2.1.9` installed and version-matched.
- [x] **Vitest scoped to src/** — `include: ['src/**/*.{test,spec}.{js,jsx}']` added to prevent Vitest from picking up Playwright `e2e/` files.
- [x] **`cargo test` + `cargo clippy` in CI** — `rust-quality` job passing; `clippy -- -D warnings` now clean.
- [x] **Rust unit tests** — 14 tests added, all passing.
- [x] **Playwright scaffold** — `playwright.config.js` + `e2e/smoke.spec.js` created (2026-06-01). `@playwright/test` added to `package.json`. To run: `npm install --save-dev @playwright/test && npx playwright install chromium && npm run test:e2e`. Requires: dev server on :5173 and Ollama running.
- [x] **Test suite confirmed passing** — **111 test files, 1621+ tests, all passing** (verified 2026-06-21 Sprint Next-10). 14 Rust unit tests also passing. Sprint Next-10 additions (10 new files): `agentBrainService.test.js` (27), `workspaceFileService.test.js` (17), `proactiveAgentService.test.js` (14), `streamingService.test.js` (19), `browserAutomationService.test.js` (16), `backupService.test.js` (16), `composioService.test.js` (26), `agentActivityService.test.js` (9), `resourceCostService.test.js` (16), `marcusPublishService.test.js` (22).

### CONNECTORS & FEATURES
- [x] **Claude + ChatGPT structured error handling** — both connectors now return `{ success, code, error }` with codes `MISSING_KEY`, `TIMEOUT`, `RATE_LIMITED`. 30s timeout, pre-flight key check (2026-05-31, Agent F)
- [x] **Brave Search for Hector** — `search_brave_sources` Rust command exists (line 5965 in lib.rs). Added frontend `searchBrave()` with dual-path: Rust first, then `VITE_BRAVE_SEARCH_API_KEY` frontend fallback (2026-05-31, Agent F)
- [x] **Model switcher UI** — `src/components/ModelSwitcher.tsx` created. Fetches Ollama `/api/tags`, shows dropdown in ChatView header, persists to `alphonso_selected_model_v1`, shows "Ollama offline" pill if unreachable (2026-05-31, Agent F)
- [x] **Connector health dashboard** — `ConnectorHealthPanel.tsx` with status for all 11 connectors (2026-05-31, Agent C)
- [x] **Hector research persistence** — `persistResearchResult(query, results)` added to `hectorResearchService.js`; called at all exit points of `discoverResearchSourcesBrave`; writes via `pushMemoryItem` with `category: 'research_memory'` (2026-06-01, Agent 4)
- [x] **Composio integration** — External tool access for agents via `composioService.ts`. API key config, toolkit discovery, action execution, LLM tool selection, health check. Wired into agent brain — detects external tool intent before code generation.
- [x] **Structured tool use framework** — 16 tools with JSON schemas. `executeWithTools()` loop: LLM chooses tool → execute → feed result back → repeat up to 10 iterations. Tools: read/write/delete/move files, search, list dir, run commands, fetch URL, open URL, clipboard read/write, Composio, memory, git.
- [x] **Browser automation** — `open_url` (opens in default browser), `fetch_url_content` (strips HTML, extracts title, 10KB limit), `read_clipboard`/`write_clipboard` (via PowerShell on Windows).
- [x] **File system operations** — `read_workspace_file`, `delete_workspace_file`, `move_workspace_file`, `search_workspace_files` (grep across workspace, skips node_modules/.git, max 200 results), `list_workspace_directory` (recursive tree builder).
- [x] **Post-write validation** — After generating files, runs build/lint validation. Auto-fixes on failure with error context. Final validation pass. Self-evaluation with confidence score (0-100).
- [x] **Agent performance metrics** — Every brain execution records: success rate, confidence, validation pass rate, iterations, duration. 7-day trend, top commands, error patterns, per-agent breakdown.
- [x] **Proactive agent behavior** — Background watcher monitors idle time, failed builds, high iterations, low confidence, validation failures, stale projects, unused memory. Shows suggestion banner with action buttons.

### INFRASTRUCTURE & DOCS
- [x] **`ARCHITECTURE.md`** — created at project root: full stack, IPC flow, 9-agent roster, orchestration flow, service groups, storage model, security model, deployment (2026-05-31, Agent H)
- [x] **`CLAUDE.md`** — created at project root: session-start guide, all npm + cargo commands, do-not-duplicate table, real gaps, directory tree (2026-05-31, Agent H; updated 2026-06-21)
- [x] **`docs/CONNECTORS.md`** — all 14 connectors documented: env vars, credential steps, test procedure, limitations. Credential UI now available for all connectors in ConnectorSetupPanel.
- [x] **`docs/CHANGELOG.md`** — maintained with all session changes through v2.0.2
- [x] **`docs/IOS_COMPANION_PLAN.md`** — iOS companion architecture: WebSocket server design, JSON-RPC protocol, mDNS discovery, SwiftUI vs React Native tradeoffs, 5-phase implementation roadmap (2026-06-08)
- [x] **`.github/dependabot.yml`** — npm (weekly), Cargo (weekly), GitHub Actions (weekly)
- [x] **Auto-updater fully operational** — ed25519 keypair generated, `TAURI_SIGNING_PRIVATE_KEY` set in GitHub Secrets, pubkey in `tauri.conf.json`, v2.0.2 release triggered via `workflow_dispatch`. Future installs will auto-update.
- [x] **Sentinel Security Monitor runtime** — **CLOSED Phase 1** `src/services/sentinelSecurityService.ts` — deterministic threat scan + Ollama deep analysis, blocks on critical risk/secret detection, full SENTINEL_ALERT_SCHEMA output. *(Superseded 2026-10-25, agent phase 4 (§11.44): the keyword scan and its "blocks" are gone; a blocked scan never held anything. His step is his model's review with exact facts, and a serious finding holds the next steps.)*
- [x] **Nova Opportunity Analyst runtime** — **CLOSED Phase 1** `src/services/novaAnalysisService.ts` — 4-dimension scoring (value/risk/timing/effort), Ollama strategic recommendation, integrates novaFeedbackService for decomposition hints, full NOVA_OPPORTUNITY_SCHEMA output.
- [x] **Maria Governance Auditor runtime** — **CLOSED Phase 3** `src/services/mariaAuditService.ts` — Ollama-powered audit with JSON schema, deterministic fallback via `marcusAuditService.generateRiskScore()`, memory persistence, session event logging, orchestration receipt.
- [x] **Echo Knowledge Historian runtime** — **CLOSED Phase 3** `src/services/echoMemoryService.ts` — Ollama synthesis, retention classification (permanent/standard_180d/ephemeral_7d), category classification, confidence normalization, memory persistence.
- [x] **Marcus Distribution Executor runtime** — **CLOSED Phase 3** `src/services/marcusExecutionService.ts` — Maria governance gate (blocks on critical/high with approvalRequired), GitHub actions (release/issue), Slack messaging, publish dispatch via `marcusPublishService`, audit records.
- [x] **Connector credential UI gap** — **CLOSED Phase 3** All 9 API-key connectors now have credential input panels in `ConnectorSetupPanel.tsx`: GitHub, Slack, Claude/Anthropic, ChatGPT/OpenAI, Notion (2-field), ClickUp (2-field), WhatsApp (3-field), YouTube (4-field), Qwen.
- [x] **claudeService.js credential inconsistency** — **CLOSED Phase 3** Was reading from auth profiles `.claude.apiKey`; now reads via `getConnectorCredential('claude', 'ANTHROPIC_API_KEY')` consistent with all other connectors.
- [x] **chatgptService.js credential inconsistency** — **CLOSED Phase 3** Now reads via `getConnectorCredential('chatgpt', 'OPENAI_API_KEY')`.
- [x] **Telegram companion commands** — **CLOSED Direction 1** `telegramCompanionService.js` now handles `/help` (full command list), `/report` (Ollama status + queue + activity), `/files` (workspace directory listing). `telegramCompanionService.test.js` added (full test suite).
- [x] **Voice STT wiring** — **CLOSED Direction 1** `voiceService.ts` now exports `SpeechRecognitionClass`, `supportsSpeechRecognition()`, `startSpeechRecognition()`. `useVoiceInput.js` hooks STT path with `liveTranscript` state + fallback mic-only path.
- [x] **Nova insight card in ChatView** — **CLOSED Direction 4** After Jose pipeline, fires `computeOpportunityScores` + async `runNovaAnalysis`; score > 65 shows insight card with SVG score ring, recommendation, dismiss button.
- [x] **Screen context injection** — **CLOSED Direction 4** `buildProjectSummary()` accepts `screenContext` param; last 3 `screenObserverLogs` events injected before "Next steps". `App.tsx` passes `screenObserverLogs` to `ChatView`.
- [x] **Maria risk score ring in ApprovalModal** — **CLOSED Direction 4** `ScoreRing` SVG component + `riskToScore()` + `mariaScore` prop override. Color-coded red/amber/green by score.
- [x] **Sentinel dashboard in RightPanel** — **CLOSED Direction 4** `scanForThreats()` on mount + ↺ re-scan button; threat level badge, findings list, last-scanned time; persisted to `alphonso_sentinel_last_scan_v1`.
- [x] **Echo memory timeline in SettingsView** — **CLOSED Direction 4** `EchoTimeline` component groups `listMemoryItems()` by retentionTier (permanent ♾ / standard_180d 📅 / ephemeral_7d ⏳) with expiry countdown.
- [x] **Composio toolkit toggles** — **CLOSED Direction 4** Static badge spans → toggleable 2-col grid cards; enabled set persisted to `alphonso_composio_toolkits_enabled_v1`.
- [x] **Hector RSS failover** — **CLOSED Direction 4** `RSS_FEED_CATALOG` (12 curated feeds), `fetchRssSources()`, `parseRssItems()` (DOMParser-based), `scoreRssFeed()` — wired as last-resort after Brave/DDG.
- [x] **WorkflowBuilderView** — **CLOSED Direction 4** New `src/components/WorkflowBuilderView.tsx` — two-panel builder (sidebar + node editor), 9 node types, up/down reorder, save confirmation. `AutomationView` now has Overview/Builder tab bar.
- [x] **Component test coverage** — **CLOSED Direction 3** 11 new component test files: ApprovalModal, RightPanel, ChatView, ConnectorSetupPanel, WorkflowBuilderView, AgentActivityLog, VoiceInputButton, MicrophoneStatus plus voiceService + useVoiceInput hook tests. Direction 5 added agentAuditService + workspaceExportService tests. 101 test files / 1439+ tests.
- [x] **NotificationCenter** — **CLOSED Direction 1** `src/components/NotificationCenter.tsx` — fixed top-right panel, max 5 notifications visible, colored left borders by type, relative timestamps, dismiss X, "Clear all" link.
- [x] **AgentStatusStrip** — **CLOSED Direction 1** `src/components/AgentStatusStrip.tsx` — horizontal flex strip of agent status badges; pulsing emerald dot for `status==='running'`; compact mode; returns null when empty.
- [x] **UpdaterNotification** — **CLOSED Direction 1** `src/components/UpdaterNotification.tsx` — amber fixed banner, "Update & Restart" + "Later" buttons; wired into App.jsx via `updaterVersion` state.
- [x] **WhatsAppInboxPanel** — **CLOSED Direction 1** `src/components/WhatsAppInboxPanel.tsx` — scrollable received-message list with inline per-message reply state.
- [x] **ModelSwitcher 3-pill + OllamaModelPicker** — **CLOSED Direction 1** `ModelSwitcher.tsx` now exports both: `ModelSwitcher` (3-pill Ollama/Claude/ChatGPT switcher, amber active state) and `OllamaModelPicker` (legacy renamed Ollama model selector). ChatView imports both.
- [x] **cacheService maxEntries cap** — **CLOSED Direction 2** `cacheService.ts` — `CacheOptions.maxEntries` (default 500 via `DEFAULT_MAX_ENTRIES`); while-loop evicts oldest key after every `set()`.
- [x] **crashLogService** — **CLOSED Direction 2** `src/services/crashLogService.ts` — localStorage ring buffer, 100 entries, key `alphonso_crash_log_v1`. Exports: `logError`, `getCrashLog`, `clearCrashLog`.
- [x] **retryDeadLetter** — **CLOSED Direction 2** `orchestrationQueueService.ts` — `retryDeadLetter()` exported: replays all `dead_letter` packets via `replayPacketFromDeadLetter()`, returns retry count.
- [x] **ChatView drag-and-drop + Hector card** — **CLOSED Direction 4** Drag-and-drop onto chat input area; file pills with × remove; `[Attached files: ...]` suffix in messages. Hector briefing card (sky-tinted, dismissible) shows top 3 research sources above input.
- [x] **sentinelSecurityService scheduled scans** — **CLOSED Direction 4** `startScheduledScans(intervalMs, onResult)` exported from sentinelSecurityService; returns cleanup function; RightPanel auto-rescans every 10 min. *(Superseded 2026-10-25, agent phase 4 (§11.44): it scanned an empty string; removed. The scans are one review of the week, as a request.)*
- [x] **novaAnalysisService opportunity history** — **CLOSED Direction 4** `saveOpportunityScore(score, recommendation)` + `getOpportunityHistory()` persist last 30 scores to `alphonso_nova_history_v1`.
- [x] **agentAuditService** — **CLOSED Direction 5** `src/services/agentAuditService.ts` — localStorage ring buffer, 100 entries, key `alphonso_approval_audit_v1`. Exports: `logApprovalEvent`, `getAuditLog`, `clearAuditLog`.
- [x] **workspaceExportService** — **CLOSED Direction 5** `src/services/workspaceExportService.ts` — `exportWorkspace()` (all `alphonso_*` keys as JSON), `importWorkspace(jsonString)` (validates prefix, returns `{ imported, errors }`).
- [x] **WorkspaceExportImportView** — **CLOSED Direction 5** `src/components/WorkspaceExportImportView.tsx` — export via Blob download, import via FileReader, emerald/red status feedback; rendered at bottom of SettingsView.
- [x] **RightPanel Audit tab** — **CLOSED Direction 5** System/Audit tab switcher in RightPanel header; Audit tab shows last 10 approval events with emerald/red outcome badges and relative timestamps.
- [x] **AgentPerformanceView** — **CLOSED Direction 5** `src/components/AgentPerformanceView.tsx` — per-agent success/error counts + avg latency computed from orchestration receipt data; props: `receipts`. (Migrated to .tsx in Sprint Next-10.)
- [x] **Onboarding connector step** — **CLOSED Sprint Next-10 T1** `OnboardingWizard.tsx` now has 4 steps; step 3 = "Connect a channel" with Telegram/WhatsApp/Skip cards; saves preference to `alphonso_onboarding_connector_v1`.
- [x] **CrashLogView** — **CLOSED Sprint Next-10 T5** `src/components/CrashLogView.tsx` — entry list with timestamp/message/context, "Clear" button; wired as "Logs" tab in SettingsView.
- [x] **NovaHistoryChart** — **CLOSED Sprint Next-10 T6** `src/components/NovaHistoryChart.tsx` — SVG sparkline of last 10 opportunity scores (indigo polyline + dots), most-recent recommendation; wired in SettingsView.
- [x] **Gateway Dockerfile** — **CLOSED Sprint Next-10 T7** `gateway/whatsapp-cloud/Dockerfile` multi-stage Node 20 Alpine build + `.dockerignore`.
- [x] **TypeScript migration (5 components)** — **CLOSED Sprint Next-10 T8** AgentStatusStrip, UpdaterNotification, NotificationCenter, AgentPerformanceView, TopBar migrated to `.tsx` with full prop interfaces. SVG type declaration added to `src/types/declarations.d.ts`. Old `.jsx` files removed.
- [x] **SentinelFindingModal** — **CLOSED Sprint Next-10 T9** `src/components/SentinelFindingModal.tsx` — fixed overlay modal, severity badge, pattern + recommendation rows. RightPanel findings now clickable to open modal.
- [x] **durableStore / SQLite dual-write** — **CLOSED Sprint Next-10 T10** `src/lib/durableStore.js` — `durableGet/Set/Remove` writes to localStorage + fire-and-forgets to Tauri `kv_set`; applied to crashLogService, agentAuditService, novaAnalysisService. **Bug fixed 2026-06-25 patch1:** `durableRemove` previously called `kv_set(key, '')` (ghost entries on cold boot). Now correctly calls `kv_delete(key)` which issues `DELETE FROM kv_store WHERE key = ?`.
- [x] **Test coverage push** — **CLOSED Sprint Next-10 T3** 10 new service test files → 111 total / 1621+ tests: agentBrainService, workspaceFileService, proactiveAgentService, streamingService, browserAutomationService, backupService, composioService, agentActivityService, resourceCostService, marcusPublishService.
- [x] **Branch protection on `main`** — **CLOSED 2026-07-06** Classic branch protection enabled on `main` via `gh api`: requires "Test & Build" + "Rust Tests & Clippy" status checks (strict) + 1 approving review, blocks force-push/deletion. Note: a repo-wide ruleset named "Protected-Main" (created 2026-07-03, source unclear — predates this session) already enforced an equivalent policy across all branches, making this classic-API addition partially redundant; both are active now. A separate ruleset "Alphonso" (created 2026-06-17) blocks deletion/force-push on the default branch only. Recommend consolidating to one mechanism in a future pass rather than running both indefinitely.
- [x] **TypeScript migration (continued)** — **CLOSED Sprint Next-50 D5** App, Sidebar, RightPanel, SettingsView, ChatView all migrated to `.tsx`. Total: 10 TSX components. Remaining JSX: 63 components.
- [x] **TypeScript migration COMPLETE** — **CLOSED audit-sprint-26jun 2026-06-27** Final 20 subdirectory .jsx components migrated to .tsx (agents/, hector/, projectExecution/, research/, approval/, audit/, dashboard/ + ConnectorSetupPanel + ModelSwitcher). ui/Badge.jsx re-export shim deleted. Total: 114 .tsx, 0 subdirectory .jsx remain. P1-14 CLOSED.
- [x] **Connector credentials KV-primary** — **CLOSED audit-sprint-26jun 2026-06-27** `connectorAuth.ts` now uses Tauri KV (SQLite) as primary store with in-memory `_credCache`. localStorage cleared after KV hydration. `hydrateConnectorCredentialsFromSqlite()` migrates and removes old localStorage keys. P1-05 CLOSED.
- [x] **Plugin signing keys KV-primary** — **CLOSED audit-sprint-26jun 2026-06-27** `pluginSigningService.ts` stores keypair and trusted signer keys in KV; localStorage cleared after read. `hydrateTrustedSignerKeysFromKv()` migrates on boot. P2-14 CLOSED.

### BATCH 2 Completions (2026-06-29 — feat/batch2-testing-completeness → main)

- [x] **Phase 0 — Test fixes** — durableStore import path in connectorCircuitBreakerService fixed; policyEnforcement cache regression fixed; all tests passing.
- [x] **Phase 1 — Agent profile enrichment** — Echo, Sentinel, Nova profiles expanded from 8 → 25 properties (title, purpose, accentColor, visualIdentity, personality, strengths, limitations, allowedActions, blockedActions, outputTypes, requiresApprovalFor, defaultPrompt, skillPackIds, skillFocus, exampleTasks, hierarchyRank, mascotPath). All 9 agents now have full 25-property format. Agent profile completeness tests added (`agentProfiles.test.js`).
- [x] **Phase 2 — Test coverage expansion** — 22+ new test files covering previously untested services: approvalService, offlineChatService, coachModeService, connectorRateLimiter, voiceOsService, whisperTranscriptionService, externalAgentAdapter, connectorImageGenerators, connectorPolling, whatsappBrowserConnector, chatgptService, claudeService, connectorHealthCheck, memoryMonitor, workflowReceipt, workflowTelemetry, orchestrationGovernance, toolRegistry, verificationService, verificationChain, moduleRegistry, runtimeApi, a2aProtocol, workflowBuilder. Also added `bridge/tests/server.test.js` for MCP bridge.
- [x] **Phase 3 — Voice backend completion** — `voice/backend/vad.py` now implements real WebRTC VAD (`webrtcvad`, aggressiveness=2, 30ms frames at 16kHz) replacing energy heuristic stub. `voice/backend/router.py` implements full 9-agent routing via keyword/regex patterns (jose/hector/miya/maria/marcus/echo/sentinel/nova/alphonso). `requirements.txt` pinned to exact versions. Python tests updated for real VAD and routing.
- [x] **Phase 4 — UX completeness** — Voice sidebar nav entry added to `Sidebar.tsx` (Mic icon). `SmartVoiceButton.tsx` created — consolidates VoiceInputButton + Jarvis mic into one smart button (prefers Voice OS WebSocket, falls back to SpeechRecognition). `useJarvisVoice.ts` dispatches `alphonso:toast` on connection failure with setup guidance. `useAppShellState.js` refactored — sub-hooks extracted to reduce complexity. `e2e/voice.spec.js` + `e2e/visual.spec.js` added (visual regression baselines). `public/sw.js` updated with proper caching strategy (cache-first static, network-first nav, network-only API).
- [x] **Phase 5 — ExternalAgentAdapter wired** — `src/services/agentWorkshop/externalAgentAdapter.js` now wires: OpenAI/ChatGPT (credential-checked via `isConnectorAuthenticated('chatgpt')`), Claude/Anthropic (credential-checked), Ollama (local, no credentials needed), DeepSeek (credential-checked). Gemini documented as `planned_v2.6`. ACC documented as `not_wired` (requires MCP server). Import path fixed: `./connectorRegistryService.ts` → `../connectorRegistryService.ts`.
- [x] **Phase 6 — iOS companion verification** — Swift files in `ios/AlphonsoCompanion/` audited (MDNSService.swift, WebSocketService.swift, PINAuthService.swift). WebSocket + PIN auth flow verified against Rust `companion_router.rs` protocol. Swift ↔ Rust protocol mismatches fixed. `companionIntegration.test.js` added (8+ integration tests). iOS companion status documented as "Rust complete / Swift verified / integration tested".

### v2.2.4 UX Restructure (2026-06-25)
- [x] **Coach mode no visual feedback** — **CLOSED** `CoachContext.jsx` now sets `coachMode=true` and dispatches `alphonso:toast` even when Tauri window open fails. `ToastProvider` now listens to `window.alphonso:toast` CustomEvent for cross-context toasting.
- [x] **ACC Bridge config overload in Content page** — **CLOSED** `ContentCatalystWorkspace.jsx` now shows a 2-line status indicator (connected/not, Sync + Refresh buttons). Full config stays in Settings → Connectors.
- [x] **AgentDock not integrated in RightPanel** — **CLOSED** `AgentDock.tsx` added `embedded` prop (inline, no fixed positioning, no drag). `RightPanel.tsx` passes `agentDockCompanions` from App.tsx.
- [x] **Activity page too thin for standalone** — **CLOSED** `RuntimeManagerView.tsx` now has a Runtimes/Activity tab bar; Activity tab renders `AgentActivityLog`. Sidebar `activity` item removed.
- [x] **Knowledge/Files page too thin for standalone** — **CLOSED** `SettingsView.tsx` has a new "Knowledge" section that renders `FilesView`. Sidebar `files` item removed.
- [x] **Automation operations not interactive** — **CLOSED** `AutomationView.tsx` operations now have Enable/Active toggle via `updateWorkflowOperationStatus`.
- [x] **Telegram commands limited** — **CLOSED** 17 commands total: added `/ping`, `/agents`, `/nova`, `/scan` to `telegramCompanionService.js`.

### Runtime Hub (2026-06-23) — All 9 Gaps Fixed
- [x] **runtime_manager.rs** — full rewrite; all 9 gaps addressed:
  1. `find_python()` — PATH + Windows LOCALAPPDATA common paths + winget fallback
  2. `find_git()` — PATH + `C:\Program Files\Git` + winget fallback
  3. `find_ollama()` — PATH + `%LOCALAPPDATA%\Programs\Ollama\ollama.exe` + C:\Program Files\Ollama
  4. `run_streaming()` async — `tokio::process::Command` + `AsyncBufReadExt` line-by-line; emits `runtime://log` per line
  5. `ensure_venv()` — per-tool venv at `<install_dir>/venv/`; all pip via venv python
  6. AudioCraft args fixed — `demos/musicgen_app.py --server_name 127.0.0.1 --server_port 8765` (no `-m` module)
  7. InvokeAI resolved from `venv/Scripts/invokeai-web.exe` via `resolve_exe()`
  8. `autostart_all(state, app_handle)` — emits `runtime://boot_status` events per tool (starting/started/skipped/failed)
  9. `load_autostart_prefs()` / `save_autostart_prefs_to_disk()` — JSON at `%APPDATA%\Alphonso\runtimes\autostart_prefs.json`; new commands: `runtime_check_prerequisites`, `runtime_install_prerequisite`, `runtime_get_autostart_prefs`, `runtime_save_autostart_pref`
  — `cargo clippy -D warnings` clean
- [x] **runtimeManagerService.js** — 9 exported functions: `getAllStatus`, `listTools`, `installTool`, `startTool`, `stopTool`, `waitForTool`, `checkPrerequisites`, `installPrerequisite`, `getAutostartPrefs`, `saveAutostartPref`, `onLogLine`, `onAnyProgress`
- [x] **RuntimeManagerView.jsx** — prereq warning panel (Gap 1/2), live log via `LiveLogPanel` (Gap 4), autostart toggles per tool (Gap 9), `BootStatusBanner` wired
- [x] **BootStatusBanner.jsx** — fixed bottom-right banner showing real-time boot events from `runtime://boot_status` events (Gap 8)
- [x] **Sidebar Runtimes tab** — `Cpu` icon nav item wired to `runtimes` activeTab
- [x] **runtimeManagerService.test.js** — 22 tests covering all exported functions including 4 new prereq/autostart APIs

### v2.2.5 Fixes & Additions (2026-06-25)
- [x] **Boot crash: hooks violation in RightPanel** — `auditEntries` useMemo moved above `if (collapsed) return` early return.
- [x] **OpenWebUI added** — `runtime_manager.rs` TOOLS array + `RuntimeManagerView.tsx` TOOL_META (LLM category, port 3000, `open-webui serve`). Unit test `tool_def_lookup_works` updated.
- [x] **Brave Search CredentialSection** — `ConnectorSetupPanel.tsx` + `hectorResearchService.js` checks credential store before env vars.
- [x] **Runtime catalog fallback** — `RuntimeManagerView.tsx` shows `catalogFallback` from TOOL_META when `getAllStatus()` returns empty (web/browser mode).
- [x] **ContentCalendar real grid** — monthly grid with prev/next navigation, today highlight, draft dots, minimize/expand toggle.
- [x] **Content workspace full polish** — all 7 workspace components (BrandHeader, GeneratorForm, ContentCalendar, DraftPreview, DraftList, BrandSettings, AnalyticsDashboard, TrendResearch) rewritten to compact CSS-var-based design. Bridge/job-detail panels in ContentCatalystWorkspace also updated.
- [x] **E2E specs added** — `e2e/runtime-tools.spec.js` (ComfyUI + OpenWebUI), `e2e/content-pipeline.spec.js` (5 pipeline tests). Output path set to `D:\AgentDevDev\phonso`.
- [x] **Tauri mock runtime commands** — `e2e/tauri-mock.js` now includes all `runtime_*` commands with mock data.

### Sprint Next-50 Additions (2026-06-22)
- [x] **connectorCircuitBreakerService** — **CLOSED D2T1** localStorage-backed per-connector circuit breaker
- [x] **connectorRateLimiterService** — **CLOSED D2T7** token-bucket rate limiter (in-memory, 60 req/min default)
- [x] **memoryMonitorService** — **CLOSED D2T8** localStorage usage monitor with threshold alerts
- [x] **hectorBookmarkService** — **CLOSED D4T3** Hector research bookmark ring (200 cap)
- [x] **mariaWeeklyReportService** — **CLOSED D4T6** Maria governance weekly report generator
- [x] **SessionHistoryView** — **CLOSED D1T1** orchestration session history with search/filter/expand
- [x] **OrchestratorQueueView** — **CLOSED D2T5** live queue dashboard with 5s auto-refresh
- [x] **DeadLetterQueueView** — **CLOSED D2T6** dead-letter retry panel
- [x] **SentinelAllowlistPanel** — **CLOSED D4T5** allowlist manager with pattern test
- [x] **AgentPairingView** — **CLOSED D4T7** agent collaboration pairing UI
- [x] **ErrorBoundary → crashLogService** — **CLOSED D1T9** both ErrorBoundary + ViewErrorBoundary wire to logError
- [x] **Telegram/WhatsApp retry backoff** — **CLOSED D2T2/T3** 3-attempt exponential backoff (1s/2s/4s) on send
- [x] **AgentStatusStrip live feed** — **CLOSED D4T8** useAutoFeed polling every 3s from agentActivityService
- [x] **vitest ts/tsx include** — **CLOSED D5T6** include pattern covers .ts/.tsx test files
- [x] **ESLint no-console warn** — **CLOSED D5T7** console.log warns (warn/error allowed)
- [x] **Root docker-compose** — **CLOSED D5T10** docker-compose.yml at repo root builds gateway
- [x] **Nova threshold alerts** — **CLOSED D4T1** fires notification when score ≥ threshold (default 75)
- [x] **Echo end-of-session synthesis** — **CLOSED D4T2** synthesizeSession export; App.tsx wires close-requested
- [x] **Jose escalation** — **CLOSED D4T9** tracks consecutive failures, fires warning notification at 2
- [x] **Jose parallel dispatch** — **CLOSED D4T10** Promise.all when multiple agent assignments, parallelDispatch flag
- [x] **ChatView empty states** — **CLOSED D1T3** empty state cards in Chat/Files/MemorySearch
- [x] **ChatView connector badge** — **CLOSED D1T4** Ollama+Telegram status dots in header
- [x] **ChatView direct mode** — **CLOSED D1T7** bypass Jose pipeline, prefix [DIRECT:Agent]
- [x] **ChatView pin messages** — **CLOSED D1T8** pin/unpin per message, alphonso_pinned_messages_v1
- [x] **ChatView degradation banner** — **CLOSED D2T10** amber banner when connectors down but Ollama online
- [x] **Marcus scheduled publishing** — **CLOSED D4T4** schedulePublish, startScheduler, cancelScheduledPublish
- [x] **Husky pre-commit** — **CLOSED D5T8** runs npm run lint before every commit
- [x] **Bundle size CI guard** — **CLOSED D5T9** ci.yml checks no JS chunk > 1MB
- [x] **WhatsApp read status** — **CLOSED D1T10** ✓/✓✓/✓✓(blue)/✗+retry ticks on outbound messages
- [x] **Boot time diagnostics** — **CLOSED D2T9** PerformanceDiagnosticsPanel in SettingsView
- [x] **Light mode CSS tokens** — **CLOSED D1T2** --color-* suite added to .light{} in index.css
- [x] **8 new test files** — **CLOSED D3T3–T10** gitService, skillPack, workspaceIntelligence, screenIntelligence, scaffoldTemplates, metaPublish, workspaceArtifact, telegramBrowserConnector

### PERFORMANCE
- [x] **Lazy loading** — 20+ heavy views lazy-loaded. Main chunk: **288KB** (budget 550KB). Code splitting applied to ChatView, WorkflowPanel, coach components. **Fixed 2026-06-25 patch1:** Three static imports of `runtimeManagerService` in `OllamaOfflineBanner`, `OnboardingWizard`, and `creativeRoutingService` were defeating code splitting (Vite `INEFFECTIVE_DYNAMIC_IMPORT` warning). Converted to dynamic `await import()` at point of use — warning is gone.
- [x] **Image asset compression** — DONE (2026-06-03, Session 6): Logo/banner/icon/thumbnail PNGs converted to WebP (89% reduction, ~9MB saved). `miya-mascot.png` converted to WebP (77.7% reduction). Unused `ChatGPT Image Jun 1` deleted (2.7MB). Total savings: ~12MB.
- [x] **Design system** — Custom Tailwind tokens reduce CSS duplication. Component classes (.panel, .card, .btn-*) eliminate inline style repetition.

### TOOLING
- [x] **eslint-plugin-security** — installed + wired in `eslint.config.js` (2026-05-31, autonomous)
- [x] **eslint-plugin-react-hooks** — already in config pre-session; confirmed present
- [x] **TypeScript** — installed as devDependency; `tsconfig.json` + `tsconfig.node.json` created (2026-05-31, Agent E)
- [x] **`@types/react`, `@types/react-dom`, `@types/node`** — **added 2026-06-25 patch1**. Were missing from devDependencies; `tsc --noEmit` was producing 1,867 errors silently (Vite/OXC build skips type-checking). `typecheck` script added; `verify:app` now runs lint + typecheck + test + build.

### UX/UI
- [x] **Connector health dashboard** — `src/components/ConnectorHealthPanel.tsx` created with `ConnectorHealthPanel` (full panel), `ConnectorStatusStrip` (compact sidebar count), `ConnectorStatusDot` (per-connector dot). Mounted as `connectors` tab in `src/App.tsx` (2026-05-31, Agent C)
- [x] **Sidebar connector status** — `src/components/Sidebar.tsx` updated with "Connectors" nav item + inline `ConnectorStatusStrip` showing live/missing/disabled counts (2026-05-31, Agent C)
- [x] **Approval modal improved** — `src/components/ApprovalModal.tsx` now shows connector badge, colored risk level (high/medium/low), irreversibility warning banner, red confirm button for high-risk actions — backward compatible with existing `label` prop (2026-05-31, Agent C)
- [ ] **No onboarding flow** — first-launch experience does not guide through Ollama check → model download → connector setup
- [x] **Dark/light theme toggle** — `Sidebar.tsx` has Moon/Sun toggle persisting to `alphonso_theme_v1`; applies `.light` class to `<html>`; basic CSS variables in `index.css` (2026-06-01, Agent 1). Full Tailwind token propagation is a future task.
- [ ] **Toast notifications** — `ToastProvider` already mounted in `main.jsx`; inbound message toasts already wired in `App.tsx` — no gap here

### FREEZE FIX & BOOT OPTIMIZATIONS (v1.0.2)
- [x] **WebView2 zombie process fix** — Changed `CloseRequested` handler from hide-to-tray (`api.prevent_close()` + `window.hide()`) to `std::process::exit(0)`. This prevents WebView2 Edge processes from accumulating across sessions, which was causing the freeze.
- [x] **useAppEffects refactor** — Split 858-line `useAppEffects.js` into 6 focused hooks: `useBootEffects`, `usePersistenceEffects`, `useSessionEffects`, `usePollingEffects`, `useDataHydration`, `useNativeProofEffects`.
- [x] **Ollama polling simplified** — Removed broken backoff (attempt counter was never incremented), changed to fixed 30s interval with initial check guard.
- [x] **Autorun dependency trimmed** — Removed `verificationLogs` (200+ entries) from useEffect dependency array.
- [x] **Boot performance monitoring** — Added `performance.mark()` calls in `main.jsx` for boot sequence tracking.
- [x] **WhatsApp polling deferred** — Polling now waits 15s after boot and only runs if connector is authenticated.

---

## 9. What Has Been Built — Do NOT Duplicate

Before writing any new service or feature, verify it does not already exist:

- **Memory unification** → `unifiedMemoryService.js` — 4 systems consolidated, all old services re-export (backward compatible). Do NOT create another memory service.
- **Streaming output** → `streamingService.ts` + ChatView — real-time token display, abort button, token counter, elapsed time. Do NOT recreate streaming.
- **Composio integration** → `composioService.ts` — API key config, toolkit discovery, action execution, wired into agent brain. Do NOT create another external tool connector.
- **Tool use framework** → `toolRegistryService.ts` — 16 tools with JSON schemas, `executeWithTools()` loop. Do NOT add tools outside this registry.
- **Browser automation** → `browserAutomationService.ts` — open URL, fetch content, clipboard read/write. Do NOT create another browser service.
- **File operations** → `workspaceFileService.ts` — read, delete, move, search, list directory. Do NOT create another file service.
- **Post-write validation** → built into `agentBrainService.js` — runs build/lint after generation, auto-fixes, self-evaluation. Do NOT recreate validation.
- **Agent metrics** → `agentMetricsService.ts` + `AgentMetricsPanel.tsx` — success rate, confidence, 7-day trend. Wired into SettingsView. Do NOT create another metrics system.
- **Backup/restore** → `backupService.ts` — export/import all data as JSON. Wired into SettingsView. Do NOT create another backup system.
- **Search** → `searchService.ts` + `MemorySearch.tsx` — memory/project search with relevance scoring, Ctrl+P shortcut. Do NOT create another search.
- **Proactive agent** → `proactiveAgentService.ts` — 7 checks, suggestion banner, 60s interval. Do NOT create another proactive system.
- **Keyboard shortcuts** → `useKeyboardShortcuts.js` — 12 shortcuts, ? help modal. Do NOT create another shortcut system.
- **Policy gate** → `policy_gate.rs` — 40+ programs whitelisted. Do NOT modify without reviewing security implications.
- **iOS companion plan** → `docs/IOS_COMPANION_PLAN.md` — architecture doc, do NOT start building without reviewing.
- **Error boundaries** → `ViewErrorBoundary.tsx` (enhanced with copy error, expandable stack trace), `ErrorBoundary.tsx` (reusable with HOC). All views wrapped.
- **Code splitting** — ChatView, WorkflowPanel, CoachMissionBadge, CoachInterventionCard, CoachHardInterruptOverlay, CoachSkillGrid now lazy-loaded. Main chunk reduced from 519KB to 288KB.
- **Approval modal** → `src/components/ApprovalModal.tsx` — already shows connector, risk level, irreversibility warning
- **Toast notifications** → `ToastProvider` already in `main.jsx`, inbound toasts already wired in `App.tsx`
- **Policy enforcement** → `policyEnforcementService.ts` (do not recreate approval/risk logic)
- **Orchestration queue + receipts** → `orchestrationQueueService.ts` + `orchestrationReceiptService.ts`
- **Dead-letter replay** → already in `orchestrationQueueService.ts`
- **Zero-cost mode** → enforced in Jose routing and `policyEnforcementService.ts`
- **Agent contracts/boundaries** → `agentContractService.ts` (do not add per-agent logic elsewhere)
- **16 workflow operations** → `workflowOperationsRegistryService.ts`
- **Updater release script** → `npm run release:updater` (do not write a new one)
- **Architecture doc** → `ARCHITECTURE.md` at project root
- **Developer guide** → `CLAUDE.md` at project root (read at every session start)
- **Connector docs** → `docs/CONNECTORS.md`
- **Changelog** → `docs/CHANGELOG.md` — add to this, don't create a new one
- **Dependabot** → `.github/dependabot.yml` already exists
- **ModelSwitcher** → `src/components/ModelSwitcher.tsx` — Ollama model dropdown, already mounted in ChatView. Fixed 2026-06-01: now syncs model to parent on mount (was blocking all chat responses)
- **AgentActivityLog** → `src/components/AgentActivityLog.tsx` — activity timeline tab, auto-refreshes every 3s
- **connectorAuditLogService** → `src/services/connectorAuditLogService.ts` — ring buffer for last 100 connector call results
- **Brave Search** → already wired in `hectorResearchService.js` with Rust + VITE_ fallback
- **Auth scripts** → `auth:youtube`, `auth:meta`, `auth:outlook` already exist
- **Desktop preflight/verify** → `verify:desktop:preflight`, `verify:desktop` already exist
- **CI workflows** → `ci.yml`, `release.yml`, and `ios-build.yml` exist and pass green (extend, do not replace). Note: `verify-app.yml` does NOT exist as a file — `npm run verify:app` runs inside `ci.yml`. `ios-build.yml` triggers on `main` pushes to `ios/**` + `workflow_dispatch`; builds, archives, exports IPA, and uploads to TestFlight via `xcrun altool` + App Store Connect API key.
- **WhatsApp webhook Rust module** → `src-tauri/src/whatsapp_webhook.rs` — `verify_whatsapp_cloud_webhook_challenge`, `verify_whatsapp_cloud_webhook_signature`, `normalize_whatsapp_cloud_inbound` + 4 structs live here. Do not re-add to `lib.rs`.
- **WhatsApp browser connector** → `src/services/whatsappBrowserConnector.ts` — `browserSendWhatsApp` (outbound via Meta Graph API v17.0) and `browserPollWhatsAppGateway` (inbound via Railway gateway `/queue/drain`). Reads credentials from `connectorAuth.ts` (`getConnectorCredential`). Do NOT recreate.
- **WhatsApp companion bot commands** → `src/services/whatsappCompanionService.ts` (added 2026-07-10) — `/status`, `/queue`, `/approve`, `/reject`, `/agents`, `/report`, `/ping`, `/help`, `/ask`, real Jose routing for free text. Owner-pairing gated on `WHATSAPP_ALLOWED_NUMBERS` credential (mirrors Telegram's `TELEGRAM_ALLOWED_CHAT_IDS` pattern). Auto-starts at boot in `useBootEffects.js` if `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_CLOUD_GATEWAY_DRAIN_URL` are both set. Do NOT recreate — this did not exist before 2026-07-10; WhatsApp previously had zero command handling.
- **KV store Rust module** → `src-tauri/src/kv_store.rs` — `kv_set`, `kv_get`, `kv_delete`, `save_settings`, `load_settings`, `ensure_kv_table`. `kv_delete` issues `DELETE FROM kv_store WHERE key = ?`. Do not re-add to `lib.rs`.
- **Multi-turn Ollama chat** → `src/lib/ollama.ts` — `generateOllamaChatStream` uses `/api/chat` endpoint with full `messages` array. `ChatView.tsx` captures history snapshot before state updates and passes it. Do not recreate.
- **appendAgentActivity wiring** → wired in `joseExecutionEngineService.ts` (`executeAssignment`) and `connectorRegistryService.ts` (`appendConnectorAudit`). Both import from `../components/AgentActivityLog`.
- **Playwright browser installed** → `@playwright/test@1.60.0` + Chromium installed. `npm run test:e2e` is ready to run (needs dev server + Ollama).
- **Playwright config** → `playwright.config.js` at project root; tests in `e2e/`. Do not create another E2E config.
- **`.npmrc`** — `legacy-peer-deps=true` already set at project root. Do not remove.
- **Companion WebSocket server** → Phase 1 implemented in `src-tauri/src/companion_*.rs` (5 Rust modules: `companion_types`, `companion_auth`, `companion_discovery`, `companion_router`, `companion_server`). Provides PIN auth, JSON-RPC routing, and mDNS discovery. Do not recreate.
- **CompanionPairingPanel** → `src/components/CompanionPairingPanel.tsx` — mobile-pairing Enable/Turn off control (the LAN server is opt-in and off by default as of 2026-09-30), Remote Access PIN display, copy-to-clipboard, QR code, connected clients count, Start Discovery button for mDNS. Integrated in SettingsView. Do NOT create another pairing UI.
- **NotificationCenter** → `src/components/NotificationCenter.tsx` — fixed top-right panel, max 5 visible, colored left borders by type (emerald/amber/red/zinc), relative timestamps, dismiss X, "Clear all". Do NOT create another notification system.
- **AgentStatusStrip** → `src/components/AgentStatusStrip.tsx` — horizontal flex strip of agent badges with pulsing emerald dot for running agents, compact mode, returns null when empty. Do NOT duplicate.
- **UpdaterNotification** → `src/components/UpdaterNotification.tsx` — amber fixed banner, "Update & Restart" + "Later" buttons, wired into App.jsx via `updaterVersion` state. Do NOT recreate updater UI.
- **WhatsAppInboxPanel** → `src/components/WhatsAppInboxPanel.tsx` — scrollable received-message list with inline reply state per message. Reads from `browserPollWhatsAppGateway`. Do NOT duplicate.
- **AgentPerformanceView** → `src/components/AgentPerformanceView.tsx` — per-agent success/error counts + avg latency from orchestration receipt data. Props: `receipts`. Do NOT recreate.
- **WorkspaceExportImportView** → `src/components/WorkspaceExportImportView.tsx` — export all `alphonso_*` localStorage keys as JSON download; import via FileReader with prefix validation. Rendered in SettingsView. Do NOT create another export/import UI.
- **RightPanel tabs** → `src/components/RightPanel.tsx` now has **System | Audit | Agents** tabs (3 tabs). Audit tab shows last 10 approval events from `agentAuditService`. Security section + SentinelAllowlistPanel live inside System tab. Agents tab shows `AgentStatusStrip useAutoFeed`. Do NOT add a separate panel for this.
- **Jarvis voice button in ChatView** → `src/components/ChatView.tsx` wires `useJarvisVoice` — second mic button (WebSocket AudioWorklet pipeline) next to SpeechRecognition button. STT transcript populates input field. Button state reflects listening/thinking/speaking/error. Requires FastAPI voice server. Do NOT add another Jarvis voice UI.
- **Browse fallbacks in SettingsView** → `src/components/SettingsView.tsx` has hidden `<input type="file" webkitdirectory>` refs for Output Folder (`outputFolderPickerRef`) and ComfyUI Dir (`comfyuiDirPickerRef`). Triggered automatically when `invoke('pick_folder')` fails in web mode. Same pattern as Workspace Root Browse (line ~583). Do NOT add another folder picker flow.
- **ChatView drag-drop** → `src/components/ChatView.tsx` — file drag-and-drop onto chat input, file pills, `[Attached files: ...]` suffix appended to messages. Hector briefing card (sky-tinted, dismissible) shows top 3 sources. All state in `ChatView`.
- **crashLogService** → `src/services/crashLogService.ts` — localStorage ring buffer (100 entries, `alphonso_crash_log_v1`). `logError(error, context)`, `getCrashLog()`, `clearCrashLog()`. Do NOT create another error logging system.
- **agentAuditService** → `src/services/agentAuditService.ts` — localStorage ring buffer (100 entries, `alphonso_approval_audit_v1`). `logApprovalEvent(packetId, agent, action, outcome)`, `getAuditLog()`, `clearAuditLog()`. Do NOT duplicate.
- **workspaceExportService** → `src/services/workspaceExportService.ts` — exports/imports all `alphonso_*` localStorage keys as JSON. `exportWorkspace()`, `importWorkspace(jsonString)`. Do NOT create another backup/export service (also see `backupService.ts`).
- **cacheService maxEntries** → `src/services/cacheService.ts` — hard cap of 500 entries (`DEFAULT_MAX_ENTRIES`) with oldest-key eviction on every `set()`. `CacheOptions.maxEntries` controls per-instance limit.
- **retryDeadLetter** → `src/services/orchestrationQueueService.ts` — exported `retryDeadLetter()` replays all `dead_letter` packets via `replayPacketFromDeadLetter()`. Do NOT add duplicate dead-letter retry elsewhere.
- **OllamaModelPicker** → `src/components/ModelSwitcher.tsx` also exports `OllamaModelPicker` (legacy Ollama model selector). The default export `ModelSwitcher` is the 3-pill switcher (Ollama/Claude/ChatGPT). ChatView imports both.
- **sentinelSecurityService scheduled scans** → `src/services/sentinelSecurityService.ts` — `startScheduledScans(intervalMs, onResult)` returns a cleanup function. Do NOT create another scheduled scan loop. *(Removed 2026-10-25, agent phase 4: see `sentinel/sentinelWeekly.ts`.)*
- **novaAnalysisService opportunity history** → `src/services/novaAnalysisService.ts` — `saveOpportunityScore(score, recommendation)` + `getOpportunityHistory()` persist last 30 scores to `alphonso_nova_history_v1`. Do NOT recreate.
- **OnboardingWizard connector step** → `src/components/OnboardingWizard.tsx` — 4-step wizard; step 3 = "Connect a channel" (Telegram/WhatsApp/Skip), saves to `alphonso_onboarding_connector_v1`. Do NOT add another onboarding flow.
- **CrashLogView** → `src/components/CrashLogView.tsx` — entry list with timestamp/message/context keys, "Clear" button; rendered in SettingsView "Logs" tab. Do NOT duplicate.
- **NovaHistoryChart** → `src/components/NovaHistoryChart.tsx` — SVG sparkline (last 10 scores, indigo polyline), latest score + recommendation, wired in SettingsView. Do NOT recreate.
- **SentinelFindingModal** → `src/components/SentinelFindingModal.tsx` — fixed overlay, severity badge (critical/high/medium/low), pattern + recommendation; triggered from RightPanel. Do NOT duplicate.
- **durableStore** → `src/lib/durableStore.js` — `durableGet/Set/Remove` sync to localStorage + async fire-and-forget to Tauri `kv_set`. Use this for any new service that persists data. Do NOT call `localStorage` directly in new services.
- **Gateway Dockerfile** → `gateway/whatsapp-cloud/Dockerfile` — multi-stage Node 20 Alpine. `.dockerignore` alongside. Do NOT create another container config.
- **TypeScript components (.tsx)** → AgentStatusStrip, UpdaterNotification, NotificationCenter, AgentPerformanceView, TopBar are now `.tsx` with typed props. Do NOT recreate as `.jsx`. Remaining large components (ChatView, RightPanel, SettingsView, App, Sidebar) still `.jsx`.
- **SmartVoiceButton** → `src/components/SmartVoiceButton.tsx` — unified voice input button; prefers Voice OS WebSocket (Jarvis), falls back to browser SpeechRecognition. Shows status tooltip. Do NOT add another voice button to ChatView.
- **externalAgentAdapter** → `src/services/agentWorkshop/externalAgentAdapter.js` — routes tasks to OpenAI, Claude, Ollama, DeepSeek. Gemini/ACC planned v2.6. Do NOT add another external provider routing layer.
- **voiceOsService** → `src/services/voiceOsService.ts` — `startVoiceServer`, `stopVoiceServer`, `getVoiceServerStatus`, `getVoiceWebSocketUrl`, `startVoiceWatchdog`, `stopVoiceWatchdog`. Tested in `voiceOsService.test.js`. Do NOT duplicate.
- **WebRTC VAD** → `voice/backend/vad.py` — real webrtcvad implementation (aggressiveness=2, 30ms frames). Do NOT revert to energy heuristic stub.
- **9-agent voice routing** → `voice/backend/router.py` — keyword/regex routing for all 9 agents. Do NOT recreate stub that returns `'alphonso_core'` for everything.
- **E2E voice + visual specs** → `e2e/voice.spec.js` (voice flow tests) and `e2e/visual.spec.js` (visual regression baselines for 5 views). Do NOT delete baseline snapshots.

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

## 11. TODO — Deferred Work (confirmed gaps, not forgotten)

These items were explicitly deferred by the product owner. Do not skip them permanently — revisit when the milestone conditions are met.

### Production-readiness roadmap T11–T20 (tracked 2026-07-15/22; status 2026-10-25: T11–T14, T16, T19 and T20 done; T15 confirmed 2026-09-05 when v2.7.0 updated itself to v2.7.1; T17 partial; T18 in progress)
Full task list, plan, risk, and dependencies for each: `docs/PRODUCTION_READINESS_ASSESSMENT_2026-07-15.md` §6. T1/T2/T3/T4/T5/T6 are done (see §11.21/§11.22); **T10 E2E is verified** as of 2026-07-22 (26 tests / 7 specs, no retries) using the production-preview server in `npm run e2e:server`. The active, evidence-backed queue is `docs/TRUTH_FIRST_EXECUTION_PLAN.md`; do not re-derive scope from memory. Short list for quick reference:
- **T11** — harden KV/localStorage persistence with a real schema + migrations
- **T12** — replace the fail-open connector policy DSL default with risk-tiered rules
- **T13** — move credentials to OS-level secret storage (depends on T5's token format)
- **T14** — split `lib.rs` (~2,024 lines) + lint-enforce `CREATE_NO_WINDOW`
- **T15** — live-verify the in-app auto-updater against a real signed release
- **T16** — live-verify iOS companion pairing on a real device (depends on T6's lockout)
- **T17** — add observability to the cloud sidecars (gateways, MCP server, bridge)
- **T18** — reduce the Supabase service-role-key blast radius in the voice backend
- **T19** — auto-generate the "Do Not Duplicate" map to close doc-drift at the source
- **T20** — add a token/cost budget to multi-agent fan-out + surface hidden features

### Gap 5 — macOS Support (closed: an Apple Silicon DMG has shipped since v2.8.0, unsigned by Apple; Apple Developer ID signing is still open, see `docs/MACOS_SIGNING.md`)
**Decision (2026-06-20):** Focus on Windows first. Once the app reaches maturity on Windows, backport macOS support in a single focused effort.
**What will be needed when the time comes:**
- Tauri `[bundle]` targets: add `"dmg"`, `"app"` to `src-tauri/tauri.conf.json`
- CI: add `macos-latest` runner to `ci.yml` and `release.yml`
- Code-sign with Apple Developer certificate in GitHub Secrets
- Test native IPC (Ollama, SQLite, kv_store, connector sockets) on Darwin
- Replace any Windows-path assumptions in `workspace.rs` (path separators, home dir)
- Test installer flow on macOS (DMG notarization)

### UI / UX Improvements (closed: the onboarding flow is the Smart Installer since v2.8.0, the Ollama offline banner and Composio setup exist, and component coverage is far above 15%)
The following improvements were noted but deferred to a dedicated UI sprint:
- **Onboarding flow** — first-launch experience: Ollama offline detection → model pull prompt → connector setup wizard
- **Ollama offline state** — currently fails silently or shows cryptic errors; needs a visible banner/prompt when Ollama is unreachable
- **Composio onboarding** — user must know to enter API key at composio.dev and then in Settings → Composio; no in-app guide
- **WhatsApp gateway deploy guide** — in-app instructions for Railway deployment of `gateway/whatsapp-cloud/`
- **Component test coverage** — currently ~6%; target 15% minimum for UI components

### Railway Deployment (gateway live — no ALPHONSO_FORWARD_URL needed)
**Two Railway configs exist:**
1. **Root `railway.json`** → deploys React frontend as static web app (no Rust/Ollama)
2. **`gateway/whatsapp-cloud/railway.json`** → deploys WhatsApp Cloud webhook gateway (24/7 microservice)

**The gateway is fully code-complete and deployed.** Required env vars in Railway dashboard:
- `WHATSAPP_VERIFY_TOKEN` — your webhook verify token (same value as in Alphonso connector UI)
- `WHATSAPP_APP_SECRET` — from Meta App Dashboard → App Settings
- `WHATSAPP_ALLOWLIST` or `WHATSAPP_ALLOWED_NUMBERS` — comma-separated allowed phone numbers (digits only, no `+`)
- `ALPHONSO_FORWARD_URL` — **optional**; gateway has a built-in queue so this is no longer required

**Alphonso credentials to set in Settings → Connectors → WhatsApp:**
- `WHATSAPP_ACCESS_TOKEN` — from Meta App Dashboard
- `WHATSAPP_PHONE_NUMBER_ID` — WhatsApp Business phone number ID
- `WHATSAPP_VERIFY_TOKEN` — same token as set in Railway
- `WHATSAPP_CLOUD_GATEWAY_DRAIN_URL` — `https://<your-railway-url>/queue/drain`
- `WHATSAPP_ALLOWED_NUMBERS` — comma-separated allowed sender numbers (digits only)

After Railway deploy: point Meta webhook URL to `https://<your-railway-url>/webhook`.

---

## 11.5 ALPHONSOTOTHEMOON Sprint 1 (2026-07-02)

Full context and rationale live in `ALPHONSOTOTHEMOON.md` at repo root — this is
the ground-truth summary of what actually changed.

- **Licensing**: `LICENSE` added — SHALAUDE License v1.0 (all-rights-reserved,
  source-visible, not OSI-approved). The repo previously had no LICENSE file at
  all; README's prior "BSL 1.1" claim did not match reality (no BSL file ever
  existed in the repo) and has been corrected to reference SHALAUDE.
- **Skill pack ↔ agent contract enforcement**: `validateSkillPackAgainstContract()`
  in `src/services/agentContractService.ts` cross-checks a skill pack's declared
  `permissions` against its owning agent's `AGENT_EXECUTION_CONTRACTS` entry.
  Wired into `installSkillPack`/`setSkillPackEnabled` in `skillPackService.ts` —
  a pack whose permissions exceed its agent's contract is rejected (install) or
  refused (enable), with an `install_blocked`/`enable_blocked` audit entry.
- **Default skill packs for all 9 agents**: previously only Jose, Hector, Miya,
  and Maria (×2) had an `agent_skill` category default pack. Added:
  `pack.alphonso-runtime-operations`, `pack.marcus-distribution-execution`,
  `pack.echo-memory-synthesis`, `pack.sentinel-vuln-scan`,
  `pack.nova-opportunity-analysis`.
- **Alphonso skill pack expansion (2026-07-17)**: Alphonso now has 18 skill packs
  (2 existing + 16 new). New packs: `pack.coding.full-stack`, `pack.coding.tdd`,
  `pack.alphonso-typescript-mastery`, `pack.alphonso-rust-operations`,
  `pack.alphonso-react-patterns`, `pack.alphonso-python-voice`,
  `pack.alphonso-code-review`, `pack.alphonso-build-verification`,
  `pack.alphonso-refactoring`, `pack.debugging.root-cause`,
  `pack.alphonso-runtime-diagnostics`, `pack.alphonso-security-audit`,
  `pack.github.integration`, `pack.alphonso-performance-optimization`,
  `pack.alphonso-api-integration`, `pack.alphonso-error-handling`. All packs
  include structured workflow guidance, example tasks, and per-pack scope
  overrides. See `docs/ALPHONSO_SKILLS.md` for full documentation.
- **Jose skill pack expansion (2026-07-17)**: Jose now has 22 skill packs
  (6 existing + 16 new). New packs: `pack.jose-workflow-design`,
  `pack.jose-strategic-planning`, `pack.jose-dependency-mapping`,
  `pack.jose-agent-coordination`, `pack.jose-parallel-orchestration`,
  `pack.jose-task-prioritization`, `pack.jose-risk-assessment`,
  `pack.jose-quality-gates`, `pack.jose-compliance-checks`,
  `pack.jose-progress-tracking`, `pack.jose-status-reporting`,
  `pack.jose-performance-metrics`, `pack.jose-workflow-optimization`,
  `pack.jose-bottleneck-detection`, `pack.jose-continuous-improvement`,
  `pack.jose-stakeholder-communication`. All packs include structured
  workflow guidance, example tasks, and per-pack scope overrides. See
  `docs/JOSE_SKILLS.md` for full documentation.
- **Pipeline loop-guard / execution budget**: `runJoseCommandExecutionPipeline`
  in `joseExecutionEngineService.ts` now hard-stops at `PIPELINE_MAX_ASSIGNMENTS`
  (50) or `PIPELINE_MAX_DURATION_MS` (5 minutes), whichever comes first. On
  breach it returns `{ ok: false, reason: 'budget_exceeded' }` and appends a
  `pipeline_budget_exceeded` orchestration receipt — this did not exist before;
  a malformed command graph or stuck agent could previously iterate unbounded.
- Deferred to Sprint 2 (tracked in `ALPHONSOTOTHEMOON.md`, not dropped): resumable-
  execution checkpoints on top of the existing dead-letter queue, a Discord
  connector, a generic inbound webhook connector, subprocess/sandboxed tool
  execution, MCP as a first-class runtime capability (not just a side Express
  server), and scheduler heartbeat/liveness supervision.

## 11.6 ALPHONSOTOTHEMOON Sprint 2 (2026-07-02)

Full context lives in `ALPHONSOTOTHEMOON.md` at repo root.

- **Crash-recovery checkpoint**: `recoverInterruptedExecutions()` added to
  `src/services/orchestrationQueueService.ts`. Scans all agent packets still
  in `queued`/`executing` state at app boot and marks each interrupted via
  `markPacketInterrupted()` — a function that already existed in this file
  (failed + retryable, records a transition) but was never called from
  anywhere before this sprint. Wired as a one-shot boot `useEffect` in
  `src/App.tsx`, right after the runtime-manager autostart block, surfacing
  a warning notification when work is recovered.
- **Discord connector**: `src/services/connectors/discordConnector.ts` —
  Discord REST API v10, Bot token auth, policy-gated identically to the
  existing `slackConnector.ts` pattern. Functions: `sendMessage`,
  `editMessage`, `deleteMessage`, `listGuildChannels`, `getChannelHistory`,
  `addReaction`, `sendWebhookMessage`. Registered in `connectorRegistry.js`
  as `discord`; credential UI (Bot Token, live-verified against
  `GET /users/@me`) in `ConnectorSetupPanel.tsx`; 17 tests.
- **Generic inbound webhook connector**: two halves —
  1. `gateway/generic-webhook/` — a standalone, Railway-deployable Node HTTP
     server mirroring `gateway/whatsapp-cloud/`'s proven queue-drain shape,
     generalized: `POST /webhook/:sourceId` (any external service, shared
     secret required) enqueues an event; `GET /queue/drain` (separate
     drain token) lets Alphonso pull queued events. No local port is opened
     inside the Tauri app itself — this follows the same reasoning as the
     WhatsApp Cloud gateway: a desktop app has no stable public IP, so the
     receiving side has to be an externally-deployed service, not a listener
     inside the app.
  2. `src/services/genericWebhookService.ts` — `pollGenericWebhookGateway()`
     (one-shot drain, appends an `orchestrationReceiptService` receipt per
     event for auditability), `startGenericWebhookPolling()` /
     `stopGenericWebhookPolling()` (30s interval, no-ops until a drain URL
     is configured). Registered in `connectorRegistry.js` as
     `generic_webhook`; credential UI (drain URL + token) in
     `ConnectorSetupPanel.tsx`; boot poller wired in `App.tsx`; 13 tests.
- Connector count: 14 → 16 (`DEFAULT_CONNECTORS.length` in
  `connectorRegistry.js`, +Discord +Generic Webhook). The existing
  `connectorGitHubSlack.test.ts` assertion of `toBe(14)` was accurate before
  this sprint and was updated to `toBe(16)` with coverage added for both
  new entries.
- Found, documented, and left open (pre-existing, independent of this
  sprint — reproduced identically with Sprint 2 changes stashed out):
  `src/test/ConnectorSetupPanel.test.jsx` fails 7/7 because its
  `vi.mock('../services/connectors/connectorAuth', ...)` factory omits
  `hydrateConnectorCredentialsFromSqlite`, so the component's real hydrate
  `useEffect` throws on mount inside the test. See `CLAUDE.md` Real Gaps.

## 11.7 Auto-updater fix + connector registry completeness (2026-07-02)

- **Auto-updater was never functional despite being fully coded.**
  `src/services/appUpdateService.ts` (`checkAppUpdate()`) and
  `src/components/UpdaterNotification.tsx` both already existed and
  `appUpdateService` had 19 passing tests — but `App.tsx` never called
  `checkAppUpdate()`, so `updaterVersion` state stayed `null` forever and
  the banner could never render. Separately, the banner's `onUpdate` prop
  was hardcoded to `() => {}}` — a no-op even if the banner had shown.
  Fixed: added a Tauri-only boot `useEffect` calling `checkAppUpdate()`
  with the real endpoint/pubkey from `tauri.conf.json`, wired the button to
  `invoke('open_url', ...)` opening the release download. Verified
  separately that no GitHub release newer than v2.4.4 existed (checked via
  `gh release list`) and that the live `latest.json` at the configured
  endpoint was well-formed — so the user-facing symptom was compounded by
  simply not having tagged a release in ~6 days of active development, not
  purely a code defect.
  **Not done**: full in-app download+install+relaunch. Needs
  `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process` as npm
  dependencies — the Rust side (`tauri-plugin-updater`) is already
  registered and ready in `lib.rs`, only the JS side is missing. Tracked in
  `ALPHONSOTOTHEMOON.md` as a follow-up, not silently dropped.
- **Connector registry completeness.** `connectorRegistry.js`'s
  `DEFAULT_CONNECTORS` was missing Ollama, Brave Search, Perplexity,
  Tavily, DeepSeek, and n8n — each had working credential UI in
  `ConnectorSetupPanel.tsx` and a real service implementation, just no
  central registry entry. Traced via git log: each was added in a separate
  earlier feature push (DeepSeek in a v2.4.4 gap-closure sprint, n8n in
  its own dedicated commit) that wired credential UI directly to one
  consumer without circling back to register centrally — genuine drift
  across several sprints, not a deliberate design choice. Added all 6;
  connector count 16 → 22.
- **Coach Mode investigated, confirmed live.** User reported it "feels
  forgotten." Traced `handleToggleCoachMode` through `App.tsx`: it's passed
  as `onOpenCoach` into the main `Sidebar` component and also exposed via
  `OperatorDashboard`'s coach toggle props. Not dead code. Whether it's
  *prominent* enough in the actual rendered UI is unverified — no
  browser-automation tool was available in this session to click through
  the live app, so this is a source-level confirmation of wiring, not a
  visual UX verdict. Seeded as a "feature discoverability audit" in
  `ALPHONSOTOTHEMOON.md` Sprint 3.

## 11.8 ALPHONSOTOTHEMOON Sprint 3: agent skill-library depth (2026-07-02)

Full context lives in `ALPHONSOTOTHEMOON.md` at repo root. Scoped to the 3
highest-traffic agents per the roadmap's own v1 recommendation — not a
big-bang rebuild of all 9 agents' skill systems.

- **Miya** (`src/services/skillPackService.ts`): kept
  `pack.miya-runway-video-generation`; added `pack.miya-creative-image`,
  `pack.miya-ui-ux-design`, `pack.miya-brand-identity`,
  `pack.miya-motion-graphics`. `miyaProfile.js`'s `skillPackIds`/`skillFocus`
  updated to match.
- **Hector**: kept `pack.hector-professional-marketing`; added
  `pack.hector-market-research`, `pack.hector-competitive-analysis`,
  `pack.hector-source-verification`, `pack.hector-rss-monitoring` — the
  RSS pack deliberately describes the RSS-failover capability
  `hectorResearchService.js` already ships (`RSS_FEED_CATALOG`,
  `fetchRssSources`), not new scope. `hectorProfile.js` updated.
- **Jose**: kept `pack.jose-professional-orchestration`; added
  `pack.jose-task-routing`, `pack.jose-approval-gating`,
  `pack.jose-cross-agent-synthesis`, `pack.jose-pipeline-governance` — the
  governance pack describes the Sprint 1 `PIPELINE_MAX_ASSIGNMENTS`/
  `PIPELINE_MAX_DURATION_MS` loop-guard already shipped in
  `runJoseCommandExecutionPipeline`. `joseProfile.js` updated.
- **Per-skill contract scoping**: `validateSkillPackAgainstContract()` in
  `src/services/agentContractService.ts` gained an optional third `packId`
  parameter and a new `AGENT_SKILL_PACK_SCOPE_OVERRIDES` map. A pack with an
  override entry is checked against that pack's own narrower permission
  list instead of its owning agent's full agent-wide list — e.g. Miya's
  `pack.miya-brand-identity` cannot carry `video.draft` even though Miya's
  agent-wide contract allows it (for her separate video pack). Packs with
  no override entry, or callers that omit `packId`, get the exact original
  agent-wide behavior — fully backward compatible.
  `skillPackService.ts`'s `installSkillPack`/`setSkillPackEnabled` updated
  to pass `manifest.id`/`target.id` through so the narrower check actually
  applies at install/enable time.
- **UI**: `src/components/EcosystemHub.tsx`'s Skills tab now groups packs by
  `ownerAgent` (falling back to "Agent Workflows" for `category:
  'agent_workflow'` packs, "General" otherwise) instead of one flat list —
  makes each agent's taxonomy visible without a new panel.
- `SKILL_WORKFLOW_GUIDANCE` extended with real guidance/steps for all 12 new
  packs so `loadAgentSkillGuidance()` returns actual content for them.
- Tests: `agentSkills.test.js` updated for new `skillFocus` strings + a
  dedicated taxonomy-coverage test; `agentContractService.test.js` gained 6
  tests covering the override behavior (narrower-than-agent-wide
  enforcement, fallback when no override exists, cross-agent coverage).
  99/99 targeted tests passing, `npx tsc --noEmit` clean, ESLint clean on
  every touched file.
- Explicitly deferred (per the roadmap's own scope note, not dropped):
  taxonomy depth for the other 6 agents (since shipped — see §11.31 correction;
  they no longer have one pack each), module-system convergence
  between `modules/` TOML manifests and `skillPackService.ts` packs, and a
  full skill-marketplace model.

## 11.9 ALPHONSOTOTHEMOON Sprint 3: discoverability audit (2026-07-02, v2.5.5)

The other half of Sprint 3 (skill-library depth was closed in §11.8). This
half required driving the actual running app rather than reading source —
done via `npm run dev` + headless Chromium (Playwright), since no project
skill for running this app existed yet.

- **Critical bug found and fixed: Boardroom Sessions crashed the entire
  app.** `App.tsx` line 47 was `const BoardroomView = lazy(() =>
  import('./components/BoardroomView'));` — missing the `.then((mod) => ({
  default: mod.BoardroomView }))` mapping that every other one of the 25
  other lazy-loaded views in that file uses. `BoardroomView.tsx` only has a
  named export (`export function BoardroomView()`), no default export. When
  a user clicked Sidebar → Boardroom → "Boardroom Sessions" subtab, React's
  lazy loader resolved `module.default === undefined` as the component
  type, and React's own dev-mode warning path crashed with an uncaught
  `TypeError: Cannot convert object to primitive value`, replacing the
  entire app with a full-screen "BOOT ERROR" overlay. Root cause confirmed
  by direct comparison against every other lazy import in the file (24 of
  25 correctly used the `.then(...)` mapping; `RuntimeManagerView` is the
  one exception, but that's fine because its component file uses `export
  default function`, so it has an actual default export to resolve).
  Fixed: added the missing `.then(...)` mapping. Verified live post-fix —
  renders correctly, zero console errors.
- **Why the test suite never caught this**: `BoardroomView` had zero test
  coverage before this sprint, and there is no App.tsx-level render smoke
  test in the suite. Added two regression tests: `src/test/boardroomView.test.jsx`
  (renders without throwing + asserts the module has no default export, so a
  future contributor doesn't "fix" the type error by adding a default export
  without checking the `App.tsx` side of the contract) and
  `src/test/appLazyImports.test.js` (a static guard that parses every
  `lazy(() => import(...))` call in `App.tsx` — 26 total — and verifies the
  target module's actual export shape matches what each call expects; this
  is what confirms BoardroomView was the *only* mismatch, not an assumption).
- **Discoverability findings, all verified live** (this was the actual
  scope of the audit — is a real, wired feature actually reachable):
  - **Coach Mode**: real and functional. Clicking the sidebar footer "Coach"
    button toggles `coachMode` state correctly (confirmed via the Dashboard
    stat tile flipping "Off" → "On"). Not a bug. It sits in the sidebar
    footer with the exact same visual weight as Settings and the light/dark
    toggle — no badge, no distinct color, no explanation — which is the most
    likely reason a user reported it "feels forgotten." No UI change made
    this pass (a visual-prominence decision, logged as a follow-up, not
    silently fixed).
  - **Boardroom / Mission Room**: reachable via the sidebar "Boardroom" nav
    item (opens to a "Mission Room" / "Boardroom Sessions" sub-tab pair).
    Minor naming mismatch: the nav item is labeled "Boardroom" but its
    default sub-tab is "Mission Room," not "Boardroom Sessions" — cosmetic,
    not functionally confusing once opened.
  - **Agent Pairing** (`AgentPairingView`): reachable only via sidebar "All
    Agents" → "Pairings" tab inside `EcosystemHub`'s 7-tab bar (Overview /
    Queue / Skills / Workflows / Pairings / Workshop / Advanced) — 2 clicks
    deep behind a generic tab label that gives no hint agent-to-agent
    pairing lives there. Confirmed rendering correctly (9-agent pairing grid
    visible).
  - **Ecosystem Maturity panels + Self-Development panel**: reachable only
    via "All Agents" → "Advanced" tab, and only visible after scrolling
    past the Operator Modes / Trust-Verification-Layer sections that also
    render there. Confirmed rendering correctly (Live Ecosystem Map
    Foundation with all 9 agent tiles visible on scroll).
  - **Operator Dashboard — the clearest "buried" case**: has **no sidebar
    nav entry at all**. The only path to it is a "Operator" quick-launch
    card on the Dashboard home tab (`MissionControlHome.tsx` line 251:
    `{ title: 'Operator', detail: 'Settings, Coach, and memory', tab:
    'operator', ... }`). When Operator Mode is off (the default for a fresh
    install), opening this tab shows nothing but a bare "Operator Mode is
    Off" card with an "Enable" button — no preview of telemetry, proofs,
    memory dashboards, or supervised runtime tools that exist behind it.
    A first-time user has zero visual reason to enable it.
- **Explicitly not changed this pass** (UI-placement/prominence is a design
  decision, not a bug — flagged for a follow-up, not assumed): whether
  Operator Dashboard should get a sidebar nav entry, whether Coach Mode
  should get a status badge, whether the Pairings/Advanced tabs should be
  renamed or promoted. These are recommendations for a future UX pass, not
  done silently in this audit.
- **Environment note, not a code defect**: while starting `npm run dev` for
  this audit, discovered an unrelated third-party dev server ("MINT — AI
  Content Workstation") already bound to the wildcard address on port 5173
  on this dev machine. Vite correctly fell back to binding
  `127.0.0.1:5173` explicitly and logged a warning; the audit had to target
  `http://127.0.0.1:5173` rather than `http://localhost:5173` to reach the
  right server. Not an Alphonso bug — logged here only so a future session
  doesn't waste time rediscovering it.

## 11.10 ALPHONSOTOTHEMOON Sprint 4: security hardening Batch 2 (2026-07-02, v2.5.6)

Full context in `ALPHONSOTOTHEMOON.md`. Audited already-merged Sprint 2 code
directly (grep + read), not via the diff-scoped `security-review` skill,
since there was no pending PR to review.

- **Real authentication-bypass bug found and fixed**: `telegramCompanionService.js`'s
  `/start` owner registration was first-come-first-served — whichever chat
  messaged the bot first (while no owner was yet registered) became the
  *permanent* owner with full command authority to route arbitrary text to
  Jose. Telegram bot usernames are publicly searchable (unlike bot tokens),
  so an attacker who found the bot before its legitimate owner could win
  this race. Fixed by gating first-time registration on
  `TELEGRAM_ALLOWED_CHAT_IDS` — a credential field that already existed in
  `ConnectorSetupPanel.tsx` (labeled "optional") but was never read or
  enforced anywhere in `telegramCompanionService.js` before this fix.
  Registration now refuses if the allowlist is empty or the chat ID isn't
  on it. UI label changed to "(required to pair)" with an explanation.
  3 new regression tests added to the existing owner-registration test
  block (22/22 passing total for that file, up from 19).
- **Design note**: the plan discussed with the user before implementing was
  a newly-generated pairing code shown in Settings. While implementing,
  found the allowlist field already existed and was dead code — reused it
  instead (same security guarantee, less new surface, activates a
  previously-inert UI field). Documented as a transparent pivot, not a
  silent substitution.
- **Constant-time token comparison** added to both
  `gateway/generic-webhook/src/server.js` and
  `gateway/whatsapp-cloud/src/server.js` — both compared shared secrets
  with plain `===`. The WhatsApp gateway's actual HMAC payload-signature
  check (`verify.js`'s `verifySignature`) already correctly used
  `crypto.timingSafeEqual`; only the simpler bearer/query-token checks had
  drifted from that pattern. Added a shared `constantTimeEqual()` helper
  to both gateways' `security.js` and to `verify.js`'s `verifyChallenge`.
- **Audited, no fix needed**: `discordConnector.ts` is outbound-only, no
  automatic ingestion pipeline exists for its `getChannelHistory()` or any
  other read into agent prompts. `genericWebhookService.ts`'s drained
  events only produce an audit receipt + UI notification count, never
  reach `createJoseCommandRoute`. Same for `whatsappBrowserConnector.ts`.
  `.github/workflows/ci.yml` confirmed: `npm audit --audit-level=high` and
  `cargo audit --deny warnings` both already fail the build on findings
  (no `continue-on-error` on either).
- **Documented, not implemented** (user's explicit choice): OS-level
  credential storage (e.g. Windows Credential Manager via a Tauri plugin)
  vs. the current localStorage + SQLite dual-write. Recommended for a
  future sprint if/when multi-user or shared-machine use is ever
  supported; not urgent for a single-user local-first desktop app.
  Tracked as a Sprint 6 carryover item.
- **Bonus fix**: closed the `ConnectorSetupPanel.test.jsx` failure open
  since Sprint 2 (documented one-line fix: added
  `hydrateConnectorCredentialsFromSqlite: vi.fn().mockResolvedValue()` to
  its `connectorAuth` mock factory) — found while already touching that
  file for the Telegram UI copy change.
- Verification: 48/48 targeted tests passing, `npx tsc --noEmit` clean,
  ESLint clean.

## 11.11 ALPHONSOTOTHEMOON Sprint 5, batch 1: connectors subsystem TS migration (2026-07-02, v2.5.7)

Full context in `ALPHONSOTOTHEMOON.md`. `src/services/` root level is still
115 `.js` / 16 `.ts` — this batch targeted the `connectors/` subdirectory
specifically, per the sprint's own "batch by subsystem, connectors first"
guidance, not the root-level count.

- **Migrated 6 files**: `connectorConstants.ts`, `tavilyConnector.ts`,
  `perplexityConnector.ts`, `deepseekConnector.ts`, `n8nConnector.ts`,
  `connectorAuth.ts`. `src/services/connectors/` moved from 3 `.ts` / 10
  `.js` to 9 `.ts` / 4 `.js`.
- **Deliberately deferred** to a follow-up batch:
  `connectorImageGenerators.js` (375 lines), `connectorOutbound.js` (952
  lines), `connectorPolling.js` (452 lines), `connectorRegistry.js` (682
  lines) — larger files, more surface area per migration, consistent with
  "do not attempt in one pass."
- **Verified the rename pattern was safe before touching anything**: this
  codebase already imports `.ts` connector modules
  (`discordConnector.ts`/`slackConnector.ts`/`githubConnector.ts`) via
  literal `.js`-suffixed import specifiers in several other files (Vite's
  bundler module resolution rewrites the extension) — confirmed by
  grepping for `discordConnector.ts`/`slackConnector.ts` and finding real
  hits before assuming the same would work for the 6 files in this batch.
  No import statement needed changing across the ~15 files that reference
  these connectors.
- **Real bug caught by typechecking, not just a mechanical rename**:
  `connectorAuth.ts`'s new `updateConnectorAuthProfile()` type signature
  caught `ConnectorSetupPanel.tsx` passing a raw, unnormalized string as
  `allowlist` — the function's own `normalizeAllowlist()` call already
  handled this correctly at runtime, but the untyped JS had been silently
  accepting the mismatch. Fixed the type to explicitly accept the
  pre-normalization string input this call site actually passes, rather
  than loosening the type to `any` to make the error disappear.
- **Found and fixed a related test gap while running the full targeted
  suite**: `src/test/connectors/telegramCompanionService.test.js` is a
  second, duplicate Telegram companion test file that Sprint 4's
  owner-registration security fix hadn't touched (only
  `src/test/telegramCompanionService.test.js` was updated at the time).
  It had the same `TELEGRAM_ALLOWED_CHAT_IDS` mock gap and 2 failing
  tests as a result — fixed with the same mock pattern plus 2 new
  regression tests (empty-allowlist refusal, wrong-chat-id refusal).
- Verification: 275/275 targeted tests passing, `npx tsc --noEmit` clean,
  ESLint clean.

## 11.12 ALPHONSOTOTHEMOON Sprint 5, batch 2: 10 more root-level services (2026-07-02, v2.5.8)

Full context in `ALPHONSOTOTHEMOON.md`.

- **Migrated the 10 smallest remaining root-level `.js` files**:
  `connectorRegistryService.ts`, `workflowMemoryService.ts`,
  `workspaceArtifactService.ts`, `agentAuditService.ts`,
  `connectorAuditLogService.ts`, `agentPairingRegistryService.ts`,
  `miyaMemoryService.ts`, `crashLogService.ts`, `metaPublishService.ts`,
  `memoryService.ts`. Root-level `src/services/*.js` count: 115/16 →
  105/26.
- **Verification hit the documented vitest worker-pool timeout mid-run**:
  a ~27-file test invocation across the affected surface partially failed
  to start workers for 6 files (not test failures — worker-spawn
  timeouts). Re-ran those 6 individually; all passed. A further ~17-file
  batch surfaced one genuine test failure
  (`telegramConnectorProof.test.js`) — verified this was pre-existing and
  unrelated by running `git stash` (removing this session's changes
  entirely), reproducing the identical failure, then `git stash pop` to
  restore. Not caused by this migration.
- Verification: 269/270 targeted tests passing (the 1 known pre-existing
  failure excluded), `npx tsc --noEmit` clean, ESLint clean.

## 11.13 ALPHONSOTOTHEMOON Sprint 6 (started 2026-07-02, v2.5.9): fixed the ESLint `.ts`/`.tsx` coverage gap

Full context in `ALPHONSOTOTHEMOON.md`. Note for anyone reading prior
entries in this file: every "ESLint clean" claim logged before this entry
was accurate for the files ESLint actually processed, but `.ts`/`.tsx`
files were never among them — see below.

- **Root cause**: `eslint.config.js`'s only `files` block was
  `src/**/*.{js,jsx}`. No `.ts`/`.tsx` file in the repo (114 `.tsx`
  components, 26 `.ts` services as of Sprint 5 batch 2) had ever been
  linted.
- **Fix**: installed `typescript-eslint` (parser + plugin), added a
  matching `src/**/*.{ts,tsx}` rule block using `tseslint.configs.recommended`
  as a base, with `no-unused-vars`/`@typescript-eslint/no-explicit-any`
  turned off to match the existing leniency already established for
  `.js`/`.jsx` (avoids an unmanageable wall of findings on day one).
- **Immediately surfaced 37 real findings.** Fixed everything safely
  fixable:
  - 11 stale `eslint-disable` directives — auto-fixed.
  - 8 empty `catch {}` blocks (`ModelSwitcher.tsx` ×2,
    `appUpdateService.ts`, `licenseService.ts` ×3,
    `policyEnforcementService.ts` ×2) — each given an explanatory comment
    after confirming it was a legitimate fallback pattern, not a bug.
  - A real bug-shaped pattern in `SmartVoiceButton.tsx`: `cond ? a() :
    b();` as a bare statement (ternary used for side effects) — rewritten
    as `if (cond) a(); else b();`.
  - 3 `require()` calls inside try/catch in `SettingsView.tsx` — checked
    that `getWatcherConfig`/`saveWatcherConfig`
    (`echoFileWatcherService.ts`) and `getUsageStats`
    (`memoryMonitorService.ts`) are always-resolvable named exports
    before converting to static top-level imports (confirming the
    dynamic `require()` wasn't defensive lazy-loading, just unnecessary
    indirection).
  - 4 empty `interface X extends Y {}` in `global.d.ts` converted to
    `type X = Y` aliases (same semantics, satisfies the rule).
- **Deliberately deferred, not silently patched over**: 9 files use
  `// @ts-nocheck` (`App.tsx`, `ApprovalModal.tsx`, `ChatView.tsx`,
  `ConnectorHealthPanel.tsx`, `OllamaOfflineBanner.tsx`,
  `OnboardingWizard.tsx`, `SettingsView.tsx`, `Sidebar.tsx`,
  `WorkflowBuilderView.tsx`). These were written before any type
  checking existed for them; removing `@ts-nocheck` from any would
  likely surface a large batch of real type errors per file — a
  separate, much bigger scoped effort. Added a targeted `eslint.config.js`
  override, listing these 9 exact file paths (not a wildcard), that
  disables only `@typescript-eslint/ban-ts-comment` for them, with a
  comment instructing future contributors not to widen the list.
- Verification: `npm run lint` clean (exit 0), `npx tsc --noEmit` clean,
  133/133 targeted tests passing across every file touched.

## 11.14 First release since v2.4.4 — found and fixed a real version-drift bug (2026-07-02, v2.5.10)

User requested a tag + CI release + installer. Tagged and pushed `v2.5.9`;
`.github/workflows/release.yml` built and published successfully on
GitHub Actions (Windows runner, 19m47s: `npm run verify:app`, `cargo
test`/`clippy`, signed `tauri build`, GitHub Release with installer +
`.sig` + `latest.json`).

- **The published release was checked, not assumed correct.**
  `gh release view v2.5.9` showed the installer asset as
  `Alphonso_2.4.4_x64-setup.exe` — not `2.5.9`.
- **Root cause**: `package.json`'s version has been bumped every sprint
  since v2.4.4 (through 2.5.0–2.5.9), but `src-tauri/tauri.conf.json`
  and `src-tauri/Cargo.toml` — the actual Tauri application version,
  which drives the NSIS installer filename, the in-app About/version
  display, and the updater's version-comparison logic — were never
  touched. They still read `2.4.4`. Every "version bumped X → Y" claim
  in this project's history through Sprint 6 only ever updated the
  JS-side version; the shipped Tauri binary's version string was stuck.
  This went undetected for 9 version bumps because no release had been
  cut since v2.4.4 until this one.
- **Fix**: bumped `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`,
  and `src-tauri/Cargo.lock`'s `app` package entry to `2.5.10`, matched
  `package.json` to it, verified with `cargo check`, and cut a new
  release under `v2.5.10` rather than force-moving the already-public
  `v2.5.9` tag (it was live; someone could already be looking at it).
- **Process fix going forward**: any future "bump package.json version"
  step must also bump the three Tauri-side version locations in the same
  commit. Documented in `ALPHONSOTOTHEMOON.md`'s running log and Sprint 5
  tracker.

---

## 11.15 User bug-report pass — 15 issues traced to real root causes, not a sprint (2026-07-10)

Not a version bump or a planned sprint — the user reported 15 distinct issues live in
the running app and asked for root causes, fixes, and doc updates. Every claim below
was verified against real code (actual `invoke()` calls checked against actual
registered Tauri commands, actual test-suite contracts read before rewriting code,
actual test suites run before and after every change) — nothing here is inferred from
documentation or assumption.

**Fixed and verified:**

1. **Telegram bot never responded, despite a valid token, allowlist, and `/start`.**
   `telegramCompanionService.js` called Tauri commands that don't exist —
   `telegram_get_updates`/`telegram_send_message` — when the real registered
   commands (in `telegram.rs`, wired in `lib.rs`) are `connector_poll_telegram`/
   `connector_send_telegram`. Every call threw "command not found," silently
   swallowed by a bare `catch {}` in `telegramInvoke()`. Fixed the command names,
   adapted to the real `ConnectorPollProof`/`ConnectorInboundMessage` response
   shape, made the Rust commands accept a per-request `token` param instead of only
   reading an OS env var that's never set on a desktop install, and replaced the
   silent catch with real error logging.
   - Also found and fixed while in this file: `processInboundCommands` used
     `return` instead of `continue` inside its per-message loop — every command
     branch bailed out of the *entire* function after the first message in a poll
     batch, silently dropping every other message that arrived in the same
     4-second window. And a dead second `if (cmd === 'memory')` branch (shadowed
     by an identical earlier check) meant `/memory <query>` never actually
     searched — it always just listed recent items.
   - 40 tests in `src/test/connectors/telegramCompanionService.test.js` (2 new
     regression tests added), 22 in `src/test/telegramCompanionService.test.js` —
     all passing.

2. **CMD windows flashing open/closed while the app runs.** `CREATE_NO_WINDOW`
   (Windows-only flag to suppress a visible console window on child process spawn)
   was applied inconsistently — present at 2 of ~11 spawn sites in
   `runtime_manager.rs`, entirely absent from `lib.rs` (7 sites incl. `check_processes`'
   polled `tasklist` call — the most likely source of *recurring* flashes),
   `plugin_runtime.rs`, `voice_sidecar.rs`, and `workspace.rs`'s whisper spawn. Also
   found: `runtime_manager.rs`'s `kill_pid`/`is_pid_alive` helpers (used in a
   post-spawn health-check poll) were unguarded. Added a shared `no_window()`
   helper to `utils.rs`, applied everywhere. `cargo check`/`cargo clippy -D
   warnings` clean.

3. **Sidebar navigation items unreachable/clipped on short windows.**
   `Sidebar.tsx`'s nav item list (`NAV_SECTIONS`) was `shrink-0` inside a parent
   with `overflow-hidden` and no scroll of its own — if the list was taller than
   the window, items below the fold were simply clipped with no way to scroll to
   them (only the separate "Recent Chats" list below it had `overflow-y-auto`).
   Fixed: nav list now caps at `max-h-[45%]` with its own `overflow-y-auto` when
   the sidebar is expanded, and `flex-1 overflow-y-auto` when collapsed.

4. **Coach Mode: "even a page doesn't open."** Root cause was much deeper than UI —
   Coach Mode opens as a *separate Tauri webview window*
   (`new WebviewWindow('coach', ...)` in `coachModeService.ts`), and that window
   had **zero Tauri capability grants**: `src-tauri/capabilities/default.json`
   scoped every permission to `"windows": ["main"]` only, with no entry for
   `"coach"`. Even when the window opened, nothing inside it — including its own
   `invoke()` calls — could function. Added `"coach"` to the windows list. Also
   fixed a real silent-failure bug: `new WebviewWindow()` never throws
   synchronously on creation failure (errors only arrive later via an async
   `tauri://error` event nobody was listening for), so `openCoachWindow()` always
   *looked* successful even when it silently failed — now it actually awaits
   `tauri://created`/`tauri://error` and rejects on real failure.
   - Also found (self-reported after the user explicitly asked what bugs were
     found but not initially flagged): 3 more call sites in `CoachContext.jsx`
     (`handleToggleCoachTop`, `minimizeToCoach`, `openAlphonsoDesktopCard`) had the
     identical silent-catch pattern as the one first patched — all 4 now
     distinguish a real Tauri-runtime failure (surfaced as an error toast) from
     the expected web/dev-mode no-op.
   - 7/7 tests in `src/test/services/coachModeService.test.js` (1 new regression
     test for the `tauri://error` path).

5. **Voice OS completely non-functional — "not working at all."** This was not a
   missing-prerequisite issue; `voice/backend/pipeline.py` was fundamentally
   broken at the code level:
   - `run_pipeline(session_id, pcm, llm)`'s third parameter was named `llm` and
     called as `await llm(session_id, text, detect_agent(text))` — but the actual
     caller in `main.py` passes `conversation_history` (a plain list) as that
     argument. Calling a list as a function crashed every single voice
     interaction immediately after transcription succeeded.
   - No `_call_ollama` function existed anywhere in the backend, despite the
     pre-existing test suite (`tests/test_pipeline.py`) already expecting one
     with a specific async-generator streaming contract — the actual LLM call
     was simply never implemented.
   - `audio = synthesize(reply)` called an `async def` function without `await`,
     so (had it been reached) a Python coroutine object — not WAV bytes — would
     have been sent over the WebSocket.
   - No voice-activity-detection gate before transcribing — `vad.py`'s
     `is_speech()` existed but was never imported or called, so every audio
     buffer including background noise would trigger the (broken) pipeline.
   - Fully rewrote `pipeline.py` to match the pre-existing test contract: VAD
     gate → STT → agent detection → a real streaming Ollama `/api/chat` call
     (`_call_ollama`, new, using `httpx.AsyncClient`) → properly `await`ed TTS.
   - Secondary fix: the Piper TTS voice model (`en_US-lessac-medium.onnx`) isn't
     bundled and wasn't auto-downloaded — if missing, `tts.py` silently returned
     empty audio forever with only a Python-side log line nobody would ever see.
     Now attempts a one-time auto-download on first use via `piper.download_model()`.
   - `httpx` added to `requirements.txt` as an explicit dependency (was only
     present transitively).
   - 31/31 pytest passing in `voice/backend/tests/` (was 28/31 — the 3 failures
     were unrelated `router.py` bugs, also found and fixed this pass, see below).

6. **Mobile Companion pairing P0 — "was not pairing or getting connected."** The
   actual root cause, found by tracing the full pairing path end-to-end: **port
   8765 was double-booked.** `companion_types.rs`'s `CompanionConfig::default()`
   binds the Companion WebSocket server to port 8765; `voice_sidecar.rs` (and,
   independently, `runtime_manager.rs`'s `voice-os` `ToolDef` — a second,
   separate Voice OS launch path via the generic Runtime Hub) also started Voice
   OS's uvicorn server on 8765. Whichever service started first silently won the
   `TcpListener::bind`/socket bind; the other failed with `log::error!()` only —
   nothing ever reached the UI. Since the Companion server starts synchronously
   in `lib.rs`'s `.setup()` closure and Voice OS's watchdog only fires after a
   30-second idle delay, the Companion almost always won the race in practice,
   meaning Voice OS silently failed to start on every boot as a *second*,
   compounding symptom of the same bug. iOS hardcodes port 8765 in multiple Swift
   files (`MDNSService.swift`, `PairingView.swift`, `SettingsView.swift`), so
   Voice OS was moved to port 8766 instead, updated consistently across 6 files:
   `voice_sidecar.rs`, `tauri.conf.json`'s CSP, `voiceOsService.ts`'s default WS
   URL, `SettingsView.tsx`'s placeholder text, `runtime_manager.rs`'s `voice-os`
   ToolDef, and the matching test fixtures in `voiceOsService.test.js`.
   - **Not independently re-verified against a live paired phone this session** —
     the port collision is the most likely single point of total failure and is
     now fixed, but Windows Firewall blocking port 8765/mDNS UDP 5353 on first
     run remains a possible contributing factor that can't be ruled out from code
     alone. User should confirm pairing actually succeeds after this fix.
   - Also found and documented (not a bug, a UX gap): mDNS discovery
     (`companion_start_discovery`) is opt-in only, never auto-started at boot —
     it only fires when the user clicks "Start Discovery" in Settings, and
     nothing in the UI signals this is a required manual step.

7. **WhatsApp — "same issue as Telegram" + "add commands with real behavior."**
   Two real, distinct problems, both fixed:
   - WhatsApp had **zero command handling** — inbound messages landed passively
     in `WhatsAppInboxPanel` with no parsing, no reply logic, nothing. Built
     `src/services/whatsappCompanionService.ts` from scratch, mirroring
     Telegram's real command set: `/status`, `/queue`, `/approve`, `/reject`,
     `/agents`, `/report`, `/ping`, `/help`, `/ask` — every command calls the
     exact same real underlying services Telegram uses
     (`listApprovalQueue`/`approvePacket`/`rejectPacket`/`listAgentActivity`/etc.),
     not stubs. Owner-pairing gated behind a new `WHATSAPP_ALLOWED_NUMBERS`
     credential, mirroring the same security pattern as Telegram's Sprint 4
     owner-registration fix. Wired auto-start at boot in `useBootEffects.js`
     (previously only a manual "Poll" button in the Orchestrator view existed —
     no automatic inbound flow at all).
   - Found and fixed a second real bug while wiring the above:
     `WHATSAPP_CLOUD_GATEWAY_DRAIN_URL` — required by
     `browserPollWhatsAppGateway()` for inbound polling to function at all — had
     **no UI field anywhere in `ConnectorSetupPanel.tsx`**. WhatsApp inbound has
     been completely unconfigurable through the app regardless of what
     credentials were set. Added the missing field, plus the new
     `WHATSAPP_ALLOWED_NUMBERS` field, to the WhatsApp credential section.
   - 15 new tests in `src/test/services/whatsappCompanionService.test.js`, all
     passing, covering the pairing gate, command routing, and the same
     batch-processing correctness the Telegram fix required.

8. **`voice/backend/router.py` keyword-routing bugs** (surfaced by voice pipeline
   test failures, not user-reported directly, but real and fixed): dict
   iteration order meant `hector`'s broad `find`/`scan` keywords were checked
   before `nova`/`sentinel`, stealing matches meant for them ("find market
   opportunities" routed to hector instead of nova; "scan for security
   vulnerabilities" routed to hector instead of sentinel). `miya`'s pattern was
   also missing write/blog/draft/copy/email keywords entirely — "write me a blog
   post" matched nothing and fell through to `alphonso_core`. Reordered
   `ROUTING_PATTERNS` so specific agents are checked before hector's generic
   catch-all terms, added the missing miya keywords.

9. **`UpdaterNotification.tsx`'s button relabeled** from "Update & Restart" to
   "Download Update" — the old label was actively misleading; it never restarted
   anything, it opens the release download page in a browser.

10. **`docs/BOARDROOM_ROLES.md` / `docs/BOARDROOM_MODEL_REGISTRY.md` corrected.**
    Both describe an early, aspirational 11-seat Boardroom design — including
    "Hermes" and "Kairo" as agents, and "Shayan" (the founder) as a boardroom
    "seat" — that was never actually built. The real shipped product only has the
    9-agent roster (`agentRegistry.js`). Added correction banners to both files;
    kept for historical context, not deleted.

**Explanatory findings, not code fixes** (user explicitly asked to explain some
items rather than build against them):

- **Boardroom's actual purpose**: a real, working feature (not scaffolding) —
  convene a topic with selected agents, get a real Hector RSS briefing, real Jose
  command-bus routing, a real Maria governance risk score on conclusion, and a
  functional (but client-side-only) risk-confirmation gate before distributing
  high-risk summaries. Honest limitation: "agent responses" in a session are
  mostly Jose's delegation acknowledgment + Hector's briefing, not genuine
  multi-agent deliberation.
- **The approval-confirmation gate** in `BoardroomView.tsx` (`riskConfirmed`
  state, lines ~383-396) is real, not decorative — wired to a genuine
  `runMariaGovernanceAudit()` call — but is a soft, client-side-only nudge with
  no backend re-check.
- **Miya's role**: confirmed directly from `miyaProfile.js`'s own stated
  limitation ("does not claim generated media if engine is not connected") that
  she is architected as the creative-direction/planning layer, not the raw
  generation engine — her skill packs route to ComfyUI/SD WebUI/Runway for
  actual rendering.
- **The Orchestration page** (`OrchestratorView.tsx`) audited end-to-end: not
  dead scaffolding — every panel calls real services (`listAgentPackets`,
  `listApprovalQueue`, `orchestrationQueueService`, etc.) — but has genuine,
  provable duplication: the Packets tab embeds the real `OrchestratorQueueView`
  component (own 5s auto-refresh), while the Monitor tab separately re-implements
  a "Durable Queue" + "Dead-Letter Items" panel over the same underlying data on
  a different refresh cadence. Left alone per explicit user instruction ("leave
  the orchestration page for now") — not yet consolidated.
- **Docker/Runway**: zero code linkage found anywhere between the Runway
  connector and Docker — Docker is required only by the n8n connector
  (`ConnectorSetupPanel.tsx` credential hint). Likely a UI-adjacency confusion
  between "Runway" and "Runtime" (Hub), not an actual bug — unconfirmed without
  seeing the exact screen the user was looking at.

**Handed off, not built:** full in-app auto-update (download → verify → install →
relaunch). `docs/AUTO_UPDATE_HANDOFF.md` (new) has the complete scope, file-by-file
steps, and acceptance criteria — opened as PR #98 on branch
`feat/in-app-auto-update`. Deliberately not attempted in this pass: requires new
`@tauri-apps/plugin-updater`/`plugin-process` dependencies and new Tauri capability
grants, and can only be properly verified against a real signed release artifact,
not a dev build.

**Explicitly declined, pending user decision:** a large external Boardroom-rebuild
spec (bloome.im-style group chat UX — @mentions, agent-to-agent visible
critique/pushback, escalation banners, diff views, 20-step implementation plan)
arrived as a handoff PDF (`ALPHONSO BOARDROOM HANDOFF.pdf`, gitignored — not a
durable project record) mid-session. Flagged to the user that it directly
conflicts with their own earlier explicit instruction not to touch Boardroom yet;
not acted on pending explicit sign-off on which instruction supersedes the other.

**Verification summary:** 93 JS/TS tests passing across the directly-affected
suites (15 new WhatsApp, 2 new Telegram regression, 1 new Coach Mode regression),
31/31 voice backend pytest (was 28/31), `cargo check`/`cargo clippy -- -D
warnings` clean throughout every Rust change, `npx tsc --noEmit` clean, ESLint
clean (one pre-existing unrelated warning in `ChatView.tsx`, not touched this
session). `package.json` version unchanged at 2.5.18 — this was a bug-fix pass,
not a release cut.

Commits: `cab7b78`, `abe8ee5`, `2bb524b` on `main` (all pushed to
`origin/main`); `be11bd5` on `feat/in-app-auto-update` (PR #98, awaiting
implementation).

---

## 11.16 Boardroom rebuild (12 phases, real-time group chat) + PR #98 merge (2026-07-10, later same day)

Later the same day as 11.15, the user provided the previously-withheld
`ALPHONSO BOARDROOM HANDOFF.pdf` (a bloome.im-style multi-agent group chat
spec) and, after a Step 0/1 design review following the `brainstorming` and
`writing-plans` skills, explicitly authorized proceeding — overriding the
11.15 "don't touch Boardroom yet" hold. Built inline (not via subagents, per
explicit user policy) across 12 independently-planned, independently
TDD-verified, independently committed-and-pushed phases. Every phase's plan
doc (`docs/superpowers/plans/2026-07-10-boardroom-*-phase{1..12}.md`) states
its own scope limitations up front — the goal throughout was to build real,
bounded functionality and say plainly what it doesn't do, not to overclaim.

`BoardroomView.tsx` (the old session-summary model documented in §9/§11.9
above) is **replaced** as the mounted Boardroom component by
`BoardroomChatView.tsx`. `BoardroomView.tsx`'s file may still exist on disk
but is no longer wired in `App.tsx`'s lazy imports — do not describe it as
current.

**New services:**
- `src/services/boardroomThreadService.ts` — thread/message persistence
  (localStorage), `parseMentions()` (case-insensitive, dedup, ignores
  embedded matches like `foo@hector.com`), `findCrossThreadContext()`
  (keyword-overlap recall across other threads — plain overlap scoring, not
  semantic/embedding search), `acknowledgeThreadMessage()` /
  `confirmThreadMessage()` (one-way state flags), `migrateLegacySessions()`
  (auto-converts old `alphonso_boardroom_sessions_v1` sessions).
- `src/services/boardroomFacilitatorService.ts` — `generateAgentResponse()`
  calls real Ollama per-agent with a persona-specific system prompt sourced
  from `agentRegistry.js` (not hardcoded to Alphonso), returns measured
  `model`/`latencyMs` on success (real `Date.now()` timing, not an
  estimate). `detectLowConfidence()` — a fixed hedge-phrase list scan
  ("I'm not sure", "unclear", etc.); explicitly not real model
  confidence/logprob scoring, since Ollama exposes no such signal.

**Key safety/UX behaviors in `BoardroomChatView.tsx`:**
- `@mention`s chain across agents (a reply mentioning someone else triggers
  them too) — bounded by a hard `MAX_CHAIN_DEPTH = 3` cap per message
  cascade. Hitting the cap posts an amber "Needs your decision"
  (`kind: 'escalation'`) message instead of continuing. This was explicitly
  flagged as the highest-risk phase (uncontrolled generation loop) before
  being built, and scoped to a simple global depth counter rather than
  per-topic/per-pair round tracking.
- A **Stop** button (visible while `facilitatorPending`) halts further
  chained hops. Does **not** abort an in-flight fetch — `generateOllamaResponse`
  in `src/lib/ollama.ts` has no `AbortController` wiring, and that's shared
  by every other caller in the app, so real cancellation was explicitly
  out of scope for this phase.
- Failed replies (`kind: 'failure'`) render distinct (rose styling) with a
  **Retry** button that reconstructs the original call from a stored
  `retryContext` field. Retry deliberately does **not** re-trigger the
  chaining a successful original reply would have.
- Escalation messages get a one-way **Acknowledge** control. Explicitly
  **not** a multi-human "seen by" roster — Boardroom has one human user
  (Shayan), so this is single-user acknowledgment, not presence tracking.
- Any message flagged `approvalRequired: true` (via the same real
  `classifyMissionRoomRisk()` `missionRoomService.ts` uses elsewhere)
  renders masked behind a **"Confirm to reveal"** gate until explicitly
  confirmed once. Before building this, grepped the entire Boardroom code
  path (`BoardroomChatView.tsx`, `boardroomThreadService.ts`,
  `boardroomFacilitatorService.ts`) for any connector/execution call —
  zero exist. This gates content *exposure*, not action *execution* — an
  honest distinction, since there is no live action-execution path in
  Boardroom's chat to gate.
- A small muted "model · Xs" label renders under real successful agent
  replies only (not escalation/failure/system messages).

**Live-verification finding (Phase 4):** ran a real, unmocked Ollama call
mid-phase and found a genuine bug mocked tests could never catch —
`generateOllamaResponse`'s hardcoded 30s timeout failed reproducibly
against a real multi-model Ollama instance (a cold model swap alone took
47.3s, total round-trip 73.1s). Fixed by bumping the timeout to 120s in
`src/lib/ollama.ts`.

**Architectural decision (Phase 4):** Boardroom's chat does **not** route
through `agentBusService.ts` or `a2aProtocolService.ts` — both solve
governed packet execution / async task delegation, not "post a generated
chat message." `boardroomThreadService.ts` stays the sole source of truth
for Boardroom messaging.

**Deliberately deferred**, not forgotten (see each phase's own "Explicitly
NOT in this phase" section for exact scope): cards (spec 1.5),
regenerate/diff view (1.10.3/1.10.4), resource contention handling
(1.10.14), voice input (1.10.6), mobile parity (1.10.8). On 2026-07-22,
the prior cancellation limitation was resolved: Boardroom Stop aborts the
active Ollama request, prevents a cancelled reply from being posted, and
continues to stop later chained hops. These remaining items are still deferred
and must not be claimed as shipped.

**PR #98 (`feat/in-app-auto-update`) resolved in the same pass:** merged
`main` into the branch (25 commits, zero conflicts — Rust-side plugin
wiring for `@tauri-apps/plugin-updater`/`plugin-process` in `Cargo.toml`,
`lib.rs`'s `tauri_plugin_updater::Builder`, `capabilities/default.json`'s
`updater:default` permission, and `tauri.conf.json`'s updater block was
already correct on `main` — contrary to an earlier same-session assumption
that it was missing too, corrected by checking directly rather than
re-assuming). The actual reason the PR was unmergeable: `package.json`/
`package-lock.json` never declared the two npm packages despite
`node_modules` physically having them installed and
`UpdaterNotification.tsx` importing them — a fresh `npm ci` (what CI
actually runs) would have failed the build with module-not-found. Fixed by
adding both to `package.json` and running `npm install` to regenerate the
lockfile with proper entries. Also found and fixed, surfaced by the
branch's CI run: `Doc Count Freshness` was failing on 9 stale numeric doc
claims (lib.rs non-empty line count 2,197 vs. actual 2,056; services 165
vs. actual 168; test files 222 vs. actual 226) across README.md/
ARCHITECTURE.md/AGENTS.md — fixed against `scripts/shared/counters.mjs`'s
real computed values (`node scripts/verify-doc-counts.mjs` now passes
clean), not guessed. Merged into `main`.

**Auto-update status after merge:** `UpdaterNotification.tsx` now does a
real `check()` → `downloadAndInstall()` → `relaunch()` flow via the two
plugins. Code-complete but **not yet live-verified against a real signed
release** — that needs an actual version bump + tag, which this pass
deliberately did not cut (feature-build + branch-reconciliation, not a
release).

**Verification:** 95 tests passing across `boardroomThreadService.test.ts`
(27), `boardroomFacilitatorService.test.ts` (15), `boardroomChatView.test.jsx`
(25+), `appLazyImports.test.js` (intermediate per-phase counts also captured
in individual commits). `npx tsc --noEmit` clean throughout. `npm run lint`
clean except the same one pre-existing `ChatView.tsx` console warning noted
in 11.15, not touched this session either. `package.json` version:
unchanged at 2.5.18.

Commits (`main`): `a632711`, `8a4cbfc` (Phase 4) · `4ff93d2` (Phase 5) ·
`78ef11e`, `cdca50c`, `bceb431` (Phase 6) · `359d836`, `3ca8a34` (Phase 7) ·
`73a6d86` (Phase 8) · `357e6ff`, `f5bea52` (Phase 9) · `7cc62b9`, `50d30a3`
(Phase 10) · `8af1b18`, `03610f4` (Phase 11) · `6906af1`, `204b2a6`
(Phase 12) · `71036a7` (merge main → feat/in-app-auto-update) · `55fff06`
(dependency fix) · `cf069d5` (doc count fix) — the last three on
`feat/in-app-auto-update`, merged into `main` via PR #98.

Still genuinely open: the merged auto-updater is unverified against a real
release; ~~`companionIntegration.test.js`'s fabricated Tauri command name
assertions~~ (closed 2026-10-06, see §11.29); all deliberately-deferred Boardroom spec
items listed above.

---

## 11.17 v2.6.0 live-verification bug pass — 6 real bugs found and fixed on a dedicated `DEBUGGING` branch (2026-07-10)

The user installed the v2.6.0 release built in 11.16, verified the
in-app auto-updater end-to-end for the first time (confirmed working —
banner shown, installer downloaded, old version uninstalled, new
version installed), and then reported 7 live issues. Per explicit user
instruction, all investigation and fixes happened on a dedicated
`DEBUGGING` branch (never on `main` directly) and were merged back only
once confirmed. Every root cause below was found by reading the actual
code paths involved, not by guessing from symptoms — several turned
out to be structurally different bugs than their symptoms suggested.

**Fixed (6 of 7), each with real tests, `cargo fmt`/`clippy -D warnings`
clean where Rust was touched:**

1. **Coach Mode wrongly said "requires Tauri runtime" inside the
   real installed desktop app.** `CoachContext.jsx` (3 call sites) and
   `telegramCompanionService.js`'s `isTauriAvailable()` checked
   `window.__TAURI__ !== undefined` — but Tauri v2 never sets that
   global unless `app.withGlobalTauri` is enabled in `tauri.conf.json`
   (it isn't, and was never intended to be). The correct check, already
   used correctly everywhere else in the codebase (`App.tsx`,
   `RuntimeManagerView.tsx`, `nativeSelfDevelopmentAutostartService.ts`),
   is `window.__TAURI_INTERNALS__`. The broken check meant
   `isTauriDesktop` was always `false`, so every real Coach Mode failure
   inside the installed app (e.g. a missing window capability grant) was
   silently reclassified as the expected-in-browser no-op message
   instead of surfacing the actual error.
2. **Telegram connector showed green/connected in Settings, but
   clicking "Test" said credentials were missing.** Not a race
   condition — `checkTelegramConnection`'s no-options fallback read the
   bot token from `localStorage['alphonso_connector_auth_profiles_v1']`
   under a `profiles[connectorId].apiKey` field, a completely different
   storage location and shape than where credentials are actually saved
   (`connectorAuth.ts`'s `saveConnectorCredential`, SQLite-backed under
   `alphonso_connector_credentials_v1`, keyed per-field e.g.
   `TELEGRAM_BOT_TOKEN`). The two systems never intersected — Test could
   never find a real token no matter what was saved in Settings.
3. **Telegram never responded to `/start` at all — not even the
   "pairing blocked" message.** `connectorAuth.ts`'s credential cache
   starts `null` and is only populated by an async
   `hydrateConnectorCredentialsFromSqlite()` call. `readAllCredentials()`
   locks the cache to `{}` the instant *anything* reads a credential
   before that hydrate resolves — and `useBootEffects.js`'s
   Telegram/WhatsApp companion-startup effects did exactly that, reading
   the token synchronously on mount with no hydrate call anywhere in the
   boot path. Once poisoned, the cache stays empty for
   `CRED_CACHE_TTL_MS` (60s), and any later default (`force=false`)
   hydrate call is a no-op due to `readAllCredentials`' own early-return
   guard — so `startTelegramCompanion()`/`startWhatsAppCompanion()` were
   silently never invoked, every boot, regardless of what was saved.
4. **Mobile Companion connected successfully but rejected nearly
   everything typed from the phone** with "Command not recognized as a
   Jose command." The iOS companion handler in `App.tsx` treated a
   `false` result from `isJoseIntakeCommand()`/`shouldRouteThroughJose()`
   as an outright rejection. Those two functions decide, within
   ChatView's own regular chat flow, between routing through Jose's
   multi-agent pipeline vs. answering directly via Ollama — returning
   `false` for ordinary messages (a greeting, a plain statement) is the
   *correct* signal there, since ChatView has a plain-chat fallback. The
   companion channel has no such fallback, so almost every message
   bounced. Fixed by always routing companion commands through Jose, per
   the effect's own stated purpose.
5. **The "Voice" sidebar page was completely empty.** `Sidebar.tsx` has
   always had a `id: 'voice'` nav item, but `App.tsx` never had a
   matching `activeTab === 'voice'` render branch — clicking it just
   showed blank content, and no Voice OS control view had ever been
   built. New `VoiceView.tsx`: real status (polled from the actual
   `voice_status` Tauri command), Start/Stop, the WebSocket URL once
   running, and a Python-prerequisite warning. Wired via the same
   named-export lazy-import `.then()` mapping pattern the rest of
   `App.tsx` uses, verified against `appLazyImports.test.js` — the
   regression test that exists specifically because a missing mapping
   for `BoardroomView` crashed the whole app earlier in this project's
   history (§11.9).
6. **Voice OS would not actually start, even after using Runtime
   Hub to "install" it.** The deepest bug of the six: two completely
   independent Voice OS provisioning systems exist that never agreed on
   where the Python virtual environment lives. Runtime Hub's `"voice-os"`
   `ToolDef` (`runtime_manager.rs`) is the *only* thing that ever
   `pip install`s Voice OS's dependencies (faster-whisper, piper-tts,
   fastapi, uvicorn, etc.) — into a venv at
   `runtimes_dir()/voice-os/venv` (`%APPDATA%\Alphonso\runtimes\voice-os\venv`
   on Windows). But `voice_sidecar.rs`'s `voice_start` — the command
   actually wired to the boot watchdog and the new Voice page — only
   ever checked for a venv under the *bundled app resource directory*, a
   location nothing ever creates a venv in. So even a fully successful
   Runtime Hub install was invisible to the real launch path:
   `voice_start` would silently fall through to bare system `python`,
   which crashes on the first missing import unless every dependency
   happened to be installed globally. Fixed with a new
   `resolve_voice_python()` helper (checks the Runtime Hub venv first,
   falls back to a bundled-resource venv, then bare system python as a
   last resort) and 3 new Rust unit tests covering all three resolution
   paths.

**Not yet fixed (1 of 7):** "output lands somewhere unknown, can't
find" — the user's message describing this was cut off before the
detail landed; needs clarification on what output and where it was
expected before this can be investigated.

**Process note:** all 6 fixes were committed individually on
`DEBUGGING` (never `main` directly, per explicit instruction), each with
its own real test (or, for the one exception — the `App.tsx` iOS
companion fix — a documented reason a new test wasn't added: the fix
sits inside an inline Tauri `listen()` callback in a 2000+-line
component with no existing mock harness, and building one from scratch
was judged disproportionate to a structurally trivial one-branch
removal; verified instead via full typecheck + lint + the existing
suite). A recurring hazard during this pass: this working directory is
shared with a concurrent OpenCode session actively expanding test
coverage on its own `TestParallal` branch — several `git stash
push --include-untracked` / commit / `git stash pop` cycles were needed
to keep OpenCode's uncommitted, unrelated stray files (which the shared
pre-commit lint hook would otherwise fail on) out of these commits
without disturbing or deleting any of that work. `DEBUGGING` was merged
into `main` via `git merge --no-ff` (commit `ef0ce1b`) once all 6 fixes
were verified, then deleted both locally and on `origin` per explicit
instruction. Doc-count drift from 3 new JS test files + 3 new Rust unit
tests fixed in the same pass (`410d4b0`).

Commits (`DEBUGGING`, in order): `175ee28` (Coach Mode), `edf5727`
(Telegram Test), `802eb23` (Telegram/WhatsApp boot start), `9335c79`
(Mobile Companion), `ab1b505` (Voice page), `4e6b758` (Voice OS venv
resolution). Merge: `ef0ce1b`. Doc fix: `410d4b0`.

---

## 12. Known Audit Errors (for future reference)

These errors appeared in `ALPHONSO-AUDIT-2026-05-31.md` and `ALPHONSO_PARALLEL_SUBAGENTS_2026-05-31.md`. They are recorded here so future sessions do not repeat them.

| What the audit said | What is actually true |
|---|---|
| "No real test suite — zero coverage, no test files found" | 37 test files exist in `src/test/` covering Jose pipeline, connectors, Ollama, approval enforcement, WhatsApp, workflows, and more |
| "Testing score: 4.0/10 F" | The gap is Rust tests + coverage thresholds + E2E, not absence of tests |
| "Claude and ChatGPT connectors are frontend-only stubs" | Both run through `policyEnforcementService.ts` and `connectorRegistryService.ts` with policy gating, audit receipts, and fail-closed behavior |
| "4 agent personas: Alphonso, Jose, Hector, Miya" | 9 agents: + Maria, Marcus, Echo, Sentinel, Nova — all with profile + permissions files and `agentContractService.ts` enforcement |
| "No CI/CD" (implied by Testing F grade) | Two GitHub Actions workflows exist: `ci.yml` (lint + test + build + Tauri artifact + cargo clippy/test) and `release.yml` (tag-triggered build + sign + publish) |
| ".env not in .gitignore" (implied) | `.env` and `.env.*` are correctly listed in `.gitignore`; the concern is git history, not current config |
| "Plugin tools run in the main thread, no Web Worker/iframe/subprocess isolation" (this file, until 2026-07-02) | Plugin tools already run as native OS subprocesses via `execute_plugin_tool` in `plugin_runtime.rs` (`Command::new`), not as in-process JS — there was never any plugin JS code to isolate with a Web Worker. This claim was written into ground truth itself without checking the Rust implementation; the real (narrower) gap was a missing per-plugin program allowlist, closed via `declared_programs`. |

**Root cause of all errors:** The audit was produced without reading `src/test/`, `src/agents/`, all of `src/services/`, or `.github/workflows/`. Future audits must verify all four directories before scoring any dimension.

**A separate, later audit — `14.07.2026CurrentStateofRepo.md` (repo root, dated 2026-07-14)** — is not known to contain factual errors the way the two above did, but carries the same general risk: it is a frozen point-in-time snapshot, not a maintained doc, and several of its numeric claims (test/file/line counts) are already stale relative to commits made after it was written. It now carries an explicit "do not trust on its own" banner at its top pointing back to this file and to `docs/PRODUCTION_READINESS_ASSESSMENT_2026-07-15.md` (added 2026-07-16). General rule, restated: no single audit or summary document — however recent — is ground truth by itself. Ground truth is the live code plus this file plus CLAUDE.md plus CHANGELOG.md read together, and when those disagree or leave a real gap, ask the user rather than guessing which one is current.

---

_Last verified: 2026-07-02 — v2.5.3. Fixed the auto-updater (it never checked for updates — `checkAppUpdate()` existed, tested, but was never called from `App.tsx`, and the Update button was a no-op; both fixed, full in-app install still needs `@tauri-apps/plugin-updater`, not yet installed). Closed a connector registry gap — Ollama, Brave Search, Perplexity, Tavily, DeepSeek, n8n each had working credential UI but no central registry entry; added all 6 (16 → 22). Seeded Sprint 3 (agent skill-library depth + feature-discoverability audit — investigated a "Coach Mode feels forgotten" report and confirmed it's actually wired via the main Sidebar, not dead code), Sprint 4 (security hardening Batch 2 — adversarial/attacker-resistance pass, not yet started), Sprint 5 (service-layer TS migration — corrected a stale claim that components were only 10/73 migrated; components are actually 100% done, the real gap is services at 115 `.js` / 16 `.ts`), Sprint 6 (runtime-hardening carryover). Confirmed via `.github/workflows/release.yml` that installer releases are built entirely by CI on tag push, not locally — this dev machine correctly has no signing key. TypeScript: 0 errors. package.json: 2.5.3. Targeted tests: 183/183 passing. Prior state (v2.5.2, 2026-07-02): ALPHONSOTOTHEMOON Sprint 2 — crash-recovery checkpoint, Discord connector, generic inbound webhook connector; connector count 14 → 16; found (documented, not fixed) a pre-existing `ConnectorSetupPanel.test.jsx` failure unrelated to any session change. Prior state (v2.5.1, 2026-07-02): ALPHONSOTOTHEMOON Sprint 1 — SHALAUDE License v1.0 added, skill-pack-to-agent-contract validation, default skill packs for all 9 agents, pipeline loop-guard/execution budget. Prior state (v2.5.0, 2026-07-01): security hardening (Batch 1) complete — SSRF, PKCE, tauri-plugin-dialog, arboard, per-program arg allowlist, policyDslService live, CSP narrowed. Open gaps: Voice OS Python prereq, plugin sandbox isolation, branch protection on main (manual step), rand/Tailwind/Vite major upgrades deferred, vitest worker-pool timeout on full-suite runs, `ConnectorSetupPanel.test.jsx` mock gap, full in-app updater install (needs plugin-updater/plugin-process deps), Sprint 3-6 backlog (see `ALPHONSOTOTHEMOON.md`)._

## 11.18 Repo audit, typecheck fix, and `TestParallal` branch resolution (2026-07-12)

User asked for a deep repo audit with a written orientation doc for future sessions, then separately asked to fix a bug the audit found, verify branch `TestParallal`, and merge it into `main` if it checked out — updating all docs afterward. Scope for the audit itself was explicitly agreed with the user as doc-synthesis + spot-checks, not a full `npm test`/`cargo check`/`cargo clippy` run.

**Audit deliverable:** `FABLE5.md` created at repo root — a short, durable fast-orientation doc for future agent sessions (points to `CLAUDE.md` → this file → `TODO.md` → `CHANGELOG.md` in read order, states what was verified vs. trusted, and is meant to be a pointer/delta layer, not a competing copy of this file). Read it before this file for a 5-minute warm start; it will be kept current as this session's findings age.

**Bug found and fixed:** `npm run typecheck` failed —
```
src/test/test-mocks.ts(117,12): error TS2304: Cannot find name 'global'.
```
`test-mocks.ts`'s `mockTimestampMs()` did `vi.spyOn(global.Date, 'now')`; this repo has no `@types/node`/`"types": ["node"]` in `tsconfig.json`, so ambient Node globals aren't typed. Changed `global.Date` → `globalThis.Date` (standard, always-typed, behaviorally identical for this call). `npm run typecheck` now passes clean. The function has zero callers currently (dead code, pre-existing, not addressed — see next item for why).

**`TestParallal` branch — investigated, found to be stale rather than ahead, salvaged instead of merged:**
- User asked to double-check `TestParallal` and merge into `main` if it verified.
- `git merge-base main TestParallal` = `8498d01` (the 2.5.18→2.6.0 bump), **not** main's tip at the time (`ca7738a`, "6 fixes from DEBUGGING branch," section 11.17 above). `TestParallal` had forked before that commit landed and never picked it up.
- That missed commit added `src/components/VoiceView.tsx`, the Voice-OS venv-resolution fix in `voice_sidecar.rs` (item 6 of section 11.17, with unit tests), and doc updates — none of which existed on `TestParallal`. Merging `TestParallal` into `main` as literally requested would have deleted `VoiceView.tsx`, reverted the venv fix, and dropped doc updates: a real regression.
- `TestParallal`'s own two commits (`dbc3b5e`, `89a6e73`) added `src/test/tauri-mock.ts` (193 lines: Tauri API mocks — invoke/listen/window/tray/notification/os) and `src/test/test-mocks.ts` (151 lines: service mocks — policy gate/connector registry/agent bus/cache/receipts/contracts/license), plus a stray leftover `commit-msg.txt`. Neither mock file is imported by any test file yet — inert scaffolding. `dbc3b5e`'s commit message claimed "14 React hooks tests... 200+ tests... all 243 test files pass with 3738 tests"; **none of those test files exist in the diff.** The message was aspirational/fabricated, not a record of real work — flagged explicitly so future sessions don't trust a branch's commit messages over `git diff`/`git show --stat`.
- Explained the tradeoff to the user (regression risk vs. speculative-value scaffolding); user confirmed: keep the scaffolding (low risk, may save time when hook tests are eventually written for real), but don't merge the stale branch or its misleading history. Created a temp branch off current `main`, copied over just the two mock files (with the `globalThis` fix already applied), committed with an honest message stating the files are unconsumed infrastructure, fast-forward merged into `main`. `TestParallal` itself was left alone (not deleted) for reference but is **not** part of `main`'s history and should not be re-merged as-is.
- `main` is now `ee228d0`.

**Drift check run (`npm run export:ground-truth`) — 2 numeric drifts found in this document, both now stale-flagged rather than corrected inline (the generator maintains its own snapshot; this file's prose claims were written at various past dates and drift is expected):**
- `src-tauri/src/lib.rs` lines: this doc has claimed as high as 4642 in places; live count is **2054** as of `main`@`ee228d0`. (Section 1/CLAUDE.md's "~2,024 lines" claim is closer and roughly current.)
- JS test files (`src/test`, `.js` extension only): claimed 65 in one spot, live count of `.js`-only test files is 177. Total test files across all extensions (`.js`+`.jsx`+`.ts`+`.tsx`) is **229** — this matches the "218 test files" ballpark claims elsewhere in this doc reasonably well; the drift-checker's 65-vs-177 comparison is specifically about the `.js`-only subset, not total test file count.
- Live counters from the same run, for reference: `services_total` 168, `components` 116, `agents` 27 (files under `src/agents/`, not the 9-agent roster — don't confuse the two), `scripts` 21, `test_files` 229, `test_lines` 30887, Ollama reachable with 6 models, Notion not wired.

**Verification performed:** `npm run typecheck` clean on `main` post-merge. Did not run `npm run test`/`npm run build`/`cargo check`/`cargo clippy` this pass (matches the doc-synthesis+spot-check scope agreed with the user). `git status` clean except `FABLE5.md` (new file, committed separately) and this doc update.

---

> _How to verify drift:_ run `npm run export:ground-truth` and read the **Drift vs ground truth** section of the generated file. It will flag any numeric claim in this document that diverges from the live repo.

## 11.19 `sprint-5-kilo-cli` branch review and rejection for PR (2026-07-14)

User asked whether stale local branch `sprint-5-kilo-cli` should be turned into a PR, whether it still verifies, and whether it conflicts with current `main`; docs were to be updated with the result.

**Conclusion:** do **not** open a PR from `sprint-5-kilo-cli` as-is.

- Branch position at review time: `main`/`origin/main` were both at `16ba2cc`; `sprint-5-kilo-cli` was 8 commits ahead of its own stale base but 78 commits behind current `main` (`git rev-list --left-right --count main...sprint-5-kilo-cli` = `78 8`).
- Branch verification in a temporary worktree failed before merge:
  - `npm run typecheck` failed with 10 TypeScript errors, including `src/components/BoardroomView.tsx` passing `[]` where `PriorOutputs` is required, `src/components/EcosystemMaturityPanels.tsx` state/type mismatch around `WorkflowOperation.status`, multiple incompatible `MissionRoom.tsx` state shapes, and `src/components/OperatorDashboard.tsx` assigning `OrchestrationReceipt[]` to `Record<string, unknown>[]`.
  - `npm run lint` completed with 1 warning (`src/components/ChatView.tsx` unexpected `console` call).
  - `npm run verify:docs` failed with 17 stale claims on that branch, including old version strings and outdated README/AGENTS/ARCHITECTURE counts.
- Mergeability against current `main` failed:
  - A non-committing merge in the temp worktree produced content conflicts in `README.md`, `docs/ALPHONSO_GROUND_TRUTH.md`, `docs/CHANGELOG.md`, `package.json`, `src-tauri/Cargo.lock`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src/services/backupService.ts`, `src/services/connectorHealthCheckService.ts`, `src/services/echoFileWatcherService.ts`, `src/services/missionRoomService.ts`, `src/services/novaAnalysisService.ts`, `src/services/pluginSigningService.ts`, `src/services/runtimeManagerService.ts` (add/add), and `src/services/workflowOperationsRegistryService.ts`.
  - `git merge-tree` also showed a broader changed-in-both/add-in-both conflict surface (27 entries total), confirming this is not a trivial rebase.
- Practical assessment: this branch is an old TypeScript-migration stack whose surviving unique changes are mixed with stale docs, stale version metadata, and service edits that now collide with later `main` work. Any useful ideas should be cherry-picked or reimplemented on a fresh branch from current `main`, not revived as a direct PR.

**Docs updated as part of this review:** README Rust unit test count fixed from 101 → 102; this section added here; matching note added to `docs/CHANGELOG.md`.

## 11.20 Voice/mobile doc reconciliation after recent `main` commits (2026-07-14)

User pointed out that the recent root-document updates still underrepresented how much had changed in voice and mobile since the stale TypeScript-migration branch. That was correct: the iOS companion README already described newer voice work that the top-level README/changelog summary did not.

**What changed on `main` recently, after the old branch diverged:**
- `fcc69fc` / `3e2b3b2` — a standalone `voice/cloud-backend/` service was added, then the repo was refactored to separate local Voice OS responsibilities from cloud voice responsibilities instead of mixing both concerns into the desktop backend.
- `f32f3f0` / `940fbed` / `f60e606` — the iOS companion's cloud voice transport was hardened: safer initialization, better credential handling, and explicit service override behavior.
- `1c493b2` / `913fecb` / `706b3fd` — follow-up operational fixes landed for local Ollama gateway config, Magpie-only cloud readiness, and unique TestFlight build numbers.
- `30253ee` / `b8776ac` / `57e9135` — Cloud Voice gained persona-aware routing plus Persian/Farsi support, with a dedicated Railway Piper service and playback retry handling.
- `b3fa949` — paired local companion conversations were updated to route by the selected persona rather than falling back to a generic reply path.
- `67703e3` / `16ba2cc` — Cloud Voice gained Supabase-backed device enrollment, and docs were added for that enrollment flow.

**Current architecture summary that top-level docs now need to reflect:**
- **Desktop app:** still owns the local-first voice runtime (`voice/backend/`, Voice OS, Ollama, local persona routing, companion WebSocket server).
- **Service split:** `voice/backend/` is the local desktop runtime; `voice/cloud-backend/` is now a separate cloud service with its own auth/config/contracts/tests; `voice/piper-farsi/` is a separate Farsi TTS service.
- **iOS companion:** now has a dedicated `VoiceView.swift` shell with separate `Local` and `Cloud` modes rather than being only a generic remote-control client.
- **Local mode:** push-to-talk turns are sent to the paired desktop and answered by the selected persona through desktop Ollama/Voice OS.
- **Cloud mode:** requests send `agent_id`, language, and response-voice selection to `POST /v1/voice/respond`; English uses NVIDIA TTS, while `fa-IR` uses Railway-hosted Piper voices `Mana` and `Manta`.
- **Security model:** the iOS app uses Supabase email one-time-code sign-in, stores the resulting session in Keychain, enrolls a generated device UUID, and sends only authenticated device-scoped Cloud Voice requests. Service-role credentials stay server-side.
- **Operational follow-ups already landed:** local voice calls can be pointed at a configured Ollama gateway, cloud readiness no longer requires more than the Magpie provider path, and the iOS build pipeline now uses unique TestFlight build numbers.

**Docs updated as part of this reconciliation:** README gained a new top-level "Voice + Mobile pass — 2026-07-14" section; `docs/CHANGELOG.md` gained matching unreleased notes; this section was added here to explain why the earlier branch-review-only summary was incomplete and what additional recent work had also landed.

## 11.21 PR #99 reviewed and merged — first 4 of 20 production-readiness tasks closed (2026-07-16)

User asked for a repo-state reconciliation: another, concurrent Claude Code session had been working on the remote and the user wanted to know what changed, what was committed/pushed, and what was left before anything got lost track of. Local `main` itself was clean and fully synced — the gap was entirely on the remote: PR #99 (`claude/production-readiness-audit-mxenki`, opened 2026-07-15, 11 commits) had been sitting open, unreviewed, unmerged.

**Discovery process (verified, not assumed):** `git fetch --all --prune`, `git branch -a`, `gh pr list --state all`, then `git diff main origin/claude/production-readiness-audit-mxenki --stat` to see the real shape of the branch before reading any of it.

**Also found:** the remote origin URL itself had changed from `github.com/Thatisshayan/AlphonsoEcosystem` to `github.com/obsidian-media/AlphonsoEcosystem` (PR #97, already merged 2026-07-06 — this was stale in the assistant's cross-session memory file, now corrected there too) — not a surprise once traced, but worth noting since a memory file citing the old URL would have sent future sessions to a dead/renamed remote.

**PR #99 review, file-by-file, before any merge action:**
- `src/services/licenseService.ts` + `src/config/licenseTrustKey.ts` + `scripts/issue-license.mjs` (T5) — the license paywall had been a client-side regex (`/^ALPHONSO-(PRO|ENT)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/`) checked against a plaintext key typed by the user, with **no server-side or cryptographic verification at all** — anyone could type a format-matching string, or simpler, just write `{"tier":"enterprise"}` into `localStorage['alphonso_license']` directly, and every premium connector unlocked. Replaced with offline ECDSA-P256 signed tokens: `licenseService.verifyLicenseToken()` checks a signature against `LICENSE_TRUST_KEY` (a public JWK, ships as `null` — fail-closed, every paid tier stays locked until the vendor generates a real key pair via `scripts/issue-license.mjs --generate-keys` and pastes the public half in) and an expiry, then holds the verified tier in memory (`verified`) rather than trusting storage as source of truth. `initLicense()` is called once at boot from `App.tsx`, and legacy insecure state (`alphonso_license`) is actively cleared on every boot so it can't linger and be misread. Test coverage rewritten (`src/test/licenseService.test.ts`, `src/test/services/licenseService.test.ts`, new `src/test/helpers/mintLicense.ts`) to assert forgery, tampering, and expiry are all rejected — 55/55 passing per the PR's own commit message.
- `src-tauri/src/companion_auth.rs` + `companion_server.rs` + `companion_router.rs` + `companion_types.rs` (T6) — the companion WebSocket's PIN pairing tracked a `pin_attempts` field on `ClientState::Pending` but **never read or enforced it** — an attacker on the LAN could hold a connection open and brute-force the 6-digit PIN indefinitely within its TTL, and the comparison itself was a plain `pin == attempt` (a timing side-channel, since Rust string equality short-circuits on the first differing byte). Fixed with `constant_time_eq()` (length-checked, XOR-accumulate byte comparison — length isn't secret since PINs are always 6 digits, but *which* digit differs must not leak via timing) plus a `max_pin_attempts` (default 5) budget enforced in `handle_auth()`: each wrong PIN increments the attempt counter and is echoed back to the client state; on the attempt that exhausts the budget, the live PIN is invalidated (`pin_manager.invalidate()`) and the connection is closed, so even a fresh guess attempt requires a brand new PIN to be generated and communicated out-of-band again. Both paths have dedicated Rust unit tests (`test_constant_time_eq`, `test_wrong_pin_locks_out_and_invalidates_after_budget`, `test_correct_pin_authenticates_without_closing`).
- `.github/workflows/ci.yml` (T1/T2/T10) — `cargo audit` had been running *before* fmt/test/clippy in the `rust-quality` job with `continue-on-error: false`; when the `spin 0.9.8` crate got yanked from crates.io, `cargo audit --deny warnings` failed and aborted the whole job before fmt/test/clippy ever ran — meaning CI on `main` had been silently gating nothing for however long that crate stayed yanked. Fixed two ways: bumped `spin` to `0.9.9` (unyanked) to make CI green immediately, and reordered the audit step to run **last** with `if: always()`, so a future yanked-crate advisory can dark-out at most itself, never the real quality gates before them — the reorder immediately un-masked and fixed a real hidden `cargo fmt` violation in `companion_router.rs` that had been sitting invisible behind the broken gate. Also fixed a Playwright collection-time crash: `test.describe.slow(...)` isn't a real API on the installed `@playwright/test` version, so the whole 28-spec E2E file threw at collection time and produced 0 collected tests — for months, meaning the E2E job had been gating nothing either. Fixed the API call, which un-hid the suite's true state: ~22 of 28 specs now fail at runtime as stale UI-interaction assertions needing live-app repair. Rather than either quietly leaving E2E fully red (blocking every future merge on unrelated, pre-existing spec rot) or leaving the collection crash in place (silently reporting "passing" while testing nothing), the job was made advisory (`continue-on-error: true`) with an explicit, dated code comment stating this is temporary and naming the tracking task (T10) — this was an **owner-approved tradeoff** documented in the PR itself, not a unilateral weakening of CI.
- Also fixed in the same PR: a flaky `latencyMs >= 5` wall-clock assertion in `boardroomFacilitatorService.test.ts` that intermittently reddened the JS test gate.

**Merge decision:** `gh pr merge 99 --merge --admin` was required — branch protection blocked a plain merge on 2 of ~15 required checks. Both were verified as pre-existing/unrelated before overriding, not assumed: `CodeQL (swift)` was independently confirmed failing on `main` itself via `gh run list --branch main --workflow CodeQL` (same failure, unrelated to this PR's changes), and the Playwright E2E check is the exact suite this same PR documents as intentionally advisory. User was asked and explicitly approved the admin override before it was used. Merged into `main` at `f782aa9` on 2026-07-16, then `git pull` to fast-forward the local working copy.

**Also done:** deleted a stale local-only branch `sprint-5-kilo-cli` — its remote counterpart had already been deleted on origin (shown as `[origin/...: gone]` in `git branch -vv`), and its 8 commits (TS migration batches 3–10) were already superseded by equivalent, already-merged commits on `main` with matching content — see §11.19 for the branch's original review/rejection history.

**T3 closed same day (2026-07-16), immediately after this section was written:** the `secrets-scan` (TruffleHog) CI job had been hard-failing on every direct push to `main` — not a real leak. Root cause, confirmed from the actual failing-run logs (`gh run view <id> --log`) across 3 separate push-to-main runs, all identical: `.github/workflows/ci.yml`'s TruffleHog step used `base: ${{ github.event.repository.default_branch }}` (i.e. `main`) and `head: HEAD` — on a `push` event *to* `main`, both resolve to the exact same commit (the one that was just pushed), and TruffleHog's own composite action explicitly refuses to scan and exits 1 when base equals head ("BASE and HEAD commits are the same"), rather than skipping quietly. This is why PR #99's own check for this job had shown "pass" — on a `pull_request` event, base/head are genuinely different (the PR's base branch vs. head branch). Fixed by diffing against `github.event.before` (the pre-push SHA) on push events, falling back to an empty base — i.e. full-history scan — when `before` is the all-zero SHA (a brand-new branch), and against the PR's actual base/head SHAs on `pull_request` events. Also added a real "Reporting a Vulnerability" disclosure/response section (contact method, 5-business-day ack target, 30-day fix target for critical/high, credit policy) plus an "Automated scanning" summary to `SECURITY.md`, which previously was only a historical fix-log with no reporting process — the task's own DoD ("secret-scan job green with a documented reason... disclosure process published") required both.

## 11.22 T4 branch protection enabled + `14.07.2026CurrentStateofRepo.md` given a trust caveat (2026-07-16, later same session)

User asked to proceed with T4 and to make sure the repo-root audit doc `14.07.2026CurrentStateofRepo.md` is clearly marked as not fully trustworthy on its own — explicitly framing ground truth as the combination of code + docs together, with the user as the tiebreaker when they disagree, not any single document (including this one).

**T4 — branch protection:** checked actual current state via `gh api repos/.../branches/main/protection` rather than assuming it was unset — it was **already partially configured** (`Test & Build` + `Rust Tests & Clippy` required as status checks, 1 approving review required, force-push and branch deletion both blocked, `enforce_admins: false`). This explains why merging PR #99 required `--admin` earlier the same session — a plain merge was already blocked by the existing review requirement, not by a rule this session was about to add. Expanded the required-status-checks list via `gh api -X PATCH .../required_status_checks` to add `Secrets Scan (TruffleHog)` and `Doc Count Freshness`, both now reliably green after T1–T3. **Deliberately left out of the required list:** `Playwright E2E Smoke Test` — it's intentionally advisory per T10's owner-approved decision (see §11.21), and requiring it would silently re-block every merge on ~22 known-broken, unrelated specs, defeating the point of making it advisory in the first place. Left `enforce_admins: false` — single/small-maintainer repo, and an admin override is exactly the escape hatch that was legitimately used to merge PR #99 after a careful manual review found the failing checks were pre-existing/unrelated; forcing every future judgment call like that through a second approver isn't warranted yet at this team size.

**`14.07.2026CurrentStateofRepo.md` trust caveat:** added an explicit warning banner at the top of the file itself (not just referenced from elsewhere) stating it is a frozen 2026-07-14 snapshot, pointing to this file's own §12 "Known Audit Errors" and to `docs/PRODUCTION_READINESS_ASSESSMENT_2026-07-15.md` (which already opens by saying it independently re-verified this report's claims rather than trusting them), and stating plainly that no single document is ground truth — code + `ALPHONSO_GROUND_TRUTH.md` + `CLAUDE.md` + `CHANGELOG.md` together are, and when those disagree or leave a gap, the answer is to ask the user, not to guess which doc is more current. Also added a corresponding row to this file's own §12 table so a reader who reaches §12 first (rather than opening the root file first) still learns about it.

**What's still open:** roadmap tasks T11–T20 (secret-scan triage, branch protection enablement, persistence schema, connector-DSL fail-open default, OS-keychain credentials, `lib.rs` split, live auto-updater/iOS-pairing verification, sidecar observability, service-role-key blast radius, doc-drift auto-generation, multi-agent budgets) are **not started** — full detail in `docs/PRODUCTION_READINESS_ASSESSMENT_2026-07-15.md` §6, which itself was updated same-pass to record the merge and mark T1/T2/T5/T6 done, T10 partial. CLAUDE.md's Real Gaps list and TODO §11 below were updated to point at the same roadmap doc rather than duplicating the full task list inline, so it can't drift out of sync across two places.

---

## 11.23 Truth-First plan C2/C3 closed — per-pack skill scoping fixed and exhaustively proven (2026-07-25)

User asked to close the Truth-First Execution Plan's C section (C2/C3), then — after being asked directly what corners had been cut — asked for every gap in that work to be closed truthfully, with no faked completions. Both passes are recorded here together since the second pass materially changed what C2/C3 actually verify, not just how they're worded.

**First pass — C2 (`src/services/agentContractService.ts`):** `validateSkillPackAgainstContract()` had a `usesAgentWideTaxonomyScope` bypass forcing every Hector (except 5 packs in a `legacyHectorPackIds` set — of which only 4 had a working override entry; the 5th, `pack.hector-professional-marketing`, has none and was already falling back to the agent-wide list regardless), Echo, and Nova taxonomy pack back onto the full agent-wide permission list, silently ignoring the per-pack `AGENT_SKILL_PACK_SCOPE_OVERRIDES` entries defined for them. Root cause: those override entries didn't match the packs' real declared `permissions` in `skillPackService.ts` — Hector's 16 new-taxonomy overrides were entirely fictional dotted-namespace strings that were never real permissions anywhere in the codebase; Echo/Nova had 4 corrupted entries (a mangled `knowledge追溯`, three missing-dot typos). Fixed all 20 mismatches against the real source and removed the bypass.

**First-pass gaps, found only when directly asked to self-audit (not caught before that point):** a factual error in the plan doc (said "4 legacy packs", the code's set actually has 5); the `--check` doc-freshness failure path was claimed working but never actually exercised; the full `npm test` suite was never run, only narrow hand-picked file lists; the `ci.yml` YAML edit was never validated; C2 was marked fully done despite its own stated scope (owner, shared status, allowed *and blocked* prefixes, documentation) being only partially addressed; the negative-authorization tests covered 6 hand-picked packs, not "each pack" as the task literally requires; `installSkillPack`/`setSkillPackEnabled` were never traced for regression risk; this file was never updated. Also, mid-verification, a mistake was made and caught: reproducing the `--check` failure path corrupted `docs/AGENT_SKILL_PERMISSION_MATRIX.md` on disk and a badly-written restore command silently failed, leaving the corrupted file sitting for a few tool calls until the mistake was noticed and fixed by regenerating from source.

**Second pass — closing every one of those, verified not asserted:**
- Fixed the "4 vs 5 legacy packs" error in `docs/TRUTH_FIRST_EXECUTION_PLAN.md`.
- Reproduced both `--check` failure modes for real (stale content, missing file) using a safe in-repo backup instead of `/tmp` (whose earlier use was the cause of the corruption mistake), confirmed the success path afterward, left the repo clean.
- Found and fixed a real, reproduced line-ending hazard: this machine has `core.autocrlf=true` and the repo had no `.gitattributes`; a `git add` + simulated-checkout round-trip converted the generated doc's LF endings to CRLF and made `--check` fail on pure line-ending noise with zero real content drift. Added `.gitattributes` pinning `eol=lf` for the doc and its generator, reproduced the same round-trip afterward to confirm the fix holds (0 CRLF).
- Ran the real `npm test` (not a narrow selection) twice this session: 255 files / 3,742 tests passing, then 255 files / 3,746 tests passing after the later C2/C5 test additions — 0 failures both times.
- Closed C2's actually-incomplete scope: audited every override entry for anything resembling `execute_command`/`filesystem.write`/`external_publish`/`purchase` (zero matches — no pack needs a per-pack block today) and implemented a real, wired, tested `AGENT_SKILL_PACK_BLOCKED_OVERRIDES` denylist mechanism anyway, checked ahead of the allowlist and applying even to Alphonso (who is otherwise exempt from the universal blocklist). "Shared status" already existed semantically (an unowned `agent_workflow`-category pack is inherently shared/unscoped) but was undocumented — the C3 matrix generator now has a dedicated "Shared packs" section for all 20 `AGENT_WORKFLOW_SKILL_DEFS` packs plus a per-pack "Blocked (per-pack)" column in the exclusive-packs section.
- Replaced the 6-pack sample negative-authorization test with a genuinely exhaustive, data-driven one in `src/test/services/skillPackContractMatrix.test.ts` that iterates every real pack pair sharing an owner. Writing it surfaced two real bugs in the test itself, both caught by running it and reading the failure rather than trusting the first draft: (1) it initially asserted rejection even for the 10 intentional catch-all packs that have no override by design — fixed by adding a new minimal exported accessor `hasSkillPackScopeOverride()` (membership only, not contents) and skipping those correctly; (2) a "covered by own broader scope" heuristic truncated every permission to its top-level namespace (`code.review` → `code.`) and treated any two packs sharing that namespace as mutually covered, which would have silently skipped roughly half of all real candidate checks across every Alphonso pack sharing the `code.` namespace — replaced with an exact literal-prefix check matching production's real `startsWithAny` semantics, plus the one genuine documented exception (`pack.miya-creative-image`). Final verified coverage: 166 total `agent_skill` packs, 156 with an override, 10 correctly-excluded catch-all packs, 112 legitimate literal-prefix-overlap skips, and 6,127 real negative assertions actually executed and passing.
- Traced `installSkillPack`/`setSkillPackEnabled` in `skillPackService.ts` directly instead of inferring safety from the integration suite passing. Finding: `installSkillPack` already gated on `validateSkillPackAgainstContract` at install time before this session (pre-existing), so the free-form "paste a manifest" path in `EcosystemHub.tsx` was already narrower-risk than assumed — a tampered manifest reusing an existing pack id with widened permissions is rejected at install time. `setSkillPackEnabled`'s own independent re-validation-on-enable is a real second gate specifically for records persisted *before* this fix existed; proved directly by seeding a tampered record straight into the `localStorage` key (bypassing `installSkillPack`'s gate, the way a stale on-disk record would) and confirming re-enabling it is blocked. Added 4 regression tests to `skillPackService.test.js` covering both the blocked-at-install and blocked-at-enable cases.
- This section.

Full detail, exact evidence, and the corrected/superseded numbers for both passes are in `docs/TRUTH_FIRST_EXECUTION_PLAN.md`'s C2/C3 entries — this section is a summary, that file is the primary record.

**Trust caveat on this file's own trailing entry:** the `_Last verified: 2026-07-02` line near the top of this file (§12, just above §11.18) is stale relative to both this file's own later `§11.18`–`§11.22` entries and to `CLAUDE.md`'s narrative, which documents multiple sprints between 2026-07-10 and 2026-07-25 that were never reflected in that trailing line. Not backfilled here — reconciling that entire gap is a separate, larger task than the C2/C3 work this session actually did, and attempting a partial rewrite of it risked introducing new inaccuracies rather than closing a real one. Flagged here rather than left silently unnoticed.

---

## 11.24 Truth-First plan sections A, B, D closed (2026-07-25, same day as §11.23)

User asked to close Section A, then B, then D of the Truth-First Execution Plan in that order, autonomously, with the same "no faked completion, no cut corners" standard §11.23 was held to, and to commit/push each section's work. All work happened on a dedicated branch (`fix/truth-first-plan-abcd`) per this repo's own `BRANCH_POLICY.md` — `main` is never committed to directly — with one commit per closed task, each pushed immediately after passing its own real verification.

**Section A — A1 closed.** A2–A5 were already `[x]` from 2026-07-22. A1 (full reproducible verification baseline) had every acceptance command actually re-run this pass, not inferred from the older evidence: `npm run lint`, `npm run test` (255 files / 3,746 tests at the time), `npm run build`, `npx tsc --noEmit`, `cargo check`/`test`/`clippy -D warnings`/`fmt --check` (all Windows `x86_64-pc-windows-msvc`), `npm audit`, GitHub Dependabot alerts via `gh api`, `cargo audit --file Cargo.lock --deny warnings`, and the full Playwright E2E suite (28/28, up from the previously-recorded 26/7). Two real, non-trivial findings came out of just running the commands instead of trusting old evidence: (1) `npm run verify:docs` failed on the first run — this session's own C3 work had added a 255th test file and neither `README.md`/`AGENTS.md` nor the checker's own hardcoded `CURRENT_TOTAL_TESTS` constant had been updated to match, fixed same-pass; (2) `cargo audit --deny warnings` failed with 17 denied findings against the *same* `Cargo.lock` that a real CI run on `main` had passed cleanly against roughly two hours earlier (`gh run view 30154765984`) — the RustSec advisory database gained 17 new entries in that window, a live external dependency, not a code regression. A1 stayed `[~]` until B1 closed the audit gap, then was marked `[x]`.

**Section B — B1, B3, B4 closed (B2 was already `[x]`).**
- **B1 (dependency-advisory triage):** traced every one of the 17 `cargo audit` findings to its real dependency path via `cargo tree -i <crate>` rather than guessing from the count — 12 trace to `tauri 2.11.5` → `tray-icon 0.24.1` → `libappindicator 0.9.0` → `gtk 0.18.2` (Linux system tray), 5 trace to `tauri 2.11.5` → `tauri-utils 2.9.3` → `urlpattern 0.3.0`. Confirmed via `cargo update -p tauri --dry-run` / `-p tauri-utils --dry-run` that both are already at their latest compatible/available versions — no upgrade in this project's control removes them today. All 17 are RustSec "unmaintained"/"unsound" warnings, zero are CVE-severity vulnerabilities. Added an explicit per-advisory-ID `--ignore` list to the CI audit step (each ID individually commented with crate/reason) rather than a blanket `--deny` downgrade or crate-name ignore, so any *new*, different advisory against these same crates still fails CI immediately. Tried `audit.toml` auto-discovery first, confirmed it doesn't work against the installed `cargo-audit 0.22.2`, and discarded it rather than leave a non-functional file behind. Verified locally with the exact CI command before committing: 17 → 0, exit 0.
- **B3 (credential-at-rest hardening):** the connector-credential blob (`connectorAuth.ts`'s single `CREDS_KEY`, used by every connector) was already off `localStorage` but still in plain, unencrypted SQLite (`rusqlite`, confirmed no encryption pragma by reading `kv_store.rs`) — not "OS-backed secure storage," the literal target. Added `src-tauri/src/os_keychain_store.rs` wrapping the `keyring` crate (pinned to the stable v3 API, not the newly-rewritten v4) for Windows Credential Manager / macOS Keychain / Linux Secret Service, with a 3-tier migrate-forward-and-delete waterfall in `connectorAuth.ts` (secure store → legacy SQLite → legacy `localStorage`). **Verified against the real OS credential store, not just unit tests**: a throwaway probe test set a real credential; Windows' own `cmdkey /list` (a tool this session's code never touches) independently confirmed the entry existed under `com.shayan.alphonso`; the delete step was then verified the same way, confirmed gone. A real near-miss was caught before committing: the module was first named `secure_credential_store.rs`, which `.gitignore`'s broad `*credential*` pattern (there specifically to stop real secret files from being committed) silently swallowed — `git status` showed it as neither modified nor untracked. Renamed to `os_keychain_store.rs` rather than weakening that protective pattern.
- **B4 (security regression gates):** audited what already existed before assuming gaps — Tauri command exposure, filesystem traversal, outbound policy bypass, and insecure defaults all already had real, CI-gated test coverage (8 `policy_gate.rs` tests, 6 `workspace.rs` tests, 4 JS policy test files, and `getRuntimePolicySettings`'s defaults already directly asserted). The one genuine gap: `crashLogService.ts`'s `logError()` persisted its free-form `context` argument to durable storage with zero redaction — fixed with deterministic key-name redaction (recursive, circular-safe), explicitly *not* a message/stack content scanner (documented as a bounded scope decision, not overclaimed). Also checked `agentAuditService.ts`'s `logApprovalEvent` — narrow/typed signature, structurally can't leak an arbitrary secret, no fix needed. Checked actual GitHub branch protection via `gh api` rather than trusting an old Ground Truth claim: `required_pull_request_reviews` is not currently set at all, while `enforce_admins` is `true` — flagged as an explicit recommendation for the owner to decide (enabling a required-review count on a single-collaborator repo with `enforce_admins: true` would lock the owner out of merging anything), not applied unilaterally and not silently ignored.

Both B1 and B3/B4 changes were followed by a full local re-verification each time (`cargo check`/`test`/`clippy`/`fmt`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and a full `npm test`), including re-running a file in isolation once to confirm an apparent failure was resource contention (a `vitest-pool` worker-start timeout under heavy concurrent `cargo` activity) rather than a real regression before trusting the "all clean" result.

**Section D — D3 closed, D1/D2 marked `BLOCKED` with named dependencies, D4 was already `[x]`.**
- **D3 (Boardroom deferred items):** "resource contention" turned out to already be mitigated by design — read `BoardroomChatView.tsx`'s chained-`@mention` loop directly (sequential `await`, never `Promise.all`) and cross-checked against the original Phase 4 design doc, which states this was a deliberate choice to keep local-LLM contention modest. The other 4 deferred items (cards, regenerate/diff, voice input, mobile parity) are genuine feature additions outside this session's bug-fix/hardening scope — each given an owner and target per the task's own "scheduled with an owner/date" acceptance path, rather than built unreviewed at the tail of a long session or left as an unbounded label.
- **D1 (live-verify the signed updater) and D2 (verify iOS pairing + Cloud Voice on physical devices) — both marked `BLOCKED`, not faked, not silently dropped.** D1 genuinely requires tagging and publishing a real signed public GitHub release, then installing that real artifact — a visible, hard-to-reverse action on a real release surface, categorically different from a branch/PR code change; not attempted without the owner's explicit go-ahead regardless of this session's general autonomous-execution instruction, since publishing software to end users isn't a class of action blanket autonomy covers. D2 genuinely requires a physical iPhone/iPad and Cloud Voice device-enrollment access this Windows dev environment does not have — the same category of real-device testing that caught the actual "Could not form websocket URL" pairing bug in an earlier session (this file, §11 history), which no code review or simulator could have found. Both recorded `BLOCKED` with the specific missing dependency named, per this plan's own status vocabulary.

**Commits (branch `fix/truth-first-plan-abcd`, in order):** `873e4c5` (C2/C3), `ce38d3b` (A1 doc-count fixes + baseline), `51c2f02` (B1 audit triage, also closes A1), `1076075` (B3 OS keychain), `086e4ee` (B4 secret redaction), `5345e3b` (D3), `03a33c2` (D1/D2 blocked). All pushed to `origin/fix/truth-first-plan-abcd`; no direct push to `main` at any point. PR not yet opened as of this entry — see the session's final summary for next steps.

**What's still genuinely open after this pass:** D1 and D2 (blocked on owner decision / physical hardware, as above); E2 (generated release evidence) and E3 (stale-doc reconciliation) were not in scope for this pass (user asked for A, B, D specifically); C2's `licenseService.ts`/other-non-connector-secret scope was explicitly not extended to (documented in the C2/C3 evidence as a scope decision, not an oversight); the review-requirement gap B4 found is a named, un-actioned recommendation, not a fix.

## 11.19 Full-repo bug audit + 134-finding fix pass (2026-07-26)

User requested a full line-by-line bug audit of the entire repo, then a coordinated fix pass. 6 parallel subagents audited ~420 files across 6 groups:
- **G1** (Backend core — Rust/Python/Gateway): 67 files, 100% coverage — 15 findings
- **G2** (Frontend services — 172 services, agents, hooks, lib, contexts, types): 171/172 services read line-by-line (99.4%) — 23 findings across initial + follow-up pass. chromaDbService.ts reviewed clean.
- **G3** (UI/components/iOS Swift): 52 files, 100% coverage — 16 findings
- **G4** (Backend/service tests): 65 files, 100% coverage — 21 findings
- **G5** (UI/e2e tests): 48 files, 100% coverage — 17 findings
- **G6** (Config/CI/scripts): ~60 files, 100% coverage — 40 findings

**Total: 134 verified findings** — see `audits/2026-07-26_FullBugAudit_Audit.md` for complete severity breakdown (the summary counts in the Ground Truth doc should be verified against that register; see the audit doc for all F-C-001 through F-C-006 critical findings and the full severity distribution). Full reports in `audits/2026-07-26_FullBugAudit_Audit.md`, `audits/2026-07-26_Alphonso_Group1_BackendCore_Audit.md`, `audits/2026-07-26_G2FrontendBusinessLogic_BugAudit.md`.

**Fix pass (same session):** 5 specialized subagents dispatched in parallel:
- **SA1 (G4 tests)**: 12/12 test defects fixed — mock paths, missing vi import, tautological assertions, async mismatch
- **SA2 (G5 E2E/UI tests)**: 17/17 findings fixed — conditional guards removed, brittle selectors replaced, dev paths eliminated
- **SA3 (Code bugs)**: 16/18 Critical/High/Medium bugs fixed — agentBrainService command injection RCE patched, ChatGPT streaming handles both OpenAI+Anthropic, CSP hardened, 12 medium bugs (race conditions, resource leaks, type casts, spread order, etc.)
- **SA4 (CI/Config)**: 19/20 findings fixed — 100+ actions pinned to SHAs, iOS cert pipeline aligned, Dockerfiles non-root, policy.yaml synced, 11 missing env vars added
- **SA5 (iOS/Rust)**: 15/15 findings fixed — .onChange modernized, timing-safe comparisons, VAD dedup, WebSocket exception handling

**Notable corrections from audit:**
- `parallelExecutionService.ts` — was already clean (no race condition in current code)
- `searchService.ts` — false positive for SSRF (only does local memory search)
- Real SSRF risk was in `hectorResearchService.js` — now has isAllowedUrl() validation guard

**Verification after fixes:**
- ESLint: clean (exit 0)
- Build: successful
- Tests: count per CI run (`npm test` — 3,758 tests across 255 files per package.json); see CI run results for exact pass/fail counts
- 79 files modified, +3,486 / -340 lines
- Branch `fix/audit-134-bugfixes` → PR #124

**Still open after this pass (tracked in TRUTH_FIRST_EXECUTION_PLAN.md):** F2 (CORS config in voice backend), F3 (Supabase service-role-key exposure), G-T11–G-T20 production-readiness backlog, D1/D2 (blocked on owner/hardware), voice Python auto-install, iOS CI test step, function-level coverage gap.

## 11.25 UI-redesign branch pointer (2026-09-08) — not a `main` update, cross-reference only

This file tracks `main`'s shipped/verified state and, per this file's own earlier trust-caveat note, is already known to be behind `CLAUDE.md`'s more current narrative log — reconciling that full gap is out of scope here. This entry exists only so a reader of this file knows a separate, active workstream exists: an isolated UI/UX redesign on branch/worktree `ui-redesign/phase0-discovery` (never merged to `main` without explicit request). Its full, continuously-updated record lives in `docs/ui-redesign/bug-log.md` (numbered findings, currently through #128); its most recent session summary — including a `main`→branch merge bringing in the CALL-E connector and Hector research-synthesis work — is in that worktree's own `CLAUDE.md`, dated 2026-09-08. **Correction, 2026-09-09: this entry is now stale — the redesign HAS shipped.** PR #237 merged `ui-redesign/phase0-discovery` into `main` on 2026-09-08 (merge commit `b324cce`, confirmed on `origin/main` via `git merge-base --is-ancestor`). Do not trust "nothing in this redesign work has shipped" going forward — see §11.26 below for current state.

## 11.26 Smart Installer v1.1 backlog (O2 bundling + boot-load, full WCAG sweep, live-verified) + repo state as of 2026-09-09

Branch `feat/smart-installer-v1.1` (forked from `319ce9d`, the PR #233 Smart Installer merge commit). **Merged into `main` 2026-09-09 as PR #238 (`f3cdb03`) — see §11.27 for the release this shipped in.** Real work across several sessions, most of it live-verified rather than only unit-tested:

- **Dependency Bundling Plan O2 (starter model bundling) — closed.** `scripts/fetch-starter-model.mjs` fetches the exact `STARTER_MODEL_TAG` model (read directly from `setupFlowService.ts` source) from Ollama's own registry API and stages it into `src-tauri/vendor/starter-model/` in Ollama's real on-disk model-store layout — self-verifying since each blob's filename is its own sha256 digest. Wired into `tauri.conf.json`'s `bundle.resources` and all 5 CI job sites (`ci.yml`'s Windows/macOS/Linux desktop builds, `release.yml`'s Windows/Linux release builds) after explicitly flagging and getting sign-off on the real recurring ~1.9GB-per-CI-build cost this adds. Boot-time loading (`runtime_load_bundled_starter_model` in `runtime_manager.rs`, using `ollama create -f Modelfile` against the bundled local blob instead of a network pull, with network fallback in `setupFlowService.ts`'s `installComponent()`) was designed only after hand-verifying the underlying technique for real (wrote a real Modelfile, ran `ollama create` against the bundled blob, confirmed via `Get-NetTCPConnection` that every connection was loopback-only, got a real generated chat reply) — `cargo check`/`clippy -D warnings`/`fmt --check`/`test` (154 passed, 0 failed, 1 ignored) all clean. **Real, disclosed limitation: this whole path has never been exercised by an actual packaged build.** `cargo run` (dev mode) never runs `tauri build`'s resource-bundling step, so `vendor/starter-model`/`vendor/ollama` never populate the dev binary's resource directory at all — a live `npm run tauri dev` walkthrough of Setup can only ever exercise the network-pull fallback path, never the new bundled-load code. Testing the real O2 code path requires a real NSIS/AppImage build from a tagged release.
- **Full WCAG sweep across non-Setup surfaces — 4/5 surfaces closed.** Extended `e2e/a11y.spec.js` to scan Chat/Settings/Automation/Boardroom (all now genuinely clean, permanently enforced) plus AI Runtime Manager (one real, still-open alpha-overlay color-contrast finding on `--accent-muted`/`--agent-*-glow` tokens, tracked as `test.fixme` with full data inline rather than blind-patched or silently skipped). Also completed the earlier `--accent-contrast` token fix's sweep — found and fixed ~16 more `text-white`-on-`bg-[var(--accent)]` call sites it had missed (`ApprovalPanel.tsx`, `CompanionPairingPanel.tsx`, `EcosystemMaturityPanels.tsx`, `FilesView.tsx`, `GuidedTour.tsx`, `NotionSyncPanel.tsx`, `OllamaPreflightPanel.tsx`, `OperatorDashboard.tsx`, `SettingsView.tsx` x6, `WorkflowBuilderView.tsx`), plus 7 Settings toggle switches missing `aria-checked` (a real `undefined`-vs-`false` boolean-attribute bug, not a JSX oversight) and 8 unlabeled form fields across Settings/Boardroom.
- **Linux CI now verifies the AppImage actually contains the bundled Ollama binary** — both `ci.yml` and `release.yml`'s Linux jobs previously only checked that `linuxdeploy` exited 0; now they extract the built AppImage and assert the real `ollama` binary is present and non-trivially sized.
- **First real `npm run tauri dev` end-to-end walkthrough (2026-09-09), across two sessions.** Past the Application Control policy that had previously blocked every attempt to run a freshly-compiled binary on this dev machine (3m02s clean build, `target\debug\app.exe` ran without incident both times) — Boot Ritual Intro (visually confirmed on a second, deliberate look: clean emblem, animated cyan glow/pulse/scanline sweep, readable HUD text, correct auto-advance), Intent Selection, Recommended Setup (correctly detected the already-locally-present `llama3.2:3b` as installed), and the custom Agent Grid. **Real live bug found and fixed:** already-installed optional agents (Miya/Maria/Marcus on the test machine) rendered an unchecked, still-clickable checkbox next to "Already installed" — functionally inert either way, but visually misleading. Fixed to match Alphonso's own checked+disabled treatment (`AgentGrid.tsx`), hot-reloaded into the live session and screenshot-confirmed, with a new regression test. Clean shutdown both times (exit code 0). One benign, pre-existing, unrelated issue surfaced: Voice OS repeatedly failed to bind port 8766 in a retry loop (something else already held it) — not investigated, not a regression from this branch's work.
- **`main` merge-conflict check (2026-09-09):** `main` has advanced 3 commits past this branch's fork point (`#239` iOS `VoiceView.swift` only, `#240`/`#242` a new `deploy-cloud-voice.yml` workflow) — `git merge-tree` against the correct fork point confirms zero conflicts, completely disjoint file sets from anything this branch touches.
- **Still genuinely open, not started this session:** O4's full claim (a real packaged installer working fully offline, as opposed to this dev machine's pre-existing system Ollama, which is all that's been verified so far) still needs a clean VM or a machine without this one's Application Control block; PY1–PY5 (bundle a Python interpreter + native wheels for Voice OS) and X1–X5 (clean-VM acceptance testing, CI polish, published sizes, update strategy, `GETTING_STARTED.md` rewrite) from the Dependency Bundling Plan; the macOS release pipeline (explicitly deferred by the user's own 2026-09-07 decision, no `build-macos` job exists in `release.yml`).

Full narrative, exact commit SHAs, and verification commands for every item above: `docs/DEPENDENCY_BUNDLING_PLAN.md`'s O2 entry and `docs/governance/DEFERRED_WORK.md`'s 2026-09-08/09-09 entries.

## 11.27 v2.8.0 tagged and released (2026-09-09) — the release this whole session's work was building toward

User's explicit reasoning for cutting a real release rather than continuing to test against this dev machine's pre-existing system Ollama install: the O2 bundled-model boot-load path (§11.26) can only ever be exercised by a real packaged build, since `cargo run`/dev mode never runs `tauri build`'s resource-bundling step — `vendor/starter-model`/`vendor/ollama` never populate the dev binary's resource directory at all. A real installer is also the only way to test CALL-E, the Smart Installer, and the UI/UX redesign together as an actual end user would experience them, rather than as separate dev-mode sessions.

**Sequence, in order:**
1. **Merge-conflict re-check.** By the time PR #238 was ready, `main` had advanced 2 more commits past the earlier check in §11.26 (`#243`/`#244`, both `voice/cloud-backend`-only) — re-confirmed zero overlap with anything PR #238 touched.
2. **CI on PR #238 caught two real bugs local test runs had missed** — see the "PR #238 CI caught two real bugs" entry in `docs/governance/DEFERRED_WORK.md`'s 2026-09-09 section for full detail: a strict-mode Playwright locator fix that never made it from a throwaway verification script back into the real committed `e2e/a11y.spec.js`, and a genuine color-contrast bug on a Boardroom message timestamp that only surfaced once the locator fix let the real assertion run. Both fixed, verified against a fresh `vite build`, pushed.
3. **A first `gh pr merge` attempt failed** with "6 of 6 required status checks are expected" — `mergeStateStatus` was `BEHIND` (branch protection requires checks to be validated against an up-to-date branch; `main` had moved since PR #238's checks last ran). Fixed via `gh api .../pulls/238/update-branch` (GitHub-side merge of `main` into the PR branch), which triggered a fresh, real CI run rather than reusing stale check results.
4. **All 6 required checks passed on the updated branch** (Test & Build, Rust Tests & Clippy, Secrets Scan, Doc Count Freshness, both `gate` jobs, Playwright E2E Smoke Test) — confirmed via `gh pr checks 238` before merging, not assumed. Merged via `gh pr merge 238 --merge` → `f3cdb03`.
5. **Version bump 2.7.1 → 2.8.0** across all 4 required locations (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`'s `app` entry — the last regenerated via a real `cargo check`, not hand-edited) on a new branch `chore/release-v2.8.0`, plus this doc pass: `docs/CHANGELOG.md` (the 4 stacked `[Unreleased]` sections from CALL-E/Smart-Installer/UI-redesign/this-branch's-own-work consolidated under one `[2.8.0]` header, each kept as its own dated sub-section rather than merged into one paragraph), `README.md`/`AGENTS.md` version-string references, and this file's own header + §11.26 update.
6. **Tag `v2.8.0` pushed against the resulting `main` commit**, triggering `release.yml`'s real signed Windows/Linux build-and-publish pipeline.

**Not yet confirmed at the time of this entry:** whether the real build succeeds, whether the published installers actually contain the bundled `vendor/starter-model`/`vendor/ollama` content, and — the actual point of this whole release — whether a fresh install genuinely works fully offline using only bundled content, exercising the O2 `runtime_load_bundled_starter_model` code path for the first time ever outside a hand-verification of its underlying technique. Update this entry (or add a new one) once the release build completes and the user has installed and tested it.

## 11.28 Pre-launch all-angle audit + fix pass (2026-09-30)

Private audit: `audits/private/2026-09-30_Claude_PreLaunchAllAngle_Audit.md`. Its verdict was **not launch-ready**: six launch blockers and four high-severity issues. Fixes landed on branch `fix/prelaunch-audit-2026-09-30`:

- **Windows desktop CI was red on every `main` push since 2026-09-16.** `ci.yml` still bundled the ~1.9GB starter model into the Windows NSIS build, which overran makensis's ~2GB mmap ceiling. `release.yml` already skipped the model on Windows and macOS, so shipped releases were never affected; `ci.yml` now matches it.
- **Launching free.** Premium connector gating is inert while `LICENSE_TRUST_KEY` is `null` (`isPremiumGatingEnabled()`), and approving an action no longer bypasses the license check. `docs/PRICING.md` was rewritten: it had described prices, a 14-day trial, a Lemon Squeezy checkout and a "BSL 1.1" license, none of which existed.
- **Cloud Voice hardening.**
  - Invite-only access (`VOICE_ACCESS_MODE`, `VOICE_ALLOWED_EMAILS`).
  - Per-user burst and daily quotas (`voice/cloud-backend/app/quota.py`) on the NVIDIA-billed endpoints.
  - The Tutor lesson-context cache is keyed per user, so one user can no longer read another's learner history by reusing a session id.
  - iOS no longer auto-creates accounts (`create_user: false`).
  - The deploy workflow now runs the backend tests first and refuses a task definition without an access policy.
  - A new `Cloud Voice & Gateway Tests` CI job runs tests that had never run in CI.
- **App Store readiness.** In-app account deletion (`delete_own_account` Supabase function + a confirm dialog on the iOS Voice screen) and `PrivacyInfo.xcprivacy`.
- **The mobile-companion LAN server is opt-in.** It is off by default, with an Enable/Turn off control in Settings → Remote Access, persisted in `companion_enabled.json`. Turning it off stops the listener and drops paired sessions.
- **Command-execution policy.**
  - `policy_gate.rs` now fails closed per program. `node -e`, `python -c`, `npx <pkg>`, `npm publish`, git `--upload-pack`/`-c`/`ext::`, and curl/wget/docker/URL openers are refused. AI-planned commands in Jose's code-generation path reach this check, so it is the real boundary.
  - Removed the unused, ungated `executeWithTools` loop.
  - Project context is read through `read_workspace_file` instead of `node -e`.
- **Silently broken features fixed.**
  - `verifyCommandExecution` now maps Rust's `exit_code` to the `exitCode` every caller read. It had always been `undefined`.
  - git `add`, `commit` and `revert` are allowed, so agent auto-commit and `gitService` revert work for the first time.
  - Hector now honors the configured Ollama endpoint.
- **Smaller fixes.**
  - `save_image_to_folder` rejects absolute filenames.
  - The gateways use lease + ack drain (a failed poll no longer loses messages), accept the drain token only in a header, and rate-limit on the proxy-appended `X-Forwarded-For` hop.
  - A new `policyYamlSync.test.js` fails if `policy.yaml` and the embedded DSL rules drift.
- **Legal and release.**
  - NOTICE credits Ollama and Llama 3.2 ("Built with Llama"), and `fetch-starter-model.mjs` ships the model's own license layers as `MODEL_LICENSE.txt`.
  - Installers show `legal/EULA.txt`. Drafts were added for `legal/EULA.txt` and `legal/PRIVACY_POLICY.md`; both have placeholders that need legal review.
  - macOS `minimumSystemVersion` is now 11.0 (releases are Apple Silicon only).
  - Release notes no longer link a private repository.
- **Docs.** Fixed a long-standing Voice OS port error in the manual-start docs (8765 → 8766) and added the now-required `VOICE_OS_TOKEN`. Updated PRICING, USER_MANUAL, IOS_SETUP, TROUBLESHOOTING, GETTING_STARTED, both gateway READMEs, the Cloud Voice deploy doc, CLAUDE.md and the deferred-work register.

- **CodeRabbit review round (PR #269), same day:**
  - Companion "Turn off" now uses a persistent watch signal. It can't be missed by a listener that isn't waiting yet, it closes every open socket (including idle paired phones), and it waits for the listener to stop before returning.
  - The git policy also rejects abbreviated long options (`--upl=`) and attached or bundled short `-u`/`-c` options.
  - pip rejects URL/VCS requirements and `--find-links`/`-f`.
  - ffmpeg is limited to `-version` through the command runner.
  - Account deletion no longer fails for users with Atlas audit receipts: receipt `actor_user_id`/`challenge_id` became `ON DELETE SET NULL`, so receipts survive anonymized.
  - An invalid `VOICE_ACCESS_MODE` now marks Cloud Voice not-ready instead of silently meaning invite-only, and the deploy guard rejects it.
  - iOS keeps auth state intact when a deletion fails and shows the delete option whenever a session exists.
  - The privacy manifest no longer declares audio collection (only text leaves the app).
  - The companion toggle shows errors in both states.
  - Docs: `--no-access-log` in manual Voice OS commands, the USER_MANUAL heading numbers now match its table of contents, and gateway restart-loss is stated.
  - **Deferred:** requiring explicit approval before AI-planned commands that execute workspace code (`npm run`, `cargo test`, `pytest`). That needs an approval step inside Jose's pipeline and is tracked in DEFERRED_WORK.
**Still open and owner-dependent:**
- Legal review of the EULA and privacy policy drafts.
- Applying the new Supabase migration and disabling public sign-ups.
- Setting `VOICE_ALLOWED_EMAILS` on the ECS task definition.
- Restoring Cloud Voice infrastructure. On 2026-09-30 the load balancer behind `voice.obsidianmedia.online` did not resolve, and the iOS app's Supabase project was paused.
- Windows and Apple code signing.
- Intel macOS builds.
- Crash-reporting provider.
- Making the Windows desktop CI job a required check.

## 11.29 False-confidence tests fixed; bridge tests now run in CI (2026-10-06)

- **`bridge/tests/server.test.js` never ran in CI and did not parse.** `npm test` was `run-vitest-programmatic.mjs src`, so `bridge/` (included by `vitest.config.js`) was skipped. The file also contained TypeScript syntax (`let serverModule: any;`) in a `.js` file. Fixed the syntax, replaced the two `expect(true).toBe(true)` tests with real ones (port env override and default, default model/URL, `OLLAMA_MODEL`/`OLLAMA_BASE` overrides, 400 on missing `topic`), and changed `test`/`test:watch` to `... src bridge`. 13/13 pass.
- **`src/test/services/companionIntegration.test.js` was tautological.** It mocked `invoke` and asserted on the mock's own values. Rewritten as 9 contract tests that read the real sources: every `companion_*` command the frontend invokes is in `generate_handler!`; every registered command is a defined `#[tauri::command]`; every JSON-RPC method Swift sends is handled by `companion_router.rs` (or `authenticate`); the Rust port matches the port hard-coded in the three Swift files; the mDNS type matches; Voice OS port != companion port. Proven able to fail with 5 source mutations (each caught, then restored).
- **`npm test` was a no-op gate.** `run-vitest-programmatic.mjs` passed `'run'` as vitest's mode argument (it must be `'test'`), so vitest 4 collected files but executed no test bodies; a failing test reported passed and exit code was always 0. Fixed (mode `'test'`, exit code propagated, `express` alias and 30s `testTimeout` mirrored from `vitest.config.js`). `test:coverage` (real vitest) was the only effective gate and still scopes to `src`.
- Verification: real `npx vitest run src bridge --pool=forks` 406 files / 5,563 tests passed; `tsc --noEmit` clean; `verify-doc-counts.mjs` clean.

## 11.30 Hermes session continuity completed (2026-10-06)

All per-agent `generateAgentLlmResponse` call sites now pass a `sessionId` keyed on their unit of work (packet id, report id, watched file, or companion agent), resolved via `resolveSecureSessionId`. Calls with no natural id pass none. Guard: `src/test/hermesSessionContinuity.test.js`. Not live-verified against a running Hermes profile beyond the 2026-08-21 Hector check.
## 11.31 Skill-pack taxonomy depth is complete for all 9 agents (correction, 2026-10-06)

Earlier docs (Sprint 3 entries, CLAUDE.md, ALPHONSOTOTHEMOON.md) said Alphonso, Maria, Marcus, Echo, Sentinel and Nova still had one default pack each. That was stale. Counting `ownerAgent` over `src/services/skillPackContent*.ts` and `skillPackWorkflowData.ts` gives alphonso 18, echo 17, hector 21, jose 21, marcus 17, maria 18, miya 21, nova 17, sentinel 17 agent-owned packs, each file covered by a `skillPackContent<Agent>.test.ts`. Still deferred: module-system convergence (`modules/` vs skill packs) and a full marketplace model.

## 11.32 Memory knowledge graph Phase 4 (governance) implemented (2026-10-06)

The graph previously only grew. `memory_graph_prune` (`src-tauri/src/memory_graph_prune.rs`) now removes expired graph rows in one SQLite transaction, with a dry-run mode and an abort when more than 50% of nodes would go. The policy numbers come from `src/services/memoryGraphRetentionService.ts` (`GRAPH_RETENTION`): receipts/packets 90 days, boardroom messages/research reports/sources 180 days, unconfirmed inferred edges 30 days, nodes read in the last 14 days protected. Permanent memory items, nodes one hop from them over non-inferred edges, and escalated/acknowledged boardroom threads are never removed. Memory items themselves are never touched, only graph rows.

Verified: 43 Rust tests in `memory_graph*` (cargo test --lib memory_graph, 22 of them new) and 20 new TS tests pass; `cargo fmt --check` and `cargo clippy -- -D warnings` clean. Not verified: a run against a real populated graph. Use Settings → Memory → "Preview cleanup" first; "Clean up now" is disabled until a fresh Preview, and the automatic daily pass is off by default and cannot be switched on before a Preview. Interpretations of ambiguous spec wording are listed in `docs/governance/DEFERRED_WORK.md` (2026-10-06 Phase 4 entry).

## 11.33 Desktop end-to-end testing pass; v2.9.0 (2026-10-12)

**What changed in how this app is verified.** Until this pass, every end-to-end test (`e2e/`, Playwright) ran the Vite web build with the Tauri bridge mocked by `e2e/tauri-mock.js`. The Rust backend, the real window origin, spawned processes and the OS keychain were never exercised. There is now a second suite, `e2e-desktop/`, that drives the real built binary through `tauri-driver` (WebdriverIO). Run it with `npm run test:e2e:desktop` after `npm run tauri build -- --debug --no-bundle`.

**Test isolation is real, and debug-only.** `wdio.conf.mjs` sets `ALPHONSO_E2E_PROFILE` per spec file. A DEBUG build honors it through `utils::e2e_profile()`: the Tauri identifier becomes `com.shayan.alphonso.e2e.<profile>` (moving every app-data and config path), and the runtimes folder and keychain service name get the same suffix. A release build ignores the variable. `isolation.e2e.mjs` fails if the app is ever on real data. Before this existed, a chat spec wrote test messages into the developer's real chat history.

**Verified working in the real desktop app (53 checks, 16 spec files, one run):** boot and every sidebar page; a real backend call; KV persistence across an app restart; the command policy refusing `curl`, `node -e`, `python -c`, git `-c`; first-run Setup up to the recommendation screen; chat with a local Ollama model; Hector research with a real source fetch and a synthesized report; a Boardroom agent reply; Runtime Hub stop and restart of Ollama; a Creative Studio package; Content Studio copy and image generation through a real ComfyUI; Jose approvals (pending, approved, executed); the Project Execution approval gate; a visual workflow built, saved and run; the separate Coach window.

**Desktop-only bugs this found (all fixed in 2.9.0).**
- *Window origin refused by local servers.* On Windows the Tauri window's origin is `http://tauri.localhost`. Ollama's default allow-list does not include it (403), and ComfyUI refuses any foreign `Origin` at all (403). The model list still loaded through a backend fallback, which hid the Ollama case. Fixes: an Ollama that Alphonso starts gets `OLLAMA_ORIGINS` extended (`runtime_manager.rs`; http/https entries only, since a `tauri://` entry makes Ollama panic on startup); ComfyUI calls go through `comfyui_proxy.rs`.
- *Two process trackers.* `lib.rs` created one `RuntimeManager` for boot auto-start and another as command state, so Stop could not see an auto-started tool. A racing start request also spawned a second Ollama whose PID overwrote the real one.
- *Silent template fallbacks.* Creative Studio discarded any model reply that was not bare JSON. Content Studio never passed model settings into a job, so it never called the model at all. Both showed stock text as if generated.
- *Storage overflow.* A Content Studio job stored the base64 image preview many times; saving it threw `QuotaExceededError` unhandled and the job vanished.
- *Release builds broken on `main`.* Dependabot's `tauri-plugin-opener` 2.7 bump moved the `tauri` crate to 2.12 while `@tauri-apps/api` stayed on 2.11. Tauri's build refuses a minor mismatch. The desktop build jobs do not run on PRs, so the PR was green. `@tauri-apps/api` and `@tauri-apps/cli` are now on 2.12.

**Numbers as of the current priority-hardening branch (from `scripts/shared/counters.mjs` and CI):** 5,614 unit tests across 410 files (src + bridge); 192 Rust unit tests; 124 Tauri commands across 40 Rust source files; `lib.rs` 877 lines; 205 services; 135 components; 21 hooks.

**How 2.9.0 was actually released (2026-10-13).** Tag `v2.9.0` is at `4987705`. `release.yml`'s macOS job failed twice (first the unsigned-signing fallback, fixed in #293; then the bundled-Ollama check), and its publish job needs all three builds, so the workflow never published. The Windows and Linux installers from the rerun were published by hand with a `latest.json` covering those two platforms. macOS is not in the release. Verified after publishing: the release is marked latest, the installer link returns the file, and the updater endpoint serves 2.9.0. Not verified: running the installer, and the 2.8.0 to 2.9.0 auto-update.

**Still open:** see the 2026-10-12 entry in `docs/governance/DEFERRED_WORK.md` (13 items, including: a user-started Ollama is still refused by the window; an intermittent first-model-call failure; the desktop suite is not in CI).


## 11.34 PR 304 merged; repo-actionable deferred batch (2026-10-21)

**PR 304 (Codex priority hardening) was squash-merged as `4f36fe3`** after every required check and the non-required Desktop E2E passed on its final head. Codacy and CodeFactor (advisory, not required) still reported issues; their detail pages could not be read without a login. The deferred-work register was reconciled against the code first: 41 entries were marked done, superseded or partly done, and 39 open threads were listed at the top of `docs/governance/DEFERRED_WORK.md`.

**The repo-actionable batch that followed (13 items, branch `fix/deferred-code-batch-2026-10-21`)** is recorded entry by entry at the top of the register. What changed that future sessions need to know:
- *Ollama desktop chat fallback.* `ollama_chat` (new Tauri command, 125 total) posts the real turns to `/api/chat` from Rust when the window is refused. Before, the fallback flattened the chat into one `ollama_generate` prompt.
- *The process plugin was missing.* `tauri-plugin-process` is now a dependency and registered (`process:allow-restart` only). Without it `relaunch()` after an update failed on macOS and Linux.
- *Version checks on PRs.* `scripts/verify-tauri-versions.mjs` runs in Test & Build. It is the PR-time guard for the release breakage described in §11.33.
- *One cargo-audit ignore list.* `.cargo/audit.toml`, read by `scripts/cargo-audit.sh` from CI and from the new weekly `security-audit.yml`.
- *Perplexity uses its Search API.* The old `/chat/completions` call used a retired model; Perplexity ended Sonar Chat Completions support on 2026-09-27. Not live-tested.
- *Setup disk checks know which drive is which.* `setup_scan_hardware` returns `diskMount` and `ollamaModelsDirMount`.

**Numbers after the batch (from `scripts/verify-doc-counts.mjs`):** 411 test files; 199 Rust unit tests; 125 Tauri commands; `lib.rs` ~834 lines.

**Still open:** the owner-gated and live-only threads at the top of the register (Cloud Voice DNS, Apple and Windows signing, native Ollama acceptance, CALL-E live call, legal documents, branch-protection decision, and the never-run-live items).

## 11.35 v2.10.0 release prep; macOS back in the release (2026-10-21)

**PR 305 (the 13-item deferred batch) was squash-merged as `399ef43`** once every required check passed. Its Desktop E2E job failed once on a stale-element timing flake in `project-execution.e2e.mjs` and passed on rerun; the same commit's manual CI run had already passed every job, including all three desktop builds and the new NSIS check (`Found bundled ollama\ollama.exe (36525448 bytes)`).

**Why 2.9.0 had no Mac build, corrected.** An earlier note blamed the bundled-Ollama check. The real sequence: the first tag run failed at `codesign -s ""` (fixed before the second run); the second failed in the DMG content check in 90 ms with no message. The rewritten check's first dry run (run 39675626882) showed both halves: the updater archive contains `Contents/Resources/ollama/ollama` (68,255,232 bytes), and `hdiutil attach` prints "attach canceled" because the DMG carries the EULA (`bundle.licenseFile`) and asks the user to agree. The runtime was never missing; the check now answers the agreement with `yes`.

**What `release.yml` does now (owner decision 2026-10-21: ship macOS unsigned rather than not at all).**
- Signing starts only when `APPLE_CERTIFICATE` is set. The repo has `APPLE_TEAM_ID` alone (shared with the iOS pipeline), which the PR 304 guard treated as a partial set and failed every macOS release on.
- The DMG check now checks the updater archive (what auto-update installs) and the DMG (what new users download), retries the mount, and names what failed.
- PR 304's hard stop that refused to publish any platform without a notarized macOS build is a warning now. The release notes say whether the Mac build is notarized and, if not, how to open it the first time.
- A manual run takes `publish` (default off): it builds and checks all three installers and publishes nothing. Used before tagging 2.10.0.

**Version 2.10.0** in `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `Cargo.lock`. CI test totals at `399ef43`: 5,645 JS tests in 412 Vitest files; 206 Rust tests (1 ignored).

**Still open:** Apple Developer ID signing (five `APPLE_*` secrets, see `docs/MACOS_SIGNING.md`); running the published installers; auto-update from 2.8.0 (macOS) and 2.9.0 (Windows/Linux) to 2.10.0.

---

## 11.36 Jose redesign, phases 1–6b (2026-10-23)

Jose now answers or plans every request, from every caller. Full detail: `CLAUDE.md`'s Jose rows and `docs/CHANGELOG.md`.
- **Phase 1:** plans are step graphs (`jose/stepGraph.ts`: agent, action type, effects, needs; at most 50 steps); one permission table for the 9 agents (`jose/agentPermissionTable.ts`); approval by effect, not by words (`jose/joseEffects.ts`: spend, publish and delete always ask, even with Approval Mode off; Settings → General → What asks first).
- **Phase 2:** Jose's model decides answer or plan (`jose/joseDecision.ts`) and writes the plan from a fitting template or fresh (`jose/josePlanner.ts`); every plan is checked, fixed once, else falls back with a note.
- **Phase 3:** the Requests board on the Orchestrator page, plan-first cards in Chat for bigger requests, plan editing, user templates.
- **Phase 4:** reviews send work back (2 rounds), agents ask for help, a step can get a larger model or, when allowed, a paid model (`jose/joseSpend.ts`, with a monthly cap); approving carries the request on.
- **Phase 5:** Telegram approvals with buttons, Carry on for interrupted requests, expiry of waiting requests, Echo saving decisions.
- **Phase 6a/6b:** every caller goes through Jose (Telegram, WhatsApp, the phone, schedules, Boardroom's thread actions, workflows); a Miya Studio project is one Jose request.

Checked: unit tests, desktop specs (`jose-planner`, `jose-board`, `jose-loops`, `jose-away`, `jose-callers`), Telegram live with the owner's bot. Not checked with real accounts: the paid models.

## 11.37 Miya's content factory, phases 1–4c (2026-10-22 to 2026-10-25)

Merged one PR per phase (phase 4b: PR 353; phase 4c: PR 354, `34e97b4`). Each phase's design and plan are in `docs/superpowers/specs/` and `docs/superpowers/plans/` (dated 2026-10-22 to 2026-10-24); what each leaves open is in `docs/governance/DEFERRED_WORK.md`.
- **1:** projects per brand, research, script and reviews, scenes, thumbnails, campaign, quality gate.
- **2a / 2b:** the finished video (Kokoro, MusicGen, stock clips, FFmpeg assembly, captions); AI clips for the main moments (local video models, Runway).
- **3a–3d:** publishing on YouTube, Instagram and Facebook; the Calendar and moving posts; carousels, your own storage, Instagram Login, signing in from Settings; Shorts.
- **4a:** reading each post's numbers, lessons, ideas and post times.
- **4b:** ElevenLabs (voices, sound effects) and Higgsfield (pictures, clips, by name), each asking first with the cost.
- **4c:** brand characters (ComfyUI reference or Higgsfield training) and motion (Higgsfield presets, recordings, files; local motion transfer), plus three 4b fixes.

Checked: unit tests and desktop specs with Zero-Cost Mode on and seeded data. **Not checked with real accounts:** posting, reading numbers, ElevenLabs, Higgsfield (several of its request fields come from third-party descriptions), Runway; the new ComfyUI graphs (character reference, motion transfer) have not run live. The live checks are steps 1–15 in `docs/qa/DESKTOP_QA_COVERAGE.md`.

## 11.39 Agent roles, Part A: one owner per kind of work (2026-10-24)

The owner asked for a deep look at how the agents work together before Jose phase 7. Six of the nine agents never received the work of the steps they depended on (only the request text), so reviews reviewed the request and Marcus posted the step instruction; outputs reached a step keyed by agent; Jose wrote answers himself; Nova researched markets; Alphonso assembled the finished video. Part A (spec `docs/superpowers/specs/2026-10-24-agent-roles-skills-handover-design.md`, plan `docs/superpowers/plans/2026-10-24-agent-roles-part-a.md`):
- **One owner per kind of work.** `AGENT_PERMISSION_TABLE` has no overlapping task-type prefix (tested); each agent has `owns`/`never` sentences used by the planner, help, Boardroom, Simple mode, Hermes and the voice backend. Steps whose owner changed move with a change-log line (`movedTaskTypes.ts`).
- **The hand-over.** `StepInput` (`stepInput.ts`) gives every step the full work it depends on, by step; reviews judge the draft (`reviewStep.ts`); Marcus sends the needed step's text or refuses.
- **Setup instead of hand-off.** A step whose owner can't work waits (`waiting_setup`) with what to set up; Carry on runs it again.
- **The closing summary.** One line per step and "Open on the board." (`joseSummary.ts`).
- **Every path.** Picture requests are a Miya step; voice routes by owner and answers in role; CALL-E calls are Marcus's step; Hermes-backed agents get their role and the board notes it.
Parts B (real skills) and C (Projects, Teams, learning) follow.

## 11.56 The resource manager: memory decides what runs (2026-10-30)

The first of the four phases after QA batch 1 (owner, 2026-10-30; design `docs/superpowers/specs/2026-10-30-resource-manager-design.md`, plan `docs/superpowers/plans/2026-10-30-resource-manager.md`). Before it, nothing measured free memory while the app ran, nothing started a tool when a step needed it or stopped an idle one, and a step that would run out of memory was not held back.
- **Measuring.** The backend's `resource_snapshot` (`resources.rs`: RAM through `sysinfo`, the NVIDIA card through `nvidia-smi`, each tool Alphonso started with its memory, child processes included) and `ollama_loaded_models` (`/api/ps`); else ComfyUI's own report of graphics memory; else "Graphics memory unknown on this computer.", never a guess. One watcher reads every 3 s while a tool is in use, every 30 s otherwise (`idleStop.ts`).
- **Before every step** (`resourceGate.ts`, called by the engine): its need is estimated (an Ollama model's size, a video model's listed graphics memory, then what that kind of step really took, learned from its last runs); it runs when it fits, makes room by unloading idle models or stopping idle tools Alphonso started (your own programs are only asked to unload, never stopped), waits with the reason on the board, in Chat and on Telegram after 10 minutes, or fails at once when this computer can never hold it. A stop ends the wait. Tools a step needs are started first (Ollama, ComfyUI: Alphonso's copy or yours, as Runtime Hub starts it).
- **The queue** lets a second request start beside the first when its first step fits; nothing jumps ahead of a request already waiting. Bug fixed on the way: NVIDIA plans queued behind local ones, since the queue's cloud list said `nvidia` and the provider id is `nvidia_nim`.
- **Idle stop** per tool (ComfyUI 15 minutes by default, everything else Never), set in Runtime Hub's new Memory section, which also shows every running tool and loaded model with its memory and who started it, Stop and Unload, and what is waiting. A meter in the top bar opens it.
- **Checked:** unit tests for every part; the desktop spec `resources.e2e.mjs` (real numbers in the Memory section, the meter, and, when Alphonso's own ComfyUI is installed in the test profile, a ComfyUI it starts listed as started by Alphonso with its idle time saved). Not checked on a real run: a picture step held back and then admitted on a card that is actually full; that needs a long local run.
- Hermes profiles are left to the Hermes gateway phase.

## 11.55 When Windows blocks the bundled ffmpeg (2026-10-30)

The owner chose not to code-sign for launch. Smart App Control refuses unsigned programs in two ways, both seen on the dev machine: the program won't start (OS error 4551, "An Application Control policy has blocked this file"), or it starts and a blocked DLL stops it (exit code 0xC0E90002, no output). `windows_block()` in `media_tools.rs` recognises both, and `run_ffmpeg()` (every ffmpeg run, ElevenLabs' MP3 to WAV too) and `probe()` return `FFMPEG_BLOCKED`: which features need ffmpeg, and that Smart App Control can be turned off in Windows Security but not back on without a reset. Before, the step said "ffmpeg failed:" with nothing after it, or the raw OS error. Test: `tells_when_windows_blocks_ffmpeg` (run by CI; this machine blocks local Rust test binaries). Signing is still open in `DEFERRED_WORK.md`.

## 11.54 QA batch 1, finished: every live account and the whole desktop suite (2026-10-29)

The owner's accounts, typed into Settings by `live-accounts.e2e.mjs` / `jose-telegram-live.e2e.mjs` on CI-built debug apps, with `qwen2.5:7b`. **Passed live:** Slack (one approved post), GitHub (one approved issue, closed after), ElevenLabs (one voice-over within $0.50), Pexels, Pixabay and Coverr (a clip found and downloaded from each), Tavily and Brave (a cited research answer), Notion (one page), ClickUp (one task, marked complete after), Composio (key checked, toolkits listed), NVIDIA NIM and Gemini (a plain answer in Chat each), Telegram (pairing by `/start`, Approve pressed on the phone carried the request on). Higgsfield skipped (owner). No key appeared in any log (counted after every run).

**Desktop suite with `qwen2.5:7b`** (46 files): all pass on this computer except (a) three that need the bundled ffmpeg, which Windows Smart App Control blocks here because its files aren't code-signed (CI passes them), and (b) three that need Hector's free search, refused by DuckDuckGo after a day of runs ("too many searches"; the step says so). The 1.5B CI leg's failures that the 7B run passes are the small model.

**Fixed in this part**, each with a test that failed first: Chat's NVIDIA/Gemini tabs turn on when a key is saved (`onConnectorCredentialsChanged`); no Ollama model name is sent to NVIDIA (the picker, and `useOllamaHealth.js` swapping a cloud model every 30 s); the NVIDIA model search asks four at once, 20 s each (`NVIDIA_PROBE`, `connector_nvidia_request`'s `timeoutSecs`); a plan review is one Maria step (`planReviewOnly()`); help gets real task types only; ClickUp's "Team not authorized" says to check the list ID (`clickupReason()`); a Sentinel review with no findings passes the loop; a late review of revised work is skipped; an unlinked Sentinel check reviews the writing (`inferReviewOf()`); Echo keeps the numbers you gave and never saves `MEMORY_ONLY_INSTRUCTION`; a sentence saying where the text goes goes back to the writer (`deliveryLines()`); Notion and ClickUp aren't paid; Composio and NVIDIA go through the backend. A content-factory test had a backspace where `\b` was meant, so it could never fail.

**Open (owner decisions, `DEFERRED_WORK.md`):** code-sign the bundled ffmpeg (Smart App Control would block voice-overs, finished videos and Shorts for users who have it on); Hector's free search can be throttled, and only a search key in Settings avoids it.

## 11.53 QA batch 1: the live check of 2.10.0 with Telegram (2026-10-28)

The owner ran checks 1a–1c (Approve, `/stop`, Cancel on Telegram) on the installed 2.10.0, with `qwen3:0.6b`. Found and fixed, each with a test that failed first:
- **Start-up jobs had no deadline:** `onIdle` in `useBootEffects.js` used `requestIdleCallback` without a timeout; the Telegram link (and the other start-up jobs) now start within `IDLE_DEADLINE_MS` (3 s). `restartTelegramCompanion()` in `telegramCompanionService.js`, called by Connectors → Telegram's Save & Enable, starts the link with the token saved now.
- **The wrong page in a message:** `NEEDS_OUTPUT_FOLDER` named Settings → General; Output Folder is on Settings → Runtime.
- **Jose copied his example:** `copiedPlaceholders(steps, request)` also names a step whose instruction is one of `PLAN_EXAMPLE`'s (unless the request is about its topic), and `missingAsked()` sends back a writing request planned without an Alphonso, Miya or design writer.
- **Chat's notice was stale:** it read the requests once; it now listens through `onRequestStatusChange()` (which returns a function that stops listening).
- **Very small models:** `src/components/SmallModelNotice.tsx` (`isSmallModel()`, under `SMALL_MODEL_MIN_B` = 3 by the size in the name) next to Chat's picker, under Settings' Active Inference Model and under "Model for Alphonso's code" (owner, 2026-10-28). The owner switched to qwen2.5:7b for the next checks.
- **Found by the desktop runs while doing this:** Echo's meaning cut-off (`MEANING_MIN_SIMILARITY`, now 0.45 from measurements with the real `all-minilm`) and `meaningQuestion()`; Alphonso's run now reports a fix round after the approval (`fix_rounds` artifact and a summary line); the content-publish, Hector and Alphonso desktop specs waited, skipped or asked the wrong way (a new file needs no approval by design).
- **Check 1d (Slack) so far:** "post it to Slack #test" failed before Slack was called: `pickDestination()` used a channel without the model only when it was a saved default, and a model that failed was reported as `NO_DESTINATION`. One named connector with one named `#channel` (Slack, Discord) is now used as it is (`namedChannels()`), and a failed model call is `MARCUS_MODEL_FAILED`. The owner's token was an app-level `xapp-` token: `slackTokenProblem()` / `SLACK_APP_TOKEN_PROBLEM` in `slackConnector.ts` refuse it on Save (`saveConnectorApiKey()` returns false, so `CredentialSection` doesn't say "saved") and in `checkSlackConnection()`.
- **Slack never sent from the desktop app:** `runSend.ts` called Slack with `fetch` from the window, and Slack's CORS answer allows no `Authorization` header, so every send failed ("Failed to fetch"); it now uses `sendSlackMessage()` in `connectorOutbound.js` (backend `connector_slack_send`, with its approval, readiness and policy checks). Measured on 2026-10-28 with a preflight from `http://tauri.localhost`: Discord and GitHub allow it, so they are unchanged.
- **A failed send (owner, 2026-10-28):** a step with the `publish_or_send` effect runs once in `executeAssignmentWithRetries()` (no retries, no larger model), and Marcus's failed send returns `setup_required` with the reason and `SEND_FAILED_CARRY_ON`, so the request waits and Carry on sends it again; "Already sent." stays as it was.
- **The desktop suite runs on the dev machine again** (2026-10-29): a debug build ran under tauri-driver with no Code Integrity block. With qwen2.5:7b, 6 of the 8 agent specs reached passed (chat, agent-roles, agent-skills, hector, maria, marcus) before the run was stopped for low memory. Found: a model's plan could run Nova beside Hector (`novaWaitsForHector()` in `josePlanner.ts` now makes her wait); the planner spec timed out under the memory pressure.
- **Test keychain entries:** every desktop run left its keychain entry (`<service>.e2e.<run id>`) in Windows Credential Manager; `removeTestKeychain()` in `wdio.conf.mjs` deletes the run's own entries after each spec file, and the 30 left from earlier runs were removed (none held a real key).
- **Rust builds blocked on the dev machine** (2026-10-29, afternoon): Windows Smart App Control (Code Integrity policy `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`, event 3077) blocked rustc from loading the proc-macro `zerofrom_derive-….dll` (built 2026-08-26 and loaded fine that morning), so every `tauri` crate reported E0463 "can't find crate"; a freshly built copy was blocked too (`os error 4551`). Not a code problem. The owner chose to keep it on: CI's desktop job now uploads its debug `app.exe` (`alphonso-debug-app-<sha>`, plain run only, 3 days), and the live checks run on that build.
- **Third live run** (2026-10-29, fixed build): ElevenLabs made the voice-over with the owner's key and recorded $0.0081 within the $0.50 cap. Slack reached Slack, which answered `missing_scope` (the bot token lacks a scope it needs to post: on the owner's side). `slackReason()` / `SLACK_REASONS` in `marcus/runSend.ts` now say what to do for Slack's codes, and `claimInWork()` in `maria/mariaWorkReview.ts` drops a "not backed" claim that isn't in the work (the model had returned the answer format's example "the exact claim").
- **Miya Studio after a failed request:** a factory step marked `needs_approval` with `WAITING_FOR_APPROVAL` kept it after its request failed on the board, since only a finished step was saved back. `settleProjectSteps()` in `contentStepRunner.ts`, started at app start by `startContentRequestWatch()` (from `startPostScheduler()`), gives a project's waiting and running steps the request's reason when it ends failed, stopped, cancelled or expired.
- **Second live run** (2026-10-29), with diagnostics: Slack was refused by Alphonso itself (`not_authenticated`): `hydrateScopeToLocalStorage()` in `runtimeLedgerService.ts` writes `alphonso_connector_auth_profiles_v1` back as scope rows (`[{ id: 'auth-slack', … }]`) 4 s after start, and `readAuthProfiles()` spread them as "0", "1", …, so no connector was enabled after any restart; `profilesFromRows()` in `connectorAuth.ts` reads both shapes. ElevenLabs failed after approval with "miya may not: Spend money.": `validateAgentExecutionContract()` checked spending against the permission table only, while `checkPlan()` had Miya's paid steps and paid models as exceptions; both now use `stepMaySpend()` in `stepGraph.ts`, and a step's packet carries its `model`.
- **First live Slack run** (2026-10-29): Alphonso's 7B-written note began with a literal "[placeholder]" (his writing skill asks for one where something is missing); Sentinel held it with a garbled reason and Maria marked the note "not backed" because nothing was researched. `unfilledGaps()` / `unfilledReason()` in `marcus/prepareSend.ts` now send such text back to the writer, and `givenByRequest()` in `maria/mariaWorkReview.ts` lets a claim the request itself makes pass when there are no sources (owner's choice).
- **The live check with your accounts** is `e2e-desktop/specs/live-accounts.e2e.mjs` (by hand; skipped without its settings): it reads the Slack and ElevenLabs keys from files named in `ALPHONSO_LIVE_SLACK_TOKEN_FILE` / `ALPHONSO_LIVE_ELEVENLABS_KEY_FILE`, types them into the test app's Settings, posts one approved message to `ALPHONSO_LIVE_SLACK_CHANNEL` and makes one short ElevenLabs voice-over within `ALPHONSO_LIVE_SPEND_CAP_USD` at `ALPHONSO_LIVE_ELEVENLABS_PRICE_PER_1K`.
- **Still to check live:** the Slack send with a `xoxb-` token, an ElevenLabs voice-over and a Higgsfield picture, with qwen2.5:7b.

## 11.52 QA batch 0: main's local-model check made green (2026-10-28)

The owner chose desktop QA with the deferred items folded in, in batches, before the new phases; batch 0 makes `main` green. The only red job was the desktop run with `qwen2.5:1.5b` (added in Jose phase 7), failing in five specs. Each failure was read from the run's log (run 40531686234):
- **App bugs, fixed with a failing test first:** Echo's meaning search read `http_status` while `OllamaModelsProof` is camelCase (`meaning.ts`; never worked in the app); `isMarcusSendStep()` skipped every `distribution_schedule_posts` step, so a planned send with that type asked before Marcus prepared it (only Miya Studio's steps, which carry `contentStep`, skip it now); a file change in a saved project wasn't code work (`asksForProjectWork()` in `alphonso/projects.ts`, used by `missingAsked()` and the rule plan); a request with two or more kinds of work could be answered directly (`kindsOfWork()` in `joseDecision.ts` plans it by rule); a "which first" request planned without Nova passed (`ASKS_WHICH_FIRST` in `missingAsked()`).
- **Found by the fix itself:** with meaning search working, Echo's `all-minilm` was downloaded in CI, and `chooseDefaultModel()` ("the first installed model" when the chosen one is missing) made it every agent's model; all model steps failed. `isChatModel()` in `src/lib/ollama.ts` (embedding names, or a `bert` family) now filters `chooseDefaultModel()`, the Chat pickers (`ModelSwitcher.tsx`), Jose's offered models (`listInstalledModels()`), Hector's fallback and the Ollama check panel.
- **An outside service changed:** httpbin.org now refuses to redirect to an internal address ("Forbidden redirect target"), so Sentinel's redirect desktop check never reached the app's guard; it skips with that reason. The guard is covered by `fetch_with_ssrf_guard_*` in `search.rs`.
- **The small model's limits, said in the spec:** Echo's recall answers left out the price and the old date although both were given to the model; those two assertions call `needsLargerModel()` and skip below 3B.
- **Test timing:** the carousel spec waits for the Posts list; agent-skills waits up to 120 s for the Orchestrator page (it passed on `main`, failed on the PR).

## 11.51 v2.10.0 released (2026-10-27)

The owner asked for a whole documentation pass after Jose phase 7, then the tag, the release and the installers.
- **What 2.10.0 holds** (since 2.9.0, 2026-10-12): the deferred-work batches of PRs 304 and 305 and macOS back in the release; the Jose redesign (phases 1–7, PRs 336–342 and 367); Miya's content factory (phases 1–4c, PRs 332 and 343–354); agent roles Parts A–C (PRs 356, 357, 365, 366); agent phases 1–7 (Hector, Nova, Maria, Sentinel, Marcus, Alphonso, Echo).
- **Documentation pass:** every document describing the app now says 2.10.0 is released (README, AGENTS.md, USER_MANUAL, RELEASE, CHANGELOG, COMPARISON, REDIT_POSTS, this file); the README's What's New covers the agent phases, Projects and Teams and Jose phase 7; AGENTS.md's connector count (34, with Google Web Risk) and service count (328) were corrected, and its line about the archived `externalAgentAdapter.js` removed; the dated specs carry a status line saying they were released.
- **Release:** PR 367 merged on green required checks (`7839255`), `v2.10.0` tagged on `main`, and `release.yml` built, signed and published all three in one run (published 2026-10-27 14:15 UTC): Windows `Alphonso_2.10.0_x64-setup.exe` (NSIS; no MSI is built), macOS `Alphonso_2.10.0_aarch64.dmg` (Apple Silicon, not signed by Apple) with `Alphonso.app.tar.gz` for updates, Linux `Alphonso_2.10.0_amd64.AppImage`, each with its signature, and `latest.json` listing windows-x86_64, darwin-aarch64 and linux-x86_64. Unlike 2.9.0, nothing was published by hand and macOS is in the release.
- **Not checked live before release (owner, 2026-10-27):** the live check with the owner's keys (Telegram, a Marcus channel, ElevenLabs, Higgsfield), deferred to the doc pass after 2.10.0; a paid-model step (Claude or ChatGPT); auto-update from 2.9.0 to 2.10.0. See `docs/governance/DEFERRED_WORK.md`.

## 11.50 Jose phase 7: stop, cancel, a queue, and Jose for everything (2026-10-27)

The last phase of the Jose redesign (design `docs/superpowers/specs/2026-10-27-jose-phase7-design.md`, plan `docs/superpowers/plans/2026-10-27-jose-phase7.md`), with the agent phases' leftovers the owner folded in.
- **Stop** (`src/services/jose/joseStop.ts`, `src/lib/agentSignals.ts`): the running step's model call is cancelled, finished work kept, nothing new starts; a Marcus send or an approved code change finishes first; final status `stopped`. **Cancel** (`cancelRequest()` in the engine) for `interrupted` and `waiting_setup`.
- **Queue** (`src/services/jose/joseQueue.ts`): one request that uses the local model at a time; given back on any status other than running/queued and in a wrapper's `finally`; queued requests carried on at start.
- **Planner**: the request first, history as background; a destination only the history named is sent back. **Batches** planned in one call (`planBatch()`).
- **Hand-offs** (`src/services/jose/joseHandoff.ts`): `ACTION: send|code` lines become Marcus or Alphonso steps through `addSecurityChecks()`; content steps can ask for help (and their re-run keeps its content data).
- Workflows (panel and phone) through `runWorkflow()`; Boardroom's notes open their request; content videos from Telegram and schedules start a project; the board groups a project's requests (`requestGroups.ts`); `rankByResults()` in `skillPick.ts`; `node <file>` inside the step's folder (`policy_gate.rs`).
- **Found by CI**: the two content specs that timed out only in CI did so because Sentinel's pre-send check in front of the factory's Publish failed with no model, so Publish never ran (`CONTENT-DIAG`); fixed in `addSecurityChecks()`.
- **Checks**: CI's desktop job gains a run with `qwen2.5:1.5b` for the model specs; `jose-phase7.e2e.mjs` (Cancel seeded, Stop with a model). Deferred, written up: WhatsApp and phone approvals; Echo's decisions on several computers; the live check with the owner's keys (to the doc pass after 2.10.0). Also found by CI: Miya Studio's Posts list didn't refresh after Approve and schedule once Publish ran; fixed.

## 11.49 Agent roles Part C2: more skills and better agents (2026-10-27)

The second half of Part C (plan `docs/superpowers/plans/2026-10-27-agent-roles-part-c2.md`).
- **Skills**: 18 new built-in skills (60 in all) with their task types in `taskTypeMeanings.ts` and `ACTION_EFFECTS` (all read-only except `distribution_newsletter`, a send), and the `read_brand` tool. Reading skills get a folder from `readingFolder()`; without one they ask to name a project.
- **Sentinel**: `personal_data` facts, checked after every Hector `research_people` step (`sentinel-people-<step>`).
- **Marcus**: timed sends (`src/services/marcus/sendTime.ts`, `scheduleApprovedSend()`), newsletters only through n8n or a Composio mail app; **Echo**: `memory_digest` without a model call.
- **Alphonso**: one code step per named project (`splitProjects.ts`), editing a waiting change (`editChange.ts`).
- **Hector**: PDF text through `pdf-extract` 0.12.1 (its `ttf-parser` is marked unmaintained, RUSTSEC-2026-0192, and is on `.cargo/audit.toml` with the reason, owner approved; pdf-extract 0.9 was rejected for lopdf's RUSTSEC-2026-0187), the two-word topic filter, his skill in the write-up, the PowerPoint export of newer reports.
- **Nova**: `findOptions()`; a request with options in plain sentences can take one extra short model call.
- **Echo by meaning**: `src/services/echo/meaning.ts` and the backend `ollama_embed`.
- **Leftovers**: Chat's setup notice, Chat's draft (`src/lib/chatDraft.ts`), Kokoro's `missing` flag.
- **Checks**: the desktop check count is now counted (`countDesktopChecks` in `scripts/shared/counters.mjs`, checked in two places in CLAUDE.md); the hand-kept 136 was really 123 before this phase's new checks. `alphonso.e2e.mjs` (an edited preview; two projects), `marcus.e2e.mjs` (a timed n8n send) and `echo.e2e.mjs` (meaning search) gained checks. They could not run on this machine: Windows' Code Integrity policy refuses to start the rebuilt app, so CI's desktop job is their first run, and that job skips the specs that need a model. The two content specs that time out only in CI now print `CONTENT-DIAG` with the request's steps on a timeout.

## 11.48 Agent roles Part C1: Projects, Teams and skill results (2026-10-27)

The first half of Part C (spec `docs/superpowers/specs/2026-10-26-agent-roles-part-c-design.md`, plan `docs/superpowers/plans/2026-10-26-agent-roles-part-c1.md`). The inspection found Work → Projects ran a simulation (`runProjectWorkshop()`: fixed outputs, no model, the owner's own example project), Agent Pairing saved pairs nothing read, no screen listed saved templates, and skill use wasn't recorded.
- **Projects** (`src/services/projects/projectStore.ts`, `src/components/projects/ProjectsPage.tsx`): the intake starts a real Jose request planned from the Build an app template (`templateId`, also the fallback when Jose's model is down); the page shows the latest run's Plan, Steps, Approval (Approve and carry on, Reject) and Results, which stay locked while a step waits or the request runs.
- **Teams** (`src/services/jose/teams.ts`, `src/components/teams/`): System → Teams lists every saved template with what's wrong with it, Run (disabled while it would be refused), Edit and Delete, and builds a team (agents with only their own kinds of work, order, "Starts after"). "use team <name> to …" or "/team <name> …" in Chat, or on any channel, runs the team's steps as a request labelled "Steps set by your team <name>.". Old Agent Pairing pairs are offered once as teams. A waiting plan on the board that breaks the rules says so and can't run.
- **Skill results** (`src/services/skills/skillOutcomes.ts`): every finished, failed, set-up-needed or rejected step is recorded with its skill, and a review's verdict on the step it reviewed; the Skills page shows "Used n times · x of y reviews passed · last used …" per skill.
- **Archived** (owner approved, `archive/MIGHTBEUSEDLATER/partC1/`): the simulated workshop and its panels and services, Agent Pairing, `sentinelGateService`, `mariaWeeklyReportService`, `codingAgentService` and `novaFeedbackService` (the engine's always-empty Nova hints call removed with it), EcosystemHub's Workshop tab, and the old `project-execution` desktop spec.
- **Old data**: saved requests, templates and step outputs from before Part C still load (`src/test/services/jose/oldData.test.ts`).
- **Found and fixed in the desktop tests**: the content-factory specs (`content-video`, `-carousel`, `-publish`) failed with "Choose an output folder in Settings first." although they set the folder: they wrote it only into storage, and the app loads its saved settings over storage at start. They now set it in Settings → Runtime like a person (`keepOutputFolder()` in `e2e-desktop/helpers.mjs`). Not an app bug: Settings saves both copies. Getting past that found a real one: **the Scene Builder never showed the finished videos** since agent roles Part A gave the step to Miya, because it still read Alphonso's output; it now reads Miya's, and Alphonso's for older projects (`SceneBuilderTab.tsx`). The carousel spec looked for "Cover", which the page shows in capitals.
- Live runs: `content-publish` passed locally with the folder fix, and `content-video` ran through to the finished files. Then Windows' Code Integrity policy on this machine refused to start the rebuilt app (event 3077, "did not meet the Enterprise signing level"), so `projects.e2e.mjs` and `teams.e2e.mjs` (new), the content specs after the Scene Builder fix, `agent-roles`, `agent-skills` and `jose-board` are left to CI's desktop job; the policy was not worked around.

## 11.47 Agent phase 7: Echo remembers the ecosystem's decisions (2026-10-26)

The seventh per-agent phase. The owner's goal: Echo is the brain of the whole ecosystem; he remembers every decision, wherever it was made, and every agent can get past decisions from him. The inspection (code, the memory graph, every memory writer and reader, and six live requests in the real app) found that every Echo step saved a note whatever was asked (recall and cleanup were never built); "Remember that …" got "Got it." and nothing was saved; Echo invented decisions; a keyword fallback note was saved as if Echo wrote it; notes expired by category, decisions included, after 7–14 days; 15 of 18 memory items were Ollama health checks; retrieval read only string content; the graph held only ids that no agent read; and `[object Object]` showed in Telegram's `/memory` and the nightly job.
- **Decisions** (`src/services/echo/decisions.ts`, `alphonso_echo_decisions_v1`): what was decided, preferred, instructed or turned down, with why, topics, where it was made and what it replaced. Never expire; a changed one is marked replaced; keys hidden. Graph nodes `decision` with `decided_in`, `cites`, `replaces`; protected from pruning.
- **Saving** (`extractDecisions()`): Echo's model writes only what is in the request or the work, from every finished or failed request on every surface, a rejected step, kept lessons and Miya Studio rejections. Nothing found → nothing saved; a model failure says so.
- **Every agent gets them**: each step's input carries the preferences that apply and the matching decisions (`decisionsFor()`); Chat's and channels' answers too (`answerDecisionsBlock()`); a HELP line about what was decided goes to Echo; skills' `read_memory` and Telegram `/memory` search decisions.
- **Asking, forgetting, tidying**: `memory_recall` answers from the records; `memory_forget` forgets one clear match or waits with a button per decision; `memory_cleanup` proposes merges, replacements, drops and old notes worth keeping and waits until you apply (board, Telegram, Settings); a Sunday schedule asks for it. "Remember / Forget / Clean up my memory" are planned by a rule.
- **Screens**: "Echo remembered: …" with Edit and Forget in Chat and on the board; Settings → Memory lists decisions ("Show replaced and forgotten").
- **Noise**: health-check and screen-observer notes are no longer saved, and the old ones are cleared once. The note-per-request path, its keyword fallback and the nightly and window-close synthesis are removed (`echoMemoryService.ts` re-exports the new API).
- **Found in six live runs and fixed**: a draft saved as a decision (drafts are left out at a request's end); "Remember that" kept in the text; near-repeats saved (`nearlySame()`); a change not linked to what it replaced (`findReplaced()`; the recall lists records oldest first with the time and says the newer one stands); "Remember that the launch moved" planned with research and writing (one Echo step now, `memoryOnlyTask()`); a forget with several matches offering one button, or forgetting without asking (it asks unless the request singles one out); a cleanup getting a forget step and then saving from its own result; a cleanup merge saving the format hint.
- Live-checked in the real app (`echo.e2e.mjs`, qwen2.5:7b): 7 of 7 on the sixth run; `agent-roles`, `alphonso` and `marcus` pass (Marcus's n8n note was once planned as a Slack send from the chat's history; it passed on rerun).

## 11.46 Agent phase 6: Alphonso writes real code in a folder you chose (2026-10-26)

The sixth per-agent phase. The inspection (code, a routing probe of ten everyday requests, and five live requests in the real app) found that no project folder was ever passed to Alphonso, so file writes failed and commands ran in the app's own folder; keyword intents decided what he did ("test my students" ran `npm run test` five times without asking, "Create … hello.js" went to Miya, "Run the tests in my project" became research); results said "verified" from a check that never matched; he committed to git and started dev servers on his own; Maria and Sentinel read his files from the same unset folder; fix rounds started over; and he was never offered the HELP line.
- **Projects** (`src/services/alphonso/projects.ts`, `alphonso_code_projects_v1`; the old `workspaceRoot` migrates in): Settings → Agents → Alphonso's projects (`AlphonsoProjectsSection.tsx`). One request per project at a time (`projectLock.ts`; a waiting step carries on when the folder is released). Small code with no project: `<output folder>/Alphonso/<name>/`.
- **Preparing a code step** (`prepareCode.ts`): place (a saved choice, a named project, his model's answer, one project, else "Which project: …"), the project listing (`list_project_files`, `ignore` crate, `.gitignore` respected), the files he asks to read, then his model's change; paths outside the folder or into `.git` dropped with a reason. The change set (`changeSet.ts`) says exactly what changes (`describeCodeChange()`), with the effects it needs (`previewNeeds()`).
- **Running it** (`runCode.ts`): only after the step's approval; a file changed since the preview is refused; commands through `verifyCommandExecution` in the project; up to `JOSE_LIMITS.maxFixRounds` fix rounds; a plain summary with each command's result.
- **Board and Telegram** (`CodePreviewView.tsx`, `joseTelegram.ts`): the preview, and a button per project for "Which project" (`pickAlphonsoProject()`).
- **Routing** (`taskTypeMeanings.ts`): `isCodeRequest()` no longer counts test/check/run/add/install/file/verify alone; `needsFacts()`; the planner sends back a code request without his code step and plain writing with research (`missingAsked()`).
- **Answers** (`ALPHONSO_ANSWER_PROMPT`): Chat's and channels' answers with the last 6 messages; Direct Mode keeps `CHAT_ASSISTANT_PROMPT`. He may help others with writing (`chooseHelper()`), and his answering steps get the HELP line.
- **Reviewers** read his files from the folder he worked in (`stepFolder.ts`).
- **Requests by command** (`requestForCommand()` in `joseRequestStore.ts`): a plan approved first keeps its own id when it runs; every lookup by command (Alphonso's preview, lock and folder; Marcus's one-send mark, readiness and review lookups) uses it. Found in the final review; Marcus's lookups had the same miss since phase 5.
- **Commands** (found in the live run): `command_allowed` (read-only) tells preparation whether the command policy would refuse a command, through the same `command_policy_refusal()` that `execute_command_verified` uses; a refused one is sent back once, then left out with the reason. On Windows `npm`/`npx`/`yarn`/`pnpm` start as their `.cmd` files (`spawn_name()`); before, `npm test` failed with "program not found". The policy's refusal of `node <file>` is unchanged (owner's decision, DEFERRED_WORK).
- **Small models' answers** (found in the live run): a command written as one string is split, "None" is dropped, a file named as the program is sent back once, an answer with only commands counts, and a request that talks about "this project" while projects are listed asks which.
- Live-checked in the real app (`alphonso.e2e.mjs`): see the PR for the run.

## 11.45 Agent phase 5: Marcus sends what was written, where you said (2026-10-26)

The fifth per-agent phase. The inspection (code plus four live requests in the real app) found that no send asked in Chat reached Marcus: he got a readiness step that ran before anything was written and sent nothing, a GitHub release became Alphonso's "Runtime reachable", a second approval store failed every send that did get through, side paths (Project Execution's panel, its packets, workflows, old scheduled sends) sent without Jose or Sentinel, and Jose's own plans failed on every request because the model copied the planner example's placeholders.
- **Marcus's send** (`src/services/marcus/`): the text from the step he sends from (or what you quoted), the destination from a given payload, a connector you named, or his model's pick among the connectors you set up, checked against what you named and your defaults; too long → a fix round for the writer; prepared before the approval, which shows the exact text; sent once.
- **Channels**: Slack, Discord, Telegram (team chat or you), WhatsApp, GitHub draft releases and issues, Notion, ClickUp, listed n8n workflows, Composio (v3.1, switched-on toolkits only).
- **Readiness** is a read-only check that asks nothing.
- **Side paths** are one Marcus step each (`askMarcusToSend()`); a source test keeps it so.
- **Chat** shows the outcome once a waiting request ends elsewhere.
- **Planner**: a real example and a fix-round problem for copied placeholders; once plans stopped falling back, the 7B model left out what was asked for, so `missingAsked()` sends back a plan without the send, readiness check, check of the writing or plan review asked for, and a review that names nothing reviews the one piece of work.
- **Desktop specs**: Chat specs click Send only once it has the text (`clickSend()` in `e2e-desktop/helpers.mjs`); a click on the still-disabled button had sent nothing in long chats.
- Live-checked on 2026-10-26 in the real app (`marcus.e2e.mjs`): Slack with no key says what to set up, readiness asks nothing, a note to a listed n8n workflow (a local stand-in server) waits with the exact text and arrives once after approval, and Jose's own plan has no placeholder.

## 11.44 Agent phase 4: Sentinel checks the real thing (2026-10-25)

The fourth per-agent phase. The inspection (code plus three live runs in the real app) found that Sentinel's verdict was a keyword score (any link off a hardcoded list, any "publish" or "delete", a failed earlier step) with his model asked only sometimes and its opinion saved as "verified"; that he ignored Jose's step model; that "BLOCKED" held nothing (a blocked scan ended like a finished step, and the engine's keyword gate never fired for plans Jose's model writes, which are all `riskLevel: 'low'`); that keys reached his prompt and memory although a redacted copy was made; that Telegram `/scan` and the 10-minute background scan scanned an empty string, and the sidebar card coloured by a field the scan never returned (a critical result showed green); that the allowlist panel was read by nothing; that the content factory's campaign check was never shown. Live: "check this post before I publish it" (a fake PayPal login, a password, a key) got "risk 52/100 (low) … BLOCKED" with pattern names and nothing held, while Alphonso ran `npm run test` four times ("test key" and "/verify" inside the post read as instructions); "write an email, then check it for security" had Sentinel check before the email existed and Maria vouch for that check. How Hector opens links: `fetch_url_content` (Hector's `fetch_source` tool) followed redirects unchecked, proven in the real app (a public address redirecting to this computer returned the local Ollama model list), every fetcher read whole responses, and tool results reached models unfenced. Built (spec `docs/superpowers/specs/2026-10-25-agent-phase-sentinel-design.md`, plan `docs/superpowers/plans/2026-10-25-agent-phase-sentinel.md`):
- **His model plus exact facts** (`src/services/sentinel/`): a key, a password request, a disguised link, a link off your trusted list (for text being sent), a deleting or code command, handed to his model as facts and always in his answer; findings say what, where, how serious, the fix; quotes checked; no keyword points.
- **Holds**: a serious finding holds the steps after his; so does an issue in the campaign check (Publish waits).
- **Automatic checks**: before every Marcus send, after Alphonso's code, on research a step that acts uses, and on a request with a key or a link. Keys are hidden from every agent's model and from memory.
- **The scans** are one review of the week, as a request (the sidebar, `/scan`, the daily schedule); the allowlist is what he trusts; Campaign Studio shows his check.
- **Hector's links**: one guarded, size-capped fetch; disguised links and (with a Google Web Risk key) listed ones aren't opened; page text and tool results stay fenced; a disguised source link you click asks first.
- **Hand-overs**: a quoted post isn't an instruction, a security check reviews the writing it follows, Maria judges only what she sees.
- Live-checked on 2026-10-26: Windows Code Integrity no longer blocks the build.

## 11.43 Agent phase 3: Maria reviews the real work (2026-10-25)

The third per-agent phase. The inspection (code plus two live runs in the real app) found that the simple plan dropped which step needed which, so the honeybee post ignored Hector's research and Maria ran a governance audit of the request instead of reviewing the post; that "Audit this plan" planned the plan's own steps ("discount code" became a code step, "post it on Instagram" a Marcus step); that her answers were keyword verdicts ("low risk" with "approval required", generic findings) and Chat dumped her schema; that an unreadable review counted as a pass; that Marcus scored risk by keywords and read whichever Maria output was latest; that the weekly report and the governance audit were two separate jobs; and that the content quality check claimed to compare "side by side" with posts she never saw. Built (spec `docs/superpowers/specs/2026-10-25-agent-phase-maria-design.md`, plan `docs/superpowers/plans/2026-10-25-agent-phase-maria.md`):
- **Two reviews from her model** (`src/services/maria/`): a work review (pass/fix, quotes checked against the work, unbacked claims are a fix; Alphonso's files and results read with file:line) and a plan review (risk and why, rules, points, approval only with reasons, an offer). No keyword fallback.
- **Holds**: her approval, or a fix left after the review rounds, makes every later step wait with her reasons (`mariaHolds.ts`). Marcus follows her review of the exact work he sends, with no keyword score.
- **Reviews never pass unread**; content quality reviews are judged from her scores and the brand's threshold; security goes to Sentinel through the help line.
- **The content quality check** gets what is known about the brand's references; **the weekly schedule** is one Maria request; **Chat** offers "Have Marcus prepare this".
- **Hand-overs** (Hector and Nova checked against every other agent): the rule plan keeps its links, a write-up waits for Nova, Miya waits for Hector and Nova, and Alphonso's writing and Miya's work read the steps they need.
- Not live-checked: Windows Code Integrity blocks building the app on this machine since 2026-10-25 19:45 (DEFERRED_WORK).

## 11.42 Agent phase 2: Nova judges what was found (2026-10-25)

The second per-agent phase. The inspection, with live runs, found that Nova's scores came from a keyword count ("email" raised risk, "build" raised value) and were used silently when her model failed; that her prompt forced a score block whatever her skill asked; that she ignored the model Jose picked for her step; that the simple plan and the workflows ran her before Hector, so she judged the request text; that live answers were meaningless (coffee subscriptions: "value 58/100 (critical priority)", no opportunity named; a bakery's three options: every score 100/100, the podcast dropped, beside "Opportunity Score: 0" from the keyword count); that Chat dumped her internals and its Nova card scored your message by keywords with a hidden extra model call; and that `/nova` showed a "trend" of one number a day. The same runs found a routing slip: "a newsletter, a YouTube channel or a podcast?" started a Miya Studio video project. Built (spec `docs/superpowers/specs/2026-10-25-agent-phase-nova-design.md`, plan `docs/superpowers/plans/2026-10-25-agent-phase-nova.md`):
- **A ranked verdict from her model** (`src/services/nova/novaVerdict.ts`): every option in order with why, value / effort / risk in words and the sources that support it; what to do first; what would change her mind. No keyword scores, no fallback numbers. Nothing to judge → she asks Hector through the help line.
- **She runs after Hector** in the simple plan and in workflows, with Jose's step model. The batch planner's profiling and security tasks went to Alphonso and Sentinel.
- **Where you see her**: Chat's card shows her verdict for the request; Settings and `/nova` list her last verdicts; the daily scan is a "what to do next" request.
- **The video shortcut** needs a request to make something, and its message says what Jose understood. Naming a platform is no longer publishing in the simple plan.
- **Hector's two leftovers**: broken model text under "Sources disagree", and "blocked (HTTP 200)" for a short page.
- The content factory's market step already read Hector's answer (agent roles Part A); a test pins it.

## 11.41 Agent phase 1: Hector, and the routing guards (2026-10-25)

The first of the per-agent phases (owner, 2026-10-25: Hector, Nova, Maria, Sentinel, Marcus, Alphonso, Echo, then agent roles Part C, then Jose phase 7). The inspection, with two live runs, found that about half of Hector's sources were blocked (he introduced himself as "Alphonso-Hector/0.1"), that Jose steps searched with the whole 317-character step text, that his write-up read ~750 characters from the start of each page (menus), that only a 2-4 sentence overview reached the next agent, that with no sources his model wrote facts from memory, that reports filled app storage after 15-20 runs, that DeepSeek's answer was used as a source, that RSS-only results crashed the run, and that the Research Desk ran outside Jose. The owner: "when I give a research task, I expect a proper result, not just a Google search." Built (spec `docs/superpowers/specs/2026-10-25-agent-phase-hector-design.md`, plan `docs/superpowers/plans/2026-10-25-agent-phase-hector.md`):
- **Research in rounds** (`src/services/hector/researchRun.ts`): the question broken into parts with short queries, pages read for the parts that match, a write-up with numbered citations, follow-up rounds for what's missing, sources compared, the answer first; nothing usable → the step waits for setup with the reason.
- **One search chain** for every caller, junk dropped, primary sources first; fetching like a browser with one retry; PDFs and blocked pages keep their search snippet, labelled.
- **Storage**: page text in files (`research_store.rs`), 600-character excerpts and 200 reports in app storage, older reports slimmed once.
- **The Research Desk** asks through Jose; reports on the Desk and the board show the cited findings; one export; saved sources.
- **Routing**: the planner sees each task type with a plain meaning; a code step is refused for a request that isn't about code; the rule plan keeps every part (writing → Alphonso `assistant_write`, a check → Maria reviewing it), keywords match at word starts, negated sends are ignored; a routing test set of 39 requests.

## 11.40 Agent roles, Part B: real skills (2026-10-25)

Until now a skill was a one-line "pack" (about 160 of them) that reached a prompt in one place only, Miya's Quick package, while the real know-how sat in the content factory's own prompts. Part B (plan `docs/superpowers/plans/2026-10-25-agent-roles-part-b.md`):
- **A skill is a Markdown file**: name, agent, when to use it, the task types it does (all owned by its agent), its tools, the tools' order for small models, and its output, then the instructions. 40 built-in skills in `src/skills/<agent>/` (Jose has none: he plans). The content factory's 16 asks moved into Miya's, Hector's, Nova's, Maria's and Sentinel's skills word for word, so the know-how is in one place.
- **Checked, never fixed silently.** `checkSkill()` refuses a skill that gives an agent another agent's work, a tool it may not use, or an effect it lacks, with plain reasons; built-in skills are checked by a test, yours on save and on load.
- **Picked per step, shown on the board.** Only skills for the step's task are offered; with one there is no model call; content steps use their own. The board shows "Skill: … — reason".
- **Tools.** Each wraps an existing function (web search, opening a source, stock search, reading earlier steps, sources, memory, project files, saving a note). Small models run a skill's tools in order; models at or above Settings → Agents' size (14B by default), and paid or cloud models, call them themselves, at most 5 per step. Tools that send, publish, call, run code, change files or make media never run as tool calls: they stay the step's own action, with its approval.
- **Your own skills** live in the app's skills folder (`skills_store.rs`); All Agents → Skills has New skill, Import a skill file, Open skills folder, Export and Delete.
- The old packs, their tests and the contract service's pack checks are in `archive/MIGHTBEUSEDLATER/skillPacks/`; the Coach's "unused" check reads skills' last use.
Part C (Projects, Teams, learning, old data) follows.

## 11.38 Every document reconciled with the code (2026-10-25)

At the owner's request, every Markdown document was checked against the code, the dated records included. Documents that describe the app now were brought up to date; dated records (audits, reports, plans) had claims about the present corrected in place and a dated note added, so their history stays readable. Two systematic causes were found and fixed:
- **`scripts/verify-doc-counts.mjs` matched the first number in a file.** In the README that was the v2.4.4 release note, so every PR's count fix rewrote that historical line with current numbers, while the architecture block's command count was never checked. The claims now match the lines that describe the present, and the v2.4.4 note has its original numbers again.
- **File names drifted.** Many services and components moved from `.js`/`.jsx` to `.ts`/`.tsx` without the documents following; every such name was updated where exactly one renamed file exists.
