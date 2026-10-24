# Miya content factory phase 2a: the finished video file — Implementation Plan

> **Status (2026-10-25):** built and merged in PR #343 (phase 2a); on `main`, not released yet (2.10.0 isn't tagged). What it leaves open is in `docs/governance/DEFERRED_WORK.md`; the current behaviour is described in `CLAUDE.md`'s Do Not Duplicate rows and `docs/USER_MANUAL.md` section 8.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Miya Studio project ends with a voice-over, music, stock footage and the scene pictures cut together with captions into a checked 16:9 and 9:16 MP4 in the project folder.

**Architecture:** Four new factory steps (Voice, Music, B-roll, Assemble) join the Content video template and run inside the project's one Jose request. Their executors call fixed backend commands (no shell, fixed arguments): Kokoro and MusicGen run one-shot Python scripts in their Runtime Hub environments, stock clips download through a host-allowlisted backend command, and assembly builds an ffmpeg command from a validated spec with the bundled ffmpeg.

**Tech Stack:** TypeScript/React, Rust (Tauri 2), Python (Kokoro, AudioCraft), ffmpeg (bundled LGPL build), Vitest, cargo test, WebdriverIO desktop E2E.

**Spec:** `docs/superpowers/specs/2026-10-23-miya-content-factory-phase2a-design.md` (and `2026-10-22-miya-content-factory-design.md` §6).

## Global Constraints

