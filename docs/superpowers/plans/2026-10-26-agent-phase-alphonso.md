# Agent phase 6: Alphonso Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alphonso writes real code in a project you chose (or a scratch folder), prepared and shown before it changes anything, works with the other agents' output, and is reached only for real code.

**Architecture:** A new `src/services/alphonso/` package prepares a code step before Jose's approval gate (like Marcus's sends): pick the project, lock it, read it, ask his code model for one change set, classify it, save it on the request step as `codePreview`. After approval the engine applies exactly that change set, runs the approved commands, does up to 2 fix rounds inside the approved set, and reports plainly. Maria, Sentinel and fix rounds read his files from the folder saved on his step. Routing, the planner, help and the answer prompt are adjusted around it.

**Tech Stack:** TypeScript (React 18, Vitest), Rust (Tauri 2), the `ignore` crate (new, for `.gitignore`-aware listing).

**Spec:** `docs/superpowers/specs/2026-10-26-agent-phase-alphonso-design.md`

## Global Constraints

- Nothing hardcoded: no model names, folder or file names, program names or new size limits. Limits come from `FILE_LIMITS` (`src/services/maria/workContext.ts`), `STEP_INPUT_LIMITS` (`src/services/jose/stepInput.ts`) and `JOSE_LIMITS` (`src/services/jose/stepGraph.ts`). Folder names come from Settings and `agentName('alphonso')`.
- Never write outside the chosen folder or into `.git`; the backend's existing path checks stay the boundary, and `policy_gate.rs` decides what may run.
- No git commit, no dev server unless the request asks, and then only as approved commands.
- Every file an approval covers is written exactly as shown; every command exactly as shown.
- Copy rules: plain English, no em dashes in UI strings, no exclamation marks.
- Line endings: write each file in its blob's style (`git cat-file blob HEAD:<f> | tr -cd '\r' | wc -c`); `joseExecutionEngineService.ts` is CRLF.
- Delete no file (R14); functions may be removed. `executeWithBrain()` stays in `agentBrainService.js` while it has tests.
- Docs change in the same commits as their code.

## Review Focus

1. **You reject the step**: nothing is written, nothing runs, the project lock is released, and the next waiting request carries on. (Task 6 test `rejecting a code step writes nothing and frees the project`.)
2. **The file changed on disk between the preview and your approval**: that file is not written; the report says it changed since the preview. (Task 5 test `a file changed since the preview is not written`.)
3. **The project folder was removed or renamed**: the step waits for setup with "The folder for shop is gone: …", never writes elsewhere. (Task 4 test `a missing project folder waits for setup`.)
4. **The app closes while a code step waits**: on Carry on the saved `codePreview` is reused, not re-generated, and the lock is still held by that request or is stale and re-claimed. (Task 6 test `carry on reuses the saved preview`.)
5. **His model proposes a path outside the folder, into `.git`, or an absolute path**: that file is dropped from the change set with a reason; the rest goes on. (Task 4 test `unsafe paths are dropped with a reason`.)

---

### Task 1: Projects, scratch folders, the project lock and their Settings

**Files:**
- Create: `src/services/alphonso/projects.ts`, `src/services/alphonso/projectLock.ts`, `src/components/alphonso/AlphonsoProjectsSection.tsx`
- Modify: `src/components/SettingsView.tsx` (Agents section: the new section and "Model for Alphonso's code"; remove the "Workspace Root (for supervised proofs)" field from Runtime)
- Test: `src/test/services/alphonso/projects.test.ts`, `src/test/services/alphonso/projectLock.test.ts`, `src/test/components/alphonsoProjectsSection.test.jsx`

