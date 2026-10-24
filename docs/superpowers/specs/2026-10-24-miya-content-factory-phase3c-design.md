# Miya content factory, phase 3c: storage, carousels, Instagram Login, in-app sign-in

> **Status (2026-10-25):** built and merged in PR #350 (phase 3c); on `main`, not released yet (2.10.0 isn't tagged). What it leaves open is in `docs/governance/DEFERRED_WORK.md`; the current behaviour is described in `CLAUDE.md`'s Do Not Duplicate rows and `docs/USER_MANUAL.md` section 8.

Date: 2026-10-24. Builds on phases 3a (publishing) and 3b (the Calendar). Phase 3
is now four parts (owner, 2026-10-24): 3a, 3b (done), **3c** this document, **3d**
Shorts as their own pieces (a new project starts with its own mini-script; the
other choices are a highlight with its own hook, or the plain 9:16 cut).

## Intent

Let any Alphonso user post carousels and Instagram Reels however their accounts
are set up, without a terminal and without having to own cloud storage.
Alphonso is a product for many people (owner, 2026-10-24): every step must work
for someone who installed the app and has never opened a terminal.

## Owner decisions (2026-10-24, and 2026-10-23 where noted)

1. **Storage is optional.** A user can connect any **S3-compatible** bucket they
   own (Cloudflare R2, Amazon S3, Supabase Storage, Backblaze B2, Wasabi):
   endpoint, region, bucket, access key, secret key. The bucket stays private:
   just before posting Alphonso uploads the file, gives Instagram a link that
   works for about an hour, and deletes the file once Instagram has it.
2. **Without storage:** the post's files and caption are saved in the project
   folder ready to post, and at its time Alphonso reminds the user (in the app
   and on Telegram) to post it by hand, with the folder opened. Nothing fails.
3. **Carousels** (2026-10-23): for **Instagram and Facebook**; **Miya writes**
   5–10 slides from the research and script (a hook slide, one idea per slide,
   a last slide with the call to action); each slide gets a ComfyUI picture
   with its headline and short text drawn on in the brand's style, like the
   thumbnails; the **shape is chosen per brand** (4:5 portrait 1080×1350, or 1:1
   1080×1080).
4. **When:** Run project includes a Carousel step only when the brief's "What
   to make" or its format says carousel; otherwise it can be run by hand.
5. **Carousel Studio:** a new Miya Studio tab next to Thumbnail Studio: every
   slide's picture, headline and text; redo one slide; reorder; send a slide
   back with a reason (a brand lesson, as with thumbnails).
6. **Caption:** the campaign step writes the carousel's own caption and
   hashtags.
7. **Instagram Login** (no Facebook Page) as a second way in. Settings → Meta:
   "Post to Instagram through my Facebook Page" or "through Instagram Login",
   starting with whichever is set up. On Instagram Login, Reels (which can't be
   uploaded from the computer on that route) go through storage, or the
   export-and-remind path.
8. **In-app sign-in** for YouTube, Facebook (Meta) and Instagram: a "Sign in"
   button per service in Settings → Connectors opens the browser and Alphonso
   receives the sign-in itself. Users still use their own Google project / Meta
   app (they paste its ID and secret first, guided step by step). This replaces
   the terminal scripts for normal users (`npm run auth:youtube`, `auth:meta`
   stay for developers). A shared Obsidian Media app is a separate business
   decision, written up for later, not built here.
9. Also: fix the CodeQL `rust/hard-coded-cryptographic-value` alerts on the Meta
   tests' literal values, and add the **combined live check** (3a + 3b + 3c with
   the owner's accounts) to the QA list.

## What exists (checked 2026-10-24) and what 3c does with it

