# Jose Redesign Phase 4 (Loops and Adaptation) Implementation Plan

> **Status (2026-10-25):** built and merged in PR #339 (phase 4); on `main`, not released yet. The current behaviour is in `CLAUDE.md`'s Jose rows and `docs/USER_MANUAL.md` section 5.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jose's plans adapt while they run:
- a review that finds problems sends the work back to its author, up to 2 rounds;
- an agent can ask for help through Jose;
- Jose picks the model for each step, and tries a larger installed model when a step keeps failing.

Also folded in from the deferred-work list (owner, 2026-10-23):
- Marcus's leftover security skill packs, and giving Alphonso a planned step's instruction safely;
- after you approve a waiting step, the request carries on;
- "Open on the board" while a request runs;
- Echo saves what was decided;
- paid models, which you allow, with prices you enter and an optional monthly cap.

**Architecture:**
- The step-graph runner stops computing all waves up front. It repeatedly runs the steps whose needs are done, so the plan can grow while it runs.
- After each wave, pure planners in `src/services/jose/` decide what to add:
  - review rounds (`joseReviewLoop.ts`);
  - help requests (`joseHelp.ts`).
- The runner checks every change with `checkPlan()`, creates the new packets, and records each change in the request's change log.
- Models: a per-step override that `generateAgentLlmResponse` reads, and one escalation attempt inside `executeAssignmentWithRetries`.

**Tech Stack:** TypeScript, Vitest, WebdriverIO desktop E2E, Ollama through `generateAgentLlmResponse`.

**Spec:** `docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md`:
- §2.6 changes while running;
- §2.7 help requests;
- §2.8 review loops;
- §2.12 failures;
- §2.13 model per step;
- §2.14 limits;
- §5 step fields `reviewOf`/`round`/`model`;
- §8 loop arrows;
- §10 phase 4.

Earlier phases: PRs #336, #337, #338.

## Owner decisions carried into this phase

- 2 fix rounds, then Jose asks the user (owner: Q8; limit `JOSE_LIMITS.maxFixRounds`).
- Help goes through Jose; a change that adds an always-ask effect waits for approval, and other changes appear on the map with a note (design §2.6, §13).
- On failure: retry, then the same agent with a larger installed model, then ask the user. No two agents share a skill, so a failed step is never handed to another agent (owner: Q15).
- Jose chooses the model per step from installed local models; per-agent settings stay as the default and the limit (owner: Q18).
- Marcus's two security skill packs and Alphonso's step instruction belong to this phase (owner, 2026-10-23).
- Also folded in (owner, 2026-10-23):
  - resuming a request after a step is approved (was phase 5);
  - the board link while a request runs;
  - Echo saving decisions (design §4 step 7);
  - paid models with a monthly cap (design §2.12–2.14).
- Money: zero by default. Spending always asks and shows the expected cost. An optional monthly cap is set in Settings (design §2.14).

## Global Constraints

- Reuse:
  - `checkPlan`, `JOSE_LIMITS` and the effect gate (phases 1–3);
  - `generateAgentLlmResponse`;
  - `fetchOllamaModels` (installed models);
  - the request store's change log;
  - `createAgentPacket` (via the router);
  - the DLQ in `executeAssignmentWithRetries`.
- No hardcoded models: a model is always one the user has installed, or the configured one.
- **Paid models only with the user's say-so:**
  - Settings → "Allow paid models" is on (off by default), Zero-Cost Mode is off, and a price per million input and output tokens has been entered for that model.
  - No prices are built in (no hardcoded prices).
  - A paid step always has the locked `spend` effect, so it waits for approval with its expected cost.
  - A paid call that would pass the monthly cap is refused.
- A step added while running may only `read` or `write_own_work` unless the plan check and the effect gate allow more. An added always-ask effect waits for approval like any step.
- A model's words never become user intent: help questions and review findings are instructions to agents, never commands Alphonso runs without the per-command check.
- Build target Safari 13.1. New files LF; keep each file's stored line endings. English only.
- Unit and desktop suites stay green; desktop specs are added for what changes.

