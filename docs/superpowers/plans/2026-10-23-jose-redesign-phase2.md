# Jose Redesign Phase 2 (The Planner) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jose decides whether to answer directly or plan, and plans with his model. Templates are starting points he scores, adapts or ignores, and he can always plan fresh. When his model can't produce a valid plan, a rule-based plan is used and he says so. Chat sends everything to Jose.

**Architecture:**
- Four new modules in `src/services/jose/`:
  - templates with fit scoring;
  - the planner (model plan → rule check → one fix → fallback);
  - the direct-or-plan decision;
  - `submitToJose()`, the new entry point.
- `submitToJose()` runs the existing shortcuts (image, named workflow), then the planner. It hands the plan to the phase 1 step-graph pipeline as explicit assignments; a rules fallback runs the old pipeline path unchanged.
- ChatView moves from the word rule to `decideJoseRoute()` and `submitToJose()`.

**Tech Stack:** TypeScript, React, Vitest, WebdriverIO desktop E2E (tauri-driver), Ollama through `generateAgentLlmResponse`.

**Spec:** `docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md` (sections 2.1–2.4, 4 steps 1–3, 5, 9, 10 phase 2). Phase 1: `docs/superpowers/plans/2026-10-23-jose-redesign-phase1.md` (PR #336).

## Owner decisions for this phase (2026-10-23)

- A plan that still fails the rules after one fix → the rule-based plan runs, and Jose says why in Chat.
- Direct-or-plan is decided by Jose's model. Clear questions skip the model and are answered directly (no extra delay).
- A content-video request in Chat runs the template's steps, with a note pointing to Miya Studio for the full project. The factory moves onto the template in phase 6.
- The Claude coding shortcut is removed; coding requests go through the planner.

## Global Constraints

- No hardcoded models, paths or risk ratings: model calls go through `generateAgentLlmResponse('jose', …)` (the model chosen in Settings).
- Reuse what exists:
  - `checkPlan`, `buildStepWaves`, `JOSE_LIMITS` (`jose/stepGraph.ts`);
  - `inferEffects` and the rest of `jose/joseEffects.ts`;
  - `AGENT_PERMISSION_TABLE` and `describeAgentPermissions` (`jose/agentPermissionTable.ts`);
  - `decomposeJoseCommand` / `parseJoseCommand` (`joseCommandRouterService.ts`);
  - `parseJsonResponse` (`src/lib/jsonUtils.js`);
  - `shouldRouteThroughJose` / `isJoseIntakeCommand`.
- Build target Safari 13.1: no `Object.hasOwn`, no `crypto.randomUUID`.
- New files LF; keep each existing file's line endings as stored in git.
- English only. Windows first.
- Every phase keeps the full unit suite and the desktop E2E suite green, and adds desktop specs for what it changes.
- Jose never executes: a planned `run` step is Alphonso's, and its commands ask one by one (phase 1).

## Review Focus

1. **The model's answer is not usable:** prose around the JSON, broken JSON, an empty `steps` list, or a step missing fields.
   - Expected: never a crash. Ask once more, then the fallback, with a reason in plain words.
   - Pinned in Task 2.
2. **The model names an agent, task type or `needs` id that doesn't exist, or gives Miya a `run` step.**
   - Expected: the rule check refuses it, and the problem is shown to the model once; then the fallback.
   - Pinned in Task 2.
3. **The model under-declares effects to avoid approval** (a Marcus publish step declared `read`).
   - Expected: effects are the union of declared and inferred, so approval can't be dodged.
   - Pinned in Task 2.
4. **Jose's model is slow or unreachable when deciding direct-or-plan.**
   - Expected: Chat still gets an answer. After `DECISION_TIMEOUT_MS` the word rule decides.
   - Pinned in Task 3.
5. **Direct mode (an agent picked in Chat), a CALL-E call request, or an image request.**
   - Expected: each keeps its own path and never reaches the planner.
   - Pinned in Tasks 4 and 5.

---

### Task 1: Templates with fit scoring

**Files:**
- Create: `src/services/jose/joseTemplates.ts`
- Modify: `src/services/jose/stepGraph.ts` (add `instruction?: string` to `PlanStep`), `src/services/jose/joseEffects.ts` (`ACTION_EFFECTS` entries below)
- Test: `src/test/services/jose/joseTemplates.test.ts`

**Interfaces:**
- Produces:
  - `interface JoseTemplate { id: string; name: string; kind: 'normal' | 'project'; matchWords: string[][]; steps: PlanStep[] }` (every step carries an `instruction`).
  - `JOSE_TEMPLATES: JoseTemplate[]` — `content_video`, `build_app`, `research_report`.
  - `TEMPLATE_FIT_THRESHOLD = 0.5`.
  - `scoreTemplateFit(text: string): { templateId: string; score: number }[]`, best first. Score = matched groups ÷ groups, where a group matches if any of its words appears as a whole word, case-insensitive.
  - `getTemplate(id: string): JoseTemplate | null`.
- Templates, using task types that pass each agent's table entry:
  - **Content video** (`normal`), step ids in brackets:
    - `[research_trends]` Hector `research_virality` and `[research_market]` Nova `analysis_market`;
    - `[script]` Miya `creative_script`, needs both research steps;
    - `[review_value]` Nova `analysis_content_review` and `[review_quality]` Maria `audit_content_quality`, both need `script`;
    - `[campaign]` Miya `creative_campaign`, needs both reviews.
  - In the other two templates each step's id is the name before the colon.
  - **Build an app** (`project`):
    - `research`: Hector `research_report`;
    - `design`: Miya `creative_ui_design`, needs `research`;
    - `build`: Alphonso `local_operation`, needs `design`;
    - `security`: Sentinel `security_review`, needs `build`;
    - `quality`: Maria `audit_quality`, needs `build`;
    - `summary`: Jose `orchestration_summary`, needs `security` and `quality`.
  - **Research report** (`normal`):
    - `research`: Hector `research_report`;
    - `analysis`: Nova `analysis_findings`, needs `research`;
    - `review`: Maria `audit_quality`, needs `analysis`;
    - `summary`: Jose `orchestration_summary`, needs `review`.
- New `ACTION_EFFECTS` entries:
  - `research_report: ['read']`
  - `analysis_findings: ['read']`
  - `audit_quality: ['read']`
  - `security_review: ['read']`
  - `creative_ui_design: ['write_own_work']`
  - `orchestration_summary: ['write_own_work']`
- Task type check: `orchestration_summary` matches Jose's `orchestration_` prefix and `creative_ui_design` matches Miya's `creative_`, so no table change is needed.

- [ ] **Step 1: Write failing tests:**
  - every template passes `checkPlan(template.steps)` with no problems;
  - every template step has a non-empty `instruction`;
  - `scoreTemplateFit('Make a YouTube video script about our launch')[0]` is `content_video` with score ≥ 0.5;
  - `scoreTemplateFit('Build a web app with a login page')[0]` is `build_app` with score ≥ 0.5;
  - `scoreTemplateFit('Plan a birthday party for my daughter')` has every score < 0.5;
  - `getTemplate('nope')` is `null`.
- [ ] **Step 2: Run** `npx vitest run src/test/services/jose/joseTemplates.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the file and the `ACTION_EFFECTS` entries.
- [ ] **Step 4: Run** it plus `npx vitest run src/test/services/jose/`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): templates with fit scoring`.

### Task 2: The planner

**Files:**
- Create: `src/services/jose/josePlanner.ts`
- Test: `src/test/services/jose/josePlanner.test.ts` (mock `../../../lib/ollama`'s `generateAgentLlmResponse`)

**Interfaces:**
- Consumes: Task 1, `checkPlan`, `inferEffects`, `AGENT_PERMISSION_TABLE`, `describeAgentPermissions`, `parseJoseCommand`, `decomposeJoseCommand`, `parseJsonResponse`.
- Produces:
  - `interface JosePlan { steps: PlanStep[]; source: 'template' | 'adapted' | 'fresh' | 'rules'; templateId: string | null; kind: 'normal' | 'project'; note: string }`.
  - `planJoseRequest(text: string, options?: { planFresh?: boolean; history?: { role: string; content: string }[]; signal?: AbortSignal }): Promise<JosePlan>`.
  - `describePlanSource(plan: JosePlan): string`, which returns:
    - `'Planned fresh.'` for a fresh plan;
    - `'Based on template <name>.'` for an unchanged template;
    - `'Based on template <name> (adapted).'` for an adapted one;
    - the fallback note for a rules plan.
- Behaviour:
  1. Candidates are none if `planFresh`; otherwise templates scoring ≥ `TEMPLATE_FIT_THRESHOLD`. Only the best one goes into the prompt, as "a starting point you may adapt or ignore".
  2. The prompt lists each agent's role, allowed task types and effects (from the table), the effect names, the limits, and the request and recent history. It asks for JSON: `{"basedOnTemplate": id|null, "kind": "normal"|"project", "steps": [{"id","agent","taskType","instruction","effects","needs"}]}`. Call `generateAgentLlmResponse('jose', { prompt, format: 'json', signal })`.
  3. Each step's effects = the union of the declared effects (only valid effect names) and `inferEffects(taskType)`.
  4. Run `checkPlan(steps)` (task types checked). On problems, or an unusable answer, ask once more with the problems listed.
  5. Labelling: `basedOnTemplate: null` → `fresh`. A template whose agent+taskType sequence is unchanged → `template`. Otherwise → `adapted`. A `basedOnTemplate` that wasn't offered counts as `fresh`.
  6. Fallback after the second failure, or if the model call throws:
     - if a template fits, its steps unchanged, source `template`;
     - otherwise the rule splitter: `decomposeJoseCommand(parseJoseCommand(text))`, mapped to steps (`stepId` = agent, `effects` = `inferEffects`, `needs` = `legacyNeeds`), source `rules`.
     - Note: `"My plan didn't pass the checks (<first problem>), so I used the simple plan."` or `"Jose's model isn't available, so I used the simple plan."`.
  7. `kind` comes from the model when valid, else from the template, else `normal`.

- [ ] **Step 1: Write failing tests.** These cover the owner's "make sure he can plan fresh":
  - a request no template fits → the prompt contains no template; the plan is `fresh` and uses the model's steps;
  - `planFresh: true` on a content-video request → no template in the prompt; `fresh`;
  - a content-video request, model returns the template's steps unchanged → `template`; `describePlanSource` → `'Based on template Content video.'`;
  - same request, model adds a Sentinel step → `adapted`; `describePlanSource` ends with `'(adapted).'`;
  - a fresh plan with Nova first and Hector second (Hector needs Nova) is accepted. This proves the fixed order no longer binds plans;
  - model returns a cycle, then a valid plan → asked twice; the second prompt names the problem; the valid plan is used;
  - model returns invalid plans twice, no template fits → `source: 'rules'`; the note contains "didn't pass the checks"; the steps equal the splitter's agents;
  - model returns invalid plans twice, a template fits → `source: 'template'` with the template's steps;
  - model throws → note contains "isn't available";
  - prose around JSON is parsed; `"steps": []` counts as unusable (Review Focus 1);
  - a Marcus `distribution_execution` step declared `['read']` ends with `publish_or_send` in its effects (Review Focus 3);
  - a Miya step with `run` → refused, then the fallback (Review Focus 2).
- [ ] **Step 2: Run** `npx vitest run src/test/services/jose/josePlanner.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus `npx vitest run src/test/services/jose/`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): plan with the model, checked by rules, with a fallback`.

### Task 3: Answer directly or plan

**Files:**
- Create: `src/services/jose/joseDecision.ts`
- Modify: `src/lib/chatUtils.js` (export `isPlainQuestion(text)`, the existing question checks moved out of `shouldRouteThroughJose`, which calls it)
- Test: `src/test/services/jose/joseDecision.test.ts`, plus `src/test/chatUtils.test.js` for `isPlainQuestion`

**Interfaces:**
- Produces:
  - `DECISION_TIMEOUT_MS = 20000`.
  - `decideJoseRoute(text: string, options?: { history?: { role: string; content: string }[] }): Promise<{ route: 'direct' | 'plan'; source: 'rule' | 'model' | 'fallback'; reason: string }>`.
  - `isPlainQuestion(text): boolean`: true when the text ends with `?` or starts with one of today's question openers, unless it is an image request (today's image regex).
- Behaviour:
  1. An explicit `/jose`, `ask jose` or `jose:` → plan (rule).
  2. A plain question → direct (rule), with no model call.
  3. Otherwise ask Jose's model for `{"route":"direct"|"plan","reason"}` (JSON), cut off after `DECISION_TIMEOUT_MS` with an `AbortController`.
  4. An error, a timeout or an unusable answer → `shouldRouteThroughJose(text) || isJoseIntakeCommand(text)` (source `fallback`).

- [ ] **Step 1: Write failing tests:**
  - `'What is 2 + 2? Reply with just the number.'` → direct, rule, model not called;
  - `'/jose research X'` → plan, rule, model not called;
  - `'Make a launch video for my app'` with the model saying plan → plan, model;
  - `'Thanks, that helps'` with the model saying direct → direct, model;
  - model throws → fallback, using the word rule;
  - the model never answers (fake timers, advance 20000 ms) → fallback (Review Focus 4);
  - `isPlainQuestion('Can you make an image of a cat?')` → false; `isPlainQuestion('Why is the sky blue')` → true.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Keep `shouldRouteThroughJose`'s results unchanged; `src/test/chatUtils.test.js` must still pass.
- [ ] **Step 4: Run** `npx vitest run src/test/services/jose/joseDecision.test.ts src/test/chatUtils.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): decide whether to answer or plan`.

### Task 4: `submitToJose()` and the pipeline changes

**Files:**
- Create: `src/services/jose/submitToJose.ts`
- Modify: `src/services/joseExecutionEngineService.ts`:
  - move the image and named-workflow shortcuts into an exported `runPipelineShortcuts({ commandText, onProgress })`, which the pipeline still calls when it has no assignments;
  - remove the Claude coding shortcut (owner) and its import;
  - accept `requestKind` (`'normal'` | `'project'`, default `'normal'`) and `planInfo`; use `JOSE_LIMITS.projectMs` as the duration limit for `project`;
  - in `executeAssignment`, give every agent except Alphonso `"${instruction}\n\nThe request: ${commandText}"` when the step has an `instruction`; Alphonso keeps `commandText` and gets the instruction in `options.stepInstruction`.
- Modify: `src/services/jose/joseRequestStore.ts` (`JoseRequest` gains `plan?: { source: string; templateId: string | null; note: string }`; `createJoseRequest` accepts it)
- Modify: `docs` row for `codingAgentService.ts` in `CLAUDE.md` (no longer called by Jose; kept, since removing a file needs owner approval)
- Test: `src/test/services/jose/submitToJose.test.js`, plus `src/test/services/jose/joseStepGraphPipeline.test.js` and `src/test/joseExecutionEngineService.test.js`

**Interfaces:**
- Consumes: Tasks 2 and 3; phase 1's pipeline with `assignments`.
- Produces:
  - `submitToJose(input: { text: string; source: string; history?: { role: string; content: string }[]; planFresh?: boolean; endpoint?: string; zeroCostMode?: boolean; previewMode?: boolean; onProgress?; onToken? }): Promise<PipelineResult & { plan: JosePlan | null; planNote: string }>`.
  - `CONTENT_VIDEO_STUDIO_NOTE = 'For the full project with pictures and a saved folder, open Miya Studio.'`
- Behaviour:
  1. `runPipelineShortcuts` first; a shortcut result is returned with `plan: null`.
  2. Then `planJoseRequest`.
  3. `source: 'rules'` → the pipeline without assignments (today's path, including the backend splitter).
  4. Otherwise the pipeline with assignments built from the plan steps:
     - `title` = `"<Agent> <taskType>"`, `rationale` = the plan note, `commandPreview` = the instruction, `riskLevel` = `'low'`, `requiresApproval: false` (the router decides from effects), `fragments: []`;
     - plus `stepId`, `effects`, `needs`, `instruction`, `requestKind: plan.kind`, `planInfo`.
  5. `planNote` = `describePlanSource(plan)`, plus `CONTENT_VIDEO_STUDIO_NOTE` when `templateId === 'content_video'`.

- [ ] **Step 1: Write failing tests:**
  - an image request → `generateComfyUiImage` is called and the planner is not (Review Focus 5);
  - a planned request → the pipeline receives the assignments with `stepId`, `instruction` and `needs`; the saved request has `plan.source`;
  - a rules plan → the pipeline is called without assignments;
  - a content-video plan → `planNote` contains the Miya Studio note;
  - a `project` plan → the saved request's `kind` is `project`;
  - a coding request (`'write a function that adds two numbers'`) never calls `runCodingAgent` (mock it);
  - a Hector step with an instruction gets the instruction in its text;
  - an Alphonso step whose instruction says "run npm test", in a request typed as "make a page", never calls `verifyCommandExecution` with `npm test`. Model-written words are not user intent.
- [ ] **Step 2: Run** it plus the Jose suites from phase 1. Expected: new tests FAIL, others PASS.
- [ ] **Step 3: Implement.** Update any existing test that asserted the coding shortcut, with a ledger ruling.
- [ ] **Step 4: Run** `npx vitest run src/test/services/jose/ src/test/joseExecutionEngineService.test.js src/test/joseCommandRouterService.test.js src/test/josePipelineE2E.test.js src/test/joseZeroCostRouting.test.js src/test/joseExplicitAssignments.test.js src/test/services/contentFactory/`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): submitToJose, the planner behind one entry point`.

### Task 5: Chat sends everything to Jose

**Files:**
- Modify: `src/components/ChatView.tsx`:
  - replace `isJoseIntakeCommand(cleanInput) || shouldRouteThroughJose(cleanInput)` with `decideJoseRoute`;
  - `handleJoseCommand` calls `submitToJose`;
  - show `planNote` in Jose's reply;
  - a message starting with `plan this fresh:` (case-insensitive) is sent without that prefix and with `planFresh: true`.
- Test: `src/test/ChatView.test.jsx` (mock `../services/jose/joseDecision` and `../services/jose/submitToJose`)

**Interfaces:**
- Consumes: Tasks 3 and 4.
- Unchanged paths: Direct mode (an agent picked), the CALL-E route, and approval buttons (`executeApprovedPackets`).

- [ ] **Step 1: Write failing tests:**
  - the decision says direct → the streaming reply path runs and `submitToJose` is not called;
  - the decision says plan → `submitToJose` is called with the text and history, and the reply shows `planNote`;
  - `'Plan this fresh: research our competitors'` → `submitToJose` gets `text: 'research our competitors'` and `planFresh: true`;
  - Direct mode → neither `decideJoseRoute` nor `submitToJose` is called (Review Focus 5).
- [ ] **Step 2: Run** `npx vitest run src/test/ChatView.test.jsx`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.** While deciding, show "Jose is deciding…" in the existing thinking state.
- [ ] **Step 4: Run** `npx vitest run src/test/ChatView.test.jsx src/test/chatViewRehydration.test.jsx`, `npx tsc --noEmit`, `npm run lint`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat(chat): everything goes to Jose`.

### Task 6: Real app, docs and PR

**Files:**
- Create: `e2e-desktop/specs/jose-planner.e2e.mjs`. It skips without a model and uses `qwen2.5:7b` when installed, like `content-factory.e2e.mjs`:
  - a question gets a direct answer with no plan note;
  - `Research what the IANA example domain is used for and write a short report.` gets a plan note (`Based on template Research report` or `Planned fresh.`) and runs at least Hector;
  - `Plan this fresh: …` gets `Planned fresh.` or the rules note.
- Modify:
  - `CLAUDE.md`: rows for the four new modules; the Chat routing row (`shouldRouteThroughJose` is now the fallback); the `codingAgentService.ts` row; the desktop E2E row (spec count).
  - `docs/CHANGELOG.md`, `docs/governance/DEFERRED_WORK.md` (open: saving a plan as a template and editing the plan, phase 3; model per step, phase 4).
  - `docs/qa/DESKTOP_QA_COVERAGE.md`, `docs/DO_NOT_DUPLICATE.generated.md`; the counts.

- [ ] **Step 1: Run** `npm test`. Expected: all pass.
- [ ] **Step 2: Build** `npm run tauri build -- --debug --no-bundle`. **Run** the desktop specs `jose-planner`, `chat`, `jose-approval`, `content-factory`, `boardroom` and `smoke`. Expected: pass.
- [ ] **Step 3: Update docs.** Run `generate:dnd-map`, `verify-doc-counts`, `verify:dnd-coverage`, `verify:skill-matrix`.
- [ ] **Step 4: Self-review** the whole branch (no helper agents, owner's rule). Fix Critical and Important findings test-first.
- [ ] **Step 5: Commit, push, open the PR, merge when CI is green.**