**Interfaces:**
- Produces:
  - `interface AlphonsoProject { name: string; folder: string }`
  - `listProjects(): AlphonsoProject[]` (settings `alphonsoProjects`; on first read, a non-empty `settings.workspaceRoot` becomes `{ name: <last path segment>, folder }` and is saved)
  - `saveProjects(list: AlphonsoProject[]): void` (names unique case-insensitively, trimmed, non-empty)
  - `projectNamedIn(request: string, list = listProjects()): AlphonsoProject | null` (a listed name as a whole word, case-insensitive; longest name wins)
  - `interface WorkPlace { kind: 'project' | 'new'; name: string; folder: string; root: string; prefix: string }` (writes go to `root` + `prefix` + path; commands run in `folder`)
  - `scratchPlace(title: string, existing: string[]): WorkPlace | { ok: false; reason: string }` (`root` = output folder, `prefix` = `<agentName('alphonso')>/<slug>/`, slug from `slugForFolder()` in `contentProjectFiles.ts`, `-2` … when in `existing`; no output folder → `NEEDS_OUTPUT_FOLDER`)
  - `NEEDS_OUTPUT_FOLDER = 'Set the output folder in Settings → General so Alphonso has somewhere to put new code.'`, `NO_PROJECT = "Add a project in Settings → Agents → Alphonso's projects."`
  - `getCodeModel(): string | null` (settings `alphonsoCodeModel`, null = same as Alphonso)
  - `claimProject(folder: string, requestId: string, nowMs?: number): { ok: true } | { ok: false; heldBy: string }` (store `alphonso_project_locks_v1`; a lock held by the same request is ok; a lock older than `JOSE_LIMITS.projectMs` is stale and replaced), `releaseProject(folder: string, requestId: string): void`, `projectHolder(folder: string): string | null`, `busyLine(name: string) = 'Waiting: ${name} is busy with another request.'`

- [ ] **Step 1: Write the failing tests**
  - `projects.test.ts`: `listProjects()` migrates `workspaceRoot: 'D:\\code\\shop'` to `[{ name: 'shop', folder: 'D:\\code\\shop' }]` once and saves it; `saveProjects` refuses a duplicate name ("A project named shop is already listed."); `projectNamedIn('add dark mode in Shop please', [shop, blog])` → shop; `projectNamedIn('shopping list', [shop])` → null; `scratchPlace('Rename photos', ['rename-photos'])` → prefix `Alphonso/rename-photos-2/`; no output folder → `{ ok: false, reason: NEEDS_OUTPUT_FOLDER }`; `getCodeModel()` null by default.
  - `projectLock.test.ts`: claim, second request refused with `heldBy`, same request ok, release, stale after `JOSE_LIMITS.projectMs`.
  - `alphonsoProjectsSection.test.jsx`: adding a project with a name and folder saves it; Remove removes it; "Model for Alphonso's code" lists `listInstalledModels()` results (mocked) with "Same as Alphonso" first and saves `alphonsoCodeModel`.
- [ ] **Step 2: Run them** — `npx vitest run src/test/services/alphonso src/test/components/alphonsoProjectsSection.test.jsx` — Expected: FAIL, modules missing.
- [ ] **Step 3: Implement** the two services and the section (Browse uses `invoke('pick_folder')` like Settings' existing folder buttons; text: "Alphonso works in one of these at a time. A request that names a project works there."). In SettingsView: render `<AlphonsoProjectsSection />` in the Agents tab above "Agent Skills"; delete the Workspace Root field block (lines ~1097–1115) and its `handlePickWorkspaceRoot` if nothing else uses it (keep `settings.workspaceRoot` readable for the migration).
- [ ] **Step 4: Run them** — same command — Expected: PASS. Also `npx vitest run src/test/SettingsView*` — Expected: PASS (update any test that looked for the Workspace Root field to the new section).
- [ ] **Step 5: Commit** — `feat(alphonso): his projects, scratch folders and one request per project`

### Task 2: Listing a project the way git sees it

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `ignore`), `src-tauri/src/workspace.rs` (new command), `src-tauri/src/lib.rs` (register)
- Create: `src/services/alphonso/readProject.ts`
- Test: Rust tests in `workspace.rs`; `src/test/services/alphonso/readProject.test.ts`

