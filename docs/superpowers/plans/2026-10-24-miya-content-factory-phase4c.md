# Miya content factory phase 4c: characters and motion transfer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brands keep consistent characters (Higgsfield-trained or ComfyUI from reference pictures) that appear in scene pictures, clips, Shorts, thumbnails and carousels; scenes and Short parts can borrow a movement (Higgsfield preset, recorded or chosen clip; Higgsfield or local); plus the three 4b leftovers.

**Architecture:** Characters live on the brand (`ContentBrand.characters`), their files under `<output folder>/<brand>/characters/<id>/`. One resolver (`resolveCharacter()` in `engineChoice.ts`) decides, per picture, which engine keeps the character and why not; `contentImages.ts`'s `makePicture()` and `shortMaker.ts` pass it on. Motion is a per-scene field in the chosen scene plan; the AI clips step and the Shorts make a motion clip through `higgsfield.rs` (motion model) or a local ComfyUI workflow, inside the existing one approval per step.

**Tech Stack:** TypeScript/React (Vitest), Rust/Tauri 2 (cargo test), ComfyUI API-format workflows, WebView2 `getUserMedia`/`MediaRecorder`, the bundled ffmpeg.

**Spec:** `docs/superpowers/specs/2026-10-24-miya-content-factory-phase4c-design.md`

## Global Constraints

- Real person: the tick "This is me, or I have this person's permission" with its date is required before training or use; photos leave this computer only in the one training request; deleting the character deletes them.
- Nothing paid without asking: training has its own approval with Higgsfield's estimate; pictures and motion clips stay inside the existing one approval per step; cost recorded once, the estimate, when the result is made.
- Every fallback says why (free engine or no character / no motion, with the reason).
- Nothing hardcoded: model ids, preset ids and character ids come from the user's account or are pasted in Settings; local models are pinned with size and SHA-256 and installed from Runtime Hub.
- Files never overwritten; Higgsfield's copies deleted after download; uploads only when the approved step runs.
- Keys never in errors, logs, file names or command lines; every Higgsfield call through `higgsfield.rs`.
- Plain language on screens; Windows first; camera refusal gets a clear message.
- Recording at most 10 seconds; Miya makes 8 pictures for a made-up character (with ComfyUI).

## Review Focus

1. A real-person character whose permission tick was never set: no training, no use, the reason shown (Task 2, Task 4).
2. A character deleted while a project still names it: pictures fall back to no character with "That character was deleted." (Task 4).
3. A recorded clip longer than 10 s or a chosen file that isn't a video: refused with a plain reason before saving (Task 6).
4. Higgsfield training that fails or is still running when the app closes: status kept, Check again fetches it, never trained twice (Task 3).
5. A motion scene whose motion can't be made (no engine, card too small, Higgsfield refused): the scene gets its normal clip, with the reason (Task 7, Task 8).

---

### Task 1: The three 4b leftovers

**Files:** Modify `src-tauri/src/search.rs` (make `fetch_with_ssrf_guard` `pub(crate)`), `src-tauri/src/higgsfield.rs` (`fetch_result()` downloads through it), `src/services/contentFactory/contentImages.ts` (`makePicture()`), `src/components/ChatView.tsx`, `src/services/contentFactory/higgsfieldByName.ts`. Tests: Rust in `higgsfield.rs`, `src/test/services/contentFactory/contentImagesHiggsfield.test.ts`, `src/test/services/contentFactory/higgsfieldByName.test.ts`.

**Interfaces — produces:** `higgsfieldResultsDoneSince(sinceMs: number): HiggsfieldResult[]` in `higgsfieldByName.ts`; `HiggsfieldResult.shownInChat?: boolean` and `markShownInChat(id)`.

- [ ] Step 1: failing tests —
  - Rust `a_result_on_a_private_address_is_refused` (`fetch_result` with `http://127.0.0.1:<port>/x.png` returns failed with "private", no file written).
  - TS `a Higgsfield picture that fails is remade with ComfyUI and the note says why`: `higgsfield_run` → `{ ok:false, status:'failed', reason:'Higgsfield refused it as not safe for work (not charged).' }`; `generateComfyUiImage` called once; result `done`; `pictureNote` contains `"Higgsfield couldn't make picture 1 (Higgsfield refused it as not safe for work (not charged).); made with ComfyUI."`; `monthSpendUsd()` 0.
  - TS `a by-name result approved elsewhere is listed once for Chat`: two done results; `higgsfieldResultsDoneSince(t)` returns those after `t` not yet `shownInChat`; after `markShownInChat`, none.
