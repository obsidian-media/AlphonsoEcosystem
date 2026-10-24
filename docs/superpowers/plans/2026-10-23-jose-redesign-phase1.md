# Jose Redesign, Phase 1 (Foundation) Implementation Plan

> **Status (2026-10-25):** built and merged in PR #336 (phase 1); on `main`, not released yet. The current behaviour is in `CLAUDE.md`'s Jose rows and `docs/USER_MANUAL.md` section 5.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Jose the foundation of the redesign, behind today's entry point
(`runJoseCommandExecutionPipeline`):
- steps that declare their **effects**;
- **one permission table** per agent;
- **approval by effect** instead of keywords, with a Settings table;
- a **step graph** (several steps per agent, `needs`, limits) checked by rules
  before it runs;
- a saved **request** record;
- the **agent profile fixes**.

No other behaviour change: what asks for approval today still asks.

**Architecture:**
- New modules under `src/services/jose/` hold the effects, the permission
  table, the step graph with its rule check, and the request store.
- The router gives every assignment effects and a step id. The agent bus and
  the contracts check effects against the table and the Settings. The
  pipeline runs waves from `needs` instead of the fixed agent order.
- The old fixed order is kept only to give `needs` to tasks from today's
  splitter, so their order is unchanged.

**Tech Stack:** TypeScript (Vite), Vitest + Testing Library, the existing
durable store (`src/lib/durableStore.js`).

**Spec:** `docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md`
(approved 2026-10-23), section 10 phase 1, sections 2.9, 2.14, 5, 6 and 7.

## Global Constraints

- **Effects, exact names:** `read`, `write_own_work`, `change_project`, `run`,
  `spend`, `publish_or_send`, `delete`.
- **Locked to "always ask":** `spend`, `publish_or_send`, `delete`.
- **Default asks:** `change_project: true`, `run: true`; `read: false`,
  `write_own_work: false`.
- **Approval Mode stays the main switch.** Off → unlocked effects never ask;
  locked ones still ask.
- **`run` is allowed only for `alphonso`; `publish_or_send` only for
  `marcus`.**
- **`write_own_work`** is allowed for miya, hector, maria, nova, sentinel,
  marcus, echo and jose. **`change_project`** is allowed only for alphonso
  (others: not in phase 1).
- **Limits:**
  - `maxSteps: 50`;
  - `normalMs: 30 * 60 * 1000`;
  - `projectMs: 2 * 60 * 60 * 1000`;
  - `maxFixRounds: 2` (recorded here, used in phase 4).
- **Reuse, do not duplicate:** agent bus packets, receipts, queue and
  dead-letter queue, the approval window, `ApprovalPanel`,
  `policyEnforcementService` (connectors), `policy_gate.rs` and
  `assessCommandRisk()` (commands) stay the hard boundaries.
- **No change to the shell's `requestApproval`/`needsHighRiskApproval`** used
  by non-Jose callers in this phase (phase 6 moves callers).
- **Line endings:** keep each file's line endings as stored in git.
  `joseExecutionEngineService.ts` is CRLF; new files are LF.
- **Docs in the same commits:** CLAUDE.md rows, CHANGELOG,
  `DO_NOT_DUPLICATE.generated.md`, `verify-doc-counts`.

## Review Focus

1. **A task type from Rust's `jose_decompose` (`decomposeViaBackend`), or a
   new caller's, that has no effects mapping.**
   - Expected: treated as needing approval (fail closed), never as read-only.
   - Pinned in Task 1 (`inferEffects('unknown_x')` → `['run']`).
2. **A packet created outside Jose** (Boardroom bridge, Project Execution,
   older code) has no `effects`.
   - Expected: today's keyword check still applies to it, so nothing that asks
     today stops asking.
   - Pinned in Task 4.
3. **Approval Mode turned off.**
   - Expected: `spend`, `publish_or_send` and `delete` still ask.
   - Pinned in Task 1.
