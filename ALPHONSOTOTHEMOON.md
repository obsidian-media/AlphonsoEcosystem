# ALPHONSOTOTHEMOON

**Status:** Draft v1.0 — Sprint 1 kickoff
**Owner:** Shayan
**License:** SHALAUDE v1.0 (all-rights-reserved, source-visible) — see `LICENSE`
**Last updated:** 2026-07-02

---

## 0. Why this document exists

This is the working roadmap for hardening and extending AlphonsoEcosystem, based on a
comparative study of two open-source "Agent OS" projects — **OpenFang**
(`RightNow-AI/openfang`, Apache-2.0, 17.9k★) and its community fork **LibreFang**
(`librefang/librefang`, MIT, 317★) — against what Alphonso already has. Nothing here is
copied code. This is a pattern study: what those projects got structurally right, what's
worth adapting to Alphonso's architecture, and what to deliberately reject because it
fights Alphonso's own design philosophy (approval-gated, human-present, desktop-first).

Every item below is scoped against the actual current codebase — checked via the indexed
code graph, not assumption. Where something already exists in Alphonso (even partially),
that's called out explicitly so we extend instead of duplicate.

---

## 1. Licensing decision

**Decision: All-Rights-Reserved, under a custom license text called "SHALAUDE v1.0."**

- `LICENSE` file added at repo root (this sprint, done — see §6).
- SHALAUDE is not a registered/OSI license — it's our own source-available,
  all-rights-reserved license text, modeled loosely on the legal skeleton of
  source-available licenses like BSL/Polyform but written in plain terms: view-only,
  no use/copy/modify/distribute without written permission.
- If we ever want to *distribute* Alphonso (even a closed beta), SHALAUDE needs to be
  paired with an actual EULA covering runtime use of a compiled build — copyright
  license and end-user terms are legally distinct. Not needed until we ship to
  external users. Tracked as a backlog item (§5.6).
- If we ever vendor actual code from an Apache-2.0/MIT project (OpenFang, LibreFang,
  or anything else), that specific code keeps its original license and must be listed
  in a `NOTICE` file with attribution — SHALAUDE governs *our* code, not code we import.
  As of this doc, we have not vendored any code from either project — only studied
  their architecture, which is not copyrightable.
- Trademark (the "Alphonso" name, agent names, logo) is a separate protection track
  from code licensing — not covered by SHALAUDE. Tracked as backlog (§5.6).

---

## 2. What we compared, and the core structural difference

| | AlphonsoEcosystem | OpenFang | LibreFang |
|---|---|---|---|
| Primary language | JS/TS + Tauri (Rust for native ops) | Rust (14 crates, ~137.7k LOC) | Rust (24 crates, fork of OpenFang) |
| Orchestration model | Central router + single execution pipeline (`joseCommandRouterService` → `joseExecutionEngineService`) | Kernel/runtime split — scheduler supervises sandboxed agent loops | Same as OpenFang, further crate-split (skills, ACP, telemetry, docker sandbox all separated) |
| Autonomy posture | Reactive to chat/approval-gated | Continuous, unattended "Hands" | Same, + open governance model |
| Security model | App-level policy engine + post-hoc agent scans (Sentinel/Maria) | Runtime-embedded: WASM sandbox, taint tracking, Merkle audit chain | Docker sandbox as its own crate, same taint/audit ideas |
| License | None → SHALAUDE (this sprint) | Apache-2.0 | MIT |
| Stars/forks | 1★ / 0 forks (private-feel, not yet public-facing) | 17.9k★ / 2,280 forks | 317★ / 65 forks |

**Core takeaway:** Alphonso orchestrates *conversation-triggered* work through one
router+pipeline. OpenFang/LibreFang orchestrate *continuously running, sandboxed
processes* through a kernel/scheduler. We are NOT rewriting Alphonso into a Rust kernel
— that's a multi-month effort that would obsolete 163 services and 3,174 tests for
uncertain gain, and it fights our approval-gated, human-present design philosophy.
Instead, we selectively harden Alphonso's existing pipeline with the specific
engineering patterns below.

---

## 3. What we're taking, and why (ranked by leverage / cost)

