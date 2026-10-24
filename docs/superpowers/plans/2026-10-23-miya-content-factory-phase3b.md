# Miya content factory phase 3b (calendar, moving posts, sign-in expiry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (Owner, 2026-10-23: native execution, no subagents.)

**Goal:** A Calendar page for every brand's posts, drafts and sends (month and week, side panel, drag to move), moving and cancelling posts already scheduled on YouTube and Facebook, sign-in expiry warnings, daily limits, and two small fixes.

**Architecture:** The backend gains YouTube `videos.update` (time / back to private) and Meta changes for a scheduled Reel, plus Instagram's publishing limit and Meta token expiry. App side: `contentPostMoves.ts` is the one way a post is moved or cancelled; `calendarItems.ts` merges posts, Content Studio drafts and Marcus sends into calendar items; `signInExpiry.ts` knows when YouTube and Meta sign-ins run out; Marcus's runner checks limits and expiry. `CalendarPage` is a new Work page.

**Tech Stack:** TypeScript/React (Vitest), Rust/Tauri 2, YouTube Data API v3 `videos.update`, Meta Graph API.

**Spec:** `docs/superpowers/specs/2026-10-23-miya-content-factory-phase3b-design.md`

## Global Constraints

- Nothing changes on a platform without the user's confirmation ("Move to <day time>? This changes the time on <Platform>." / "Cancel this post on <Platform>?"); the post shows the platform's answer, never the request.
- One calendar, one runner (`marcusExecutionService.ts`), one publishing path (`publishPost()`), one post store (`contentPosts.ts`).
- Keys from saved Settings (`secret_or_env`); no fixed accounts, times or brands.
- YouTube `videos.update` with `part=status` must send every status field it keeps (omitted fields are cleared); `publishAt` only while `privacyStatus` is `private` and the video was never published.
- YouTube Testing-mode sign-in: 7 days from when the keys were saved, warned 2 days before ("about"); off when the user marks the project Published. Meta: read from `debug_token`, else 60 days, warned 7 days before.
- Facebook Reels: 30 in 24 hours (counted); Instagram: `content_publishing_limit`.
- Times shown in local time, stored as milliseconds; month drag keeps the local time of day.

## Review Focus

1. A YouTube post whose time has passed (now public) is dragged: refused with "This has already gone out on YouTube.", nothing sent.
2. Meta refuses to move or cancel a scheduled Reel: the post keeps its time, the reason is shown with a Meta Business Suite link, and the calendar does not show it moved.
3. A post dropped on a day or hour in the past (or under 15 minutes ahead for YouTube/Facebook): refused with a reason.
4. A drag across a daylight-saving change keeps the same local hour (local `Date` setters, never adding 24 h multiples).
5. A second move of the same post while the first platform call is running: ignored, the post shows "Moving…".

---

### Task 1: YouTube: change a scheduled video's time, or keep it private (cancel)

**Files:** modify `src-tauri/src/youtube.rs` (command `connector_reschedule_youtube(video_id, publish_at: Option<String>, oauth)`; pure `youtube_status_update(current_status: &Value, publish_at: Option<&str>) -> Result<Value, String>`), `lib.rs` (register), `src/services/connectors/connectorOutbound.js` (`rescheduleYouTubeVideo({ videoId, publishAt })`, saved OAuth passed, audited).

- `youtube_status_update`: copies the current status's kept fields (`privacyStatus`, `license`, `embeddable`, `publicStatsViewable`, `madeForKids` as `selfDeclaredMadeForKids` only if present), sets `privacyStatus: "private"`, `publishAt` = the new time or removed (cancel); `Err("This has already gone out on YouTube.")` when the current status is not private or has no `publishAt` and was public before (`privacyStatus` public/unlisted).
- The command reads `videos?part=status&id=`, sends `PUT videos?part=status` with `{ id, status }`, reads the status back, and returns `{ ok, publishAt, privacyStatus, reason }`.
- [ ] Rust tests for `youtube_status_update` (keeps license/embeddable, sets the new `publishAt`, cancel removes it and stays private, a public video is refused); app test that `rescheduleYouTubeVideo` invokes the command with the saved OAuth and audits old/new. Commit `feat(youtube): move or cancel a scheduled video`.