## Review Focus

1. **A reviewer that always asks for changes.**
   - Expected: exactly 2 revision rounds, then a note asking the user. Never more steps.
   - Pinned in Task 4.
2. **A review or help answer that isn't usable JSON, or a helper agent that doesn't exist.**
   - Expected: a review counts as passed (noted). A help request falls back to the rule choice, or is dropped with a note. Never a crash.
   - Pinned in Tasks 4 and 5.
3. **A help request, perhaps text injected from a web page Hector read, asking for publishing, spending, deleting or running code.**
   - Expected: helper steps may only read or create new files; anything else is refused with a note.
   - Pinned in Task 5.
4. **Growth past the limits:** 50 steps, or the time limit.
   - Expected: the addition is refused with a note, and the run finishes normally.
   - Pinned in Task 3.
5. **No larger model installed, or the agent uses NVIDIA, Gemini or Hermes.**
   - Expected: no escalation, and a plain message saying what was tried.
   - Pinned in Task 1.
6. **Paid models when the cap is reached, no price entered, or Zero-Cost Mode is on.**
   - Expected: the paid model is not offered or not used. A plain reason is given. No money is spent.
   - Pinned in Task 9.
7. **A step approved twice, or approved after its request was cancelled or finished.**
   - Expected: the request carries on once. A finished or cancelled request doesn't run again.
   - Pinned in Task 6.

---

### Task 1: Model per step, and a larger model when a step keeps failing

**Files:**
- Modify:
  - `src/lib/ollama.ts`: add `withAgentModel(agentId, model, fn)` and `getAgentModelOverride(agentId)`. The Ollama branch of `generateAgentLlmResponse` uses `options.model || getAgentModelOverride(agentId) || getConfiguredOllamaModel()`.
  - `src/services/joseExecutionEngineService.ts`, in `executeAssignmentWithRetries`:
    - a step with a `model` runs inside `withAgentModel` and passes `options.model`;
    - after the retries fail, one more attempt with `pickLargerModel`, before the DLQ write.
- Create: `src/services/jose/joseModels.ts`
- Test: `src/test/services/jose/joseModels.test.ts`, `src/test/lib/ollamaAgentModel.test.ts`, `src/test/services/jose/joseStepGraphPipeline.test.js`

**Interfaces:**
- Produces, in `joseModels.ts`:
  - `modelSize(name: string): number | null`, the parameter count in billions from the tag (`qwen2.5:7b` → 7, `qwen3:0.6b` → 0.6, `llama3.2:latest` → null);
  - `pickLargerModel(current: string, installed: string[]): string | null`, the smallest installed model larger than `current`; null when none, or when either size is unknown;
  - `listInstalledModels(): Promise<string[]>`, from `fetchOllamaModels(getConfiguredOllamaEndpoint())`; `[]` on error.
- Behaviour:
  - Escalation applies only when the agent's provider (`getAgentProvider(agent)`) is `ollama`.
  - The result gains `escalatedTo: model` on success.
  - On final failure the error is: `"Tried <n> times<, and with <model>>; it still failed: <error>. Tell me how to go on."`

- [ ] **Step 1: Write failing tests:**
  - `modelSize` for the three examples;
  - `pickLargerModel('llama3.2:3b', ['qwen3:0.6b', 'llama3.2:3b', 'qwen2.5:7b', 'qwen2.5:14b'])` → `qwen2.5:7b`;
  - none larger → null (Review Focus 5);
  - `withAgentModel('nova', 'qwen2.5:7b', fn)` makes `generateAgentLlmResponse('nova', …)` call Ollama with that model, `('hector', …)` with the configured one, and nothing is left over afterwards;
  - in the pipeline, a step that fails every retry is tried once more with the larger model and succeeds; the step is done and the result says `escalatedTo`;
  - with the agent's provider set to `gemini`, no escalation happens (Review Focus 5);
  - a step with `model: 'qwen2.5:7b'` makes its agent's calls use that model.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `PlanStep` gains `model?: string` in `stepGraph.ts`.
