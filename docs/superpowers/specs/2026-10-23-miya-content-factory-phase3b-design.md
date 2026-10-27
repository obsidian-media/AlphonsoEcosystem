# Miya content factory, phase 3b: the calendar, moving posts, sign-in expiry

> **Status (2026-10-25):** built and merged in PR #349 (phase 3b); released in 2.10.0 (2026-10-27). What it leaves open is in `docs/governance/DEFERRED_WORK.md`; the current behaviour is described in `CLAUDE.md`'s Do Not Duplicate rows and `docs/USER_MANUAL.md` section 8.

Date: 2026-10-23. Builds on phase 3a (`2026-10-23-miya-content-factory-phase3a-design.md`):
the posts list, `publishPost()`, Marcus's runner and the Publish step. Phase 3 is
split in three (owner, 2026-10-23): **3a** publishing (done), **3b** this
document, **3c** the owner's own S3-compatible storage, carousels, Instagram Login
and Shorts as their own pieces.

## Intent

One place to see and change everything that is going out, across all brands,
and no post that quietly fails because a sign-in ran out or a daily limit was
reached. Alphonso is for many users: nothing assumes one person's brands,
platforms or schedule.

## Owner decisions (2026-10-23)

1. **A Calendar page of its own**, in the sidebar's Work space, for all brands.
   Content Studio's small calendar (`ContentCalendar.jsx`) opens it.
2. **What it shows:** every brand and project's posts, Content Studio's
   scheduled drafts, and Marcus's other scheduled sends; filterable by brand
   and platform.
