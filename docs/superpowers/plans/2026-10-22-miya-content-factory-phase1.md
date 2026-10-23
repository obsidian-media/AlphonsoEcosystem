# Miya Content Factory, Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Miya Studio into a project-based content engine for phase 1:
- brands and per-brand folders;
- a brief, then Hector and Nova research;
- Script Studio, then a Nova and Maria review;
- Scene Builder (storyboard and a ComfyUI picture per scene);
- Thumbnail Studio (3 finished thumbnails with the headline drawn on);
- Campaign Studio text;
- a quality gate.

Every step goes through Jose, keeps versions, marks later steps out of date,
and shows live progress.

**Architecture:**
- A project is a list of steps.
- Each AI step is sent to Jose as its own request, with **explicit assignments**
  (a new option on Jose's pipeline) whose `actionType`s already match the agents'
  contract prefixes. Jose's packets, approvals, receipts and budget therefore
  apply unchanged.
- Each agent's work runs in one new executor that calls the agent's own model
  through `generateAgentLlmResponse`.
- Project files (`project.json`, step text, pictures) live in
  `<output folder>/<brand>/<project>/`. The app keeps only a list of projects.

**Tech Stack:** React + TypeScript (Vite), Vitest + Testing Library, Tauri 2
(Rust) commands, ComfyUI through the existing image generator, the browser
canvas for drawing thumbnail text.

**Spec:** `docs/superpowers/specs/2026-10-22-miya-content-factory-design.md`
(approved 2026-10-22).

## Global Constraints

- Jose stays the orchestrator.
  - Every AI step is a `runJoseCommandExecutionPipeline` call with
    `source: 'content-factory'`.
  - Do not add a second orchestration, approval, receipt or budget mechanism.
- Agents call their own model: `generateAgentLlmResponse(agentId, …)` from
  `src/lib/ollama.ts`. Never `generateOllamaResponse` or `PREFERRED_MODEL`
  directly.
- Images: `generateComfyUiImage(...)` and `checkComfyUiImage(jobId)` from
  `src/services/connectors/connectorImageGenerators.js`, with
  `getComfyUiEndpoint()`. Never `fetch` ComfyUI from the window.
- No silent fallback: if a model or ComfyUI gives nothing usable, the step is
  `failed` with the reason shown. Never show template text as generated.
- Quality threshold default `7`, changeable per brand. Pieces below it are hidden
  unless the user turns on "Show everything". Scores and weak points are always
  shown.
- Honest copy rules go into every writing prompt: say it is AI-generated when it
  is, no invented numbers, ratings or users.
- English only. Thumbnails `1280×720`, exactly 3 per project.
- No hardcoded paths. The root is `settings.outputFolder`. If it is empty, the
  step does not run and the UI asks the user to choose a folder.
- Keep each file's line endings as stored in git. LF for new files.
- Update `CLAUDE.md` (Do Not Duplicate rows), `docs/CHANGELOG.md`, and
  `docs/qa/DESKTOP_QA_COVERAGE.md` in the same commits.
- Run `npm run generate:dnd-map` and `node scripts/verify-doc-counts.mjs` before
  each push.

## Review Focus

1. **The model returns no JSON, broken JSON or empty fields.**
   - Expected: the step shows `failed` with "The model's answer could not be
     read", the raw answer is folded away, and Retry is offered.
   - Pinned in Task 6 (`parse… returns null`) and Task 7 (failed result).
2. **ComfyUI is not running, or a picture takes longer than the wait.**
   - Expected: that scene or thumbnail shows "waiting for ComfyUI" with its
     `jobId`, and a later "Check again" fills it in. Other scenes still finish.
   - Pinned in Task 9.
3. **No output folder chosen, or a brand or project name invalid for a Windows
   folder** (`CON`, `a/b`, trailing dot, emoji only).
   - Expected: running is blocked with "Choose an output folder in Settings
     first", and names are made safe.
   - Pinned in Task 4 (`slugForFolder`).
4. **The user edits or reruns an earlier step while a later step is running.**
   - Expected: the later step's result is still saved, but as out of date.
   - Pinned in Task 8.
5. **The app closes mid-step.**
   - Expected: on the next load the step shows `interrupted` (not stuck at
     `running`) and can be rerun.
   - Pinned in Task 3 (`recoverInterruptedSteps`).

---

### Task 1: Folder-creating image save (backend)

`save_image_to_folder` writes into a folder that must already exist. Project
pictures go into new sub-folders.

**Files:**
- Modify: `src-tauri/src/commands/filesystem.rs` (`save_image_to_folder`, about lines 124–177)
- Test: same file's `#[cfg(test)]` module

**Interfaces:**
- Produces: `save_image_to_folder(base64_data, filename, folder)` now creates
  `folder` (`std::fs::create_dir_all`) before writing. The signature is
  unchanged. Its existing `..`/absolute checks still run first.

- [ ] **Step 1: Write the failing test** `save_image_to_folder_creates_missing_folder`: temp dir + `"new/sub"`, call with the 1×1 PNG data URL already used in the file's tests, assert `Ok` and that `<temp>/new/sub/test.png` exists.
- [ ] **Step 2: Run it.** `cd src-tauri && cargo test save_image_to_folder_creates_missing_folder`. Expected: FAIL (no such directory). If Windows Application Control blocks the test binary (`os error 4551`), rely on CI and say so in the PR.
- [ ] **Step 3: Add `std::fs::create_dir_all(&folder)` after the path checks.**
- [ ] **Step 4: Run `cargo test save_image_to_folder` and `cargo clippy -- -D warnings`.** Expected: PASS, no warnings.
- [ ] **Step 5: Commit** `fix(files): save_image_to_folder creates the folder`.

### Task 2: Brands

**Files:**
- Create: `src/services/contentFactory/contentTypes.ts`
- Create: `src/services/contentFactory/contentBrandService.ts`
- Test: `src/test/services/contentFactory/contentBrandService.test.ts`

**Interfaces:**
- Produces, in `contentTypes.ts`:
  - `ContentBrand`: `{ id; name; folderName; palette: string[]; fonts: string; logo: string; tone: string; audience: string; visualStyle: string; characterRefs: string; voice: { engine: 'kokoro'; voiceId: string }; platforms: string[]; schedule: string; honestyRules: string; references: { url: string; note: string }[]; lessons: { atMs: number; text: string; source: 'rejection' | 'user' }[]; pastScripts: string; qualityThreshold: number; createdAtMs; updatedAtMs }`
  - `StepId = 'brief' | 'research' | 'script' | 'review' | 'scenes' | 'thumbnail' | 'campaign' | 'quality'`
  - `STEP_ORDER: StepId[]`, in that order.
- Produces, in `contentBrandService.ts` (key `alphonso_content_brands_v1`, via `durableGet`/`durableSet` from `src/lib/durableStore.js`):
  - `listBrands(): ContentBrand[]`
  - `getBrand(id): ContentBrand | null`
  - `saveBrand(input: Partial<ContentBrand> & { name: string }): ContentBrand`. Creates or updates; new brands get `qualityThreshold: 7` and `voice: { engine: 'kokoro', voiceId: 'af_heart' }`.
  - `addBrandLesson(id, text, source): ContentBrand | null`
  - `ensureFirstBrand(): ContentBrand`. If there are no brands, create "My brand" from the old Miya brand kit, read the same way `loadSavedBrandKit()` does in `MiyaStudio.tsx` (memory id `miya-brand-kit`). Field mapping: `colors` → `palette` (split on commas), `fonts`, `logos` → `logo`, `mascots` → `characterRefs`, `tone`, `targetAudience` → `audience`, `visualStyle`, `channelRules` → `honestyRules`.

- [ ] **Step 1: Write failing tests:**
  - `saveBrand` sets threshold 7 and the Kokoro voice;
  - `saveBrand` with the same id updates and keeps `createdAtMs`;
  - `addBrandLesson` appends;
  - `ensureFirstBrand` maps a saved `miya-brand-kit` (mock `listMiyaMemory` to return `{ id: 'miya-brand-kit', content: { colors: '#0C6944, #E4573F', tone: 'warm' } }`) to `palette: ['#0C6944', '#E4573F']`, `tone: 'warm'`;
  - `ensureFirstBrand` returns the existing brand when one exists.
- [ ] **Step 2: Run** `npx vitest run src/test/services/contentFactory/contentBrandService.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement both files.** `folderName` comes from `slugForFolder(name)` (Task 4). Until Task 4 exists, import it from `contentProjectFiles.ts` and build Task 4's `slugForFolder` first if working in order.
- [ ] **Step 4: Run the test.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(miya): brands for the content factory`.

### Task 3: Projects, steps and versions

**Files:**
- Create: `src/services/contentFactory/contentProjectService.ts`
- Modify: `src/services/contentFactory/contentTypes.ts`
- Test: `src/test/services/contentFactory/contentProjectService.test.ts`

**Interfaces:**
- Produces, in `contentTypes.ts`:
  - `StepStatus = 'not_started' | 'running' | 'done' | 'failed' | 'interrupted' | 'needs_approval' | 'approved' | 'sent_back'`
  - `StepVersion = { version: number; createdAtMs: number; output: unknown; summary: string; joseCommandId: string | null; stale: boolean; basedOn: Partial<Record<StepId, number>> }`
  - `StepState = { status: StepStatus; versions: StepVersion[]; chosenVersion: number | null; error: string | null; startedAtMs: number | null; progress: { message: string; atMs: number }[] }`
  - `ContentBrief = { idea: string; platforms: string[]; outputs: string[]; format: ContentFormat; lengthSec: number; notes: string; writeInMyVoice: boolean; showEverything: boolean }`
  - `ContentFormat = 'talking_head' | 'voiceover_broll' | 'tutorial' | 'story' | 'ad' | 'listicle' | 'podcast_solo' | 'podcast_two_hosts' | 'carousel' | 'image_post'`, exported with `CONTENT_FORMATS: { id: ContentFormat; label: string }[]` for the brief's picker (design §5: all formats selectable).
  - `ContentProject = { id; brandId; name; folderName; brief: ContentBrief; steps: Record<StepId, StepState>; createdAtMs; updatedAtMs }`
- Produces, in `contentProjectService.ts` (list key `alphonso_content_projects_v1`; the full project also goes to disk in Task 4):
  - `createProject(brandId, name, brief): ContentProject`
  - `listProjects(brandId?): ContentProject[]`, newest first
  - `getProject(id): ContentProject | null`
  - `updateBrief(id, brief): ContentProject`. Marks every step after `brief` that has a version as stale.
  - `startStep(id, step): ContentProject`. Sets `running`, `startedAtMs`, clears `error`.
  - `addStepProgress(id, step, message)`
  - `saveStepVersion(id, step, { output, summary, joseCommandId }): ContentProject`. Appends `version = last + 1`. `basedOn` records the chosen version of every earlier step. Sets `chosenVersion` to it and `status: 'done'`, or `'needs_approval'` for `review` and `quality`. Marks later steps stale. If an earlier step's chosen version changed while this step ran, this version is saved with `stale: true`.
  - `failStep(id, step, error)`
  - `chooseVersion(id, step, version)`. Marks later steps stale.
  - `approveStep(id, step)`
  - `sendBackStep(id, step, reason)`
  - `isStepStale(project, step): boolean`
  - `recoverInterruptedSteps(): number`. Any `running` step becomes `interrupted`.
- Versions are capped at 20 per step (oldest dropped).

- [ ] **Step 1: Write failing tests:**
  - `createProject` puts every step at `not_started`;
  - `saveStepVersion` increments versions and caps at 20;
  - `saveStepVersion('script')` makes later steps that have versions stale (`isStepStale` true for `scenes` after script v2) and leaves earlier steps alone;
  - a version saved while an earlier step changed is `stale: true` (start `scenes`, save script v2, then save scenes: the scenes version is stale);
  - `review` saves as `needs_approval`, and `approveStep` makes it `approved`;
  - `recoverInterruptedSteps` turns `running` into `interrupted` and returns the count.
- [ ] **Step 2: Run** `npx vitest run src/test/services/contentFactory/contentProjectService.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(miya): content projects with steps and versions`.

### Task 4: Project folders and files

**Files:**
- Create: `src/services/contentFactory/contentProjectFiles.ts`
- Test: `src/test/services/contentFactory/contentProjectFiles.test.ts`

**Interfaces:**
- Produces:
  - `slugForFolder(name: string): string`. Lowercase, spaces become `-`, only `a-z0-9-`, at most 60 characters, no trailing `-` or `.`. Empty becomes `untitled`. Windows reserved names (`con prn aux nul com1-9 lpt1-9`) get `-folder` appended.
  - `projectRelativeDir(brand, project): string` = `${brand.folderName}/${project.folderName}`.
  - `requireOutputRoot(settings): string`. Returns the trimmed `settings.outputFolder`, or throws `Error('Choose an output folder in Settings first.')`.
  - `writeProjectFile(root, brand, project): Promise<void>`. Writes `project.json` (the whole project) through `invoke('write_workspace_text_file', { workspaceRoot: root, relativePath, content })`.
  - `writeStepText(root, brand, project, step, version, text): Promise<string>`. Writes `<step>/v<version>.md`, returns the relative path.
  - `saveProjectImage(root, brand, project, subfolder, filename, base64): Promise<string>`. Calls `invoke('save_image_to_folder', { base64Data, filename, folder })` with `folder` = root joined with the project dir and subfolder, using `\` on Windows and `/` elsewhere. Returns the path.
  - `loadProjectFile(root, brand, folderName): Promise<ContentProject | null>`. Uses `invoke('read_workspace_file', …)` and `JSON.parse`; null on any error.
- Subfolders: `research`, `script`, `review`, `scenes`, `thumbnail`, `campaign`, `quality`.

- [ ] **Step 1: Write failing tests:**
  - `slugForFolder('My Brand!') === 'my-brand'`, `'CON' → 'con-folder'`, `'a/b' → 'a-b'`, `'🎉' → 'untitled'`, `'end.' → 'end'`;
  - `requireOutputRoot({ outputFolder: '  ' })` throws the exact message;
  - `writeProjectFile` calls `invoke` with `relativePath: 'my-brand/launch-video/project.json'` (mock `@tauri-apps/api/core`);
  - `saveProjectImage` passes `folder` ending in `launch-video` + separator + `scenes`.
- [ ] **Step 2: Run** `npx vitest run src/test/services/contentFactory/contentProjectFiles.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Before writing the call, check `read_workspace_file`'s exact argument names in `src-tauri/src/workspace.rs` (about line 1043).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(miya): project folders per brand`.

### Task 5: Jose accepts explicit assignments

**Files:**
- Modify: `src/services/joseCommandRouterService.ts` (`CommandRouteOptions` about line 155, `JoseCommandAssignment` about line 74, `createJoseCommandRoute` about line 555)
- Modify: `src/services/joseExecutionEngineService.ts` (`runJoseCommandExecutionPipeline` about line 1223, `executeAssignment` about line 1176)
- Test: `src/test/joseExplicitAssignments.test.js`

**Interfaces:**
- Produces:
  - `JoseCommandAssignment.contentStep?: ContentStepPayload`, where `ContentStepPayload = { projectId: string; step: StepId; brief: ContentBrief; brand: ContentBrand; prior: Partial<Record<StepId, unknown>>; task: string }` (type in `contentTypes.ts`).
  - `CommandRouteOptions.assignments?: JoseCommandAssignment[]`. When it is a non-empty array, `createJoseCommandRoute` uses it instead of `decomposeViaBackend` and `decomposeJoseCommand`.
  - `runJoseCommandExecutionPipeline({ …, assignments })`. When `assignments` is given, it skips the creative-intent, workflow and coding-agent early returns, and passes `assignments` to `createJoseCommandRoute`.
  - `executeAssignment`: when `assignment.contentStep` is set, it returns `executeContentStepAssignment(assignment, options)` (Task 7) before the per-agent branches.
- `actionType` values the factory uses. They already match `allowedActionPrefixes` in `agentContractService.ts`, so no contract change is needed:
  - Hector: `research_virality`
  - Nova: `analysis_market`, `analysis_content_review`, `strategy_timing`
  - Miya: `creative_script`, `creative_scenes`, `creative_thumbnails`, `creative_campaign`
  - Maria: `audit_content_quality`
  - Sentinel: `security_content_check`
  - Echo: `memory_content_lesson`

- [ ] **Step 1: Write failing tests:**
  - with `assignments: [{ agent: 'hector', actionType: 'research_virality', … }, { agent: 'nova', actionType: 'analysis_market', … }]`, `createJoseCommandRoute` creates exactly 2 packets to `hector` and `nova`, and `decomposeJoseCommand` is not called (spy);
  - `runJoseCommandExecutionPipeline` with `assignments` and a command text containing "make an image" does not call `generateComfyUiImage` (mock it);
  - an assignment with `contentStep` reaches `executeContentStepAssignment` (mock the module);
  - with no `assignments`, behaviour is unchanged: an existing `decomposeJoseCommand` path is still called.
- [ ] **Step 2: Run** `npx vitest run src/test/joseExplicitAssignments.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement the three changes.**
- [ ] **Step 4: Run it, then the existing Jose suites:** `npx vitest run src/test/joseExecutionEngineService.test.js src/test/joseCommandRouterService.test.js src/test/joseExplicitAssignments.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): explicit assignments for callers that know the agents`.

### Task 6: Step prompts and answer parsing

**Files:**
- Create: `src/services/contentFactory/contentStepPrompts.ts`
- Test: `src/test/services/contentFactory/contentStepPrompts.test.ts`

**Interfaces:**
- Produces:
  - `buildStepPrompt(payload: ContentStepPayload, agent: string, actionType: string): { system: string; prompt: string }`. Every prompt includes:
    - the brief;
    - the brand: name, tone, audience, visual style, palette, honesty rules;
    - the brand's last 10 lessons, under "Lessons from earlier feedback";
    - the brand's references;
    - the honest-copy rules (Global Constraints);
    - when `brief.writeInMyVoice` and `brand.pastScripts` are set (script steps only), up to 6,000 characters of `pastScripts` under "Write in this voice";
    - the relevant `prior` outputs;
    - a "Return JSON only" instruction with the exact keys below.
  - `parseStepAnswer(actionType, text): unknown | null`. Uses `parseJsonResponse` from `src/lib/jsonUtils.js`, and checks the required keys and types. Null if any required key is missing or empty.
- Required JSON per `actionType`:
  - `research_virality`: `{ references: { title; url; whyItWorks; hook }[] (≥3), patterns: string[] (≥3), hookIdeas: string[] (≥3) }`
  - `analysis_market`: `{ competitors: { name; whatTheyDo }[], gaps: string[], opportunityScore: number (0–100), angle: string }`
  - `creative_script`: `{ hooks: string[] (exactly 3), chosenHook: number, title: string, script: { startSec: number; endSec: number; spoken: string; onScreenText: string; bRoll: string; music: string }[] (≥1) }`
  - `analysis_content_review`: `{ hookScore: number (1–10), scriptScore: number (1–10), notes: string[], mustFix: string[] }`
  - `audit_content_quality`: `{ pieces: { pieceId: string; score: number (1–10); comparedTo: string; weakPoints: string[] }[], honestyIssues: string[] }`
  - `creative_scenes`: `{ style: string, scenes: { id: string; startSec; endSec; description; camera; movement; imagePrompt; negativePrompt }[] }`
  - `creative_thumbnails`: `{ concepts: { id: string; headline: string (≤6 words); imagePrompt: string; layout: 'left' | 'right' | 'center' }[] (exactly 3) }`
  - `creative_campaign`: `{ platforms: { platform: string; caption: string; hashtags: string[]; description: string }[], ads: { network: 'meta' | 'google' | 'youtube'; headline: string; body: string }[], calendar: { platform: string; suggestedAt: string; reason: string }[] }`
  - `strategy_timing`: `{ times: { platform: string; dayOfWeek: string; time: string; reason: string }[] }`
  - `security_content_check`: `{ ok: boolean, issues: string[] }`

- [ ] **Step 1: Write failing tests:**
  - the prompt contains the brand name, a lesson text and "Return JSON only";
  - with `writeInMyVoice: true` the `creative_script` prompt contains the past-scripts text, and with `false` it does not;
  - `parseStepAnswer('creative_script', <fenced JSON with 3 hooks>)` returns the object;
  - with 2 hooks it returns null;
  - `parseStepAnswer('creative_thumbnails', <json with a 9-word headline>)` returns null;
  - for `'research_virality'`, `'not json'` returns null.
- [ ] **Step 2: Run** `npx vitest run src/test/services/contentFactory/contentStepPrompts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** One small validator per action type; no schema library.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(miya): step prompts and answer checks`.

### Task 7: The agents' content executor

**Files:**
- Create: `src/services/contentFactory/contentAgentExecutor.ts`
- Test: `src/test/services/contentFactory/contentAgentExecutor.test.ts`

**Interfaces:**
- Consumes: `buildStepPrompt` and `parseStepAnswer` (Task 6); `generateAgentLlmResponse(agentId, { prompt, system, format: 'json', sessionId })` from `src/lib/ollama.ts`; `getConfiguredOllamaEndpoint()`.
- Produces: `executeContentStepAssignment(assignment, options): Promise<{ summary: string; resultState: 'completed' | 'failed'; artifacts: { type: 'content_step_output'; actionType: string; data: unknown; raw: string }[]; sources: string[]; contractAction: string; failureReason?: string }>`
  - It asks the assignment's agent once. If parsing fails it retries once with "Your last answer could not be read; return only JSON with keys …".
  - Still unreadable: `resultState: 'failed'`, `failureReason: "The model's answer could not be read."`, with `raw` kept.
  - `sources` are the reference URLs, for `research_virality`.
  - `sessionId` is `content:<projectId>:<step>`, for Hermes continuity.

- [ ] **Step 1: Write failing tests** (mock `generateAgentLlmResponse`):
  - a good answer gives `completed` with `artifacts[0].data` parsed;
  - a bad answer, then a good one, gives `completed` after 2 calls;
  - two bad answers give `failed` with the exact reason and `raw`;
  - it calls `generateAgentLlmResponse` with the assignment's agent (e.g. `'nova'`) and `format: 'json'`.
- [ ] **Step 2: Run** `npx vitest run src/test/services/contentFactory/contentAgentExecutor.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, then rerun Task 5's test.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(miya): agents do content steps through Jose`.

