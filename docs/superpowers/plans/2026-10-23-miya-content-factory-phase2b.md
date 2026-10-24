# Miya content factory phase 2b (AI video clips) Implementation Plan

> **Status (2026-10-25):** built and merged in PR #344 (phase 2b); on `main`, not released yet (2.10.0 isn't tagged). What it leaves open is in `docs/governance/DEFERRED_WORK.md`; the current behaviour is described in `CLAUDE.md`'s Do Not Duplicate rows and `docs/USER_MANUAL.md` section 8.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (Owner, 2026-10-23: native execution, no subagents.)

**Goal:** A project's main moments (or every scene) become real image-to-video clips from the user's own ComfyUI or Runway, cut into the finished video.

**Architecture:** A new `clips` content step (Miya, `creative_video_clips`) between Stock clips and Finished video, run by Jose like the others. Per chosen scene it starts from the scene's picture and makes a clip with the project's engine (local ComfyUI workflow, or Runway image-to-video), saved in `<project>/clips/`. The assembly plays the AI clip for its length, then the scene's stock clip or picture for the rest. Runtime Hub suggests a local video model by the card's memory.

**Tech Stack:** TypeScript/React (Vitest), Rust/Tauri 2 (reqwest, serde), ComfyUI HTTP API, Runway API v1 (existing `runway.rs`).

**Spec:** `docs/superpowers/specs/2026-10-23-miya-content-factory-phase2b-design.md`

## Global Constraints

- Every default comes from what the user has; nothing hardcoded to one machine (no fixed folders, models or prices).
- Amount per project: `main` (default) / `every` / `none`. Engine per project: `local` / `runway`, default from `resolveClipEngine()`.
- When AI clips are on, Run project stops before clips (`waitFor`); a Runway run is that same stop plus the `spend` effect (always asks). One stop either way.
- Runway available only when its key is saved, Zero-Cost Mode is off and the user entered a price per second; the shared monthly limit (`paidModels.monthlyCapUsd`) refuses a clip that would pass it.
- Clip length = min(scene seconds, engine maximum); Runway 5 or 10 s (the shorter that covers the scene); the rest of the scene continues on its stock clip or picture.
- A failed clip leaves that scene on stock/picture and the step lists which scenes and why; no hidden fallback.
- Files `<project>/clips/v<n>-<scene>.mp4`, never overwritten; ComfyUI through the backend only; `freeOllamaGpuMemory()` before local clips; one clip at a time; Rust spawns use `no_window`; downloads pinned with SHA-256 and size.

## Review Focus

1. Main moments changed in the Scene Builder after the run stopped: the step must use the marks as they are when it runs (read from the project, not the plan).
2. A main-moment scene with no picture (ComfyUI was off at Scenes): skipped with "This scene has no picture to start from.", others still made.
3. The monthly limit reached part-way through a Runway run: the remaining scenes are skipped with the limit's reason; nothing paid past it.
4. ComfyUI not running, or the chosen video model not installed, when the step runs: every scene skipped with the reason; the step is done with a note, and the video still assembles.
5. A scene longer than the engine's maximum (e.g. 14 s on Runway): a 10 s clip, then 4 s of stock/picture — never a loop or slow-down.

---

### Task 1: Card memory and the video model catalogue

**Files:** create `src-tauri/src/comfyui_video_models.rs`; modify `src-tauri/src/runtime_manager.rs` (`gpu_memory_gb()`), `src-tauri/src/lib.rs`; create `src/services/videoModelService.ts`; modify `src/components/RuntimeManagerView.tsx` (ComfyUI card "Video models"); tests `src/test/services/videoModelService.test.ts`, Rust tests in the new module.

**Interfaces — Produces:**
- Rust `parse_gpu_memory_mib(&str) -> Option<u32>` (first line of `nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits`), `gpu_memory_gb() -> Option<f64>`.
- `VIDEO_MODELS: &[VideoModel]` with `id`, `name`, `min_vram_gb`, `max_seconds`, `fps`, `license`, `files: &[ModelFile { url, sha256, size, subfolder, filename }]`; `suggest_video_model(vram_gb: Option<f64>) -> Option<&'static str>` (none without an NVIDIA card).
- Commands `comfyui_video_models(saved_dir: Option<String>) -> { vramGb, suggested, models: [{ id, name, minVramGb, maxSeconds, license, installed, sizeBytes }] }` and `comfyui_install_video_model(app, saved_dir, id)` (download each file to `<comfyui>/models/<subfolder>/<filename>` as `.part`, check size and SHA-256, rename; progress on `runtime://progress`).
- TS `listVideoModels(): Promise<VideoModelsInfo>`, `installVideoModel(id)`, `getSelectedVideoModel(): string | null` / `setSelectedVideoModel(id | null)` (key `alphonso_comfyui_video_model_v1`; `null` = the suggested one).

