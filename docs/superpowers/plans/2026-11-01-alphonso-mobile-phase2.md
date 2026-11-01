# Phone App Phase 2 (check and approve the work) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the phone, open, check, fix and approve any work the agents make (pictures and videos as phone-sized previews, writing and research, sends before they go), plus Miya Studio's steps and posts, the Calendar, and starting a project.

**Architecture:** Phase 1's link carries everything: a new mirrored store `content` (projects, brands, calendar) and new phone calls, each mapped to the computer's own function and refused when what it was based on has changed. Previews are made on the computer by the bundled ffmpeg, cached beside the project, and fetched by the phone in sealed pieces under the 4 MB message limit through one call (`media.preview`). New phone screens reuse the desktop's components where they fit one column.

**Tech Stack:** React + TypeScript (shared desktop/phone), Capacitor 8 (`@capacitor/network`, `@capacitor/filesystem`), Rust (Tauri commands in `media_tools.rs`), the bundled LGPL ffmpeg (`libopenh264`, `aac`, `mjpeg`), Vitest, `node --test` for the relay.

**Spec:** `docs/superpowers/specs/2026-11-01-alphonso-mobile-phase2-design.md` (on top of `2026-10-31-alphonso-mobile-design.md`).

## Global Constraints

- The computer decides; each phone call maps to the function the computer's own screen uses; the phone never gets a function the computer doesn't have.
- Locked effects (spend, publish or send, delete) are approved only inside the app after Face ID or the fingerprint (`strict` confirm), never from a notification.
- Every phone change carries what it was based on; if the computer changed it meanwhile: refused with `CHANGED_ON_COMPUTER` = "This changed on your computer; here's the latest." and the latest data.
- Previews: video about 480p with sound; pictures JPEG at most 1080 pixels on the longer side; cached in `<project>/phone-previews/`; full quality never leaves the computer.
- On mobile data a preview over 20 MB (`PREVIEW_ASK_BYTES = 20 * 1024 * 1024`) shows its size and asks first; on Wi-Fi it loads.
- A preview is kept on the phone until its post goes out or is rejected, then deleted.
- Messages stay under `PHONE_MAX_FRAME_BYTES` (4 MB); a piece carries at most `PREVIEW_PIECE_BYTES = 2.5 * 1024 * 1024` raw bytes (base64 grows it by a third).
- ffmpeg is run only through `run_ffmpeg()`; never a shell; never over an existing file.
- No hardcoded names, addresses or model lists; plain words on screen; keys never cross the relay.
- Agents working on the phone and Alphonso's code changes are out of scope (phase 4 / "Open on your computer").

## Review Focus

1. A preview piece lost or corrupted on the way (relay drop mid-download): the phone must not show a broken video; it retries the missing pieces and checks the whole file's SHA-256 before playing. Test: Task 4 `a piece that arrives corrupted is fetched again and the hash is checked`.
2. The phone asks for a file the computer never offered (a crafted `ref`, `../`): refused, nothing read. Test: Task 3 `a path that is not a listed media file of a mirrored project is refused`.
3. The relay refuses a call (daily limit, too large): the phone shows the plain reason at once, not a 30-second wait. Test: Task 4 `a relay daily_limit refusal ends the waiting call with the plain line`.
4. A post that went out while the phone showed it: Approve/Move/Edit on the phone is refused with the latest, never re-sent. Test: Task 5 `editing a post that has gone out is refused with the latest`.
5. A video still being made (pending, no file yet) or whose file was deleted: the phone shows "Not ready yet" / "The file is no longer on your computer", never an endless spinner. Test: Task 3 `a missing file answers FILE_GONE`.

---

## File Structure

Computer (desktop, shared `src/`):
- `src/services/phone/phoneProtocol.ts` (modify): new call names and the `content` store.
- `src/services/phone/contentMirror.ts` (create): the `content` store's data (projects, brands, calendar) and the media each project offers.
- `src/services/phone/phoneMirror.ts` (modify): adds the `content` store.
- `src/services/phone/phonePreviews.ts` (create): make or reuse a preview, read a piece.
- `src/services/phone/contentCalls.ts` (create): the content phone calls with the stale check.
- `src/services/phone/phoneCalls.ts` (modify): registers the new calls.
- `src/services/jose/sendBackStep.ts` (create): Send back for a waiting request step.
- `src/services/marcus/editSendText.ts` (create): edit a waiting send's text.
- `src/components/jose/JoseRequestsBoard.tsx` (modify): Send back and Edit text on the board.
- `src-tauri/src/media_tools.rs` (modify): `content_phone_preview`, `content_read_file_part`.

