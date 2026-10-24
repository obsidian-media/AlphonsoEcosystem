# Miya content factory, phase 3d: Shorts as their own pieces

> **Status (2026-10-25):** built and merged in PR #351 (phase 3d); on `main`, not released yet (2.10.0 isn't tagged). What it leaves open is in `docs/governance/DEFERRED_WORK.md`; the current behaviour is described in `CLAUDE.md`'s Do Not Duplicate rows and `docs/USER_MANUAL.md` section 8.

Date: 2026-10-24. Builds on phases 2a–3c. Alphonso is a product for many people
(owner): every choice below is the user's, with sensible defaults.

## Intent

A project's Shorts and Reels should be pieces made for short vertical video, not just
the long video turned sideways. A 5-minute video's 9:16 version isn't a YouTube Short
(over 3 minutes) and is refused as a Facebook Reel (over 90 seconds). Each Short gets
its own script or moment, its own hook, its own length, its own copy and its own
platforms.

## Platform limits (checked 2026-10-24, official sources)

| Where | Accepted | Source |
|---|---|---|
| YouTube Short | square or vertical, up to 3 minutes (longer, or wide: a regular video) | support.google.com/youtube/answer/15424877 |
| Facebook Reel (`video_reels`) | 3–90 seconds; 9:16, 1080×1920 recommended (540×960 at least) | developers.facebook.com/docs/video-api/guides/reels-publishing |
| Instagram Reel (Graph API) | 3 seconds – 15 minutes, 300 MB at most, MP4/MOV H.264, 9:16 recommended | developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media |

## Owner decisions (2026-10-23 and 2026-10-24)

1. **Three kinds of Short, chosen per Short** (a project can mix them):
   - **Mini-script** (the default for a new Short): Miya writes its own 30–60 s script,
     with **its own new scenes** (pictures, and AI clips per its own setting), its own
     voice-over in the brand voice, music and captions, assembled as one 9:16 video.
   - **Highlight**: Miya picks a strong moment of the finished video and writes **a new
     hook**, spoken (Kokoro) over the first seconds **and** shown as big on-screen text;
     then the moment plays.
   - **Plain 9:16 cut**: a part of the finished 9:16 video, as it is.
2. **How many:** the number in the brief ("3 Shorts" in What to make), else one.
3. **Length:** 30–60 s, so one file fits every platform.
4. **Platforms chosen per Short** (in Shorts Studio), starting with the project's platforms.
5. **AI clips for mini-script Shorts have their own setting** (main moments / every scene /
   none, engine local or Runway), separate from the long video's.
6. **Copy:** Miya writes each Short's own title, caption and hashtags per platform with the
   Short; the campaign step stops writing the single Short copy.
7. **Shorts Studio:** a new Miya Studio tab to review and edit Shorts.
8. **When:** Run project includes the Shorts step when What to make says Short(s) or Reel(s);
   otherwise it runs from Shorts Studio.
9. **The long video's 9:16 version keeps posting too** (as today), alongside the Shorts,
   now within the platform limits above.
10. **Folded in** (owner, 2026-10-24):
    - **Length limits:** every vertical post is checked against the table before it is
      made into a post and before it is sent: a platform it doesn't fit is skipped with a
      plain note (e.g. "Not a Facebook Reel: it is 4:12 long; Facebook takes 3–90 seconds.").
      A vertical video over 3 minutes goes to YouTube as a regular video, saying so.
    - **Small graphics cards:** on a card with under 8 GB, AI clips are made smaller and
      shorter automatically, and Alphonso says so; a setting under Runtime Hub's video
      models makes them full size anyway.
    - **Runway estimate on full runs:** the AI clips step's cost estimate is filled in once
      the scenes exist, so Telegram and the board show it on Run project too.
    - **Small leftovers:** Facebook's 30-a-day count covers Reels only (not photo posts); a
      wrong pasted sign-in address no longer uses up the sign-in; an Instagram post with no
      way in (no Page keys, no Instagram Login) is saved to post by hand instead of failing.
    - **CodeQL:** the three `js/insecure-randomness` alerts (`claudeService.ts`,
      `chatgptService.ts`) and `rust/cleartext-transmission` in `meta_video.rs`
      (`meta_instagram_limit`) are fixed or, if a false alarm, rewritten so the reason is
      plain in the code.

