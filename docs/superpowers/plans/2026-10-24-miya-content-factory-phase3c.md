# Miya content factory phase 3c Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any user can post carousels and Instagram Reels however their accounts are set up, with optional own storage, a hand-posting fallback, Instagram Login, and in-app sign-in.

**Architecture:** Storage and sign-in live in the backend (new `media_storage.rs`, `oauth_signin.rs`); the app side extends the one publishing path (`publishPost.ts`, the Posts list, Marcus's runner, the Calendar) with a carousel piece, a "by link" Instagram route and a `by_hand` outcome. Carousels are a new content step (`carousel`, Miya) that reuses the thumbnail picture and drawing code.

**Tech Stack:** Tauri 2 / Rust (`reqwest`, `hmac`, `sha2`, `tokio`), React + TypeScript, Vitest, WebdriverIO desktop specs.

**Spec:** `docs/superpowers/specs/2026-10-24-miya-content-factory-phase3c-design.md`

## Global Constraints

- No terminal step for a normal user; `npm run auth:*` stays for developers only.
- Storage is optional: no post fails only because there is no storage (it becomes "Post by hand").
- Bucket stays private: presigned GET link valid **3600 s**; the staged file is deleted once the platform reports the post finished; staged leftovers older than **24 h** are deleted at app start.
- S3 signing: AWS Signature Version 4 with the crates already in `Cargo.toml` (`hmac`, `sha2`, `reqwest`); no new SDK crate.
- Carousel: **5–10** slides; headline **≤ 8 words**, body **≤ 25 words**; slide 1 is the cover; shape per brand **4:5 = 1080×1350**, **1:1 = 1080×1080**.
- Facebook multi-photo: uploaded unpublished from the computer, one Page post with them attached; scheduled on Meta when **11 minutes to 29 days** ahead (same window as Reels).
- Instagram Login token: refreshed when **under 10 days** are left; expiry **60 days**.
- Sign-in listens on **127.0.0.1** only: YouTube **8085**, Meta **8086**, Instagram **8087** (`/callback`), random `state`, PKCE where the service supports it, **5 minute** limit. Add 8087 to CLAUDE.md's port map.
- Keys and tokens: saved through `saveConnectorCredential` (OS keychain), never logged, never in an export (`SECRET_STORAGE_KEYS` / connector store already excluded).
- Hand-posting folder: `<project>/ready-to-post/<platform>-<piece>-v<n>/` with the files and `caption.txt`.
- Windows first; English; plain words on screen.

## Review Focus

1. **A storage upload that succeeds but the platform then fails** — the staged file must still be deleted (or cleaned at next start), never left in the bucket. Test in Task 4.
2. **A storage endpoint written with or without `https://`, with a trailing slash, or path-style vs virtual-host buckets (R2, Supabase need path-style)** — URLs must still sign correctly. Test in Task 2.
3. **A sign-in callback with a wrong or missing `state`, or a user who closes the browser** — refused or times out with a plain message; the port is freed for the next try. Test in Task 7.
4. **A carousel whose model answer has 3 or 14 slides, or an over-long headline** — refused (count) or trimmed (words), never posted broken. Test in Task 5.
5. **A carousel post moved or cancelled on the Calendar after being scheduled on Facebook** — 3b's move/cancel path must handle a photo post id, not only a video id. Test in Task 4.

---

### Task 1: CodeQL test values

**Files:**
- Modify: `src-tauri/src/meta_publish.rs` (tests near the three `meta_appsecret_proof_*` tests, ~lines 730–792)

**Interfaces:** none.

- [ ] **Step 1:** Replace the literal secrets in those tests with values built at run time, through a test helper `fn test_secret(tag: &str) -> String` (e.g. `format!("test-{tag}-{}", std::process::id())`); keep every assertion (None without secret; 64 hex chars; same input → same output).
- [ ] **Step 2:** Run `cargo test --lib meta_appsecret` (retry loop for os error 4551). Expected: same tests pass.
- [ ] **Step 3:** Commit `test(meta): build the test secrets at run time (CodeQL hard-coded key)`.

### Task 2: Storage backend (S3-compatible, SigV4)

**Files:**
- Create: `src-tauri/src/media_storage.rs`; register commands in `lib.rs`.
- Test: unit tests inside `media_storage.rs`.

**Interfaces:**
- Produces (Rust): `StorageConfig { endpoint, region, bucket, access_key, secret_key, path_style: bool }` (camelCase serde); `fn object_url(cfg, key) -> Result<String,String>`; `fn sigv4_headers(cfg, method, key, payload_sha256, now) -> Vec<(String,String)>`; `fn presign_get(cfg, key, expires_secs, now) -> Result<String,String>`.
- Produces (commands): `storage_put_file(config, workspaceRoot, relativePath, key) -> { ok, url?, key, reason? }` (uploads, returns a 3600 s presigned GET); `storage_delete(config, key) -> { ok, reason? }`; `storage_list_staged(config, prefix) -> [{ key, lastModifiedMs }]`; `storage_test(config) -> { upload, link, delete: { ok, reason? } }` (uploads a 16-byte file, fetches its link, deletes it).
- Keys staged under the prefix `alphonso-staged/<yyyy-mm-dd>/<random>-<file name>`.

- [ ] **Step 1: Failing tests** — `sigv4_matches_aws_get_vanilla` (AWS SigV4 test suite "get-vanilla" vector: the Authorization header equals the published value); `presign_get_matches_aws_s3_example` (AWS S3 docs presigned-URL example, `examplebucket`, `us-east-1`, 86400 s, `20130524T000000Z` → the documented `X-Amz-Signature`); `object_url_handles_endpoint_forms` (`r2.example.com`, `https://r2.example.com/`, path_style true/false → one canonical URL each); `put_and_delete_are_refused_outside_workspace` (relative path with `..` → `Err`); `files_over_limit_refused` (> 1 GB → "too large").
- [ ] **Step 2:** Run `cargo test --lib media_storage`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement. Paths through the existing `checked_file()`; endpoint must be `https://` (an `http://` endpoint only for loopback, for tests); no redirects followed; secrets never in error text.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then `cargo clippy --all-targets -- -D warnings`. Expected: clean.
- [ ] **Step 5:** Commit `feat(storage): S3-compatible storage in the backend (SigV4, private links)`.

### Task 3: Storage in the app and Settings

**Files:**
- Create: `src/services/mediaStorageService.ts`
- Modify: `src/services/connectors/connectorRegistry.js` (connector `media_storage`, free, low risk, keys `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_PATH_STYLE`), `src/components/ConnectorSetupPanel.tsx` ("Your storage" section in Content & Productivity with Test and a short guide naming R2, S3, Supabase, B2, Wasabi), `src/hooks/useBootEffects.js` (cleanup at start).
- Test: `src/test/services/mediaStorageService.test.ts`, `src/test/ConnectorSetupPanel.test.jsx`.

**Interfaces:**
- Produces: `storageConfigured(): Promise<boolean>`; `stageFile(root: string, relativePath: string): Promise<{ ok: boolean; url?: string; key?: string; reason?: string }>`; `removeStaged(key: string): Promise<void>` (never throws); `cleanOldStaged(nowMs: number): Promise<number>` (deletes keys older than 24 h, returns the count); `testStorage(): Promise<{ upload; link; delete }>`.

- [ ] **Step 1: Failing tests** — `stageFile without storage says so` (`{ ok: false, reason: 'No storage is set up.' }`, no invoke); `stageFile passes the saved keys and returns the link`; `cleanOldStaged deletes only keys older than a day`; `removeStaged swallows errors`; panel test: `the storage section saves its keys and Test shows each part's result`.
- [ ] **Step 2:** Run `npx vitest run src/test/services/mediaStorageService.test.ts src/test/ConnectorSetupPanel.test.jsx`. Expected: FAIL.
- [ ] **Step 3:** Implement with `savedSecret()` for each key (as other connectors do); boot cleanup once, never blocks start.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Update the connector count everywhere (`fixcounts.py`, CLAUDE.md "30 connectors" → 31, the `connectorRegistry` row; Instagram Login stays inside the existing `meta` connector, not a new one). Commit `feat(storage): connect your own storage in Settings`.

### Task 4: Posting by link, Facebook photos, and "Post by hand"

**Files:**
- Modify: `src-tauri/src/meta_video.rs` (or a new `meta_media.rs` if it passes ~900 lines): commands `meta_instagram_publish_by_url`, `meta_instagram_container_status`, `meta_facebook_photo_post`; `meta_cancel_video` / `meta_reschedule_video` accept a photo post id (`kind: 'video' | 'post'`).
- Modify: `src/services/contentFactory/contentTypes.ts` (`ProjectPost.piece` adds `'carousel'`; `files?: string[]`; `stagedKeys?: string[]`; `PostStatus` adds `'by_hand'`), `contentPosts.ts` (`POST_STATUS_LABEL.by_hand = 'Post by hand'`), `publishPost.ts`, `contentPostMoves.ts`, `src/services/metaPublishService.ts`, `src/services/marcusExecutionService.ts` (a due `by_hand` post sends the reminder).
- Create: `src/services/contentFactory/readyToPost.ts`, `src/services/contentFactory/instagramRoute.ts`.
- Test: `src/test/services/contentFactory/publishPost.test.ts`, `readyToPost.test.ts`, `instagramRoute.test.ts`, `contentPostMoves.test.ts`; Rust tests in the Meta module.

**Interfaces:**
- Consumes: Task 3 `stageFile`, `removeStaged`.
- Produces: `getInstagramRoute(): Promise<'page' | 'instagram_login' | null>` (the saved choice `alphonso_settings.instagramRoute`, else whichever is set up, Page first; null when neither); `exportForHand(projectId: string, post: ProjectPost): Promise<{ folder: string }>`; `BY_HAND_REMINDER(post) => string` ("Time to post <title> on <Platform> by hand: files and caption are in <folder>."); `publishPost` outcome `{ ok: true, byHand: true, folder }`.
- Rust request shapes: `{ route: 'page'|'instagram_login', mediaType: 'REELS'|'CAROUSEL', videoUrl?, imageUrls?: string[], caption, credentials }` → `{ ok, mediaId?, containerId?, reason? }`; `{ photoFiles: string[], workspaceRoot, message, scheduledAtMs?, credentials }` → `{ ok, postId?, scheduledAtMs?, reason? }`. Instagram Login uses `https://graph.instagram.com/<ver>/<ig-user-id>/media`; the Page route `graph.facebook.com`.

- [ ] **Step 1: Failing tests (app)** —
  - `an Instagram Reel on the Page route still uploads from the computer` (no staging call; 3a path unchanged);
  - `an Instagram Reel on Instagram Login is staged, posted by link, and the staged file removed`;
  - `a carousel on Instagram stages every slide and posts one carousel`;
  - `without storage, an Instagram carousel becomes Post by hand with its folder` (status `by_hand`, `caption.txt` written with caption + hashtags);
  - `when posting by link fails, the staged files are still removed` (Review Focus 1);
  - `a Facebook carousel uploads the photos from the computer and is scheduled on Meta when 11 minutes to 29 days ahead`;
  - `instagramRoute: the saved choice wins; otherwise Page first; null when neither is set up`;
  - `marcus: a due by_hand post sends the reminder once, in the app and on Telegram`;
  - `contentPostMoves: a Facebook carousel moves and cancels with kind 'post'` (Review Focus 5).
- [ ] **Step 2: Failing tests (Rust)** — request builders: `instagram_by_url_reel_body`, `instagram_carousel_children_then_parent` (children `is_carousel_item=true`, parent `media_type=CAROUSEL`, `children` joined), `instagram_login_uses_graph_instagram_host`, `facebook_photo_post_attaches_unpublished_photos` (`published=false` per photo; post `attached_media[i]={"media_fbid":id}`), `photo_post_scheduled_only_in_window`.
- [ ] **Step 3:** Run both test sets. Expected: FAIL.
- [ ] **Step 4:** Implement. The Instagram container is polled until `FINISHED` (up to 10 min, as Reels in 3a); the staged files are removed in a `finally`. `exportForHand` copies (never moves) into the hand-posting folder, refusing to overwrite (`-2` suffix).
- [ ] **Step 5:** Run both test sets, then `npx vitest run src/test/services/contentFactory`. Expected: PASS.
- [ ] **Step 6:** Commit `feat(miya): post by link through your storage, Facebook photo posts, and Post by hand`.

### Task 5: The carousel step

**Files:**
- Modify: `contentTypes.ts` (`StepId` adds `'carousel'`, `STEP_ORDER` puts it after `'thumbnail'`; `ContentBrand.carouselShape?: '4:5' | '1:1'` default `'4:5'`), `contentStepAgents.ts` (`carousel: [{ agent: 'miya', actionType: 'creative_carousel' }]`), `contentStepPrompts.ts`, `contentImages.ts`, `thumbnailRenderer.ts`, `contentProjectPlan.ts`, `contentStepRecorder.ts`, `joseEffects.ts` (`creative_carousel: ['write_own_work']`), `joseTemplates.ts` (Content video template gains the step), `contentPosts.ts` (`buildPosts` adds carousel posts for Instagram and Facebook when the brand has them and a carousel version exists), the campaign prompt (`carouselCaption`, `carouselHashtags`), `contentBrandService.ts` and `BrandEditor.tsx` (shape choice).
- Test: `contentStepPrompts.test.ts`, `contentImages.test.ts`, `thumbnailRenderer.test.ts`, `contentProjectPlan.test.ts`, `contentPosts.test.ts`, `joseTemplates.test.ts`.

**Interfaces:**
- Produces: `CarouselSlide { headline: string; body: string; imagePrompt: string; image?: string; status?: 'done'|'pending'|'failed'; jobId?: string }`; `briefWantsCarousel(brief: ContentBrief): boolean` (true when `outputs` or `format` mentions "carousel", any case); `renderCarouselSlides(projectId, settings, onProgress?, only?: number): Promise<PictureResult[]>`; `drawSlide(baseBase64, slide, brand, size: { width, height }): Promise<string>`; `slideSize(shape) => { width: 1080, height: 1350 | 1080 }`.

- [ ] **Step 1: Failing tests** —
  - `parseStepAnswer refuses a carousel with fewer than 5 or more than 10 slides` (3 and 14 → refused, Review Focus 4);
  - `long headlines and bodies are cut to 8 and 25 words`;
  - `slide 1 is the cover`;
  - `briefWantsCarousel reads outputs and format`;
  - `Run project includes the carousel step only when the brief asks for one`; `run on its own it always runs`;
  - `slides are made one at a time at the brand's shape (4:5 → 1080×1350, 1:1 → 1080×1080)`;
  - `drawSlide fits the headline and body inside the picture`;
  - `buildPosts adds an Instagram and a Facebook carousel post with the carousel's own caption`;
  - `the Content video template has the carousel step after thumbnails`.
- [ ] **Step 2:** Run `npx vitest run src/test/services/contentFactory src/test/services/jose`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement; the template step count and every doc line naming it (16 → 17) change with it.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(miya): Miya writes carousels (5–10 slides, brand shape)`.

### Task 6: Carousel Studio

**Files:**
- Create: `src/components/miya/CarouselStudioTab.tsx`
- Modify: `src/components/MiyaStudio.tsx` (tab after Thumbnail Studio), `src/components/miya/ContentFactoryPanel.tsx`
- Test: `src/test/components/miya/CarouselStudioTab.test.tsx`

**Interfaces:**
- Consumes: Task 5 `renderCarouselSlides(…, only)`, `CarouselSlide`; existing `rejectPiece()` / `retryWithReason()` from `contentQualityGate.ts`.
- Produces: `reorderSlides(projectId, from: number, to: number): void` (in `contentProjectService.ts`; edits the chosen version, nothing goes out of date).

- [ ] **Step 1: Failing tests** — `shows each slide's picture, headline and text`; `Redo makes that slide again only`; `Move left/right reorders and is saved`; `Send back with a reason saves a brand lesson`; `with no carousel yet, says how to make one`.
- [ ] **Step 2:** Run `npx vitest run src/test/components/miya/CarouselStudioTab.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement with `ProjectPicture` and the shared `StepPanel`.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit `feat(miya): Carousel Studio`.

### Task 7: In-app sign-in (YouTube, Meta, Instagram) and Instagram token refresh

**Files:**
- Create: `src-tauri/src/oauth_signin.rs` (register in `lib.rs`); `src/services/signInService.ts`
- Modify: `src/components/ConnectorSetupPanel.tsx` ("Sign in" buttons, a step-by-step guide per service, the Instagram Login keys `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_LOGIN_TOKEN`, `INSTAGRAM_LOGIN_USER_ID`, and the route choice), `src/services/contentFactory/signInExpiry.ts` (`SignInService` adds `'instagram'`, 60 days, warn 7 days before), `src/services/marcusExecutionService.ts` (`checkSignIns` refreshes the Instagram token when under 10 days left), `scripts/auth-youtube.mjs` / `auth-meta.mjs` (header comment: "Developers only; users sign in from Settings").
- Test: Rust tests in `oauth_signin.rs`; `src/test/services/signInService.test.ts`; `signInExpiry.test.ts`; `ConnectorSetupPanel.test.jsx`.

**Interfaces:**
- Produces (commands): `oauth_sign_in({ service: 'youtube'|'meta'|'instagram', clientId, clientSecret }) -> { ok, tokens?: Record<string,string>, reason? }` (binds `127.0.0.1:<port>`, opens the browser with `tauri-plugin-opener`, waits ≤ 5 min, checks `state`, exchanges the code, for Meta the same follow-up as `scripts/auth-meta.mjs` (long-lived user token, Page token, Page id, Instagram business id), for Instagram the long-lived token and user id); `oauth_finish_pasted({ service, pastedUrl, clientId, clientSecret }) -> same` (the paste-the-address fallback); `instagram_refresh_token({ token }) -> { ok, token?, expiresInSecs?, reason? }`.
- Produces (app): `signIn(service): Promise<{ ok: boolean; reason?: string }>` (reads the saved app ID and secret, calls the command, saves every returned token with `saveConnectorCredential`, calls `recordSignIn`); `finishPastedSignIn(service, url)`.
- Pure Rust helpers to test: `fn auth_url(service, client_id, redirect, state, challenge) -> String`; `fn parse_callback(query, expected_state) -> Result<String /*code*/, String>`; `fn pkce_pair() -> (verifier, challenge)`.

- [ ] **Step 1: Failing tests (Rust)** — `auth_url_has_state_and_pkce` (Google and Meta carry `code_challenge`/`S256`, Instagram carries `state`); `callback_with_wrong_state_is_refused` and `callback_without_code_says_cancelled` (Review Focus 3); `pasted_address_with_trailing_hash_is_read` (Instagram's `#_`); `pkce_challenge_is_s256_of_verifier` (RFC 7636 appendix B vector); `listener_frees_the_port_after_timeout` (a 1 s timeout in the test, then the port binds again).
- [ ] **Step 2: Failing tests (app)** — `signIn saves every returned token and records the sign-in`; `signIn without an app ID says what to fill in` ("Fill in the Client ID and Client Secret first."); `checkSignIns refreshes the Instagram token under 10 days left and saves it`; `signInWarnings warns 7 days before the Instagram token ends`; panel: `each service has a Sign in button; Instagram has the route choice`.
- [ ] **Step 3:** Run both sets. Expected: FAIL.
- [ ] **Step 4:** Implement. Nothing from a token or secret goes into an error, a log line or an audit entry.
- [ ] **Step 5:** Run both sets, then `cargo clippy --all-targets -- -D warnings` and `npm run verify:no-window-coverage`. Expected: PASS, clean.
- [ ] **Step 6:** Commit `feat(connectors): sign in to YouTube, Facebook and Instagram from Settings`.

### Task 8: Docs, desktop spec, live check list, final checks

**Files:**
- Create: `e2e-desktop/specs/content-carousel.e2e.mjs` — a project with seeded slides shows in Carousel Studio; the Posts list has the Instagram and Facebook carousel; with no storage, approving the Instagram carousel gives "Post by hand" and the hand-posting folder holds the slides and `caption.txt`; nothing is posted.
- Modify: `CLAUDE.md` (rows for `mediaStorageService`/`media_storage.rs`, `readyToPost.ts`, `instagramRoute.ts`, the carousel step, `CarouselStudioTab.tsx`, `oauth_signin.rs`/`signInService.ts`; port 8087; connectors 31; desktop suite counts), `docs/CHANGELOG.md`, `docs/governance/DEFERRED_WORK.md` (3c's open items; 3d next; and a **"Shared Obsidian Media app (owner's business decision)"** entry: what it would take — Google's OAuth verification and security audit for the YouTube upload scope, Meta App Review for each permission, a small server of the owner's holding Meta's app secret for the token exchange, and the privacy policy both require — so users could sign in without making their own Google project or Meta app), `docs/qa/DESKTOP_QA_COVERAGE.md` (the spec row and a **"Combined live check (3a + 3b + 3c)"** entry listing, in order: sign in to YouTube, Meta and Instagram from Settings; connect storage and press Test; publish a test Reel to YouTube, Instagram and Facebook; move and cancel a scheduled YouTube video and Facebook Reel on the Calendar; post a carousel to Instagram (by link) and Facebook (photos); without storage, get "Post by hand"; check that nothing is left in the bucket), the dnd map, doc counts.
- [ ] **Step 1:** Write the desktop spec and the docs.
- [ ] **Step 2:** Run `npx vitest run` (expect all pass), `npm run -s lint`, `npx tsc --noEmit -p .`, `npm run -s verify:dnd-map`, `verify:dnd-coverage`, `verify:skill-matrix`, `verify:no-window-coverage`, `verify:npm-audit`, `node scripts/verify-doc-counts.mjs`, `node scripts/verify-tauri-versions.mjs`, `cargo fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --lib`. Expected: all pass/clean.
- [ ] **Step 3:** Commit `docs(miya): phase 3c, the carousel desktop spec, and the combined live check`.
- [ ] **Step 4:** Final self-review (no helper agents), push, open the PR, merge when green.