### Task 2: Meta: move or cancel a scheduled Reel; Instagram's limit; token expiry

**Files:** modify `src-tauri/src/meta_video.rs` (commands `meta_reschedule_video(video_id, scheduled_at_ms, credentials)`, `meta_cancel_video(video_id, credentials)`, `meta_instagram_limit(credentials)`, `meta_token_expiry(credentials)`), `meta_publish.rs` (`MetaCredentials.app_id` → `META_APP_ID`), `metaPublishService.ts` (`rescheduleMetaVideo`, `cancelMetaVideo`, `instagramPublishingLimit`, `metaTokenExpiry`), `ConnectorSetupPanel.tsx` (App ID field in the Meta section).

**Interfaces — Produces:**
- `meta_reschedule_video`: `facebook_schedule()` window first; `POST /<video_id>` with `scheduled_publish_time`, then reads `/<video_id>?fields=status` back; returns `{ ok, scheduledAtMs?, reason?, manageUrl: "https://business.facebook.com/latest/content_calendar" }`. Any Meta error → `ok: false` with Meta's message and `manageUrl`.
- `meta_cancel_video`: `DELETE /<video_id>` only while its `publish_status` is `scheduled` (read first); else `ok: false, reason: "This has already gone out on Facebook."`.
- `meta_instagram_limit` → `{ used, total }` from `/<ig_user>/content_publishing_limit?fields=quota_usage,config`; pure `instagram_posts_left(json) -> Option<u32>`.
- `meta_token_expiry` → `{ expiresAtMs: Option<u64> }` from `GET /debug_token?input_token=<token>&access_token=<app_id>|<app_secret>` (`data.expires_at`, 0 = never → None); missing App ID or secret → None.
- [ ] Rust tests: `instagram_posts_left` (quota 3 of 100 → 97; missing → None), `token_expiry_from_debug` (expires_at seconds → ms; 0 → None); the reschedule window check reuses `facebook_schedule` tests. App tests for the four calls (keys passed, results mapped). Commit `feat(meta): move or cancel a scheduled Reel, Instagram's limit, token expiry`.

### Task 3: Moving and cancelling a post (the one way)

**Files:** create `src/services/contentFactory/contentPostMoves.ts`; modify `contentPosts.ts` (`updatePost(…, patch, { onPlatform?: boolean })`: `onPlatform` skips the "change it in Studio" refusal; `cancelPost` likewise), `PostsPanel.tsx` (time changes and Cancel go through the new functions), `contentTypes.ts` (`ProjectPost.sentAtMs?`).

**Interfaces — Produces:**
- `movePost(projectId, postId, atMs, nowMs = Date.now()) -> Promise<{ ok: boolean; reason?: string; manageUrl?: string }>`:
  - refused if gone out (`posted`, `posting`, `check`, `cancelled`, `locked_private` past its time), if `atMs < nowMs`, or for YouTube/Facebook scheduled posts if `atMs < nowMs + 15 min`;
  - draft/approved/failed/ask → `updatePost`; Instagram `scheduled` → `updatePost` + `scheduleContentPost`;
  - YouTube `scheduled` → `rescheduleYouTubeVideo`; Facebook `scheduled` → `rescheduleMetaVideo`; on `ok` → `updatePost(…, { scheduledAtMs }, { onPlatform: true })`; else unchanged with the reason;
  - a second call while one for the same post runs → `{ ok: false, reason: 'Moving…' }` (in-memory set);
  - every platform move audited (`appendConnectorAudit(platform, 'post_moved', { postId, fromMs, toMs, ok })`).