- ffmpeg is bundled: an **LGPL** build only (BtbN `win64-lgpl` static, a dated release, pinned URL and SHA-256), with its license notice shown in the app. Windows first; elsewhere ffmpeg comes from the PATH (or Runtime Hub's prerequisite install).
- Kokoro is a Runtime Hub tool; its model files download on first use and are checked against pinned SHA-256s.
- Stock footage uses whichever of Pexels, Pixabay and Coverr have keys; none → the scene pictures only, said in the step's note.
- No silent fallback: a missing tool fails or skips the step with a note naming what to install.
- No command that takes arbitrary ffmpeg/Python arguments from the window; every backend command builds its own arguments from a checked spec; every path stays inside the project folder.
- Every new `Command::new` uses `no_window()` / `no_window_async()` (CI lint).
- Captions only contain the script's words. Every stock clip records source, author and license link.
- Keep stored line endings; no hardcoded paths, models or voices (brands keep `voice.voiceId`).

## Review Focus

1. A scene with no stock clip and no picture (ComfyUI was off) must still get a screen (a plain brand-colour card with its on-screen text), not a broken assembly.
2. A script whose spoken lines are empty for a scene (music-only scene) must get a duration from the scene plan, not 0 seconds.
3. Text with quotes, colons or line breaks in captions must not break the ffmpeg subtitle filter (write an SRT file; never inline text in filter arguments).
4. A project folder path with spaces or non-ASCII letters must work for every command.
5. Re-running Assemble must write a new version (`v2-…`) and never overwrite v1.

---

### Task 1: Bundled ffmpeg

**Files:** Create `scripts/fetch-ffmpeg.mjs`, `src-tauri/src/media_tools.rs`; modify `src-tauri/tauri.conf.json` (resources `vendor/ffmpeg` → `ffmpeg`), `src-tauri/src/lib.rs` (module + commands), `.github/workflows/ci.yml` and `release.yml` (Windows build jobs run the fetch script next to `fetch-ollama-runtime.mjs`), `.gitignore` (`src-tauri/vendor/ffmpeg/`); test `src-tauri/src/media_tools.rs` (unit tests), `src/test/scripts/fetchFfmpeg.test.js`.

**Interfaces:**
- Produces: Rust `media_tools::ffmpeg_path() -> Option<PathBuf>` / `ffprobe_path()` (bundled resource first, then PATH); Tauri command `media_tools_status() -> { ffmpeg: Option<String>, ffprobe: Option<String>, kokoro: bool, audiocraft: bool, whisper: bool }`; `FFMPEG_LICENSE_TEXT` shown in Settings → About (Task 8 UI).

- [ ] Tests: fetch script "pins a dated LGPL win64 build and its SHA-256" (reads the script's constants: URL contains `win64-lgpl`, not `latest`, a 64-hex checksum); Rust `ffmpeg_path` prefers the bundled path when present, falls back to PATH, `None` when neither.
- [ ] Implement: the script downloads the zip, checks SHA-256, extracts `bin/ffmpeg.exe`, `bin/ffprobe.exe` and `LICENSE.txt` into `src-tauri/vendor/ffmpeg/` (skips when present and matching). Pick the newest dated BtbN release at implementation time and pin it.
- [ ] Run `cargo test media_tools`, `npx vitest run src/test/scripts/fetchFfmpeg.test.js`, `node scripts/fetch-ffmpeg.mjs` (real download once), `cargo clippy -- -D warnings`, `npm run -s verify:no-window-coverage` → pass.
- [ ] Commit `feat(media): bundle an LGPL ffmpeg build`.

### Task 2: Kokoro as a Runtime Hub tool, and speaking a script

**Files:** Modify `src-tauri/src/runtime_manager.rs` (ToolDef `kokoro`: pip `kokoro-onnx` pinned + `soundfile`, no port; model download step with pinned SHA-256s for `kokoro-v1.0.onnx` and `voices-v1.0.bin` from `thewh1teagle/kokoro-onnx` release `model-files-v1.0`, `.part` then rename, like ComfyUI's starter model; `TOOL_META` in `RuntimeManagerView.tsx`: `usedBy: 'Miya (Voice step)'`); create `voice/content/kokoro_speak.py`, Rust command `content_tts_kokoro` in `media_tools.rs`; bundle `voice/content/*.py` like Voice OS's backend.

**Interfaces:**
- Produces: `content_tts_kokoro({ workspaceRoot, outDir, voiceId, speed, lines: [{ id, text }] }) -> { ok, files: [{ id, path, durationSec }], error? }` (relative paths under `outDir`; one WAV per line; refuses paths outside the workspace; `voiceId` must match `[a-z]{2}_[a-z]+`).

- [ ] Tests: Rust "refuses a path outside the workspace", "refuses a voice id that is not a plain name", "builds the script arguments without the line text" (text goes through a JSON file, never argv); Python `voice/content/tests/test_kokoro_speak.py` with a stubbed Kokoro class: writes one WAV per line and a JSON with durations.
- [ ] Implement; the command runs the tool's venv Python with the script, `no_window_async`, a 10-minute cap.
- [ ] Run `cargo test media_tools`, `python -m pytest voice/content/tests` → pass.
- [ ] Commit `feat(voice): Kokoro in Runtime Hub, and speaking a script's lines`.

### Task 3: Music from AudioCraft

**Files:** create `voice/content/musicgen_generate.py`; Rust command `content_music_generate` in `media_tools.rs`.

**Interfaces:**
- Produces: `content_music_generate({ workspaceRoot, outPath, prompt, seconds }) -> { ok, path?, durationSec?, error? }` (MusicGen small; `seconds` 5–300; prompt ≤ 300 characters through a JSON file; refuses paths outside the workspace; `{ ok: false, error: 'AudioCraft is not installed. Install it in Runtime Hub.' }` when its venv is missing).
- Consumes: the app calls `freeOllamaGpuMemory()` before it.

- [ ] Tests: Rust argument and path checks; the not-installed message; Python test with a stubbed MusicGen.
- [ ] Implement; 20-minute cap; CPU fallback says "slow" in its output.
- [ ] Run tests → pass. Commit `feat(audio): music beds from AudioCraft`.

### Task 4: Stock footage connectors and downloads

**Files:** create `src/services/connectors/stockFootageConnector.ts`; modify `connectorRegistry.js` (`pexels`, `pixabay`, `coverr`: free, low risk), `ConnectorSetupPanel.tsx` (a key field each, in Content & Productivity), `policyEnforcementService.ts` (not paid); Rust command `content_download_media` in `media_tools.rs`.

**Interfaces:**
- Produces: `searchStockClips(query: string, options: { orientation: 'landscape' | 'portrait'; minSeconds: number }): Promise<StockClip[]>` with `StockClip { source: 'pexels' | 'pixabay' | 'coverr'; id: string; url: string; durationSec: number; width: number; height: number; author: string; pageUrl: string; license: string }` (Pexels `GET https://api.pexels.com/v1/videos/search` with header `Authorization: <key>`; Pixabay `GET https://pixabay.com/api/videos/?key=…&q=…`; Coverr `GET https://api.coverr.co/videos?query=…&urls=true` with `Authorization: Bearer <key>`, and the required `PATCH /videos/:id/stats/downloads` after a download); `configuredStockSources(): string[]`. Searches go through the backend's existing `fetch_url_content` path or a new narrow command (the window cannot reach these hosts).
- `content_download_media({ workspaceRoot, url, relPath }) -> { ok, path?, bytes?, error? }`: https only, hosts `videos.pexels.com`, `player.vimeo.com` (Pexels files), `cdn.pixabay.com`, `storage.coverr.co`, `cdn.coverr.co`; each redirect re-checked (`fetch_with_ssrf_guard`); 300 MB cap; `.part` then rename.

- [ ] Tests: each source's request shape and response mapping (mocked fetch); "with no keys, no source is searched"; Rust host allowlist and size cap.
- [ ] Implement. Run tests. Commit `feat(content): stock footage from Pexels, Pixabay and Coverr`.

### Task 5: Captions matched to the script

**Files:** create `src/services/contentFactory/contentCaptions.ts`; test `src/test/services/contentFactory/contentCaptions.test.ts`.

**Interfaces:**
- Produces: `alignCaptions(scriptWords: string[], heard: { word: string; start: number; end: number }[]): { word: string; start: number; end: number }[]` (every output word is a script word; unheard words get times between their neighbours); `captionsFromLines(lines: { text: string; start: number; end: number }[]): same` (fallback without Whisper: words spread over each line); `toSrt(words, { maxWords: 6, maxSeconds: 2.5 }): string`.

- [ ] Tests: a misheard word ("there" for "their") shows the script's word; a word Whisper missed gets a time between neighbours; quotes, colons and line breaks survive in the SRT (Review Focus 3); groups never exceed 6 words or 2.5 s.
- [ ] Implement (word-level alignment by normalised text, greedy with a look-ahead of 3). Run tests. Commit `feat(content): captions that only use the script's words`.

### Task 6: Assembly

**Files:** Rust `content_assemble_video` in `media_tools.rs` (`build_assembly_args(spec) -> Vec<Vec<String>>`, pure and tested; then run, ffprobe, frame grabs).

**Interfaces:**
- Produces: `content_assemble_video(spec: { workspaceRoot, outDir, version, scenes: [{ clip?: rel, picture?: rel, card?: { text, color }, seconds }], voice: rel, music?: rel, srt: rel, captionColor, outlineColor }) -> { ok, outputs: [{ aspect: '16x9' | '9x16', path, durationSec, frames: [rel; 3] }], error? }` writing `outDir/v<version>-16x9.mp4`, `v<version>-9x16.mp4`, frames `v<version>-<aspect>-<10|50|90>.jpg`.

- [ ] Tests (Rust, on the argument builder): a clip is trimmed to its scene's seconds and scaled/cropped to the aspect; a picture gets a slow zoom; a scene with neither gets a colour card with its text through a file, not inline (Review Focus 1, 3); music is ducked under the voice and the mix normalised to −14 LUFS; subtitles come from the SRT path; paths with spaces and non-ASCII letters are passed as separate arguments (Review Focus 4); an existing `v1` is never written over (Review Focus 5).
- [ ] Implement; checks after writing: ffprobe duration within 1 s of the voice, video and audio streams present; failure → `{ ok: false, error }` naming the check.
- [ ] Run `cargo test media_tools`, clippy, no-window lint; one real run on a small fixture in `src-tauri/tests/fixtures/` (two pictures, one WAV) → both MP4s play. Commit `feat(content): assemble the finished video`.

### Task 7: The four steps in the project

**Files:** modify `contentTypes.ts` (`StepId` adds `voice`, `music`, `broll`, `assemble`; `STEP_ORDER`: brief, research, script, review, scenes, thumbnail, voice, music, broll, assemble, campaign, quality), `contentStepAgents.ts`, `jose/joseTemplates.ts` (template steps `voice`, `music`, `broll`, `assemble` after `thumbnail`, campaign needs `assemble`), `contentProjectPlan.ts` (`CONTENT_TEMPLATE_STEPS`), `jose/joseEffects.ts` if needed; create `contentFactory/contentMediaExecutor.ts`; modify `contentAgentExecutor.ts` (dispatch the four action types to it), `contentProjectService.ts` migration (older projects gain the four steps as `not_started`).

**Interfaces:**
- Produces: `executeMediaStep(assignment): Promise<ContentStepResult>` for `creative_voice` (spoken lines from the chosen script → `content_tts_kokoro`; a scene with no spoken line gets the scene plan's seconds, Review Focus 2), `creative_music` (Miya's model writes a mood prompt from the brief; `freeOllamaGpuMemory()`; `content_music_generate`; not installed → step `done` with output `{ skipped: 'AudioCraft is not installed…' }`), `research_broll` (per scene: search words from the scene plan, the best clip by orientation and length from `searchStockClips`, downloaded with `content_download_media`; no keys → `{ skipped: 'No stock footage keys are set…' }`), `runtime_assemble_video` (Whisper word times on the voice track when installed, else `captionsFromLines` with a note; SRT; `content_assemble_video`). Each returns `content_step_output` data the recorder saves.

- [ ] Tests: each executor with the backend mocked: voice lines and durations; music skipped when not installed; B-roll skipped with no keys; assemble passes the chosen pictures/clips/voice/music/SRT and saves the outputs; a missing Kokoro fails Voice with "Install Kokoro in Runtime Hub." Template tests updated (15 steps, checkPlan ok, scenes still waits for the review).
- [ ] Run `npx vitest run src/test/services/contentFactory/ src/test/services/jose/` → pass. Commit `feat(content): Voice, Music, B-roll and Assemble steps`.

### Task 8: Miya Studio shows the video

**Files:** modify `SceneBuilderTab.tsx` (Voice, Music, B-roll and Assemble step panels; audio players; the two videos with a player; the three frames; each clip's source and license link), `src-tauri/tauri.conf.json` + backend (asset protocol enabled and scoped at runtime to the Settings output folder), `SettingsView.tsx` About (ffmpeg license notice), `RuntimeManagerView.tsx` (`TOOL_META` for kokoro and audiocraft `usedBy`).

- [ ] Tests: SceneBuilderTab shows the four steps, a `video` element per output with its `src` from the asset URL helper, the frames, and "Pexels: <author>" with the license link; a skipped step shows its note.
- [ ] Run tests → pass. Commit `feat(miya): the finished video in the Scene Builder`.

### Task 9: Docs, real app, PR

- CLAUDE.md (rows: bundled ffmpeg, Kokoro tool, music, stock footage connectors (connector count), captions, assembly, the four steps; desktop counts), CHANGELOG, DEFERRED_WORK (phase 2b: AI clips; macOS/Linux ffmpeg bundling), QA coverage, counts, dnd map; README third-party notices (ffmpeg LGPL, Kokoro Apache-2.0, MusicGen weights' license, stock sources' terms).
- Desktop: `e2e-desktop/specs/content-video.e2e.mjs` — a project with an approved script and scenes (seeded) runs Voice (skipped if Kokoro is not installed), Music (skipped if AudioCraft is not), B-roll (skipped without keys) and Assemble with the bundled ffmpeg; both MP4s exist, ffprobe durations match, the Scene Builder shows the players. Plus `content-project`, `content-factory`, `smoke`.
- Self-review; PR; merge when green.