- [ ] **Step 4: Run** them plus the Jose suites. Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): a model per step, and a larger model when a step keeps failing`.

### Task 2: Jose picks the model for each step

**Files:**
- Modify:
  - `src/services/jose/josePlanner.ts`: the prompt lists the installed models from `listInstalledModels()` and asks for an optional `"model"` per step. A model not installed, or for an agent whose provider isn't `ollama`, is dropped.
  - `src/components/jose/JosePlanMap.tsx`: shows the step's model.
- Test: `src/test/services/jose/josePlanner.test.ts`, `src/test/components/jose/JosePlanMap.test.tsx`

**Interfaces:**
- `planJoseRequest` mocks `listInstalledModels` in tests (`vi.mock('../../../services/jose/joseModels')`).

- [ ] **Step 1: Write failing tests:**
  - an installed `model` is kept;
  - a model that isn't installed is dropped;
  - the prompt names the installed models;
  - the map shows `qwen2.5:7b` on a step that has it.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/test/services/jose/ src/test/components/jose/`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): Jose picks the model for each step`.

### Task 3: A runner whose plan can grow

**Files:**
- Modify:
  - `src/services/joseExecutionEngineService.ts`: replace the fixed `waves` loop with a ready-step loop, plus `applyPlanChange(...)`. Each pass runs every unprocessed step whose `needs` are all processed. After each pass, the run asks `adaptPlan` for changes.
  - `src/services/joseCommandRouterService.ts`: export `createStepPacket(command, assignment)`, the packet creation now inside `createJoseCommandRoute`, which also uses it.
  - `src/services/jose/joseRequestStore.ts`: add `addRequestSteps(requestId, steps, reason)` (appends steps as `waiting`, and the reason to the change log) and `rewireRequestNeeds(requestId, from: string[], to: string[])`.
  - `src/services/jose/josePlanEdits.ts`: add pure `rewireNeeds(steps, from: string[], to: string[])`. A not-yet-run step that needs any id in `from` needs all of `to` instead.
- Create: `src/services/jose/joseAdapt.ts`
- Test: `src/test/services/jose/joseStepGraphPipeline.test.js`, `src/test/services/jose/josePlanEdits.test.ts`

**Interfaces:**
- Produces:
  - `interface PlanChange { add: PlanStep[]; rewire?: { from: string[]; to: string[] }; reason: string }`.
  - `adaptPlan(ctx: { steps: PlanStep[]; done: Record<string, { status: string; output?: any }>; justRan: string[] }): Promise<PlanChange[]>`, in `joseAdapt.ts`. In this task it returns `[]`; Tasks 4 and 5 fill it. Tests replace it through an exported `setPlanAdapterForTests(fn | null)`.
  - `applyPlanChange`: refuses a change whose result fails `checkPlan`, or that would pass `JOSE_LIMITS.maxSteps`, adding the note `"Not added: <first problem>"`. Otherwise it creates the packets, adds the steps to the run and the request, rewires, and logs `reason`.
- Behaviour: an explicit plan's "needs not finished → not run" rule (phase 1) still applies to added steps.

- [ ] **Step 1: Write failing tests:**
  - with an adapter that adds `extra` (Nova, needs `a`) after `a` runs, `extra` runs after `a`, and the request shows it with the reason in the change log;
  - an adapter that adds a cycle → not added, with a "Not added" note, and the run still finishes;
  - an adapter that would pass 50 steps → not added (Review Focus 4);
  - `rewireNeeds` moves a later step from needing `r` to needing `r2`;
  - all phase 1–3 pipeline tests still pass.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the Jose suites (the Phase 2 Task 4 command plus `src/test/services/jose/`). Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): the plan can grow while it runs`.

### Task 4: Review loops

