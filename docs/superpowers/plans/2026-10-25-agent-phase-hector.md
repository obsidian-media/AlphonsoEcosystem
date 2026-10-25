# Agent phase 1: Hector (and the routing guards) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A research task comes back as a researched answer with numbered citations, from one search chain, without filling storage; and Jose's local model gives each part of a request to the right agent and kind of work.

**Architecture:** One research module (`src/services/hector/`) every caller uses: the question broken into sub-questions, a search chain with junk filtering and source ranking, browser-like fetching with snippet fallback, relevant-paragraph reading, a write-up per round with follow-up rounds for gaps, then a cited hand-over. Page text lives in files through a new Rust module. Routing: a task-type menu with meanings in the planner, a kind-of-work check in `checkPlan()`, a fallback that keeps every part of the request, and a routing test set.

**Tech Stack:** TypeScript, React, Vitest, Tauri 2 (Rust), WebdriverIO desktop E2E.

**Spec:** `docs/superpowers/specs/2026-10-25-agent-phase-hector-design.md` (owner approved 2026-10-25).

## Global Constraints

- No fact without a source; no model answer shown as a source; DeepSeek is never a source.
- No usable sources → the Jose step returns `resultState: 'setup_required'` with the reason (as `contentMediaExecutor.ts` does); never a keyword or memory stand-in.
- Limits as constants (`HECTOR_LIMITS` in `src/services/hector/researchLimits.ts`): 20 sources read, 5 sub-questions, 2 follow-up rounds for a local model under `getToolCallMinSize()`, 3 otherwise; page-text budget 8,000 / 24,000 characters; excerpts 600 characters; 200 reports kept; queries at most 120 characters, fallback query 150.
- "Large" = `usesOwnToolCalls()` from `joseModels.ts` (paid, cloud, or local at or above the Settings size).
- Search providers in order: Brave, Tavily, Perplexity (each only when set up), DuckDuckGo through the backend, news feeds. One chain for every caller.
- Primary sources by domain suffix and path shape only; no site lists. No hardcoded models, addresses or folders; page files under the app data folder (`app_data_subdir`).
- `joseExecutionEngineService.ts` and `App.tsx` are CRLF: edit with Python scripts only. Docs in the same commits. Never `git add -A`. No subagents.

## Review Focus

1. A research question whose first round answers everything: no follow-up round runs, and the report still starts with the answer.
2. Every source blocked or every search engine down: the step waits for setup with the reason, Carry on retries; nothing is written from memory.
3. A model write-up citing a source number that doesn't exist, or a finding with no source: dropped, never shown.
4. A request mixing research and writing ("research X and write a short summary"): the fallback plan keeps both parts, and the kind-of-work check refuses an Alphonso code step for it.
5. Reports saved before this phase with huge page text: slimmed once at start, and the app's storage stays well under its limit after 20 research runs.

---

### Task 1: Task types with meanings, in the planner

**Files:** Create `src/services/jose/taskTypeMeanings.ts`. Modify `src/services/jose/josePlanner.ts` (the agent lines). Test `src/test/services/jose/taskTypeMeanings.test.ts`, `src/test/services/jose/josePlanner.test.ts`.