3. **Layout** (chosen from mockups, `.superpowers/brainstorm/…/calendar-mix-v2.html`):
   - opens on the **month**; a **Week** switch shows the same posts by the hour
     (only hours that have posts, plus a "No time" row);
   - a **side panel** in both views for the selected post: brand, project,
     platform and piece, time (Change), status (with the link or the reason),
     caption, Cancel, Open project;
   - **platform by colour** (YouTube, Instagram, Facebook, Content Studio/other),
     **brand by a small marker** (initials and the brand's colour);
   - **brand chips** at the top, each listing the brand's platforms, turn brands
     on and off; a platform filter beside them;
   - a post that needs you (kept private by YouTube, failed, check, waiting for
     you, over a daily limit, sign-in running out) is drawn striped.
4. **Dragging:** a draft, an Instagram post (sent by Alphonso) or a Marcus text
   send moves at once. A post already scheduled on YouTube or Facebook asks
   first ("Move to Thu 30 Oct 18:00? This changes the time on YouTube."), then
   Alphonso changes it on the platform and shows what the platform really did.
   Cancel works the same way for those.
5. **Sign-in expiry, YouTube and Meta:** Alphonso knows when each sign-in runs
   out, warns a couple of days before (in the app and on Telegram), warns when a
   scheduled post or reminder falls after that date, and says plainly "Sign in
   to YouTube again" (or Meta) when it has run out.
6. **Daily limits:** a post that would go over the platform's daily limit waits
   and says why, instead of failing.
7. **Small fixes folded in:** a new output folder is picked up without reopening
   Miya Studio; Runway's dollar estimate is shown on Telegram and the board when
   asking to approve AI clips.

## What exists (checked 2026-10-23) and what 3b does with it

| Exists | Where | 3b |
|---|---|---|
| Posts per project, `updatePost()`/`cancelPost()` (refuse a post scheduled on the platform) | `contentPosts.ts` | the calendar reads and changes posts through these; the platform-scheduled case now moves/cancels on the platform |
| Marcus's runner (content posts, reminders, text sends) | `marcusExecutionService.ts` | listed on the calendar; moving an Instagram post or a text send moves its item |
| YouTube upload, read-back | `youtube.rs` | gains changing a scheduled video's `publishAt` and making it private again (cancel) |
| Facebook Reels | `meta_video.rs` | gains changing or cancelling a scheduled Reel, if Meta's API allows it (builder checks) |
| Content Studio's month calendar | `ContentCalendar.jsx` | its drafts appear on the new page; it gains "Open the Calendar" |
| Saved connector keys | `connectorAuth.ts` | the time a YouTube or Meta sign-in was saved is remembered (not the secret) |
| Runway estimate | `estimateRunwayUsd()`, `joseTelegram.ts`, `JoseRequestsBoard.tsx` | the clips step's waiting text carries the estimate |
| Miya Studio's media folder | `allowMediaFolder()` / `mediaUrl()` | re-run when Settings' output folder changes |

## Goals

- The Calendar page as described above, at phone and desktop widths of the app
  window, keyboard reachable (a post can be moved with the side panel's Change,
  not only by dragging).
- Moving and cancelling posts already on YouTube or Facebook from Alphonso, with
  the platform's answer saved on the post.
- Sign-in expiry known and warned for YouTube and Meta; a post due after the
  expiry is flagged on the calendar.
- Daily limits respected: Instagram's real remaining count, Facebook Reels
  counted.
- The two small fixes.

## Non-goals

Carousels, storage, Instagram Login and Shorts as their own pieces (phase 3c);
analytics (phase 4); TikTok, LinkedIn, X; editing a post that has already gone
out.

## Anti-goals

- Changing anything on a platform without the user's confirmation.
- Showing a move or a cancel as done before the platform confirms it.
- A post that fails at its time because of an expired sign-in or a limit the app
  could have seen coming.

## Constraints

- Build on what exists (table above); one calendar, one runner, one publishing
  path. Do not add a second scheduler or a second post store.
- Platform changes go through the backend (`youtube.rs`, `meta_video.rs`) with
  the saved keys (`secret_or_env`).
- Times are the user's local time on screen; stored as milliseconds.
- Windows first; English.

## The builder's calls (marked as such; the owner may change them)

- **Month drag keeps the time of day**; the week view changes the hour too. A
  post that has already gone out cannot be dragged.
- **Brand colour:** the brand's first palette colour, else a colour from a fixed
  set by brand order; initials from the brand name.
- **YouTube expiry:** Google does not report when a refresh token ends. Alphonso
  remembers when the YouTube keys were saved and counts 7 days (Google's limit
  for a project in Testing); the warning says so ("about"), and the Settings
  screen lets the user say the project is Published (then no 7-day count, only
  "sign in again" when YouTube refuses). Warned 2 days before.
- **Meta expiry:** read from Meta (`debug_token`, which needs the app secret or
  an app token); without it, 60 days from when the keys were saved. Warned 7
  days before.
- **Daily limits:** Instagram's remaining count from
  `/<IG user>/content_publishing_limit` just before sending; Facebook Reels 30 in
  24 hours counted from the posts Alphonso made. A post over the limit becomes
  "waiting" with the time it can go, and the runner sends it then.
- **Moving on Facebook:** if Meta's API cannot change a scheduled Reel's time,
  Change and Cancel for it say so and link to Meta Business Suite (nothing is
  changed); the builder checks this against Meta's current reference first.
- **The move/cancel question is the approval:** the post was approved in the
  Publish step; changing its time or cancelling it on the platform is asked in
  the calendar's own confirmation (not a new Jose request), and recorded on
  Marcus's audit trail (`appendConnectorAudit`) with the old and new time.
- **Runway estimate:** the clips step's `waitFor` text includes "(about $X.XX)",
  which Telegram and the board already show.

## Testing

Unit tests for the calendar's data (posts, drafts and sends merged; filters),
moving and cancelling (each kind; the platform's answer saved; refused cases),
expiry (YouTube count, Meta read, warnings and flags), limits (waiting with a
time), the folder fix and the estimate text. Rust tests for the new YouTube and
Meta request helpers. A desktop spec: the Calendar page shows seeded posts of two
brands, a draft is dragged to another day, the side panel moves an Instagram post
and cancels it; nothing is posted. Moving a real scheduled YouTube video or
Facebook Reel is checked by hand with the owner's accounts.
