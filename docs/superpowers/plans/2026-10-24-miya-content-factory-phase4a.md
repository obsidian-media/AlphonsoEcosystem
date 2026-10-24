# Miya content factory phase 4a — learning from real results — Implementation Plan

> **Status (2026-10-25):** built and merged in PR #352 (phase 4a); on `main`, not released yet (2.10.0 isn't tagged). What it leaves open is in `docs/governance/DEFERRED_WORK.md`; the current behaviour is described in `CLAUDE.md`'s Do Not Duplicate rows and `docs/USER_MANUAL.md` section 8.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read each post's real numbers at fixed checkpoints, compare them within the brand, turn them into lessons the user keeps, follow-up ideas and better post times (in the app and on Telegram), and close the phase 3d leftovers and CodeQL alerts 26/33/34/36.

**Architecture:** The backend reads numbers (YouTube Analytics, Instagram and Facebook insights) with the saved keys; `postMetrics.ts` decides which checkpoints are due and stores the results on the post; Marcus's runner (already ticking every minute) calls it. `brandResults.ts` does the comparisons, lessons go through one-step Jose requests, and a content Telegram collector reuses the sent log.

**Tech Stack:** TypeScript/React (Vitest, Testing Library), Rust/Tauri 2 (reqwest, serde), WebdriverIO desktop spec.

**Spec:** `docs/superpowers/specs/2026-10-24-miya-content-factory-phase4a-design.md`

## Global Constraints

- Checkpoints: `1h`, `1d`, `7d`, `30d` after `sentAtMs` (a platform-scheduled post: its scheduled time); nothing after `30d`.
- A missing or unavailable number is shown as "—" with the reason, never 0; a post deleted on the platform shows "removed from <platform>" and gets no more checkpoints.
- Bands: good > 1.5 × brand median, weak < 0.5 × median, usual otherwise; no comparison with fewer than 3 earlier posts on that platform ("First posts: nothing to compare with yet"); main number = views.
- Post-time suggestions need at least 5 posts with 7-day numbers on that platform; up to 3 slots.
- Only `kept` lessons reach prompts. Lessons proposed after 7 days: up to 3 worked + 3 didn't, merged, near-duplicates dropped.
- Telegram 7-day summary: at most one message a day.
- Refresh: once per 10 minutes per post.
- Banner text: "Sign in again to see <service> numbers".
- New scopes: YouTube `https://www.googleapis.com/auth/yt-analytics.readonly`; Meta `instagram_manage_insights,read_insights`; Instagram Login `instagram_business_manage_insights`.
- Shorts step summary when some fail: "done, N of M failed".
- Network calls to YouTube/Meta from the backend only, keys through `secret_or_env()`; no second scheduler or post store; docs in the same commits.

## Review Focus

1. A post sent while the app was closed for days: on start, only its most recent due checkpoint is fetched once (not four calls at once), labelled with the time it was read.
2. A brand with 2 posts: no "good/weak" label and no post-time suggestion — "First posts: nothing to compare with yet".
3. An account signed in before 4a: a read refused for permissions marks only that service, posting still works, and the banner goes away after a new sign-in.
4. The user drops a proposed lesson on Telegram after it was already kept in the app: "Already done." and nothing changes.
5. A brand font name with `:`, `,`, `'` or `\` must never reach ffmpeg's filter text.

---

### Task 1: CodeQL alerts 26, 33, 34, 36

**Files:**
- Modify: `src/services/boardroomThreadService.ts` (around `safeTextForStorage`, line ~95), `src-tauri/src/commands/bridge.rs` (`BridgeSettings`), `src/services/contentFactory/contentStepPrompts.ts` (action lookup, line ~293 and the `ACTIONS[actionType]` reads)
- Test: `src/test/services/boardroomThreadService.test.ts`, `src/test/services/contentFactory/contentStepPrompts.test.ts`, Rust tests in `bridge.rs`

**Interfaces:**
- Produces: `BridgeSettings::transport_problem(&self) -> Option<String>`; `actionFor(actionType: string): StepAction | null` in `contentStepPrompts.ts`.

- [ ] **Step 1: Failing tests**
  - TS `a message with a secret is stored only redacted`: add a thread message containing `sk-ant-api03-` + 40 letters; `localStorage` for the thread key does not contain the original secret.
  - TS `an unknown action type is refused, not looked up`: `parseStepAnswer('toString', '{}')` and `buildContentStepPrompt({ actionType: '__proto__', … })` return null / throw "Unknown content step".
  - Rust `a bridge address off this computer must use https`: `BridgeSettings` with `http://10.0.0.5:3000` → `transport_problem()` is `Some("…https…")`; `http://127.0.0.1:3000` and `https://acc.example.com` → `None`; `alphonso_bridge_status`/`send_packet`/`check` return `{ ok: false, status: "setup_required", error }` without sending.