**Files:**
- Create: `src/services/jose/joseReviewLoop.ts`
- Modify:
  - `src/services/jose/stepGraph.ts`: `PlanStep` gains `reviewOf?: string`, `round?: number`, `revises?: string`;
  - `src/services/jose/joseTemplates.ts`: review steps get `reviewOf` (content video: `review_value` and `review_quality` of `script`; build an app: `security` and `quality` of `build`; research report: `review` of `analysis`);
  - `src/services/jose/josePlanner.ts`: the prompt allows `reviewOf`;
  - `src/services/jose/joseAdapt.ts`: calls the review loop;
  - `src/components/jose/JosePlanMap.tsx`: "Round n" on revised and re-review steps.
- Test: `src/test/services/jose/joseReviewLoop.test.ts`, `src/test/services/jose/joseStepGraphPipeline.test.js`

**Interfaces:**
- Produces:
  - `judgeReview(review: PlanStep, output: any): Promise<{ verdict: 'pass' | 'fix'; findings: string[]; note?: string }>`. It asks the reviewer agent's model for JSON `{"verdict","findings"}` about its own review text. An unusable answer counts as `pass`, with `note: "Couldn't read the review's verdict; carried on."`
  - `planReviewRound(steps: PlanStep[], judged: { review: PlanStep; verdict: 'pass' | 'fix'; findings: string[] }[], maxRounds = JOSE_LIMITS.maxFixRounds): { changes: PlanChange[]; notes: string[] }` (pure). For each author with at least one `fix` among the reviews just run:
    - if `round < maxRounds`:
      - add one revision step: author's agent, task type and effects; `stepId` `<author>-fix-<round+1>`; `needs` = the author step plus those reviews; `revises` = the original author; `round` = round+1; `instruction` = the author's instruction plus `"Fix what the review found:"` and the findings;
      - add one re-review per reviewer of that author: `stepId` `<review>-r<round+1>`, same agent, type and instruction, `needs` = the revision, `reviewOf` = the revision, `round` = round+1;
      - rewire later steps from the reviews to the re-reviews;
    - otherwise the note `"The review still found problems after <maxRounds> rounds: <findings>. Tell me what to change, or use it as it is."`, which goes into the request's change log and the final reply.

- [ ] **Step 1: Write failing tests:**
  - one `fix` → a revision and a re-review are added, and the campaign step now needs the re-review;
  - two reviewers of one author, both `fix` → one revision and two re-reviews;
  - `pass` → nothing;
  - a reviewer that always says `fix` → exactly 2 rounds, then the note (Review Focus 1);
  - an unusable `judgeReview` answer → `pass` with its note (Review Focus 2);
  - in the pipeline, a Content-video-shaped plan whose review says `fix` once runs the revision and the re-review before the campaign.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the Jose suites. Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): reviews send work back, up to 2 rounds`.

### Task 5: Help requests through Jose

**Files:**
- Create: `src/services/jose/joseHelp.ts`
- Modify:
  - `src/services/joseExecutionEngineService.ts` (`stepCommandText`): for a planned step other than Alphonso, add `"If you need facts or work from another agent to do this well, add a line starting HELP: saying what you need."`;
  - `src/services/jose/joseAdapt.ts`: calls the help planner.
- Test: `src/test/services/jose/joseHelp.test.ts`, `src/test/services/jose/joseStepGraphPipeline.test.js`

**Interfaces:**
- Produces:
  - `findHelpRequest(output: any): string | null`: the first `HELP:` line in the summary or the text of any artifact; null otherwise.
  - `chooseHelper(question: string, asker: string): Promise<{ agent: string; actionType: string } | null>`:
    - asks Jose's model for JSON `{agent, taskType}`;
    - accepts the answer only if `isTaskTypeAllowed`, the agent isn't the asker, and the task type's effects are only `read`/`write_own_work`;
    - otherwise falls back to keyword rules (facts, sources, research → Hector `research_report`; value, priority, timing → Nova `analysis_findings`; risk, security → Sentinel `security_review`; quality, accuracy → Maria `audit_quality`);
    - null if nothing fits.
  - `planHelp(steps, step: PlanStep, question: string, helper): PlanChange | null` (pure):
    - a helper step `<step>-help`, `needs: []`, `instruction` = the question;
    - a re-run `<step>-again` (same agent and type, `needs` = the step and the helper, `instruction` = the original plus `"Use the help below."`, `helpRound: 1`);
    - later steps rewired from the step to the re-run;
    - null if the step is already a re-run (one help request per step).

- [ ] **Step 1: Write failing tests:**
  - `findHelpRequest` finds a `HELP:` line in a summary and in an artifact, and returns null otherwise;
  - `chooseHelper` keeps a valid model choice, and falls back on unusable JSON (Review Focus 2);
  - a helper asked to publish (Marcus `distribution_execution`) or to run code is refused → null, with the change noted (Review Focus 3);
  - a re-run asking for help again → null;
  - in the pipeline, Miya's step whose output says `HELP: the launch date` gets a Hector helper and a re-run, and the step that needed Miya runs after the re-run.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** `PlanStep` gains `helpRound?: number`.
- [ ] **Step 4: Run** the Jose suites. Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): agents ask each other for help through Jose`.

