# Agent phase 1: Hector (and the routing guards)

> **Status (2026-10-25):** design, written with the owner after the Hector inspection of 2026-10-25 (code reading plus two live runs in the real app). Not built yet. First of the per-agent phases agreed on 2026-10-25 (Hector, Nova, Maria, Sentinel, Marcus, Alphonso, Echo; then agent roles Part C; then Jose phase 7).

## Why

Hector is promised to find facts and sources, with citations, for every agent that needs them. The inspection found that what reaches the next agent is weak and often wrong:

- **Live, about half the sources were blocked** (3 of 6 from the Research Desk, 5 of 8 through Jose): Cloudflare "enable JavaScript", ResearchGate and ScienceDirect checks, rate limits. Nothing fell back to the search engine's own snippet.
- **Through Jose, the search query was the whole step text** (317 characters: "/jose", Jose's instruction, the "end with HELP:" note, up to 1,500 characters of earlier work). `executeHectorAssignment` passes it as the research question, and `discoverResearchSourcesWithFailover` searches with it unchanged.
- **The write-up reads about 750 characters from the start of each page** (`HECTOR_SYNTHESIS_TOTAL_BUDGET` 6,000 over all sources), mostly menus and banners.
- **Only the 2-4 sentence overview reaches the next agent**; key findings, disagreements and gaps stay inside the report (`artifacts: [{ type: 'hector_report', reportId }]`). Live, Hector handed on sentences about the sources ("the second source provides numbers…"), not the facts.
- **No sources → his model writes facts from memory** (`synthesizeHectorFallbackReport`), and the step still counts as done.
- **Storage**: each report keeps up to 200 KB of text per page (a PDF came in as 98,000 characters of raw PDF). After 3 reports Hector's key held about 790,000 characters; app storage holds about 5 million, so after 15-20 runs every save in the app fails.
- **Junk counts as verified**: the Google Scholar home page passed because it loaded; "verified" means HTTP 200, and the step then reports `verified`.
- **"Official"** means the address contains docs, developer, github, tauri or ollama (`scoreSourceConfidence`).
- **Two search chains**: Jose steps and the Desk use Brave → DuckDuckGo → RSS; the content factory and the `web_search` skill tool use Brave → Tavily → Perplexity → DeepSeek, where DeepSeek (a chat model) is added as a source with a `deepseek://` link.
- **RSS-only results crash the run** (`{ ok, sources, strategy }` has no `providerChain`; `discovery.providerChain.join` throws; the run is marked "discovery failed").
- **"Citations" is a list of links**; no finding points to a source.
- **The Research Desk runs outside Jose** (not on the board); "Hand off to Jose" makes a `research_review` packet nothing reads; the Desk has two exports that write different reports; every research step saves a draft memory note, a session event and graph nodes; bookmarks (`hectorBookmarkService.ts`) are never used.
- **Routing**: Jose's model is told task-type prefixes without meanings ("local_operation, verification_, runtime_, assistant_…"), so a small model gave Alphonso `local_operation` for a paragraph. In every live run on 2026-10-25 the 7B model's plan was unusable and the fallback dropped the writing part of the request.

## Goals

1. A research task comes back as a researched answer, not a search: the question broken into what must be answered, follow-up rounds for what's missing, sources compared, the answer first.
2. Hector searches with short, real queries, reads the relevant parts of the pages he can reach, and keeps the search snippet for pages he can't.
3. He hands on full findings with numbered citations, and says plainly when he found nothing.
4. One search chain everywhere; no model answer passed off as a source.
5. Research never fills app storage.
6. The Research Desk is a door into Jose like every other.
7. Jose's model gives work to the right agent and the right kind of work, and no part of a request is dropped.

## Non-goals

- Nova's, Maria's and the other agents' own fixes (their phases). Maria will get the source text through the hand-over built here; her checking is her phase.
- A headless browser for blocked pages (owner chose browser-like fetching plus snippet fallback).
- Jose phase 7.

## Anti-goals

- A fact without a source, or a model answer shown as a source.
- A step reported done when Hector found nothing.
- Hardcoded sites, models or folders.
- A list of search results presented as research.
- Unbounded research: rounds, sources and model calls have limits.

## Owner decisions (2026-10-25)

| Topic | Decision |
|---|---|
| Blocked sites | Fetch like a browser (normal headers, one retry); a page still blocked keeps the search engine's snippet, marked "Snippet only" |
| Search chain | One chain for every caller: whichever are set up of Brave, Tavily, Perplexity, then free DuckDuckGo, then news feeds. DeepSeek is no longer a source |
| No usable sources | The step stops as needing you (`setup_needed`) with what happened (blocked, no search key, nothing found); Carry on retries; no facts from memory |
| Research Desk | Each run is a one-step Hector request through Jose; the Desk stays Hector's page; "Hand off to Jose" becomes "Use in a request" |
| Hand-over | Overview, findings each with source numbers [1][2], disagreements, gaps, then the numbered sources (title, link, label); the same text on the board and Telegram |
| Reading pages | Strip menus and boilerplate, keep the paragraphs that share most words with the question, within a budget that grows with the model |
| Storage | Page text in files under the app data folder (removed with the report); the report keeps titles, links, the write-up, short excerpts; oversized old reports slimmed once at start |
| Routing | A plain task-type menu in the planner; a kind-of-work check; a routing test set |
| Search query | Hector's model writes 1-3 short queries; fallback: the request's own words, cleaned and cut |
| Source quality | Drop junk pages; honest labels (Read / Snippet only / Couldn't read); prefer primary sources by site type |
| Side features | One export; fewer memory notes; connect bookmarks |
| Planner | The fallback keeps every part of the request; the planner prompt is shortened |

## Design

### One research run (`src/services/hector/researchRun.ts`, new)

Every caller (Jose's Hector step, the Desk's one-step request, `createResearchBrief`, the content factory's search, the `web_search` and `fetch_source` skill tools) goes through one module:

1. **Queries.** `writeQueries(question, request)`: Hector's model answers `{"queries": ["...", "..."]}`, at most 3, each at most 120 characters; unreadable → `fallbackQuery(request)`: the request without a leading command word (`/jose`, `Ask Jose:`), the HELP line or anything after the first blank line, cut to 150 characters at a word. Jose's instruction, the HELP note and earlier steps' work never go into a query.
2. **Search.** `searchChain(queries)`: the configured providers in order (Brave, Tavily, Perplexity), then DuckDuckGo through the backend, then news feeds (`fetchRssSources`); stop when 8 usable results are found; each result keeps the engine's title and snippet. DeepSeek is not called. Results are de-duplicated by address.
3. **Junk filter.** `isJunkResult(url, title, snippet)`: a site's home page (empty path), search or results pages, login or sign-in pages, and known wall texts ("enable JavaScript", "security check", "unusual activity", "Just a moment") are dropped. Rules on URL shape and text, no site list.
4. **Rank.** `sourceKind(url)`: `primary` for government, intergovernmental and education domains by suffix (`.gov`, `.gov.<cc>`, `.mil`, `.int`, `.edu`, `.ac.<cc>`, `europa.eu`'s `.eu` institutions by the `europa.eu` suffix), research-paper hosts by path shape (`/doi/`, `/article/`, `/publication/`, `.pdf`), `news` for paths with a date, else `general`. Primary first, then news, then general, keeping engine order within each. Replaces `scoreSourceConfidence`'s docs/developer rule.
5. **Fetch.** The backend's `fetch_research_sources` sends normal browser headers (a desktop browser user agent, `Accept`, `Accept-Language` from the system locale) and retries once after 1.5 s on 403/429/503. A PDF (content type or `%PDF`) is not decoded: it keeps its snippet ("Snippet only (PDF)"). Text is cut at 200 KB as today.
6. **Labels.** `read` (page text used), `snippet` (blocked or PDF: the engine's snippet used), `unreadable` (nothing usable); with the reason. "Verified" is no longer used for a page that loaded.
7. **Read the relevant parts.** `relevantText(pageText, question, budget)`: split into paragraphs, drop navigation-like lines (short lines, link lists, cookie and menu words), score each paragraph by shared words with the question and queries, keep the best in page order up to the budget. Budget per source: total ÷ sources, with the total 8,000 characters for a local model under the tool-call size (Settings → Agents, `getToolCallMinSize()`), 24,000 otherwise (paid, cloud, or a local model at or above that size).
8. **Write-up.** One model call with the relevant parts, numbered `[1]…[n]` in source order; answer JSON `{ answer, subQuestions: [{ question, status, findings: [{ text, sources: [1, 3], support }], followUp }], disagreements, notFound }`. A finding without a known source number is dropped. Unreadable answer → the step fails "Hector's model didn't write a usable report." (no keyword stand-in).
9. **Nothing usable** (no results, or every source `unreadable`, or no search engine reachable): the run returns `noSources` with the reason; the Jose step ends `setup_needed` ("No search engine found anything for '…'. Add a search key in Settings → Connectors → Search & Research, or rephrase.", or "Every source blocked Hector: …"); Carry on retries.

### Real research, not a search (owner, 2026-10-25)

The owner: "when I give a research task, I expect a proper result, not just a Google search." So a research run is a loop that works the question until it is answered or the limits are reached:

1. **Plan the question.** Hector's model breaks the question into the sub-questions it must answer (at most 5; "how many colonies in Europe", "main causes of decline", "trend over time") and writes 1-3 queries for each (one model call, which replaces step 1's separate query call).
2. **Round 1.** Search, filter, rank, fetch and read as above, for all sub-questions.
3. **Find what's missing.** The write-up (step 8) also says, per sub-question, `answered`, `partly` or `open`, and for each `partly`/`open` one follow-up query (a different angle: an official statistic, a named report, a year).
4. **Follow-up rounds.** For the follow-up queries only: search, read new sources (never re-read one), then write up again with everything read so far. At most 2 follow-up rounds for a local model under the tool-call size, 3 otherwise; stop early when every sub-question is answered or a round finds nothing new.
5. **Compare.** The final write-up states a figure once with the sources that give it; when sources disagree it says so with each figure and its source and which looks more reliable (primary over general, newer over older), never averages silently.
6. **Answer first.** The report starts with the direct answer to the question in two or three sentences, then the sub-questions each with their findings and citations, disagreements, what could not be found, and the sources. Each finding carries how well it is supported: `several sources`, `one source`, `one source, not primary`.

Limits (constants beside `JOSE_LIMITS`, adjustable): at most 20 sources read per run, 5 sub-questions, the rounds above, and the step's normal time limit. Model calls per run: one for the plan of the question, one write-up per round (so 2 to 4). The Desk and Jose steps run the same loop; the content factory's trend research keeps a single round (it needs posts and hooks, not an answered question).

### What Hector hands on

The step output's `summary` is the full text:

```
<the direct answer, two or three sentences>

<sub-question 1>
- <finding> [1][3] (several sources)
<sub-question 2>
- <finding> [2] (one source, not primary)
…
Sources disagree: …
Could not find: …

Sources:
[1] <title> — <link> (Read)
[2] <title> — <link> (Snippet only: blocked)
```

`schema` keeps the same as data (`{ answer, subQuestions, disagreements, notFound, sources: [{ n, title, url, kind, label, excerpt }] }`), so `readableOutput()` hands it on in full and `read_sources` returns the numbered list with excerpts. Telegram and the closing summary show the same text (a one-step request shows it whole).

### Storage (`src-tauri/src/research_store.rs`, new)

`research_save_pages(reportId, pages: [{ n, text }])` writes `<app data>/research/<reportId>/<n>.txt` (report id checked: `hector-report-` plus letters, digits and dashes); `research_read_page(reportId, n)`; `research_delete(reportId)`. The report in app storage keeps titles, links, labels, excerpts (at most 600 characters each) and the write-up. `writeRows` keeps 200 reports and deletes the page folders of the ones it drops. At start, `slimOldReports()` moves any stored `snippet` longer than 600 characters to a file once (and records that it ran). `read_project_file` is untouched; Maria's `read_sources` gets the excerpts, and a new `read_source_page` tool (Maria, Nova, Sentinel; `read`) reads a page file by source number.

### The Research Desk through Jose

"Run Live Research" submits a one-step Hector `research_report` request through `submitStepsToJose()` (label "Asked on the Research Desk."), with the question as the instruction and supplied URLs in `payload.urls` (fetched before the search results); the Desk shows the request's live progress and the report. The request appears on the board. "Hand off to Jose" becomes "Use in a request" (fills Chat with "Using Hector's report on '<question>': " and the report attached as a needed output). `createHectorApprovalPacket` is removed. One export: the Markdown/PDF/PowerPoint export (`hectorExportService.ts`), now with numbered citations; the Desk's own inline export is removed.

### Side features

- **Memory notes:** a research step no longer saves a draft note, session event or graph nodes when it starts; a finished report saves one note (title, question, number of findings and sources) and its graph nodes.
- **Bookmarks:** a "Save source" button on each source (Desk and board step output) saves it with `saveBookmark()`; a "Saved sources" list on the Desk (open, remove, export); a `read_bookmarks` tool for Hector's skills.

### Routing guards and the planner (`josePlanner.ts`, `stepGraph.ts`, `joseCommandRouterService.ts`)

- **Task-type menu.** `TASK_TYPE_MEANINGS` (new, `src/services/jose/taskTypeMeanings.ts`): every action type used by templates, the content factory, workflows, `ACTION_EFFECTS` and the splitter, with a one-line meaning ("assistant_write: everyday writing (emails, notes, paragraphs); no code"). A test fails when a used type has no meaning. The planner prompt lists, per agent, its task types with meanings instead of prefixes, and no longer repeats every effect sentence.
- **Kind-of-work check.** `checkPlan()` gains `kindOfWork`: a step whose task type changes or runs code (`local_operation`, `verification_`, `execute_command`, `filesystem_`, or effects `run`/`change_project`) is refused when neither the request nor the step's instruction is about code (`isCodeRequest()`: code, app, build, test, file, repo, script, bug, function, install, deploy and similar as whole words), with "This is writing, not code: give it to Alphonso as assistant_write." The planner's one fix round gets the problem; then the rule plan.
- **The fallback keeps every part.** `decomposeJoseCommand()` adds a writing step when the request asks for writing (write, draft, summary, summarise, post, paragraph, email, letter, note as whole words) and no creative intent took it: Alphonso `assistant_write` needing the research step when there is one; "post" alone no longer means publishing unless a platform or send word is present. A check step is added when the request asks for one (check, verify, accuracy, review).
- **Shorter planner prompt.** The prompt drops repeated effect lists and long examples; the template offer stays.
- **Routing test set.** `src/test/services/jose/routingSet.test.ts`: about 40 requests, each with the expected agent and task type per part, run against the rule plan and template matching (no model). Today's misses are in it ("research … and write a short summary", "write a short post", "write a paragraph about …").

## Testing

- Unit: the research loop (sub-questions, a follow-up round only for `partly`/`open`, early stop, limits, never re-reading a source, disagreements kept with each figure); query writing and fallback (no "/jose", no HELP, ≤150); the junk filter; source kinds; relevant-text selection (menus dropped, question paragraphs kept, budget by model); the write-up parser drops unsourced findings; the hand-over text; no-sources → `setup_needed`; RSS-only results no longer crash; one chain for every caller; DeepSeek never a source; storage writes page files and slims old reports; Rust: headers, retry on 403/429, PDF kept as snippet, report-id check, page files; the Desk submits a one-step request; bookmarks; task-type meanings cover every used type; kind-of-work check; the fallback keeps every part; the routing set.
- Desktop: a research request through Jose ("how many honeybee colonies are there in Europe and why are they declining") starts with a direct answer, has at least two sub-questions with cited findings, ran a follow-up round when the first left a gap, and shows numbered findings and labelled sources on the board and in Chat, no page text in app storage over 600 characters per source, and a Desk run appears on the Requests board. The by-hand Hector inspection spec's checks become `hector.e2e.mjs`.

## Left to the builder

The exact browser headers; the navigation-line rules; the meaning text for each task type; the routing set's requests (starting from today's misses).

## Calls made in this document (owner may override)

0. Research rounds: at most 2 follow-ups (local under the tool-call size) / 3 (otherwise); 20 sources and 5 sub-questions per run; the content factory's trend research stays one round.
1. Budgets: 8,000 characters (local under the tool-call size) / 24,000 (otherwise) for the page text in the write-up.
2. 200 reports kept (was 500); page text in files.
3. Excerpts of 600 characters per source in the report.
4. A PDF keeps its snippet; no PDF text extraction in this phase.
5. "Primary" by domain suffix and path shape, never a site list.
6. The fallback adds Alphonso `assistant_write` for writing when no creative intent took it.