- [ ] **Step 2:** `npx vitest run src/test/services/boardroomThreadService.test.ts src/test/services/contentFactory/contentStepPrompts.test.ts` and `cargo test --lib bridge` — the new tests fail.
- [ ] **Step 3:** Boardroom stores only `safeTextForStorage()` output and never the original when a secret is detected (if it already does, keep the test as proof). `actionFor()` uses `Object.hasOwn(ACTIONS, id)` and every lookup goes through it. Bridge commands call `transport_problem()` before any request (loopback = `127.0.0.1`, `::1`, `localhost`).
- [ ] **Step 4:** Same commands pass; `cargo clippy --all-targets -- -D warnings` clean.
- [ ] **Step 5:** Commit `fix(security): CodeQL 26, 33, 34, 36`. After the PR's CodeQL run, dismiss any alert that still points at the loopback path with "loopback only, enforced by transport_problem()" (`gh api … -X PATCH -f state=dismissed -f dismissed_reason="won't fix"`).

### Task 2: The brand's font in burned-in text

**Files:**
- Modify: `src-tauri/src/media_tools.rs` (the two `FontName=Arial` styles: assembly captions ~814, cut hook ~1105; `AssemblySpec`, `CutShortSpec`), `src/services/contentFactory/contentMediaExecutor.ts` (`runAssemble`), `src/services/contentFactory/shortMaker.ts`
- Test: Rust tests in `media_tools.rs`, `src/test/services/contentFactory/shortMaker.test.ts`, `src/test/services/contentFactory/contentMediaExecutor.test.ts` (or the existing assemble test file)

**Interfaces:**
- Produces: Rust `caption_font(name: Option<&str>) -> String` (first family before a comma, quotes stripped, only letters/digits/space/`-`, at most 64 chars, else `"Arial"`); `font_installed(name: &str) -> bool` (Windows: registry value names under `HKLM` and `HKCU` `SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts`, read with a `reg query` spawn through `no_window()`, matching the family name before " (" / " Bold" etc.; other OS: `true`); spec field `font: Option<String>` on both specs; the result JSON gains `fontNote` when the font fell back.
- TS: `brandFontName(brand): string | null` in `contentMediaExecutor.ts` (first family of `brand.fonts`), passed as `font` by `runAssemble` and both `content_cut_short` / Short assembly calls; a `fontNote` returned is added to the step's note.

