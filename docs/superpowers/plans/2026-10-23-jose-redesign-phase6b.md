# Jose redesign phase 6b: the content factory as one Jose request — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Miya Studio project runs as one Jose request from the Content video template (with real review loops and a stop for your approval), each Studio tab can still redo its own step, Chat can start a project, and nothing outside Jose calls the old pipeline.

**Architecture:** Plan steps can carry the content factory's data (`contentStep`) and a reason to wait for you (`waitFor`). The Content video template becomes the factory's own 11 steps; the factory builds the plan from it and runs it through `submitStepsToJose()`. As each agent's step finishes, the engine hands its result to the factory, which saves the step's version, writes the project folder and makes the pictures, so a request carried on later (board, Telegram, Carry on) saves its work too.

**Tech Stack:** TypeScript, React, Vitest, WebdriverIO desktop E2E (Tauri 2).

**Spec:** `docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md` (§9 "the content factory, whose steps become one request from the Content video template, with real review loops"; §10 phase 6). Content factory design: `docs/superpowers/specs/2026-10-22-miya-content-factory-design.md`.

## Owner decisions (2026-10-23)

1. **Run project** runs research → script → review → scenes → thumbnails → campaign → quality to the end, stopping where you must approve. Each Studio tab keeps **Run this step** to redo just that step; later steps show Out of date; nothing reruns by itself.
2. **Reviews:** the agents' review loop runs first (up to 2 rounds); then you still get Approve / Send back after Review and after Quality, as today.
3. **From Chat:** a content-video request creates a Miya Studio project for your default brand with the idea from your message, runs it, and links to it in Miya Studio and on the board.
4. **Old pipeline:** nothing outside Jose may call `createJoseCommandRoute` / `runJoseCommandExecutionPipeline`; a test fails on a new caller; the code stays as Jose's engine.
5. (Earlier) Studio tabs show the project's request.

## Global Constraints

- Reuse what exists (CLAUDE.md Do Not Duplicate): no second content pipeline, no model call from a component, `generateAgentLlmResponse` for every model call.
- No silent fallback: a step with no usable answer fails and says why (content factory phase 1 rule).
- No hardcoded models, paths or brands; the output folder comes from Settings (`requireOutputRoot()`).
- Every phase keeps the full unit suite and the desktop E2E suite green and adds desktop specs for what it changes.
- Plain user-facing copy; task previews must not contain "publish", "post", "send" or "execute" (`CONTENT_TASK_PREVIEW` note).
- Keep each file's stored line endings (repo is LF; App.tsx is CRLF).

## Review Focus

1. A project request carried on from the board or Telegram (not from Miya Studio) must still save each step's version and pictures — the save cannot live in the Studio's own run call.
2. Approving the review on the board (instead of in Miya Studio) must leave the Studio showing the review approved, not still "Waiting for your approval".
3. A review-loop revision (`script-fix-1`) must save as a new script version and the re-review as a new review version, with the findings in Miya's prompt.
4. Chat with no output folder chosen, or a brand with no name, must say what to do instead of failing silently.
5. Run project while a step of the same project is already running must not start a second request.

---

### Task 1: Steps that carry the factory's data, and steps that wait for you

**Files:**
- Modify: `src/services/jose/stepGraph.ts` (`PlanStep`), `src/services/jose/submitToJose.ts` (`toAssignments`, `submitStepsToJose`), `src/services/joseCommandRouterService.ts` (`requiresApproval`), `src/services/jose/joseReviewLoop.ts` (`planReviewRound`), `src/services/jose/joseAdapt.ts` (paid retry copy), `src/services/jose/joseTelegram.ts` (step waiting message)
- Test: `src/test/services/jose/stepGraph.test.ts` or `joseStepGraphPipeline.test.js`, `joseReviewLoop.test.ts`, `submitToJose.test.js`, `joseTelegram.test.ts`

**Interfaces:**
- Produces: `PlanStep.contentStep?: ContentStepPayload` (type from `contentTypes.ts`), `PlanStep.waitFor?: string` (plain reason shown while it waits); `submitStepsToJose({ …, saveDecisions?: boolean })`.

- [ ] **Step 1: Failing tests**
  - `submitToJose.test.js` "given steps keep their content data and wait reason": `submitStepsToJose` with a step `{ …, contentStep: P, waitFor: 'Approve the review in Miya Studio first.' }` → `pipeline.mock.calls[0][0].assignments[0]` has `contentStep: P`, `waitFor` the same, and `saveDecisions: false` is passed when given.
  - `joseStepGraphPipeline.test.js` "a step with a wait reason waits for approval even when its effects do not": a `read` step with `waitFor` → request status `waiting_approval`, that step `waiting_approval`, the step before it `done`.
  - `joseReviewLoop.test.ts` "a revision and its re-reviews keep their content data": `planReviewRound` on a reviewed step with `contentStep: { step: 'script' }` and reviews with `contentStep: { step: 'review' }` → the revision's `contentStep` equals the original's, each re-review's equals its review's.
  - `joseTelegram.test.ts` "a step waiting for you says why": a waiting step with `waitFor` → the message contains the `waitFor` text.