4. **A plan where two steps need each other, or a step needs a missing
   step.**
   - Expected: the request fails before anything runs, with a plain reason.
   - Pinned in Task 3.
5. **The content factory and every Jose spec still work.**
   - Its assignments get effects (`read`/`write_own_work`), so they run without
     approval exactly as now.
   - Pinned in Task 6 and the desktop run in Task 9.

---

### Task 1: Effects and approval by effect

**Files:**
- Create: `src/services/jose/joseEffects.ts`
- Test: `src/test/services/jose/joseEffects.test.ts`

**Interfaces:**
- Produces:
  - `type JoseEffect = 'read' | 'write_own_work' | 'change_project' | 'run' | 'spend' | 'publish_or_send' | 'delete'`
  - `JOSE_EFFECTS: JoseEffect[]` (that order)
  - `LOCKED_EFFECTS: JoseEffect[] = ['spend', 'publish_or_send', 'delete']`
  - `EFFECT_LABELS: Record<JoseEffect, string>` (plain words for Settings):
    - `read`: "Read and analyse"
    - `write_own_work`: "Create new files in the project folder"
    - `change_project`: "Change existing project files or install things"
    - `run`: "Run code and commands"
    - `spend`: "Spend money"
    - `publish_or_send`: "Publish or send anything outside"
    - `delete`: "Delete anything"
  - `DEFAULT_EFFECT_APPROVALS: Record<JoseEffect, boolean>` (Global Constraints)
  - `getEffectApprovals(): Record<JoseEffect, boolean>`: reads
    `alphonso_settings.effectApprovals` merged over the defaults; locked ones
    are always `true`.
  - `effectsNeedingApproval(effects: JoseEffect[], approvals?, approvalMode?: boolean): JoseEffect[]`:
    `approvalMode` defaults to `getRuntimePolicySettings().approvalMode`; with it
    off only locked effects count.
  - `ACTION_EFFECTS: Record<string, JoseEffect[]>`, the mapping:
    - `research: ['read']`, `external_publish_handoff: ['publish_or_send']`
    - `creative_package: ['write_own_work']`, `local_operation: ['run']`
    - `governance_audit: ['read']`, `security_monitor: ['read']`
    - `memory_preservation: ['write_own_work']`, `opportunity_analysis: ['read']`
    - `distribution_execution: ['publish_or_send']`
    - `orchestration_review: ['read']`, `boardroom_planning: ['write_own_work']`
    - `boardroom_execute: ['write_own_work']`, `boardroom_advance: ['read']`
    - `cost_policy_enforcement: ['spend']`
    - content factory: `research_virality`, `analysis_market`,
      `analysis_content_review`, `audit_content_quality`, `strategy_timing` and
      `security_content_check: ['read']`
    - `creative_script`, `creative_scenes`, `creative_thumbnails`,
      `creative_campaign: ['write_own_work']`
  - `inferEffects(actionType: string): JoseEffect[]`: exact key match,
    including merged types `a+b` from `mergeAssignments` (union of both).
    Unknown → `['run']` (fail closed).

- [ ] **Step 1: Write failing tests:**
  - `effectsNeedingApproval(['read', 'write_own_work'])` is `[]`;
    `(['run'])` is `['run']` with Approval Mode on;
  - with `approvalMode` `false`: `(['run', 'spend'])` is `['spend']`;
  - `getEffectApprovals()` with `alphonso_settings.effectApprovals = { spend: false, run: false }` → `spend` true, `run` false;
  - `inferEffects('local_operation+research')` → contains `run` and `read`;
  - `inferEffects('unknown_x')` → `['run']`.
- [ ] **Step 2: Run** `npx vitest run src/test/services/jose/joseEffects.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): steps declare effects; approval by effect`.

### Task 2: One permission table per agent

