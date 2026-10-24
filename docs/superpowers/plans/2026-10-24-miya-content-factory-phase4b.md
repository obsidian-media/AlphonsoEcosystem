# Miya content factory phase 4b — ElevenLabs and Higgsfield — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ElevenLabs voices (incl. the user's cloned voice), ElevenLabs-timed captions and sound effects; Higgsfield pictures, AI clips and requests by name — all optional, asked first, with the free tools as the fallback.

**Architecture:** Two backend modules (`elevenlabs.rs`, `higgsfield.rs`) hold every call to those services with the saved keys; the app chooses an engine per brand with a per-project override (`engineChoice.ts`) and plugs each engine into the existing steps (Voice, Scenes, Thumbnail, Carousel, AI clips, Shorts) and Jose's effects. The Runway approval path is generalised to "a paid engine".

**Tech Stack:** TypeScript/React (Vitest), Rust/Tauri 2 (reqwest, serde), the bundled ffmpeg, WebdriverIO.

**Spec:** `docs/superpowers/specs/2026-10-24-miya-content-factory-phase4b-design.md`

## Global Constraints

- Never hardcode a model id, a voice, or a price; example Higgsfield ids appear only as input placeholders.
- ElevenLabs: header `xi-api-key`; voices `GET /v1/voices`; models `GET /v1/models` (TTS-capable only); speech `POST /v1/text-to-speech/{voice_id}/with-timestamps`; effects `POST /v1/sound-generation` (0.5–30 s).
- Higgsfield: base `https://api.higgsfield.ai`; `Authorization: Key <id>:<secret>`; upload `POST /files/generate-upload-url` then `PUT` with the returned headers (never the API keys); estimate `/estimate/{model}`; submit `POST /{model}`; poll the status URL; download at once; then `DELETE /requests/{id}`.
- Paid runs always ask (`spend`); one approval per run; inside the one monthly cap (`canSpend()` / `recordSpendUsd()` in `joseSpend.ts`); Zero-Cost Mode blocks both connectors.
- Unavailable paid engine → the step says why and uses the free one (Kokoro / ComfyUI / local clips).
- Keys never in an error, a log, a file name or a command line; network calls from the backend only.
- Sound effects: at most one per scene, long video only, mixed −12 dB under the voice.

## Review Focus

1. A Higgsfield request that finishes after the app was closed: the result must still be fetched (or reported) when the step is retried, not paid for twice.
2. "Extra settings (JSON)" that isn't a JSON object, or that tries to set the prompt/picture fields: refused with a plain error before anything is sent.
3. An ElevenLabs voice that was deleted from the account: the Voice step says so and reads with Kokoro, with the note.
4. A brand set to Higgsfield pictures while Zero-Cost Mode is on: ComfyUI makes them, with "Higgsfield is off while Zero-Cost Mode is on."
5. An estimate that fails (bad model id): no submit, the step fails over to the free engine with Higgsfield's own error in the note.

---

### Task 1: ElevenLabs in the backend and Connectors

**Files:** Create `src-tauri/src/elevenlabs.rs` (register in `lib.rs`); modify `src/services/connectors/connectorRegistry.js`, `src/services/policyEnforcementService.ts` (`PAID_OR_METERED_CONNECTORS`, high risk), `src/components/ConnectorSetupPanel.tsx` (Content & Productivity → ElevenLabs: key, Test); create `src/services/connectors/elevenLabsConnector.ts`. Tests: Rust in `elevenlabs.rs`; `src/test/connectors/elevenLabsConnector.test.ts`; registry/policy tests.

