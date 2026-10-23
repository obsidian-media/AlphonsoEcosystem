# Miya content factory, phase 3a: publishing

Date: 2026-10-23. Builds on phases 1, 2a and 2b (`2026-10-22-miya-content-factory-design.md`
§8 phase 3; owner decisions Q19, Q20, Q21). Phase 3b (later): the carousel and
the full month calendar page with drag to reschedule.

## Intent

A finished project goes out on the user's channels at good times, with one
approval, and nothing is posted without it. Alphonso is a product for many
users, so nothing assumes one person's accounts, channels or schedule.

## Owner decisions (2026-10-23)

1. **Platforms:** YouTube (the 16:9 video; the 9:16 as a Short) and Instagram
   + Facebook (the 9:16 as a Reel). Not TikTok, LinkedIn or X in this phase.
2. **Who and when:** after the quality gate the user reviews the project's
   posts (platform, piece, caption, time) and approves once; Marcus posts each
   at its time.
3. **Calendar:** suggested times the user can edit: Nova's suggestions plus the
   brand's fixed schedule. (A full month calendar page comes in 3b.)
4. **Derivatives:** the Short / Reel from the 9:16 video, with its own title,
   caption and hashtags. (The carousel comes in 3b.)
5. **Ad copy:** per network (Meta Ads, Google Ads, YouTube Ads) a CSV in the
   format its bulk import accepts, plus a copy button per ad. No ad accounts
   are touched.
6. **App closed at a post's time:** it goes out at the next start, and the user
   is told (in the app, and on Telegram when set up).
7. **YouTube visibility:** uploaded early as private with YouTube's own
   scheduled publish (`publishAt`), so it goes public on time even with the
   app closed.
8. **YouTube's lock on unverified apps** (owner agreed to this plan): every
   user signs in with their own Google Cloud project, and YouTube keeps uploads
   from an unaudited project private, whatever the app asks. After each upload
   Alphonso reads back the video's real status; a locked channel is remembered,
   and from then on its posts are uploaded private and, at the time, the user
   gets a reminder (in the app and on Telegram) with a direct YouTube Studio
   link to make the video public. A short guide explains the audit.

## Goals

- A **Posts** list per project (Campaign Studio): one row per platform and
  piece, with caption, hashtags, title (YouTube), the time, and the target
  account. Times start from the brand's posting slots, then Nova's suggested
  times; every field is editable until approved.
- A **Publish** step after Quality (Marcus, `distribution_schedule_posts`,
  `publish_or_send`, so it always asks): approving it schedules everything at
  once. YouTube uploads now (private + `publishAt`, plus the project's chosen
  thumbnail); Facebook uses the Page's own scheduled publishing; Instagram
  posts are kept by Alphonso and sent at their time (Meta's API cannot schedule
  them).
- Each post's state is visible (scheduled, posted with its link, locked
  private, waiting for the app, failed with the reason) and can be cancelled
  before it goes out.
- Ad copy CSVs written to `<project>/campaign/ads-<network>-v<n>.csv`.

## Non-goals

TikTok, LinkedIn, X; the carousel; a month calendar page; analytics or
performance numbers (phase 4); creating or spending on ads.

## Anti-goals

- Anything posted without the user's approval of that exact list.
- Saying "posted" or "public" when the platform did not do it (read back the
  real status).
- Fixed accounts, times or formats that fit only one user.

## Constraints

- Build on what exists: `youtube.rs` (upload; gains `publishAt`, thumbnail,
  status read-back, resumable upload if the file needs it), `meta_publish.rs`
  (Instagram/Facebook; gains Meta's resumable upload for local Reels files,
  which needs an app with Facebook Login for Business, and Facebook scheduled
  posts), `marcusPublishService` / `marcusExecutionService` (Marcus's publish
  packets and his scheduled-publish store: extend it, do not add a second
  one), the YouTube and Meta sign-in scripts and connector keys, Jose's
  approvals by effect, Telegram notifications.
- Keys come from the user's saved connector credentials (`secret_or_env`).
- Every post and its result is recorded in the project and on Marcus's audit
  trail; nothing is retried in a way that could post twice.
- Windows first; English.

## The builder's calls (marked as such; the owner may change them)

- **Brand posting slots:** the brand's free-text "schedule" becomes structured
  slots (platform, day of week, time) edited in the Brands tab; the old text is
  kept as a note. A post's default time is the next free slot for its
  platform, else Nova's suggested time, else the next day at 18:00 local.
- **Short / Reel copy:** the campaign step also writes the Short's title,
  caption and hashtags (Miya), so the derivative is its own complete piece.
- **Ad CSV formats:** Meta Ads Manager bulk import and Google Ads Editor
  (Google and YouTube); the builder confirms the current column names from the
  official templates before pinning them.
- **Instagram while the app is closed:** sent at the next start (owner
  decision 6), once, with a note; a post more than 7 days late asks first.
- **Thumbnail:** the Thumbnail Studio's first non-rejected thumbnail, unless
  the user picks another in the Posts list.

## Testing

Unit tests with YouTube and Meta mocked (scheduling, read-back of a locked
private video, Instagram at next start, no double posting, cancel, CSVs). A
desktop spec for the Posts list and the approval (no real posting). Real
posting is checked by hand with the owner's accounts.
