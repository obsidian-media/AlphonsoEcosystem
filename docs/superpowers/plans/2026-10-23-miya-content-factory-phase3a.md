# Miya content factory phase 3a (publishing) Implementation Plan

> **Status (2026-10-25):** built and merged in PR #348 (phase 3a); on `main`, not released yet (2.10.0 isn't tagged). What it leaves open is in `docs/governance/DEFERRED_WORK.md`; the current behaviour is described in `CLAUDE.md`'s Do Not Duplicate rows and `docs/USER_MANUAL.md` section 8.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (Owner, 2026-10-23: native execution, no subagents.)

**Goal:** A finished project's posts (YouTube video and Short; Instagram and Facebook Reel) are listed with editable times, approved once, and go out at their times through one shared publishing path; ad copy is exported for import.

**Architecture:** The existing YouTube and Meta backends are extended (scheduled publishing, local uploads, saved keys, status read-back); a project gets a `posts` list built from the campaign, Nova's times and the brand's posting slots; a new `publish` step (Marcus, `distribution_schedule_posts`, `publish_or_send`) schedules them when approved; Marcus's scheduled-publish store and runner become the one scheduler, started with the app. Content Studio's Publish uses the same path.

**Tech Stack:** TypeScript/React (Vitest), Rust/Tauri 2 (reqwest), YouTube Data API v3, Meta Graph API (Pages, Instagram content publishing with resumable uploads).

**Spec:** `docs/superpowers/specs/2026-10-23-miya-content-factory-phase3a-design.md`

## Global Constraints

- Nothing is posted without the user's approval of that exact list (the `publish` step's `publish_or_send` effect always asks).
- Read back what the platform did; never say "posted" or "public" on a request alone.
- Keys from the user's saved connector credentials, falling back to the environment (`secret_or_env`); no fixed accounts, times or formats.
- One publishing path: Miya Studio and Content Studio both post through `publishPost()`; one scheduler: Marcus's store and runner.
- YouTube: uploaded private with `publishAt`; a channel whose uploads come back locked private is remembered, and its posts get a reminder with a YouTube Studio link at their time.
- Instagram is posted by Alphonso at its time (Meta cannot schedule it); app closed → at next start, once, with a note (in the app, and on Telegram when set up); more than 7 days late → asks first.
- Never post twice: a post is claimed (status `posting`) before anything is sent.
- Ad copy: per-network CSVs in `<project>/campaign/ads-<network>-v<n>.csv`, plus copy buttons; no ad accounts touched.

## Review Focus

1. The app restarts while a post is `posting` (crashed mid-send): it must not be sent again blindly; it becomes `check` ("We don't know if this went out; check <platform>").
2. The user edits a post's time or caption after approving: the change applies only if the post has not gone out; a YouTube post already uploaded is updated on YouTube (or says it can't be).
3. A post time in the past at approval (the user approved late): it goes out at once (or is scheduled a minute ahead), never silently skipped.
4. Meta's Reel processing fails or takes long: the post waits for Meta's status (FINISHED) up to 10 minutes, then fails with Meta's reason, not "posted".
5. A project with no 9:16 video (only 16:9) or no thumbnail: the Short/Reel rows are not offered and YouTube uploads without a custom thumbnail, each saying why.

---

### Task 1: Meta keys in Settings, passed to the backend