**Files:**
- Create: `src/services/jose/agentPermissionTable.ts`
- Modify: `src/services/agentContractService.ts` (`AGENT_EXECUTION_CONTRACTS` about line 21; `validateAgentExecutionContract` about line 381; the skill-pack Alphonso exception about line 350)
- Modify: `src/agents/*/…Permissions.js` (all 9), so they describe the table
- Test: `src/test/services/jose/agentPermissionTable.test.ts`; extend `src/test/agentContractService.test.js`

**Interfaces:**
- Consumes: `JoseEffect` (Task 1).
- Produces:
  - `AGENT_PERMISSION_TABLE: Record<string, { role: string; taskTypes: string[]; blockedTaskTypes: string[]; effects: JoseEffect[] }>`.
    `taskTypes`/`blockedTaskTypes` are prefixes, copied from today's
    `AGENT_EXECUTION_CONTRACTS`, plus:
    - Sentinel's `audit_` becomes `security_audit_`;
    - Maria keeps `audit_`.
    Effects per agent:
    - `alphonso: ['read','write_own_work','change_project','run']`
    - `marcus: ['read','write_own_work','publish_or_send','spend']`
    - every other agent: `['read','write_own_work']`
  - `isTaskTypeAllowed(agent: string, taskType: string): boolean`
  - `isEffectAllowed(agent: string, effect: JoseEffect): boolean`
  - `describeAgentPermissions(agent: string): { allowed: string[]; blocked: string[]; approvalRequired: string[] }`:
    plain-language lines for the existing displays. `approvalRequired` lists
    the agent's effects that ask by default.
  - `AGENT_EXECUTION_CONTRACTS` (unchanged shape) is now built from the table.
  - `validateAgentExecutionContract(packet)` drops the description-keyword
    block (`blockedByPreview`). It checks task type and, when `packet.effects`
    exists, `isEffectAllowed` for each effect.

- [ ] **Step 1: Write failing tests:**
  - `isEffectAllowed('miya','write_own_work')` is true and `('miya','run')` is false;
  - `isEffectAllowed('alphonso','run')` is true and `('jose','run')` is false;
  - `isEffectAllowed('marcus','publish_or_send')` is true and `('hector','publish_or_send')` is false;
  - `isTaskTypeAllowed('sentinel','security_audit_scan')` is true;
  - `AGENT_EXECUTION_CONTRACTS.maria.allowedActionPrefixes` contains `audit_`;
  - a packet `{ toAgent: 'nova', actionType: 'analysis_x', commandPreview: 'nothing is published or posted' }` passes `validateAgentExecutionContract` (the keyword guess is gone);
  - a packet `{ toAgent: 'miya', actionType: 'creative_x', effects: ['run'] }` fails it;
  - `describeAgentPermissions('hector').blocked` mentions running code.
- [ ] **Step 2: Run** the new test file plus `npx vitest run src/test/agentContractService.test.js src/test/services/agentContract.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Build `AGENT_EXECUTION_CONTRACTS` from the table. Replace the hardcoded `agentName !== AGENTS.ALPHONSO` skill-pack exception with `isEffectAllowed(agentName, 'run')`. Make each `…Permissions.js` export its old names (`HECTOR_ALLOWED_ACTIONS` etc.) from `describeAgentPermissions`, so the Hector desk and Project Execution show the real table.
- [ ] **Step 4: Run** the same files. Expected: PASS. Fix any existing test that asserted the old keyword block, noting why in the test.
- [ ] **Step 5: Commit** `feat(jose): one permission table for every agent`.

### Task 3: Step graph and the rule check

**Files:**
- Create: `src/services/jose/stepGraph.ts`
- Test: `src/test/services/jose/stepGraph.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces:
  - `JOSE_LIMITS = { maxSteps: 50, normalMs: 1_800_000, projectMs: 7_200_000, maxFixRounds: 2 }`
  - `interface PlanStep { stepId: string; agent: string; actionType: string; effects: JoseEffect[]; needs: string[] }`
  - `checkPlan(steps: PlanStep[]): { ok: boolean; problems: string[] }`, with
    these problems in plain words:
    - unknown agent;
    - task type not allowed for the agent;
    - effect not allowed for the agent;
    - `run` by an agent other than alphonso;
    - `publish_or_send` by an agent other than marcus;
    - `needs` naming a missing step;
    - a cycle;
    - a duplicate `stepId`;
    - more than `maxSteps`.
  - `buildStepWaves(steps: PlanStep[]): string[][]`: stepIds in waves; a step
    runs after every step it needs. Throws on a cycle (callers run
    `checkPlan` first).
  - `legacyNeeds(assignments: { agent: string; stepId: string }[]): Record<string, string[]>`:
    today's `AGENT_DEPENDENCIES` order expressed as `needs` between the
    present steps, so the splitter's requests keep their order.