- [ ] **Step 2: Run them** — `npx vitest run src/test/services/jose/` → FAIL on the new tests.
- [ ] **Step 3: Implement.** `toAssignments` passes `contentStep` and `waitFor`; the router's `requiresApproval` is also true when `assignment.waitFor` is set; `planReviewRound` and the paid retry copy `contentStep` like `model`; `submitStepsToJose` passes `saveDecisions` through (default true); `collectJoseNotifications` uses `waitFor` as the step's "what it will do" line when present.
- [ ] **Step 4: Run** `npx vitest run src/test/services/jose/` → PASS.
- [ ] **Step 5: Commit** `feat(jose): steps carry the content factory's data and a reason to wait`.

### Task 2: The engine hands each finished content step to the factory

**Files:**
- Create: `src/services/contentFactory/contentStepRecorder.ts`
- Modify: `src/services/contentFactory/contentAgentExecutor.ts` (live prior, the revision's findings), `src/services/joseExecutionEngineService.ts` (call the recorder after a content step's output is saved)
- Test: `src/test/services/contentFactory/contentStepRecorder.test.ts`, `contentAgentExecutor.test.ts`

**Interfaces:**
- Produces: `recordContentStepResult(input: { projectId: string; step: StepId; agent: string; data: unknown; commandId: string | null }): Promise<'partial' | 'saved' | 'ignored'>` — collects agent results per factory step (`STEP_AGENTS[step]`), and when every agent of that step has one: `saveStepVersion()`, the step's markdown and `project.json` in the folder, then `renderScenePictures` / `renderThumbnails` for scenes / thumbnail (settings read from `alphonso_settings`). Partial results live on the step state as `pendingAgents: Record<agent, unknown>` and are cleared on save, on `startStep`, and on `failStep`.
- Consumes: Task 1 (`contentStep` on assignments).