- [ ] Step 2: run, watch fail.
- [ ] Step 3: implement. The Rust download keeps its existing tests passing: the local-server download test now needs an override — add `fn fetch_result_with(guard: bool, …)` so tests call with `guard = false` and the command uses `true`. ChatView: on mount and every 5 s, `higgsfieldResultsDoneSince(chatOpenedAtMs)` → one assistant message "Higgsfield made a {kind}: {prompt}" with `media`, then `markShownInChat`; results already attached by the in-Chat approve path are marked shown there.
- [ ] Step 4: pass (`npx vitest run src/test/services/contentFactory`, `cargo test --lib higgsfield`). Step 5: commit `fix(miya): Higgsfield downloads checked, failed pictures remade, results reach Chat`.

### Task 2: Characters on the brand

**Files:** Modify `contentTypes.ts`, `contentBrandService.ts`; create `src/services/contentFactory/contentCharacters.ts`, `src/components/miya/CharactersEditor.tsx` (in `BrandEditor.tsx`). Tests: `src/test/services/contentFactory/contentCharacters.test.ts`, `src/test/components/miya/CharactersEditor.test.tsx`.

**Interfaces — produces:**
- `BrandCharacter { id; name; kind: 'made_up' | 'real_person'; description; pictures: string[] /* relative paths */; permission?: { atMs: number }; higgsfield?: { characterId?: string; requestId?: string; status: 'not_trained' | 'training' | 'ready' | 'failed'; reason?: string; usd?: number }; comfyPictures?: string[] }`; `ContentBrand.characters?: BrandCharacter[]`, `ContentBrand.mainCharacterId?: string`.
- `addCharacter(brandId, { name, kind, description }): BrandCharacter`, `updateCharacter(brandId, id, patch)`, `deleteCharacter(brandId, id, settings): Promise<void>` (removes `characters/<id>/` through the existing `workspaceFileService` delete; asks Higgsfield to delete its copy when trained, where the API allows), `setMainCharacter(brandId, id | null)`, `setPermission(brandId, id, on)`, `addCharacterPictures(brandId, id, files: { name; base64 }[], settings)` (saved via `saveProjectImage`-style `save_image_to_folder` under `characters/<id>/`, never over a file), `removeCharacterPicture()`, `makeCharacterPictures(brandId, id, settings)` (8 ComfyUI pictures from the description), `characterUsable(c): { ok; reason? }` ("Tick that this is you or that you have permission first." for a real person without the tick; "Add at least 5 pictures." under 5).
- [ ] Step 1: failing tests — add/update/delete round trip; real person without tick → `characterUsable` false with that reason; 4 pictures → "Add at least 5 pictures."; `makeCharacterPictures` calls ComfyUI 8 times and saves `characters/<id>/miya-1.png…`; editor: add a real-person character, the Train button is disabled until the tick, the tick saves its date; main character radio saves `mainCharacterId`.
- [ ] Steps 2–4: fail, implement, pass. Step 5: commit `feat(miya): characters on the brand, with the permission tick`.

### Task 3: Training a character on Higgsfield

**Files:** Modify `src-tauri/src/higgsfield.rs`, `src/services/connectors/higgsfieldConnector.ts` (Settings: "Character training model id" + extra, `HIGGSFIELD_CHARACTER_MODEL` / `_EXTRA`), `ConnectorSetupPanel.tsx` (`HiggsfieldSection`), `contentCharacters.ts`, `CharactersEditor.tsx`. Tests: Rust, `contentCharacters.test.ts`.

**Interfaces — produces:**
- Rust `higgsfield_train_character({ model, name, imagePaths: Vec<String>, extra?, workspaceRoot, keys? }) -> { ok, status: 'training'|'ready'|'failed', characterId?, requestId?, reason? }` (uploads each picture through `upload()`, submits `{ name, image_urls }` merged with extra; never `prompt`), `higgsfield_character_status({ requestId, keys? })` (one look; `characterId` when ready), `higgsfield_estimate` reused for the cost with the same body (no upload: `image_urls` omitted).
- TS `trainCharacter(brandId, id, settings): Promise<BrandCharacter>` (only `characterUsable`; refuses when already `training` or `ready`; status saved before the request), `checkCharacterTraining(brandId, id)`, `estimateCharacterTraining()`. Training runs as one Jose step (`creative_character_train`, `write_own_work` + `spend`, `costEstimateUsd`) through `submitStepsToJose`, so it asks first anywhere; the executor branch sits beside `creative_higgsfield` in `executeAssignment`.
- [ ] Step 1: failing tests — Rust: the training body has `name` and `image_urls`, extra merged, `prompt` refused as in 4b; a status answer with `soul_id`/`id` reads as ready with the id (builder records the real field names found live in the ledger); TS: Train asks through one `creative_character_train` step with the estimate; a second Train while `training` returns the existing request; Review Focus 4 — status `training` kept across reload and Check again sets `ready` with the id, `higgsfield_train_character` called once.
- [ ] Steps 2–4: fail, implement, pass. Step 5: commit `feat(miya): train a character on Higgsfield, asked first`.

