# Agent phase 6: Alphonso writes real code in a folder you chose, and asks before he changes it

> **Status (2026-10-26):** design, written with the owner after the Alphonso inspection of 2026-10-26 (code reading, a routing probe of ten everyday requests, and five live requests in the real app). Not built yet. Builds on agent roles Part A (`buildStepInput()`), Part B (skills), agent phase 4 (Sentinel's `sentinel-code-<step>` check after every Alphonso code step) and agent phase 5 (Marcus: a step prepared before its approval, `missingAsked()` in the planner).

## Why

Alphonso owns code (front-end too), running commands, changing the project, plain questions and everyday writing. His plain answers and his writing work. His code does not.

- **Live, "What is a closure in JavaScript?":** a good direct answer.
- **Live, "Write a short email to my landlord …":** Jose's model added a Hector web search first. Its "findings" (from pages about writing letters) leaked into the email as "Your lease agreement is [lease agreement address]".
- **Live, "Write five quiz questions to test my students on fractions":** Jose's plan failed his checks, and the simple plan made it a code step (`local_operation`) because of the word "test". Alphonso ran `npm run test` four times, then once more with a larger model, with no approval. No quiz was written.
- **Live, "Create a small Node.js script hello.js that prints today's date":** the simple plan sent it to Miya ("script"), who made a video "creative package". No code.
- **Live, "Run the tests in my project":** Jose's model planned a Hector web search and a Sentinel check of nothing ("Safe."). No Alphonso step.
- **No project folder.** `executeAlphonsoAssignment()` uses `options.projectDirectory`, which nothing in Jose's pipeline sets, else `getProjectDirectoryPath(commandId)`, which only Project Batch goals set. So every file he writes fails ("Workspace root is required for workspace file writes."), and his commands run in the app's own working folder. Settings has a "Workspace Root (for supervised proofs)" field that nothing passes to him.
- **Keyword triggers** in your words decide what he does: build/compile → `npm run build`; test/verify/check/lint → `npm run test`; install/setup/add → `npm install`; run/start/launch/serve/dev → `npm run dev`. Always `npm`, never asked ("the user asked for it").
- **False success.** A code step is "verified" whenever Ollama is reachable: `resultState` looks for an artifact of type `code_generation`, which `executeWithBrain()` never makes (it makes `brain_generation`), so files written or not, the step says "Runtime reachable." A "fix the bug …" request matches no keyword, does nothing and is reported done.
- **Unasked side effects:** after writing files he runs `git add -A` and `git commit` in the project, and starts a dev server when Auto-run is on.
- **He never reads the earlier steps' work** for code: `stepCommandText()` gives him only your words, and `executeWithBrain()` gets no step input (Hector's research, Miya's design are ignored).
- **Guesswork in place of judgment:** `decomposeTask()` turns keywords into three fixed sub-tasks ("dashboard" → layout, cards, mock data); `needsClarification()` decides by length and keywords; a made-up "confidence" (50 + 25 + 15 …) is saved to memory.
- **The simple plan's routing** (probe of ten requests): "write quiz questions to test …" and "summarize this file" → code steps; "create a todo app with React" and "add a dark mode toggle to my website" → plain answers; "write a Python script that renames photos" → Miya.
- **Direct answers** use `CHAT_ASSISTANT_PROMPT`, written for Direct Mode: it tells him to say "turn off Direct Mode" in normal Chat. `answerOrPlan()` (Telegram, WhatsApp, the phone, schedules) also sends no conversation history.
- **His profile** still claims GitHub issues and pull requests (Marcus's since phase 5) and release-readiness and risk reports (Marcus's and Maria's).

## Owner decisions (2026-10-26, multiple choice)

- **Project folder:** one folder you set in Settings ("Alphonso's project folder", the existing Workspace Root field). A step that needs your project and has none waits and says where to set it.
- **Commands:** his model reads the project and proposes them. Read-only commands run; anything that installs, runs code or deletes shows you the exact command first. No keyword triggers.
- **Git and dev server:** never on his own. Only when the request asks, and then it waits for approval with the files and message shown.
- **Small code with no project named** ("a script that renames photos by date"): real files in a scratch folder, `<output folder>/Alphonso/<name>/`, checked if he can, with the path.
- **Code steps:** his model plans from the relevant files and the earlier steps' work, writes, runs the approved checks, and fixes up to 2 rounds. Done means files written and checks passed, or it says plainly what didn't run. No keyword sub-tasks, no made-up confidence.
- **Routing:** code only when it's really code. "test", "check", "run", "add" alone never make code; a script in a programming language, an app, a function, a bug, a build or a file in a project does. Jose's model decides, the simple plan follows the same rule, and a set of everyday requests pins it.
- **Writing:** research only when the request needs facts, sources or current information.
- **Direct answers:** new instructions: no Direct Mode talk; he answers from the conversation so far and says plainly when something needs real action.
- **Changing existing files:** new files are written straight away; changes to existing files wait with what changes (file and a short before/after), one approval for the step.
- **Model:** code steps use an installed coding model when there is one (a name with `coder` or `code`, e.g. `qwen2.5-coder:7b`), else the chosen model; the board says which. A paid model only when you've allowed paid models, as now.

## Where he works (`src/services/alphonso/workFolder.ts`)

- `alphonsoProjectFolder()` reads `settings.workspaceRoot` (relabelled in Settings → Runtime: "Alphonso's project folder", with Browse; the old label goes).
- `scratchFolder(name)`: `<output folder>/Alphonso/<slug, ≤40 characters>/`, `-2` … when taken; no output folder → `NEEDS_OUTPUT_FOLDER` ("Set the output folder in Settings → General so Alphonso has somewhere to put new code.").
- Which one a step uses is decided when the step is prepared (below): his model answers `where: "project" | "new"`; `project` without a folder → the step waits for setup: "Set Alphonso's project folder in Settings → Runtime." A request that names one of the last 10 scratch folders (they are listed in his prompt) reuses it.
- Every path he reads or writes stays inside the chosen folder (the backend's existing checks: no `..`, no absolute paths, never `.git`).

## A code step, prepared before it asks (`src/services/alphonso/`)

Like Marcus's sends: the engine prepares an Alphonso code step (`local_operation`, `verification_`, `execute_command`, `filesystem_`) before its approval gate, and saves the result on the request step as `codePreview`.

1. **Read** (`readProject.ts`): the folder's file list (ignoring `node_modules`, `.git`, build output; at most 400 entries), `package.json` / `pyproject.toml` / `Cargo.toml` and their scripts, and the files his model asks for (up to 8, 6,000 characters each; 20,000 for paid or cloud models, `STEP_INPUT_LIMITS`). The step input (the earlier steps' work, his skill) goes in too.
2. **Plan and write** (`codeStep.ts`): one JSON answer from his model: `where`, a short `plan`, `files` (path and complete content), `commands` (program and arguments, each with why), or `questions` when he can't proceed ("Alphonso needs to know: …"; the step fails with them, nothing written). Unreadable → one retry naming the problem, then fails with `ALPHONSO_NO_PLAN`. Paths are checked; a file outside the folder or in `.git` is refused.
3. **Classify** (`changeSet.ts`): each file is `new` or `changed` (the before/after: line counts and the first lines that differ, `describeChange()`); each command gets `assessCommandRisk()` (read-only → runs without asking; else listed). Deleting commands are `delete`, which always asks.
4. **Approve:** the step waits when it changes existing files (`change_project`), runs a command that isn't read-only (`run`) or deletes (`delete`), per the Approvals table. The wait line: "Change 2 files in my-app (src/App.tsx +12 −3, src/index.css +4), add 1, then run: npm run test". The board shows every file's before/after and every command; Telegram shows the line. New files only and read-only commands → no wait.
5. **Apply** (`applyChanges.ts`), after approval: writes exactly the approved content, runs exactly the approved commands, in order, in the folder; each command's exit code and the end of its output.
6. **Fix rounds:** when a check fails, his model gets the output and may change only files in this step's approved set (or new files) and re-run approved commands, at most 2 rounds. Anything else (another existing file, a new command) is not done: the step reports the failed check and what the fix would need.
7. **Report:** "Wrote 3 files in my-app: …. Changed src/App.tsx. npm run test: passed." or "… npm run test: failed (2 tests): <end of output>." or "not run (you didn't approve it)". `resultState` completed when every approved check passed or none was proposed, failed otherwise. No runtime proof, no "Runtime reachable", no confidence score. One memory item: "Alphonso: <plan> — files, checks".

`git` (add, commit) and starting a dev server are commands like any other: proposed only when the request asks, shown and approved. `gitAutoCommit()` and the Auto-run hook are no longer called (the functions stay, R14).

The keyword intents in `executeAlphonsoAssignment()`, the stack-template scaffolding, `decomposeTask()`, `needsClarification()`, the self-evaluation score, the validation table (`VALIDATION_COMMANDS`) and the per-command modal for AI-planned commands in this path go; `executeWithBrain()` is no longer used by Jose (kept for its tests until it has no caller; removing the file needs the owner).

## Choosing the model (`codeModel.ts`)

- A step with a `model` from Jose keeps it.
- Otherwise the first installed model whose name has `coder` or `code` (largest first, `modelSize()`), else the chosen model. Saved on the request step as `model`; the board shows "Model: …".
- Paid models only through Jose's existing paid-model rules.

## Routing (`src/services/jose/taskTypeMeanings.ts`, `joseCommandRouterService.ts`, `josePlanner.ts`)

- `isCodeRequest(text)`: code words (`code`, `function`, `bug`, `compile`, `repo`, `refactor`, `npm`, `app`, `api`, a programming language or framework name, a file name with a code extension, "my project"/"my website"/"my app"), or "script"/"program" next to a language or a code verb. `test`, `check`, `run`, `add`, `install`, `file`, `verify` alone are not code.
- The simple plan uses it for `local_operation`; "write … script" with no language stays Miya's.
- `missingAsked()` gains: a code request with no Alphonso code step → "The request asks for code: add an alphonso step with the task type local_operation."; a Hector step in a plan for writing that doesn't need facts (`needsFacts()`: research, sources, facts, latest, current, news, prices, statistics, compare, look up, find out) → "The request doesn't need research: remove the hector step."
- `src/test/services/jose/routingSet.test.ts` gains the ten probe requests with their owners.

## Direct answers (`src/services/alphonso/answerPrompt.ts`)

`ALPHONSO_ANSWER_PROMPT` for Chat's answers outside Direct Mode, `answerOrPlan()` and Alphonso's `assistant_` steps: answer in plain text from the conversation so far; never claim to have done something on the computer; when the request needs real action (files, commands, sending), say what Jose would plan for it in one line. `CHAT_ASSISTANT_PROMPT` stays for Direct Mode only. `answerOrPlan()` passes the last 6 messages of history when the caller has them.

## His profile

`alphonsoProfile.js` / `alphonsoPermissions.js`: code, commands, the project, answers and everyday writing. GitHub issues and pull requests, release-readiness and risk reports leave (Marcus's and Maria's).

## Tests

- Unit: `workFolder`, `readProject` (limits, ignored folders), `codeStep` (parse, refuse paths outside, questions, retry), `changeSet` (new/changed, before/after, command classes), `applyChanges` (writes only approved content, runs only approved commands, fix rounds limited), `codeModel`, the engine (a code step prepared before its gate; new files only → no wait; a changed file → waits with the line; after approval files written and checks run; no folder → waits for setup; never "Runtime reachable"), routing set, planner (`missingAsked` additions), the answer prompt.
- Desktop (`alphonso.e2e.mjs`, a temporary project folder the spec makes): the quiz becomes writing and runs nothing; "Create a small Node.js script hello.js …" writes `Alphonso/…/hello.js` in the output folder and runs it with node after approval; in the project folder a change to an existing file waits with its before/after on the board and is written only after "Approve and carry on"; "Run the tests in my project" proposes `npm run test`, which runs after approval and reports its exit code; no git commit happens.

## Not in this phase

- Several project folders, or one per request.
- A diff editor to change his proposed code before approving.
- Running code in a sandbox (the command allowlist in `policy_gate.rs` stays the boundary).
- Echo, then agent roles Part C.