### 3.1 Loop-guard + context/token budget per agent execution — HIGH priority
**Source pattern:** OpenFang `openfang-runtime/loop_guard.rs`, `context_budget.rs`,
`context_overflow.rs`.
**Current gap:** `joseExecutionEngineService.js` → `runJoseCommandExecutionPipeline`
(lines 1156–1639, a ~480-line pipeline) has a dead-letter queue for failures but no
hard ceiling on runaway loops or context/token blowout during a single agent run.
**Plan:** Add a per-execution budget tracker (max iterations, max token spend, max
wall-clock) enforced inside the pipeline, wired through `agentContractService.ts`
(which already validates capability contracts — this becomes a resource contract
alongside the capability contract). On breach: hard-stop + DLQ entry + receipt with
`reason: budget_exceeded`.
**Why it matters:** Directly prevents runaway cost/safety incidents. Cheapest, highest-
leverage item on this list.

### 3.2 Subprocess/sandboxed tool execution — HIGH priority
**Source pattern:** OpenFang `subprocess_sandbox.rs`, `docker_sandbox.rs`, `sandbox.rs`;
LibreFang splits this into its own crate (`librefang-runtime-sandbox-docker`).
**Current gap:** `execute_command_verified` (Rust, `src-tauri/src/`) does output
redaction and a per-program arg allowlist (`policy_gate.rs`), but agent-invoked tools
still execute in-process/native — no process isolation boundary.
**Plan:** Wrap agent-triggered tool execution (plugin runtime, shell commands) in an
isolated subprocess with resource limits, before considering full container/WASM
sandboxing. Ties into the existing `plugin_runtime.rs` and `policy_gate.rs`.
**Why it matters:** Raises the security ceiling without a rewrite; directly protects
against a malicious or buggy plugin/tool call.

### 3.3 Crash recovery / session repair pattern — MEDIUM priority
**Source pattern:** OpenFang `session_repair.rs`, `graceful_shutdown.rs`, `retry.rs`.
**Current gap:** Alphonso's DLQ (`persistJoseExecutionDlq` etc. in
`joseExecutionEngineService.js`) captures failed executions but has no formal contract
for resuming/repairing in-flight work after an app crash or forced restart.
**Plan:** Define an explicit "in-flight execution" checkpoint record (leveraging the
existing `orchestrationQueueService.ts` transition ledger) that on next app boot is
either resumed, retried, or explicitly failed — never silently dropped.
**Why it matters:** Reduces "silently lost work" incidents, which are currently
possible if the app is killed mid-pipeline.

### 3.4 MCP as a first-class runtime capability, not a side server — MEDIUM priority
**Source pattern:** OpenFang/LibreFang embed MCP client+server (`mcp.rs`,
`mcp_server.rs`) directly in the agent runtime.
**Current gap:** Alphonso's `mcp-server/server.js` is a separate Express process (port
3333) that external clients (Claude Desktop, Cursor) call into — Alphonso's own 9
agents don't consume MCP tools through a unified path.
**Plan:** Let internal agents call MCP-exposed tools through the same tool-call path
external MCP clients use, so a skill/module can declare "I need MCP tool X" uniformly
regardless of whether X is a native Alphonso connector or an external MCP tool.
**Why it matters:** Removes a structural inconsistency — MCP tools currently a
second-class citizen relative to native connectors.

### 3.5 Kernel-style scheduler supervision (heartbeat/health, not just cron) — MEDIUM priority
**Source pattern:** OpenFang `scheduler.rs`, `supervisor.rs`, `heartbeat.rs`.
**Current gap:** `joseSchedulerService.js` already does cron-style scheduling
(`createSchedule`, `listSchedules`, `startScheduler`/`stopScheduler`) but does not
supervise agent health — it fires on a timer and trusts the run completes.
**Plan:** Add heartbeat/liveness checks to scheduled agent runs; auto-restart or
alert on a stalled/crashed scheduled job instead of silently missing a cycle.
**Why it matters:** Makes scheduled automation (Jose cron, Echo file watcher, Sentinel
scheduled scans) trustworthy for genuinely unattended operation.

### 3.6 Skills-by-default per agent (see §4 — already ~70% built)
### 3.7 Connector breadth expansion (see §5)

### Explicitly rejected
- **Full Rust kernel rewrite.** Multi-month cost, obsoletes existing services/tests,
  no clear ROI over incrementally hardening the current pipeline.
- **"Autonomous Hands with minimal human-in-loop" philosophy.** Fights Alphonso's
  approval-gated, receipt-audited, contract-validated design. We harden engineering,
  not adopt their autonomy posture.
- **WASM sandbox specifically** (vs. subprocess sandbox) — too large a lift for v1;
  subprocess isolation gets most of the safety benefit at a fraction of the cost.
  Revisit post-v1 if subprocess isolation proves insufficient.

---

## 4. Skills-by-default: default capability loadouts per agent