**Interfaces:**
- Produces:
  - Rust `#[tauri::command] list_project_files(workspace_root: String, max_entries: usize) -> Result<ProjectListing, String>` where `ProjectListing { files: Vec<String>, truncated: bool }`: relative paths with `/`, files only, built with `ignore::WalkBuilder` (`hidden(false)`, `git_ignore(true)`, `require_git(false)`, `.git` always skipped), sorted, root checked like `list_workspace_directory`.
  - TS `listProjectFiles(folder: string, maxChars: number): Promise<{ text: string; files: string[]; truncated: boolean }>` (passes a `max_entries` derived from `maxChars`, joins one path per line, cuts at `maxChars`)
  - TS `readProjectFiles(folder: string, paths: string[], large: boolean): Promise<{ path: string; text: string; cut: number; missing?: boolean }[]>` (each within `FILE_LIMITS.eachChars`, all within `FILE_LIMITS.totalChars`; `large` uses `STEP_INPUT_LIMITS.largeChars` as the total)

- [ ] **Step 1: Write the failing Rust tests** `list_project_files_respects_gitignore` (a temp dir with `.gitignore` containing `out/`, files `a.js`, `out/b.js`, `.git/x`: listing is `["a.js", ".gitignore"]` sorted), `list_project_files_caps_entries` (`max_entries: 1` → one file, `truncated: true`), `list_project_files_rejects_empty_root`.
- [ ] **Step 2: Run** — `cd src-tauri && cargo test list_project_files` — Expected: FAIL (no function).
- [ ] **Step 3: Implement** the command and register it; add `ignore` to Cargo.toml at its current release; `cargo audit` must stay clean (`scripts/cargo-audit.sh`).
- [ ] **Step 4: Run** — `cargo test list_project_files && cargo clippy -- -D warnings && cargo fmt --all -- --check` — Expected: PASS.
- [ ] **Step 5: TS test then code** — `readProject.test.ts`: `listProjectFiles` maps the mocked invoke result to text, cuts at `maxChars`; `readProjectFiles` respects `FILE_LIMITS` and marks a missing file. Run `npx vitest run src/test/services/alphonso/readProject.test.ts`: FAIL, then implement, then PASS.
- [ ] **Step 6: Commit** — `feat(alphonso): list a project the way git sees it` (also run `node scripts/verify-doc-counts.mjs` and update the Tauri command / Rust test counts it names in README, AGENTS, ARCHITECTURE, CLAUDE).

### Task 3: The change set and how it is described

