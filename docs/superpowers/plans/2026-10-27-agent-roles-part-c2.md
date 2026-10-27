# Agent roles Part C2: skills and agent improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 18 new built-in skills, timed Marcus sends, one request across two projects, editing Alphonso's change before approving it, Hector writing up with his skill, Echo matching decisions by meaning, and the three small leftovers.

**Architecture:** Skills are Markdown files checked by `checkSkill()`; the few that need new behaviour get a new task type with a small handler in the agent's own module. Timed sends ride on Marcus's existing runner as a new item kind. Two projects is a pure plan rewrite applied where security checks are added. Echo's meaning search is a backend embedding command plus a small TypeScript module beside his word search.

**Tech Stack:** TypeScript/React (Vitest, Testing Library), Rust/Tauri 2 (reqwest, cargo test), WebdriverIO desktop specs.

**Spec:** `docs/superpowers/specs/2026-10-26-agent-roles-part-c-design.md` (section "C2 — skills and agent improvements", decisions 5–10 and 12). Branch: `feat/agent-roles-part-c2`, cut from `main` after C1 (PR #365) merges.

## Global Constraints

- Alphonso is used by other people: nothing of the owner's (projects, keys, channels, folders, clock) is built in. Time is the user's own computer time zone.
- Every new skill "passes `checkSkill()` (the agent's own task types, its own tools, no effect it lacks), and is written for any user."
- Plain words in every screen and message; no em dashes in new UI text.
- No silent fallback: when something can't be done, say so on screen.
- Test first for every behaviour; watch it fail.
- Files are LF unless the file in `HEAD` is CRLF; never `git add -A` (the owner's `.serena/` and `brag-output/` stay out).
- Docs change in the same commits as the code (CLAUDE.md rows, Ground Truth §11.49, USER_MANUAL, AGENT_GUIDE, CHANGELOG, DEFERRED_WORK, counts via `node scripts/verify-doc-counts.mjs`).
- Rust: `cargo fmt --all -- --check` and `cargo clippy -- -D warnings` clean; new spawns none.
- Decisions pinned by the spec: embedding model `all-minilm` (46 MB), switch "Match decisions by meaning" in Settings → Memory, on by default; a timed send in the past sends now and says so; an unclear time asks; the newsletter goes through n8n or a Composio mail app only; "find companies or people" collects public work details only and Sentinel's personal-data check runs on the list; an edit is what gets written, marked "edited by you", one approval; two projects = one Alphonso step per project, each with its own preview, approval and lock.

## Review Focus

1. A request with a clock time that isn't about sending ("Write about the 9am meeting and post it to Slack #news") must send now, not at 9:00. Test in Task 5.
2. An edited file that also changed on disk after the preview is still refused, not written. Test in Task 7.
3. Two project names where one contains the other ("shop", "shop-admin") give one step per project, not three. Test in Task 6.
4. Ollama off, or the embedding model hanging, during a search: Echo answers from word search without waiting more than 4 s. Test in Task 9.
5. The app closes while a timed send is being sent: at the next start it is marked "check", never sent a second time. Test in Task 5.

---

### Task 1: New kinds of work, the brand tool, and the 18 skill files

**Files:**
- Modify: `src/services/jose/taskTypeMeanings.ts`, `src/services/jose/joseEffects.ts` (`ACTION_EFFECTS`), `src/services/skills/skillTools.ts`, `src/services/skills/skillToolRun.ts`
- Create: 18 files under `src/skills/` (names below)
- Test: `src/test/skills/builtInSkills.test.ts` (new), extend `src/test/services/skills/skillToolRun.test.ts`

**Interfaces:**
- Produces task types (meanings in plain words, effects in `ACTION_EFFECTS`): `assistant_explain_code` (read), `assistant_summarize` (read), `research_compare` (read), `research_people` (read), `analysis_pros_cons` (read), `analysis_pricing` (read), `audit_code` (read), `audit_brand_voice` (read), `security_dependencies` (read), `security_personal_data` (read), `distribution_newsletter` (publish_or_send), `memory_digest` (read). Each must be owned by exactly one agent through the existing prefixes (`ownerOf()`); `agentOwnership.test.ts` must stay green.
- Produces tool `read_brand` in `SKILL_TOOLS`: `{ effects: ['read'], agents: ['maria', 'miya'], label: 'Read a brand’s voice' }`; `runSkillTool('read_brand', { brand?: string })` returns the named brand (or the first brand) as text: tone, words to avoid, kept lessons (`status === 'kept'`); no brands → `{ ok: false, text: 'No brand is set up. Add one in Miya Studio → Brands.' }`.
- Skill files (front matter as the existing ones; `task_types`, `tools`, `steps`, `output`):
  - `alphonso/fix-a-bug.md` (`local_operation`), `alphonso/write-tests.md` (`local_operation`), `alphonso/explain-code.md` (`assistant_explain_code`, tools `read_project_file`, `read_step_output`), `alphonso/summarise-a-document.md` (`assistant_summarize`, tools `read_project_file`), `alphonso/api-integration.md` (`local_operation`; text says the key is read from the project's settings or environment and never written into code, and facts about the service come from Hector through a `HELP:` line), `alphonso/plan-and-build-a-feature.md` (`local_operation`; files and order first, built in stages, each checked before the next, within his one code step; splitting work between agents stays Jose's).
  - `hector/compare-products.md` (`research_compare`), `hector/find-companies-or-people.md` (`research_people`; businesses and people's public work details only: name, role, company, public work page; never home addresses, private phones or personal emails).
  - `nova/pros-and-cons.md` (`analysis_pros_cons`), `nova/pricing.md` (`analysis_pricing`).
  - `maria/review-code.md` (`audit_code`, output `review_with_verdict`), `maria/brand-voice-check.md` (`audit_brand_voice`, tools `read_step_output`, `read_brand`, output `review_with_verdict`).
  - `sentinel/dependency-check.md` (`security_dependencies`), `sentinel/personal-data-check.md` (`security_personal_data`).
  - `marcus/email-newsletter.md` (`distribution_newsletter`, tools `read_step_output`, `send_message`), `marcus/follow-up-reminder.md` (`distribution_execution`, tools `read_step_output`, `send_message`; the text says the time comes from the request).
  - `echo/weekly-decisions-digest.md` (`memory_digest`, tools `read_memory`), `echo/project-memory-summary.md` (`memory_recall`, tools `read_memory`; oldest first, with what replaced what).

- [ ] **Step 1: Write the failing tests**

```ts
// src/test/skills/builtInSkills.test.ts
it('every built-in skill passes checkSkill', () => {
  expect(refusedSkills().filter((r) => r.builtIn)).toEqual([]);
});
it.each([
  ['alphonso', 'local_operation', 'Fix a bug from an error'],
  ['alphonso', 'assistant_explain_code', 'Explain code'],
  ['alphonso', 'assistant_summarize', 'Summarise a document'],
  ['hector', 'research_people', 'Find companies or people'],
  ['nova', 'analysis_pricing', 'Pricing'],
  ['maria', 'audit_brand_voice', 'Brand voice check'],
  ['sentinel', 'security_personal_data', 'Personal-data check'],
  ['marcus', 'distribution_newsletter', 'Email newsletter'],
  ['echo', 'memory_digest', 'Weekly decisions digest'],
])('%s is offered "%s" work through the skill "%s"', (agent, task, name) => {
  expect(skillsForTask(agent, task).map((s) => s.name)).toContain(name);
});
it('18 new built-in skills exist', () => { /* count of src/skills/**/*.md is 42 + 18 = 60 */ });
it.each(NEW_TASK_TYPES)('%s reaches its agent', (task) => { /* the engine's dispatch sends it to its owner's executor, not the "No agent owns this step's task" path */ });
it('a newsletter step is a Marcus send: it is prepared and waits for approval', () => {
  expect(isMarcusSendStep({ agent: 'marcus', actionType: 'distribution_newsletter' } as never)).toBe(true);
});
```

Add to `skillToolRun.test.ts`: `read_brand` returns a seeded brand's tone, avoid words and only kept lessons; with no brands returns the "No brand is set up" text.

- [ ] **Step 2: Run** `npx vitest run src/test/skills src/test/services/skills` — Expected: FAIL (skills and task types missing).
- [ ] **Step 3: Implement** the task types, effects, tool and the 18 files. Where an executor picks work by an exact task-type list rather than its prefix (check `executeAssignment()`'s dispatch, `isMarcusSendStep()`, `runEchoStep()`, `runNovaAnalysis()`), add the new type there. Read the names of the 42 existing skills first so `name:` values don't collide; check the count in Step 1 against the real number before writing it.
- [ ] **Step 4: Run** `npx vitest run src/test/skills src/test/services/skills src/test/services/jose/agentOwnership.test.ts src/test/services/jose/taskTypeMeanings.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(skills): 18 new built-in skills and the kinds of work they need`.

### Task 2: Alphonso's reading skills get a folder

**Files:** Modify `src/services/joseExecutionEngineService.ts` (where `workFolder` is set, ~line 1195); Test `src/test/services/jose/alphonsoReadingSkills.test.ts` (new).

**Interfaces:** Consumes `projectNamedIn(request, list)` from `src/services/alphonso/projects.ts`. Produces: for an Alphonso step with task type `assistant_explain_code` or `assistant_summarize`, `options.workspaceRoot` = the folder of the project the request names; none named and exactly one project saved → that one; else none, and the step's tool answer is `Name one of your projects in Settings → Agents → Alphonso's projects, or the file's project in the request.` (constant `NAME_A_PROJECT` in `src/services/alphonso/projects.ts`).

- [ ] **Step 1: Test** that `prepareSkill` is called with the named project's folder for "Explain how src/cart.ts works in shop", with the only project's folder when one is saved, and that `read_project_file` answers `NAME_A_PROJECT` when two are saved and none named.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** as above; never for code steps (they keep `stepFolder()`).
- [ ] **Step 4: Run** the test and `src/test/services/jose/joseStepGraphPipeline.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(alphonso): explaining code and summarising a file read from your project`.

### Task 3: Personal data — Sentinel's check, and it follows a people search

**Files:** Modify `src/services/sentinel/exactChecks.ts`, `src/services/sentinel/addSecurityChecks.ts`; Test `src/test/services/sentinel/exactChecks.test.ts`, `src/test/services/sentinel/addSecurityChecks.test.ts`.

**Interfaces:**
- `findExactRisks(text, { personalData: true })` adds facts of kind `personal_data` for: phone numbers (7+ digits with spaces, dashes, brackets or a leading +), email addresses at free mail domains (`gmail.com`, `yahoo.`, `hotmail.`, `outlook.com`, `icloud.com`, `proton.me`, `protonmail.`, `gmx.`, `aol.com`, `mail.ru`), street addresses (a number then a word then `Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd`), and ID-like numbers (9+ digits in one run not part of a phone match). Each fact: `{ kind: 'personal_data', where: <the match>, detail: 'a private phone number' | 'a personal email' | 'a home address' | 'an ID number' }`. Off unless `personalData: true`, so existing checks don't change.
- `runSentinelReview()` passes `personalData: true` when the task type is `security_personal_data`.
- `addSecurityChecks(steps, request)` adds `sentinel-people-<step>` (`security_personal_data`, `reviewOf: <step>`, needs `<step>`) after every Hector `research_people` step, and steps that needed the Hector step then also need it; never twice.

- [ ] **Step 1: Tests**: "Call Ana on +44 7700 900123 or ana.k@gmail.com, 12 Baker Street" gives three `personal_data` facts; "sales@acme.com, Acme Ltd, Head of Sales" gives none; the default call gives none for the first text; a plan with Hector `research_people` then Alphonso `assistant_write` gets `sentinel-people-hector` between them.
- [ ] **Step 2: Run** `npx vitest run src/test/services/sentinel` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sentinel): a personal-data check, run on every people search`.

### Task 4: Marcus's newsletter, and Echo's weekly digest

**Files:** Modify `src/services/marcus/pickDestination.ts`, `src/services/echo/echoSteps.ts`; Test `src/test/services/marcus/pickDestination.test.ts`, `src/test/services/echo/echoSteps.test.ts`.

**Interfaces:**
- Newsletter: for `distribution_newsletter`, only n8n workflows (`N8N_WORKFLOWS`) and Composio toolkits whose slug is one of `gmail`, `outlook`, `mailchimp`, `sendgrid`, `brevo` are offered; none set up → `{ ok: false, outcome: 'setup', reason: NEWSLETTER_NEEDS }`, `NEWSLETTER_NEEDS = 'A newsletter goes through an n8n workflow or a mail app in Composio. Set one up in Settings → Connectors, then carry on.'` (exported from `pickDestination.ts`).
- Digest: `memory_digest` in `runEchoStep()` makes no model call: active decisions from the last 7 days grouped by their first topic (no topic → "Other"), oldest first in each group, each line `- <text> (<surface>, <weekday>)`; header `This week's decisions (<n>):`; none → `No decisions this week.` Summary = that text.

- [ ] **Step 1: Tests**: no n8n and no mail toolkit → `NEWSLETTER_NEEDS`; a listed n8n workflow named in the request → that destination; Slack named in a newsletter request → refused with `NEWSLETTER_NEEDS`; the digest groups three seeded decisions under two topics and leaves out one 8 days old.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/test/services/marcus src/test/services/echo` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(marcus,echo): newsletters through n8n or a mail app; the weekly decisions digest`.

### Task 5: Timed sends

**Files:** Create `src/services/marcus/sendTime.ts`; Modify `src/services/marcus/types.ts`, `prepareSend.ts`, `describeSend.ts`, `src/services/marcusExecutionService.ts`, `src/services/contentFactory/calendarItems.ts`; Test `src/test/services/marcus/sendTime.test.ts` (new), `prepareSend.test.ts`, `src/test/marcusExecutionService.test.js`, `src/test/services/contentFactory/calendarItems.test.ts`.

**Interfaces:**
- `readSendTime(text: string, nowMs: number): { atMs: number } | { unclear: true } | null` — only a time that comes after a send word in the same sentence (`send|post|share|message|remind|schedule|publish`). Forms: `today|tomorrow [at] H[:MM][ ]am|pm`, `<weekday> [at] H[:MM][am|pm]` (the next such day; today only if still ahead), `at H[:MM][am|pm]` (today, or tomorrow when passed), `in N minute(s)|hour(s)|day(s)`, `on <d> <month> [at] H[:MM]`. Words without a time (`later`, `soon`, `tonight`, `this evening`, `next week`, `sometime`) → `{ unclear: true }`. Local time via `Date` setters.
- `SendPreview.sendAtMs?: number`. `prepareMarcusSend()` sets it; unclear → `{ ok: false, outcome: 'failed', reason: SEND_TIME_UNCLEAR }`, `SEND_TIME_UNCLEAR = 'When should Marcus send it? Ask again with a day and time, like “tomorrow at 9”.'`
- `describeSend()` → `Send to Slack #team at Tue 09:00: “…”` (`formatSendTime(ms, nowMs)`: weekday and HH:MM within 6 days, else `Tue 3 Nov 09:00`).
- In `runMarcusDistribution()`, a preview with `sendAtMs` more than 60 s ahead goes to `scheduleApprovedSend({ commandId, stepId, preview })` (new `ScheduledPublish.kind: 'approved_send'`, fields `commandId`, `stepId`, `preview`, `scheduledAt = sendAtMs`) and the step finishes `completed` with `Marcus will send it to <label> at <time>.`; a time already past sends now and the summary starts `The time had passed, so it was sent now.`
- `runScheduledPublishes()` claims an `approved_send` as `posting`, calls `runMarcusSend(commandId, stepId, preview)` once, then `done` or `failed` (and tells you on failure). `recoverScheduledPublishes()` turns a `posting` `approved_send` into `check`.
- `listCalendarItems()` lists pending `approved_send` items like text sends (title from `preview.text`, `statusLabel: Scheduled send (<label>)`); move and cancel use the existing `rescheduleScheduledPublish` / `cancelScheduledPublish`.

- [ ] **Step 1: Tests** (fixed `nowMs` = Mon 2026-11-02 10:00 local):
  - "post it to Slack #team tomorrow at 9" → Tue 09:00; "send it on Friday at 14:00" → Fri 14:00; "send it in 2 hours" → 12:00; "send it at 9am" → Tue 09:00 (passed today); "send it later" → unclear; "Write about the 9am meeting and post it to Slack #news" → null.
  - describeSend line with "at Tue 09:00".
  - a timed send is scheduled, not sent; the runner sends it once at its time and not again on the next pass; a `posting` item at start becomes `check` and is not sent; a past time sends now with the note.
  - the Calendar lists it and cancelling removes it.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/test/services/marcus src/test/marcusExecutionService.test.js src/test/services/contentFactory/calendarItems.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(marcus): a send can have a time; it waits on the Calendar and goes once`.

### Task 6: One request, two projects

**Files:** Create `src/services/alphonso/splitProjects.ts`; Modify `src/services/alphonso/projects.ts`, `src/services/jose/stepGraph.ts` (`PlanStep.project?: string`), `src/services/jose/submitToJose.ts` (both entry points, before `addSecurityChecks`), `src/services/jose/josePlanner.ts` (one prompt line); Test `src/test/services/alphonso/splitProjects.test.ts` (new), `src/test/services/alphonso/projects.test.ts`.

**Interfaces:**
- `projectsNamedIn(request, list?): AlphonsoProject[]` — every project named as a whole word, longest names first, a shorter name inside a longer match not counted again.
- `splitPerProject(steps: PlanStep[], request: string): PlanStep[]` — with fewer than 2 named projects, unchanged. With exactly one Alphonso code step (agent `alphonso`, task type with a `CODE_TASK_PREFIXES` prefix) and no `project`: one copy per project, ids `<id>` for the first and `<id>-<n>` after, `project` set, instruction prefixed `In <name>: `; any step that needed the original needs every copy. With as many code steps as projects and none set: each gets the project in order. Otherwise unchanged.
- `choosePlace()` already honours `requestStep.project`; `savedStep()` keeps `project`.
- Planner prompt gains: `When the request names several of the user's projects, plan one alphonso local_operation step per project.`

- [ ] **Step 1: Tests**: "Update the footer in shop and blog" with one code step → two steps (`alphonso`, `alphonso-2`) with projects `shop`, `blog`, and Sentinel's code checks after each once `addSecurityChecks` runs; names `shop` and `shop-admin` in "fix shop-admin and shop" → two; one project named → unchanged; the two steps' previews claim two different locks (`claimProject`).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/test/services/alphonso src/test/services/jose/submitToJose.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(alphonso): a request naming two projects gets a step in each`.

### Task 7: Edit Alphonso's change before approving it

**Files:** Create `src/services/alphonso/editChange.ts`; Modify `src/services/alphonso/types.ts`, `changeSet.ts` (`describeCodeChange`), `src/components/alphonso/CodePreviewView.tsx`, `src/components/jose/JoseRequestsBoard.tsx` (passes `requestId`, `stepId`); Test `src/test/services/alphonso/editChange.test.ts` (new), `src/test/components/alphonso/CodePreviewView.test.tsx`.

**Interfaces:**
- `CodeFile.editedByYou?: boolean`, `CodePreview.edited?: boolean`.
- `editCodeFile(requestId, stepId, path, content): { ok: true } | { ok: false; reason: string }` — only while the step is `waiting_approval` (`EDIT_TOO_LATE = 'This change has already been approved or rejected.'`), only a path in the preview; recomputes the file with `classifyFile(path, content, file.before ?? null)` keeping its `beforeHash`, sets `editedByYou` and `edited`, saves it on the request step's `codePreview`.
- `describeCodeChange()` adds ` (edited by you)` when `edited`.
- `CodePreviewView`: each file has **Edit** (`data-testid="alphonso-edit-<path>"`) → a textarea with **Save** (`alphonso-edit-save`) and **Cancel**; an edited file shows "Edited by you".

- [ ] **Step 1: Tests**: an edit is saved with recomputed lines and the mark; `applyChangeSet()` writes the edited content; an edited file that changed on disk since the preview is still refused; editing after approval returns `EDIT_TOO_LATE`; the view saves through `editCodeFile` and shows the mark.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** Sentinel's code check after the step reads the written files from the folder (`reviewedFolder()`), so it sees the edit; no change there.
- [ ] **Step 4: Run** `npx vitest run src/test/services/alphonso src/test/components/alphonso` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(alphonso): edit his change on the board before approving it`.

### Task 8: Hector writes up with his skill

**Files:** Modify `src/services/hector/researchRun.ts` (`runResearch` options, `writeUpPrompt`), `src/services/hectorResearchService.js` (`runHectorLiveResearch` passes it), `src/services/hector/hectorStep.ts`; Test `src/test/services/hector/researchRun.test.ts`.

**Interfaces:** `runResearch(question, { …, skill?: string })`; `writeUpPrompt` puts `skillSection()`'s text first when given; `runHectorStep` passes `skillSection(stepInput)`. The search queries are unchanged (still from the request).

- [ ] **Step 1: Test**: with a skill "Compare products and prices" the write-up prompt contains its instructions; the planned queries are the same with and without it.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/test/services/hector` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(hector): his write-up follows his skill`.

### Task 9: Echo matches decisions by meaning

**Files:** Modify `src-tauri/src/ollama.rs` (command + tests), `src-tauri/src/lib.rs` (register); Create `src/services/echo/meaning.ts`, `src/components/echo/MeaningSearchStatus.tsx`; Modify `src/services/echo/recall.ts`, `src/services/echo/decisions.ts` (index on save), `src/components/echo/DecisionsPanel.tsx`; Test `src/test/services/echo/meaning.test.ts` (new), `src/test/components/echo/MeaningSearchStatus.test.tsx` (new), Rust tests in `ollama.rs`.

**Interfaces:**
- Rust: `ollama_embed(endpoint: Option<String>, model: String, inputs: Vec<String>) -> Result<Vec<Vec<f32>>, String>` → `POST {base}/api/embed` `{ model, input }`, 30 s timeout; at most 64 inputs of 8,000 characters each (`EMBED_LIMITS`); pure `parse_embed_response(&serde_json::Value) -> Result<Vec<Vec<f32>>, String>` (reads `embeddings`; Ollama's `error` → that message). Tests: a good body parses; an error body returns the message; 65 inputs are refused.
- `meaning.ts`: `ECHO_EMBED_MODEL = 'all-minilm'`; `meaningEnabled()` (`settings.echoMeaningSearch !== false`); `meaningState(): { kind: 'off' | 'no_ollama' | 'downloading' | 'indexing' | 'ready' | 'failed'; pct?: number; done?: number; total?: number; reason?: string }`, `onMeaningState(listener)`; `ensureMeaning()` (never waits the caller: model missing from `ollama_list_models` → `pullOllamaModel()` with progress, then index every active decision without a vector, 32 at a time); `indexDecisionMeaning(d)`; `meaningMatches(query, pool, limit): Promise<string[]>` (embeds the query with a 4 s limit; cosine ≥ 0.55, best first; anything failing → `[]`). Vectors live in the backend KV store, keys `echo_vec:<decisionId>`, values rounded to 4 decimals, loaded once into memory.
- `searchDecisions()` appends `meaningMatches()` results after the word matches (before ChromaDB's), and calls `ensureMeaning()` once per session in the background.
- `MeaningSearchStatus` in Settings → Memory: the switch "Match decisions by meaning" (saved to settings), and the state in words: `Off.`, `Needs Ollama running.`, `Downloading the meaning model (all-minilm, 46 MB): 40%`, `Reading your decisions: 120 of 300`, `On.`, `Couldn't get the meaning model: <reason>. Word search is used.`

- [ ] **Step 1: Tests**: Rust tests above; with a fake embed, "when do we launch?" finds the decision "The release date moved to 12 March" that word search misses; with the switch off no embed call is made; an embed that never answers returns word matches within 4.5 s (fake timers); a failed pull sets `failed` with the reason and word search still answers; the status component shows each state's words and the switch saves.
- [ ] **Step 2: Run** `cargo test ollama` (from `src-tauri/`) and `npx vitest run src/test/services/echo src/test/components/echo` — Expected: FAIL.
- [ ] **Step 3: Implement.** Use `kv_set` / `kv_list_keys` / `kv_get` for vectors; no component fetches Ollama.
- [ ] **Step 4: Run** the same plus `cargo fmt --all -- --check` and `cargo clippy -- -D warnings` — Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat(echo): match decisions by meaning with a small local model`.

### Task 10: The small leftovers

**Files:** Modify `src/components/ChatView.tsx` (notice), `src/components/hector/HectorApprovalHandoff.tsx`, `src/components/dashboard/HectorResearchDesk.tsx`, `src/App.tsx`, `src-tauri/src/media_tools.rs` (`content_tts_kokoro`), `src/services/contentFactory/contentMediaExecutor.ts`; Create `src/lib/chatDraft.ts`; Test `src/test/components/ChatView.test.jsx`, `src/test/components/hector/HectorApprovalHandoff.test.tsx`, `src/test/lib/chatDraft.test.ts` (new), `src/test/services/contentFactory/contentMediaExecutor.test.ts`, Rust test in `media_tools.rs`.

**Interfaces:**
- Chat's notice lists `interrupted` and `waiting_setup` requests: a setup one shows `<Agent> needs something set up: <reason>` with Carry on (`carryOnRequest`); the heading covers both (`1 request needs you.` / `N requests need you.`).
- `chatDraft.ts`: `fillChat(text)` stores the draft and fires `alphonso:open-chat`; `takeChatDraft(): string` returns it once. App switches to Chat on the event; ChatView puts a waiting draft into its input on mount and on the event. `HectorApprovalHandoff` gets `onUse(text)`; the Desk passes `fillChat`; the button reads **Use in a request**, and after a click `In Chat: add what you want done, then send.`
- `content_tts_kokoro` returns `{ "ok": false, "missing": true, "error": … }` when Kokoro isn't installed; `runVoice()` checks `result.missing`, not the wording.

- [ ] **Step 1: Tests**: a `waiting_setup` request shows in the notice with its reason and Carry on; `fillChat` then `takeChatDraft` returns the text once; clicking the button calls `onUse` with the report text; the voice step returns setup-needed for `{ ok: false, missing: true, error: 'anything' }`; the Rust function returns `missing: true` when Kokoro's folder doesn't exist.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `cargo test media_tools` — Expected: PASS.
- [ ] **Step 5: Commit** `fix: Chat lists requests waiting for setup; Hector's report fills Chat; Kokoro says it's missing by flag`.

### Task 11: Desktop checks and docs

**Files:** Modify `e2e-desktop/specs/alphonso.e2e.mjs`, `e2e-desktop/specs/marcus.e2e.mjs`, `e2e-desktop/specs/echo.e2e.mjs`; docs listed in Global Constraints.

- [ ] **Step 1: Specs**:
  - `alphonso.e2e.mjs`: an edited preview is what's written (Edit on the board, Save, approve, read the file); "Change the title in shop and blog" gets two steps with two previews.
  - `marcus.e2e.mjs`: "post it to my n8n workflow Team notes in 2 minutes" waits on the Calendar as a Marcus send and reaches the local stand-in once after its time.
  - `echo.e2e.mjs`: with `all-minilm` installed, "when do we launch?" finds the launch decision worded differently; skipped without it; with the switch off, word search.
- [ ] **Step 2: Build and run** them plus `agent-skills.e2e.mjs`. If Windows Code Integrity refuses the rebuilt app again, record it and leave them to CI's desktop job; never work around it.
- [ ] **Step 3: Docs and checks**: CLAUDE.md rows (skills list, timed sends, two projects, editing a change, Echo by meaning, chat draft), Ground Truth §11.49, USER_MANUAL, AGENT_GUIDE (skills table), CHANGELOG, DEFERRED_WORK (close the C2 line from C1; what remains), the spec status; then `node scripts/verify-doc-counts.mjs`, `npm run generate:dnd-map`, `npm run verify:dnd-coverage`, `npx tsc --noEmit -p .`, `npm run lint`, full `npm test`, Rust checks.
- [ ] **Step 4: Commit** `test(part-c2): the real app's edited change, timed send and meaning search` and `docs(part-c2): new skills and agent improvements`.
