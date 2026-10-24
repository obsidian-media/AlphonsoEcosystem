# Jose redesign, phase 6a: every caller goes through Jose — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every place that sends work to Jose (Telegram, WhatsApp, the phone, schedules, Boardroom, workflows, the batch orchestrator, the Orchestrator page) goes through Jose's decision and planner, as Chat does; plus the three items folded in by the owner.

**Architecture:** One entry for messages from anywhere, `answerOrPlan()` in `jose/joseInbound.ts` (decide → a direct answer, or `submitToJose()`), and one for callers that already know the steps, `submitStepsToJose()` in `submitToJose.ts` (an explicit plan, saved as a request, run like any other). Callers stop using `createJoseCommandRoute` / `runJoseCommandExecutionPipeline` directly; the content factory and removing the old entry are phase 6b.

**Tech Stack:** TypeScript/React (Vitest), WebdriverIO desktop specs.

**Spec:** `docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md` §9–10 (phase 6), plus the owner's decisions below.

## Global Constraints

- Owner decisions (2026-10-23):
  - Schedules: never show the plan first; steps that need approval wait and Telegram tells you; a schedule never uses a paid model.
  - Folded in: requests still waiting keep their steps' work until they finish or expire; show what each executed step produced (QA Bug 4); a live paid-model check (the owner supplies a key; typed into Settings, never in code, env of the app, or logs).
  - WhatsApp and phone approvals/notifications are NOT in phase 6 (owner did not choose them); those callers still move onto Jose.
  - Content factory: phase 6b (Studio tabs become views of one request).
- Earlier rules stand: Jose never executes; locked effects always ask; Boardroom agent replies stay direct chat; hardcode nothing the user chooses.
- Repo rules: LF; docs in the same commits; doc-count, dnd-map, dnd-coverage, skill-matrix checks.

## Review Focus