### Task 8: The step runner (text steps)

**Files:**
- Create: `src/services/contentFactory/contentStepRunner.ts`
- Test: `src/test/services/contentFactory/contentStepRunner.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 4, 5 and 7; `getAllAgentOutputs(commandId)` from `src/services/agentOutputStoreService.ts`.
- Produces:
  - `STEP_AGENTS: Record<StepId, { agent: string; actionType: string; title: string }[]>`:
    - `research`: hector `research_virality`, nova `analysis_market`
    - `script`: miya `creative_script`
    - `review`: nova `analysis_content_review`, maria `audit_content_quality`
    - `scenes`: miya `creative_scenes`
    - `thumbnail`: miya `creative_thumbnails`
    - `campaign`: miya `creative_campaign`, nova `strategy_timing`
    - `quality`: maria `audit_content_quality`, sentinel `security_content_check`
    - `brief`: none (user only)
  - `runContentStep(projectId, step, { settings, onProgress? }): Promise<ContentProject>`
    1. `requireOutputRoot`.
    2. `startStep`.
    3. Build assignments with `contentStep` (`prior` = chosen versions of earlier steps), `riskLevel: 'low'`, `requiresApproval: false`.
    4. Call `runJoseCommandExecutionPipeline({ commandText: \`Content factory: ${step} for "${project.name}"\`, source: 'content-factory', previewMode: false, assignments, onProgress })`. Each Jose `onProgress` event is turned into `addStepProgress(message)` with plain text: "Hector is researching…", "Nova is checking the market…", and so on.
    5. Read each agent's artifact from `getAllAgentOutputs(commandId)`.
    6. If any agent failed, call `failStep` with that agent's reason. Otherwise call `saveStepVersion` with `output = { [agent]: data }`.
    7. `writeStepText` (a readable Markdown rendering) and `writeProjectFile`.
  - `scenes` and `thumbnail` also run Task 9's picture step after the text.
  - Pending Jose approvals (`pendingApprovalCount > 0`) leave the step `needs_approval`, with "Waiting for your approval in the Approval panel".

- [ ] **Step 1: Write failing tests** (mock Jose's pipeline, `getAllAgentOutputs`, files):
  - `runContentStep('research')` sends 2 assignments with the exact `actionType`s and `contentStep.step === 'research'`;
  - success saves version 1 with `output.hector` and `output.nova`;
  - one agent failing gives a `failed` step with that reason;
  - an empty `outputFolder` gives a `failed` step with "Choose an output folder in Settings first." and Jose not called;
  - `script` passes `prior.research` = the chosen research output;
  - progress events become `progress` entries.
- [ ] **Step 2: Run** `npx vitest run src/test/services/contentFactory/contentStepRunner.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(miya): run each content step through Jose`.

### Task 9: Pictures for scenes and thumbnails

**Files:**
- Create: `src/services/contentFactory/contentImages.ts`
- Create: `src/services/contentFactory/thumbnailRenderer.ts`
- Test: `src/test/services/contentFactory/contentImages.test.ts`
- Test: `src/test/services/contentFactory/thumbnailRenderer.test.ts`

**Interfaces:**
- Consumes: `generateComfyUiImage`, `checkComfyUiImage`, `getComfyUiEndpoint`, `saveProjectImage` (Task 4), project service (Task 3).
- Produces:
  - `renderScenePictures(project, version, settings, onProgress): Promise<{ sceneId: string; status: 'done' | 'pending' | 'failed'; path?: string; jobId?: string; error?: string }[]>`
    - Scenes run one at a time (one GPU).
    - Each picture is 832×480 (16:9) for horizontal outputs, 480×832 for vertical-only projects.
    - The prompt is `imagePrompt` plus the scenes' shared `style` plus the brand's `visualStyle` and `characterRefs`, so all scenes share one look.
    - A result with `pending: true` keeps its `jobId`.
    - Results are stored in the step version's `output.pictures`.
  - `checkPendingPictures(projectId, step)`. Calls `checkComfyUiImage(jobId)` for each pending one and saves the found pictures.
  - `renderThumbnails(project, version, settings, onProgress)`. For each of the 3 concepts: generate the base image at 1280×720 (fall back to 1024×576 upscaled on the canvas if the checkpoint refuses that size; say so in progress), then `drawHeadline`, then save `thumbnail/t<n>.png`.
  - In `thumbnailRenderer.ts`:
    - `layoutHeadline(text, { width: 1280, height: 720, layout, maxLines: 2 }): { lines: string[]; fontSize: number; x: number; y: number; align: 'left' | 'right' | 'center' }`. Pure: picks the largest font size from 120 down to 56 so each line fits 55% of the width (60% for `center`). Measures with a supplied `measure(text, size)` function.
    - `drawHeadline(baseBase64, headline, brand, layout): Promise<string>`. Draws on a canvas:
      - a gradient darkening behind the text side, not a box;
      - text in `brand.palette[0]` (white if there is no palette), with an outline in the darkest palette colour;
      - font `brand.fonts` or `Impact, Arial Black, sans-serif`.
      Returns PNG base64.

- [ ] **Step 1: Write failing tests:**
  - `layoutHeadline('THE 3 SECOND RULE', …)` with `measure = (t, s) => t.length * s * 0.6` returns 1–2 lines, `fontSize` between 56 and 120, `align` matching `layout`;
  - with a 30-character word it still returns `fontSize >= 56`, cut into 2 lines;
  - `renderScenePictures` with a `{ ok: true, pending: true, jobId: 'j1' }` result gives that scene `pending` with `jobId 'j1'`, and the next scene is still requested;
  - with `{ ok: false, error: 'ComfyUI not running' }` it gives `failed` with that error;
  - `renderThumbnails` produces exactly 3 entries and calls `generateComfyUiImage` with `width: 1280, height: 720` (mock `drawHeadline` and `saveProjectImage`).
- [ ] **Step 2: Run** both test files. Expected: FAIL.
- [ ] **Step 3: Implement.** In jsdom the canvas is unavailable, so `drawHeadline` is only exercised in the desktop check (Task 12).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(miya): scene pictures and finished thumbnails`.

### Task 10: Quality gate and learning

**Files:**
- Create: `src/services/contentFactory/contentQualityGate.ts`
- Test: `src/test/services/contentFactory/contentQualityGate.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3 and 8. `appendAgentActivity`. Echo's memory through `addMemoryItem` from `src/services/unifiedMemoryService.ts` (check its export name first).
- Produces:
  - `visiblePieces(project, brand): { pieceId; score; weakPoints; visible: boolean }[]`. `visible = score >= brand.qualityThreshold || project.brief.showEverything`.
  - `rejectPiece(projectId, step, pieceId, reason): ContentProject`. Calls `sendBackStep`, then `addBrandLesson(brand.id, \`${step}: ${reason}\`, 'rejection')`, then `addMemoryItem` with `{ category: 'preference_memory', agent: 'echo', content: … }`.
  - `retryWithReason(projectId, step, reason, settings)`. Runs `runContentStep` with the reason added to `contentStep.task`.

- [ ] **Step 1: Write failing tests:**
  - threshold 7 hides a 6 and shows a 7;
  - `showEverything` shows the 6;
  - `rejectPiece` adds a brand lesson starting with `"thumbnail: "` and calls `addMemoryItem` once;
  - `retryWithReason` passes the reason into the next run's task.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(miya): quality gate and learning from rejections`.

### Task 11: Miya Studio screens

Replace the four identical tabs. The old Generate Package view stays reachable as
"Quick package" so nothing is lost.

**Files:**
- Create: `src/components/miya/ContentProjectBar.tsx` (brand picker, project list, New project, output folder warning)
- Create: `src/components/miya/BrandEditor.tsx` (all `ContentBrand` fields, references, lessons, threshold)
- Create: `src/components/miya/BriefPanel.tsx` (idea, platforms, outputs, format, length, notes, "Show everything")
- Create: `src/components/miya/StepPanel.tsx`. Shared by every tab:
  - Run / Rerun, status, live progress list with elapsed time;
  - version picker;
  - an "Out of date: based on an older <step>" banner with Rerun;
  - Approve / Send back with a reason (review and quality);
  - an error with Retry and the folded raw answer.
- Create: `src/components/miya/ScriptStudioTab.tsx`. Research result (references, patterns, Nova's market note) above the script table: time, spoken, on-screen text, B-roll, music; 3 hooks with the chosen one marked; Nova and Maria review scores.
- Create: `src/components/miya/SceneBuilderTab.tsx` (storyboard cards with picture, camera, movement; "waiting for ComfyUI" + Check again)
- Create: `src/components/miya/ThumbnailStudioTab.tsx` (3 finished thumbnails, headline, Reject with reason)
- Create: `src/components/miya/CampaignStudioTab.tsx` (per-platform captions and hashtags, ad copy, calendar suggestions, Copy buttons, the quality step's scores)
- Modify: `src/components/MiyaStudio.tsx`. The tab ids `script`/`scene`/`thumbnail`/`campaign` render the new tabs; `brand` renders `BrandEditor`; the old view becomes a `package` tab labelled "Quick package". Call `ensureFirstBrand()` and `recoverInterruptedSteps()` on mount.
- Test: `src/test/components/miya/StepPanel.test.tsx`, `src/test/components/miya/ScriptStudioTab.test.tsx`, `src/test/components/miya/ThumbnailStudioTab.test.tsx`, `src/test/MiyaStudio.test.jsx` (extend the existing file)

**Interfaces:**
- Consumes: Tasks 2–10. `useSettings()` for `settings.outputFolder`.
- Produces: `StepPanel` props `{ project: ContentProject; step: StepId; onRun(): void; onApprove?(): void; onSendBack?(reason: string): void; onChooseVersion(v: number): void }`.

- [ ] **Step 1: Write failing tests:**
  - `StepPanel` shows "Out of date" when `isStepStale`;
  - it shows each progress message;
  - a `failed` step shows Retry and the error text;
  - `ScriptStudioTab` renders the script rows and marks the chosen hook;
  - `ThumbnailStudioTab` shows 3 images and Reject asks for a reason;
  - `MiyaStudio`: the Script, Scene, Thumbnail and Campaign tabs each render different content (assert a distinct heading per tab), and "Quick package" still shows Generate Package;
  - with no output folder the bar shows "Choose an output folder in Settings first".
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Use the `ui/` barrel (`Button`, `Badge`, `Tabs`, `EmptyState`, `Zone mood="miya"`); no new primitives.
- [ ] **Step 4: Run them, plus `npx tsc --noEmit` and `npm run lint`.** Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat(miya): a tool per Studio tab`.

### Task 12: Desktop check, docs and PR

**Files:**
- Create: `e2e-desktop/specs/content-factory.e2e.mjs`. Uses `enterShell()`, sets `outputFolder` to a temp folder in the test profile, creates a brand and project, runs Research then Script, and checks that the script table appears and `project.json` exists. Skips when no Ollama model is reachable (`ollamaHasModels()`), and when ComfyUI on 8188 is not running for the thumbnail part. At the end, read one thumbnail's pixels to confirm the headline was drawn (non-uniform top-left area).
- Modify: `e2e-desktop/specs/smoke.e2e.mjs` only if the Miya page's text check changes.
- Modify: `CLAUDE.md`:
  - a "Miya content factory" row listing each new file;
  - the Miya studio row;
  - the Jose row noting `assignments`.
- Modify: `docs/CHANGELOG.md`, `docs/qa/DESKTOP_QA_COVERAGE.md`, `docs/DO_NOT_DUPLICATE.generated.md` (`npm run generate:dnd-map`), and the counts (`node scripts/verify-doc-counts.mjs`).

- [ ] **Step 1: Run the full unit suite.** `npm test`. Expected: all pass.
- [ ] **Step 2: Build and run the desktop spec.** `npm run tauri build -- --debug --no-bundle`, then the spec with `ALPHONSO_E2E_EDGEDRIVER` set. Expected: PASS or a stated skip. If Windows Application Control blocks the build, say so; CI's desktop job runs it.
- [ ] **Step 3: Check in the real app by hand:** a project for the user's brand, Research → Script → Review → Scenes → Thumbnail → Campaign → Quality. Look at the three thumbnails at full size.
- [ ] **Step 4: Update the docs, run `generate:dnd-map`, `verify-doc-counts`, `verify:dnd-coverage`.**
- [ ] **Step 5: Commit, push, open the PR, merge when CI is green.**
