# Miya content factory phase 3d Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shorts become their own pieces (mini-script, highlight, plain cut; chosen per Short) that fit each platform's length limits, plus the folded-in fixes.

**Architecture:** A `shorts` content step (Miya) plans N Shorts in one answer, then makes each one's 9:16 file in turn through the existing 2a/2b commands (Kokoro, ComfyUI, clips, `content_assemble_video` limited to 9:16) or a new trim-and-hook command for highlights and cuts. Shorts become posts through `buildPosts()` on the platforms ticked per Short; one limits table decides what each platform takes.

**Tech Stack:** React + TypeScript, Vitest, Tauri 2 / Rust (ffmpeg job building), WebdriverIO desktop specs.

**Spec:** `docs/superpowers/specs/2026-10-24-miya-content-factory-phase3d-design.md`

## Global Constraints

- Limits (checked 2026-10-24): **YouTube Short** square or vertical, **≤ 180 s** (longer or wide: a regular video); **Facebook Reel 3–90 s**; **Instagram Reel 3 s – 15 min, ≤ 300 MB**.
- A Short is **30–60 s**; hook **≤ 12 words**; number of Shorts = the number in What to make ("3 Shorts"), else **1**.
- Kinds: `mini` (default for a new Short), `highlight`, `cut`. Highlight: original audio about **−12 dB** under the hook line, hook text shown for the hook's length.
- Small card: graphics memory **under 8 GB** → AI clips at the model's lower resolution and **≤ 3 s**; override "Full size clips on this card".
- One making path, one publishing path, one runner, one calendar; ffmpeg only through job files (no shell, no text on a command line); pictures and clips one at a time.
- Files under `<project>/shorts/<short-id>/` (`pictures/`, `clips/`, `voice/`, `v<n>.mp4`), never overwritten.
- Windows first; English; plain words on screen.

## Review Focus

1. **A finished video shorter than the moment Miya picked** (or a moment past the end) — the cut is clamped to the video and refused when under 3 s. Test in Task 6.
2. **"3 Shorts" written as "three shorts", "Shorts x3", "a short"** — the count reads digits and the words one–five, else 1. Test in Task 3.
3. **A Short unticked from every platform** — no posts, and Shorts Studio says it won't be posted. Test in Task 8.
4. **Redo of one Short while another is being made** — refused with "Making another Short…" instead of two runs on the GPU. Test in Task 7.
5. **An older project with the campaign's single `short` copy and no Shorts** — still posts its 9:16 as before (within the limits). Test in Task 2.

---

### Task 1: Folded-in leftovers and CodeQL

**Files:**
- Modify: `src/services/contentFactory/dailyLimits.ts`, `src-tauri/src/oauth_signin.rs` (`oauth_finish_pasted`), `src/services/contentFactory/publishPost.ts` (no route → hand), `src/services/claudeService.ts`, `src/services/chatgptService.ts`, `src-tauri/src/meta_video.rs` (`meta_instagram_limit`).
- Test: `dailyLimits.test.ts`, `oauth_signin.rs` tests, `publishPostByLink.test.ts`, `claudeService`/`chatgptService` tests.