Phone (`src/mobile/`, `mobile/`):
- `src/mobile/previewFetch.ts` (create): pieces, hash, cache, data guard.
- `src/mobile/phoneSession.ts` (modify): relay refusals end waiting calls.
- `src/mobile/screens/Studio.tsx`, `StudioProject.tsx`, `NewProject.tsx`, `Calendar.tsx`, `PreviewPlayer.tsx` (create).
- `src/mobile/screens/Requests.tsx`, `More.tsx`, `src/mobile/MobileApp.tsx` (modify): the Studio and Calendar tabs; review tools on a step.
- `mobile/package.json` (modify): `@capacitor/network`, `@capacitor/filesystem` pinned exactly.
- `src/services/phone/phoneNotifications.ts` (modify) and the two native notification handlers: the still picture.

---

### Task 1: The `content` store and the new call names

**Files:**
- Modify: `src/services/phone/phoneProtocol.ts`, `src/services/phone/phoneMirror.ts`
- Create: `src/services/phone/contentMirror.ts`
- Test: `src/test/services/phone/contentMirror.test.ts`

**Interfaces:**
- Consumes: `listProjects()`, `getProject()`, `listBrands()` (contentProjectService / contentBrandService), `listCalendarItems(nowMs)` (calendarItems.ts), `visiblePieces(project, brand)`.
- Produces:
  - `MirroredStore` gains `'content'`.
  - `PhoneCallName` gains `'media.preview' | 'content.approveStep' | 'content.sendBack' | 'content.chooseVersion' | 'content.editPost' | 'content.movePost' | 'content.cancelPost' | 'content.approvePosts' | 'content.startProject' | 'request.sendBack' | 'request.editSendText'`.
  - `export type MediaRef = { projectId: string; path: string; kind: 'video' | 'picture' }` (path relative to the output folder).
  - `export const CONTENT_PROJECTS = 20`.
  - `contentMirrorData(nowMs: number): { projects: PhoneProject[]; brands: { id: string; name: string }[]; calendar: CalendarItem[] }`, where `PhoneProject` is the project with `updatedAtMs`, its steps' states and versions, `posts`, and `media: MediaRef[]` (every picture and video file its chosen and listed versions name).
  - `mediaOffered(ref: MediaRef): boolean` (true only when `ref` is in that project's `media`).

- [ ] **Step 1: Write the failing tests** in `contentMirror.test.ts`:
  - `the content store holds the 20 most recent projects, newest first` (seed 22; expect 20, ordered by `updatedAtMs`).
  - `each project lists the media its versions name, as references` (a project with a scene picture `p1/scenes/v1-s1.png` and a video `p1/output/v1-16x9.mp4` → `media` contains both with kinds `picture` / `video`).
  - `mediaOffered refuses a path the project doesn't list` (`../secrets.txt`, another project's file → false).
  - `mirrorSnapshots includes content` (`Object.keys(mirrorSnapshots())` contains `'content'`).
- [ ] **Step 2:** Run `npx vitest run src/test/services/phone/contentMirror.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `contentMirror.ts`; add `'content'` to `storeData()` in `phoneMirror.ts`, publishing on the content stores' change events (the same listeners the Calendar page uses), batched by `MIRROR_BATCH_MS`.
- [ ] **Step 4:** Run the same command and `npx vitest run src/test/services/phone/`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(phone): the content store and phase 2's call names`.

### Task 2: Previews on the computer

**Files:**
- Modify: `src-tauri/src/media_tools.rs` (register both commands in `lib.rs`)
- Create: `src/services/phone/phonePreviews.ts`
- Test: Rust `#[test]`s in `media_tools.rs`; `src/test/services/phone/phonePreviews.test.ts`

**Interfaces:**
- Produces (Rust):
  - `content_phone_preview({ workspaceRoot, relativePath, kind: "video" | "picture" }) -> { ok, path, bytes, sha256, mime, reason? }`: makes `<dir of project>/phone-previews/<sha256 of source path + mtime>.mp4|.jpg` once, reuses it after; `checked_file()` for the source; never overwrites.
  - `pub(crate) fn preview_run(kind, source, out) -> FfmpegRun`: video `-vf scale=-2:480 -c:v libopenh264 -b:v 700k -c:a aac -b:a 64k -movflags +faststart`; picture `-vf scale=1080:1080:force_original_aspect_ratio=decrease -q:v 4`.
  - `content_read_file_part({ workspaceRoot, relativePath, offset, length }) -> { ok, base64, reason? }`: `length` at most 2,621,440 bytes; inside the workspace only.
- Produces (TS): `ensurePreview(ref: MediaRef): Promise<{ ok: true; path: string; bytes: number; sha256: string; mime: string; pieces: number } | { ok: false; reason: string }>` and `readPiece(path: string, index: number): Promise<string>` with `PREVIEW_PIECE_BYTES = 2.5 * 1024 * 1024`; `FILE_GONE = "The file is no longer on your computer."`, `NOT_READY = "Not ready yet: the computer is still making it."`.

- [ ] **Step 1: Write the failing tests:** Rust `preview_run_video_is_480p_openh264`, `preview_run_picture_is_at_most_1080`, `read_file_part_refuses_more_than_a_piece`, `read_file_part_refuses_outside_the_workspace`; TS `ensurePreview asks the backend once and counts the pieces` (bytes 6,000,000 → pieces 3), `a missing file answers FILE_GONE`, `a pending file answers NOT_READY`.
- [ ] **Step 2:** Run `cargo test media_tools` (in `src-tauri`) and `npx vitest run src/test/services/phone/phonePreviews.test.ts`. Expected: FAIL. (Locally `cargo test` may be blocked by Application Control: then CI runs it first; ledger it.)
- [ ] **Step 3:** Implement both commands through `run_ffmpeg()` and `checked_file()`; `phonePreviews.ts` over `invoke`.
- [ ] **Step 4:** Re-run both; `cargo clippy -- -D warnings`; `node scripts/verify-no-window-coverage.mjs`. Expected: PASS, no warnings.
- [ ] **Step 5:** Commit `feat(phone): phone-sized previews made by the computer`.

### Task 3: The `media.preview` call

**Files:**
- Create: `src/services/phone/contentCalls.ts` (the media part)
- Modify: `src/services/phone/phoneCalls.ts`
- Test: `src/test/services/phone/contentCalls.test.ts`

**Interfaces:**
- Consumes: `mediaOffered(ref)` (Task 1), `ensurePreview`, `readPiece` (Task 2).
- Produces: `'media.preview'` with args `{ ref: MediaRef; piece: number }` → `{ mime: string; bytes: number; sha256: string; pieces: number; piece: number; data: string }` (data = base64 of that piece), or throws the plain reason.

- [ ] **Step 1: Write the failing tests:** `a listed video's piece 0 comes with the size, hash and piece count`; `a path that is not a listed media file of a mirrored project is refused` (throws, `ensurePreview` never called); `a piece past the last is refused`.
- [ ] **Step 2:** Run `npx vitest run src/test/services/phone/contentCalls.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement; register in `PHONE_CALLS`.
- [ ] **Step 4:** Re-run, plus `src/test/services/phone/phoneCalls.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(phone): the phone fetches previews in pieces, only of offered files`.

### Task 4: Fetching, checking and keeping previews on the phone

**Files:**
- Create: `src/mobile/previewFetch.ts`
- Modify: `src/mobile/phoneSession.ts`, `mobile/src/native.ts`, `mobile/package.json` (`@capacitor/network`, `@capacitor/filesystem`, exact versions current at build time, Capacitor 8 compatible)
- Test: `src/test/mobile/previewFetch.test.ts`, `src/test/mobile/phoneSession.test.ts`

**Interfaces:**
- Consumes: `PhoneLink.call('media.preview', …)`.
- Produces:
  - `fetchPreview(ref: MediaRef, deps: { call; store: PreviewStore; network(): Promise<'wifi' | 'cellular' | 'none'>; confirm(bytes: number): Promise<boolean> }): Promise<{ ok: true; url: string } | { ok: false; reason: string }>`.
  - `interface PreviewStore { get(key): Promise<string | null>; put(key, bytes: Uint8Array, mime): Promise<string>; remove(key): Promise<void>; keys(): Promise<string[]> }` (native: `@capacitor/filesystem` in the app's data folder; key = sha256).
  - `prunePreviews(store, keep: Set<string>)`: removes previews whose post went out or was rejected (`keep` built from the `content` store).
  - `PREVIEW_ASK_BYTES`, `previewSizeLine(bytes)` → "This video is 34 MB. Load it on mobile data?".
  - In `phoneSession.ts`: a relay `{ type: 'error', reason }` ends every waiting call with `RELAY_REFUSED[reason]`: `daily_limit` → "Today's limit for previews is used up; it resets at midnight UTC.", `too_large` → "That was too large to send.", `too_fast` → "Too many at once; try again in a moment."

- [ ] **Step 1: Write the failing tests:** `pieces are put together and the SHA-256 is checked before it plays`; `a piece that arrives corrupted is fetched again and the hash is checked` (one retry per piece, then the plain reason); `on mobile data a preview over 20 MB asks first, and No loads nothing`; `on Wi-Fi it loads without asking`; `a cached preview is shown without any call`; `prunePreviews removes what is no longer waiting`; `a relay daily_limit refusal ends the waiting call with the plain line`.
- [ ] **Step 2:** Run `npx vitest run src/test/mobile/`. Expected: FAIL.
- [ ] **Step 3:** Implement; SHA-256 through `crypto.subtle.digest`; the native store and network in `native.ts`.
- [ ] **Step 4:** Re-run; `npx tsc --noEmit -p mobile/tsconfig.json`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(phone): previews arrive whole, ask first on mobile data, and go once posted`.

### Task 5: Content actions from the phone

**Files:**
- Modify: `src/services/phone/contentCalls.ts`, `src/services/phone/phoneCalls.ts`
- Test: `src/test/services/phone/contentCalls.test.ts`

**Interfaces:**
- Consumes: `approveContentStep`, `retryWithReason`, `chooseVersion`, `runContentProject` (contentStepRunner / contentQualityGate / contentProjectService), `updatePost`, `movePost`, `cancelProjectPost`, `createProject`, `getProject`, `getBrand`, the brand's defaults for a brief.
- Produces (each takes `baseUpdatedAtMs`, the project's `updatedAtMs` the phone saw; when it differs: `{ stale: true, message: CHANGED_ON_COMPUTER, latest: PhoneProject }`; else `{ ok: true, latest }` or `{ ok: false, reason }`):
  - `content.approveStep { projectId, step }`; `content.sendBack { projectId, step, reason }` (starts `retryWithReason` in the background); `content.chooseVersion { projectId, step, version }`;
  - `content.editPost { projectId, postId, title?, caption?, hashtags? }` (only those three fields); `content.movePost { projectId, postId, atMs }`; `content.cancelPost { projectId, postId }` (locked: the phone asks with `strict`);
  - `content.approvePosts { projectId }` = `approveContentStep(projectId, 'publish')` (publish: locked);
  - `content.startProject { brandId, idea, make: Array<'video' | 'shorts' | 'carousel'> }` (no base): `createProject` with the brand's defaults and "What to make" from `make`, then `runContentProject`; `{ ok, projectId, requestId }`.
  - `CHANGED_ON_COMPUTER` exported.

- [ ] **Step 1: Write the failing tests:** `a stale base is refused with the latest and changes nothing`; `editing a post that has gone out is refused with the latest`; `editPost changes only title, caption and hashtags` (a `status` in args is ignored); `sendBack starts the step again with the reason`; `approvePosts approves Publish once` (twice → `ALREADY_DONE`); `startProject makes the brief from the brand's defaults and what to make`.
- [ ] **Step 2:** Run `npx vitest run src/test/services/phone/contentCalls.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement; locked calls also listed in the phone's `lockedApproval.ts` so they take `strict` Face ID.
- [ ] **Step 4:** Re-run; `npx vitest run src/test/services/phone/ src/test/mobile/lockedApproval.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(phone): approve, send back, choose versions, edit, move and start projects from the phone`.

### Task 6: Send back and edit a send's text, on the computer and the phone

**Files:**
- Create: `src/services/jose/sendBackStep.ts`, `src/services/marcus/editSendText.ts`
- Modify: `src/components/jose/JoseRequestsBoard.tsx`, `src/services/phone/phoneCalls.ts`, CLAUDE.md (two rows)
- Test: `src/test/services/jose/sendBackStep.test.ts`, `src/test/services/marcus/editSendText.test.ts`, `src/test/components/jose/JoseRequestsBoard.test.tsx`

**Interfaces:**
- Consumes: `getJoseRequest`, `addRequestSteps`, `rewireRequestNeeds` (joseRequestStore), `checkPlan`, `rejectRequestStep`, `textToSend` / `prepareMarcusSend`'s checks (length, `unfilledGaps()`, `deliveryLines()`), `describeSend`.
- Produces:
  - `sendBackStep(requestId: string, stepId: string, reason: string): { ok: boolean; summary: string }`: for a step waiting for approval whose work came from another step (`reviewOf`, the step a send is made from, or the step itself when it made the work): adds `<work step>-fix-<n>` with "Fix what you were asked: <reason>" and moves later steps to it, as the review loop does; refused past `JOSE_LIMITS.maxFixRounds`.
  - `editSendText(requestId: string, stepId: string, text: string, baseHash: string): { ok: true; preview: SendPreview } | { ok: false; reason: string; latest?: SendPreview }`: only while the step waits; the same checks as preparing a send; `baseHash` = `contentHash()` of the preview's text; marked `editedByYou`.
  - Phone calls `request.sendBack { requestId, stepId, reason }`, `request.editSendText { requestId, stepId, text, baseHash }`.
  - Board: "Send back" (a reason box) and, on a waiting send, "Edit text" (`data-testid="jose-send-back"`, `"jose-edit-send"`).

- [ ] **Step 1: Write the failing tests:** `send back adds a fix step with the reason and the waiting step waits for it`; `send back past the rounds is refused with the reason`; `an edited send keeps the checks (a gap like [Your Name] is refused)`; `an edit based on an old text is refused with the latest`; board `Send back asks for a reason and sends it`.
- [ ] **Step 2:** Run the three files. Expected: FAIL.
- [ ] **Step 3:** Implement; register the calls; `npm run generate:dnd-map`; CLAUDE.md rows.
- [ ] **Step 4:** Re-run; `npm run verify:dnd-coverage`; `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(jose): Send back a waiting step and edit a send's text, on the board and the phone`.

### Task 7: Miya Studio on the phone

**Files:**
- Create: `src/mobile/screens/Studio.tsx`, `StudioProject.tsx`, `NewProject.tsx`, `PreviewPlayer.tsx`
- Modify: `src/mobile/MobileApp.tsx` (a Studio tab), `src/mobile/screens/More.tsx`
- Test: `src/test/mobile/Studio.test.tsx`

**Interfaces:**
- Consumes: the `content` store (Task 1), `fetchPreview` (Task 4), the content calls (Task 5), `withLockedConfirm` (lockedApproval.ts).
- Produces: tabs Chat, Requests, Studio, Calendar, More. Studio: projects (brand, name, the step waiting for you first) → a project: steps with status and versions (v1, v2, … with "Use this version"), pictures as previews, videos in `PreviewPlayer` (a still picture until loaded, the size line on mobile data), the review's Approve / Send back (reason box), the posts with title/caption/hashtags editable and "Approve and schedule" (locked). A stale answer replaces the screen with the latest and shows `CHANGED_ON_COMPUTER`. New project: idea, brand, What to make (video, Shorts, carousel), Run project.

- [ ] **Step 1: Write the failing tests:** `a project waiting for review shows Approve and Send back`; `Approve and schedule asks for Face ID (strict) first`; `a stale answer shows the latest with the plain line`; `a video shows a still picture and its size on mobile data before loading`; `New project sends idea, brand and what to make`; `More no longer lists Miya Studio and the Calendar as "On your computer for now"`.
- [ ] **Step 2:** Run `npx vitest run src/test/mobile/Studio.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement; one column, the desktop's colours and agent colours.
- [ ] **Step 4:** Re-run `npx vitest run src/test/mobile/`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(phone): Miya Studio on the phone`.

### Task 8: The Calendar on the phone

**Files:**
- Create: `src/mobile/screens/Calendar.tsx`
- Test: `src/test/mobile/Calendar.test.tsx`

**Interfaces:**
- Consumes: `calendar` from the `content` store; `filterCalendarItems`, `itemsForMonth`, `itemsForWeek` (calendarItems.ts); `content.movePost`, `content.cancelPost`.
- Produces: month (a list grouped by day) and week; brand and platform filters; a post's sheet (brand, project, platform, time, status, link, caption, the preview); "Change time" (a day and time picker; a post scheduled on YouTube/Facebook says "This changes the time on YouTube." first, as the desktop does); "Cancel post" (asks; locked).

- [ ] **Step 1: Write the failing tests:** `posts are grouped by day in the month`; `changing the time of a YouTube post asks first and sends content.movePost`; `Cancel post asks and needs Face ID`; `a post needing you is marked`.
- [ ] **Step 2:** Run `npx vitest run src/test/mobile/Calendar.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(phone): the Calendar on the phone`.

### Task 9: Checking writing, research and sends on the phone's Requests

**Files:**
- Modify: `src/mobile/screens/Requests.tsx`
- Test: `src/test/mobile/RequestsReview.test.tsx`

**Interfaces:**
- Consumes: the step outputs (phase 1 mirror), `checkLink(url)` (sentinel/exactChecks.ts, pure), `request.sendBack`, `request.editSendText`.
- Produces: a waiting step shows its work in full (a report's answer, parts and numbered sources; a verdict; a review's findings; a send's exact text and destination; an outside-tool call); Send back (reason box); on a send, Edit text (then Approve, locked); a source opens in the phone's browser, after "This link looks disguised (…). Open anyway?" when `checkLink` flags it; Alphonso's code change shows "Open on your computer" and no Approve.

- [ ] **Step 1: Write the failing tests:** `a research step shows its numbered sources and a disguised one warns first`; `a send's text can be edited and the edit is sent with the old text's hash`; `Alphonso's code change is not approvable on the phone`.
- [ ] **Step 2:** Run `npx vitest run src/test/mobile/RequestsReview.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run `npx vitest run src/test/mobile/`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(phone): check writing, research and sends before approving`.

### Task 10: "Ready to check" notifications with a still picture

**Files:**
- Modify: `src/services/phone/phoneNotifications.ts`, `src/services/phone/phonePreviews.ts`, `mobile/ios/App/NotificationService/NotificationService.swift`, `mobile/android/app/src/main/java/com/alphonso/companion/PushService.java`, `src-tauri/src/media_tools.rs`
- Test: `src/test/services/phone/phoneNotifications.test.ts`, `src/test/mobile/nativeContract.test.js`, Rust `#[test]`

**Interfaces:**
- Produces: a notice kind `ready_to_check` ("Miya's video for <project> is ready to check" / "… pictures …") sent once per version (key `ready:<projectId>:<step>:<version>` in the sent log) when a picture or video step saves a version waiting for review; `PhoneNotification.still?: string` (base64 JPEG). The still is made by `content_phone_still` (ffmpeg, 160 px wide, JPEG quality 6) and included only when the sealed push stays under `PUSH_STILL_LIMIT = 3000` characters; otherwise text only. The extensions show it as an attachment.

- [ ] **Step 1: Write the failing tests:** `a new video version waiting for review sends one ready_to_check notice`; `a still that would make the push too large is left out`; native contract `both phones show a notice's still picture`; Rust `still_run_is_160_wide`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run; `cargo clippy -- -D warnings`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(phone): ready-to-check notifications with a still picture`.

### Task 11: End to end, docs, test builds

**Files:**
- Modify: `src/test/services/phone/phoneEndToEnd.test.js`, `docs/PHONE.md`, `docs/USER_MANUAL.md` (section 13), `docs/CHANGELOG.md` (Unreleased), CLAUDE.md, `gateway/phone-relay/vm.md` (preview cost line)

- [ ] **Step 1:** Add to the end-to-end test over the real relay: `a 6 MB preview arrives in 3 pieces with its hash`; `a stale caption edit is refused with the latest`; `a relay daily_limit refusal reaches the phone at once` (limits passed low to `createServer`). Run `npx vitest run src/test/services/phone/phoneEndToEnd.test.js`. Expected: PASS.
- [ ] **Step 2:** Docs; `node scripts/verify-doc-counts.mjs`; `npm run generate:dnd-map`; `npm run verify:dnd-coverage`. Expected: all fresh.
- [ ] **Step 3:** Test builds: Android on this computer (version code up) to Firebase App Distribution; iPhone by pushing a `phone-v…` tag. The owner's checks on real phones: open a video preview and approve the posts; send back a script with a reason; move a post; start a project; open a research report and a source.
- [ ] **Step 4:** Commit `docs(phone): phase 2`; one PR for phase 2.