- [ ] Pin the files first: candidates LTX-Video 2B image-to-video and Wan 2.2 TI2V-5B (Comfy-Org repackaged files on Hugging Face, with their text encoders and VAEs); a Wan 2.2 14B build only if it runs on core ComfyUI nodes in 16 GB. Take each file's size and SHA-256 from the Hugging Face API (LFS `oid`), the license from the model card, and the core node names from ComfyUI's own example workflows. Ledger a ruling for what was kept and why.
- [ ] Rust tests: `parse_gpu_memory_mib("6144\n")==Some(6144)`, garbage → None; `suggest_video_model(Some(6.0))` = the small-card model, `Some(12.0)` = Wan 5B, `None` → None; every catalogue file has a 64-hex sha256, a nonzero size and a safe filename.
- [ ] TS tests: `getSelectedVideoModel()` falls back to null; `listVideoModels` maps the command.
- [ ] Runtime Hub: under ComfyUI, "Video models" lists each with memory needed, size, license, "Suggested for your card" and Install / Installed; choosing one calls `setSelectedVideoModel`. Test in `src/test/components/RuntimeManagerVideoModels.test.tsx`.
- [ ] Run: `npx vitest run src/test/services/videoModelService.test.ts src/test/components/RuntimeManagerVideoModels.test.tsx`, `cargo test comfyui_video_models`, `cargo clippy --all-targets -- -D warnings`. Commit `feat(comfyui): video models suggested by the card`.

### Task 2: A local clip through ComfyUI

**Files:** modify `src-tauri/src/comfyui_proxy.rs` (commands `comfyui_upload_image`, `comfyui_save_output`); create `src/services/contentFactory/comfyVideoClip.ts`; test `src/test/services/contentFactory/comfyVideoClip.test.ts`.