- [ ] **Step 1: Write failing tests:**
  - two `miya` steps with different stepIds both run, the second after the first when it `needs` it;
  - `buildStepWaves` on `a`, `b` needs `a`, `c` needs `a`, `d` needs `b` and `c` → `[['a'], ['b','c'], ['d']]`;
  - `checkPlan` with a cycle `a`↔`b` gives a problem containing "cycle";
  - a missing need gives a problem naming the step;
  - `{ agent: 'miya', effects: ['run'] }` gives a problem mentioning "only Alphonso";
  - 51 steps gives a problem mentioning 50;
  - `legacyNeeds` for hector, miya, echo steps → miya needs hector, and echo needs hector and miya.
- [ ] **Step 2: Run** `npx vitest run src/test/services/jose/stepGraph.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): plans as step graphs with a rule check`.

### Task 4: Packets carry effects; approval by effect at the gate

**Files:**
- Modify: `src/services/agentBusService.ts` (`AgentPacket`/`AgentPacketInput` types; `createAgentPacket` about line 125; `canExecutePacket` about line 244; `isExternalRiskAction` about line 376)
- Test: extend `src/test/services/agentBusService.test.js` (also run `src/test/agentBusService.test.js`)

**Interfaces:**
- Consumes: Task 1 (`effectsNeedingApproval`).
- Produces:
  - `AgentPacket.effects?: JoseEffect[]`, set from `AgentPacketInput.effects`.
  - `canExecutePacket(packet)`: when the packet has `effects`, it blocks unless
    approved if `effectsNeedingApproval(effects)` is non-empty, with the reason
    "Waiting for your approval: <labels>". The keyword check
    (`isExternalRiskAction`) applies **only** to packets without `effects`.

- [ ] **Step 1: Write failing tests:**
  - a queued packet with `effects: ['read']` and description "nothing is published" passes;
  - a queued packet with `effects: ['publish_or_send']` is blocked with a reason containing "Publish or send anything outside";
  - the same packet `approved` passes;
  - a packet **without** effects and description "publish the post" is still blocked (Review Focus 2).
- [ ] **Step 2: Run.** Expected: the first two FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus `npx vitest run src/test/services/contentFactory/contentStepRunner.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): the bus approves by effect`.

### Task 5: Saved requests

**Files:**
- Create: `src/services/jose/joseRequestStore.ts`
- Test: `src/test/services/jose/joseRequestStore.test.ts`

**Interfaces:**
- Consumes: `PlanStep` (Task 3).
- Produces (key `alphonso_jose_requests_v1`, durable store, at most 200
  requests, oldest dropped):
  - `interface JoseRequest { id: string; commandId: string; source: string; text: string; kind: 'normal' | 'project'; status: 'running' | 'waiting_approval' | 'done' | 'failed' | 'interrupted'; steps: (PlanStep & { status: string; error?: string; startedAtMs?: number; endedAtMs?: number })[]; createdAtMs: number; updatedAtMs: number }`
  - `createJoseRequest(input: { commandId; source; text; kind; steps: PlanStep[] }): JoseRequest` (step status `waiting`)
  - `updateJoseStep(requestId, stepId, patch): JoseRequest`
  - `setJoseRequestStatus(requestId, status): JoseRequest`
  - `getJoseRequest(id)`, `listJoseRequests()` (newest first)
  - `markRunningRequestsInterrupted(): number` (used at boot by phase 5;
    covered here)