### Task 6: The request carries on after you approve a step

**Files:**
- Modify:
  - `src/services/joseExecutionEngineService.ts`:
    - move the ready-step loop (Task 3) into `runStepLoop(ctx)`, which the pipeline and the resume both call;
    - add `resumeJoseRequest(requestId, options)`;
    - `executeApprovedPackets` sends a packet that belongs to a saved request to `resumeJoseRequest`; other packets keep today's path.
  - `src/services/jose/joseRequestStore.ts`: `findRequestByPacket(packetId)`, via the request's `commandId` and the step's packet id.
- Test: `src/test/services/jose/joseStepGraphPipeline.test.js`, `src/test/joseExecutionEngineService.test.js`

**Interfaces:**
- Produces: `resumeJoseRequest(requestId: string, options?: { endpoint?; onProgress?; onToken?; history? }): Promise<PipelineResult & { requestId: string }>`:
  - loads the saved command (`listJoseCommands`) and the request;
  - treats `done` steps as finished, with their stored outputs;
  - re-queues `not_run` steps whose needs were only waiting;
  - runs the rest with their existing packets (the approved one now passes the effect gate);
  - updates the request's status;
  - does nothing for a request that is `done`, `failed`, `cancelled` or already `running`.
- Behaviour: `findRequestByPacket` returns null for packets made outside Jose's requests, which keep the old one-packet path.

- [ ] **Step 1: Write failing tests:**
  - a plan whose Marcus step waits: approving it runs it and then the step that needed it, and the request ends `done`;
  - approving twice runs it once (Review Focus 7);
  - a cancelled or finished request is not resumed (Review Focus 7);
  - a packet from outside Jose's requests uses the old path.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the Jose suites. Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): a request carries on after you approve a step`.

### Task 7: "Open on the board" while a request runs

**Files:**
- Modify:
  - `src/services/joseExecutionEngineService.ts`: `onProgress({ stage: 'request_started', requestId })` right after the request is created or attached;
  - `src/components/ChatView.tsx`: the live progress line shows "Open on the board" once it has a request id.
- Test: `src/test/services/jose/joseStepGraphPipeline.test.js`, `src/test/ChatView.test.jsx`

- [ ] **Step 1: Write failing tests:**
  - the pipeline reports `request_started` with the request id before the first step runs;
  - Chat shows "Open on the board" during a run, and clicking it calls `onOpenJoseBoard` with that id.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them plus `src/test/chatViewRehydration.test.jsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(chat): open a running request on the board`.

### Task 8: Echo saves what was decided

**Files:**
- Create: `src/services/jose/joseFinish.ts`
- Modify: `src/services/joseExecutionEngineService.ts` (calls it when a request ends `done` or `waiting_approval`)
- Test: `src/test/services/jose/joseFinish.test.ts`

**Interfaces:**
- Produces `saveRequestDecisions(request: JoseRequest, outputs: Record<string, { summary?: string }>): Promise<{ saved: boolean; note: string }>`:
  - calls `runEchoPreservation(request.text, { packetId: request.id }, outputs)` from `echoMemoryService`;
  - skipped when the plan already had an Echo step;
  - never throws;
  - adds `"Echo saved what was decided."` (or why not) to the change log.

