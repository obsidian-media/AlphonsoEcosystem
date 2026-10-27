# Miya content factory, phase 4a: learning from real results

> **Status (2026-10-25):** built and merged in PR #352 (phase 4a); released in 2.10.0 (2026-10-27). What it leaves open is in `docs/governance/DEFERRED_WORK.md`; the current behaviour is described in `CLAUDE.md`'s Do Not Duplicate rows and `docs/USER_MANUAL.md` section 8.

Date: 2026-10-24. Builds on phases 1–3d (`2026-10-22-miya-content-factory-design.md`, §7 "Learning" and §8 phase 4).
Phase 4 is split: **4a** (this document: performance numbers, lessons, ideas, better post times, and the phase 3d
leftovers) and **4b** (ElevenLabs and Higgsfield connectors, designed separately; the owner's answers for 4b are kept
at the end so they are not lost).

## 1. Why

Today a brand learns only from the owner's own reviews (rejection reasons become brand lessons). Phase 4a adds what
the audience actually did: how many people watched, saved and shared each post. Alphonso is a product for many
people, so every choice below works for any brand and any account; nothing is fixed to the owner's accounts.

Success: a week after a post goes out, the user sees its numbers next to the brand's usual numbers, gets a short
"what worked / what didn't" proposal to keep or drop, sees follow-up ideas, and, once there is enough history,
better posting times to accept.

## 2. Decided by the owner

| Topic | Decision |
|---|---|
| What the numbers are for | All four: show them, learn from them, suggest next ideas, pick better post times |
| When they are fetched | Fixed checkpoints: 1 hour, 1 day, 7 days and 30 days after a post went out, then never again |
| Extra permissions | A banner per service ("Sign in again to see YouTube numbers") until that service is signed in again; posting keeps working without it |
| Lessons | Miya proposes, the user approves: after the 7-day check Miya and Nova write lessons; the user keeps, edits or drops each before it reaches prompts |
| Good or weak | Compared within the brand: against the brand's own median on the same platform at the same checkpoint; post-time suggestions need at least 5 posts on that platform |
| Where numbers show | The project's Posts list, the Calendar side panel, and a results table per brand |
| Ideas | Nova's follow-up ideas in an Ideas list in Miya Studio; one click starts a project from an idea |
| Post times | Suggested slots the user accepts into the brand's posting slots; nothing changes by itself |
| Telegram | The 7-day summary (with the proposed lessons to keep or drop) and new ideas (with a Start project button) |
| Runway Shorts | Shorts with Runway clips wait for one approval per Shorts run, with the cost, then use Runway |
| Fonts | Captions, hooks and slide text use the brand kit's font (any font installed on the computer); Arial when none is set |
| Shorts on the Calendar and in the step | A "Short" badge on Calendar chips; the Shorts step ends "done, 1 of 3 failed" with the failed Short flagged |
| Add a Short | Asks which kind: mini-script (Miya writes just that one), highlight or cut |
| Redo | Waits for the Short being made, instead of failing with "already exists" |
| CodeQL | Alerts 26, 33, 34 and 36 are dealt with in this phase |

## 3. Goals, non-goals, anti-goals

Goals: the four uses above, the five leftovers, the four CodeQL alerts.

Non-goals (4a): ElevenLabs, Higgsfield (4b); a CapCut export (owner: skipped this phase); ads performance; paid
analytics services; numbers for posts made outside Alphonso; comments' text.

Anti-goals (what would make this a failure even if it works):
- A lesson reaching a prompt without the user keeping it.
- A posting time changed without the user accepting it.
- A number shown as real when it was estimated, missing or stale ("—" and the reason instead).
- A post failing, or a sign-in being forced, because the reading permissions are missing.
- Fetching on every app start or every minute, burning the platforms' quotas.

## 4. Performance numbers

### 4.1 Which posts

Every post Alphonso put on a platform and has an id for: the content factory's posts (`ProjectPost.platformId`,
YouTube, Instagram on either route, Facebook Reels and carousel photo posts) and Content Studio's posts that went
out through `publishPost()` (their platform ids are read where Content Studio already keeps them; my call). Posts made outside Alphonso, posted by hand (`by_hand`), cancelled or failed are left out.
A post saved by hand that the user later marks as posted is a 4a+ idea, not in scope.

### 4.2 When

