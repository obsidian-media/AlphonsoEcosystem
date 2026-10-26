# Agent phase 2: Nova — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova judges what was found and answers with a ranked verdict with reasons, from her model only, after Hector, everywhere she appears.

**Architecture:** A new `src/services/nova/` folder holds the verdict (prompt, parser, hand-over text) and the saved verdicts; `runNovaAnalysis()` in `novaAnalysisService.ts` keeps its name and signature for the engine but becomes the verdict step. Surfaces (Chat card, Settings, Telegram `/nova`, the daily scan) read saved verdicts instead of scores. Routing fixes are small edits to existing files.

**Tech Stack:** TypeScript, React, Vitest, WebdriverIO desktop E2E.

**Spec:** `docs/superpowers/specs/2026-10-25-agent-phase-nova-design.md`

## Global Constraints

- No keyword scores anywhere in Nova's path; no fallback numbers. Unreadable twice → `Nova's model didn't give a readable verdict.`
- Value / effort / risk are `high` / `medium` / `low` words; `score` (0–100) only when there is exactly one option.
- Confidence and verification state of a verdict: `TRUST_STATES.INFERRED`.
- Nova calls `generateAgentLlmResponse('nova', …)` without `model` (and without `endpoint`), so Jose's step model wins.
- Saved verdicts: key `alphonso_nova_verdicts_v1`, 30 kept, 5 shown.
- No-verdict text: `No verdicts yet: ask Jose something like "which of these should I do first?"`
- Video-shortcut reply: `I took this as a content video for Miya Studio. Choose an output folder in Settings → Runtime → Local Services first, then ask again, or say "plan this fresh" to have it planned normally.`
- Delete no files (R14). Docs change in the same commits as the code they describe. Never `git add -A`.

## Review Focus

- A request whose options are written with "and" or on separate lines ("newsletter and podcast", a bulleted list): every one is found and ranked (Task 1 test `namedOptions reads lists written with and, or and lines`).
- The model ranks an option that wasn't asked about and leaves a named one out: the named one is asked for once, then listed last as "not judged" (Task 3 test `a left-out option is asked once, then listed not judged`).
- Nova with only failed needed steps (Hector failed): treated as nothing to judge, so she asks for research rather than judging the failure text (Task 3 test `failed needs count as nothing to judge`).
- A help-again round that still has nothing: judged from the request only, no second HELP (Task 3 test `a help round never asks for help again`).
- "Make a video comparing a newsletter and a podcast" still takes the video shortcut; "Should we start a YouTube channel or a podcast?" does not (Task 7 routing set).

---

### Task 1: The verdict (prompt, parser, text)

**Files:**
- Create: `src/services/nova/novaVerdict.ts`
- Test: `src/test/services/nova/novaVerdict.test.ts`

**Interfaces:**
- Consumes: `StepInput`, `stepInputText()` from `src/services/jose/stepInput.ts`.
- Produces:
  - `type Level = 'high' | 'medium' | 'low'`
  - `interface VerdictOption { name: string; rank: number; why: string; value: Level; effort: Level; risk: Level; sources: number[]; notJudged?: true }`
  - `interface NovaVerdict { doFirst: string; options: VerdictOption[]; wouldChange: string; score?: number; fromRequestOnly: boolean }`
  - `namedOptions(text: string): string[]`
  - `novaVerdictPrompt(input: StepInput, opts: { sourceCount: number; mayAskForHelp: boolean; leftOut?: string[] }): string`
  - `parseNovaVerdict(text: string, opts: { sourceCount: number; fromRequestOnly: boolean }): NovaVerdict | null`
  - `missingOptions(verdict: NovaVerdict, named: string[]): string[]`
  - `withNotJudged(verdict: NovaVerdict, missing: string[]): NovaVerdict`
  - `verdictText(v: NovaVerdict): string`