**Files:**
- Create: `src/services/alphonso/changeSet.ts`, `src/services/alphonso/types.ts`
- Test: `src/test/services/alphonso/changeSet.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `interface CodeFile { path: string; content: string; status: 'new' | 'changed'; before?: string; beforeHash?: string; added: number; removed: number; firstDiff: string[] }`
  - `interface CodeCommand { program: string; args: string[]; why: string; readOnly: boolean; level: 'low' | 'medium' | 'high'; deletes: boolean }`
  - `interface CodePreview { place: WorkPlace; plan: string; title: string; files: CodeFile[]; commands: CodeCommand[]; dropped: { path: string; reason: string }[]; model: string; preparedAtMs: number }`
- Produces (`changeSet.ts`):
  - `classifyFile(path, content, before: string | null): CodeFile` (line counts from a line diff of `before` → `content`; `firstDiff` = up to 6 lines `-`/`+`; `beforeHash` = a hash of `before`)
  - `classifyCommand(program, args, why): CodeCommand` (`assessCommandRisk()` and `deletesThings()` from `commandApprovalService.ts`)
  - `previewNeeds(p: CodePreview): JoseEffect[]` (`change_project` if any file is `changed`; `run` if any command is not `readOnly`; `delete` if any `deletes`)
  - `describeCodeChange(p: CodePreview): string` — exact copy: `Change 2 files in shop (src/App.tsx +12 −3, src/index.css +4), add 1, then run: npm run test` (parts left out when empty; `in shop` uses `place.name`)

- [ ] **Step 1: Write the failing test** with those exact strings, a new file (`status: 'new'`, `added` = its lines), an unchanged-content file dropped by the caller (assert `classifyFile` marks `added: 0, removed: 0`), `npm run test` → not `readOnly`, `git status` → `readOnly`, `git reset --hard` → `deletes`, and `previewNeeds` for each mix.
- [ ] **Step 2: Run** — `npx vitest run src/test/services/alphonso/changeSet.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** (a small line-based diff: longest common subsequence over lines, capped by `FILE_LIMITS.eachChars` worth of lines; no new dependency).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(alphonso): a change set says exactly what changes`

### Task 4: Preparing a code step

**Files:**
- Create: `src/services/alphonso/codeModel.ts`, `src/services/alphonso/codeStep.ts`, `src/services/alphonso/prepareCode.ts`
- Test: `src/test/services/alphonso/codeStep.test.ts`, `src/test/services/alphonso/prepareCode.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3; `buildStepInput()`/`stepInputText()`; `generateAgentLlmResponse('alphonso', …)`; `withAgentModel()`; `list_workspace_directory` for scratch folders.
- Produces:
  - `codeModelFor(assignment): string | null` (assignment.model, else `getCodeModel()`, else null = Alphonso's own)
  - `isAlphonsoCodeStep(assignment): boolean` (agent alphonso and task type in `CODE_TASK_PREFIXES` from `taskTypeMeanings.ts`)
  - `parseCodeAnswer(raw: string): { project?: string; title: string; plan: string; files: {path, content}[]; commands: {program, args, why}[]; questions: string[]; read?: string[] } | null`
  - `type PrepareCode = { ok: true; preview: CodePreview } | { ok: false; outcome: 'setup' | 'choose' | 'busy' | 'failed'; reason: string; choices?: string[]; folder?: string }`
  - `prepareAlphonsoCode(commandId: string, assignment, request: { id: string; text: string }, stepInput): Promise<PrepareCode>`
  - Constants: `ALPHONSO_NO_PLAN = "Alphonso's model didn't give a change he could use."`, `WHICH_PROJECT = (names) => \`Which project: ${names.join(', ')}?\``, `FOLDER_GONE = (name, folder) => \`The folder for ${name} is gone: ${folder}. Change it in Settings → Agents → Alphonso's projects.\``, `NEEDS_TO_KNOW = (q) => \`Alphonso needs to know: ${q.join(' ')}\``

`prepareAlphonsoCode` order:
1. Project: a saved `project` on the request step wins (set by a choice); else `projectNamedIn(request.text)`; else ask his model one short JSON question `{ "project": "<listed name>" | "new" | "unknown" }` given the project names and the last 10 scratch folder names (`list_workspace_directory(outputFolder, agentName)`, newest first). A name not listed → asked again once naming the problem. `unknown` with one project listed → it; with several → `choose` (`WHICH_PROJECT`); with none → `setup` (`NO_PROJECT`). A listed project whose folder no longer exists → `setup` (`FOLDER_GONE`).
2. Lock: `claimProject(folder, request.id)`; refused → `busy` (`busyLine(name)`, `folder`).
3. Read: `listProjectFiles(folder, …)`; his model's first answer may list `read` paths (from the listing only) → `readProjectFiles()` → asked again with their content (one extra call at most).
4. Plan and write: the prompt is his skill section, the step input text (request, needed steps' work, the review being fixed, the previous step's files for a fix round from `revises`), the listing, the read files, and the JSON shape. One retry when unreadable; then `failed` (`ALPHONSO_NO_PLAN`). `questions` non-empty → `failed` (`NEEDS_TO_KNOW`).
5. Classify: each file path through `sanitizeRelativePath()` (from `agentBrainService.js`) and the `.git` rule; unsafe → `dropped`. `before` read for existing files; identical content dropped silently. For `new`, `scratchPlace(title, existing)`.
6. The model call runs inside `withAgentModel('alphonso', codeModelFor(assignment), …)` when a model is set; `preview.model` records what ran.

- [ ] **Step 1: Write the failing tests** (`generateAgentLlmResponse`, `invoke` mocked):
  - `codeStep.test.ts`: parses a fenced JSON answer; refuses one without `files` and without `questions`; keeps `read` only as a list of strings.
  - `prepareCode.test.ts`: `the named project is used without asking the model`; `several projects and none named → choose with WHICH_PROJECT`; `one project and the model says unknown → that project`; `no project listed and the work needs one → setup NO_PROJECT`; `a missing project folder waits for setup` (FOLDER_GONE); `a busy project → busy with busyLine`; `new → a scratch place under the output folder`; `unsafe paths are dropped with a reason` (`../x.js`, `C:/x.js`, `.git/hooks/pre-commit`); `questions → failed NEEDS_TO_KNOW`; `unreadable twice → ALPHONSO_NO_PLAN`; `the step input (Miya's design) is in the prompt`; `a fix round's prompt has the review findings and his previous files`; `the code model setting is used` (withAgentModel called with it).
- [ ] **Step 2: Run** — `npx vitest run src/test/services/alphonso` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(alphonso): a code step is prepared from your project and the earlier work`

### Task 5: Applying an approved change set, fix rounds and the report

**Files:**
- Create: `src/services/alphonso/applyChanges.ts`, `src/services/alphonso/runCode.ts`
- Test: `src/test/services/alphonso/applyChanges.test.ts`, `src/test/services/alphonso/runCode.test.ts`

**Interfaces:**
- Produces:
  - `applyChangeSet(preview: CodePreview): Promise<{ written: string[]; refused: { path: string; reason: string }[] }>` (re-reads each `changed` file; its hash differs from `beforeHash` → refused "changed since the preview"; writes through `writeWorkspaceArtifact({ workspaceRoot: place.root, relativePath: place.prefix + path })`)
  - `runApprovedCommands(preview, commands = preview.commands): Promise<{ command: CodeCommand; exitCode: number | null; ok: boolean; tail: string }[]>` (`verifyCommandExecution(program, args, place.folder)`; `tail` = the last `FILE_LIMITS.eachChars` characters of stderr, else stdout; the summary shows its last `STEP_INPUT_LIMITS.otherLineChars`)
  - `runAlphonsoCode(commandId: string, assignment, preview: CodePreview, stepInput): Promise<StepResult>` — apply, run, then up to `JOSE_LIMITS.maxFixRounds` fix rounds when a command failed: his model gets the failures and may return files only within `preview.files` paths or new paths, and re-runs only `preview.commands`; anything else is listed as "needs your approval: …" and not done. Returns `{ summary, resultState: 'completed' | 'failed', artifacts: [{ type: 'code_file', relativePath, status }…, { type: 'command_result', program, args, exitCode, ok }…], sources: [], contractAction }`; always `releaseProject()` at the end. One memory item `Alphonso: <plan> — <n> files, checks <passed|failed|none>` via `pushMemoryItem`.
  - Report copy: `Wrote 3 files in shop: a.js, b.js, c.js. Changed src/App.tsx. npm run test: passed.` / `npm run test: failed: <tail>` / `npm run lint: not run (you didn't approve it).`; a refused file: `src/App.tsx was not written: it changed since the preview.`

- [ ] **Step 1: Write the failing tests**: `writes only the approved content`; `a file changed since the preview is not written`; `runs only the approved commands, in the project folder`; `a failed check gets at most JOSE_LIMITS.maxFixRounds fix rounds`; `a fix touching another existing file is not done and is reported`; `the summary never says Runtime reachable and has no confidence`; `the lock is released when the step ends or throws`; `completed when every check passed or none was proposed, failed otherwise`.
- [ ] **Step 2: Run** — `npx vitest run src/test/services/alphonso` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(alphonso): an approved change is applied exactly, checked and reported`

### Task 6: The engine runs Alphonso's code steps through the preview

**Files:**
- Modify: `src/services/joseExecutionEngineService.ts` (CRLF), `src/services/jose/joseRequestStore.ts` (step fields), `src/services/mariaAuditService.ts`, `src/services/sentinelSecurityService.ts`, `src/services/maria/workContext.ts`, `src/services/skills/prepareSkill.ts` call site
- Create: `src/services/alphonso/stepFolder.ts`
- Test: `src/test/services/jose/joseStepGraphPipeline.test.js` (new describe "Alphonso's code steps"), `src/test/services/alphonso/stepFolder.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  - `JoseRequestStep` gains `codePreview?: CodePreview`, `project?: string`, `folder?: string`, `projectChoices?: string[]`, `waitingForFolder?: string`
  - `stepFolder(commandId: string, stepId: string): string | null` (the request step's `folder`, or its `revises` step's)
  - `pickAlphonsoProject(requestId: string, stepId: string, name: string): Promise<{ ok: boolean; summary: string }>` (exported from the engine: saves `project`, clears `projectChoices`, `carryOnRequest()`)
  - `releaseProject()` also finds requests `waiting_setup` with a step `waitingForFolder === folder` and carries the oldest on (dynamic import of the engine to avoid a cycle)

Engine changes:
1. Before the Marcus preparation block: `if (isAlphonsoCodeStep(assignment) && packet.status !== 'approved')` → a saved `codePreview` is reused; else `prepareAlphonsoCode()`. Outcomes: `choose` → step `setup_needed` with the reason and `projectChoices`; `busy` → `setup_needed` with `waitingForFolder`; `setup` → `setup_needed`; `failed` → failed. On success save `codePreview`, `project`, `folder`, `model`, and `note` = `describeCodeChange()`.
2. The gate for such a step waits on `effectsNeedingApproval(previewNeeds(preview))` instead of the declared effects (so new files only and read-only commands don't wait); the wait reason is `Waiting for your approval: <describeCodeChange>`, also the packet's `commandPreview`. The preview gate is skipped for a prepared code step (as for Marcus).
3. In `executeAssignment`, an Alphonso code step runs `runAlphonsoCode()` with its saved preview; `executeAlphonsoAssignment()`'s keyword intents, scaffolding, runtime and process proofs and `executeWithBrain()` call are removed (the function now only handles a code step with no preview by failing "Nothing was prepared for this step.").
4. `stepCommandText()`: for Alphonso, keep your words as the request and append the instruction and `HELP_INSTRUCTION` (unless `helpRound`) as a separate block the prepare prompt reads; no intent check reads it.
5. `prepareSkill()` and Maria's and Sentinel's reviews get `workspaceRoot: stepFolder(commandId, reviewedStepId)`; `workFiles()` reads `relativePath` artifacts of `code_file` type (already supported).
6. Rejecting a code step (`rejectRequestStep`) and cancelling its request call `releaseProject()`.

- [ ] **Step 1: Write the failing tests** in the new describe (prepare mocked at module level like Marcus's describe): `a code step is prepared before its gate and waits with the change line`; `new files only → no wait, applied and reported`; `with preview on, it is still prepared`; `several projects → setup_needed with choices; pickAlphonsoProject carries it on`; `a busy project waits and carries on when released`; `rejecting a code step writes nothing and frees the project`; `carry on reuses the saved preview` (prepare called once); `Maria's review reads his files from the saved folder`; `the summary never says Runtime reachable`. `stepFolder.test.ts`: the step's folder, else its `revises` step's.
- [ ] **Step 2: Run** — `npx vitest run src/test/services/jose/joseStepGraphPipeline.test.js src/test/services/alphonso` — Expected: FAIL.
- [ ] **Step 3: Implement**; update existing tests that relied on `executeAlphonsoAssignment`'s keyword commands (search `npm run build` / `runtime_proof` in `src/test`).
- [ ] **Step 4: Run** — `npx vitest run src/test/services/jose src/test/services/alphonso src/test/joseExecutionEngine* src/test/maria* src/test/services/maria src/test/services/sentinel` — Expected: PASS.
- [ ] **Step 5: Commit** — `fix(alphonso): Jose runs his code steps through the preview; reviews read his files`

### Task 7: The board and Telegram show the change and the project choice

**Files:**
- Create: `src/components/alphonso/CodePreviewView.tsx`
- Modify: `src/components/jose/JoseRequestsBoard.tsx`, `src/services/jose/joseTelegram.ts`, `src/services/telegramCompanionService.js`
- Test: `src/test/components/codePreviewView.test.jsx`, `src/test/services/jose/joseTelegram.test.ts`, `src/test/connectors/telegramCompanionService.test.js`

**Interfaces:**
- Consumes: `CodePreview`, `describeCodeChange`, `pickAlphonsoProject`.
- Produces: `CodePreviewView({ preview })` (`data-testid="alphonso-code-preview"`: the plan, each file with `new`/`changed`, `+a −r` and its `firstDiff` lines, dropped files with reasons, each command with why and "runs without asking" for read-only ones, "Model: …"); `JoseButtonAction` gains `'pick_project'` with `project?: string`.

- [ ] **Step 1: Write the failing tests**: the view renders those parts; the board shows it under a waiting Alphonso step and, for a `setup_needed` step with `projectChoices`, one button per project (`data-testid="alphonso-pick-<name>"`) that calls `pickAlphonsoProject`; `stepText()` uses `describeCodeChange()` for a step with `codePreview`; `collectJoseNotifications()` sends a setup step with `projectChoices` as one button per project; `handleJoseButton` with `pick_project` calls `pickAlphonsoProject` and answers `Working in shop.`; a stale one says `Already done.`
- [ ] **Step 2: Run** — `npx vitest run src/test/components/codePreviewView.test.jsx src/test/services/jose/joseTelegram.test.ts src/test/connectors/telegramCompanionService.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(alphonso): the board and Telegram show his change and ask which project`

### Task 8: Code only when it's code; writing without needless research

**Files:**
- Modify: `src/services/jose/taskTypeMeanings.ts` (`isCodeRequest`), `src/services/joseCommandRouterService.ts` (`localExecution`, the writing step, Miya's "script"), `src/services/jose/josePlanner.ts` (`missingAsked`)
- Test: `src/test/services/jose/routingSet.test.ts`, `src/test/services/jose/josePlanner.test.ts`, `src/test/services/jose/taskTypeMeanings.test.ts`

**Interfaces:**
- Produces: `isCodeRequest(text)` per the spec's rule (code words, a programming language or framework, a code file extension, "my project/app/website/site/repo", or script/program next to a language or a code verb; `test`, `check`, `run`, `add`, `install`, `file`, `verify` alone are not code); `needsFacts(text: string): boolean` (research, sources, facts, latest, current, news, prices, statistics, compare, look up, find out); `missingAsked()` adds `"The request asks for code: add an alphonso step with the task type local_operation."` and `"The request doesn't need research: remove the hector step."`

- [ ] **Step 1: Write the failing tests**: the ten probe requests in `routingSet.test.ts` with these owners: quiz → alphonso `assistant_write`; cover letter typos → alphonso `assistant_write` (+ maria check); login bug → alphonso `local_operation`; run the tests → alphonso `local_operation`; dark mode toggle → alphonso `local_operation`; closure question → alphonso `assistant_answer`; Python rename script → alphonso `local_operation`; install express → alphonso `local_operation`; todo app with React → alphonso `local_operation`; summarize this file → alphonso `assistant_answer`. Planner: a code request planned with no Alphonso code step gets the code line; an email planned with a Hector step gets the research line; "research the latest prices and write an email" keeps Hector.
- [ ] **Step 2: Run** — `npx vitest run src/test/services/jose` — Expected: FAIL.
- [ ] **Step 3: Implement**; keep the word lists only in `taskTypeMeanings.ts` (the router imports them).
- [ ] **Step 4: Run** — `npx vitest run src/test/services/jose src/test/joseCommandRouterService.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** — `fix(jose): code only when it's code; writing without needless research`

### Task 9: Help both ways, answers, and his profile

**Files:**
- Modify: `src/services/jose/joseHelp.ts`, `src/lib/chatUtils.js` (keep `CHAT_ASSISTANT_PROMPT` for Direct Mode), `src/components/ChatView.tsx` (non-Direct answers), `src/services/jose/joseInbound.ts`, `src/services/joseExecutionEngineService.ts` (`assistantPrompt`), `src/services/boardroomFacilitatorService.ts` and `src/components/CompanionMode.tsx` if they use `CHAT_ASSISTANT_PROMPT` for Alphonso, `src/agents/alphonso/alphonsoProfile.js`, `src/agents/alphonso/alphonsoPermissions.js`
- Create: `src/services/alphonso/answerPrompt.ts`
- Test: `src/test/services/jose/joseHelp.test.ts`, `src/test/services/alphonso/answerPrompt.test.ts`, `src/test/services/jose/joseInbound.test.ts`, `src/test/services/jose/agentOwnership.test.ts`, `src/test/agents/agentPermissions.test.js`

**Interfaces:**
- Produces: `ALPHONSO_ANSWER_PROMPT` (no "Direct Mode"; answer in plain text from the conversation; never claim an action on the computer; when the request needs real action, one line on what Jose would plan); `chooseHelper()` may return `{ agent: 'alphonso', actionType: 'assistant_write' | 'assistant_answer' }` and refuses alphonso with any other type; `answerOrPlan()` passes up to the last 6 history messages to the answer.

- [ ] **Step 1: Write the failing tests**: the prompt has no "Direct Mode"; Chat's non-Direct answer and `answerOrPlan()` use it, and `answerOrPlan` sends the history; Direct Mode still uses `CHAT_ASSISTANT_PROMPT`; `chooseHelper` accepts alphonso writing and refuses alphonso `local_operation`; Alphonso's profile has no `github_create_issue`, `github_create_pr`, `ReleaseReadinessReport`, `RiskReport`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — `npx vitest run src/test/services/jose src/test/services/alphonso src/test/agents src/test/ChatView.test.jsx` — Expected: PASS.
- [ ] **Step 5: Commit** — `fix(alphonso): help both ways, plain answers, his own profile`

### Task 10: Desktop check and docs

**Files:**
- Create: `e2e-desktop/specs/alphonso.e2e.mjs`
- Modify: `CLAUDE.md`, `docs/ALPHONSO_GROUND_TRUTH.md` (§11.46), `docs/AGENT_GUIDE.md`, `docs/USER_MANUAL.md`, `docs/CHANGELOG.md`, `docs/governance/DEFERRED_WORK.md`, the spec's status line, `README.md`/`AGENTS.md`/`ARCHITECTURE.md` counts

- [ ] **Step 1: Write the spec** (uses `clickSend()`; makes two temporary project folders under the e2e profile's temp dir, `shop` with `package.json` (a `test` script `node test.js`) and `test.js`, and `blog`; saves them as projects through the Settings section; output folder set to a temp dir): the quiz becomes writing and nothing runs (no `command_result` artifact); "Create a small Node.js script hello.js that prints today's date" writes `<output>/Alphonso/<slug>/hello.js` and, after "Approve and carry on", runs it with node and reports exit 0; "In shop, change test.js to print 'ok'" waits with the code preview on the board (`alphonso-code-preview` shows `test.js` changed) and writes only after approval; "Run the tests in shop" proposes the test command and reports its exit code after approval; no `.git` commit appears in `shop`; with both projects listed, "Add a README" waits with "Which project: shop, blog?" and `alphonso-pick-blog` carries it on into `blog`.
- [ ] **Step 2: Build and run** — `npm run tauri build -- --debug --no-bundle`, then `ALPHONSO_E2E_EDGEDRIVER=… npx wdio run e2e-desktop/wdio.conf.mjs --spec e2e-desktop/specs/alphonso.e2e.mjs` — Expected: all checks pass; then rerun `agent-roles`, `maria`, `sentinel`, `marcus` specs — Expected: pass.
- [ ] **Step 3: Docs**: CLAUDE.md rows (a new "Alphonso's code steps" row; the "Requests no specialist agent takes", "Approval for AI-planned workspace-code commands", "Jose's planner", "Task types with meanings", "Maria's reviews", "Sentinel's checks" and desktop-suite rows updated; counts), Ground Truth §11.46, AGENT_GUIDE Alphonso, USER_MANUAL (projects, the preview, Which project), CHANGELOG, DEFERRED_WORK (a paid code model live check; several projects in one request; a diff editor), spec status. Run `node scripts/verify-doc-counts.mjs`, `npm run generate:dnd-map`, `npm run verify:dnd-coverage`, `npx tsc --noEmit -p .`, `npm run lint`, the full `npm test`.
- [ ] **Step 4: Commit** — `test(alphonso): the real app writes, asks and checks in your projects` and `docs(alphonso): projects, the preview, working with the others`