Checkpoints `1h`, `1d`, `7d`, `30d` from `sentAtMs` (when it went out; a scheduled YouTube/Facebook post counts from
its publish time). Marcus's runner, which already runs every minute while the app is open, checks which posts have a
checkpoint due and fetches them, a few at a time. A checkpoint missed while the app was closed is fetched once at the
next start (its numbers are labelled with the time they were actually read). After `30d` nothing more is fetched. A
"Refresh" on a post fetches now without changing the schedule (my call: useful when checking a post by hand; limited
to once per 10 minutes per post).

### 4.3 What

| Platform | Numbers |
|---|---|
| YouTube (video or Short) | views, watch time (minutes), average view length, likes, comments, shares, subscribers gained |
| Instagram (Reel or carousel) | views, reach, likes, comments, saves, shares |
| Facebook (Reel or photo post) | views, reach, reactions, comments, shares |

Exact metric names and endpoints are for the builder to check against each platform's current documentation (YouTube
Analytics API `reports.query`; Instagram media insights on the Graph API and on Instagram Login; Facebook video and
post insights). A metric a platform no longer offers is shown as "—" with "not available from <platform>", never 0. A post deleted on the platform shows "—" with "removed from <platform>" and gets no further checkpoints (my call).

### 4.4 Permissions

Reading needs scopes the current sign-ins (`oauth_signin.rs`) don't ask for:
- YouTube: `https://www.googleapis.com/auth/yt-analytics.readonly`.
- Meta (Page route): `instagram_manage_insights` and `read_insights`.
- Instagram Login: `instagram_business_manage_insights`.

They are added to the sign-in scopes, so a new sign-in includes them. An account signed in before 4a has posting
permissions only: when a read is refused for permissions, the service is marked "needs sign-in for numbers", and a
banner (project, Calendar, brand results) says "Sign in again to see <service> numbers" with the Settings link. The
user's own Google project / Meta app must also have these permissions enabled; the sign-in steps in `SignInPanel.tsx`
say so. Posting is never affected.

### 4.5 Where they are kept and shown

Kept on the post (`ProjectPost.metrics: { [checkpoint]: { readAtMs, values } }`), and for Content Studio posts beside
the draft. Shown:
- On the Posts list: the latest checkpoint's main numbers, with "good" / "weak" / "usual" against the brand (§5).
- In the Calendar side panel: every checkpoint for that post.
- On a new **Results** view per brand (in the Brands tab, my call on placement): one row per post with its 7-day
  numbers, the brand's median per platform, and the 7-day lessons waiting for a decision.

## 5. Good, weak, usual

A post's number at a checkpoint is compared with the median of that brand's posts on the same platform at the same
checkpoint. "Good" above 1.5 × median, "weak" below 0.5 × median, "usual" otherwise (my call on the bands; kept in one
place so they can change). With fewer than 3 earlier posts on that platform there is no comparison yet ("First posts:
nothing to compare with yet"). The main number per platform is views (my call).

## 6. Lessons

After a post's 7-day checkpoint, Miya and Nova are asked (through Jose, as a one-step request each, like the other
factory steps: Nova `analysis_performance`, Miya `creative_lessons`; my call on the task types) with the post, its
script, hook, thumbnail choice, posting time and its numbers against the brand's median. They answer with up to 3
"what worked" and 3 "what didn't" lessons, each a short sentence tied to something the brand controls. The two lists are merged and near-duplicates dropped (my call).