- [ ] **Step 1: Write the failing tests** (`novaVerdict.test.ts`):
  - `namedOptions finds the options after a colon`: `namedOptions('Which of these should a small bakery do first: a weekly email newsletter, a loyalty card, or a podcast? Prioritize them.')` → `['a weekly email newsletter', 'a loyalty card', 'a podcast']`.
  - `namedOptions reads lists written with and, or and lines`: `'Should we do the newsletter and the podcast?'` → `['the newsletter', 'the podcast']`; `'Options:\n- newsletter\n- loyalty card'` → `['newsletter', 'loyalty card']`; `'What is the capital of France?'` → `[]`.
  - `parses a ranked verdict, words not numbers`: a model JSON with two options out of order (rank 2 then 1) and `value: 80` on one → options sorted by rank; a level that isn't `high`/`medium`/`low` (the 80) becomes `'medium'`; `score` dropped because there are two options.
  - `keeps score only for a single option` (score 72 kept, clamped to 0–100).
  - `drops source numbers that do not exist` (`sourceCount: 3`, sources `[1, 4]` → `[1]`).
  - `unreadable or empty is null` (`'I think the newsletter'`, `{"options": []}`).
  - `missingOptions matches by a shared word`: named `['a weekly email newsletter','a loyalty card','a podcast']`, verdict names `Email newsletter`, `Loyalty card` → `['a podcast']`.
  - `withNotJudged lists the missing last`: the podcast added with `notJudged: true`, rank after the others.
  - `verdictText starts with what to do first`: `verdictText(v)` starts with `What to do first: the email newsletter.`, contains `1. Email newsletter: <why> Value high, effort low, risk low. [2][4]`, ends with `Would change this: …`; a `notJudged` option reads `3. a podcast: not judged.`; `fromRequestOnly` puts `Judged from your request only.` on the first line.
  - `the prompt offers HELP only when asked`: `novaVerdictPrompt(input, { sourceCount: 0, mayAskForHelp: true })` contains `HELP: research`; with `mayAskForHelp: false` it doesn't; with `leftOut: ['a podcast']` it contains `You left out: a podcast.`; the skill section from `stepInputText()` comes first.