## What exists (checked 2026-10-24) and what 3d does with it

| Exists | Where | 3d |
|---|---|---|
| Script, scenes, voice, music, clips, assemble steps | 2a/2b | a mini-script Short runs the same making on its own small plan |
| `content_assemble_video` (16:9 and 9:16, captions, checks) | `media_tools.rs` | a vertical-only assembly for a Short; a trim-and-hook assembly for highlights and cuts |
| Kokoro voice-over, Whisper caption timing | 2a | the Short's voice and the highlight's hook line |
| AI clips (`clipEngine.ts`, `runClips()`) | 2b | per-Short with the Shorts' own setting |
| `buildPosts()`, `publishPost()`, Marcus's runner, Calendar | 3a–3c | Shorts become posts (`piece: 'short'` on YouTube, `'reel'` on Instagram/Facebook) with the limits check |
| The campaign's `short` copy | 3a | read for older projects only |

## Goals

- A Shorts step (Miya) that plans N Shorts, and makes each one's file.
- Shorts Studio: list of Shorts; per Short its kind, platforms, script or moment, hook,
  length per platform (fits / doesn't), the player, copy, Redo, Send back with a reason;
  Add a Short; the Shorts' AI clip setting.
- Posts for every Short on its chosen platforms, within the limits; the long video's 9:16
  posts kept, within the limits.
- The folded-in items above.

## Non-goals

Analytics (phase 4); TikTok; per-platform different cuts of one Short; music other than
the project's bed; editing a Short frame by frame.

## Anti-goals

- A post the platform will refuse for its length, discovered only when sending.
- A Short that silently isn't a Short (YouTube treating it as a regular video) without saying so.
- Shorts redoing work the user didn't ask for (each Short is made and redone on its own).

## Constraints

- One making path: reuse the 2a/2b executors and commands; no second pipeline.
- One publishing path (`publishPost()`), one runner, one calendar.
- Every ffmpeg run through the existing job-file approach (no shell, no text on a command line).
- Pictures and clips one at a time (the GPU is shared with Ollama).
- Windows first; English.

## The builder's calls (marked as such; the owner may change them)

- **Step and order:** `shorts` (Miya, `creative_shorts`, `write_own_work`) after
  `assemble` in `STEP_ORDER` (before `carousel`), so it never puts the long video out of
  date; the template step needs `assemble`; `campaign` no longer needs to wait for it.
- **Making a Short is a sub-run inside the Shorts step**, one Short at a time: plan (Miya
  writes all N Shorts' kinds, scripts or moments, hooks and copy), then per Short its
  pictures, clips, voice and assembly. Redo makes one Short again.
- **Highlight audio:** the original track lowered (about −12 dB) under the hook line, then
  back to normal; the hook text shows for the hook's length.
- **Plain cut:** Miya picks the part (30–60 s) like a highlight but adds nothing.
- **Small card:** under 8 GB of graphics memory → clips at the model's lower resolution and
  at most 3 s; "Full size clips on this card" in Runtime Hub's video models turns it off.
- **Runway estimate:** when the Scenes step saves, the waiting clips step's
  `costEstimateUsd` on the request is set from the chosen scenes.
- **Shorts Studio tab** after the Scene Builder.
- **Posting times:** each Short's posts get the brand's next free slots, as other posts do.
- **Files:** `<project>/shorts/<short-id>/` (pictures, clips, voice, `v<n>.mp4`).

## Testing

Unit tests for the Shorts plan and its parsing (count from the brief, kinds, 30–60 s,
hook ≤ 12 words), the per-platform limit check (each boundary: 2.9 s, 3 s, 90 s, 90.1 s,
180 s, 180.1 s, 15 min, 300 MB), posts for Shorts on chosen platforms, the long video's
9:16 posts within limits, the highlight and cut assembly runs (Rust, job building only),
the small-card choice, the Runway estimate on the request, the Facebook count, the pasted
sign-in, the no-route hand posting, and the CodeQL fixes. Desktop spec: Shorts Studio with
seeded Shorts shows each kind and its fit per platform, a Short's platform is unticked and
saved, the Posts list has the Shorts and skips a platform a Short doesn't fit; nothing is
posted. Real making (Kokoro, ComfyUI, ffmpeg) is in the combined live check.
