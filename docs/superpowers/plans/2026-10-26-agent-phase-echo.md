# Agent phase 7: Echo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Echo keeps one store of the ecosystem's decisions, saves them from every request and from what you tell him, gives every step the ones that matter, answers when asked, and proposes cleanups you approve.

**Architecture:** A new `src/services/echo/` folder: `decisions.ts` (the store, graph links), `recall.ts` (search for a step and for questions), `echoSteps.ts` (his save, recall, forget and cleanup steps), `cleanup.ts` (proposals), `echoTelegram.ts`. The engine sends every Echo task type to `echoSteps.ts`; `joseFinish.ts` saves a finished request's decisions through the same extractor. Screens in `src/components/echo/`. The old note-per-request path, its keyword fallback and the nightly consolidation are removed.

**Tech Stack:** TypeScript, React, Vitest, the existing `durableStore`, `memoryGraphService`, `chromaDbService`, WebdriverIO desktop specs.

**Spec:** `docs/superpowers/specs/2026-10-26-agent-phase-echo-design.md`

## Global Constraints

- Decisions never expire; a changed one is `replaced`, a removed one `forgotten`; nothing is deleted from the store.
- `ECHO_LIMITS` in `src/services/echo/decisions.ts`: `maxDecisions: 5000`, `stepChars: 2000`, `largeStepChars: 6000`, `perStep: 8`, `shownToModel: 12`, `recallMax: 20`. No other number about decisions anywhere.
- Every text saved goes through `redactText()` (`src/services/sentinel/exactChecks.ts`) first.
- No keyword decides what Echo saves, recalls or replaces: his model does. The rule plan's keywords stay only as the planner's fallback (as for every agent).
- No fallback note: when his model gives nothing readable after one retry, nothing is saved and the reason is said.
- Echo passes no `model` or `endpoint` of his own to `generateAgentLlmResponse` (Jose's step model wins).
- Copy fixed by the spec: "Echo remembered: …", "Remembered: …", "I have nothing saved about …", "Echo couldn't save what was decided: …", schedule label "Echo: tidy memory".
- Desktop specs: `clickSend()` from `e2e-desktop/helpers.mjs`; deny any approval window the spec doesn't expect.

## Review Focus

1. **A recall when the store is empty or nothing matches** must say "I have nothing saved about …", never answer from the model's own knowledge. (Task 3 test.)
2. **A model that answers `replaces` with an id it wasn't shown** must not mark anything replaced. (Task 3 test.)
3. **A key or password in "Remember …"** must be saved hidden. (Task 1 test.)
4. **Two requests finishing at once** must not lose either's decisions (the store is read and written in one synchronous step). (Task 1 test.)
5. **A forgotten preference** must stop reaching steps at once. (Task 2 test.)

---

### Task 1: The decision store and its graph links

**Files:**
- Create: `src/services/echo/decisions.ts`
- Modify: `src/services/memoryGraphRetentionService.ts` (protect decision nodes)
- Test: `src/test/services/echo/decisions.test.ts`

**Interfaces:**
- Produces:
  - `type DecisionKind = 'decision' | 'preference' | 'instruction' | 'rejection'`; `type Surface = 'chat' | 'telegram' | 'whatsapp' | 'phone' | 'schedule' | 'boardroom' | 'miya' | 'project_execution' | 'settings' | 'other'`
  - `interface Decision { id; kind; text; why?; topics: string[]; appliesTo?: string[]; source: { surface: Surface; requestId?: string; stepIds?: string[]; sources?: string[]; by: string }; atMs; status: 'active' | 'replaced' | 'forgotten'; replaces?: string; replacedBy?: string }`
  - `ECHO_LIMITS`, `DECISIONS_KEY = 'alphonso_echo_decisions_v1'`
  - `addDecision(input: Omit<Decision, 'id' | 'atMs' | 'status' | 'replacedBy'>): Decision` (redacts `text`/`why`; when `replaces` names an active decision, marks it `replaced` with `replacedBy`; ignores a `replaces` id that isn't in the store)
  - `editDecision(id, text): Decision | null`, `forgetDecision(id): boolean`, `getDecision(id)`, `listDecisions(filter?: { status?: Decision['status'] | 'all'; kind?: DecisionKind }): Decision[]` (newest first; default `active`), `activePreferences(): Decision[]`, `decisionIds(): string[]`
  - `surfaceOf(source: string): Surface` (maps a request's `source`: `user`→chat, `telegram`, `whatsapp`, `companion`→phone, `schedule`, `boardroom`, `miya`/`content_factory`→miya, else `other`)
- Graph (fire-and-forget, never throws): `addDecision` calls `addNode('decision', id)`, then `addEdge(node, addNode('jose_request', requestId), 'decided_in')`, `'cites'` to `addNode('source', url)` per source, `'replaces'` to `decision:<old id>`; confidence `TRUST_STATES.USER_CONFIRMED` when `by === 'you'`, else `TRUST_STATES.INFERRED`; `createdBy: 'echo'`.
- Storage through `durableGet`/`durableSet` (`src/lib/durableStore.js`).

- [ ] **Step 1: Write the failing tests** in `decisions.test.ts` (mock `memoryGraphService`):
  - `addDecision` stores an active record with id, `atMs`, redacted text: `addDecision({ kind: 'instruction', text: 'Remember the key sk-abcdefghijklmnop1234', topics: [], source: { surface: 'chat', by: 'you' } }).text` contains `[hidden key, ends …1234]` and not `sk-abc`.
  - replacing: `b = addDecision({ …, replaces: a.id })` → `getDecision(a.id).status === 'replaced'`, `.replacedBy === b.id`; `listDecisions()` is `[b]`; `listDecisions({ status: 'all' })` has both.
  - a `replaces` id not in the store leaves everything active.
  - `forgetDecision(id)` → status `forgotten`, gone from `activePreferences()`.
  - two `addDecision` calls in a row both survive (Review Focus 4).
  - graph: `addNode` called with `('decision', id)` and `('jose_request', 'r1')`; `addEdge` with `'decided_in'`, `'cites'` for each source, `'replaces'`.
  - `surfaceOf('companion') === 'phone'`, `surfaceOf('user') === 'chat'`.
  - `memoryGraphRetentionService` passes every decision id in `protectedRefIds` (extend its existing test file `src/test/services/memoryGraphRetentionService.test.ts`).
- [ ] **Step 2: Run** `npx vitest run src/test/services/echo/decisions.test.ts src/test/services/memoryGraphRetentionService.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `decisions.ts`; in `memoryGraphRetentionService.ts` add `...decisionIds()` to `protectedRefIds`.
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(echo): one store for the ecosystem's decisions`

### Task 2: Finding the decisions that matter

**Files:**
- Create: `src/services/echo/recall.ts`
- Test: `src/test/services/echo/recall.test.ts`

**Interfaces:**
- Consumes: Task 1's `listDecisions`, `activePreferences`, `ECHO_LIMITS`.
- Produces:
  - `searchDecisions(query: string, opts?: { limit?: number; status?: 'active' | 'all' }): Decision[]` — ranked word-stem match over `text`, `why`, `topics` (topics weigh most); words of 3 letters or fewer and a small list of stop words ignored; ties newest first. Merged with `semanticSearchMemory(query)` results whose id is a decision id when `isChromaHealthy()`.
  - `indexDecision(d: Decision): void` — sends a decision to ChromaDB (`addMemoryToChroma`), fire-and-forget; called by Task 3's save.
  - `decisionsFor(text: string, opts: { agent?: string; actionType?: string; large?: boolean }): Decision[]` — every active preference whose `appliesTo` is `['all']`, contains `opts.agent`, or holds a prefix of `opts.actionType`; then search matches up to `ECHO_LIMITS.perStep`.
  - `decisionsText(list: Decision[], large = false): string` — one line each `Decided 26 Oct (Chat): <text>` (`Preference` / `You turned down` for those kinds, ` — because <why>` when set), cut at `stepChars` / `largeStepChars`; `''` for none.
- [ ] **Step 1: Write the failing tests**: launch decision found for "write an email to Sam about the launch"; nothing for "tea recipes"; a preference with `appliesTo: ['alphonso']` reaches `{ agent: 'alphonso' }` and not `{ agent: 'hector' }`; `['assistant_write']` reaches `{ actionType: 'assistant_write' }`; a forgotten preference reaches nothing (Review Focus 5); `decisionsText` line format with the date and surface; the cut at 2,000 characters; Chroma results merged when healthy and ignored when not (mock `chromaDbService`).
- [ ] **Step 2: Run** `npx vitest run src/test/services/echo/recall.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `recall.ts`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(echo): find the decisions that matter to a step`

### Task 3: Echo's steps — save, recall, forget

**Files:**
- Create: `src/services/echo/echoSteps.ts`
- Modify: `src/services/joseExecutionEngineService.ts` (`executeEchoAssignment`, the `echo` draft prompt in `draftPrompt` removed if unused), `src/services/echoMemoryService.ts` (remove `runEchoPreservation`, `buildEchoFallbackEntry`, `RETENTION_RULES`, `classifyRetentionPolicy`, `classifyMemoryCategory`, `normalizeMemoryConfidence`, `synthesizeSession`, `buildEchoSynthesisPrompt`, `parseEchoMemoryResponse`; keep `searchEchoMemorySemantic` and `isChromaHealthy` if imported elsewhere), `src/services/jose/taskTypeMeanings.ts` (`memory_forget`, `memory_cleanup`), `src/services/jose/joseEffects.ts` (`memory_recall: ['read']`, `memory_forget: ['write_own_work']`, `memory_cleanup: ['write_own_work']`), `src/skills/echo/*.md` (task types per the spec; new `forget.md`), `src/agents/echo/echoProfile.js`
- Test: `src/test/services/echo/echoSteps.test.ts`; update the old `src/test/echoMemoryService*.test.*` (remove tests of removed functions)

**Interfaces:**
- Consumes: Tasks 1–2; `StepInput`/`stepInputText` (`jose/stepInput.ts`); `generateAgentLlmResponse('echo', { prompt, format: 'json' })`.
- Produces:
  - `extractDecisions(input: { request: string; work: string; changeLog?: string[]; surface: Surface; requestId?: string; stepIds?: string[]; sources?: string[]; by?: string }): Promise<{ ok: true; saved: Decision[] } | { ok: false; reason: string }>` — shows the model the active decisions from `searchDecisions(request + work, { limit: ECHO_LIMITS.shownToModel })` with their ids; answer `{ decisions: [{ kind, text, why?, topics, appliesTo?, replaces? }] }`; `[]` is fine; a `replaces` not among the ids shown is dropped (Review Focus 2); one retry when unreadable; saves each through `addDecision` and `indexDecision`.
  - `runEchoStep(assignment, input: StepInput, ctx: { commandId: string; requestId?: string; surface: Surface }): Promise<StepResult>` dispatching on task type: `memory_recall` → recall; `memory_forget` → forget; `memory_cleanup`, `knowledge_curation` → Task 6's `proposeCleanup`; everything else under `memory_`/`retention_`/`knowledge_`/`timeline_` → save.
  - Save step summary: `Remembered: <text>.` per decision, or `Nothing to remember here.` for `[]`; failure `resultState: 'failed'` with `Echo couldn't save what was decided: <reason>`.
  - Recall: `searchDecisions(question, { limit: ECHO_LIMITS.recallMax, status: 'all' })`; none → summary exactly `I have nothing saved about <question topic>.` with no model call (Review Focus 1); else his model answers only from the listed records, each point with its date and surface, telling a replaced decision's history from the `replaces`/`replacedBy` chain. (The chain is read from the records, which the graph mirrors; the graph is for the viewer and for following a decision to its request and sources.)
  - Forget: when the request step already has `forgetId` (you picked one), forget that one: `Forgot: <text>.` Otherwise his model picks, from `searchDecisions(request)`, the ids that match what you asked to forget; clear → `forgetDecision` each, `Forgot: <text>.`; several possible → the step waits: `resultState: 'setup_required'`, summary `Which one should I forget?`, and `stepFields: { decisionChoices: [{ id, text }] }` (at most 6), nothing forgotten; none → `I have nothing saved about <it>.`, done.
  - The engine (generic, not Echo-only): when an executor's `setup_required` result carries `stepFields`, they are merged into the request step with `setup_needed` (as Alphonso's `projectChoices` are).
  - `StepResult` is the engine's usual `{ summary, resultState, resultUrl: null, artifacts, sources: [], contractAction }`; artifacts `{ type: 'echo_decision', id }` per decision saved or forgotten.
- [ ] **Step 1: Write the failing tests** (mock `lib/ollama`): "Remember that our launch is on Friday the 14th and the price is $29." → one decision saved, summary starts `Remembered:`; `[]` answer → `Nothing to remember here.`, nothing saved; unreadable twice → failed with `Echo couldn't save what was decided:`, nothing saved; `replaces` with an unknown id → nothing replaced; recall with an empty store → `I have nothing saved about` and the model is not called; recall with a replaced and a new decision → the prompt has both with their dates; forget one → `Forgot:`; forget with two matches → `setup_required` with both in `decisionChoices` and nothing forgotten; with `forgetId` on the request step → that one forgotten; the engine sends `memory_recall` to recall (not save); `generateAgentLlmResponse` is called without `model`/`endpoint`.
- [ ] **Step 2: Run** `npx vitest run src/test/services/echo src/test/joseExecutionEngineService.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement**; the engine's `executeEchoAssignment` calls `runEchoStep(assignment, options.stepInput, { commandId, requestId: requestForCommand(commandId)?.id, surface: surfaceOf(request?.source) })`.
- [ ] **Step 4: Run** the same plus `npx vitest run src/test/services/skills src/test/services/jose/agentOwnership.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(echo): save, recall and forget as his own steps`

### Task 4: Decisions from everywhere

**Files:**
- Modify: `src/services/jose/joseFinish.ts` (`saveRequestDecisions`), `src/services/contentFactory/contentQualityGate.ts` (`rejectPiece`), `src/services/contentFactory/contentBrandService.ts` (`keepLesson`)
- Test: `src/test/services/jose/joseFinish.test.ts`, `src/test/services/echo/outsideRequests.test.ts`

**Interfaces:**
- Consumes: Task 3's `extractDecisions`, Task 1's `addDecision`, `surfaceOf`.
- Produces: `saveRequestDecisions(request, outputs, options)` keeps its signature and `{ saved, note }` result; runs for every request ending `done`, `waiting_approval`, `waiting_setup` or `failed`; skipped when the plan had an Echo save step (`memory_preservation`/`memory_workflow_step`) as now; `work` = each step's agent name and hand-over (`readableOutput`), `changeLog` = the request's change log texts, `sources` = the steps' source urls, `stepIds` = the steps; note `Echo remembered: <text>` per decision (one change-log line each), `DECISIONS_SAVED` unchanged when none were found (`Echo found nothing new to remember.`), failure `Echo couldn't save what was decided: <reason>`.
- `rejectPiece(projectId, step, pieceId, reason)` also `addDecision({ kind: 'rejection', text: <what was rejected and the reason>, source: { surface: 'miya', by: 'you' } })`; `keepLesson` adds `{ kind: 'decision', text: <the lesson>, source: { surface: 'miya', by: 'you' } }`.
- [ ] **Step 1: Write the failing tests**: a finished Chat request whose Hector and Alphonso steps settle a price → one decision with `surface: 'chat'`, `requestId`, `stepIds`, the source urls, and a change-log line `Echo remembered: …`; a Telegram request → `surface: 'telegram'`; nothing decided → `Echo found nothing new to remember.`; model failure → the note, nothing saved; a rejected piece and a kept lesson each add one record with `surface: 'miya'`.
- [ ] **Step 2: Run** `npx vitest run src/test/services/jose/joseFinish.test.ts src/test/services/echo/outsideRequests.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** the same plus `npx vitest run src/test/services/contentFactory` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(echo): decisions from every request, Miya's rejections and kept lessons`

### Task 5: Every agent reads them

**Files:**
- Modify: `src/services/joseExecutionEngineService.ts` (step input `memory`, `retrievedContext`), `src/services/jose/joseInbound.ts` (`answerPromptWithHistory`), `src/components/ChatView.tsx` (direct answer), `src/services/jose/joseHelp.ts` (`chooseHelper` prompt line, `ruleHelper`), `src/services/skills/skillToolRun.ts` (`read_memory`), `src/services/telegramCompanionService.js` (`handleMemorySearchCommand`, `handleMemoryCommand`)
- Test: `src/test/services/echo/readers.test.ts`, extend `src/test/services/jose/joseHelp.test.ts`, `src/test/services/jose/joseInbound.test.ts`, `src/test/ChatView.test.jsx`, `src/test/connectors/telegramCompanionService.test.js`

**Interfaces:**
- Consumes: Task 2's `decisionsFor`, `decisionsText`, `searchDecisions`.
- Produces:
  - In `executeAssignment` the step input's `memory` is `decisionsText(decisionsFor(<request> + ' ' + <instruction>, { agent, actionType, large }), large)`; `retrievedContext` becomes `{ snippet: decisionsText(decisionsFor(commandText, {})), items: [] }` (the call to `retrieveRelevantContext` over notes is removed; the function stays exported for its own tests).
  - Direct answers (`answerOrPlan`, Chat's non-Direct answer): a block `Decisions you saved:\n<decisionsText>` after the instructions when non-empty (`decisionsFor(text, { agent: 'alphonso', actionType: 'assistant_answer' })`). Direct Mode unchanged.
  - `chooseHelper`: the prompt's task-type line gains `echo memory_recall (what was decided before)`; `ruleHelper` sends help about something decided/agreed earlier (`/\b(decided|decision|agreed|earlier|before|last time|previous)/`) to `{ agent: 'echo', actionType: 'memory_recall' }`, checked after security and before accuracy.
  - `read_memory` returns `decisionsText(searchDecisions(query))` or `Memory holds nothing about this.`.
  - Telegram `/memory <words>`: the matching decisions, one line each with its date; `/memory`: the 8 newest active decisions; none → `🧠 Nothing saved yet.`.
- [ ] **Step 1: Write the failing tests**: an Alphonso writing step's input has the launch decision and the email preference; a Hector step gets the launch decision but not Alphonso's preference; `answerOrPlan` direct prompt contains `Decisions you saved:` and the launch line; Chat's direct answer system message contains it; Direct Mode doesn't; `chooseHelper('what we decided about pricing', 'nova')` with an unreadable model answer → `{ agent: 'echo', actionType: 'memory_recall' }`; `read_memory` lists a decision; Telegram `/memory launch` shows the launch decision text (no "[object Object]").
- [ ] **Step 2: Run** the test files above — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(echo): every agent, every answer and Telegram get past decisions`

### Task 6: Cleanup he proposes and you approve

**Files:**
- Create: `src/services/echo/cleanup.ts`, `src/services/echo/echoPicks.ts`
- Modify: `src/services/joseSchedulerService.ts` (preset `echo_weekly_cleanup`, handler `echo_cleanup`, replacing `echo_nightly_consolidation`/`echo_consolidate`), `src/services/jose/joseTelegram.ts` (buttons), `src/services/telegramCompanionService.js` (`handleJoseButton`)
- Test: `src/test/services/echo/cleanup.test.ts`, `src/test/services/echo/echoPicks.test.ts`, extend `src/test/services/jose/joseTelegram.test.ts`, `src/test/connectors/telegramJose.test.js`, `src/test/services/joseSchedulerService.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `interface CleanupProposal { id; kind: 'merge' | 'replace' | 'contradiction' | 'drop' | 'promote'; ids: string[]; text?: string; keep?: string; reason: string }`; `interface CleanupSet { id; atMs; requestId?; proposals: CleanupProposal[]; status: 'open' | 'applied' | 'dismissed' }` in `alphonso_echo_cleanup_v1`.
  - `proposeCleanup(ctx, requestStep): Promise<StepResult>` — when the request step has `cleanupSetId` and that set is `applied` → done, `Applied <n> changes to memory.`; `dismissed` → done, `Left memory as it is.`. Otherwise Echo's model reads the active decisions (and, while `alphonso_echo_notes_reviewed_v1` is unset, the old notes from `listMemoryItems()` as `note:<id>`) and answers proposals; ids it wasn't shown are dropped; none → done, `Memory looks tidy.`; some → saves an open `CleanupSet` and the step waits: `resultState: 'setup_required'`, summary `Echo proposes <n> changes to memory: tick the ones to apply.`, `stepFields: { cleanupSetId }`. Nothing changes while it waits.
  - `openCleanup(): CleanupSet | null`, `applyCleanup(setId, proposalIds: string[]): { applied: number }` — merge: `addDecision` with the merged text and `replaces` each (first one gets the link, the rest marked replaced); replace: `replaces`; contradiction: the `keep` one stays, the others replaced by it; drop: `forgetDecision`; promote: a note becomes a decision (`by: 'you'`); marks the set applied and the notes reviewed. `dismissCleanup(setId)`.
  - Schedule preset `{ id: 'echo_weekly_cleanup', cron: '0 20 * * 0', label: 'Echo: tidy memory', handler: 'echo_cleanup' }`; the handler runs one Echo `memory_cleanup` step through `submitStepsToJose()` (label `ECHO_CLEANUP_LABEL = 'Steps set by Echo.'`, `allowPaidModels: false`).
  - `echoPicks.ts` (the buttons' work, like `pickAlphonsoProject`): `pickForget(requestId, stepId, decisionId): Promise<{ ok; summary }>` (only while the request is `waiting_setup` and the id is one of the step's `decisionChoices`; saves `forgetId`, clears the choices, notes `You chose to forget: <text>`, carries the request on; else `Already done.`); `applyCleanupStep(requestId, stepId, proposalIds?: string[])` (all when not given) and `dismissCleanupStep(requestId, stepId)` (apply or dismiss the step's set, then carry the request on; a set no longer open → `Already done.`).
  - Telegram (`joseTelegram.ts`): a `setup_needed` step with `decisionChoices` gets `Echo asks: Which one should I forget?` and one button per choice (`action: 'pick_forget'`, `decisionId`, text cut to 40 characters); one with `cleanupSetId` gets `Echo proposes <n> changes to memory: <first three reasons>` with `Apply all` (`apply_cleanup`) and `Not now` (`dismiss_cleanup`), instead of Carry on. `SavedButton` keeps `decisionId`. `handleJoseButton` routes the three actions to `echoPicks.ts`; a stale press says `Already done.`.
- [ ] **Step 1: Write the failing tests**: a duplicate pair → the step waits with a merge proposal and nothing changed; `applyCleanupStep` with one ticked id applies only it and the request carries on to `Applied 1 changes to memory.`; Not now → `Left memory as it is.`, nothing changed; a proposal naming an unknown id is dropped; promote turns a note into a decision; `pickForget` forgets the picked decision and carries on; a stale pick → `Already done.`; the scheduler handler starts one Echo step; Telegram: one button per forget choice, Apply all / Not now for a cleanup, and each press routed.
- [ ] **Step 2: Run** the test files — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(echo): cleanup he proposes and you approve`

### Task 7: Routing — remember, forget, ask, clean up

**Files:**
- Modify: `src/services/jose/joseDecision.ts` (prompt line), `src/services/jose/josePlanner.ts` (`missingAsked`), `src/services/joseCommandRouterService.ts` (intents and rule steps)
- Test: `src/test/services/jose/joseDecision.test.ts`, `src/test/services/jose/josePlanner.test.ts`, `src/test/services/jose/routingSet.test.ts`

**Interfaces:**
- Produces:
  - `decideJoseRoute`'s prompt gains: `Plan when the message asks to remember or forget something, or to clean up memory: Echo does that.` A plain question still skips the model (answered with decisions, Task 5).
  - `missingAsked`: request with the remember intent and no Echo save step → `The request asks to remember something: add an echo step with the task type memory_preservation.`; forget intent without `memory_forget` → `…: add an echo step with the task type memory_forget.`; cleanup intent without `memory_cleanup` → `…memory_cleanup.`
  - Rule plan (fallback): intents `memoryForget` (`forget`, `stop remembering`), `memoryCleanup` (`clean up my memory`, `tidy memory`, `merge notes`), `memoryRecall` (`what did we decide`, `what did i say`, `remind me what`) give Echo steps `memory_forget`, `memory_cleanup`, `memory_recall`.
- [ ] **Step 1: Write the failing tests**: routing set rows `Remember that I prefer short emails without emojis` → echo `memory_preservation`; `Forget that the launch is on Friday` → echo `memory_forget`; `Clean up my memory` → echo `memory_cleanup`; `What did we decide about the launch?` → echo `memory_recall` in the rule plan; `missingAsked` for each; the route prompt contains the new line.
- [ ] **Step 2: Run** the three test files — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npx vitest run src/test/services/jose` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(echo): remember, forget, ask and clean up reach Echo`

### Task 8: Screens and the end of the noise

**Files:**
- Create: `src/components/echo/EchoRemembered.tsx`, `src/components/echo/DecisionsPanel.tsx`, `src/components/echo/CleanupProposals.tsx`
- Modify: `src/components/ChatView.tsx` (show `EchoRemembered` under a request's result), `src/components/jose/JoseRequestsBoard.tsx` (`EchoRemembered` for the selected request; `CleanupProposals` under an Echo cleanup step), `src/components/SettingsView.tsx` (replace `EchoTimeline` with `DecisionsPanel`; `CleanupProposals` there too), `src/hooks/useOllamaHealth.js` and `src/hooks/useAppShellState.js` (no `pushMemoryItem` for checks and screen observer), `src/hooks/useBootEffects.js` (one-time `removeCheckNotes()`), `src/services/unifiedMemoryService.js` (`removeCheckNotes()`: drops items whose `source` is `ollama-health-check` or `screen-observer`, once, key `alphonso_memory_checks_removed_v1`), `src/components/MemoryGraphViewer.tsx` (`NODE_TYPE_COLORS.decision`)
- Test: `src/test/components/echo/*.test.jsx`, `src/test/services/unifiedMemoryService.test.js` (extend), `src/test/hooks/useOllamaHealth.test.js` (extend)

**Interfaces:**
- Consumes: Tasks 1, 6.
- Produces:
  - `EchoRemembered({ requestId })` — `data-testid="echo-remembered"`: each decision whose `source.requestId` is the request: `Echo remembered: <text>` with `Edit` (inline, saves through `editDecision`) and `Forget` (`forgetDecision`); refreshes every 2 s while shown.
  - `DecisionsPanel()` — `data-testid="echo-decisions"`: Active list (date, where, kind label, text, Edit, Forget), a "Show replaced and forgotten" switch, preferences labelled `Preference — applies to <agents or work>`; the `maxDecisions` warning past the limit.
  - `CleanupProposals({ requestId, stepId, setId })` — `data-testid="echo-cleanup"`: the set's proposals with a tick each (all ticked by default), `Apply` (`applyCleanupStep` with the ticked ids) and `Not now` (`dismissCleanupStep`). Shown on the board under a waiting Echo cleanup step, and in Settings → Memory for the newest open set.
  - The board: a `setup_needed` Echo step with `decisionChoices` shows `Which one should I forget?` and one button per choice (`data-testid="echo-forget-<id>"`, calling `pickForget`), the same way it shows Alphonso's project buttons; Carry on is hidden while a step asks.
- [ ] **Step 1: Write the failing tests**: Chat shows `Echo remembered:` for a saved decision and Forget removes it; Edit saves new text; the Settings panel lists active decisions and hides forgotten until the switch; on the board, Apply applies only ticked proposals and a forget button calls `pickForget` with its id; `useOllamaHealth` no longer calls `pushMemoryItem`; `removeCheckNotes()` removes the check notes once and keeps others.
- [ ] **Step 2: Run** the test files — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** the test files plus `npx vitest run src/test/SettingsView* src/test/components/jose src/test/ChatView.test.jsx` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(echo): see, edit and forget decisions; apply cleanups; no more check notes`

### Task 9: Desktop check and docs

**Files:**
- Create: `e2e-desktop/specs/echo.e2e.mjs`
- Modify: `CLAUDE.md` (a new "Echo's decisions" row; the Echo, memory graph, step input, joseFinish, scheduler, Telegram and desktop-suite rows), `docs/ALPHONSO_GROUND_TRUTH.md` (§11.47), `docs/AGENT_GUIDE.md` (Echo), `docs/USER_MANUAL.md` (remembering, asking, forgetting, cleanup, Settings → Memory), `docs/CHANGELOG.md`, `docs/governance/DEFERRED_WORK.md` (shared memory between computers; meaning-based search without ChromaDB), the spec's status line, the counts in README/AGENTS/ARCHITECTURE/CLAUDE and `scripts/verify-doc-counts.mjs`

- [ ] **Step 1: Write the spec** (deny unexpected approval windows; `showPlanFirst: 'never'`; uses `qwen2.5:7b` when installed): "Remember that our launch is on Friday the 14th and the price is $29." saves an active decision and Chat shows `Echo remembered:` with Forget; after Chat's New, "What did we decide about the launch?" answers with `14` and `29`; "Remember that I prefer short emails without emojis." then "/jose Write a short email to Sam about the launch." gives an email with no emoji and `14`; "Remember that the launch moved to Saturday the 15th." marks the old decision replaced, and "/jose What did we decide about the launch date?" mentions both dates; Forget on the price decision → it is `forgotten` in storage and the next recall doesn't give `29`; with two launch decisions active, "/jose Forget the launch decision" waits with a button per decision on the board, and the picked one is forgotten; "/jose Clean up my memory" leaves every decision as it was until Apply on the board; no memory item with `source` `ollama-health-check` is saved during the run.
- [ ] **Step 2: Build and run** — `npm run tauri build -- --debug --no-bundle`, then `ALPHONSO_E2E_EDGEDRIVER=D:/AgentDevWork/tools/msedgedriver-155.0.4283.62/msedgedriver.exe npx wdio run e2e-desktop/wdio.conf.mjs --spec e2e-desktop/specs/echo.e2e.mjs` — Expected: all checks pass; then rerun `agent-roles`, `alphonso`, `marcus` specs — Expected: pass.
- [ ] **Step 3: Docs**, then `node scripts/verify-doc-counts.mjs`, `npm run generate:dnd-map`, `npm run verify:dnd-coverage`, `npx tsc --noEmit -p .`, `npm run lint`, full `npm test` — Expected: all clean.
- [ ] **Step 4: Commit** `test(echo): the real app remembers, answers, forgets and asks before cleaning up` and `docs(echo): decisions for the whole ecosystem`