- [ ] **Step 2: Run** `npx vitest run src/test/services/nova/novaVerdict.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `novaVerdict.ts`.** `namedOptions`: take the text after the last `:` before a `?` (or the lines starting `-`, `*`, `•`, `1.`), split on `,`, ` or `, ` and `, trim punctuation, keep 2–8 items of at most 80 characters; otherwise `[]`. `missingOptions`: a named option is covered when any verdict option shares a word stem (first 5 letters, words of 4+ letters, ignoring `the a an of for`). The prompt (verbatim lines): `You are Nova. Judge only what you were given: the request and the earlier steps below. Do not look for new facts.`; `Rank every option. For each: why, its value, effort and risk as high, medium or low, and the numbers of the sources that support it.`; `Answer with JSON only: {"doFirst": "...", "options": [{"name": "...", "rank": 1, "why": "...", "value": "high", "effort": "low", "risk": "low", "sources": [1]}], "wouldChange": "...", "score": "0-100, only when there is one option"}`; when `mayAskForHelp`: `If you have nothing to judge (no options and no findings), answer only with one line: HELP: research <what you need>.`

- [ ] **Step 4: Run** the same command — Expected: PASS.

- [ ] **Step 5: Commit** `feat(nova): the ranked verdict (prompt, parser, hand-over text)`.

### Task 2: Saved verdicts

**Files:**
- Create: `src/services/nova/novaVerdicts.ts`
- Test: `src/test/services/nova/novaVerdicts.test.ts`

**Interfaces:**
- Produces:
  - `interface SavedVerdict { about: string; doFirst: string; requestId: string | null; commandId: string | null; atMs: number; text: string }`
  - `saveVerdict(v: SavedVerdict): void` (newest first, 30 kept, `durableSet` on `alphonso_nova_verdicts_v1`)
  - `listVerdicts(limit = 5): SavedVerdict[]`
  - `verdictForCommand(commandId: string): SavedVerdict | null`
  - `verdictsText(list: SavedVerdict[]): string` (`NO_VERDICTS` when empty)
  - `NO_VERDICTS` (the Global Constraints text)

- [ ] **Step 1: Failing tests**: `keeps the newest 30`, `lists 5 by default, newest first`, `finds the verdict for a command`, `verdictsText lists about, do first and when` (`1. Bakery marketing: do first the email newsletter (25 Oct)`), `verdictsText says how to get one when empty` (equals `NO_VERDICTS`).
- [ ] **Step 2: Run** `npx vitest run src/test/services/nova/novaVerdicts.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** with `durableGet`/`durableSet` from `src/lib/durableStore.js`; `about` cut to 80 characters at a word.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(nova): saved verdicts`.

### Task 3: Nova's step gives the verdict

**Files:**
- Modify: `src/services/novaAnalysisService.ts` (rewrite `runNovaAnalysis`; remove `computeOpportunityScores`, `classifyPriorityTier`, `buildNovaAnalysisPrompt`, `parseNovaAnalysisResponse`, `buildNovaFallbackAnalysis`, `saveOpportunityScore`, `getOpportunityHistory`, the threshold functions and the signal tables)
- Modify: `src/services/joseExecutionEngineService.ts` (remove `extractNovaScore` and the `storeNovaScore` call after a Nova step; keep `getDecompositionHints` for `novaFeedback`)
- Test: rewrite `src/test/novaAnalysisService.test.js` and `src/test/services/novaAnalysisService.test.js` for the new behaviour; update `src/test/hermesSessionContinuity.test.js` and `src/test/services/jose/stepInput.test.ts` where they use removed exports.

**Interfaces:**
- Consumes: Task 1 (`namedOptions`, `novaVerdictPrompt`, `parseNovaVerdict`, `missingOptions`, `withNotJudged`, `verdictText`), Task 2 (`saveVerdict`), `findHelpRequest` from `jose/joseHelp.ts`.
- Produces: `runNovaAnalysis(commandText: string, assignment: Assignment | null, priorOutputs: unknown, options: { stepInput?: StepInput | null; signal?: AbortSignal }): Promise<NovaResult>` with `NovaResult = { summary: string; resultState: 'completed' | 'failed'; resultUrl: null; artifacts: []; sources: string[]; contractAction: string; schema: NovaVerdict | null; failureReason?: string }`; `NOVA_NO_VERDICT = "Nova's model didn't give a readable verdict."`

- [ ] **Step 1: Failing tests** (model mocked through `generateAgentLlmResponse`):
  - `the verdict is the hand-over`: needs one Hector step with sources `[a, b]`; model answers a two-option verdict → `summary` starts `What to do first:`, `schema.options.length === 2`, `artifacts` empty, `resultState 'completed'`.
  - `no keyword scores`: the module has no export `computeOpportunityScores`; a request with "email" and "production" gives no `risk` unless the model gave one.
  - `uses the step model`: the call's options have no `model` and no `endpoint` keys; `sessionId` is still passed for a packet.
  - `unreadable twice fails`: two unreadable answers → `resultState 'failed'`, `summary` and `failureReason` equal `NOVA_NO_VERDICT`, `schema null`.
  - `a left-out option is asked once, then listed not judged`: request names three options; the model ranks two, twice → the second prompt contains `You left out: a podcast.`; the result lists the podcast last with `not judged`.
  - `nothing to judge asks for research`: no needs, no named options; model answers `HELP: research what small bakeries spend on marketing` → `resultState 'completed'`, `findHelpRequest(result)` returns `research what small bakeries spend on marketing`, no verdict saved.
  - `failed needs count as nothing to judge`: needs has one step whose text is `(nothing saved)` → the prompt offers HELP.
  - `a help round never asks for help again`: `assignment.helpRound = 1`, nothing to judge → the prompt has no HELP line; a verdict is `fromRequestOnly`.
  - `saves the verdict and one memory note`: `saveVerdict` called with `doFirst`, `requestId`/`commandId` from the assignment; `pushMemoryItem` called once with title `Nova: <about> — do first: <option>` and confidence `inferred`; `appendSessionEvent` and `appendOrchestrationReceipt` not called.
  - `the engine stores no score after a Nova step` (source check on `joseExecutionEngineService.ts`: no `extractNovaScore`).
- [ ] **Step 2: Run** `npx vitest run src/test/novaAnalysisService.test.js src/test/services/novaAnalysisService.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement.** Nothing to judge = no needs with text other than `(nothing saved)`, no `review`, and `namedOptions(request)` empty; `mayAskForHelp = nothingToJudge && !assignment?.helpRound`. `sourceCount` = the count of sources across needs. One retry for unreadable or for missing options (not both: at most two calls). `about` = the request's first line without `/jose`, cut to 80.
- [ ] **Step 4: Run** the step 2 command plus `npx vitest run src/test/hermesSessionContinuity.test.js src/test/services/jose` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(nova): her step gives a ranked verdict from her model, after the step's model, with no keyword scores`.

### Task 4: Where Nova runs

**Files:**
- Modify: `src/services/jose/agentOrder.ts` (`nova: ['hector']`)
- Modify: `src/services/workflowRegistryService.ts` (every chain with Hector: Nova right after Hector)
- Modify: `src/services/batchOrchestratorService.js` ("Performance profiling and optimization" → `alphonso`; "Security review of data storage and transport" → `sentinel`)
- Test: `src/test/services/jose/routingSet.test.ts`, `src/test/workflowRegistryService.test.*` (existing file), a new case in `src/test/services/contentFactory/` for the market step