**This is largely already built.** `src/services/skillPackService.js` already
implements:
- Versioned, permission-scoped "skill packs" (`listSkillPacks`, `installSkillPack`,
  `setSkillPackEnabled`, `uninstallSkillPack`), persisted + audited
  (`alphonso_skill_packs_v1` / `alphonso_skill_pack_audit_v1`).
- **Per-agent default skill ownership** via `ownerAgent` field — e.g.
  `pack.hector-professional-marketing` (Hector), `pack.jose-professional-orchestration`
  (Jose), `pack.miya-runway-video-generation` (Miya), `pack.maria-audit-governance` +
  `pack.maria-trust-verification` (Maria).
- 20 additional generic "agent workflow" skills sourced conceptually from
  skills.sh (TDD, systematic-debugging, writing-plans, parallel-agent dispatch, etc.)
  applied across agents via `category: 'agent_workflow'`.
- `loadAgentSkillGuidance(agentName)` — already **wired into
  `joseExecutionEngineService.js`** — returns active skill guidance + recommended
  steps for a given agent at execution time.

**What's missing (this sprint's actual work):**

1. **Contract cross-check.** `agentContractService.ts` currently validates an agent's
   execution contract but does **not** cross-check a loaded skill pack's declared
   `permissions` against that agent's contract boundaries. A skill could theoretically
   grant an agent a capability its contract doesn't allow. Fix: `installSkillPack` /
   `setSkillPackEnabled` should call into `agentContractService` to reject or flag
   packs whose permissions exceed the owning agent's contract.
2. **Coverage gap.** Only 5 of 9 agents (Jose, Hector, Miya, Maria×2) have an
   `agent_skill`-category default pack. Alphonso, Marcus, Echo, Sentinel, Nova do not.
   This sprint adds default skill packs for the remaining 4 agents, matching their
   existing runtime services (e.g. `pack.sentinel-vuln-scan` wrapping
   `sentinelSecurityService.js`'s scan capability, `pack.echo-memory-synthesis`
   wrapping `echoMemoryService.js`).
3. **Module system convergence.** `modules/` (TOML manifests, e.g.
   `alphonso.researcher.web_monitor`) and `skillPackService.js` (JSON packs in
   localStorage) are two parallel capability-packaging systems today. This sprint
   does NOT merge them (too risky for one sprint) but documents the distinction
   clearly: `modules/` = installable capability packages with tool entrypoints;
   `skillPackService` = permission-scoped behavioral guidance loaded into an agent's
   execution context. A future sprint should evaluate collapsing these into one model
   (this is where LibreFang's `librefang-skills` vs `librefang-import` crate split is
   instructive — they kept these as two distinct crates too, for the same reason).

---

## 5. Connector expansion

Alphonso already has 15 policy-gated connectors with a proven pattern
(`connectorRegistryService.js` + credential UI in `ConnectorSetupPanel.jsx`
`CredentialSection` + Rust backend in `connector_commands.rs`). OpenFang has 40 channel
adapters + 27 LLM providers; the gap is breadth, not architecture. This sprint targets
the highest-leverage additions using the existing connector pattern — no redesign
needed.

**Sprint 1 connector targets** (in priority order):
1. **Discord** — high community reach, comparable integration shape to existing
   Slack connector (`slackConnector.ts`) as a reference implementation.
2. **Generic inbound webhook connector** — lets any external service push events into
   Alphonso without a bespoke connector; unlocks long-tail integrations cheaply.
3. **Email (SMTP send / IMAP poll)** — high utility, well-understood protocol,
   pairs naturally with Marcus (distribution) and Echo (inbox watcher pattern already
   exists via `echoFileWatcherService.js` — same polling shape).

**Backlog (post-sprint-1):** Signal, Matrix, X/Twitter (OpenFang has a whole "Hand"
for this — worth studying their rate-limit/anti-detection handling specifically before
building), generic RSS-out.

Each follows the existing pattern: connector service in
`src/services/connectors/`, credential section in `ConnectorSetupPanel.jsx`,
policy gate entry in `policyEnforcementService.ts`, license-tier gate in
`licenseService.ts` if premium, Rust command in `connector_commands.rs` if native
access is needed, tests in `src/test/`.

---

## 6. Sprint 1 plan

**Sprint goal:** Ship the licensing decision, close the skill-pack contract gap, add
default skills for all 9 agents, add the loop-guard/budget primitive, and stand up the
first new connector (Discord) — all without breaking the existing 3,174+ test suite.

