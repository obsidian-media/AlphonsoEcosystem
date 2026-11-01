# Alphonso phone app, phase 2: check and approve the work

Owner's answers, 2026-11-01. Builds on phase 1 (`2026-10-31-alphonso-mobile-design.md`): the
relay, pairing, the computer's phone calls (`phoneCalls.ts`), the mirrored stores
(`phoneMirror.ts`), notifications and the lock all stay as they are and are extended.

## Why

The owner's main use: **check a piece of work on the phone before it goes out, and approve
it.** Videos first, but any kind of work the agents make. Phase 1 lets the phone approve a
waiting step; phase 2 lets it see what it is approving.

## Goals

1. **Open, check and approve any work** the agents make, the way the board shows it on the
   computer:
   - pictures and videos: scene pictures, thumbnails, carousel slides, AI clips, finished
     videos and Shorts;
   - writing and research: scripts, posts, emails, Hector's reports with numbered sources
     (a source opens in the phone's browser, through the same disguised-link warning as
     the computer), Nova's verdicts, Maria's and Sentinel's reviews;
   - sends before they go: Marcus's exact text and destination, and outside-tool calls.
2. **Fix it from the phone:**
   - Send back with a reason (typed, or by the keyboard's dictation); the agent redoes it,
     as Send back on the computer;
   - edit text yourself (a caption, title, hashtags, a draft's wording, a send's text), then
     approve;
   - pick which version (v1, v2, …) of a step to use.
3. **Miya Studio on the phone:** a project's steps and their versions, the reviews to
   approve, the posts list with Approve and schedule.
4. **The Calendar on the phone:** month and week, a post's details and status, move a post
   (a new day and time picked from a list; dragging is the computer's), Cancel (asks first).
5. **Start a project:** type the idea, pick the brand, tick what to make (video, Shorts,
   carousel), Run project. Everything else from the brand's defaults; the full brief stays
   on the computer.
6. **Notifications** say when a video or picture is ready to check, with a still picture
   from it. Tapping opens it; approving still happens inside the app.

## Non-goals (phase 2)

- Agents working on the phone itself: phase 4, as the spec has it (owner).
- Alphonso's code changes on the phone (owner didn't choose them; the board says
  "Open on your computer").
- Full-quality media on the phone; editing pictures or videos; dragging on the Calendar;
  brands, characters, engines and settings (phase 3).

## Anti-goals

- Approving something the phone hasn't shown. A step whose work can't be shown on the phone
  says so and offers "Open on your computer"; it is never approved blind.
- Silent overwrites (below).
- A data or relay bill from previews (below).

## Decisions

### Pictures and videos travel as phone-sized previews (owner)

- The computer makes a preview when the phone asks for it, and caches it beside the original
  (`<project>/phone-previews/…`, deleted with the project):
  - videos: about 480p, low bitrate, with sound, through the bundled ffmpeg (the same
    `run_ffmpeg()` path as the content factory; never a shell);
  - pictures: a JPEG of at most 1080 pixels on the longer side.
- Sent through the relay, sealed end to end like every other message, in pieces under the
  relay's 4 MB message limit; the phone puts them back together and checks a hash before
  showing it. Full quality never leaves the computer.
- **Data:** on Wi-Fi everything loads; on mobile data a preview over 20 MB shows its size and
  asks first (owner).
- **Kept on the phone** until the post goes out or is rejected, then deleted (owner).
- **Relay budget:** previews count against the device's daily limit (200 MB); when a preview
  would pass it, the phone says so ("Today's limit for previews is used up; it resets at
  midnight UTC."). The relay's monthly outbound traffic past 1 GB is billed: the budget
  alert covers it, and the design doc's cost line is updated with an estimate per preview.

### Changing the same thing on both (owner)

Every change the phone sends carries the version it was based on (a post's `updatedAtMs`, a
step's version number, a send preview's hash). If the computer changed it meanwhile, the
change is refused: "This changed on your computer; here's the latest." Nothing is
overwritten silently.

### Everything goes through the computer's own functions

As in phase 1: each new phone call maps to the function the computer's screen uses
(`approveContentStep`, `rejectPiece`, `retryWithReason`, `updatePost`, `movePost`,
`cancelProjectPost`, `runContentProject`, the step's version choice, `editCodeFile`'s
equivalent for a send's text). The phone never gets a function the computer doesn't have.
Locked effects (spend, publish or send, delete) keep phase 1's rule: approved only inside the
app after Face ID or the fingerprint, never from a notification.

## Constraints

- Phase 1's rules hold: sealed messages, the computer decides, keys never cross the relay,
  plain words on screen, no hardcoded names, addresses or model lists.
- The free relay VM: previews are made on the computer, never on the relay; the relay only
  forwards pieces.
- iOS 16.4 / Android 8.0 minimums; video playback with the platform's own player in the web
  view.

## Left to the builder

- The preview's exact bitrate and piece size, within "phone-sized" and the 4 MB message limit.
- How the phone's Miya Studio and Calendar screens are laid out (one column, the desktop's
  colours), reusing the desktop components where they fit a phone.
- Which mirrored stores carry the content factory (projects, posts, calendar items) and how
  their changes are batched.
- The still picture in a notification: made on the computer, sealed with the notice, within
  the push services' size limits (else text only).

## Checks

- Unit tests per new phone call (refused when stale, locked effects not approvable from a
  notification, approved twice runs once).
- An end-to-end test over the real relay, as in phase 1: a preview in pieces arrives whole;
  a stale caption edit is refused with the latest.
- The owner checks on real phones: open a video preview and approve the posts; send back a
  script with a reason; move a post; start a project; open a research report and a source.