- [ ] **Step 1: Write failing tests:**
  - a finished request calls `runEchoPreservation` once with its text and step outputs;
  - a plan with an Echo step doesn't call it again;
  - an Echo failure is noted and doesn't change the request's status.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the Jose suites. Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): Echo saves what was decided when a request finishes`.

### Task 9: Paid models, which you allow, with a monthly cap

**Files:**
- Create: `src/services/jose/joseSpend.ts`
- Modify:
  - `src/lib/ollama.ts`: `generateAgentLlmResponse` accepts a per-step model `claude:<model>` or `chatgpt:<model>` (through `withAgentModel`). It calls `sendClaudeMessage` / `sendChatGPTMessage`, records the spend from the reported usage, and refuses when `canSpend` says no.
  - `src/services/jose/joseAdapt.ts`: when a step still fails after the local escalation and paid models are available, add a `<step>-paid` step (same agent, type and instruction, paid model, effects plus `spend`, and the expected cost in its instruction note). It waits for approval like any `spend` step.
  - `src/services/jose/josePlanner.ts`: when paid models are available, the prompt may offer them; a step given one gets the `spend` effect.
  - `src/services/joseExecutionEngineService.ts`: the effect-gate reason adds `(about $X.XX)` when a step has `costEstimateUsd`.
  - `src/components/SettingsView.tsx`, under the Approvals table:
    - "Allow paid models" (off by default; says Zero-Cost Mode must be off);
    - the paid model to use (Claude or ChatGPT; each must be set up in Connectors);
    - price per million input and output tokens for it;
    - "Monthly spending cap (USD)" (blank means no cap);
    - this month's spend.
- Test: `src/test/services/jose/joseSpend.test.ts`, `src/test/lib/ollamaAgentModel.test.ts`, `src/test/services/jose/joseStepGraphPipeline.test.js`, `src/test/SettingsView.smoke.test.jsx`

**Interfaces:**
- Produces, in `joseSpend.ts` (settings in `alphonso_settings.paidModels`, the ledger in `alphonso_jose_spend_v1`, one total per calendar month):
  - `getPaidModelSettings(): { allowed: boolean; provider: 'claude' | 'chatgpt' | null; model: string | null; inputPerMillionUsd: number | null; outputPerMillionUsd: number | null; monthlyCapUsd: number | null }`;
  - `paidModelAvailable(): { ok: boolean; reason?: string }`. It needs allowed, Zero-Cost Mode off, the connector configured, and both prices set. Otherwise it gives a plain reason.
  - `estimateCostUsd(promptChars: number, maxOutputTokens: number): number`: input tokens ≈ promptChars ÷ 4; uses the entered prices.
  - `recordSpend(usage: { inputTokens: number; outputTokens: number }): number`: returns this month's total.
  - `monthSpendUsd(): number`;
  - `canSpend(estimateUsd: number): { ok: boolean; reason?: string }`: false when the cap would be passed.

- [ ] **Step 1: Write failing tests:**
  - each case makes `paidModelAvailable()` false, with a reason (Review Focus 6):
    - allowed off;
    - Zero-Cost Mode on;
    - no price;
    - connector missing;
  - `estimateCostUsd` with prices 3 and 15 per million: 4000 chars and 1000 output tokens → 0.003 + 0.015;
  - `recordSpend` adds up within a month and starts again in the next;
  - `canSpend` refuses past the cap (Review Focus 6);
  - `generateAgentLlmResponse('miya', …)` with a `claude:` per-step model calls `sendClaudeMessage` and records the spend; past the cap it refuses without calling;
  - in the pipeline, a step that still fails after the local escalation, with paid available, gets a `-paid` step that waits for approval with "about $" in its reason;
  - with paid not available, no `-paid` step;
  - the Settings controls save `paidModels`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** `PlanStep` gains `costEstimateUsd?: number`.
- [ ] **Step 4: Run** them plus the Jose suites. Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): paid models you allow, with prices you enter and a monthly cap`.