### Task 4: The character in pictures (Higgsfield and ComfyUI)

**Files:** Modify `engineChoice.ts`, `contentImages.ts`, `shortMaker.ts`, `contentStepPrompts.ts` (scenes: `character: true|false` per scene), `contentProjectService.ts` (`setVideoSettings({ characterId })`, `setSceneCharacter(projectId, sceneId, id | 'none')`), `higgsfield.rs` (`HiggsfieldJob.character_id` → the character field), `SceneBuilderTab.tsx` (a character pick per scene), `AiClipsPanel.tsx` (project character). Create `src/services/contentFactory/comfyCharacter.ts`. Tests: `src/test/services/contentFactory/contentCharacterPictures.test.ts`.

**Interfaces — produces:**
- `resolveCharacter(project, brand, sceneId?: string, engine: 'higgsfield' | 'comfyui'): { character: BrandCharacter | null; use: 'higgsfield' | 'comfyui' | 'none'; note?: string }` — scene's choice, else the project's, else `brand.mainCharacterId`; scenes Miya marked `character: false` get none; Higgsfield needs `status: 'ready'` and the tick, else ComfyUI with the reason; ComfyUI needs `characterReferenceAvailable()` (Task 5), else none with "Install the character reference model in Runtime Hub to keep the character."; deleted id → none with "That character was deleted."
- `makePicture(…)` gains `character` (Higgsfield: `job.characterId`; ComfyUI: `buildCharacterWorkflow()` from Task 5). Notes join `pictureNote`.
- [ ] Step 1: failing tests — scene picture with a ready character sends `characterId` to `higgsfield_run`; a scene marked `character:false` sends none; a real person without the tick → no character and the reason (Review Focus 1); deleted id → "That character was deleted." (Review Focus 2); thumbnails and carousel pass it; a mini Short's pictures pass it.
- [ ] Steps 2–4: fail, implement, pass. Step 5: commit `feat(miya): the brand's character in every picture`.

### Task 5: Local character reference in ComfyUI

**Files:** Modify `src-tauri/src/comfyui_video_models.rs` (or a sibling `comfyui_reference_models.rs` if cleaner; same `VideoModel`-style pinned table and `download_verified()`), `src/services/videoModelService.ts`, `src/components/VideoModelsPanel.tsx`; create `comfyCharacter.ts` content (`characterReferenceAvailable()`, `buildCharacterWorkflow({ checkpoint, prompt, negative, width, height, referenceImages })`). Tests: Rust pinned-table test, `src/test/services/contentFactory/comfyCharacter.test.ts`.

