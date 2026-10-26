# Agent phase 3: Maria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maria reviews the real work (with its sources and files) or the real plan, from her model only, and every agent gets the work it is linked to.

**Architecture:** A new `src/services/maria/` folder holds her two reviews (work, plan), the files and sources she reads, the holds she puts on later steps, and the weekly request; `runMariaGovernanceAudit()` keeps its name and becomes the dispatcher. Routing fixes (the planner fallback, the audit route, "discount code", the hand-overs) are edits to existing files.

**Tech Stack:** TypeScript, React, Vitest, WebdriverIO desktop E2E.

**Spec:** `docs/superpowers/specs/2026-10-25-agent-phase-maria-design.md`

**Starts after** agent phase 2 (Nova, PR #359) is merged: the branch is rebased on `main` first (it builds on Nova's `AGENT_DEPENDENCIES.nova`, the rule-plan Nova `needs`, `asksToMake()` and the publishing send-word rule).

## Global Constraints

- No keyword verdicts: `buildMariaFallbackAudit()` and Maria's use of `generateRiskScore()` go; Marcus stops using `generateRiskScore()`.
- Unreadable twice: `Maria's model didn't give a readable review.`; drafting off: `Maria's model is switched off.`
- No explicit `model` or `endpoint` in Maria's, Alphonso's assistant and Miya's package calls.
- Confidence `inferred`, never `verified`.
- Schema keeps `riskLevel`, `approvalRequired`, `summary` (Boardroom, Marcus, the approval card) and `findings` as strings (Jose's review loop).
- Hold reason: `Maria asks for your approval: <reasons>`; changes reason: `Maria asked for changes: <findings>`.
- Offer line: `Want me to have Marcus prepare this? (<offer>)`.
- Alphonso's files: 6,000 characters each, 20,000 in all, cut with `(cut: N more characters)`.
- Weekly label `MARIA_WEEKLY_LABEL = 'Asked by the weekly Maria schedule.'`, preset label `Maria: the week's risks`.
- Delete no files (R14). Docs in the same commits as the code. Never `git add -A`.

## Review Focus

- A finding that quotes words not in the work (the model paraphrases): asked once for exact quotes, then kept under "Also noted", never shown as a quote (Task 5 test `a quote not in the work is asked once, then kept as a note`).
- A plan review that says needs approval with low risk: asked once, then medium (Task 6 test `no low risk with an approval`).
- Maria last in the plan asks for approval: nothing to hold, her answer says it (Task 8 test `with no step after hers nothing is held`).
- A review that still says "fix" after the 2 rounds, followed by Marcus: Marcus waits with her findings (Task 8 test `Marcus waits on a fix left after the rounds`).
- A request whose research failed: the fact check lists every claim unbacked with "No earlier step used sources." (Task 4 test `no sources makes every claim unbacked`).

---

### Task 1: The fallback plan keeps its links; write-ups and Miya wait for Nova

**Files:**
- Modify: `src/services/jose/josePlanner.ts` (`rulesPlan()`)
- Modify: `src/services/joseCommandRouterService.ts` (the writing step's `needs`)
- Modify: `src/services/jose/agentOrder.ts` (`miya: ['hector', 'nova']`)
- Test: `src/test/services/jose/josePlanner.test.*` (existing), `src/test/services/jose/routingSet.test.ts`, `src/test/agentOutputStoreService.test.js`

**Interfaces:**
- Produces: `rulesPlan(text)` returns steps with `decomposeJoseCommand()`'s `stepId` (else `<agent>`, `<agent>-2`…), `needs` (else the fixed order), `reviewOf` and `instruction`.

- [ ] **Step 1: Failing tests:** `the fallback keeps the links` (planner with a model plan that fails the checks twice, request `Research three facts about honeybees, write a short post about them, and have the post checked for accuracy` → steps `hector`, `write` (needs `['hector']`), `check` (needs `['write']`, `reviewOf: 'write'`)); routing set `a write-up waits for Nova when she is in the plan` (`Research coffee subscriptions, tell me which opportunity is best, and write a short summary` → `write.needs` contains `hector` and `nova`); `Miya waits for Hector and Nova` (`AGENT_DEPENDENCIES.miya` equals `['hector', 'nova']`).
- [ ] **Step 2: Run** those files — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them plus `npx vitest run src/test/services/jose` — Expected: PASS.
- [ ] **Step 5: Commit** `fix(jose): the fallback plan keeps each step's links; a write-up and Miya wait for Nova`.

### Task 2: An audit of a plan is a review; "discount code" isn't code

**Files:**
- Modify: `src/services/joseCommandRouterService.ts` (`parseJoseCommand` intents: `planReview` = audit, review, assess or check of a plan, idea, campaign or proposal; when set, no `publishing`, `distributionExecution` or `localExecution` assignments; Maria's step is `governance_audit`)
- Modify: `src/services/jose/taskTypeMeanings.ts` (`isCodeRequest()` ignores `code` after discount, promo, coupon, voucher, referral, gift)
- Test: `src/test/services/jose/routingSet.test.ts`

- [ ] **Step 1: Failing tests (routing set):** `Audit this plan for compliance risks: tomorrow we email all 500 customers a 30 percent discount code and post it on Instagram.` → only `maria:governance_audit`; `Review our campaign idea: a referral code posted on TikTok` → only `maria:governance_audit`; `Research the market and review our launch plan` → `hector:research` and `maria:governance_audit`; `Post this to Instagram` still → `marcus:distribution_readiness`; `isCodeRequest('a 30 percent discount code')` is false, `isCodeRequest('fix the code in my app')` true.
- [ ] **Step 2: Run** `npx vitest run src/test/services/jose/routingSet.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus `npx vitest run src/test/services/jose src/test/joseCommandRouterService.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** `fix(jose): an audit of a plan is Maria's review only; "discount code" isn't code`.

### Task 3: Every agent gets all the work it's linked to

**Files:**
- Modify: `src/services/joseExecutionEngineService.ts` (`executeAssistantAssignment()`: add `stepInputText(options.stepInput)` after the skill section, drop `model`/`endpoint`; `executeMiyaAssignment()`: the research snippet from `options.stepInput.needs` (every needed step's text and sources) instead of `priorOutputs.hector`)
- Test: `src/test/joseExecutionEngineService.test.js` (or a new `src/test/services/jose/handOvers.test.ts`)

- [ ] **Step 1: Failing tests:** `Alphonso's writing prompt has every linked step` (a step input with needs Hector "Bees beat wings 11,400 times" and Nova "What to do first: the newsletter" → the prompt sent contains both); `Alphonso's step uses the step model` (no `model`/`endpoint` keys); `Miya's package reads the steps she is linked to` (needs Hector and Nova → her prompt contains both texts, not a different, later Hector step from `priorOutputs`).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus the engine and pipeline tests — Expected: PASS.
- [ ] **Step 5: Commit** `fix(agents): Alphonso's writing and Miya's package get every step they are linked to, with the step's model`.

### Task 4: What Maria reads (sources and files)

**Files:**
- Create: `src/services/maria/workContext.ts`
- Modify: `src/services/skills/skillToolRun.ts` (`neededOutputs()` → `workOutputs()`: the reviewed step and the steps it needed, three steps back, from the request's steps)
- Test: `src/test/services/maria/workContext.test.ts`, `src/test/services/skills/skillToolRun.test.ts`

**Interfaces:**
- Produces:
  - `workSteps(commandId: string, stepId: string, depth = 3): string[]` (the step and what it needed, nearest first, from `getJoseRequest(\`jose-request-${commandId}\`)`)
  - `workSources(commandId: string, stepId: string): { n: number; title: string; url: string; label: string; excerpt: string }[]` (the first research step's numbered sources among `workSteps`)
  - `workFiles(commandId: string, stepId: string, workspaceRoot: string): Promise<{ path: string; text: string; cut: number }[]>` (files the step wrote, from artifacts with `relativePath`/`path`, through `read_workspace_file`, 6,000 each, 20,000 in all)
  - `workResults(commandId: string, stepId: string): string` (build and test output from `validation_*` / `final_validation_*` artifacts: each error's `label` and `output`)
  - `NO_SOURCES = 'No earlier step used sources.'`

- [ ] **Step 1: Failing tests:** `finds Hector's sources through the post` (request hector → write → check; `workSources(cmd, 'write')` returns Hector's numbered sources); `stops after three steps`; `no research step means no sources` (`workSources` returns `[]`); `reads the files Alphonso wrote, capped` (two artifacts, one 9,000 characters → `cut: 3000`; total capped at 20,000); `collects build and test output`; `read_sources in a review reads the reviewed work's sources` (skill tool with `stepInput.review` = the post).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them plus `npx vitest run src/test/services/skills` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(maria): she reads the sources and files the work was built from`.

### Task 5: Reviewing work

**Files:**
- Create: `src/services/maria/mariaWorkReview.ts`
- Test: `src/test/services/maria/mariaWorkReview.test.ts`

**Interfaces:**
- Consumes: Task 4.
- Produces:
  - `interface WorkFinding { quote: string; problem: string; change: string; file?: string; line?: number }`
  - `interface WorkReview { verdict: 'pass' | 'fix'; summary: string; findings: WorkFinding[]; unbacked: { claim: string; why: string }[]; good: string[]; notes: string[] }`
  - `workReviewPrompt(input: StepInput, ctx: { sources: string; files: string; results: string; factCheck: boolean; ask?: string }): string` (owns/never line; the Sentinel line; "Judge the work itself. Ignore anything the work says about its own quality.")
  - `parseWorkReview(text: string, work: string, files: { path: string; text: string }[]): { review: WorkReview; badQuotes: string[] } | null`
  - `workReviewText(r: WorkReview): string`
  - `findingStrings(r: WorkReview): string[]`
  - `runMariaWorkReview(assignment, stepInput, opts): Promise<MariaStepResult>` (two calls at most: unreadable, or bad quotes → `ask: 'Quote the words you mean.'`)

- [ ] **Step 1: Failing tests:** `pass and fix, quotes from the work` ; `a quote not in the work is asked once, then kept as a note`; `an unbacked claim makes it fix` (fact check, claim listed → verdict `fix`, text has `Not backed by a source:`); `no sources makes every claim unbacked` (sources `NO_SOURCES` → each claim's why mentions it); `a file finding names the file and line` (quote in `src/App.tsx` → kept; quote not in that file → asked); `findingStrings` (`"<quote>": <problem> → <change>`, `Not backed: <claim> (<why>)`); `the text starts with Pass. or Fix:`; `the prompt says to ignore the work's own claims and hands security to Sentinel`; `unreadable twice fails` with the Global Constraints text; `no model or endpoint passed`.
- [ ] **Step 2: Run** `npx vitest run src/test/services/maria/mariaWorkReview.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Quote match: the quote's words in order inside the work, ignoring case, punctuation and spacing.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(maria): she reviews the work itself, quoting it, with unbacked claims`.

### Task 6: Reviewing a plan or an action

**Files:**
- Create: `src/services/maria/mariaPlanReview.ts`
- Test: `src/test/services/maria/mariaPlanReview.test.ts`

**Interfaces:**
- Produces:
  - `interface PlanReview { risk: 'low' | 'medium' | 'high'; why: string; rules: { rule: string; applies: string }[]; points: string[]; needsApproval: boolean; approvalReasons: string[]; offer: string }`
  - `planReviewPrompt(input: StepInput, opts: { ask?: string }): string`
  - `parsePlanReview(text: string): PlanReview | null`
  - `contradiction(r: PlanReview): string | null` (`'You asked for approval but said low risk: say which.'` or null)
  - `planReviewText(r: PlanReview): string`
  - `runMariaPlanReview(assignment, stepInput, opts): Promise<MariaStepResult>` (schema includes `riskLevel = risk`, `approvalRequired = needsApproval`, `summary`)

- [ ] **Step 1: Failing tests:** `a specific review` (parsed rules, points, approval reasons); `no low risk with an approval` (asked once, then `medium`); `approval reasons must be among the points or rules` (others are dropped; when none is left, `needsApproval` becomes false); `the offer line closes the text`; `the text starts with Risk:`; `the prompt hands security to Sentinel`; `unreadable twice fails`; `schema keeps riskLevel and approvalRequired`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(maria): she reviews a plan with its rules, points and what needs approval`.

### Task 7: Maria's step uses the two reviews

**Files:**
- Modify: `src/services/mariaAuditService.ts` (`runMariaGovernanceAudit(commandText, assignment, options)` → work review when `options.stepInput?.review`, else plan review; drafting off fails; no fallback, no `generateRiskScore`, no session event; one memory note `Maria: <about> — <Pass/Fix/Risk …>`; memory-graph `audits` edge kept; artifacts `[]`; `parseMariaAuditResponse`/`buildMariaFallbackAudit` removed)
- Modify: `src/services/joseExecutionEngineService.ts` (a Maria step with `reviewOf` and no `contentStep` goes to Maria's step, not `runReviewStep()`)
- Modify: `src/components/BoardroomChatView.tsx` (no "(rule-based)" label)
- Test: rewrite `src/test/mariaAuditService.test.*`; update `src/test/hermesSessionContinuity.test.js`, `src/test/services/jose/stepInput.test.ts`, Boardroom tests that used removed exports

- [ ] **Step 1: Failing tests:** `a review step goes to the work review`; `a step without reviewOf is a plan review`; `drafting off fails her step`; `no fallback export`; `one memory note, confidence inferred, no session event`; `no artifacts dump`; Boardroom `Conclude shows her review, never "(rule-based)"`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them plus Boardroom and engine tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat(maria): her step is a work or plan review from her model, with no keyword verdict`.

### Task 8: When she asks for approval or changes, the next steps wait

**Files:**
- Create: `src/services/maria/mariaHolds.ts`
- Modify: `src/services/joseExecutionEngineService.ts` (after a Maria step: `needsApproval` → `holdStepsAfter`; after the review loop gives up on a `fix` → `holdStepsAfter` with the findings)
- Modify: `src/services/jose/joseReviewLoop.ts` (`planReviewRound()` returns `heldBy: { reviewStepId, findings }[]` when the rounds ran out)
- Modify: `src/services/marcusExecutionService.ts` (find the review of the work he sends; no `generateRiskScore()`; no high-risk block of his own)
- Test: `src/test/services/maria/mariaHolds.test.ts`, `src/test/marcusExecutionService.test.*`, `src/test/services/jose/joseReviewLoop.test.*`

**Interfaces:**
- Produces: `holdStepsAfter(commandId: string, stepId: string, reason: string): string[]` (sets `waitFor` on every assignment and request step that needs `stepId` and hasn't run; returns their ids)

- [ ] **Step 1: Failing tests:** `holds the steps after hers with her reasons` (`waitFor` = `Maria asks for your approval: …`; request steps waiting); `with no step after hers nothing is held`; `approving a held step carries on` (`approveRequestStep`); `Marcus waits on a fix left after the rounds` (`Maria asked for changes: …`); `Marcus reads the review of the work he sends, not another` (two Maria steps; he uses the one whose `reviewOf` is his need); `Marcus uses no keyword score` (source check).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them plus `npx vitest run src/test/services/jose src/test/marcus*` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(maria): her approval and an unfixed review make the next steps wait; Marcus respects her review of what he sends`.

### Task 9: Sentinel through the help line; the review loop's verdicts

**Files:**
- Modify: `src/services/jose/joseHelp.ts` (`ruleHelper()`: security, secret, password, token, link, permission → `{ agent: 'sentinel', actionType: 'security_review' }`, checked before the others)
- Modify: `src/services/jose/joseReviewLoop.ts` (`judgeReview()`: an unreadable answer is `fix` with "The review could not be read: check it on the board." instead of a pass; a content-factory review's verdict from her scores: `fix` when a piece's score is under the brand's threshold or `honestyIssues` is not empty, no model call)
- Test: `src/test/services/jose/joseHelp.test.*`, `src/test/services/jose/joseReviewLoop.test.*`

- [ ] **Step 1: Failing tests:** `a security help request goes to Sentinel`; `an unreadable review is never a pass`; `a content review under the brand's threshold is fix, without a model call`; `a content review with an honesty issue is fix`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/test/services/jose src/test/services/contentFactory` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(maria): security goes to Sentinel through the help line; no review counts as a pass unread`.

### Task 10: The content factory's references

**Files:**
- Modify: `src/services/contentFactory/contentStepPrompts.ts` (`audit_content_quality`: for each brand reference, the research step's matching `references[]` entry (by link: title, hook, whyItWorks) and your note; the wording "compared with what is known about the brand's reference posts"; `comparedTo` names one or says "no reference known")
- Test: `src/test/services/contentFactory/contentStepPrompts.test.*`

- [ ] **Step 1: Failing tests:** `the quality prompt has what Hector found about each reference`; `a reference he didn't find says only its link and note`; `the prompt no longer says side by side`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/test/services/contentFactory` — Expected: PASS.
- [ ] **Step 5: Commit** `fix(maria): the content quality check compares with what is known about the references`.

### Task 11: One weekly review, as a request

**Files:**
- Create: `src/services/maria/mariaWeekly.ts` (`MARIA_WEEKLY_LABEL`, `askMariaWeeklyRisks(work: string): Promise<{ state: 'done' | 'failed'; summary: string }>`: one Maria `governance_audit` step through `submitStepsToJose()`, `source: 'schedule'`, `allowPaidModels: false`, the week's work and failed and waiting requests in the text)
- Modify: `src/services/joseSchedulerService.ts` (`maria_weekly_audit` preset label and handler)
- Modify: `src/App.tsx` (no `scheduleWeeklyGeneration()`, no "Maria weekly report ready")
- Test: `src/test/services/maria/mariaWeekly.test.ts`, `src/test/joseSchedulerService.test.js`

- [ ] **Step 1: Failing tests:** `asks one Maria step through Jose` (source, label, step, text with failures and waiting); `maps the result`; scheduler `maria_weekly_audit calls askMariaWeeklyRisks`; `App starts no weekly report` (source check).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** (lazy import of `submitToJose.ts`, as Nova's daily request does).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(maria): one weekly review of the week's risks, as a request`.

### Task 12: The offer in Chat

**Files:**
- Create: `src/components/maria/MariaOfferButton.tsx` (`MariaOfferButton({ commandId })`: shows when the request's Maria plan review has `offer`; "Have Marcus prepare this" sends `submitStepsToJose()` with one Marcus `distribution_readiness` step (`effects: ['read']`, the plan as text, label `Asked from Maria's review.`)
- Modify: `src/components/ChatView.tsx` (renders it under the last answer with a command id)
- Test: `src/test/components/mariaOffer.test.jsx`

- [ ] **Step 1: Failing tests:** `shows the offer when her review has one`; `nothing without an offer`; `pressing it asks Marcus to prepare, sending nothing` (step `distribution_readiness`, effects `['read']`).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(maria): Chat offers to have Marcus prepare what she reviewed`.

### Task 13: Desktop check, docs, full suite

**Files:**
- Create: `e2e-desktop/specs/maria.e2e.mjs` (pattern of `nova.e2e.mjs`): (a) `/jose Research three facts about honeybees, write a short post about them, and have the post checked for accuracy` → `write.needs` has Hector's step, Maria's step `reviewOf` the post, her summary starts `Pass.` or `Fix:`, every quoted finding appears in the post; (b) `/jose Audit this plan for compliance risks: tomorrow we email all 500 customers a 30 percent discount code and post it on Instagram.` → one step, Maria's, summary starts `Risk:`, Chat shows no `MARIA_AUDIT_SCHEMA`; when she asked for approval, nothing after her ran.
- Modify: `CLAUDE.md` (Maria rows: governance audit runtime, the review loop, the weekly report; new "Maria's reviews (agent phase 3)" row; the fallback plan; hand-overs), `docs/ALPHONSO_GROUND_TRUTH.md` (§11.43), `docs/AGENT_GUIDE.md` (Maria), `docs/USER_MANUAL.md` ("Ask Maria to check"), `docs/CHANGELOG.md`, `docs/governance/DEFERRED_WORK.md`, the spec's status, doc counts, the DND map.
- [ ] **Step 1: Write the spec file.** `node --check` it.
- [ ] **Step 2: Docs**; `node scripts/verify-doc-counts.mjs`, `npm run verify:dnd-coverage` — Expected: fresh.
- [ ] **Step 3: Full suite** `npm test` — Expected: all pass (update tests that pinned removed behaviour, each noted in the ledger).
- [ ] **Step 4: Live run** when this machine can build the app (`npm run tauri build -- --debug --no-bundle`): `maria.e2e.mjs`, then `nova.e2e.mjs`, `hector.e2e.mjs`, `agent-roles.e2e.mjs`; read her actual reviews. If builds are still blocked, say so in the PR and the ledger.
- [ ] **Step 5: Commit** `docs: agent phase 3 (Maria); desktop check for Maria`.