- [ ] **Step 1: Failing tests**
  - "saves a step once all its agents have answered": research with hector then nova → first call `'partial'` (no version), second `'saved'`, version 1 with `output: { hector, nova }`.
  - "a single-agent step saves at once": script → `'saved'`.
  - "an unknown project is ignored" → `'ignored'`.
  - "scenes make their pictures after saving" (mock `renderScenePictures`) → called with the project id.
  - "running scenes marks a review still waiting as approved" (Review Focus 2): review `needs_approval`, then a scenes result → review `approved`.
  - `contentAgentExecutor.test.ts` "uses the project's current outputs, not the ones from when the plan was made": payload `prior` is empty, the project's chosen script exists → the prompt contains the script text. "a revision's findings reach the prompt" (Review Focus 3): assignment `instruction` ending "Fix what the review found: - Shorter hook" → prompt contains "Shorter hook".
  - `joseStepGraphPipeline.test.js` "a finished content step is handed to the factory": mock the recorder; a content step that completes → called with its `projectId`, `step`, `agent`, data and the command id.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Executor: rebuild `prior` from `getProject(projectId)` chosen versions of earlier steps (fall back to the payload when the project is gone); append the text after "Fix what the review found:" in `assignment.instruction` to the task. Engine: after `setStepOutput` for an assignment with `contentStep` and a `content_step_output` artifact with data, `await` the recorder (dynamic import, errors logged to the step's progress, never thrown). Recorder as in Interfaces; marking review approved happens when a `scenes` result arrives.
- [ ] **Step 4: Run** `npx vitest run src/test/services/contentFactory/ src/test/services/jose/` → PASS.
- [ ] **Step 5: Commit** `feat(content): the engine saves each content step as it finishes`.

### Task 3: The Content video template is the factory's plan

**Files:**
- Modify: `src/services/jose/joseTemplates.ts` (`content_video` steps)
- Create: `src/services/contentFactory/contentProjectPlan.ts`
- Test: `src/test/services/contentFactory/contentProjectPlan.test.ts`, `src/test/services/jose/joseTemplates.test.ts`

**Interfaces:**
- Produces: `CONTENT_TEMPLATE_STEPS: Record<string, StepId>` (template step id → factory step: `research_trends`→research (hector), `research_market`→research (nova), `script`, `review_value`/`review_quality`→review, `scenes`, `thumbnail`, `campaign`, `timing`→campaign (nova `strategy_timing`), `quality`/`security`→quality); `contentProjectPlanSteps(project: ContentProject, brand: ContentBrand, from?: StepId, options?: { only?: boolean }): PlanStep[]` (`only`: just that factory step's template steps) — the template's steps from `from` (default research) onward, each with `contentStep` (projectId, factory step, brief, brand, `prior: {}`, task = the template instruction), `scenes` with `waitFor: 'Approve the review in Miya Studio first.'`, `needs` from the template; `REVIEW_WAIT = 'Approve the review in Miya Studio first.'`.

- [ ] **Step 1: Failing tests**
  - "the template has the factory's steps in order": `getTemplate('content_video').steps.map(s => s.stepId)` equals `['research_trends','research_market','script','review_value','review_quality','scenes','thumbnail','campaign','timing','quality','security']`; reviews have `reviewOf: 'script'`; agents and action types equal `STEP_AGENTS` (contentStepRunner) for each factory step.
  - "a project's plan carries the project and waits before scenes": every step has `contentStep.projectId === project.id`; `scenes.waitFor === REVIEW_WAIT`; nothing else has `waitFor`; `checkPlan(steps, { taskTypes: true }).ok` is true.
  - "from a later step the plan starts there": `from: 'scenes'` → first step `scenes` with `needs: []` and no `waitFor`.
  - "a step's plan alone drops links to steps that are not in it": `contentProjectPlanSteps(project, brand, 'review', { only: true })` → the two review steps, `needs: []`, no `reviewOf` (the script is not in this run), and `checkPlan` ok.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the template steps (instructions in plain words, effects `read` for reviews/research/quality/security, `write_own_work` for Miya's steps) and the builder.
- [ ] **Step 4: Run** `npx vitest run src/test/services/contentFactory/ src/test/services/jose/` → PASS (update the planner/template tests that counted 6 steps).
- [ ] **Step 5: Commit** `feat(content): the Content video template is the factory's plan`.

### Task 4: Run project, Run this step, and Approve through the request

**Files:**
- Modify: `src/services/contentFactory/contentStepRunner.ts`, `src/services/contentFactory/contentProjectService.ts` (`joseRequestId`, `pendingAgents`), `src/services/contentFactory/contentTypes.ts`, `src/services/contentFactory/contentQualityGate.ts` (send back goes through `runContentStep`)
- Test: `src/test/services/contentFactory/contentStepRunner.test.ts`

**Interfaces:**
- Produces: `runContentProject(projectId: string, options: RunStepOptions): Promise<{ ok: boolean; requestId: string | null; reason?: string }>`; `runContentStep(projectId, step, options)` (same signature) now one request through `submitStepsToJose`; `approveContentStep(projectId: string, step: StepId): Promise<ContentProject>`; `ContentProject.joseRequestId?: string | null` (the latest request for this project); `PROJECT_LABEL = 'Steps set by Miya Studio.'`.
- Consumes: Tasks 1–3.

- [ ] **Step 1: Failing tests**
  - "Run project submits the template's steps labelled, without Echo saving each step": `submitStepsToJose` called with `source: 'content-factory'`, `label: PROJECT_LABEL`, `saveDecisions: false`, 11 steps; the project's `joseRequestId` is the returned request id.
  - "Run project refuses while a step of the project is running" (Review Focus 5) → `{ ok: false, reason: 'A step of this project is already running.' }`, nothing submitted.
  - "Run project needs the idea and the output folder" → reasons "Write the idea in the brief first." / the `requireOutputRoot` message.
  - "Run this step submits just that step's agents" → steps are only that factory step's template steps, no `waitFor`.
  - "Approve after review carries the request on": project request waiting with `scenes` waiting → `approveContentStep(id, 'review')` sets review `approved` and calls `approveRequestStep(requestId, 'scenes')`; when nothing waits, only the status changes.
  - Existing runner tests that read `getAllAgentOutputs` after the pipeline are rewritten: the step's version comes from the recorder.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `runContentStep`: same checks as today, then `submitStepsToJose` with the step's template steps (`contentProjectPlanSteps` filtered to that factory step, `needs: []`, the extra task appended); the result's failures/waits set the step status as today; versions are saved by the recorder. Remove the direct `runJoseCommandExecutionPipeline` import.
- [ ] **Step 4: Run** `npx vitest run src/test/services/contentFactory/ src/test/components/miya/` → PASS.
- [ ] **Step 5: Commit** `feat(content): a project runs as one Jose request`.

### Task 5: Miya Studio shows the request

**Files:**
- Modify: `src/components/miya/ContentFactoryPanel.tsx` (or `ContentProjectBar.tsx`: **Run project** button), `src/components/miya/StepPanel.tsx` (Approve → `approveContentStep`), `src/components/MiyaStudio.tsx` + `src/App.tsx` (`onOpenJoseBoard` prop)
- Test: `src/test/components/miya/ContentFactoryPanel.test.tsx`, `StepPanel.test.tsx`

**Interfaces:**
- Produces: `ContentFactoryPanel` prop `onOpenJoseBoard?(requestId: string)`; `selectContentProject(brandId: string, projectId: string): void` (writes the panel's last-selection key) exported from `ContentFactoryPanel.tsx` for Task 6.

- [ ] **Step 1: Failing tests**
  - "Run project runs the whole project" → `runContentProject` called with the project id.
  - "shows the project's request and opens it on the board": a project with `joseRequestId` and that request waiting → text "Waiting for your approval" and a button "Open on the board" that calls `onOpenJoseBoard(requestId)`.
  - StepPanel "Approve goes through the request" → `approveContentStep(projectId, step)`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; App passes `onOpenJoseBoard` to MiyaStudio as it does to ChatView.
- [ ] **Step 4: Run** `npx vitest run src/test/components/miya/ src/test/MiyaStudio*` → PASS.
- [ ] **Step 5: Commit** `feat(miya): Run project, and the project's request on the board`.

### Task 6: A content video from Chat becomes a project

**Files:**
- Create: `src/services/contentFactory/contentFromChat.ts`
- Modify: `src/services/jose/submitToJose.ts` (before planning), `src/components/ChatView.tsx` (an "Open in Miya Studio" button), `src/App.tsx` (`onOpenContentProject`)
- Test: `src/test/services/contentFactory/contentFromChat.test.ts`, `submitToJose.test.js`, `ChatView.test.jsx`

**Interfaces:**
- Produces: `startContentProjectFromChat(text: string, settings: { outputFolder?: string | null }): Promise<{ ok: boolean; projectId?: string; requestId?: string | null; note: string }>` — default brand `ensureFirstBrand()`, project name from the idea (first 60 characters), brief idea = the text, then `runContentProject`. `submitToJose` result gains `contentProjectId`.
- Consumes: Task 4 `runContentProject`, Task 5 `selectContentProject`.

- [ ] **Step 1: Failing tests**
  - "a request that fits the Content video template starts a project for the default brand": `submitToJose({ text: 'Make a YouTube video script about home coffee' })` → `startContentProjectFromChat` called, planner not called, result `{ contentProjectId, requestId, planNote: 'Started the Miya Studio project "…" for <brand>.' }`.
  - "without an output folder it says to choose one" (Review Focus 4) → `{ ok: false, note: 'Choose an output folder in Settings first, then ask again.' }`, no project created.
  - ChatView "shows Open in Miya Studio for a content project" → clicking calls `onOpenContentProject(projectId)`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** In `submitToJose`, after the shortcuts: `scoreTemplateFit(text)` best is `content_video` with score ≥ `TEMPLATE_FIT_THRESHOLD` and `!planFresh` → the factory path. App's `onOpenContentProject` calls `selectContentProject` and switches to Miya Studio on Script Studio. Remove `CONTENT_VIDEO_STUDIO_NOTE` use for this path.
- [ ] **Step 4: Run** `npx vitest run src/test/services/ src/test/ChatView.test.jsx` → PASS.
- [ ] **Step 5: Commit** `feat(chat): a content video request starts a Miya Studio project`.

### Task 7: Nothing outside Jose calls the old pipeline

**Files:**
- Create: `src/test/joseEntryPoints.test.js`

- [ ] **Step 1: Write the test** "only Jose's own files call the old entry points": scan `src/**/*.{ts,tsx,js,jsx}` except `src/test/`; any file other than `src/services/joseExecutionEngineService.ts`, `src/services/joseCommandRouterService.ts` and `src/services/jose/**` containing `createJoseCommandRoute(` or `runJoseCommandExecutionPipeline(` fails, naming the file.
- [ ] **Step 2: Run** → PASS once Task 4 removed the runner's call (FAIL before; confirm by reverting the runner change locally if needed).
- [ ] **Step 3: Commit** `test(jose): nothing outside Jose calls the old pipeline`.

### Task 8: Docs, real app, PR

- CLAUDE.md (content factory rows: one request, the recorder, `contentProjectPlan`, `contentFromChat`; `PlanStep.contentStep` / `waitFor`; the guard test; desktop spec count), CHANGELOG, DEFERRED_WORK (close the phase 2 note about Chat content videos; content factory phases 2–4 stay), QA coverage, counts, dnd map.
- Desktop: `e2e-desktop/specs/content-project.e2e.mjs` — Run project with a real model: the request is on the board labelled "Steps set by Miya Studio.", it stops at "Approve the review in Miya Studio first." after the reviews, Approve in Miya Studio carries it on to Scenes; Chat "Make a YouTube video script about home coffee" creates a project and "Open in Miya Studio" opens it. Plus `content-factory`, `jose-loops`, `jose-board`, `chat`, `smoke`.
- Self-review; PR; merge when green.