### Task 10: The two moved items

**Files:**
- Modify:
  - **Marcus's security skill packs** (owner: security is Sentinel's, risk review Maria's; Sentinel already has dependency audit and risk scoring, Maria risk classification). Remove `pack.marcus-security-audit` and `pack.marcus-risk-detection` from:
    - `src/services/skillPackContentMarcus.ts`;
    - `src/agents/marcus/marcusProfile.js` (`skillPackIds`);
    - `src/services/agentContractService.ts` (scope overrides);
    - `src/services/skillPackGuidance.ts`.
    - A stale saved install of either id is ignored, not shown.
  - **Alphonso's instruction:** `executeAlphonsoAssignment` passes `options.stepInstruction` to `executeWithBrain`. In `src/services/agentBrainService.js`, `executeWithBrain` adds it to the planning and code-generation prompts only, after the user's request, labelled `Jose's note for this step:`. It is never used by `needsClarification`, the external-tool keyword check or any intent regex.
- Test: `src/test/marcusSkillPacks.test.js`, `src/test/marcusSkillIntegration.test.js` (updated, with a ledger ruling), `src/test/agentBrainCommandApproval.test.js`

- [ ] **Step 1: Write failing tests:**
  - Marcus's packs don't include the two ids, and the skill matrix check passes;
  - a `stepInstruction` that says "send it by email through Gmail", with a neutral request, never reaches the external-tool path (`executeViaComposio` not called), but appears in the planning prompt.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Run `npm run generate:skill-matrix`.
- [ ] **Step 4: Run** `npx vitest run src/test/marcusSkillPacks.test.js src/test/marcusSkillIntegration.test.js src/test/agentBrainCommandApproval.test.js src/test/skillPackService.test.js` and `npm run verify:skill-matrix`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(agents): Marcus drops security packs; Alphonso gets his step's instruction as a note`.

### Task 11: Real app, docs and PR

**Files:**
- Create: `e2e-desktop/specs/jose-loops.e2e.mjs`. It skips without a model and uses `qwen2.5:7b`, with the setting Never:
  - a plan with a Marcus "review only" step that waits (Always): approving it on the board lets the request finish (Task 6);
  - "Open on the board" appears while a request runs (Task 7);
  - a Research report request runs; every review step has a recorded verdict;
  - if the verdict was `fix`, a revision step and a re-review exist and ran before the summary;
  - the board shows "Round 1" on them.
  - The model decides the verdict, so the spec checks the loop's shape, not a fixed verdict.
- Modify:
  - `CLAUDE.md`: rows for `joseModels`, `joseAdapt`, `joseReviewLoop`, `joseHelp`, `joseFinish`, `joseSpend`; the paid-model settings; the pipeline row (ready-step loop); the `generateAgentLlmResponse` row (per-step model); the desktop E2E counts.
  - `docs/CHANGELOG.md`.
  - `docs/governance/DEFERRED_WORK.md`: close review loops, model per step, the two moved items, "the plan can't change while running", the board link while running, and "the saved request isn't updated after an approval" (moved from phase 5). Record that paid models were checked with unit tests only (no paid keys on this machine).
  - `docs/qa/DESKTOP_QA_COVERAGE.md`, `docs/DO_NOT_DUPLICATE.generated.md`, and the counts.
- [ ] **Step 1: Run** `npm test`. Expected: all pass.
- [ ] **Step 2: Build** `npm run tauri build -- --debug --no-bundle`. **Run** `jose-loops`, `jose-board`, `jose-planner`, `chat`, `jose-approval`, `content-factory`, `boardroom` and `smoke`. Expected: pass.
- [ ] **Step 3: Update docs.** Run `generate:dnd-map`, `verify-doc-counts`, `verify:dnd-coverage`, `verify:skill-matrix`.
- [ ] **Step 4: Self-review** the whole branch (no helper agents, owner's rule). Fix Critical and Important findings test-first.
- [ ] **Step 5: Commit, push, open the PR, merge when CI is green.**
