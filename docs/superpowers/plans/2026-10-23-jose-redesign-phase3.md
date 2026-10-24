# Jose Redesign Phase 3 (Seeing and Steering) Implementation Plan

> **Status (2026-10-25):** built and merged in PR #338 (phase 3); on `main`, not released yet. The current behaviour is in `CLAUDE.md`'s Jose rows and `docs/USER_MANUAL.md` section 5.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jose's plans become visible and steerable:
- a live board on the Orchestrator page draws each request as boxes and arrows;
- bigger requests show their plan first, and you can approve, edit or cancel it from Chat or the board;
- a plan can be saved as a template.

The phase also closes three gaps phase 2 left open by mistake.

**Architecture:**
- Pure services in `src/services/jose/`: plan-first rules, plan edits, user templates and the map layout. The UI components use them.
- `submitToJose()` can stop after planning, with the request saved as `waiting_plan_approval`. `runApprovedPlan()` checks the possibly edited steps and runs them on the phase 1 step graph, updating the same saved request.
- Every plan, the simple rule-based one included, now runs as explicit steps.
- The map is laid out from `buildStepWaves()`: one column per wave, with SVG arrows and no new dependency.

**Tech Stack:** TypeScript, React, the UI kit in `src/components/ui`, Vitest, WebdriverIO desktop E2E.