- [ ] **Step 1: Write failing tests:** create → steps are `waiting`; update one step to `running`; list is newest first; 201 creations keep 200; `markRunningRequestsInterrupted` turns `running` into `interrupted` and returns the count.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): requests are saved with their steps`.

### Task 6: The router and the pipeline run step graphs

**Files:**
- Modify: `src/services/joseCommandRouterService.ts` (`JoseCommandAssignment` about line 74; `createJoseCommandRoute` about line 555; packet creation about line 590)
- Modify: `src/services/joseExecutionEngineService.ts` (wave loop from about line 1299; `PIPELINE_MAX_ASSIGNMENTS`/`PIPELINE_MAX_DURATION_MS`)
- Modify: `src/services/agentOutputStoreService.ts` (add a step-keyed write)
- Test: `src/test/services/jose/joseStepGraphPipeline.test.js`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  - `JoseCommandAssignment` gains `stepId: string`, `effects: JoseEffect[]`
    and `needs: string[]`. Explicit assignments may set them; otherwise:
    - `stepId` = `agent` (or `agent-2`, … for repeats);
    - `effects = inferEffects(actionType)`;
    - `needs = legacyNeeds(...)`.
  - `requiresApproval` becomes `effectsNeedingApproval(effects).length > 0 || Boolean(row.requiresApproval)`:
    a backend row asking for approval still asks. Packets get `effects`.
  - The pipeline runs `checkPlan` first; on problems it returns
    `{ ok: false, reason: 'plan_rejected', problems }` and records a receipt.
    It then runs `buildStepWaves`, gives each step the outputs of the steps it
    `needs` as `priorOutputs` (keyed by agent, as today), and records a
    request (Task 5) with step statuses.
  - The duration limit is `JOSE_LIMITS.normalMs`; the step limit is
    `JOSE_LIMITS.maxSteps`. The existing `budget_exceeded` result and receipt
    are kept.
  - `setStepOutput(commandId: string, stepId: string, agent: string, output)`
    writes by step **and** by agent (the agent key holds that agent's latest
    step), so `getAllAgentOutputs()` callers such as the content factory keep
    working.

- [ ] **Step 1: Write failing tests** (same mock setup as `src/test/joseExplicitAssignments.test.js`):
  - explicit assignments with two `miya` steps (`script`, then `revise` needing `script`) both run in order, and both outputs are stored;
  - an assignment with `effects: ['publish_or_send']` ends as pending approval while `['read']` runs;
  - an explicit plan with a cycle returns `reason: 'plan_rejected'` and runs nothing;
  - a request record exists with each step's final status;
  - a free-text command still runs its agents in today's order (hector before miya).
- [ ] **Step 2: Run** it plus every Jose suite: `npx vitest run src/test/joseExecutionEngineService.test.js src/test/joseCommandRouterService.test.js src/test/josePipelineE2E.test.js src/test/joseZeroCostRouting.test.js src/test/joseExplicitAssignments.test.js src/test/services/contentFactory/`. Expected: the new tests FAIL; the others PASS.
- [ ] **Step 3: Implement.** Replace `buildExecutionPlan` in the pipeline with the step graph. Keep `buildExecutionPlan` exported for any other caller (check with `grep`).
- [ ] **Step 4: Run** the same command. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(jose): run plans as step graphs`.

### Task 7: Agent profile fixes

**Files:**
- Modify: `src/agents/{marcus,maria,miya,hector,nova,jose,sentinel}/…Profile.js`
- Test: `src/test/agents/agentProfiles.test.js` (create)