- [ ] **Step 1: Failing tests:**
  - routing set: `'Research the coffee subscription market in Canada and tell me which opportunity is worth going after first'` → parts include `nova:opportunity_analysis` and that step's `needs` equal `['hector']`.
  - workflows: `every chain with Hector has Nova after him` (for each workflow, `chain.indexOf('nova') > chain.indexOf('hector')` when both present).
  - batch: `no batch task gives code or security to the wrong agent` (the profiling task's agent is `alphonso`, the security review's `sentinel`).
  - content factory: `the market step reads Hector's answer for the same step` (a project with `steps.research.pendingAgents.hector` set; the prompt built for `analysis_market` contains `Hector's research:`). This pins existing behaviour; it passes once written.
- [ ] **Step 2: Run** those files — Expected: the first three FAIL.
- [ ] **Step 3: Implement** the three edits.
- [ ] **Step 4: Run** those files plus `npx vitest run src/test/services/jose` — Expected: PASS.
- [ ] **Step 5: Commit** `fix(nova): she runs after Hector in the simple plan and workflows; code and security tasks go to their owners`.

### Task 5: The surfaces (Chat card, Settings, Telegram /nova)

**Files:**
- Modify: `src/components/ChatView.tsx` (drop the `computeOpportunityScores`/`runNovaAnalysis` block and the threshold; after a request, `setNovaInsight(verdictForCommand(result.commandId))`; the card shows `Nova: what to do first`, `doFirst` and the top three lines of `text`)
- Modify: `src/components/NovaHistoryChart.tsx` (keeps its name; renders `listVerdicts(5)` as a list with `verdictsText` content, each linked to its request via a prop `onOpenRequest?`)
- Modify: `src/components/SettingsView.tsx` (remove the "Nova Insight Threshold" section)
- Modify: `src/services/telegramCompanionService.js` (`handleNovaCommand` sends `verdictsText(listVerdicts(5))`; `/help` line becomes `/nova — Nova's last verdicts`)
- Test: `src/test/ChatView.test.jsx` (or the existing Nova-card test), `src/test/components/NovaHistoryChart.test.*`, `src/test/connectors/telegramCompanionService.test.js`, `src/test/SettingsView.smoke.test.jsx`

- [ ] **Step 1: Failing tests:** `Chat shows Nova's verdict for the request` (a saved verdict for the command → card text has `What to do first`; no saved verdict → no card); `Chat makes no extra Nova call` (`runNovaAnalysis` never imported by ChatView: source check); `Settings lists the last verdicts` (two saved → both `about` lines; none → `NO_VERDICTS`); `Settings has no Nova threshold` (no text `Insight Score Threshold`); `/nova sends the last verdicts` (message equals `verdictsText(listVerdicts(5))`).
- [ ] **Step 2: Run** those files — Expected: FAIL.
- [ ] **Step 3: Implement.** The result card's raw Nova dump disappears with Task 3's empty `artifacts`; check `PipelineResultCard` needs no change.
- [ ] **Step 4: Run** them — Expected: PASS.
- [ ] **Step 5: Commit** `feat(nova): Chat shows her verdict; Settings and /nova list her last verdicts`.

### Task 6: The daily scan is a "what next" request

**Files:**
- Create: `src/services/nova/novaDaily.ts`
- Modify: `src/services/joseSchedulerService.ts` (`nova_scan` handler; preset label `Nova: what to do next` and description `Every day at 9:00, Nova looks over the last week's work and what is still waiting, and says what to do next.`)
- Test: `src/test/services/nova/novaDaily.test.ts`, `src/test/joseSchedulerService.test.js`

**Interfaces:**
- Consumes: `submitStepsToJose()` from `jose/submitToJose.ts`, `listJoseRequests()`.
- Produces: `NOVA_DAILY_LABEL = 'Asked by the daily Nova schedule.'`, `askNovaWhatNext(work: string): Promise<{ state: 'done' | 'failed'; summary: string }>`