**Spec:** `docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md` (§2.4 saving a plan as a template, §2.5 plan shown first, §2.11 and §8 the live board, §10 phase 3). Earlier phases: `docs/superpowers/plans/2026-10-23-jose-redesign-phase1.md` and `…-phase2.md` (PRs #336, #337).

## Gaps from the deferred-work list closed here

Phase 1's leftovers said two of these were "for the planner phase"; phase 2 did not do them. They block running every plan as steps, so they come first.

- **Task types the contracts never allowed:**
  - Jose's `boardroom_*` and `cost_policy_enforcement`;
  - Hector's `external_publish_handoff`, blocked by his own `external_publish` prefix.
- **The rule-based plan still runs a step after an earlier one failed** (the old path). Here the simple plan becomes explicit steps too.
- **Settings shows Approval Mode off when the setting is unset,** while the policy treats unset as on.

## Global Constraints

- Reuse:
  - the step graph, `checkPlan` and `buildStepWaves` (`jose/stepGraph.ts`);
  - `joseRequestStore.ts`, `josePlanner.ts`, `joseTemplates.ts` and `submitToJose.ts`;
  - the UI kit barrel `src/components/ui`;
  - the agent colour tokens `var(--agent-<id>)`;
  - the shell's approval flow (`executeApprovedPackets`, `ApprovalPanel`).
- No new npm dependency for the map.
- No hardcoded models, paths or risk ratings.
- Build target Safari 13.1 (no `Object.hasOwn`, no `crypto.randomUUID`).
- New files LF; keep each existing file's line endings as stored in git.
- English only, plain words in the UI.
- Every phase keeps the unit and desktop suites green and adds desktop specs for what it changes.
- Jose never executes; editing a plan never bypasses the rule check or the approval gates.

## Review Focus

1. **An edited plan that breaks the rules:** a removed step that others need, a cycle, or Miya given `run`.
   - Expected: it can't be approved. The problems show in plain words. Removing a step also removes it from the other steps' `needs`.
   - Pinned in Tasks 3 and 6.
2. **A plan approved or cancelled twice:** two clicks, or Chat and the board at once.
   - Expected: it runs once. A cancelled plan can't be run.
   - Pinned in Task 4.
3. **The app closes while a plan waits for approval.**
   - Expected: it is still waiting at the next start, not marked interrupted. Only `running` requests are interrupted.
   - Pinned in Task 2.
4. **A saved template with the same name as another, or no word in common with a request.**
   - Expected: it is saved under a unique id, and it is offered only when its words fit.
   - Pinned in Task 3.
5. **A request with many steps, or a long instruction.**
   - Expected: the map stays inside its panel (it scrolls), and the text is cut with "…" and shown in full on hover.
   - Pinned in Task 5.

---

### Task 1: Close the planner gaps: contracts, every plan as steps, Approval Mode display

**Files:**
- Modify:
  - `src/services/jose/agentPermissionTable.ts`: Jose's `taskTypes` gain `boardroom_` and `cost_policy_`. `isTaskTypeAllowed` lets an **exact** entry in `taskTypes` win over a blocked prefix; add `external_publish_handoff` to Hector's `taskTypes`.
  - `src/services/agentContractService.ts`: `validateAgentExecutionContract` uses `isTaskTypeAllowed` for the task-type part, so both checks agree.
  - `src/services/jose/submitToJose.ts`: a `rules` plan runs as explicit steps like any other.
  - `src/components/SettingsView.tsx`: the Approval Mode switch reads `settings.approvalMode !== false`, as the policy does.
- Test: `src/test/services/jose/agentPermissionTable.test.ts`, `src/test/services/jose/submitToJose.test.js`, `src/test/SettingsView.smoke.test.jsx`

**Interfaces:**
- Produces:
  - `isTaskTypeAllowed(agent, taskType)`: true if each `+` part is in `taskTypes` exactly; otherwise false if it starts with a blocked prefix; otherwise true if it starts with an allowed prefix.
  - `submitToJose` no longer calls the pipeline without assignments.

- [ ] **Step 1: Write failing tests:**
  - `isTaskTypeAllowed('jose', 'boardroom_planning')`, `('jose', 'cost_policy_enforcement')` and `('hector', 'external_publish_handoff')` are true;
  - `('hector', 'external_publish')` is still false, and `('miya', 'execute_command')` still false;
  - `validateAgentExecutionContract({ toAgent: 'hector', actionType: 'external_publish_handoff', effects: ['read'] })` passes;
  - a `rules` plan → the pipeline gets `assignments` with the plan's step ids;
  - with `settings = {}` the "Toggle approval mode" switch reports `aria-checked="true"`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Update the phase 2 test that expected a rules plan to run without assignments, with a ledger ruling.
- [ ] **Step 4: Run** `npx vitest run src/test/services/jose/ src/test/agentContractService.test.js src/test/services/agentContract.test.ts src/test/SettingsView.smoke.test.jsx src/test/joseExecutionEngineService.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(jose): every plan runs as steps; contracts allow the splitter's task types`.

### Task 2: Requests that wait for plan approval

**Files:**
- Modify: `src/services/jose/joseRequestStore.ts`
- Create: `src/services/jose/josePlanApproval.ts`
- Test: `src/test/services/jose/joseRequestStore.test.ts`, `src/test/services/jose/josePlanApproval.test.ts`

**Interfaces:**
- Produces, in `joseRequestStore.ts`:
  - `JoseRequestStatus` gains `'waiting_plan_approval'` and `'cancelled'`.
  - `JoseRequest` gains `changeLog: { atMs: number; text: string }[]` and `runOptions?: { source: string; previewMode?: boolean; zeroCostMode?: boolean; endpoint?: string }`.
  - `createWaitingPlanRequest({ text, source, kind, steps, plan, runOptions }): JoseRequest`: id `jose-request-plan-<time36>-<random36>`, using `Math.random`, as `agentBusService` ids do.
  - `replacePlanSteps(requestId, steps, reason): JoseRequest`: allowed only while `waiting_plan_approval`; appends `reason` to `changeLog`.
  - `claimPlanForRun(requestId): JoseRequest | null`: atomically `waiting_plan_approval` → `running`; null otherwise.
  - `cancelJoseRequest(requestId): JoseRequest`: only from `waiting_plan_approval`.
  - `markRunningRequestsInterrupted` still touches only `running`.
- Produces, in `josePlanApproval.ts`:
  - `type PlanFirstSetting = 'always' | 'bigger' | 'never'`.
  - `getPlanFirstSetting(): PlanFirstSetting`: `alphonso_settings.showPlanFirst`, default `'bigger'`.
  - `needsPlanApproval(steps: PlanStep[], setting = getPlanFirstSetting()): boolean`:
    - `always` → true; `never` → false;
    - `bigger` → true when the distinct agents in the steps, plus `jose` and `maria`, number 4 or more (owner), or any step has a locked effect (`LOCKED_EFFECTS`).

- [ ] **Step 1: Write failing tests:**
  - a waiting request survives `markRunningRequestsInterrupted()` (Review Focus 3);
  - `claimPlanForRun` returns the request once and null the second time (Review Focus 2);
  - `cancelJoseRequest` then `claimPlanForRun` → null;
  - `replacePlanSteps` on a running request throws;
  - `replacePlanSteps` adds a change-log line;
  - `needsPlanApproval`:
    - two steps by Hector and Nova → true (Hector, Nova, Jose, Maria is 4);
    - one Hector step → false;
    - one Marcus `publish_or_send` step → true;
    - `never` → false; `always` → true.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/test/services/jose/`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): requests can wait for plan approval`.

### Task 3: Editing a plan, and saving it as a template

**Files:**
- Create: `src/services/jose/josePlanEdits.ts`, `src/services/jose/joseUserTemplates.ts`
- Modify: `src/services/jose/joseTemplates.ts` (`scoreTemplateFit` and `getTemplate` include user templates)
- Test: `src/test/services/jose/josePlanEdits.test.ts`, `src/test/services/jose/joseUserTemplates.test.ts`

**Interfaces:**
- Produces, in `josePlanEdits.ts` (pure; every function returns a new array):
  - `removeStep(steps, stepId)`: also removes `stepId` from every other step's `needs`;
  - `addStep(steps, { agent, actionType, instruction, needs })`: `stepId` = `<agent>-<n>`, unique in the plan; `effects = inferEffects(actionType)`;
  - `changeStepAgent(steps, stepId, agent)`: keeps the task type;
  - `setStepNeeds(steps, stepId, needs)`;
  - `setStepInstruction(steps, stepId, text)`.
  - A change that breaks the rules is not refused here; the caller runs `checkPlan` and shows the problems.
- Produces, in `joseUserTemplates.ts` (`alphonso_jose_user_templates_v1`):
  - `saveUserTemplate({ name, kind, steps, requestText }): JoseTemplate`:
    - id `user_<slug>`, with `-2`, `-3`, … when taken;
    - `matchWords` = two groups: the name's words, and the request's words of 4+ letters, minus a short stop list, at most 8.
  - `listUserTemplates()`, `deleteUserTemplate(id)`.
  - `getTemplate`/`scoreTemplateFit` treat built-in and user templates the same.

- [ ] **Step 1: Write failing tests:**
  - removing a step that another needs leaves that step valid (`checkPlan` passes);
  - `addStep` twice for Nova gives distinct ids;
  - a cycle made with `setStepNeeds` fails `checkPlan` (Review Focus 1);
  - `changeStepAgent` to Miya on a step with `run` fails `checkPlan`;
  - saving "Launch video" twice gives `user_launch-video` and `user_launch-video-2` (Review Focus 4);
  - a saved template fits a request sharing its words and not an unrelated one;
  - deleting removes it from `scoreTemplateFit`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/test/services/jose/`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): edit a plan, and save it as a template`.

### Task 4: Stop after planning, and run an approved plan

**Files:**
- Modify:
  - `src/services/jose/submitToJose.ts`;
  - `src/services/joseExecutionEngineService.ts`: `runJoseCommandExecutionPipeline` accepts `existingRequestId`, and then updates that request (steps reset to `waiting`, status `running`) instead of creating one.
- Test: `src/test/services/jose/submitToJose.test.js`, `src/test/services/jose/joseStepGraphPipeline.test.js`

**Interfaces:**
- Produces:
  - `submitToJose(input & { showPlanFirst?: PlanFirstSetting })`. When `needsPlanApproval(plan.steps, input.showPlanFirst)`, it saves `createWaitingPlanRequest(...)` and returns `{ waitingForPlan: true, requestId, plan, planNote }` without running.
  - `runApprovedPlan(requestId: string, options?: { onProgress?; onToken?; history? }): Promise<PipelineResult & { plan: JosePlan; planNote: string }>`:
    1. `claimPlanForRun`; null → `{ ok: false, reason: 'This plan is no longer waiting.' }`;
    2. `checkPlan(request.steps)`; problems → back to `waiting_plan_approval`, returning `{ ok: false, reason: 'plan_rejected', problems }`;
    3. otherwise the pipeline with the steps as assignments and `existingRequestId`.
  - `cancelPlan(requestId)` = `cancelJoseRequest`.

- [ ] **Step 1: Write failing tests:**
  - a two-agent plan with the setting `bigger` → `waitingForPlan`, the pipeline not called, and the request `waiting_plan_approval`;
  - `runApprovedPlan` runs it once; a second call → "no longer waiting" (Review Focus 2);
  - an edited plan with a cycle → `plan_rejected`, still waiting;
  - `cancelPlan`, then `runApprovedPlan` → "no longer waiting";
  - the pipeline with `existingRequestId` updates that request (one request in the store, status from the run).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus the Jose suites (Phase 2 Task 4 command). Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): show the plan first and run it when approved`.

### Task 5: The plan map

**Files:**
- Create: `src/services/jose/josePlanLayout.ts`, `src/components/jose/JosePlanMap.tsx`
- Test: `src/test/services/jose/josePlanLayout.test.ts`, `src/test/components/jose/JosePlanMap.test.tsx`

**Interfaces:**
- Produces, in `josePlanLayout.ts`:
  - `layoutPlan(steps: PlanStep[], box = { width: 168, height: 64, gapX: 48, gapY: 20 }): { nodes: { stepId: string; col: number; row: number; x: number; y: number }[]; edges: { from: string; to: string }[]; width: number; height: number }`.
  - Columns are `buildStepWaves()` order, and rows the order within a wave. For a plan that fails `checkPlan`, steps are placed in their list order with no edges, never thrown.
- Produces `JosePlanMap({ steps: JoseRequestStep[] | PlanStep[]; compact?: boolean; selectedStepId?: string; onSelectStep?: (id) => void })`:
  - one box per step: the agent's name and colour (`var(--agent-<id>)` border), the task type, the instruction cut to 2 lines with the full text in `title`, the status, and the elapsed time when started;
  - a "Waiting for you" badge on `waiting_approval`;
  - SVG arrows for `needs`;
  - an outer `overflow-auto` box, with `role="img"` and an `aria-label` summarising the steps.
  - `compact` shows agent and status only.

- [ ] **Step 1: Write failing tests:**
  - `layoutPlan` for the Content video template → 4 columns (both research steps, the script, both reviews, the campaign), with edges equal to its `needs`;
  - a cycle → no throw, one row per step, no edges;
  - the map renders one box per step;
  - a `waiting_approval` step shows "Waiting for you";
  - a 300-character instruction is cut, with the full text in `title` (Review Focus 5);
  - `compact` hides instructions.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** with the UI kit and Tailwind tokens; no new dependency.
- [ ] **Step 4: Run them;** `npx tsc --noEmit`; `npm run lint`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat(jose): draw a plan as boxes and arrows`.