| Exists | Where | 3c |
|---|---|---|
| Thumbnails: ComfyUI picture + headline drawn on | `contentImages.ts`, `thumbnailRenderer.ts` | slides reuse the same picture path and drawing (headline plus short body text) |
| Posts list, `publishPost()`, runner, Publish step, Calendar | 3a/3b | carousel and export-and-remind are new post kinds/outcomes in the same path |
| Meta posting (Page route) | `meta_video.rs`, `meta_publish.rs` | gains Facebook multi-photo posts (upload from the computer) and Instagram carousels (by link) |
| Saved keys, `secret_or_env` | `connectorAuth.ts`, Rust | storage keys and Instagram Login token saved the same way (OS keychain) |
| Sign-in scripts with PKCE and fixed local callbacks (`localhost:8085`, `8086`) | `scripts/auth-*.mjs` | the same flow moves into the backend, with the same callback addresses |
| Sign-in expiry warnings | `signInExpiry.ts` | Instagram Login's 60-day token joins them, and is refreshed automatically |
| Brief "What to make" text | `BriefPanel.tsx` | "carousel" there (or the carousel format) turns the step on |

## Goals

- Storage connection in Settings with a "Test" that uploads, links and deletes
  a small file and reports each part.
- Carousels end to end: step, slides, Carousel Studio, caption, posts (Instagram
  carousel, Facebook multi-photo), approval, schedule (Facebook on Meta;
  Instagram by the runner), Calendar.
- Export-and-remind for any post Instagram can't take without storage.
- Instagram Login: sign-in, token refresh, posting Reels and carousels by link.
- In-app sign-in for YouTube, Meta and Instagram.
- CodeQL alerts fixed; combined live check in the QA list.

## Non-goals

Shorts as their own pieces (3d); a shared Obsidian Media app; analytics (phase
4); TikTok, LinkedIn, X; storage used for anything but handing files to a
platform.

## Anti-goals

- A step that needs a terminal for a normal user.
- A post that fails only because the user has no storage.
- Files left public, or left in the user's bucket after the platform has them.
- Keys or tokens in logs, the repo, or exported backups.

## Constraints

- Build on what exists (table above): one publishing path, one runner, one
  calendar, one place for keys.
- S3 requests are signed in the backend (AWS Signature Version 4, presigned GET
  for the link) with the crates already present (`hmac`, `sha2`, `reqwest`); no
  new SDK. Paths and sizes are checked like the other workspace commands.
- Sign-in listens only on `127.0.0.1`, with PKCE where the service supports it,
  a random `state`, and a time limit; the window never sees the secret.
- Windows first; English.

## The builder's calls (marked as such; the owner may change them)

- **Instagram Login's redirect:** Alphonso listens on a local address; if the
  user's Meta app won't accept a local address, the sign-in page asks the user
  to paste the address the browser ended on (the code is in it). Checked
  against the owner's app in the live check.
- **Link lifetime:** 1 hour; files are deleted when the platform reports the
  post finished, and any leftovers older than a day are cleaned at app start.
- **Slide text:** headline (at most 8 words) and body (at most 25 words) per
  slide, drawn with the thumbnail renderer's colours and outline; the cover is
  slide 1. Slide count 5–10, Miya's choice.
- **Facebook multi-photo:** photos uploaded unpublished from the computer, then
  one Page post with them attached, scheduled on Meta when its time is 11
  minutes to 29 days ahead (as for Reels).
- **Instagram carousel:** each slide a child container by link, then the
  carousel container, then publish; sent by the runner at its time.
- **Token refresh:** Instagram Login tokens refreshed when under 10 days are
  left (once a day check, with the 3b warnings).
- **Export-and-remind:** files in `<project>/ready-to-post/<platform>-<piece>-v<n>/`
  with `caption.txt`; the post's status is "Post by hand" with the folder link.

## Testing

Unit tests for SigV4 signing (against AWS's published test vectors), presigned
links, upload/delete requests, slide prompts and parsing, slide rendering
layout, carousel posts in the posts list, Facebook multi-photo and Instagram
carousel request building, the route choice, export-and-remind, sign-in (PKCE,
state, callback parsing, pasted-address parsing, token exchange requests) and
token refresh. Desktop spec: a project with seeded slides shows in Carousel
Studio; the Posts list has the carousel; without storage, approving it gives
"Post by hand" with the files saved; nothing is posted. The real storage,
sign-ins and posting are in the combined live check.