- [ ] **Step 1: Failing tests:** `asks one Nova step through Jose` (`submitStepsToJose` called with `source: 'schedule'`, `allowPaidModels: false`, `label: NOVA_DAILY_LABEL`, one step `{ stepId: 'nova', agent: 'nova', actionType: 'analysis_findings', effects: ['read'], needs: [] }`, text containing the work and a `Still waiting:` list built from requests whose status starts with `waiting_`); `maps the result` (ok → `done` with the request's summary; not ok → `failed` with its reason); scheduler: `nova_scan` calls `askNovaWhatNext` and no longer `runNovaAnalysis`; nothing done → `skipped` as today.
- [ ] **Step 2: Run** those files — Expected: FAIL.
- [ ] **Step 3: Implement**, importing `submitToJose.ts` lazily (as the scheduler does for other jobs).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(nova): the daily scan asks her what to do next, as a request`.

### Task 7: The video shortcut needs a making word

**Files:**
- Modify: `src/services/jose/joseTemplates.ts` (`MAKING_WORDS`, `asksToMake(text: string): boolean`, whole words: make, makes, making, create, produce, film, shoot, record, edit, script, write, `turn … into`)
- Modify: `src/services/jose/submitToJose.ts` (the Chat shortcut also needs `asksToMake(text)`)
- Modify: `src/services/contentFactory/contentFromChat.ts` (`NEEDS_OUTPUT_FOLDER` = the Global Constraints reply)
- Test: `src/test/services/jose/routingSet.test.ts` (new block `the video shortcut`), tests that assert the old `NEEDS_OUTPUT_FOLDER` text

- [ ] **Step 1: Failing tests:** `takes the shortcut` for `Make a YouTube video about bread`, `Make three Shorts for our launch`, `Make a video comparing a newsletter and a podcast`; `does not` for `Which of these should a small bakery do first: a weekly email newsletter, a YouTube channel, or a podcast? Prioritize them.`, `Should we start a YouTube channel or a podcast?`, `How many YouTube channel posts a week is too many?` (each through `scoreTemplateFit(text)[0]` fit AND `asksToMake(text)`); the bakery question's rule plan → `nova:opportunity_analysis` only; `NEEDS_OUTPUT_FOLDER` says what Jose understood.
- [ ] **Step 2: Run** `npx vitest run src/test/services/jose/routingSet.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus `npx vitest run src/test/services/jose src/test/services/contentFactory` — Expected: PASS.
- [ ] **Step 5: Commit** `fix(jose): the video shortcut needs a request to make something, and says what it understood`.

### Task 8: Hector's two leftovers

**Files:**
- Modify: `src/services/hector/researchRun.ts` (`parseWriteUp`: drop disagreement and not-found entries matching `/":|^\s*[{[]/`; `fetchSources`: a page that answered but is short → reason `too short to read`)
- Test: `src/test/services/hector/researchRun.test.ts`

- [ ] **Step 1: Failing tests:** `drops broken model text from disagreements` (`disagreements: ['notFound": [{', 'A says 17 million, B says 20 million']` → only the second); `a short page that answered is too short, not blocked` (fetch ok, 50 characters → source label `snippet`, reason `too short to read`).
- [ ] **Step 2: Run** `npx vitest run src/test/services/hector/researchRun.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/test/services/hector` — Expected: PASS.
- [ ] **Step 5: Commit** `fix(hector): no broken model text under disagreements; a short page is "too short to read"`.

### Task 9: Desktop check, docs, live run

**Files:**
- Create: `e2e-desktop/specs/nova.e2e.mjs`
- Modify: `CLAUDE.md` (Nova rows: Nova insight card, Nova opportunity history, Nova history chart, durableStore users; a new "Nova's verdict (agent phase 2)" row; the template row's shortcut), `docs/ALPHONSO_GROUND_TRUTH.md` (§11.42), `docs/AGENT_GUIDE.md` (Nova), `docs/USER_MANUAL.md` (a "Ask Nova what to do first" section), `docs/CHANGELOG.md`, `docs/governance/DEFERRED_WORK.md` (what this leaves), the spec's status line, doc counts (`node scripts/verify-doc-counts.mjs`), the DND map (`npm run generate:dnd-map`)

- [ ] **Step 1: Write `nova.e2e.mjs`** (pattern of `hector.e2e.mjs`, `showPlanFirst: 'never'`, `qwen2.5:7b` when installed, optional `ALPHONSO_LIVE_TAVILY_API_KEY`, denies approval windows): (a) `/jose Research the coffee subscription market in Canada and tell me which opportunity is worth going after first.` → Nova's step `needs` include Hector's step, it started after his finished, its output starts `What to do first:`, every cited `[n]` is within his sources; (b) `/jose Which of these should a small bakery do first: a weekly email newsletter, a loyalty card, or a podcast? Prioritize them.` → one request with a Nova step whose schema ranks three options; Chat shows `What to do first` and no `Analyzed At Ms`.
- [ ] **Step 2: Docs** as listed; `node scripts/verify-doc-counts.mjs` — Expected: `All doc counts verified fresh.`
- [ ] **Step 3: Full unit suite** `npm test` — Expected: all pass.
- [ ] **Step 4: Build and run** `npm run tauri build -- --debug --no-bundle`, then `nova.e2e.mjs`, `hector.e2e.mjs`, `agent-roles.e2e.mjs`, `jose-planner.e2e.mjs` — Expected: passing; read Nova's actual verdicts, not only the result.
- [ ] **Step 5: Commit** `docs: agent phase 2 (Nova); desktop check for Nova`.