### Task 6: The live board, the Chat card and the setting

**Files:**
- Create: `src/components/jose/JoseRequestsBoard.tsx`, `src/components/jose/JosePlanEditor.tsx`, `src/components/jose/JosePlanCard.tsx`
- Modify:
  - `src/components/OrchestratorView.tsx`: a "Requests" tab, first in the list, with optional `initialTab` and `selectedRequestId` props;
  - `src/App.tsx`: it remembers the request to open and passes `onOpenJoseBoard(requestId)` to ChatView. That switches to the Orchestrator page (the tab id App uses for `OrchestratorView`) with the Requests tab and that request.
  - `src/components/ChatView.tsx`: a `waitingForPlan` result shows `JosePlanCard`; a run shows its progress line with "Open on the board".
  - `src/components/SettingsView.tsx`: "Show Jose's plan first" (Always / Bigger requests only / Never), saved as `settings.showPlanFirst`, passed from Chat to `submitToJose`.
- Test: `src/test/components/jose/JoseRequestsBoard.test.tsx`, `src/test/components/jose/JosePlanEditor.test.tsx`, `src/test/ChatView.test.jsx`, `src/test/SettingsView.smoke.test.jsx`, `src/test/components/OrchestratorView.test.tsx`

**Interfaces:**
- Consumes: Tasks 2–5.
- **Board:**
  - the list of `listJoseRequests()` (text, status, how planned, time), refreshed every 2 s while the tab is open;
  - for the selected request: `JosePlanMap`, the plan note, the change log, and buttons by status:
    - waiting: **Run this plan**, **Edit**, **Cancel**;
    - any: **Save as template** (asks for a name).