The lessons are saved as **proposed**: the brand's `lessons` gain `status: 'proposed' | 'kept'` and `source:
'performance'` (existing lessons count as kept). Only kept lessons go into prompts. The user keeps, edits or drops each
one on the brand's Results view or on Telegram (§8). A post whose numbers are missing gets no lessons.

## 7. Ideas and post times

**Ideas.** After a post's 7-day checkpoint is "good", Nova proposes up to 3 follow-up ideas (a sequel, the same hook on
another topic, a Short from it). They go to a new **Ideas** list in Miya Studio (my call: a section of the Brands tab,
filtered by brand, rather than a new tab). Each idea has "Start project" (creates a project with the idea as its brief
and the brand) and "Dismiss".

**Post times.** Once a brand has at least 5 posts with 7-day numbers on a platform, Nova suggests up to 3 posting slots
(weekday and hour) from when its good posts went out, with the reason ("4 of your 5 good Reels went out on Thursday
evenings"). They show in the Brands tab's posting slots as suggestions; "Use this slot" adds it to `postingSlots`.
Nothing changes otherwise.

## 8. Telegram

Two new kinds in `collectJoseNotifications()`'s neighbour for content (my call: a `contentTelegram` collector next to it,
using the same sent log and button tokens, each kind with an on/off switch in Settings → Approvals → "Jose on
Telegram"):
- **7-day summary**, at most one message a day covering every post that reached 7 days that day (my call, so a busy brand isn't flooded): "Launch video (YouTube): 12,400 views, best of the month for Acme." plus the proposed lessons, each
  with Keep / Drop buttons.
- **New ideas:** each idea with Start project / Dismiss.
Only the paired chat may press them, as today.

## 9. The phase 3d leftovers

- **Runway clips in Shorts.** When the Shorts' clip setting is Runway, the Shorts step waits once per run with the cost
  of every Runway clip in it ("Make 6 Runway clips for 3 Shorts, about $X"), the same way the AI clips step does
  (`spend` effect, one approval, the monthly cap), then makes them; without approval the Shorts are made with pictures
  and say so.
- **Fonts.** The brand kit's font (`ContentBrand.fonts`, the first font named) is used for burned-in captions, hook
  text and slide text. A font not installed on the computer falls back to Arial with a note on the step. The builder
  checks how ffmpeg's subtitles filter finds a font on Windows (font name vs file) and how the canvas renderer loads
  it.
- **Shorts on the Calendar.** A post with `shortId` shows a "Short" badge on its chip and in the side panel.
- **Shorts step honesty.** When some Shorts failed, the step ends done with a summary "done, 1 of 3 failed", the
  failed Short is flagged in Shorts Studio and on the board.
- **Add a Short** asks which kind. Mini-script: Miya writes just that one Short (a one-step request with the project's
  research and script), then it is made. Highlight or cut: as today, from the middle of the finished video.
- **Redo** while another Short is being made waits its turn (a queue), then runs, instead of failing.

## 10. CodeQL

- **26** (`boardroomThreadService.ts`, clear-text storage after `secretDetected`): store only the redacted text when a
  secret is detected, never the original; if the code already does that, prove it with a test and dismiss the alert
  with that reason.
- **33, 34** (`commands/bridge.rs`, token over plain http): refuse a non-loopback `http://` bridge address (https
  required off this computer). A loopback address stays allowed (ACC runs locally); dismiss the remaining alerts with
  "loopback only, enforced in code" after the check exists and is tested.
- **36** (`contentStepPrompts.ts`, dynamic method by name): look the action up only in its own table (an own-property
  check or a Map), and refuse an unknown action type with a plain error.

## 11. Constraints

- Everything through the existing paths: Marcus's runner for the schedule, `publishPost()` posts, Jose requests for
  agent work, `generateAgentLlmResponse()`, the connector keys in Settings, `secret_or_env()` in Rust, the Telegram sent
  log and button tokens. No second scheduler, no second store for posts.
- Network calls to YouTube and Meta from the backend only (as today), with the saved keys.
- The platforms' quotas: checkpoints only, a few posts per minute, one retry per checkpoint after an hour on a
  temporary error.
- Docs in the same commits; desktop spec for the new screens (seeded numbers, nothing fetched for real).

## 12. Left to the builder

Exact metric names and endpoints per platform; the median and band code; screen layout of the Results view and Ideas
section; how fonts are resolved for ffmpeg and the canvas; the queue for Redo; test names.

## 13. Phase 4b (recorded now, designed later)

- **ElevenLabs:** voice-over voices (a brand can choose one instead of Kokoro), the user's own cloned voice from their
  ElevenLabs account, and sound effects per scene.
- **Higgsfield, as a full connector:** every AI clip (a third engine next to local ComfyUI and Runway, for scenes and
  Shorts); pictures (scene pictures, thumbnail backgrounds, carousel slides) as an **additional option, never instead of
  ComfyUI**, chosen by the user; asked by name anywhere ("make a Higgsfield video of…" from Chat, Telegram or the board
  becomes a Miya step through Jose); and its own special models (e.g. motion transfer, character consistency) where they
  fit in Miya Studio. Its API (docs.higgsfield.ai, 2026-10-24): images and videos at `api.higgsfield.ai`, `Authorization:
  Key <id>:<secret>`, asynchronous (request id, status URL, cancel URL), inputs at a public URL or uploaded to Higgsfield
  first, outputs kept 7 days.
- **Cost:** the user enters prices for both (per image, per second, per 1,000 characters) in Settings → Approvals;
  every run asks first with "about $X", inside the one monthly cap.
- **CapCut:** skipped this phase (owner).
