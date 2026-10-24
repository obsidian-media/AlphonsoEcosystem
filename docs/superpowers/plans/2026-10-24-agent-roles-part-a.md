# Agent roles, Part A (owners everywhere, hand-over, summary) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every kind of work has one owner and every path obeys it; every step gets the full work it depends on; reviews judge the draft; Marcus sends the real text; a step whose owner can't work stops and says what to set up; requests end with a short summary.

**Architecture:** The one permission table (`src/services/jose/agentPermissionTable.ts`) becomes the ownership map: no task-type prefix belongs to two agents, plus a plain `owns`/`never` text per agent that every prompt reuses. A new `StepInput` (`src/services/jose/stepInput.ts`) is built by step id from `joseStepOutputs.ts` and passed to every executor. The closing summary is built from the request's steps without a model.

**Tech Stack:** TypeScript/React (Vitest), Python (pytest) for the voice backend.

**Spec:** `docs/superpowers/specs/2026-10-24-agent-roles-skills-handover-design.md` (Part A sections and "The responsibility map").

## Global Constraints

- Owner decisions (2026-10-24): Jose only plans, routes, approves and summarises; Alphonso owns code, commands, project changes, plain questions and everyday writing; Miya owns content and design (incl. editing the finished video), never code; Hector finds facts (incl. stock footage); Nova judges from what Hector found; Maria owns quality, governance and risk; Sentinel owns security; Marcus sends, publishes and places calls; Echo curates memory (agents may save their own notes).
- No hand-off to another agent when the owner can't work. Same-agent retries, larger model and paid retry stay.
- Needed output budget: 6,000 characters per needed step for local models, 20,000 for paid or cloud models; others: at most 12 lines of 160 characters.
- A one-step request shows that step's full output instead of the summary.
- Nothing hardcoded (models, addresses, folders). Plain words in every user-facing string. No em dashes in UI strings is not required, but keep strings short and plain.
- Keep each file's line endings as stored in git (`git ls-files --eol`); never `git add -A` (untracked `.serena/`, `brag-output/` are the owner's).
- Docs change in the same commit as the code (CLAUDE.md Do Not Duplicate rows, Ground Truth, CHANGELOG, AGENT_GUIDE); `node scripts/verify-doc-counts.mjs`, `npm run verify:dnd-coverage`, `npm run verify:dnd-map` pass.
- `src/test/joseEntryPoints.test.js` stays green: new callers use `submitStepsToJose()`.

## Review Focus

1. A request saved before this change (a step `alphonso/runtime_assemble_video`, `jose/orchestration_review` or `jose/orchestration_summary`) is carried on: it runs under the new owner with a change-log line, never refused by `checkPlan()` (Task 2, `movedTaskTypes.test.ts`).
2. A needed step's output is very long or only has a `schema` (no `summary`): the agent still gets readable text, cut with "(cut: N more characters on the board)" (Task 3).
3. A review whose reviewed step failed or saved nothing: the review fails with "Nothing to review: <Agent>'s step saved no work.", it does not pass (Task 4).
4. Marcus is given `payload.text` that is blank: he uses the needed step's text, not the blank (Task 5).
5. A one-step request whose step waits or failed: the summary shows the reason, not an empty answer (Task 8).

---

### Task 1: The ownership map

**Files:**
- Modify: `src/services/jose/agentPermissionTable.ts`
- Modify: `src/services/jose/joseEffects.ts` (`ACTION_EFFECTS`)
- Modify: `src/agents/marcus/marcusProfile.js`, and any profile whose `purpose`/`limitations` contradicts the map (`src/agents/*/*Profile.js`)
- Test: `src/test/services/jose/agentOwnership.test.ts` (new), `src/test/services/jose/agentPermissionTable.test.ts`