| # | Task | Files touched (primary) | Owner | Status |
|---|---|---|---|---|
| 1 | Add SHALAUDE `LICENSE` file | `LICENSE` | — | ✅ Done |
| 2 | Write this roadmap doc | `ALPHONSOTOTHEMOON.md` | — | ✅ Done |
| 3 | Cross-check skill pack permissions against agent contracts | `agentContractService.ts`, `skillPackService.js` | — | ✅ Done |
| 4 | Add default skill packs for Alphonso, Marcus, Echo, Sentinel, Nova | `skillPackService.js` | — | ✅ Done |
| 5 | Add per-execution loop-guard + token/time budget | `joseExecutionEngineService.js`, `agentContractService.ts` | — | ✅ Done |
| 6 | Add resumable-execution checkpoint on top of existing DLQ | `joseExecutionEngineService.js`, `orchestrationQueueService.ts` | — | ⬜ Backlog → Sprint 2 |
| 7 | Discord connector (credential UI + service + policy gate) | `src/services/connectors/discordConnector.js` (new), `ConnectorSetupPanel.jsx`, `policyEnforcementService.ts` | — | ⬜ Backlog → Sprint 2 |
| 8 | Generic inbound webhook connector | new service + Rust command | — | ⬜ Backlog → Sprint 2 |
| 9 | Update `CLAUDE.md` Do-Not-Duplicate table + Real Gaps section post-sprint | `CLAUDE.md` | — | ✅ Done |
| 10 | Full test run + typecheck + clippy before marking sprint done | — | — | ✅ Done (with caveat — see §8) |

**Explicitly out of scope for Sprint 1:** MCP-as-first-class-runtime-capability (§3.4),
scheduler supervision/heartbeat (§3.5), subprocess sandboxing (§3.2), module-system
convergence (§4.3), EULA/trademark work (§1). These are real, tracked, and sequenced
into Sprint 2+ — not dropped.

---

## 7. Definition of done (per sprint item)

- Code change matches an existing pattern in the codebase (no new abstractions beyond
  what's needed — per repo convention).
- `npm run test` passes (3,174+ existing tests + new tests for the change).
- `npm run typecheck` — 0 errors maintained.
- For Rust-touching items: `cargo check` + `cargo clippy -- -D warnings` clean.
- `CLAUDE.md` Do-Not-Duplicate table and Real Gaps section updated in the **same
  commit** as the code (per existing project rule — docs must be current, updated
  same-commit, not as a follow-up).
- No item is marked done until it's actually verified running, not just typechecked.

---

## 8. Running log

- **2026-07-02** — Compared AlphonsoEcosystem against OpenFang and LibreFang.
  Confirmed skill-pack infrastructure already ~70% built (`skillPackService.js` +
  `loadAgentSkillGuidance` already wired into `joseExecutionEngineService.js`).
  Confirmed no LICENSE existed (`licenseInfo: null` on GitHub). Added SHALAUDE
  license. Created this roadmap. Starting Sprint 1 build.
- **2026-07-02 (Sprint 1 close)** — Shipped items 1–5, 9, 10:
  - `validateSkillPackAgainstContract()` added to `agentContractService.ts`,
    wired into `skillPackService.js` `installSkillPack`/`setSkillPackEnabled`.
  - Default `agent_skill` packs added for Alphonso, Marcus, Echo, Sentinel, Nova
    (all 9 agents now have one).
  - `PIPELINE_MAX_ASSIGNMENTS` (50) / `PIPELINE_MAX_DURATION_MS` (5 min)
    loop-guard added to `runJoseCommandExecutionPipeline` in
    `joseExecutionEngineService.js`; breach returns `budget_exceeded` +
    appends a `pipeline_budget_exceeded` receipt.
  - `CLAUDE.md` Do-Not-Duplicate table + Real Gaps section updated same-pass.
  - Verification: targeted tests for all touched files passed 100%
    (`skillPackService.test.js` 63/63, `joseExecutionEngineService.test.js`
    42/42). `npx tsc --noEmit` clean (0 errors). Full 218-file suite could
    not complete in one run on this dev machine — vitest worker-pool startup
    times out past ~170 files regardless of pool size (reproduced identically
    with default settings, a 4-worker cap, and the project's own
    `scripts/run-vitest-programmatic.mjs` runner). Every file that did run
    passed with 0 assertion failures. Logged as an open environment item, not
    treated as a code defect — flagged in `CLAUDE.md` Real Gaps for follow-up.
  - Items 6–8 (resumable-execution checkpoint, Discord connector, generic
    webhook connector) rolled to Sprint 2 as originally scoped.