- [ ] **Step 1: Failing tests**
  - Rust `a brand font name is cleaned before it reaches the filter`: `caption_font(Some("\"Montserrat\", Inter"))` = `"Montserrat"`; `caption_font(Some("Bad:Name,'x'\\"))` = `"BadName"` (no `:`/`,`/`'`/`\`); `None`/`""` → `"Arial"`.
  - Rust `captions use the brand font`: `build_assembly_runs` with `font: Some("Montserrat")` → the mix filter contains `FontName=Montserrat,`; `build_cut_runs` likewise.
  - TS `the brand font reaches the assembly`: brand `fonts: 'Montserrat, Inter'` → `content_assemble_video` spec has `font: 'Montserrat'`; a `fontNote` in the reply appears in the step note.
- [ ] **Step 2:** Run `cargo test --lib media_tools` and the two vitest files — new tests fail.
- [ ] **Step 3:** Implement; when `font_installed()` is false use Arial and return `fontNote: "The brand font <name> isn't installed on this computer; the captions use Arial."`.
- [ ] **Step 4:** Tests pass; clippy and `npm run -s verify:no-window-coverage` clean.
- [ ] **Step 5:** Commit `feat(media): captions and hooks in the brand's font`.

### Task 3: Shorts marked, honest, and Redo waits

**Files:**
- Modify: `src/services/contentFactory/calendarItems.ts` (`CalendarItem.isShort`), `src/components/calendar/calendarShared.tsx` (`CalendarChip`), `src/components/calendar/CalendarSidePanel.tsx`, `src/services/contentFactory/shortMaker.ts`, `src/services/contentFactory/contentStepRecorder.ts` (the Shorts branch), `src/components/miya/ShortsStudioTab.tsx`
- Test: `src/test/services/contentFactory/calendarItems.test.ts`, `src/test/components/calendar/*.test.tsx`, `shortMaker.test.ts`, `contentStepRecorder.test.ts`

**Interfaces:**
- Produces: `CalendarItem.isShort: boolean`; `shortsSummary(outputs: ShortOutput[]): string` in `shortMaker.ts` ("done" or "done, N of M failed"); `redoShort()` returns the Short's output after waiting for any running make (no `MAKING_ANOTHER` result any more; keep the export as the progress text "Making another Short…" shown while it waits).

- [ ] **Step 1: Failing tests**
  - `a Short's post is marked on the Calendar`: a post with `shortId` → `isShort: true`; the chip renders the text "Short"; the side panel shows "Short".
  - `the Shorts step says how many failed`: `shortsSummary([done, failed, done])` = `"done, 1 of 3 failed"`; all done → `"done"`; the recorder saves that summary on the step (`StepState` progress/summary) and Shorts Studio shows a flag on the failed card (`data-testid="short-failed-sh2"`).
  - `Redo waits for the Short being made`: start `makeShorts` with a held promise, call `redoShort(sh2)`, release → both resolve, `redoShort` result `status: 'done'`, and `content_cut_short` calls are not overlapping (second starts after the first resolves).
- [ ] **Step 2:** Run the files — fail.
- [ ] **Step 3:** Replace the `busy` flag with a promise chain (`let queue: Promise<unknown> = Promise.resolve()`); every make appends to it.
- [ ] **Step 4:** Tests pass; replace the old "Redo while another Short is being made is refused" test with the waiting test.
- [ ] **Step 5:** Commit `feat(miya): Shorts marked on the Calendar, honest step summary, Redo waits`.

### Task 4: Add a Short asks which kind

**Files:**
- Modify: `src/services/contentFactory/contentProjectService.ts` (`addShortPlan`), `src/services/contentFactory/contentStepPrompts.ts` (`creative_shorts` with `onlyOne`), `src/services/contentFactory/contentStepRunner.ts`, `src/components/miya/ShortsStudioTab.tsx`, `src/components/miya/ContentFactoryPanel.tsx`
- Test: `contentShorts.test.ts`, `ShortsStudioTab.test.tsx`, `ContentFactoryPanel.test.tsx`

**Interfaces:**
- Produces: `addShortPlan(id: string, kind: ShortKind = 'cut'): ContentProject` (highlight gets the same middle moment and an empty hook to fill); `addMiniShort(projectId: string, settings): Promise<{ ok: boolean; reason?: string }>` in `contentStepRunner.ts` — a one-step Jose request (Miya `creative_shorts`, payload `onlyOne: true`, label `PROJECT_LABEL`) whose single Short is appended (id `sh<n+1>`) and then made with `redoShort`.
- UI: "Add a Short" opens a choice: "Its own mini-script" / "A highlight with its own hook" / "A plain cut of the video".

- [ ] **Step 1: Failing tests**
  - `Add a Short as a highlight`: `addShortPlan(id, 'highlight')` → `{ id: 'sh2', kind: 'highlight', moment: {…middle…}, hook: '' }`.
  - `Add a Short as a mini-script asks Miya for just one`: with `submitStepsToJose` mocked to answer one Short, `addMiniShort` appends `sh2` (kind `mini`, its parts) and calls `redoShort(projectId, 'sh2', …)`; the prompt asked for exactly one Short.
  - UI `Add a Short asks which kind`: clicking Add a Short shows the three choices; choosing "A plain cut of the video" calls `addShort('cut')`.
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5:** Commit `feat(miya): Add a Short asks which kind`.

### Task 5: Runway clips for Shorts, asked once per run

**Files:**
- Modify: `src/services/contentFactory/contentProjectPlan.ts` (Shorts step `effects`, `waitFor`), `src/services/contentFactory/shortMaker.ts`, `src/services/contentFactory/contentStepRecorder.ts`, `src/services/jose/stepGraph.ts` (`checkPlan` spend allow-list), `src/components/miya/ShortsStudioTab.tsx`
- Test: `contentShorts.test.ts`, `shortMaker.test.ts`, `src/test/services/jose/stepGraph.test.ts`

**Interfaces:**
- Produces: `shortsRunwayEstimate(project): { clips: number; usd: number } | null` in `contentProjectPlan.ts`; `SHORTS_WAIT_PAID(clips, shorts, usd)` = `` `Make ${clips} Runway clips for ${shorts} Shorts, about $${usd.toFixed(2)}.` ``; `makeShorts(projectId, settings, onProgress?, { runwayApproved?: boolean })`; `RUNWAY_SHORTS_NOTE` now reads "Runway clips were not approved; these were made with pictures only."

- [ ] **Step 1: Failing tests**
  - `Shorts with Runway clips ask once with the cost`: a project whose `shortsSettings.clipEngine === 'runway'` and Runway available → the plan's `shorts` step has `spend` in `effects` and `waitFor` = the estimate text; `checkPlan` accepts Miya `creative_shorts` with `spend`.
  - `approved Shorts use Runway`: `makeShorts(…, { runwayApproved: true })` calls `makeRunwayClip` for the chosen parts (each within the monthly cap); not approved → pictures only with the note.
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5:** Commit `feat(miya): Runway clips in Shorts, asked once per run`.

### Task 6: Reading the numbers (backend) and the new permissions

**Files:**
- Create: `src-tauri/src/post_metrics.rs` (register in `lib.rs` next to the media commands)
- Modify: `src-tauri/src/oauth_signin.rs` (the three scope constants), `src/components/SignInPanel.tsx` (the setup steps list the read permissions)
- Test: Rust tests in `post_metrics.rs` and `oauth_signin.rs`

**Interfaces:**
- Produces Tauri command `content_read_metrics(request: MetricsRequest) -> MetricsResult`:
  - `MetricsRequest { platform: "youtube"|"instagram"|"facebook", piece: "video"|"short"|"reel"|"carousel", platformId: String, instagramRoute: Option<"page"|"instagram_login">, sinceDate: String /* YYYY-MM-DD */, credentials: Option<…> /* as other connector commands, via secret_or_env */ }`
  - `MetricsResult { ok: bool, values: Map<String, f64>, unavailable: Vec<String>, problem: Option<"permission"|"removed"|"temporary"|"other">, reason: Option<String> }`
  - Value keys (fixed, used by the app): YouTube `views, watchMinutes, averageViewSeconds, likes, comments, shares, subscribersGained`; Instagram `views, reach, likes, comments, saves, shares`; Facebook `views, reach, reactions, comments, shares`.
- Pure helpers: `youtube_report_url(video_id, start, end) -> String` (YouTube Analytics `reports.query`, `ids=channel==MINE`, `filters=video==<id>`); `parse_youtube_report(&Value) -> Map`; `insights_url(base, media_id, metrics: &[&str]) -> String`; `parse_insights(&Value) -> (Map, Vec<String>)`; `classify_read_error(status: u16, body: &Value) -> Problem` (403 with insufficient-scope / Graph error code 10 or 200 → permission; 404 / Graph code 100 "does not exist" → removed; 429/5xx → temporary).
- Builder checks the current metric names against each platform's docs and keeps the app's value keys fixed.

- [ ] **Step 1: Failing tests**
  - `the sign-ins ask to read numbers`: `GOOGLE_SCOPES` contains `yt-analytics.readonly`; `META_SCOPES` contains `instagram_manage_insights` and `read_insights`; `INSTAGRAM_SCOPES` contains `instagram_business_manage_insights`.
  - `a YouTube report is read into the app's keys`: a sample `reports.query` body (columnHeaders + one row) → `views`, `watchMinutes`, … with the numbers.
  - `Instagram insights missing a metric say so`: a body with `views` and `reach` only → those values, `unavailable` lists the rest.
  - `read errors are classified`: (403, insufficient permissions) → permission; Graph `{"error":{"code":10}}` → permission; (404) / Graph code 100 "does not exist" → removed; (429) → temporary.
  - `a bad id is refused before sending`: `platformId` with `/` or `?` → `ok:false, problem:"other"` and no request.
- [ ] **Step 2:** `cargo test --lib post_metrics oauth_signin` — fail.
- [ ] **Step 3:** Implement; access tokens through `youtube_access_token()` and the existing Meta key resolution (`instagram_base(route, version)` for Instagram Login).
- [ ] **Step 4:** Tests pass; clippy, fmt, `node scripts/verify-doc-counts.mjs` after `fixcounts.py` (a new module and command).
- [ ] **Step 5:** Commit `feat(metrics): read post numbers from YouTube and Meta`.

### Task 7: Checkpoints, storing and Refresh

**Files:**
- Create: `src/services/contentFactory/postMetrics.ts`
- Modify: `src/services/contentFactory/contentTypes.ts` (`PostMetrics`, `ProjectPost.metrics`), `src/services/marcusExecutionService.ts` (call from the scheduler tick and at start), `src/services/contentFactory/contentPosts.ts` (`updatePost` allows `metrics` after a post went out)
- Test: `src/test/services/contentFactory/postMetrics.test.ts`

**Interfaces:**
- Types: `type Checkpoint = '1h' | '1d' | '7d' | '30d'`; `CHECKPOINT_MS: Record<Checkpoint, number>`; `interface MetricsReading { readAtMs: number; values: Record<string, number>; unavailable: string[] }`; `interface PostMetrics { readings: Partial<Record<Checkpoint, MetricsReading>>; removed?: boolean; lastRefreshMs?: number; lastProblem?: string }`; `ProjectPost.metrics?: PostMetrics`.
- Produces:
  - `dueCheckpoint(post: ProjectPost, nowMs: number): Checkpoint | null` — the latest checkpoint whose time has passed and has no reading (only that one, so a long absence fetches once); null when removed, not sent, or `30d` read.
  - `measurablePosts(): { projectId: string | null; brandId: string | null; post: ProjectPost }[]` — factory posts with `platformId` and `sentAtMs` (status posted/scheduled), plus Content Studio jobs with `publish_result.postIds[0]` (as `projectId: null, brandId: null`, stored under `alphonso_content_studio_metrics_v1`).
  - `readDueMetrics(nowMs: number, max = 3): Promise<number>` — reads at most `max` posts per call, saves the reading (`readAtMs` = now), sets `removed` on `removed`, records a permission problem with `markNeedsPermission(service)`; a temporary problem retries after an hour.
  - `refreshPostMetrics(projectId, postId, nowMs): Promise<{ ok: boolean; reason?: string }>` — refused under 10 minutes since the last refresh ("Refreshed a moment ago; try again in a few minutes.").
  - `needsPermission(): Partial<Record<'youtube' | 'meta' | 'instagram', boolean>>`, `markNeedsPermission(service)`, `clearNeedsPermission(service)` (key `alphonso_metrics_permissions_v1`; `signInService.ts` clears it after a successful sign-in).
- The 7-day reading of a factory post fires `onSevenDays(projectId, postId)` (Task 9 subscribes).

- [ ] **Step 1: Failing tests**
  - `checkpoints come due one at a time`: sent 2 h ago, nothing read → `1h`; sent 9 days ago, nothing read → `7d` only; `30d` read → null; removed → null.
  - `due numbers are read and saved`: `invoke('content_read_metrics')` mocked → the post's `metrics.readings['1d']` has the values and `readAtMs`; at most 3 posts per call.
  - `a permission refusal marks only that service`: YouTube answers `problem:'permission'` → `needsPermission().youtube === true`, Instagram still read; a later successful sign-in clears it.
  - `Refresh is limited to once per 10 minutes`.
  - Review Focus 1: `a long absence fetches one checkpoint` — sent 40 days ago with nothing read: one call (`30d`), not four.
- [ ] **Step 2–4:** fail, implement, pass; also the runner test (`marcusExecutionService` tick calls `readDueMetrics`).
- [ ] **Step 5:** Commit `feat(metrics): checkpoints, saved readings and Refresh`.

### Task 8: Comparing within the brand, and showing the numbers

**Files:**
- Create: `src/services/contentFactory/brandResults.ts`, `src/components/miya/BrandResults.tsx`, `src/components/miya/PostNumbers.tsx`
- Modify: `src/components/miya/PostsPanel.tsx`, `src/components/calendar/CalendarSidePanel.tsx`, `src/components/miya/BrandEditor.tsx` (Results section), `src/components/calendar/CalendarPage.tsx` (banner)
- Test: `src/test/services/contentFactory/brandResults.test.ts`, `src/test/components/miya/BrandResults.test.tsx`, `PostsPanel.test.tsx`, calendar tests

**Interfaces:**
- Produces: `BANDS = { good: 1.5, weak: 0.5 }`, `MIN_POSTS_TO_COMPARE = 3`, `MAIN_METRIC = 'views'`; `brandMedian(brandId, platform, checkpoint, beforeMs?): number | null`; `postBand(post, brandId, checkpoint): 'good' | 'weak' | 'usual' | 'first' | null`; `brandResultRows(brandId): { projectName; post; sevenDay?: MetricsReading; band }[]`; `permissionBanners(): string[]` ("Sign in again to see YouTube numbers").
- `PostNumbers({ post, compact })`: latest reading's main numbers with the band word; "—" plus the reason for unavailable, "removed from <platform>" when removed; a Refresh button (`refreshPostMetrics`).

- [ ] **Step 1: Failing tests**
  - `a post is compared with its own brand`: medians [100, 200, 300] at `7d` on Instagram → a 450-view post is good, 90 weak, 200 usual; another brand's posts don't count.
  - Review Focus 2: `fewer than 3 earlier posts: nothing to compare` → `'first'`, rendered "First posts: nothing to compare with yet".
  - `numbers show on the Posts list and the side panel`; `a missing number shows — and why, never 0`; `a removed post says removed from Instagram`.
  - `the banner shows per service` with `needsPermission().meta` → "Sign in again to see Facebook and Instagram numbers" on the Calendar and Results (my call: Meta covers both).
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5:** Commit `feat(miya): post numbers compared within the brand`.

### Task 9: Lessons proposed after 7 days, kept by the user

**Files:**
- Create: `src/services/contentFactory/performanceLessons.ts`
- Modify: `src/services/contentFactory/contentTypes.ts` (lesson `status`, `source: 'performance'`, `postRef`), `contentBrandService.ts` (`keepLesson`, `editLesson`, `dropLesson`, `proposedLessons`), `contentStepPrompts.ts` (prompts use kept lessons only; new actions `analysis_performance` (Nova) and `creative_lessons` (Miya)), `src/services/jose/joseEffects.ts` (`ACTION_EFFECTS`: `analysis_performance: ['read']`, `creative_lessons: ['write_own_work']`), `src/components/miya/BrandResults.tsx`
- Test: `src/test/services/contentFactory/performanceLessons.test.ts`, `contentStepPrompts.test.ts`, `BrandResults.test.tsx`

**Interfaces:**
- Lesson: `{ id: string; atMs; text; source: 'rejection' | 'user' | 'performance'; status?: 'proposed' | 'kept'; kind?: 'worked' | 'didnt'; postRef?: { projectId; postId } }` (no `status` = kept, for existing lessons).
- Produces: `proposeLessons(projectId, postId): Promise<{ ok; count }>` — two one-step requests through `submitStepsToJose` (label `PROJECT_LABEL`) with the post, its script/hook/thumbnail/time and its 7-day reading vs the median; merges the answers (≤3 worked + ≤3 didn't, near-duplicates dropped by lower-cased word overlap ≥ 0.8), saves them `proposed`; nothing when the reading is missing. Subscribes to `onSevenDays`.
- `keepLesson(brandId, lessonId)`, `editLesson(brandId, lessonId, text)` (also keeps it), `dropLesson(brandId, lessonId)` → `{ ok; already?: boolean }` (already decided → `{ ok: false, already: true }`).

- [ ] **Step 1: Failing tests**
  - `only kept lessons reach prompts`: brand with one proposed and one kept lesson → the prompt contains only the kept text.
  - `7-day numbers propose merged lessons`: Nova and Miya answers mocked with an overlapping lesson → saved proposed lessons have no duplicate, at most 3 per kind, each with `postRef`.
  - `a lesson is kept, edited or dropped once`: drop after keep → `already: true` and nothing changes (Review Focus 4).
  - UI `proposed lessons can be kept, edited or dropped` on the Results view.
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5:** Commit `feat(miya): lessons from real results, kept by you`.

### Task 10: Ideas and better post times

**Files:**
- Create: `src/services/contentFactory/contentIdeas.ts`, `src/services/contentFactory/postTimeSuggestions.ts`, `src/components/miya/IdeasList.tsx`
- Modify: `contentTypes.ts` (`ContentIdea`), `contentStepPrompts.ts` (`analysis_ideas` for Nova), `joseEffects.ts` (`analysis_ideas: ['read']`), `src/components/miya/BrandEditor.tsx` (Ideas section; suggested slots beside posting slots)
- Test: `src/test/services/contentFactory/contentIdeas.test.ts`, `postTimeSuggestions.test.ts`, `src/test/components/miya/IdeasList.test.tsx`

**Interfaces:**
- `ContentIdea { id; brandId; text; fromPost: { projectId; postId }; atMs; status: 'new' | 'started' | 'dismissed' }`, stored under `alphonso_content_ideas_v1`.
- Produces: `proposeIdeas(projectId, postId)` (only when the 7-day band is `good`; up to 3 ideas from a one-step Nova `analysis_ideas` request; subscribes to `onSevenDays`), `listIdeas(brandId)`, `startProjectFromIdea(ideaId) -> ContentProject` (brief idea = the text, the brand), `dismissIdea(ideaId)`.
- `suggestPostTimes(brandId, platform): { slot: PostingSlot; reason: string }[]` — pure: needs ≥5 posts with 7-day readings; groups the good posts' local weekday+hour, top 3 by count, reason "4 of your 5 good Reels went out on Thursday evenings"; `acceptSuggestedSlot(brandId, slot)` adds it to `postingSlots` (no duplicates).

- [ ] **Step 1: Failing tests**
  - `ideas come only from good posts`: a `usual` post → no request; a `good` one → up to 3 ideas saved `new`.
  - `Start project makes a project from the idea` with the brand and the idea as the brief; the idea becomes `started`.
  - `post times need 5 posts`: 4 → `[]`; 6 with 4 good on Thursdays 18:00 → first suggestion Thursday 18:00 with the reason text.
  - `a suggested slot is added only when accepted`, without duplicates.
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5:** Commit `feat(miya): ideas from good posts and better post times`.

### Task 11: Telegram: the daily 7-day summary and new ideas

**Files:**
- Create: `src/services/contentFactory/contentTelegram.ts`
- Modify: `src/services/telegramCompanionService.js` (push loop after the Jose notifications; `handleContentButton` for `c:` tokens), `src/services/jose/joseTelegram.ts` (`JoseTelegramSettings` gains `performanceSummaries`, `contentIdeas`, both on), `src/components/SettingsView.tsx` (`JoseTelegramPanel` two switches)
- Test: `src/test/services/contentFactory/contentTelegram.test.ts`, `src/test/connectors/telegramCompanionService.test.js`

**Interfaces:**
- Produces: `collectContentNotifications(nowMs, sent: Set<string>, settings): { key; text; buttons? }[]` — one summary per day (key `perf:<YYYY-MM-DD>`) listing each post that got its 7-day reading that day ("Launch video (YouTube): 12,400 views, good for Acme.") with each proposed lesson and Keep / Drop buttons; one message per new idea (key `idea:<id>`) with Start project / Dismiss. `contentButtonToken({ action: 'keep' | 'drop' | 'start' | 'dismiss'; ref })` → `c:` + 8 characters (store `alphonso_content_telegram_buttons_v1`, 7 days, 200 kept); `readContentButtonToken(data)`.
- `handleContentButton(token, update)` (paired chat only, as `handleJoseButton`): keep/drop through `keepLesson`/`dropLesson` ("Kept." / "Dropped." / "Already done."), start/dismiss through the ideas service ("Project started: <name>.").

- [ ] **Step 1: Failing tests**
  - `one summary a day`: two posts reaching 7 days the same day → one notification; already sent key → none.
  - `idea messages have Start project and Dismiss`.
  - `a stale or repeated button says so`: unknown token → "That button has expired."; drop after keep → "Already done."
  - Switches off → nothing collected.
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5:** Commit `feat(telegram): 7-day summaries and new ideas`.

### Task 12: Desktop spec, docs, checks, PR

**Files:**
- Create: `e2e-desktop/specs/content-results.e2e.mjs`
- Modify: `CLAUDE.md` (rows for `post_metrics.rs`, `postMetrics.ts`, `brandResults.ts`, `performanceLessons.ts`, `contentIdeas.ts`, `postTimeSuggestions.ts`, `contentTelegram.ts`, the new components; update the Shorts, sign-in, CodeQL-related rows; desktop counts 32 spec files), `docs/CHANGELOG.md`, `docs/governance/DEFERRED_WORK.md` (4a entry: not checked with real accounts; 4b next; close the 3d items), `docs/qa/DESKTOP_QA_COVERAGE.md` (spec row; numbers and lessons in the combined live check)

- [ ] **Step 1:** Desktop spec (seeded, nothing fetched): a brand with 4 posts that have seeded 7-day readings → the Results view shows them with good/weak/usual; a seeded proposed lesson is kept and then appears in the brand's lessons; a seeded idea's Start project creates a project; the Calendar side panel shows a post's numbers; the Calendar shows "Short" on a Short. `node --check`.
- [ ] **Step 2:** All checks: `fixcounts.py`, `verify-doc-counts`, `generate:dnd-map`, `verify:dnd-map`, `verify:dnd-coverage`, `verify:skill-matrix`, `verify:no-window-coverage`, `verify-tauri-versions`, `verify:npm-audit`, `tsc`, `lint`, full `npx vitest run`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --lib` (retry loop for os error 4551).
- [ ] **Step 3:** Commit `test(e2e): results in the real app; docs for phase 4a`; self-review (no subagents); PR; merge when green.