**Interfaces:**
- Produces: `AgentPermissions` gains `owns: string` and `never: string` (one plain sentence each, the map's wording). `describeResponsibility(agent: string): { owns: string; never: string } | null`. `ownerOf(taskType: string): string | null` (the one agent whose table allows the task type, `agent_report` excluded; null when none or several). `responsibilityLines(): string[]` (`"<Name> owns …; never …"` for all nine, used by prompts).

- [ ] **Step 1: Write the failing tests** in `agentOwnership.test.ts`:
  - `no task-type prefix belongs to two agents`: for every agent A and every entry p of A's `taskTypes` except `agent_report`, no other agent B has `taskTypePartAllowed(p, B.taskTypes, B.blockedTaskTypes)`.
  - `every known action type has exactly one owner`: `ownerOf(t)` is non-null for every key of `ACTION_EFFECTS` and every `actionType` in `JOSE_TEMPLATES`, `STEP_AGENTS` (`contentStepAgents.ts`) and `WORKFLOW_STEP_TASK` (export it from `workflowRegistryService.ts`), and equals the agent those places give it.
  - `the map`: `ownerOf('assistant_answer') === 'alphonso'`, `ownerOf('creative_assemble_video') === 'miya'`, `ownerOf('design_ui') === 'miya'`, `ownerOf('distribution_readiness') === 'marcus'`, `ownerOf('outreach_call') === 'marcus'`, `ownerOf('risk_review') === 'maria'`, `ownerOf('remote_message_route') === 'jose'`, `ownerOf('orchestration_plan') === 'jose'`, `isTaskTypeAllowed('alphonso','orchestration_plan') === false`, `isTaskTypeAllowed('miya','orchestration_plan') === false`, `isTaskTypeAllowed('jose','research_review') === false`.
  - `describeResponsibility('jose').never` mentions "writing, research or reviews"; every agent has non-empty `owns`.
  - `marcusProfile.skillFocus` contains neither "Security Audit" nor "Risk Detection".
- [ ] **Step 2: Run** `npx vitest run src/test/services/jose/agentOwnership.test.ts` — Expected: FAIL (`ownerOf` not exported).
- [ ] **Step 3: Implement.** Table changes, exactly:
  - jose `taskTypes`: `['orchestration_', 'agent_report', 'remote_message_route', 'boardroom_', 'cost_policy_']`.
  - alphonso: drop `orchestration_`; add `assistant_`.
  - miya: drop `orchestration_`; add `design_`.
  - hector: drop `remote_message_route` and `external_publish_handoff`.
  - maria: add `risk_`. sentinel: drop `risk_`.
  - marcus: add `outreach_`.
  - `ACTION_EFFECTS`: add `assistant_answer: ['read']`, `assistant_write: ['write_own_work']`, `creative_assemble_video: ['write_own_work']`, `creative_image: ['write_own_work']`, `distribution_readiness: ['read']`, `outreach_call: ['publish_or_send', 'spend']`; remove `runtime_assemble_video`, `orchestration_review`, `orchestration_summary`, `external_publish_handoff`.
  - `owns`/`never` text from the spec's table, one sentence each.
  - Fix any table test in `agentPermissionTable.test.ts` that asserted the old lists.
- [ ] **Step 4: Run** the two test files — Expected: PASS. (Task 2 fixes the templates/content factory the second test reads; mark that assertion `it.todo` only if Task 2 is not in this commit, then turn it on in Task 2.)
- [ ] **Step 5: Commit** `feat(jose): one owner per kind of work in the permission table`.

### Task 2: Steps go to their new owners

**Files:**
- Modify: `src/services/jose/joseTemplates.ts` (remove both `orchestration_summary` steps; Miya's `design` step becomes `design_ui` with instruction "Design the screens and the user flow. No code: Alphonso builds it."; Content video template's Nova `analysis_market` step needs Hector's research step)
- Modify: `src/services/contentFactory/contentStepAgents.ts` (`assemble` → `miya` / `creative_assemble_video`), `contentProjectPlan.ts` (Nova's market step needs `research_trends`), `contentStepPrompts.ts` (`analysis_market` judges "Hector's research below"; Hector's `research_virality` also covers competitors), `contentMediaExecutor.ts` (`MEDIA_ACTIONS` key renamed)
- Modify: `src/services/joseCommandRouterService.ts` (splitter: the no-specialist fallback is `alphonso` / `assistant_answer`; the publishing check is `marcus` / `distribution_readiness`)
- Modify: `src/services/joseExecutionEngineService.ts` (`executeJoseAssignment` body moves to `executeAssistantAssignment` for Alphonso's `assistant_*` steps, asking `generateAgentLlmResponse('alphonso', …)`; Jose's `executeAssignment` fallback for an unowned type fails "No agent owns this step's task: <type>."; Hector's `external_publish_handoff` branch moves to Marcus as `distribution_readiness`, publishing nothing)
- Modify: `src/services/marcusExecutionService.ts` (`distribution_readiness`)
- Create: `src/services/jose/movedTaskTypes.ts`
- Test: `src/test/services/jose/movedTaskTypes.test.ts`, `src/test/services/jose/joseTemplates.test.ts`, the content factory plan tests

**Interfaces:**
- Produces: `MOVED_TASK_TYPES: Record<string, { agent: string; actionType: string }>` (`runtime_assemble_video → miya/creative_assemble_video`, `orchestration_review → alphonso/assistant_answer`, `external_publish_handoff → marcus/distribution_readiness`); `moveToOwner(step: PlanStep): { step: PlanStep; moved: string | null }` (returns the step with agent/type moved and a change-log line "Moved <old type> from <Old> to <New>: <New> owns it now.", or `moved: null`); `orchestration_summary` steps are dropped by `dropRetiredSteps(steps)` with their dependants rewired to the dropped step's `needs` (`rewireNeeds()` in `josePlanEdits.ts`).
- Consumes: `ownerOf()` (Task 1).

- [ ] **Step 1: Write the failing tests:** `moveToOwner` on an `alphonso/runtime_assemble_video` step gives `miya/creative_assemble_video` and the line; `dropRetiredSteps` on the old Build-an-app steps removes `summary` and leaves no dangling `needs`; templates have no `orchestration_summary`; Content video template's Nova market step `needs` Hector's research step; `STEP_AGENTS.assemble` is Miya; the splitter's unmatched text ("write a note to my landlord") yields one `alphonso/assistant_answer` assignment; `checkPlan()` accepts every template.
- [ ] **Step 2: Run** them — Expected: FAIL.
- [ ] **Step 3: Implement** the changes listed above. The pipeline calls `moveToOwner` + `dropRetiredSteps` on saved assignments when it runs or resumes (`runJoseCommandExecutionPipeline` with explicit assignments, `resumeJoseRequest`, `carryOnRequest`) and appends each line with `appendRequestNote()`; `submitToJose`/`submitStepsToJose` run them before `checkPlan()`.
- [ ] **Step 4: Run** `npx vitest run src/test/services/jose src/test/services/contentFactory src/test/joseCommandRouterService*` — Expected: PASS; turn on Task 1's `it.todo`.
- [ ] **Step 5: Commit** `feat(jose): steps go to their owners; old saved steps move with a note`.

### Task 3: One input for every step, by step

**Files:**
- Create: `src/services/jose/stepInput.ts`
- Modify: `src/services/jose/joseStepOutputs.ts` (export `StepOutput`; add `outputsForNeeds(commandId, needs): StepOutput[]` in `needs` order)
- Modify: `src/services/joseExecutionEngineService.ts` (build `StepInput` where `priorOutputsForNeeds` is called, pass `options.stepInput` to every executor; `priorOutputs` stays for content-factory and old callers, derived from it)
- Modify: `src/services/mariaAuditService.ts`, `echoMemoryService.ts`, `sentinelSecurityService.ts`, `novaAnalysisService.ts`, `marcusExecutionService.ts`, and Hector's executor in the engine: each prompt builder takes `stepInput` and puts `stepInputText(stepInput)` where the 300-character agent summaries were
- Test: `src/test/services/jose/stepInput.test.ts`, and one test per agent service that its prompt contains a needed step's text

**Interfaces:**
- Produces:
  ```ts
  export interface NeededWork { stepId: string; agent: string; text: string; files: string[]; sources: string[]; cut: number }
  export interface StepInput { instruction: string; request: string; needs: NeededWork[]; others: string[]; memory: string; review: NeededWork | null }
  export const STEP_INPUT_LIMITS = { localChars: 6000, largeChars: 20000, otherLines: 12, otherLineChars: 160 };
  export function buildStepInput(commandId: string, assignment: PlanStep & { instruction?: string }, request: string, opts: { memory?: string; large?: boolean }): StepInput;
  export function readableOutput(output: StepOutput): string; // summary, then toReadableText(schema), then artifact text
  export function stepInputText(input: StepInput): string; // the block agents' prompts include
  ```
  `review` is the `reviewOf` step's output; `others` are the request's other finished steps, newest first, `"<Name>: <summary>"`. `large` is true when the step's model is paid/cloud (`claude:`, `chatgpt:`, provider not `ollama`).
- Consumes: `getStepOutput`, `toReadableText` (`src/lib/readableValue.ts`), `agentName()`.

- [ ] **Step 1: Write the failing tests:** two Miya steps both reach a step needing both (by step id); an 8,000-character output is cut to 6,000 with `cut: 2000` and the text ends "(cut: 2000 more characters on the board)"; `large: true` keeps 20,000; an output with only `schema` gives readable text; `others` caps at 12 lines of 160 characters; Maria's audit prompt built with a `StepInput` contains Miya's draft text; the same for Nova, Sentinel and Echo prompts.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces; `memory` is `retrievedContext.snippet` for every agent.
- [ ] **Step 4: Run** `npx vitest run src/test/services/jose src/test/services src/test/mariaAuditService* src/test/echoMemoryService* src/test/novaAnalysisService* src/test/sentinelSecurityService*` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): every step gets the work it needs, by step`.

### Task 4: Reviews judge the draft

**Files:**
- Create: `src/services/jose/reviewStep.ts`
- Modify: `src/services/joseExecutionEngineService.ts` (a non-content step with `reviewOf` runs `runReviewStep`), `src/services/jose/joseReviewLoop.ts` (`judgeReview` reads `output.schema.verdict`/`findings` first)
- Test: `src/test/services/jose/reviewStep.test.ts`, `joseReviewLoop.test.ts`

**Interfaces:**
- Produces: `runReviewStep(agent: string, input: StepInput, actionType: string): Promise<{ summary: string; resultState: string; artifacts: unknown[]; sources: string[]; schema?: { verdict?: 'pass' | 'fix'; findings?: string[] } }>` (the engine's existing result shape) — prompt: the agent's `owns` line, the step instruction, "The work to review:" + `input.review.text`, and "Answer with JSON only: {\"review\": \"…\", \"verdict\": \"pass\" or \"fix\", \"findings\": [\"…\"]}"; result `{ summary: review, schema: { verdict, findings }, resultState: 'completed' }`. With `input.review` null or empty: `resultState: 'failed'`, summary "Nothing to review: <Agent>'s step saved no work.".

- [ ] **Step 1: Write the failing tests:** the prompt contains the reviewed draft; a model answer with `"verdict":"fix"` gives `schema.verdict === 'fix'` and `judgeReview` returns fix without a second model call (spy on `generateAgentLlmResponse`: called once); no reviewed output → failed with the exact sentence; unreadable answer → the review text kept, verdict missing, `judgeReview` asks as today.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** Content-factory reviews keep their own executor (they already read the draft from the project).
- [ ] **Step 4: Run** `npx vitest run src/test/services/jose` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): reviewers judge the draft and give the verdict in one answer`.

### Task 5: Marcus sends the work

**Files:**
- Modify: `src/services/marcusExecutionService.ts` (`runMarcusDistribution`, `executeMarcusSlackAction`, the GitHub and n8n actions)
- Test: `src/test/services/marcusExecutionService*.test.*` (existing file; add cases)

**Interfaces:**
- Produces: `textToSend(assignment, stepInput: StepInput | null): string | null` — `payload.text` when non-blank, else the first needed step's `text`, else null. Never the instruction or request. Maria's verdict is read from a needed step by Maria, else from Maria's step in the same request (`stepInput.others` are not enough: look up by `getStepOutput`).
- Consumes: `StepInput` (Task 3).

- [ ] **Step 1: Write the failing tests:** Marcus's Slack send gets Miya's post text (mock `slack.sendMessage`, assert the text arg); blank `payload.text` falls back to the needed text; nothing to send → `resultState: 'failed'`, summary "Nothing to send: no earlier step wrote the text.", `sendMessage` not called; Maria's `high` verdict in a needed step still blocks.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `fix(marcus): send what the earlier step wrote, never the instruction`.

### Task 6: When the owner can't work

**Files:**
- Modify: `src/services/jose/joseRequestStore.ts` (`JoseRequestStatus` gains `'waiting_setup'`)
- Modify: `src/services/joseExecutionEngineService.ts` (`isRetryableTaskFailure` treats `resultState: 'setup_required'` as not retryable; receipt status `setup_needed`; `STEP_STATUS_BY_RECEIPT.setup_needed = 'setup_needed'`; `recordStepOutcomes` gives the request `waiting_setup` when a step is `setup_needed` and none failed; `carryOnRequest` accepts `waiting_setup`)
- Modify: `src/services/marcusExecutionService.ts` (its `setupRequired` results already map to `setup_required`), `src/services/contentFactory/contentMediaExecutor.ts` (a tool not installed — the backend's `missing: true` for Kokoro, AudioCraft when required, ffmpeg — returns `resultState: 'setup_required'` with the existing plain message)
- Modify: `src/services/jose/joseTelegram.ts` (a `waiting_setup` request: "<Agent> needs something set up: <reason>" with Carry on), `src/services/jose/joseExpiry.ts` (expires like waiting), `src/components/jose/JoseRequestsBoard.tsx` and Chat's notice (show the reason and Carry on)
- Test: `src/test/services/jose/joseSetupNeeded.test.ts` (new), `joseTelegram.test.ts`, `joseExpiry.test.ts`

- [ ] **Step 1: Write the failing tests:** a step returning `setup_required` is tried once (no retry, no larger model, no paid retry), its step is `setup_needed` with the reason as `error`, the request is `waiting_setup`; `carryOnRequest` runs it again and the request finishes `done` when it then succeeds; no other agent's step is created; Telegram text and button; expiry applies.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(jose): a step whose owner can't work waits for setup instead of failing or moving`.

### Task 7: Help goes to the owner

**Files:**
- Modify: `src/services/jose/joseHelp.ts` (`chooseHelper` prompt lists `responsibilityLines()` instead of the bare agent list; `safeHelper` also requires `ownerOf(helper.actionType) === helper.agent`; `ruleHelper` market/timing → Hector `research_report` when the request asks for facts, Nova `analysis_findings` when it asks to judge)
- Test: `src/test/services/jose/joseHelp.test.ts`

- [ ] **Step 1: Write the failing tests:** the prompt contains each agent's `owns` line; a model answer `{agent:'nova', taskType:'research_report'}` is refused and the rules decide; `ruleHelper('find competitors')` is Hector.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(jose): help goes to the agent who owns the work`.

### Task 8: The closing summary

**Files:**
- Create: `src/services/jose/joseSummary.ts`
- Modify: `src/services/joseCommandRouterService.ts` (`buildUserSummary` uses `closingSummary` when the command has a Jose request)
- Test: `src/test/services/jose/joseSummary.test.ts`

**Interfaces:**
- Produces: `closingSummary(request: JoseRequest): string` — no model call. More than one step: one line per step `"<Name>: <summary first sentence, 160 chars>"`, or `"<Name>: waiting for you (<reason>)"`, `"<Name>: needs setup (<reason>)"`, `"<Name>: failed (<reason>)"`, `"<Name>: not run"`; then `"Waiting for you: N"` when any; then `"Open on the board."`. One step: that step's `readableOutput()` when done; else its one line.
- Consumes: `getStepOutput`, `readableOutput` (Task 3), `agentName`.

- [ ] **Step 1: Write the failing tests:** three steps (done, waiting approval, failed) give exactly those lines in plan order and "Open on the board."; one done step gives its full output; one waiting step gives its reason line (Review Focus 5); no "Jose merged".
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS). Check `inboundReply()`/`outcomeLine()` still read `userReport.summary`.
- [ ] **Step 5: Commit** `feat(jose): requests end with a short summary of each step`.

### Task 9: Shortcuts and workflows obey the owners

**Files:**
- Modify: `src/services/joseExecutionEngineService.ts` (`runPipelineShortcuts`: an image request returns `{ kind: 'image_step' }` instead of calling ComfyUI; Miya's executor handles `creative_image` by calling `generateComfyUiImage` with the request as prompt and returning the image as an artifact)
- Modify: `src/services/jose/submitToJose.ts` (on `image_step`, `submitStepsToJose` with one Miya step `creative_image`, `effects: ['write_own_work']`, label "Picture asked for in Chat.")
- Modify: `src/services/workflowRegistryService.ts` (export `WORKFLOW_STEP_TASK`)
- Test: `src/test/services/jose/submitToJose.test.js`, `src/test/workflowOwners.test.js` (new)

- [ ] **Step 1: Write the failing tests:** "make a picture of a red fox" makes a request with one Miya `creative_image` step and ComfyUI is not called by the shortcut; every `WORKFLOW_STEP_TASK` value is owned by its key; every `agentSequence` in `WORKFLOW_OPERATIONS` (export if needed) names only real agents or `user_approval`, and `workflowGovernanceService` refuses an operation whose sequence gives Jose a work step (only as last, reporting).
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS). The named-workflow shortcut keeps running `runVisualWorkflow` (its nodes have no agents; recorded in the plan as checked).
- [ ] **Step 5: Commit** `feat(jose): picture requests are Miya's step; workflows checked against owners`.

### Task 10: Voice routes by owner and speaks in role

**Files:**
- Create: `voice/backend/agent_roles.py` (`ROLES = { agent: { 'owns': str, 'never': str } }` with the same sentences as Task 1, and `ROUTING_PATTERNS` moved here: `alphonso` gains `email|note|draft|write|letter|question`; `miya` loses `write|blog|draft|copy|email` and keeps content and design words plus `video|script|thumbnail|post`; `nova` loses `market|trend` and keeps `opportunity|prioriti|score|timing|when to`; `hector` gains `market|competitor`)
- Modify: `voice/backend/router.py` (imports patterns from `agent_roles`), `voice/backend/pipeline.py` (`_call_ollama` sends `{"role": "system", "content": "You are <Name>. You own: … You never: … If asked for work you don't own, say which agent does it."}` first)
- Test: `voice/backend/tests/test_router.py`, `voice/backend/tests/test_pipeline.py`, `src/test/agentRolesVoiceSync.test.js` (reads `agent_roles.py` and checks each `owns`/`never` sentence equals `describeResponsibility()`)

- [ ] **Step 1: Write the failing tests:** `detect_agent('draft an email to my landlord') == 'alphonso'`; `detect_agent('research the market for vegan snacks') == 'hector'`; `detect_agent('when should I post this') == 'nova'`; the Ollama payload's first message is the system message for the routed agent; the sync test.
- [ ] **Step 2:** `cd voice/backend && python -m pytest tests/test_router.py tests/test_pipeline.py -q` and the vitest — Expected: FAIL.
- [ ] **Step 3–4:** implement; run — Expected: PASS.
- [ ] **Step 5: Commit** `feat(voice): route by owner and answer in role`.

### Task 11: Boardroom and Simple mode stay in role

**Files:**
- Modify: `src/services/boardroomFacilitatorService.ts` (the persona prompt at the `You are ${profile.name}` builder adds `describeResponsibility()`'s two sentences and: "If the user asks for work you don't own, say which agent does it and @mention them. Never do that work yourself.")
- Modify: `src/components/CompanionMode.tsx` (its persona prompt adds the two sentences and "If asked for work you don't own, say which agent does it.")
- Test: `src/test/boardroomFacilitatorService.test.ts`, `src/test/components/CompanionMode*.test.*`

- [ ] **Step 1: Write the failing tests:** Marcus's Boardroom prompt contains his `owns` and `never` sentences and the @mention rule; CompanionMode's prompt for Hector contains his sentences.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(boardroom): agents stay in their role in chat`.

### Task 12: Calls are Marcus's outreach

**Files:**
- Create: `src/services/calleCallStep.ts`
- Modify: `src/services/joseExecutionEngineService.ts` (`outreach_call` → `executeOutreachCall`), `src/components/ChatView.tsx` (the confirm button calls `askMarcusToCall({ kind: 'mcp', chatId })` and says "Waiting for your approval: Marcus will place the call."), `src/components/calle/CalleOutreachPanel.tsx` (Place call → `askMarcusToCall({ kind: 'rest', recordId })`)
- Test: `src/test/calleCallStep.test.ts`

**Interfaces:**
- Produces: `askMarcusToCall(input: { kind: 'rest'; recordId: string } | { kind: 'mcp'; chatId: string }, summary: string): Promise<any>` — `submitStepsToJose` with one Marcus step `outreach_call`, `effects: ['publish_or_send', 'spend']`, `payload: input`, label "Call set up in CALL-E."; `executeOutreachCall(assignment)` — only with both effects on the assignment; calls `runOutreachCall(recordId, { approved: true })` or `confirmMcpOutreachCall(chatId)`; returns the call's status as summary.
- Unchanged: `escalationCallService.ts` (it calls you about an approval: Jose's approval channel).

- [ ] **Step 1: Write the failing tests:** `askMarcusToCall` makes a waiting Marcus step with both effects and does not call CALL-E; after approval `executeOutreachCall` calls `runOutreachCall` once; without the effects it refuses and calls nothing; the escalation service is untouched (no import of `calleCallStep`).
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(calle): placing a call is Marcus's step, asked like every send`.

### Task 13: Hermes-backed agents know their role

**Files:**
- Modify: `src/lib/ollama.ts` (the `hermes` branch of `generateAgentLlmResponse` prepends `{ role: 'system', content: <name, owns, never, "You may: <describeAgentPermissions(agent).allowed>"> }`)
- Modify: `src/services/joseExecutionEngineService.ts` (when the step's agent provider is `hermes` and the agent lacks `run`, `updateJoseStep(…, { note: 'Runs on Hermes, which can use its own tools.' })`), `src/components/jose/JosePlanMap.tsx` or the board's step detail (shows `note`)
- Test: `src/test/hermesRole.test.ts` (new)

- [ ] **Step 1: Write the failing tests:** the Hermes request's first message is the system message with Hector's sentences; a Hector step on Hermes gets the note; on Ollama it doesn't.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(hermes): Hermes-backed agents get their role; the board says when Hermes runs a step`.

### Task 14: Desktop check and docs

**Files:**
- Create: `e2e-desktop/specs/agent-roles.e2e.mjs`
- Modify: `CLAUDE.md` (rows: ownership map in the permission-table row, `stepInput.ts`, `reviewStep.ts`, `movedTaskTypes.ts`, `joseSummary.ts`, `calleCallStep.ts`, voice roles; the desktop count line), `docs/ALPHONSO_GROUND_TRUTH.md`, `docs/AGENT_GUIDE.md` (the map), `docs/USER_MANUAL.md` (who does what, setup-needed, the summary), `docs/CHANGELOG.md`, `docs/governance/DEFERRED_WORK.md` (what Part A leaves for B and C)

- [ ] **Step 1: Write the spec:** skip without an Ollama model (`ollamaHasModels()`); in Chat send "Research three facts about honeybees, write a short post about them, and have it checked"; open the board; assert Hector's step saved sources, Miya's step output contains text, Maria's review step output quotes part of Miya's text and has a verdict, and Chat's reply ends with "Open on the board."; nothing is sent (no Marcus step, or Marcus review only).
- [ ] **Step 2:** `npm run tauri build -- --debug --no-bundle` then `npx wdio run e2e-desktop/wdio.conf.mjs --spec e2e-desktop/specs/agent-roles.e2e.mjs` — Expected: PASS (or SKIP without a model, said in the report).
- [ ] **Step 3:** update the docs; run `node scripts/verify-doc-counts.mjs`, `npm run verify:dnd-coverage`, `npm run verify:dnd-map`, `npm run lint`, `npm run typecheck`, `npm test` — Expected: all pass.
- [ ] **Step 4: Commit** `docs: agent roles Part A` and open the PR.