- `cancelProjectPost(projectId, postId) -> Promise<{ ok; reason?; manageUrl? }>`: Instagram/draft → existing `cancelPost` + `cancelScheduledContentPost`; YouTube scheduled → `rescheduleYouTubeVideo({ publishAt: null })` (stays private) then `cancelled` with reason "Kept private on YouTube; delete it in YouTube Studio if you don't want it."; Facebook scheduled → `cancelMetaVideo`.
- `moveToDay(atMs, dayStartMs) -> number` (keeps the local hour and minute; Review Focus 4) and `moveToSlot(dayStartMs, hour, minute)`.
- [ ] Tests: each kind moves (YouTube/Facebook only after the platform's ok; refusal keeps the time — Review Focus 2); past and gone-out refused (Review Focus 1, 3); second call while running (Review Focus 5); `moveToDay` across 25 Oct 2026 / 1 Nov (DST) keeps 18:00; cancel per platform. Commit `feat(content): move or cancel a post, on the platform when it is there`.

### Task 4: Calendar items (posts, drafts, sends)

**Files:** create `src/services/contentFactory/calendarItems.ts`.

**Interfaces — Produces:**
- `CalendarItem { id; kind: 'post' | 'draft' | 'send'; brandId: string | null; brandName: string; brandColor: string; initials: string; platform: 'youtube' | 'instagram' | 'facebook' | 'other'; title: string; atMs: number; hasTime: boolean; status: string; statusLabel: string; needsYou: boolean; reason?: string; link?: string; projectId?: string; postId?: string; draftId?: string; sendId?: string; draggable: boolean; movesOnPlatform: boolean }`.
- `listCalendarItems(nowMs, { signInWarnings? }) -> CalendarItem[]`: every project's posts (all brands; not cancelled), Content Studio drafts with `scheduled_date` (`listContentJobs()`; brand "Content Studio"; `hasTime` from `scheduled_time`), Marcus text sends (`getScheduledPublishes()` kind text, pending). `needsYou` for `locked_private`, `failed`, `check`, `ask`, `over_limit`, and posts after a sign-in expiry.
- `brandMarker(brand, index) -> { color, initials }` (first palette colour, else `BRAND_COLORS[index % 8]`; initials: first letters of the first two words, upper case).
- `filterCalendarItems(items, { brands: Set<string> | null, platforms: Set<string> | null })`, `itemsForMonth(items, year, month)`, `itemsForWeek(items, weekStartMs)`, `hoursWithItems(items) -> number[]`.
- `moveCalendarItem(item, atMs) -> Promise<{ ok; reason?; manageUrl? }>`: post → `movePost`; draft → `assignDraftSchedule(draftId, date, time)`; send → move its Marcus item (`rescheduleScheduledPublish(id, atMs)`, new in `marcusExecutionService.ts`, pending only).
- [ ] Tests: merging three sources with brand markers; filters; week hours; draft and send moves; needsYou flags. Commit `feat(content): calendar items from posts, drafts and sends`.

### Task 5: The Calendar page

**Files:** create `src/components/calendar/CalendarPage.tsx`, `MonthGrid.tsx`, `WeekGrid.tsx`, `CalendarSidePanel.tsx`; modify `Sidebar.tsx` (Work item `{ id: 'calendar', icon: CalendarDays, label: 'Calendar' }`), `App.tsx` (lazy route; `activeTab === 'calendar'`), `e2e-desktop/specs/smoke.e2e.mjs` (SPACES), `ContentCalendar.jsx` + `ContentCatalystWorkspace.jsx` + App (`onOpenCalendar` → "Open the Calendar").

- Month opens; Week switch; ‹ Today › navigation; brand chips (name, platforms, on/off) and a platform filter; chips coloured per Task 4; striped when `needsYou`.
- Drag with HTML5 drag events onto a day (month: `moveToDay`) or hour cell (week: `moveToSlot`); `movesOnPlatform` items open a confirmation `Modal` first: "Move to Thu 30 Oct 18:00? This changes the time on YouTube." / Cancel same with "Cancel this post on Facebook?".
- Side panel: brand marker, project, platform + piece, time with Change (`datetime-local`, same move path), status label, link (`openExternalUrl`), reason, `manageUrl` link when given, caption, Cancel, Open project (→ Miya Studio, `openContentProject`).
- Refreshes every 5 s and after each change; the result reason shows in the panel.
- [ ] Component tests: renders two brands' items in the month; Week shows only hours with items plus "No time"; brand chip hides a brand; dropping a draft on a day moves it; dropping a YouTube post asks, and Cancel in the dialog changes nothing; Change in the panel moves; a refused move shows the reason. Commit `feat(calendar): the Calendar page`.

### Task 6: Sign-in expiry

**Files:** create `src/services/contentFactory/signInExpiry.ts`; modify `ConnectorSetupPanel.tsx` (YouTube and Meta Save call `recordSignIn()`; YouTube: "My Google project is Published (no 7-day sign-in limit)" checkbox → `youtubeProjectPublished`), `marcusExecutionService.ts` (runner: once a day `checkSignIns()` → `tell()` warnings), `publishPost.ts` (a YouTube `invalid_grant` / "expired or revoked" or Meta OAuth code 190 → reason "Sign in to YouTube again in Settings → Connectors." / "Sign in to Meta again …"), `CalendarPage` (banner).

**Interfaces — Produces:**
- `recordSignIn(service: 'youtube' | 'meta', nowMs?)` (key `alphonso_sign_ins_v1`, times only).
- `getSignInExpiry(service, nowMs) -> Promise<{ expiresAtMs: number | null; exact: boolean }>`: YouTube = saved + 7 d unless Published (null); Meta = `metaTokenExpiry()` (exact) else saved + 60 d.
- `signInWarnings(nowMs, posts: ProjectPost[]) -> Promise<{ service; message; expiresAtMs; postsAfter: string[] }[]>`: YouTube within 2 days, Meta within 7, or expired; `postsAfter` = scheduled posts of that platform (and reminders) after the expiry.
- [ ] Tests: YouTube count and Published; Meta exact vs 60 days; warnings windows; posts after expiry listed; publishPost's plain messages; Settings saves the time on Save. Commit `feat(content): warn before YouTube and Meta sign-ins run out`.

### Task 7: Daily limits

**Files:** modify `contentTypes.ts` (`PostStatus` gains `'over_limit'`), `publishPost.ts` or the runner (`checkDailyLimit(post, nowMs) -> Promise<{ ok: true } | { ok: false; retryAtMs; reason }>` in new `src/services/contentFactory/dailyLimits.ts`), `contentPublishExecutor.ts` and `marcusExecutionService.ts` (call it before sending; over → post `over_limit` with the reason, runner item at `retryAtMs`), `contentPosts.ts` (`sentAtMs` set when a post is sent).
- Instagram: `instagramPublishingLimit()`; none left → retry in 1 hour, reason "Instagram's daily limit is reached (N posts in 24 hours); it goes when there is room."; the call failing → allowed (Instagram itself refuses if really over).
- Facebook: 30 Facebook posts with `sentAtMs` in the last 24 h → retry at the oldest + 24 h.
- [ ] Tests: Instagram none left / some left / call fails; Facebook 30th and 31st; the runner sends an `over_limit` post at its retry time. Commit `feat(content): respect Instagram's and Facebook's daily limits`.

### Task 8: Small fixes, docs, desktop spec, PR

- **Output folder:** reproduce first (a component test: `ContentFactoryPanel` re-rendered with a new `settings.outputFolder` re-runs `allowMediaFolder` for the new root in every tab that shows media; today only `SceneBuilderTab` does). Move the call to `ContentFactoryPanel`. Ledger the root cause found.
- **Runway estimate:** `contentProjectPlanSteps` puts `${CLIPS_WAIT_PAID} (about $X.XX)` in the clips step's `waitFor` (from `estimateRunwayUsd` over the chosen scenes); `approveContentStep('clips')` matches `waitFor.startsWith(CLIPS_WAIT_PAID)`. Test: the text reaches the request step.
- Docs: CLAUDE.md rows (calendar, moves, expiry, limits), CHANGELOG, DEFERRED_WORK (3b open items; 3c next; close the folded-in items), QA coverage, counts, dnd map.
- Desktop spec `content-calendar.e2e.mjs`: seeded posts of two brands show; a draft dragged to another day; an Instagram post moved with Change and cancelled; nothing posted.
- Self-review; PR; merge when green.