**Interfaces:** Produces `fn take_pending_if(service, pasted, now) -> Result<(String /*code*/, String /*verifier*/), String>` in `oauth_signin.rs` (pure over a `&mut Option<Pending>`: keeps the pending sign-in when the address doesn't parse).

- [ ] **Step 1: Failing tests** — `Facebook photo posts don't count toward the 30 Reels` (30 sent carousels → a Reel is still `ok`); `a wrong pasted address keeps the sign-in for another try` (Rust, `take_pending_if` with a bad address leaves it `Some`, a good one takes it); `with no Instagram route, a post is saved to post by hand` (route null, storage absent → `by_hand`); for the CodeQL alerts: the ids/nonces at the flagged lines come from `crypto.randomUUID()` / `crypto.getRandomValues` (test: the module calls `crypto.randomUUID`, mocked), and `meta_instagram_limit` builds its URL through a checked numeric id (`numeric_id()`), test `instagram_limit_uses_a_checked_id`.
- [ ] **Step 2:** Run the named tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Read each CodeQL alert's flagged line before changing it; if one is a false alarm after the change, say why in a one-line comment.
- [ ] **Step 4:** Run them (Rust in the 4551 retry loop). Expected: PASS; Clippy clean.
- [ ] **Step 5:** Commit `fix: phase 3c leftovers and the open CodeQL alerts`.

### Task 2: Platform limits for every vertical post

**Files:**
- Create: `src/services/contentFactory/platformLimits.ts`
- Modify: `contentPosts.ts` (`buildPosts`: the long video's 9:16 posts within the limits, with notes), `publishPost.ts` (refuse before sending), `src-tauri/src/meta_video.rs` (Instagram file cap 300 MB).
- Test: `platformLimits.test.ts`, `contentPosts.test.ts`, `publishPost.test.ts`.

**Interfaces:** Produces `PLATFORM_LIMITS`; `fitsPlatform(platform: PostPlatform, piece: ProjectPost['piece'], seconds: number | null, bytes?: number | null): { ok: boolean; asRegularVideo?: boolean; reason?: string }` (YouTube over 180 s → `ok: true, asRegularVideo: true`; reasons like "Not a Facebook Reel: it is 4:12 long; Facebook takes 3–90 seconds."); `formatSeconds(s) => "4:12"`. `ProjectPost.seconds?: number`.

- [ ] **Step 1: Failing tests** — boundaries: Facebook 2.9 s ✗, 3 s ✓, 90 s ✓, 90.1 s ✗; YouTube Short 180 s ✓ (Short), 180.1 s ✓ `asRegularVideo`; Instagram 15:00 ✓, 15:00.1 ✗, 300 MB ✓, 300 MB + 1 ✗; `seconds: null` → ok (unknown); `buildPosts skips a Facebook Reel over 90 s with a note and marks a YouTube Short over 3 minutes as a regular video`; `an older project with the campaign's short copy still posts its 9:16 version` (Review Focus 5); `publishPost refuses a post that doesn't fit, before sending` (no platform call).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement; `buildPosts` copies the assembled `durationSec` into each vertical post's `seconds`.
- [ ] **Step 4:** Run `npx vitest run src/test/services/contentFactory` and the Rust Meta tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(miya): every vertical post fits its platform's length`.

### Task 3: The Shorts step and its plan

**Files:**
- Modify: `contentTypes.ts` (`StepId` `'shorts'` after `'assemble'` in `STEP_ORDER`; `ShortKind`; `ShortPlan`; `ShortsSettings`; `ContentProject.shortsSettings?`), `contentStepAgents.ts` (`shorts: [{ agent: 'miya', actionType: 'creative_shorts', title: 'Shorts' }]`), `contentStepPrompts.ts` (prompt, validator, repair), `contentProjectPlan.ts` (`briefWantsShorts()`, `shortsCount()`, inclusion), `joseTemplates.ts` (step `shorts` needs `assemble`; 19 steps), `joseEffects.ts` (`creative_shorts: ['write_own_work']`), `contentProjectService.ts` (`getShortsSettings`/`setShortsSettings`, `setShortPlatforms`, `setShortKind`), `StepPanel.tsx` label "Shorts".
- Test: `contentShorts.test.ts`, updates to `contentProjectPlan.test.ts` / `contentClipsStep.test.ts` (template count 19).

**Interfaces:**
- `type ShortKind = 'mini' | 'highlight' | 'cut'`
- `interface ShortPlan { id: string /* sh1… */; kind: ShortKind; title: string; hook: string; seconds: number; platforms: PostPlatform[]; copy: { platform: PostPlatform; title?: string; caption: string; hashtags: string[] }[]; parts?: { spoken: string; imagePrompt: string; seconds: number }[] /* mini */; moment?: { startSec: number; endSec: number } /* highlight, cut */ }`
- `interface ShortsSettings { aiClips: 'main' | 'every' | 'none'; clipEngine: 'local' | 'runway' | null }` (default `{ aiClips: 'none', clipEngine: null }` — builder's call: fast and free until chosen)
- `briefWantsShorts(brief): boolean` (What to make or format mentions short(s) or reel(s)); `shortsCount(brief): number`.

- [ ] **Step 1: Failing tests** — `shortsCount reads "3 Shorts", "three shorts", "Shorts x2", "a short", else 1` (Review Focus 2); `briefWantsShorts reads outputs and format`; `parseStepAnswer keeps 30–60 s Shorts, cuts hooks to 12 words, numbers them sh1…, defaults the kind to mini and the platforms to the project's`; `a mini Short needs parts with spoken words and picture prompts; a highlight or cut needs a moment`; `Run project includes the Shorts step only when the brief asks for Shorts or Reels`; `the template has the shorts step after assemble`; `making Shorts does not put the finished video or the carousel out of date` (order check like 3c's).
- [ ] **Step 2:** Run `npx vitest run src/test/services/contentFactory src/test/services/jose`. Expected: new tests FAIL.
- [ ] **Step 3:** Implement. The prompt gives Miya the finished video's length and its script with times (so moments are real), the project's platforms, and the count.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(miya): Miya plans the Shorts`.

### Task 4: Small graphics cards, and the Runway estimate on full runs

**Files:**
- Modify: `src-tauri/src/comfyui_video_models.rs` (`small_card(vram_gb) -> bool` under 8.0; the models list reports `smallCard`), `src/services/videoModelService.ts` (`getFullSizeClips()`/`setFullSizeClips()`, key `alphonso_full_size_clips_v1`; `clipSizeFor(info) => { lowRes: boolean; maxSeconds: number }`), `src/services/contentFactory/comfyVideoClip.ts` (`buildVideoWorkflow` takes `lowRes`; `makeComfyClip` uses `clipSizeFor`), `src/components/VideoModelsPanel.tsx` (the note and the switch), `src/services/contentFactory/contentStepRecorder.ts` (when Scenes saves, set the waiting clips step's estimate), `src/services/jose/joseRequestStore.ts` (`setStepCostEstimate(requestId, stepId, usd)` if none exists).
- Test: Rust `small_card_under_8gb`; `videoModelService.test.ts`; `comfyVideoClip.test.ts` (low-res size and 3 s); `contentStepRecorder.test.ts` (`Scenes saving fills in the clips step's Runway estimate on the request`); `VideoModelsPanel.test.tsx`.

**Interfaces:** Produces `clipSizeFor(info: { smallCard: boolean }): { lowRes: boolean; maxSeconds: number }` (small card and not overridden → `{ lowRes: true, maxSeconds: 3 }`); Task 7 uses it.

- [ ] **Step 1:** Failing tests as listed.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement (lower resolution = 512×288 / 288×512 for LTX-Video, 640×352 / 352×640 for Wan 2.2: builder's call within each template's multiples).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(miya): smaller AI clips on small cards; the Runway cost on full runs`.

### Task 5: A vertical-only assembly

**Files:**
- Modify: `src-tauri/src/media_tools.rs` (`AssemblySpec.aspects: Option<Vec<String>>`, default both; `build_assembly_runs` loops the chosen ones; `out_name` for a Short `v<n>.mp4` via `AssemblySpec.output_stem: Option<String>`).
- Test: Rust `assembly_can_make_only_the_9x16_version`, `assembly_names_a_shorts_file`.

**Interfaces:** Produces: spec fields `aspects: ['9x16']`, `outputStem: 'v1'` → output `<outDir>/v1.mp4` (no aspect suffix). Task 7 uses them.

- [ ] Steps 1–5 in the same order (failing Rust tests → implement → pass + Clippy → commit `feat(media): assemble only the 9:16 version, for Shorts`).

### Task 6: Highlight and cut Shorts (Rust)

**Files:**
- Modify: `src-tauri/src/media_tools.rs` — command `content_cut_short(spec)`.
- Test: Rust tests in the same file.

**Interfaces:** `CutShortSpec { workspaceRoot, source /* the finished 9:16 */, sourceSeconds, startSec, endSec, outPath, hookVoice?: string /* wav */, hookSeconds?: f64, hookSrt?: string, captionColor?, outlineColor? }` → `{ ok, path, durationSec, frames, reason? }`. Pure helpers: `clamp_moment(start, end, source_seconds) -> Result<(f64, f64), String>`; `build_cut_runs(spec) -> Vec<FfmpegRun>` (trim with `-ss/-t`; with a hook: `volume=0.25` (≈ −12 dB) for the hook's span via `enable='between(t,0,H)'`, `amix` with the hook wav, subtitles from the hook SRT by file name).

- [ ] **Step 1: Failing tests** — `a moment past the end is clamped to the video; under 3 s is refused` (Review Focus 1); `a cut is a plain trim`; `a highlight lowers the original under the hook and burns the hook text from its file`; `no text reaches the command line` (the hook text appears in no argument); `the output is never written over` (existing `outPath` refused).
- [ ] **Step 2–5:** run (FAIL) → implement with the existing ffprobe check and three frames → run (PASS) + Clippy → commit `feat(media): highlight and cut Shorts from the finished video`.

### Task 7: Making the Shorts

**Files:**
- Create: `src/services/contentFactory/shortMaker.ts`
- Modify: `contentStepRecorder.ts` (after the Shorts step saves: `makeShorts()`, the step stays "running"), `contentProjectService.ts` (`setShortOutput(projectId, shortId, output)` into the chosen version's `made` map).
- Test: `shortMaker.test.ts`.

**Interfaces:**
- `makeShorts(projectId, settings, onProgress?): Promise<ShortOutput[]>`; `redoShort(projectId, shortId, settings): Promise<ShortOutput | { ok: false; reason: string }>`.
- `interface ShortOutput { shortId: string; status: 'done' | 'failed' | 'pending'; path?: string; seconds?: number; frames?: string[]; reason?: string; pictures?: PictureResult[]; clips?: ClipOutcome[] }`.
- Mini: pictures (`generateComfyUiImage`, 9:16 size, the brand's look), clips per `getShortsSettings()` with `clipSizeFor`, voice (`content_tts_kokoro`, one line per part), captions (Whisper when installed, else by line), the project's music bed if any, then `content_assemble_video` with `aspects: ['9x16']`, `outputStem: 'v<n>'`, `outDir: <project>/shorts/<id>`. Highlight: the hook through Kokoro, its SRT, then `content_cut_short`. Cut: `content_cut_short` with no hook.

- [ ] **Step 1: Failing tests** — `a mini Short makes its pictures, voice and a 9:16 file in its own folder`; `a highlight speaks the hook and cuts the moment`; `a cut only cuts`; `one Short failing does not stop the others`; `Redo makes that Short again as a new version file`; `Redo while another Short is being made is refused` (Review Focus 4: "Making another Short…"); `no finished video: highlights and cuts say to make it first; mini Shorts still work`.
- [ ] **Step 2–5:** run (FAIL) → implement (commands mocked in tests) → run `npx vitest run src/test/services/contentFactory` (PASS) → commit `feat(miya): make each Short (mini-script, highlight, cut)`.

### Task 8: Shorts as posts

**Files:**
- Modify: `contentPosts.ts` (`buildPosts`: for each made Short, a post per ticked platform — YouTube `piece: 'short'`, Instagram/Facebook `'reel'` — with the Short's copy, its `seconds`, the limits, `shortId`), `contentTypes.ts` (`ProjectPost.shortId?`), `contentPostMoves.ts`/`calendarItems.ts` (label "Short n").
- Test: `contentPosts.test.ts`, `calendarItems.test.ts`.

- [ ] **Step 1: Failing tests** — `each made Short is posted on the platforms ticked for it, with its own copy`; `a Short unticked from every platform makes no posts and is noted` (Review Focus 3); `Shorts and the long video's 9:16 posts are spread over the brand's next free times`; `a Short not made yet gives a note, not a post`.
- [ ] **Step 2–5:** run (FAIL) → implement → run (PASS) → commit `feat(miya): Shorts become posts on the platforms you tick`.

### Task 9: Shorts Studio

**Files:**
- Create: `src/components/miya/ShortsStudioTab.tsx`
- Modify: `ContentFactoryPanel.tsx` (`ContentFactoryTab` `'shorts'`), `MiyaStudio.tsx` (tab after Scene Builder).
- Test: `src/test/components/miya/ShortsStudioTab.test.tsx`, `ContentFactoryPanel.test.tsx`.

- [ ] **Step 1: Failing tests** — `shows each Short's kind, hook, length and its fit on each platform` (e.g. "Facebook: fits", "YouTube: a regular video (over 3 minutes)"); `changing a Short's kind or platforms is saved`; `the player plays a made Short`; `Redo makes that Short again`; `Send back with a reason`; `Add a Short`; `the Shorts' AI clip setting is saved`; `a Short on no platform says it won't be posted`; `without Shorts it says how to make them`.
- [ ] **Step 2–5:** run (FAIL) → implement with `StepPanel`, `mediaUrl()`/`allowMediaFolder()` for the players → run (PASS) → commit `feat(miya): Shorts Studio`.

### Task 10: Docs, desktop spec, final checks

**Files:**
- Create: `e2e-desktop/specs/content-shorts.e2e.mjs` — seeded Shorts (one of each kind, one too long for Facebook): Shorts Studio shows them and each platform's fit; unticking a platform is saved; the Posts list has the Shorts and skips Facebook for the long one with a note; nothing is posted.
- Modify: `CLAUDE.md` (rows: platform limits, the Shorts step, `shortMaker.ts`, `content_cut_short`, Shorts Studio, small cards; desktop counts 31 spec files), `docs/CHANGELOG.md`, `docs/governance/DEFERRED_WORK.md` (3d's open items; close the folded-in ones; phase 4 next; the after-phase-4 reminder stays), `docs/qa/DESKTOP_QA_COVERAGE.md` (spec row; add Shorts to the combined live check), counts, dnd map.
- [ ] **Step 1:** Write the spec and docs.
- [ ] **Step 2:** Run `npx vitest run`, `npm run -s lint`, `npx tsc --noEmit -p .`, every `verify:*` script, `node scripts/verify-doc-counts.mjs`, `node scripts/verify-tauri-versions.mjs`, `cargo fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --lib`. Expected: all pass/clean.
- [ ] **Step 3:** Commit `docs(miya): phase 3d and the Shorts desktop spec`.
- [ ] **Step 4:** Final self-review (no helper agents), push, open the PR, merge when green.