**Interfaces — Produces:** `TASK_TYPE_MEANINGS: Record<string, string>`; `taskTypesFor(agent: string): { type: string; meaning: string }[]` (the agent's owned types from the record, by `ownerOf()`); `planningMenu(): string` (one block per agent but Jose: `<agent> owns: <owns> Never: <never>` then `- <type>: <meaning>` lines).

- [ ] **Step 1: Failing tests.** `every action type in use has a meaning` (templates, `STEP_AGENTS`, `WORKFLOW_STEP_TASK`, `ACTION_EFFECTS` keys, the splitter's types); `meanings belong to the owner` (`taskTypesFor('alphonso')` contains `assistant_write`, not `creative_script`); planner test `the prompt lists task types with meanings, not prefixes` (contains `assistant_write: `, not `Task types starting with`).
- [ ] **Step 2: Run** `npx vitest run src/test/services/jose/taskTypeMeanings.test.ts src/test/services/jose/josePlanner.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**; the planner prompt uses `planningMenu()` and drops the per-agent `may:` effect sentences (effects are still unioned by `inferEffects()`).
- [ ] **Step 4: Run** — PASS. **Step 5: Commit** `feat(jose): task types with meanings for the planner`.

### Task 2: The kind-of-work check

**Files:** Modify `src/services/jose/stepGraph.ts` (`checkPlan(steps, { taskTypes?, request?: string })`), `josePlanner.ts` and `submitToJose.ts` (pass the request). Create `isCodeRequest(text)` in `src/services/jose/taskTypeMeanings.ts`. Test `src/test/services/jose/stepGraph.test.ts`.

**Interfaces — Produces:** `isCodeRequest(text: string): boolean` (whole words: code, coding, app, website, build, compile, test, tests, bug, fix, function, script, repo, repository, install, deploy, file, files, api, component, refactor, npm, cargo); `CODE_TASK_PREFIXES = ['local_operation', 'verification_', 'execute_command', 'filesystem_']`. Problem text: `"<stepId> is writing, not code: give it to Alphonso as assistant_write."`

- [ ] **Step 1: Failing tests:** `refuses a code step for a writing request` (request "Research bees and write a short summary", Alphonso `local_operation` → the problem); `allows it when the request is about code` ("fix the build error in my app"); `allows it when the step's instruction is about code`; `no request given → no check` (older callers).
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS). **Step 5: Commit** `feat(jose): a code step needs a code request`.

### Task 3: The fallback keeps every part; the routing set

**Files:** Modify `src/services/joseCommandRouterService.ts` (`parseJoseCommand` intents and `decomposeJoseCommand`). Create `src/test/services/jose/routingSet.test.ts`.

**Interfaces — Produces:** intent `writing` (write, draft, summary, summarise, summarize, paragraph, post, email, letter, note, essay, article as whole words); `publishing` needs a platform or send word (publish, upload, send, schedule, youtube, instagram, facebook, tiktok, telegram, whatsapp, slack) — "post" alone is writing; intent `check` (check, verify, accuracy, fact-check, review). `decomposeJoseCommand` adds: an Alphonso `assistant_write` step when `writing` and not `creative`, needing the research step when present; a Maria `audit_quality` step with `reviewOf` the writing step when `check`.

- [ ] **Step 1: Failing tests.** `routingSet.test.ts`: a table of about 40 `{ text, expect: [[agent, actionType], …] }` covering: plain questions, "write a short post about…", "research X and write a short summary", "research X, write a post and check it", "write a paragraph about…", "draft an email to…", "make a YouTube video about…", "make three Shorts…", "build a web app…", "fix the failing test in…", "publish this to Instagram", "scan my last week for security issues", "what should we prioritise…", "remember that…", picture requests. Each runs `decomposeJoseCommand(parseJoseCommand(text))` and `scoreTemplateFit(text)` and checks owners and kinds (no `local_operation` without `isCodeRequest`).
- [ ] **Step 2–4:** run (FAIL on today's misses), implement, run (PASS); existing router tests stay green (`npx vitest run src/test/services/jose src/test/joseCommandRouter*`). **Step 5: Commit** `feat(jose): the rule plan keeps every part of a request; routing test set`.

### Task 4: Fetching like a browser; page files

**Files:** Modify `src-tauri/src/search.rs` (`fetch_research_sources`: headers, one retry on 403/429/503 after 1.5 s, PDF → `pdf: true` with no text). Create `src-tauri/src/research_store.rs` (registered in `lib.rs`): `research_save_pages(reportId, pages: Vec<{ n: u32, text: String }>)`, `research_read_page(reportId, n) -> String`, `research_delete(reportId)`; files `<app data>/research/<reportId>/<n>.txt`; `valid_report_id()` (`hector-report-` + `[a-z0-9-]{1,64}`), text cut at 200 KB.

- [ ] **Step 1: Failing Rust tests:** `browser_headers_are_sent` (a loopback server records the User-Agent: not `Alphonso-Hector`, contains `Mozilla/5.0`; `Accept-Language` present); `retries_once_on_403` (server answers 403 then 200 → ok); `pdf_is_not_decoded` (`%PDF` body → `pdf: true`, snippet `None`); `report_id_with_path_characters_is_refused`; `pages_round_trip_and_delete`.
- [ ] **Step 2–4:** `cargo test search research_store` (FAIL), implement, (PASS); `cargo clippy -- -D warnings`, `cargo fmt --all -- --check`. **Step 5: Commit** `feat(hector): fetch like a browser; page text in files`.

### Task 5: One search chain, junk filter, source kinds

**Files:** Create `src/services/hector/searchChain.ts`, `src/services/hector/sourceQuality.ts`, `src/services/hector/researchLimits.ts`. Modify `src/services/hectorResearchService.js` (`runMultiSourceResearch` and `discoverResearchSourcesWithFailover` delegate to the chain; DeepSeek removed from research). Test `src/test/services/hector/searchChain.test.ts`, `sourceQuality.test.ts`.

**Interfaces — Produces:** `interface FoundSource { url; title; snippet; provider; kind: 'primary' | 'news' | 'general' }`; `searchChain(queries: string[], { limit = 8 }): Promise<{ sources: FoundSource[]; providers: string[]; errors: string[] }>`; `isJunkResult(url, title, snippet): boolean`; `sourceKind(url): FoundSource['kind']`; `rankSources(list)`.

- [ ] **Step 1: Failing tests:** chain order and stop at the limit; a provider error goes to `errors` and the next is tried; results de-duplicated by address; DeepSeek never called (spy); RSS-only results return sources (no crash); junk: `https://scholar.google.com/`, `https://example.com/search?q=x`, a login page, "Just a moment... Enable JavaScript" are junk, a news article is not; kinds: `.gov`, `.gov.uk`, `.int`, `.edu`, `.ac.uk`, `ec.europa.eu` primary; `/doi/`, `.pdf`, `/publication/` primary; `/2026/09/` news; else general; ranking keeps engine order within a kind.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5: Commit** `feat(hector): one search chain with junk filter and source kinds`.

### Task 6: Reading the relevant parts

**Files:** Create `src/services/hector/relevantText.ts`. Test `src/test/services/hector/relevantText.test.ts`.

**Interfaces — Produces:** `relevantText(pageText: string, terms: string[], budget: number): string`; `pageBudget(sourceCount: number, large: boolean): number` (8,000 or 24,000 ÷ count).

- [ ] **Step 1: Failing tests:** menu/cookie/link-list lines dropped; the paragraph with the most question words kept first in page order; output within the budget; empty page → `''`; budget 1,000 per source for 8 sources local, 3,000 large.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(hector): read the parts of a page that match the question`.

### Task 7: The research loop

**Files:** Create `src/services/hector/researchRun.ts`. Test `src/test/services/hector/researchRun.test.ts` (models and the chain mocked).

**Interfaces — Consumes:** Tasks 4–6. **Produces:**
- `interface ResearchReport { answer: string; subQuestions: { question: string; status: 'answered' | 'partly' | 'open'; findings: { text: string; sources: number[]; support: 'several sources' | 'one source' | 'one source, not primary' }[] }[]; disagreements: string[]; notFound: string[]; sources: { n: number; title: string; url: string; kind; label: 'read' | 'snippet' | 'unreadable'; reason?: string; excerpt: string }[]; rounds: number }`
- `runResearch(question: string, opts: { request?: string; urls?: string[]; large: boolean; reportId: string; onProgress?; signal? }): Promise<{ ok: true; report: ResearchReport } | { ok: false; reason: string }>`
- `planQuestion(question, request)` (one model call → `{ subQuestions: [{ question, queries }] }`, ≤5 × ≤3 queries; unreadable → one sub-question, `fallbackQuery(request || question)`); `fallbackQuery(text)`; `parseWriteUp(text, sourceCount)` (drops findings without valid numbers; `support` computed from source count and kinds, not trusted from the model); `reportText(report): string` (the hand-over text in the spec's shape).

- [ ] **Step 1: Failing tests:** `fallbackQuery('/jose Research bees\n\nThe request: …\nHELP: …')` is `Research bees`; at most 3 queries × 5 sub-questions; a round for every `partly`/`open`, none when all answered; at most 2 follow-up rounds small / 3 large; a source is never fetched twice; 20 sources at most; a finding citing [9] of 4 sources is dropped; a write-up the model can't produce → `{ ok: false, reason: "Hector's model didn't write a usable report." }`; nothing usable → `{ ok: false, reason }` naming blocked sites or no results; supplied URLs read first; page text saved with `research_save_pages`, report excerpts ≤600.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(hector): research works the question in rounds and answers it`.

### Task 8: Hector's step, the hand-over, storage and tools

**Files:** Modify `joseExecutionEngineService.ts` (`executeHectorAssignment` via Python), `hectorResearchService.js` (reports: `runResearch` behind `runHectorLiveResearch`, `writeRows` limit 200 deleting dropped reports' pages, `slimOldReports()`, no draft memory note/session event/graph nodes at draft time; one note when finished), `src/services/skills/skillTools.ts` + `skillToolRun.ts` (`web_search`, `fetch_source` through the chain; `read_sources` returns numbered titles, labels and excerpts; new `read_source_page` (maria, nova, sentinel, `read`) and `read_bookmarks` (hector, `read`)), `src/skills/hector/*.md` and Maria's `claim-check.md` (tools), `App.tsx` boot (`slimOldReports()` once). Tests: `src/test/services/hector/hectorStep.test.ts`, updates to `skillToolRun.test.ts`, `hectorResearchService.test.js`.

**Interfaces — Produces:** the Hector step returns `{ summary: reportText(report), resultState: 'completed', schema: report, sources: urls, artifacts: [{ type: 'hector_report', reportId }] }`, or `{ resultState: 'setup_required', summary: reason }`; the query never contains the step instruction or HELP line (the step passes `stepInput.request` and the instruction separately).

- [ ] **Step 1: Failing tests:** the step's summary starts with the answer and contains `[1]` and `Sources:`; no sources → `setup_required` with the reason; the search question contains neither "HELP:" nor Jose's instruction; reports above 200 drop and delete their pages; `slimOldReports` moves a 98,000-character snippet to a file and leaves ≤600; a draft writes no memory note; `read_sources` gives numbered excerpts; `read_source_page` reads a page file; every built-in skill still passes `checkSkill`.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(hector): his step hands on a cited report; storage in files`.

### Task 9: Every other caller uses the same research

**Files:** Modify `src/services/contentFactory/contentAgentExecutor.ts` (`searchOnce` → `searchChain` with its own short query; one round, no write-up), `hectorResearchService.js` (`createResearchBrief` → `runResearch`), `src/services/joseSchedulerService.ts` if it searches. Tests: content executor tests, `createResearchBrief` test.

- [ ] **Step 1: Failing tests:** the content factory's research step never lists a `deepseek://` source; it gets junk-filtered, ranked sources; `createResearchBrief` returns the report's answer and numbered sources.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(hector): the content factory and research briefs use the same search`.

### Task 10: The Research Desk through Jose; one export; bookmarks

**Files:** Modify `src/components/dashboard/HectorResearchDesk.tsx` (Run → one-step Hector `research_report` request via `submitStepsToJose()`, label `DESK_LABEL` "Asked on the Research Desk.", `payload.urls`; live progress from the request; "Use in a request"; remove the inline export and `createHectorApprovalPacket` use; "Saved sources" list), `src/components/hector/ResearchReportPanel.tsx` + `SourceBoard.tsx` (answer first, sub-questions, citations, labels, "Save source"), `src/components/jose/JoseStepOutput.tsx` ("Save source" on sources), `src/services/hectorExportService.ts` (numbered citations), `hectorResearchService.js` (remove `createHectorApprovalPacket`). Tests: Desk, report panel, export.

- [ ] **Step 1: Failing tests:** Run on the Desk submits one Hector step with the question and URLs; the board shows the request; the report panel shows the answer before the sources and `[1]` links; the export has numbered citations; "Save source" saves a bookmark and "Saved sources" lists it; the Desk has no second export button.
- [ ] **Step 2–4.** **Step 5: Commit** `feat(hector): the Research Desk asks through Jose; one export; saved sources`.

### Task 11: Docs and the desktop check

**Files:** Create `e2e-desktop/specs/hector.e2e.mjs` (the spec's desktop checks). Docs: `CLAUDE.md` (Hector rows: research module, page files, Desk through Jose; routing guards in the Jose rows; counts), `docs/ALPHONSO_GROUND_TRUTH.md` §11.41, `docs/AGENT_GUIDE.md` (Hector; routing), `docs/USER_MANUAL.md` (research results, Desk, saved sources), `docs/CHANGELOG.md`, `docs/governance/DEFERRED_WORK.md`, counts (`verify-doc-counts`, `generate:dnd-map`, `verify:dnd-coverage`), the spec's status line.

- [ ] **Step 1:** write the desktop spec: a Jose research request starts with an answer, has ≥2 sub-questions with cited findings, sources labelled, no stored source text over 600 characters; a Desk run appears on the Requests board.
- [ ] **Step 2:** full unit suite, lint, typecheck, Rust checks; build and run `hector`, `research`, `agent-roles`, `agent-skills`, `jose-planner`, `jose-board`. **Step 3: Commit** `docs: agent phase 1 (Hector)`.

### Final

Whole-branch self-review (no subagents), PR, merge when CI is green.