**Files:** modify `src/components/ConnectorSetupPanel.tsx` (a "Meta (Facebook and Instagram)" section in Messaging or Content: `META_ACCESS_TOKEN`, `META_PAGE_ID`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`, `META_APP_SECRET`), `src/services/connectors/connectorRegistry.js` (a `meta` connector if absent: transport `meta_graph_api`, permissions `['publish_post', 'publish_reel']`, high risk), `src-tauri/src/meta_publish.rs` (`MetaPublishRequest.credentials: Option<MetaCredentials>`; every `std::env::var` for these keys through `secret_or_env`), `src/services/metaPublishService.ts` (passes the saved keys). Tests: panel test, `metaPublishService` test, Rust test that a passed key wins over the environment.

- [ ] Write the tests; run (fail); implement; run (pass); counts; commit `feat(meta): Meta keys in Settings, used by the backend`.

### Task 2: Meta local uploads and scheduling

**Files:** modify `src-tauri/src/meta_publish.rs`, `src/services/metaPublishService.ts`.

**Interfaces — Produces:**
- Rust: `instagram_reel_init_body(caption) -> Vec<(String,String)>` (`media_type=REELS`, `upload_type=resumable`, `caption`), the rupload call (`POST https://rupload.facebook.com/ig-api-upload/<version>/<container>` with `Authorization: OAuth <token>`, `offset: 0`, `file_size: <bytes>`, the file bytes), polling `GET /<container>?fields=status_code` until `FINISHED` (10 minutes at most; `ERROR` → Meta's reason), then `media_publish`. Facebook Page video from a local file: multipart `source` to `https://graph-video.facebook.com/<version>/<page>/videos`, with `published=false` and `scheduled_publish_time=<unix>` when a time is given (Meta needs 10 minutes to 30 days ahead; nearer → publish now).
- The request gains `scheduled_at_ms: Option<u64>`; the proof keeps `post_ids`, `url`, and `scheduled: bool`.
- TS: `publishMeta({ platform, caption, title, localFilePath, scheduledAtMs, approved }) -> Promise<MetaPublishProof>`.
- [ ] Rust tests for the init body, the rupload headers, the schedule window rule (9 minutes → now, 2 hours → scheduled, 31 days → error) and status handling (`FINISHED`, `ERROR`, timeout) through pure helpers; TS test that the request is built from the post. Commit `feat(meta): local Reels and scheduled Facebook videos`.

### Task 3: YouTube scheduled publishing, thumbnail and read-back

**Files:** modify `src-tauri/src/youtube.rs` (`connector_upload_youtube` gains `publish_at: Option<String>` (RFC 3339; forces `private`), `thumbnail_path: Option<String>` (`thumbnails.set` after upload; a failure is noted, not fatal), and after upload reads `videos?part=status&id=…`), `src-tauri/src/lib.rs` (`YouTubeUploadProof` gains `publish_at: Option<String>`, `locked_private: bool`, `thumbnail_set: bool`, `note: Option<String>`), `src/services/connectors/connectorOutbound.js` (`uploadYouTubeConnectorVideo` passes them and the saved OAuth values).

- `locked_private` = a `publishAt` was asked for and the read-back has none while the video is private (the unaudited-project lock), with the note "YouTube keeps this channel's uploads private until its Google project passes YouTube's audit. Make it public in YouTube Studio: <link>."
- Upload: resumable (`uploadType=resumable`) when the file is over 100 MB, else the existing multipart.
- [ ] Rust tests (pure): the status JSON with and without `publishAt` → locked or not; the request body carries `publishAt` and `private`; the size rule. Commit `feat(youtube): scheduled publishing, thumbnail and what YouTube really did`.

### Task 4: Posting slots, the Short's copy and the posts list

**Files:** modify `contentTypes.ts` (`ContentBrand.postingSlots: { platform: 'youtube' | 'instagram' | 'facebook'; day: 0-6; time: 'HH:MM' }[]`; `ProjectPost { id, platform, piece: 'video' | 'short' | 'reel', file, thumbnail?, title, caption, hashtags[], scheduledAtMs, status: 'draft' | 'approved' | 'scheduled' | 'posting' | 'posted' | 'locked_private' | 'waiting_app' | 'failed' | 'check' | 'cancelled', link?, reason?, platformId? }`; `ContentProject.posts?`), `contentBrandService.ts` (defaults `[]`), `BrandEditor.tsx` (slots editor), `contentStepPrompts.ts` (campaign also writes `short: { title, caption, hashtags }`), create `contentFactory/contentPosts.ts` (`buildPosts(project, brand, nowMs) -> ProjectPost[]`, `nextPostTime(platform, brand, novaTimes, nowMs, taken) -> number`, `updatePost(projectId, postId, patch)`, `cancelPost`).

- Rows: YouTube video (16:9, the chosen thumbnail), YouTube Short (9:16), Instagram Reel (9:16), Facebook Reel (9:16), for the brand's platforms; no 9:16 → no Short/Reel rows, with the reason (Review Focus 5).
- Time: the next free slot for the platform, else Nova's day and time, else tomorrow 18:00 local; two posts never share the same slot.
- [ ] Tests: rows per platform; time rules (slot, Nova, fallback, no clash); editing after approval only while not posted (Review Focus 2); slots saved by the editor. Commit `feat(content): posting slots and the project's posts`.

### Task 5: The post scheduler (Marcus's runner)

**Files:** modify `src/services/marcusExecutionService.ts` (scheduled items gain `kind: 'text' | 'content_post'`, `projectId`, `postId`; `startScheduler` claims an item (`posting`) before sending; started from App's first render, not in the Coach window; at start, overdue content posts go out once with a note, more than 7 days late wait as `ask`), create `src/services/contentFactory/publishPost.ts` (`publishPost(post, project, settings) -> Promise<{ status, link?, platformId?, reason? }>` through Tasks 2 and 3), `useBootEffects.js` or App (start), notifications (`appendNotification`/toast and the Telegram companion's send when paired).

- [ ] Tests: a due Instagram post is claimed then posted once (two ticks → one send); a crash while `posting` → `check` at next start (Review Focus 1); a 3-day-late post goes out with a note; an 8-day-late one waits; a locked YouTube post sends the reminder with the Studio link at its time; text items still work as before. Commit `feat(marcus): one runner for scheduled posts`.

### Task 6: The Publish step, and Content Studio on the same path

**Files:** `contentTypes.ts` (`publish` after `quality` in `STEP_ORDER`), `contentStepAgents.ts` (`publish: [{ agent: 'marcus', actionType: 'distribution_schedule_posts', title: 'Schedule the posts' }]`), `joseTemplates.ts` (`publish` needs `quality`, `security`; effects `publish_or_send`), `joseEffects.ts`, `contentProjectPlan.ts`, create `contentFactory/contentPublishExecutor.ts` (`executePublishStep(assignment)`: the project's approved posts — YouTube uploaded now with `publishAt`, Facebook scheduled on Meta, Instagram handed to the runner; a time already past → now (Review Focus 3)), `contentAgentExecutor.ts` (dispatch), `features/content-catalyst/services/contentCatalystService.js` (`publishContent` calls `publishPost` for its job's platform instead of its own Meta call).
- [ ] Tests: the step schedules each approved post on its platform and saves each result; `checkPlan` ok (Marcus may `publish_or_send`); a past time posts now; Content Studio's publish goes through `publishPost` with the same approval. Commit `feat(content): the Publish step, one publishing path`.

### Task 7: Campaign Studio's Posts list and the ad files

**Files:** create `contentFactory/adCopyExport.ts` (`adCsv(network: 'meta' | 'google' | 'youtube', ads) -> string`; columns confirmed from Meta Ads Manager's bulk-import template and Google Ads Editor's import format, recorded as a ruling), modify `CampaignStudioTab.tsx` (Posts list: each row's platform, piece, title, caption, hashtags, time (editable), status with link or reason, Cancel; "Approve and schedule" runs/approves the publish step; ad copy per network with Copy and "Export CSV").
- [ ] Tests: CSV escaping (quotes, commas, line breaks) and columns; the list edits and cancels; a locked YouTube row shows the note and the Studio link; export writes the file. Commit `feat(miya): the Posts list and ad copy files`.

### Task 8: Docs, real app, PR

- CLAUDE.md rows (Meta keys, YouTube scheduling, posts, the runner, the Publish step, ad files; connector count if `meta` is new), CHANGELOG, DEFERRED_WORK (3a open items; 3b next), QA coverage, counts, dnd map.
- Desktop spec `content-publish.e2e.mjs`: the Posts list built from a seeded campaign, times edited, approval creates scheduled items (no real posting); plus `content-project`, `smoke` (when Windows allows unsigned builds; else CI).
- Self-review; PR; merge when green. Real posting is checked by hand with the owner's accounts.