**Interfaces — produces:**
- Rust commands: `elevenlabs_voices(key?) -> { ok, voices: [{ id, name, cloned: bool }] }`, `elevenlabs_models(key?) -> { ok, models: [{ id, name }] }` (only `can_do_text_to_speech`), `elevenlabs_speak({ workspaceRoot, outDir, voiceId, modelId, lines: [{ id, text, pauseSec? }], key? }) -> { ok, full: { durationSec }, files: [{ id, path, durationSec, startSec }], words: [{ word, start, end }] }` (one request per line with `previous_text`/`next_text`; MP3 → WAV with the bundled ffmpeg; `full.wav` joined; character timings turned into word timings offset by each line's start; a line with no words = `pauseSec` of silence), `elevenlabs_sound({ workspaceRoot, outPath, text, seconds, key? }) -> { ok, path }`. Pure helpers: `words_from_alignment(chars, starts, ends) -> Vec<TimedWord>`, `classify_error(status, body)`.
- TS: `isElevenLabsConfigured()`, `listElevenLabsVoices()`, `listElevenLabsModels()` (through the commands, after `evaluatePolicyGate`).

- [ ] Step 1: failing tests — `words come from the character timings` (`"Hi there"` chars/starts/ends → `[{word:'Hi',start,end},{word:'there',…}]`); `a cloned voice is marked` (voices JSON with `category: "cloned"` → `cloned: true`); `only text-to-speech models are listed`; `errors never carry the key`; TS `ElevenLabs is a paid connector` (blocked in Zero-Cost Mode, needs approval).
- [ ] Step 2: run — fail. Step 3: implement. Step 4: `cargo test --lib elevenlabs`, clippy, `npx vitest run src/test/connectors/elevenLabsConnector.test.ts` — pass. `fixcounts.py` + `verify-doc-counts`.
- [ ] Step 5: commit `feat(connectors): ElevenLabs voices, speech and sound effects in the backend`.

### Task 2: Choosing the engines (brand default, project override)

**Files:** Create `src/services/contentFactory/engineChoice.ts`; modify `contentTypes.ts` (`ContentBrand.engines?`, `VideoSettings.engines?` override), `contentProjectService.ts` (`setProjectEngines`), `src/components/miya/BrandEditor.tsx` (Voice: Kokoro / ElevenLabs with the voice and model pickers filled from the account; Pictures: ComfyUI / Higgsfield; AI clips: Automatic / Local / Runway / Higgsfield), the project's video settings panel (`AiClipsPanel.tsx`: override for the three). Tests: `src/test/services/contentFactory/engineChoice.test.ts`, BrandEditor test.

**Interfaces — produces:**
- `interface EngineChoices { voice?: { engine: 'kokoro' | 'elevenlabs'; voiceId: string; modelId?: string }; pictures?: 'comfyui' | 'higgsfield'; clips?: 'local' | 'runway' | 'higgsfield' | null }`.
- `projectEngines(project, brand): Required<EngineChoices>` (project override over brand default over the free defaults; the existing `VideoSettings.clipEngine` stays the clips override).
- `resolveVoice(project, brand): { engine; voiceId; modelId?; note?: string }`, `resolvePictures(project, brand): { engine: 'comfyui' | 'higgsfield'; note?: string }` — paid ones fall back with the note: "ElevenLabs isn't set up; read by Kokoro." / "Higgsfield is off while Zero-Cost Mode is on; made with ComfyUI." / "Over this month's spending cap; …".

- [ ] Step 1: failing tests — `a project override wins over the brand`; `the free engines are the default`; `an unavailable paid engine falls back with the reason` (no key, Zero-Cost Mode, over the cap); UI `the brand's voice can be an ElevenLabs voice from the account` (mocked list incl. a cloned one, saved on the brand).
- [ ] Steps 2–4: fail, implement, pass. Step 5: commit `feat(miya): choose ElevenLabs and Higgsfield per brand, per project`.

### Task 3: The Voice step with ElevenLabs

**Files:** modify `src/services/contentFactory/contentMediaExecutor.ts` (`runVoice`, `runAssemble` captions), `contentProjectPlan.ts` (Voice `spend` and `VOICE_WAIT_PAID`), `src/services/jose/joseSpend.ts` (`elevenLabsPricePer1kCharsUsd`, `elevenLabsPricePerEffectUsd` in `PaidModelSettings`; `estimateElevenLabsUsd(chars)`), `src/components/SettingsView.tsx` (`PaidModelsPanel`: the two prices), `stepGraph.ts` (Miya `creative_voice` may spend). Tests: `contentMediaExecutor.test.ts`, `contentProjectPlan.test.ts`.

**Interfaces — produces:** `VOICE_WAIT_PAID(usd)` = `` `Read the voice-over with ElevenLabs, about $${usd.toFixed(2)}.` ``; voice output gains `engine` and `words` (ElevenLabs timings); `runAssemble` uses `words` when present (captions `'elevenlabs'`), else Whisper/lines as today.

- [ ] Step 1: failing tests — `an ElevenLabs brand reads the voice-over with ElevenLabs when the run was approved` (assignment with `spend` → `elevenlabs_speak` with the brand's voice and model; spend recorded); `not approved or unavailable → Kokoro with the note`; `a deleted voice → Kokoro with "That ElevenLabs voice is no longer in your account; read by Kokoro."` (Review Focus 3); `captions use ElevenLabs' timings` (no `content_whisper_words` call); plan: `the Voice step asks once with the estimate` (`spend`, `waitFor = VOICE_WAIT_PAID(x)` on full runs, `costEstimateUsd`).
- [ ] Steps 2–4: fail, implement, pass. Step 5: commit `feat(miya): ElevenLabs voice-overs with their own caption timing`.

### Task 4: Sound effects

**Files:** modify `contentTypes.ts` (`STEP_ORDER`: `sfx` after `music`), `contentStepAgents.ts` (Miya `creative_sfx`), `joseEffects.ts`, `joseTemplates.ts` (step `sfx` needs `music`; `assemble` needs `sfx`; template 20 steps), `contentProjectPlan.ts` (`sfx` step `spend` + `SFX_WAIT_PAID(max, usd)` = `` `Make up to ${max} sound effects, about $${usd.toFixed(2)} at most.` ``), `contentStepPrompts.ts` (`creative_sfx`: `{ effects: [{ sceneId, text, seconds }] }`, at most one per scene, 0.5–30 s), `contentMediaExecutor.ts` (`runSfx`; Assemble passes `sfx`), `src-tauri/src/media_tools.rs` (`AssemblySpec.sfx: [{ path, atSec }]`, mixed at −12 dB, checked by `missing_input`), `src/components/miya/SceneBuilderTab.tsx` (each effect with a player). Tests: `contentSfx.test.ts`, media_tools Rust tests, step-count tests.

- [ ] Step 1: failing tests — `Miya's effects are kept to one per scene and 0.5–30 s`; `approved, each effect is made and saved as audio/sfx-v<n>-<scene>.wav, spend recorded per effect`; `without ElevenLabs the step is skipped with the reason`; Rust `effects are mixed under the voice at their start, -12 dB` (filter contains `adelay` and `volume=0.25`); `the template has 20 steps and Assemble needs Sound effects`.
- [ ] Steps 2–4: fail, implement, pass. Step 5: commit `feat(miya): sound effects from ElevenLabs, mixed under the voice`.

### Task 5: Higgsfield in the backend and Connectors

**Files:** Create `src-tauri/src/higgsfield.rs` (register), `src/services/connectors/higgsfieldConnector.ts`; modify registry, policy (paid, high risk), `ConnectorSetupPanel.tsx` (Higgsfield: key id, key secret, picture model id, clip model id, each with an "Extra settings (JSON)" box, example ids as placeholders, a Console link, Test). Tests: Rust in `higgsfield.rs`, `src/test/connectors/higgsfieldConnector.test.ts`.

**Interfaces — produces:**
- `HiggsfieldJob { model, prompt, imagePath?: String, seconds?: f64, aspect?: "16:9" | "9:16" | "1:1" | "4:5", extra?: Value }` → `request_body(job, image_url) -> Result<Value, String>` (common fields merged with `extra`; `extra` must be an object and may not set `prompt`/`image_url`, else "Extra settings must be a JSON object and can't replace the prompt or picture.").
- Commands: `higgsfield_estimate({ job, keys? }) -> { ok, usd?, reason? }` (uploads nothing: an image placeholder URL is not sent; the estimate uses the same body with `image_url` omitted when the model allows, else the uploaded URL — builder checks), `higgsfield_run({ job, workspaceRoot, outPath, keys? }) -> { ok, status: 'done'|'failed'|'pending', path?, requestId?, usd?, reason? }` (upload → submit → poll up to 15 min → download to `outPath` (never over an existing file) → `DELETE /requests/{id}`; `pending` with `requestId` after 15 min), `higgsfield_check({ requestId, workspaceRoot, outPath, keys? })` (fetch a pending result later), `higgsfield_test({ model, extra?, keys? })`.
- TS: `higgsfieldAvailable(): { ok; reason? }` (keys set, Zero-Cost Mode off), `higgsfieldModels(): { picture?: string; clip?: string; pictureExtra?: object; clipExtra?: object }`.

- [ ] Step 1: failing tests — `the request merges the extra settings` and Review Focus 2 (`extra that isn't an object, or sets the prompt, is refused`); `the upload sends only the returned headers, never the keys` (built request for `PUT`); `a result is downloaded and never written over`; `errors never carry the keys`; `a pending request is fetched later by its id` (Review Focus 1, with a stubbed status); TS paid-connector gate.
- [ ] Steps 2–4: fail, implement, pass. Step 5: commit `feat(connectors): Higgsfield in the backend, estimate first`.

### Task 6: Higgsfield pictures

**Files:** modify `src/services/contentFactory/contentImages.ts` (scene pictures, thumbnail backgrounds, carousel pictures: `resolvePictures()`; Higgsfield through `higgsfield_run` with the picture model, aspect per piece), `contentProjectPlan.ts` (Scenes/Thumbnail/Carousel get `spend` and a `PICTURES_WAIT_PAID(n, usd)` from `higgsfield_estimate` × pieces when Higgsfield is chosen; estimate failure → free engine, Review Focus 5), `contentStepRecorder.ts` (pending Higgsfield pictures kept with `requestId` and fetched by "Check again"). Tests: `contentImagesHiggsfield.test.ts`.

- [ ] Step 1: failing tests — `approved, scene pictures come from Higgsfield with the brand's look`; `the headline is still drawn by Alphonso`; `not approved → ComfyUI with the note`; Review Focus 4 (Zero-Cost Mode); `a pending picture keeps its request id and Check again fetches it`.
- [ ] Steps 2–4: fail, implement, pass. Step 5: commit `feat(miya): Higgsfield pictures as an extra option`.

### Task 7: Higgsfield AI clips (scenes and Shorts)

**Files:** modify `clipEngine.ts` (`engine: 'local' | 'runway' | 'higgsfield' | null`), `contentMediaExecutor.ts` (`runClips` Higgsfield branch; `checkPendingClips` handles Higgsfield `requestId`), `shortMaker.ts` (Shorts' Higgsfield clips), `contentProjectPlan.ts` (generalise `CLIPS_WAIT_PAID` / `SHORTS_WAIT_PAID` to the paid engine's name and estimate), `AiClipsPanel.tsx` and `ShortsStudioTab.tsx` (Higgsfield in the engine lists, with the estimate), `stepGraph.ts`. Tests: `contentClipsStep.test.ts`, `contentShortsRunway.test.ts` (→ paid engines), `shortMaker.test.ts`.

- [ ] Step 1: failing tests — `Higgsfield makes the chosen scenes' clips when approved, each from the scene's picture`; `the wait text names the engine and its estimate` (`"… Higgsfield cost …"`); `Shorts can use Higgsfield clips, asked once per run`; `a clip still running on Higgsfield is fetched by Check again`.
- [ ] Steps 2–4: fail, implement, pass. Step 5: commit `feat(miya): Higgsfield AI clips for scenes and Shorts`.

### Task 8: Asking for Higgsfield by name

**Files:** modify `src/services/creativeRoutingService.ts` (`detectCreativeIntent` → `higgsfield_picture` / `higgsfield_video` when the text names Higgsfield), `src/services/jose/submitToJose.ts` shortcut (one Miya step `creative_higgsfield`, `spend`, `costEstimateUsd` from the estimate), `src/services/contentFactory/higgsfieldByName.ts` (the executor: run, save to `<output>/Higgsfield/<YYYY-MM-DD>/`, list for Quick package), `joseEffects.ts`, `ChatView.tsx` (picture or player in the reply), `telegramCompanionService.js` (file under 50 MB, else the folder), `MiyaStudio.tsx` Quick package (the list). Tests: `higgsfieldByName.test.ts`, routing tests, Telegram test.

**Interfaces — produces:** `HIGGSFIELD_NOT_SET_UP` = "Higgsfield isn't set up: add your keys and a model id in Settings → Connectors → Higgsfield. Nothing was started."; `listHiggsfieldResults(): { path, kind, prompt, atMs }[]` (`alphonso_higgsfield_results_v1`).

- [ ] Step 1: failing tests — `"make a Higgsfield video of a pour" becomes one Miya step that asks with the estimate`; `not set up → the plain reply and nothing started`; `the result is saved under Higgsfield/<date>/ and listed`; Telegram `the file is sent when small, else the folder`.
- [ ] Steps 2–4: fail, implement, pass. Step 5: commit `feat(miya): ask for Higgsfield by name anywhere`.

### Task 9: Desktop spec, docs, checks, PR

- [ ] Step 1: `e2e-desktop/specs/content-paid-engines.e2e.mjs` (nothing paid is sent): the Brands tab saves an ElevenLabs voice choice (backend list stubbed by an unset key → the "set up" message) and a Higgsfield pictures choice; with Zero-Cost Mode on, a Scenes run falls back to ComfyUI with the note; Connectors → Higgsfield refuses Extra settings that aren't a JSON object. `node --check`.
- [ ] Step 2: docs — CLAUDE.md rows (ElevenLabs, Higgsfield, engine choice, sound effects, by name; connectors 33), CHANGELOG, DEFERRED_WORK (4b open items: not checked with real accounts; 4c next), QA (spec row; ElevenLabs and Higgsfield in the live check), desktop counts.
- [ ] Step 3: all checks (as in phase 4a), full suite, self-review, commit, PR, merge when green.