1. **A message from Telegram/WhatsApp/the phone that only needs an answer.** Expected: a direct answer is sent back, no request is created. Pinned in Task 2.
2. **A bigger plan from a remote channel with "Show plan first".** Expected: it waits; the reply says where to approve it (Telegram's plan message, or the board). Pinned in Task 2.
3. **A schedule whose step needs approval, with paid models allowed in Settings.** Expected: the step waits, no paid step is added or planned. Pinned in Task 1 and Task 4.
4. **A request waiting for days while 50+ other requests run.** Expected: its earlier steps' work is still there when you approve. Pinned in Task 6.
5. **A step that produced files, and one that produced only text.** Expected: the board shows the file names and the text (cut), never a raw JSON dump. Pinned in Task 7.

---

### Task 1: The two entry points

**Files:** Create `src/services/jose/joseInbound.ts`; modify `src/services/jose/submitToJose.ts`, `josePlanner.ts`, `joseAdapt.ts`, `joseExecutionEngineService.ts`. Test: `src/test/services/jose/joseInbound.test.ts`, `submitToJose.test.js`, `joseStepGraphPipeline.test.js`, `josePlanner.test.ts`.

**Interfaces:**
- `answerOrPlan(text: string, options: { source: string; history?; endpoint?; zeroCostMode?; showPlanFirst?: 'always'|'bigger'|'never'; allowPaidModels?: boolean; onProgress? }): Promise<{ kind: 'answer'; text: string } | { kind: 'request'; requestId: string | null; waitingForPlan: boolean; result: any }>` — `decideJoseRoute()`; direct → Alphonso's model with `CHAT_ASSISTANT_PROMPT` (empty reply → error); plan → `submitToJose`.
- `submitToJose` and `runApprovedPlan` accept `allowPaidModels` (default true), saved in `runOptions`; the planner gets `{ allowPaidModels }` and offers no paid model when false; the pipeline passes it to `adaptPlan` (`AdaptContext.allowPaidModels`), which then adds no paid retry.
- `submitStepsToJose({ text, source, steps: PlanStep[], kind?, label: string, endpoint?, zeroCostMode?, onProgress? })`: `checkPlan` with task types; runs the steps as an explicit plan with `planInfo: { source: 'given', templateId: null, note: label }`; `describePlanSource` gives the label (e.g. "Steps set by Boardroom.").
- [ ] Tests first: a plain question answers; a task makes a request; `allowPaidModels: false` → planner prompt has no paid model and a failing step gets no `-paid` step; `submitStepsToJose` runs given steps in order and saves `plan.source = 'given'`; a given plan that breaks the rules is refused with its problems.
- [ ] Implement; run Jose suites; commit `feat(jose): one entry for messages from anywhere, one for given steps`.

### Task 2: Telegram, WhatsApp and the pollers

**Files:** `telegramCompanionService.js` (free text and `/ask`, `/research`), `whatsappCompanionService.ts` (free text and `/ask`), `connectors/connectorPolling.js` (both routed paths), `telegramAutoPollService.ts` (`/ask` and free text). Test: `src/test/connectors/telegramJose.test.js`, the WhatsApp companion test, `connectorPolling` tests.
- Each calls `answerOrPlan(text, { source })` once and replies: the answer text; or "Jose is on it. I'll tell you when it's done." (Telegram) / "Jose is on it." (WhatsApp); or, when the plan waits, "Jose's plan is waiting for you" + (Telegram) "— see the message with Run / Cancel" / (others) "— on the board in the app".
- [ ] Tests first (Review Focus 1, 2): a question gets an answer and no request; a task creates a request; a plan that waits says where; `/ask` and free text go the same way; no path calls `createJoseCommandRoute`.
- [ ] Implement; run; commit `feat(channels): Telegram and WhatsApp go through Jose`.

### Task 3: The phone companion

**Files:** `src/App.tsx` (the `ios_companion` command handler). Test: `src/test/appCompanionJose.test.js` (source-reading, as `appBootInterrupted.test.js`) and a unit test of the extracted `handleCompanionCommand(text, deps)` in `src/services/companionCommandService.ts`.
- Move the handler body into `handleCompanionCommand`; it uses `answerOrPlan` and keeps the `companion_broadcast` progress events and abort; the answer or "Jose is on it" goes back as today's reply event.
- [ ] Tests first; implement; commit `feat(phone): the phone companion goes through Jose`.

### Task 4: Schedules

**Files:** `src/App.tsx` (`runCommand`), `joseSchedulerService.ts` if the result shape needs it. Test: `src/test/services/joseSchedulerService.test.js` (result mapping) and a unit test of the extracted `runScheduledCommand(text, settings)` in `src/services/scheduledCommandService.ts`.
- `runScheduledCommand` = `answerOrPlan(text, { source: 'schedule', showPlanFirst: 'never', allowPaidModels: false })`; maps to today's `lastResult` (`done` / `waiting_approval` / `failed`, summary, details).
- [ ] Tests first (Review Focus 3): never waits for a plan; a waiting step → `waiting_approval`; no paid model; a direct answer → `done` with the text.
- [ ] Implement; commit `feat(schedules): schedules go through Jose, never paid, never plan-first`.

### Task 5: Boardroom, workflows, the batch orchestrator, the Orchestrator page

**Files:** `BoardroomChatView.tsx` (Creative brief, Conclude, Distribute), `workflowRegistryService.ts` (agent-chain run), `batchOrchestratorService.js`, `OrchestratorView.tsx` (Command tab "send to jose"). Tests: their existing tests, updated; `e2e-desktop/specs/jose-approval.e2e.mjs` updated to the request flow.
- Boardroom: Creative brief = `submitStepsToJose` with one Miya `creative_brief` step (label "Steps set by Boardroom."); Conclude = one Maria `audit_governance` step whose output fills `setThreadGovernance()` as today; Distribute = Marcus `distribution_execution` (`publish_or_send`, waits by effect) or "review only" (`read`). The thread note links the request ("Open on the board").
- Workflows: an agent chain becomes given steps, each needing the previous one. Batch: each task goes through `answerOrPlan` (or given steps when the task names an agent). Orchestrator Command: `answerOrPlan`, then opens the Requests tab on the new request.
- [ ] Tests first for each; implement; commit per caller group.

### Task 6: Waiting requests keep their work

**Files:** `src/services/jose/joseStepOutputs.ts`. Test: `joseStepOutputs.test.ts`.
- When pruning to the last 50 commands, keep any command whose request is `waiting_approval`, `waiting_plan_approval`, `interrupted` or `running`.
- [ ] Test first (Review Focus 4): 60 later commands don't remove a waiting request's outputs; a done one beyond 50 is removed. Implement; commit `fix(jose): a waiting request keeps its steps' work`.

### Task 7: What a step produced

**Files:** `src/components/jose/JoseStepOutput.tsx` (new), `JoseRequestsBoard.tsx` (selecting a step in the map shows it). Test: `src/test/components/jose/JoseStepOutput.test.tsx`.
- Shows the step's summary, files written (names, from artifacts with a path), sources (titles/links), and the text of its output through `toReadableText()` cut at 2,000 characters with "Show all"; "Nothing was saved for this step." when there is no output.
- [ ] Tests first (Review Focus 5); implement; commit `feat(board): see what each step produced`.

### Task 8: Live paid-model check

**Files:** `e2e-desktop/specs/jose-paid-live.e2e.mjs`.
- Skipped unless `ALPHONSO_LIVE_ANTHROPIC_API_KEY` (or `ALPHONSO_LIVE_OPENAI_API_KEY`) and `ALPHONSO_LIVE_PAID_INPUT_PRICE`, `ALPHONSO_LIVE_PAID_OUTPUT_PRICE` are set (the key names end in `_KEY`, so the harness keeps them out of the app). Types the key into Connectors, allows paid models with Zero-Cost Mode off, enters the prices and a $0.10 cap; saves a waiting plan with one step on the paid model; runs it, approves the spend step on the board; checks the step is done, "Spent this month" is above $0.00, and a second step past the cap is refused with the cap message.
- [ ] Write; run when the owner provides a key; record the result.

### Task 9: Docs, real app, PR

- CLAUDE.md (`joseInbound`, `submitStepsToJose`, `companionCommandService`, `scheduledCommandService`, `JoseStepOutput`, the callers), CHANGELOG, DEFERRED_WORK (close phase-6a items; WhatsApp/phone approvals stay open), QA coverage, counts.
- Desktop: `jose-callers.e2e.mjs` (a schedule's Run now creates a request; the Orchestrator Command creates one and opens it on the board; a Boardroom Creative brief shows "Open on the board"), plus `jose-approval` (updated), `jose-loops`, `jose-board`, `boardroom`, `chat`, `smoke`.
- Self-review; PR; merge when green.