- **Editor:** for a waiting plan:
  - remove a step;
  - add a step (agent from `AGENT_PERMISSION_TABLE`, task type, instruction, needs);
  - change a step's agent, needs (checkboxes) or instruction;
  - live `checkPlan` problems.
  - **Save changes** calls `replacePlanSteps` with a plain reason ("Removed Nova's step"). It is disabled while there are problems (Review Focus 1).
- **Chat card:** `JosePlanCard({ requestId })` shows the compact map, the plan note, and **Run this plan**, **Edit on the board** and **Cancel**.
  - **Run this plan** calls `runApprovedPlan`, and the result is shown as Chat shows any Jose result today.
  - Both the card and the board use the same functions, so whichever is clicked first runs it.

- [ ] **Step 1: Write failing tests:**
  - the board lists a waiting request and shows its map and the three buttons;
  - **Run this plan** calls `runApprovedPlan` once, even on a double click;
  - **Cancel** shows the request as cancelled;
  - the editor's **Save changes** is disabled for a cycle, and saving a removal adds a change-log line;
  - Chat shows the card for a `waitingForPlan` result, and **Run this plan** shows the run's summary;
  - the Settings select saves `showPlanFirst`, and Chat passes it on;
  - the Orchestrator page opens on Requests when `initialTab="requests"`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them plus `src/test/ChatView.test.jsx src/test/chatViewRehydration.test.jsx`, `npx tsc --noEmit`, `npm run lint`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat(jose): the live board, the plan card in Chat, and the plan-first setting`.

### Task 7: Real app, docs and PR

**Files:**
- Create: `e2e-desktop/specs/jose-board.e2e.mjs`. It skips without a model and uses `qwen2.5:7b` when installed:
  1. with the setting `always`, a request in Chat shows the plan card with a map;
  2. **Edit on the board** opens the Orchestrator page on Requests with that request;
  3. removing a step and saving adds a change-log line;
  4. **Run this plan** runs it, and the board shows the steps' statuses changing to done;
  5. with `never`, a request runs without a card.
- Modify:
  - `CLAUDE.md`: rows for the new services and components; the Orchestrator page row; the desktop E2E counts.
  - `docs/CHANGELOG.md`.
  - `docs/governance/DEFERRED_WORK.md`: mark the three gaps above closed; correct phase 1's "unify in the planner phase (2)" note; list what is left for phases 4–6.
  - `docs/qa/DESKTOP_QA_COVERAGE.md`, `docs/DO_NOT_DUPLICATE.generated.md`, and the counts.
- [ ] **Step 1: Run** `npm test`. Expected: all pass.
- [ ] **Step 2: Build** `npm run tauri build -- --debug --no-bundle`. **Run** `jose-board`, `jose-planner`, `chat`, `jose-approval`, `content-factory`, `boardroom` and `smoke`. Expected: pass.
- [ ] **Step 3: Update docs.** Run `generate:dnd-map`, `verify-doc-counts`, `verify:dnd-coverage`, `verify:skill-matrix`.
- [ ] **Step 4: Self-review** the whole branch (no helper agents, owner's rule). Fix Critical and Important findings test-first.
- [ ] **Step 5: Commit, push, open the PR, merge when CI is green.**