**Interfaces:**
- Consumes: the permission table (Task 2).
- Produces: corrected `purpose`, `strengths` and `limitations` per design
  section 7:
  - **Marcus:** distribution, publishing, release notes, engagement only. No
    security or risk strengths.
  - **Maria:** governance, risk, quality review against references,
    acceptance criteria. No roadmap or backlog.
  - **Miya:** UI/UX **and** content creation (scripts, visuals, thumbnails,
    campaigns) **and** front-end design and code drafts.
  - **Hector:** finds facts and sources (including competitors' public
    material). Remove "research backend may be not wired".
  - **Nova:** judges value, priority and timing.
  - **Remove inaccurate runtime labels:** Jose's `runtime: 'Hermes'` and
    Hector's `runtime`/`runtimeName: 'OpenFang'`.
  - **Sentinel:** security and safety only.

- [ ] **Step 1: Write failing tests:**
  - no profile's strengths overlap another agent's role words (Marcus has no "security"/"risk"; Maria has no "roadmap"/"backlog");
  - Miya's purpose mentions "content" and "front-end";
  - Hector's limitations do not mention "not wired";
  - no profile has a `runtime` naming Hermes or OpenFang;
  - every profile's limitations agree with the table (`run` only Alphonso's).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Edit the profiles.** Check every place that renders a profile field (`grep -rn "runtimeName\|\.runtime\b" src/components`) and keep its display working.
- [ ] **Step 4: Run** it plus `npx vitest run src/test/agentSkills.test.js src/test/ecosystemHub.test.jsx`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(agents): profiles say what each agent really does`.

### Task 8: Settings → Approvals table

**Files:**
- Modify: `src/components/SettingsView.tsx` (under the Approval Mode switch, about line 1181)
- Test: extend `src/test/SettingsView.smoke.test.jsx`

**Interfaces:**
- Consumes: `JOSE_EFFECTS`, `EFFECT_LABELS`, `LOCKED_EFFECTS` and `DEFAULT_EFFECT_APPROVALS` (Task 1).
- Produces: one row per effect, each a switch labelled
  `Ask before: <label>` (`role="switch"`), saving
  `settings.effectApprovals[effect]`.
  - Locked rows are disabled, always on, with the note "Always asks".
  - With Approval Mode off, unlocked rows are disabled, with the note
    "Approval Mode is off: only the locked ones ask".

- [ ] **Step 1: Write failing tests:**
  - the switch `Ask before: Spend money` is checked and disabled;
  - clicking `Ask before: Run code and commands` calls `setSettings` with `effectApprovals.run === false`;
  - with `approvalMode: false`, that switch is disabled.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it, `npx tsc --noEmit` and `npm run lint`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat(settings): approvals per kind of action`.

### Task 9: Real app, docs and PR

**Files:**
- Modify:
  - `CLAUDE.md`: new rows for `src/services/jose/*`, the permission table,
    approvals by effect, and the Settings Approvals table. Update the
    contracts row and the Jose pipeline notes (the fixed agent order is now
    only for the splitter's tasks).
  - `docs/CHANGELOG.md`.
  - `docs/governance/DEFERRED_WORK.md`: in the Jose entry, problems 1, 2 and
    4 are addressed by phase 1; problem 3 (loops) is phase 4.
  - `docs/qa/DESKTOP_QA_COVERAGE.md`.
  - `docs/DO_NOT_DUPLICATE.generated.md`; counts via
    `node scripts/verify-doc-counts.mjs`.

- [ ] **Step 1: Run the full unit suite** `npm test`. Expected: all pass.
- [ ] **Step 2: Build the desktop app** (`npm run tauri build -- --debug --no-bundle`). Run the desktop specs `jose-approval`, `chat`, `content-factory` (with `qwen2.5:7b`), `boardroom` and `smoke`. Expected: pass. Jose approval still pending → approved → executed.
- [ ] **Step 3: Update docs, run** `generate:dnd-map`, `verify-doc-counts`, `verify:dnd-coverage`, `verify:skill-matrix`.
- [ ] **Step 4: Self-review the whole branch** (the owner's no-helper-agents rule). Fix Critical and Important findings test-first.
- [ ] **Step 5: Commit, push, open the PR, merge when CI is green.**