**Interfaces — Produces:**
- Rust `comfyui_upload_image({ endpoint, workspaceRoot, relPath }) -> { name }` (multipart `POST /upload/image`, loopback endpoints only, file through `checked_file`), `comfyui_save_output({ endpoint, filename, subfolder, kind, workspaceRoot, relPath }) -> { path, bytes }` (`GET /view`, streamed to the file, 500 MB cap, `.part` then rename).
- TS `buildVideoWorkflow(modelId, { image, prompt, negative, seconds, width, height, seed }) -> Record<string, unknown>` (API-format graph with the model's core nodes; frames = round(seconds × fps) rounded to the model's frame rule), `makeComfyClip({ root, imageRel, outRel, prompt, seconds, vertical, modelId }) -> Promise<{ status: 'done' | 'pending' | 'failed'; path?: string; jobId?: string; error?: string }>` (free Ollama's GPU memory, upload, queue `/prompt`, wait up to `COMFYUI_IMAGE_TIMEOUT_MS`, save the output video), `checkComfyClip(jobId, outRel, root)`.
- [ ] Tests: the workflow for each model names that model's files and the uploaded image, and asks for at most `max_seconds`; `makeComfyClip` calls `freeOllamaGpuMemory` before queueing, returns `pending` with the job id on timeout, `failed` with ComfyUI's error. Rust tests: upload refuses a non-loopback endpoint and a path outside the workspace.
- [ ] Run tests; clippy. Commit `feat(content): a local AI clip through ComfyUI`.

### Task 3: A Runway clip and its spending

**Files:** modify `src/services/jose/joseSpend.ts` (`runwayPricePerSecondUsd`, `recordSpendUsd`), `src/components/SettingsView.tsx` (`PaidModelsPanel`: "Runway price per second (USD)"); create `src/services/contentFactory/runwayClip.ts`; tests `src/test/services/contentFactory/runwayClip.test.ts`, `src/test/services/jose/joseSpend.test.ts`.

**Interfaces — Produces:** `recordSpendUsd(usd: number): number`; `runwayClipAvailable(): { ok: boolean; reason?: string }` (key saved, Zero-Cost Mode off, price entered; reasons name what is missing); `runwayClipSeconds(sceneSec): 5 | 10`; `estimateRunwayUsd(seconds: number[]): number`; `makeRunwayClip({ root, imageRel, outDirRel, prompt, seconds, vertical, model }) -> Promise<{ status, path?, costUsd?, error? }>` (checks `canSpend` first, picture sent as a data URL through `generateRunwayVideo`, ratio `1280:720` or `720:1280`, records the cost on success, path made relative to the output root).
- [ ] Tests: 3 s → 5, 7 s → 10, 14 s → 10; estimate = sum × price; over the limit → `failed` with `canSpend`'s reason and no call; not available → each reason; success records spend.
- [ ] Run tests. Commit `feat(content): Runway clips with a cost estimate and the monthly limit`.

### Task 4: Project video settings and main moments

**Files:** modify `contentTypes.ts` (`VideoSettings { aiClips: 'main' | 'every' | 'none'; clipEngine: 'local' | 'runway' | null; runwayModel: string }`, `ContentProject.videoSettings?`), `contentProjectService.ts` (`getVideoSettings`, `setVideoSettings`, `setMainMoment(projectId, sceneId, on)` on the chosen scenes version, not marking anything out of date), `contentStepPrompts.ts` (scene plan asks for `mainMoment` per scene: hook, turning points, call to action); create `contentFactory/clipEngine.ts` (`resolveClipEngine(settings, { localModelInstalled, runwayOk }) -> { engine: 'local' | 'runway' | null; reason?: string }`, `chosenScenes(scenes, aiClips)`).
- [ ] Tests: defaults `{ aiClips: 'main', clipEngine: null, runwayModel: 'gen4_turbo' }`; auto picks local, then runway, else null with "Install a video model in Runtime Hub (ComfyUI), or add a Runway key in Connectors."; an explicit choice that isn't available gives its reason; `setMainMoment` leaves later steps not out of date; `chosenScenes` for main/every/none; the scene plan parser keeps `mainMoment` (missing → false).
- [ ] Run tests. Commit `feat(content): AI clip settings and Miya's main moments`.

### Task 5: The AI clips step

**Files:** modify `contentTypes.ts` (`StepId` + `clips` after `broll`), `contentStepAgents.ts` (`clips: [{ agent: 'miya', actionType: 'creative_video_clips', title: 'AI clips for the main moments' }]`), `jose/joseTemplates.ts` (`clips` needs `scenes`, `broll`; `assemble` needs `voice`, `music`, `broll`, `clips`), `jose/joseEffects.ts` (`creative_video_clips: ['write_own_work']`), `contentProjectPlan.ts` (`clips` step: `waitFor` = `CLIPS_WAIT` when AI clips are on; `spend` added and `waitFor` = `CLIPS_WAIT_PAID` when the engine is Runway), `contentMediaExecutor.ts` (`creative_video_clips`), `contentStepRunner.ts` (`approveContentStep(projectId, 'clips')` approves the waiting step), StepPanel label `clips: 'AI clips'`.
- Copy: `CLIPS_WAIT = 'Check the main moments in Miya Studio first.'`, `CLIPS_WAIT_PAID = 'Check the main moments and the Runway cost in Miya Studio first.'`
- Output `{ engine, model, clips: [{ sceneId, status, path?, seconds?, costUsd?, reason? }], totalUsd?, note? }`; `none` → `{ skipped: 'AI clips are off for this project.' }`; no engine → `{ skipped: <resolveClipEngine reason> }`.
- [ ] Tests (backend and engines mocked): marks read at run time (Review Focus 1); no picture → that scene skipped (2); the limit mid-run stops the rest (3); ComfyUI down → all skipped, step done with a note (4); template has 16 steps, `checkPlan` ok, clips waits only when on, Runway clips carry `spend`; older projects gain `clips`.
- [ ] Run `npx vitest run src/test/services/contentFactory/ src/test/services/jose/`. Commit `feat(content): the AI clips step`.

### Task 6: Assembly with AI clips

**Files:** modify `src-tauri/src/media_tools.rs` (`AssemblyScene.ai_clip: Option<String>`, `ai_seconds: Option<f64>`), `contentMediaExecutor.ts` `runAssemble` (passes a scene's done clip and its seconds).
- [ ] Rust tests: a scene with an AI clip makes two segments, the AI clip trimmed to `ai_seconds`, then the clip/picture/card for the rest; `ai_seconds` ≥ scene length → one segment (Review Focus 5); an AI clip outside the workspace is refused. Extend the ignored real assembly test with a generated test-pattern clip as the AI clip.
- [ ] TS test: `runAssemble` sends `aiClip`/`aiSeconds` for scenes with a done clip only.
- [ ] Run tests, clippy, the real test by hand. Commit `feat(content): the finished video plays the AI clips first`.

### Task 7: Scene Builder

**Files:** modify `SceneBuilderTab.tsx`; test `src/test/components/miya/SceneBuilderTab.test.tsx`.
- [ ] Panel "AI clips": amount (Main moments / Every scene / None), engine (Automatic / Local / Runway, with the reason when not available), Runway model; a "Main moment" switch per scene; the estimate for Runway ("4 clips, about $1.00"); when the step waits, "Make AI clips" (with the estimate for Runway) calls `approveContentStep(projectId, 'clips')`; each clip with a player, its engine and cost, skipped scenes with the reason. A clip still `pending` in ComfyUI has "Check again" (`checkComfyClip`), which saves it into the step's output when it is ready.
- [ ] Tests: the switches save; the estimate follows the marks; the button approves; a skipped scene shows its reason.
- [ ] Run tests. Commit `feat(miya): AI clips in the Scene Builder`.

### Task 8: Docs, real app, PR

- CLAUDE.md rows (video models, local and Runway clips, the clips step, assembly), CHANGELOG, DEFERRED_WORK (phase 2b open items; phase 2 closed), QA coverage, counts, dnd map; README third-party notices (each video model's license).
- Desktop: `e2e-desktop/specs/content-clips.e2e.mjs` — the Scene Builder's settings and switches save; Run project stops at "Check the main moments in Miya Studio first."; with a local video model installed and ComfyUI running, one real clip is made and the finished video uses it (skipped otherwise). Plus `content-video`, `content-project`, `smoke`.
- Self-review; PR; merge when green.