**Interfaces — produces:** `characterReferenceAvailable(): Promise<boolean>`, `buildCharacterWorkflow(...)` (an API-format graph on ComfyUI's own nodes; reference pictures uploaded with `comfyui_upload_image`).
- [ ] Step 0: choose the method and model: the smallest image-reference approach that runs on ComfyUI's built-in nodes with the installed checkpoints; record name, licence, size, SHA-256 and the template it was copied from in the ledger. If none runs on built-in nodes, use the one needing the fewest extra files, still pinned, and ledger it as a Ruling.
- [ ] Step 1: failing tests — every pinned file has size and SHA-256; the workflow uploads each reference and includes them; without the model installed `characterReferenceAvailable()` is false.
- [ ] Steps 2–4: fail, implement, pass. Step 5: commit `feat(miya): keep a character with ComfyUI from its pictures`.

### Task 6: Motion on a scene, recording and choosing a clip

**Files:** Modify `contentTypes.ts` (scene `motion?: { source: 'preset' | 'recorded' | 'file'; presetId?: string; path?: string }`, `motionSuggested?: boolean`; same on a mini Short part), `contentStepPrompts.ts` (scenes and Shorts: Miya's `motionSuggested`), `contentProjectService.ts` (`setSceneMotion(projectId, sceneId, motion | null)`, `setShortPartMotion(...)`), `SceneBuilderTab.tsx`, `ShortsStudioTab.tsx`. Create `src/components/miya/MotionPicker.tsx`, `src/components/miya/MotionRecorder.tsx`, and Rust `content_save_motion_clip({ workspaceRoot, outPath, base64?, sourcePath? })` in `media_tools.rs` (webm → mp4 with ffmpeg; copies a chosen file; checks ffprobe length ≤ 10.5 s and a video stream; never overwrites). Tests: `src/test/components/miya/MotionPicker.test.tsx`, Rust tests in `media_tools.rs`.

**Interfaces — produces:** `saveMotionClip(projectId, sceneId, { base64 } | { sourcePath }, settings): Promise<{ ok; path?; reason? }>` → `<project>/motion/<scene>-v<n>.mp4`.
- [ ] Step 1: failing tests — Rust: an 11 s clip refused "The clip is longer than 10 seconds."; a text file refused "That file isn't a video."; never over an existing file (Review Focus 3); TS: Miya's `motionSuggested` shows as a suggestion the user can turn off; choosing a preset saves `{ source:'preset', presetId }`; Record shows 3-2-1, stops at 10 s, Keep saves through `saveMotionClip`; camera refused → "Alphonso couldn't use the camera. Allow it in Windows Settings → Privacy → Camera, or choose a file."
- [ ] Steps 2–4: fail, implement, pass. Step 5: commit `feat(miya): give a scene a motion: preset, recorded or chosen clip`.

### Task 7: Higgsfield motion clips (and the preset list)

**Files:** Modify `higgsfield.rs` (`higgsfield_presets({ model?, keys? })` when the API offers a list; `HiggsfieldJob.motion_path` / `preset_id` uploaded and merged), `higgsfieldConnector.ts` (Settings "Motion model id" + extra, `HIGGSFIELD_MOTION_MODEL`), `higgsfieldClip.ts` (`makeHiggsfieldMotionClip()`), `contentMediaExecutor.ts` (`runClips`: a motion scene goes there first), `shortMaker.ts`, `contentProjectPlan.ts` (the clips wait says "N motion clips" and the estimate includes them), `MotionPicker.tsx` (presets from the list, else a pasted preset id). Tests: `src/test/services/contentFactory/contentMotionClips.test.ts`, Rust.

**Interfaces — produces:** `makeHiggsfieldMotionClip({ root, imageRel, motion, outRel, prompt, vertical }): Promise<HiggsfieldClipResult>`; `listHiggsfieldPresets(): Promise<{ ok; presets?: { id; name }[]; reason? }>`.
- [ ] Step 1: failing tests — an approved clips run with one motion scene calls the motion model with the scene picture and the uploaded clip (or preset id), downloads to `clips/v1-<scene>.mp4`, records the estimate once; not approved → nothing sent; Higgsfield refuses → the scene gets its normal clip with the reason (Review Focus 5); the clips wait text "Check the main moments and the Higgsfield cost in Miya Studio first. Includes 1 motion clip."; a Short part's motion is made the same way.
- [ ] Steps 2–4: fail, implement, pass. Step 5: commit `feat(miya): motion transfer with Higgsfield`.

### Task 8: Local motion transfer with ComfyUI

**Files:** Modify the pinned model table (Task 5's), `videoModelService.ts`, `VideoModelsPanel.tsx`; create `src/services/contentFactory/comfyMotionClip.ts` (`localMotionAvailable(): Promise<{ ok; reason? }>`, `buildMotionWorkflow()`, `makeComfyMotionClip()` mirroring `makeComfyClip()`: GPU hand-off, upload, wait 15 min, pending with job id). Modify `runClips`/`shortMaker.ts` so a motion scene without Higgsfield uses this. Tests: `src/test/services/contentFactory/comfyMotionClip.test.ts`, Rust pinned-table test.

- [ ] Step 0: choose the smallest pinned model that does motion transfer on ComfyUI's own nodes; its `min_vram_gb`; ledger the choice and its source template.
- [ ] Step 1: failing tests — card under the model's memory → not available with "This graphics card can't run local motion transfer; Higgsfield can."; available → the workflow has the picture and the motion clip; pending kept with job id; can't be made → normal clip with reason (Review Focus 5).
- [ ] Steps 2–4: fail, implement, pass. Step 5: commit `feat(miya): motion transfer on this computer`.

### Task 9: Desktop spec, docs, checks, PR

- [ ] Step 1: `e2e-desktop/specs/content-characters.e2e.mjs` (Zero-Cost Mode on, nothing paid sent): a real-person character can't be trained until the tick; a made-up character gets 8 pictures from Miya when ComfyUI runs (else skips that check); a scene's motion "choose a file" saves into `motion/`; a 12 s file is refused. `node --check`.
- [ ] Step 2: docs — CLAUDE.md rows (characters, training, character in pictures, ComfyUI reference, motion, motion clips local and Higgsfield, the 4b leftovers), CHANGELOG, DEFERRED_WORK (4c open items: not checked live; Higgsfield fields confirmed or not), QA (spec row; live check step for characters and motion), desktop counts.
- [ ] Step 3: all checks (as in 4b), full suite, self-review, commit, PR, merge when green. Then remind the owner about the topic before Jose phase 7.
