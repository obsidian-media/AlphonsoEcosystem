# Alphonso In-App Auto-Update — Handoff Plan

**Prepared by:** Claude Code (2026-07-10)
**Branch:** `feat/in-app-auto-update` (created empty, work not started)
**Status:** Not started — this document is the complete scope for whoever picks it up
**Single source of truth:** `docs/ALPHONSO_GROUND_TRUTH.md`

---

## What This Document Is For

Update *checking* already works (see "Already Built" below). What's missing is
the actual download → install → relaunch flow. This file is the full briefing
for building that out: what exists today, why it stops where it stops, and
what needs to be added.

---

## Already Built (do not duplicate)

- `src/services/appUpdateService.ts` — `checkAppUpdate()` calls the Rust
  Tauri command `check_app_update`, which hits the configured updater
  endpoint and returns `{ available, latestVersion, downloadUrl, notes,
  pubDate, trust }`. Fully tested (19 passing tests).
- Called from a boot `useEffect` in `App.tsx` (~line 391-414).
- `src/components/UpdaterNotification.tsx` — amber banner, shows when an
  update is available. Its button is now labeled "Download Update" (was
  misleadingly "Update & Restart" until 2026-07-10 — it never restarted
  anything).
- Clicking the button currently calls `invoke('open_url', { url:
  updaterDownloadUrl })` (falls back to `window.open` if that fails) —
  i.e. it opens the release page/installer download in the OS browser.
  The user then has to manually run the installer and relaunch the app.
- `src-tauri/tauri.conf.json`'s `plugins.updater` block already has a real
  endpoint + pubkey configured (used by `release.yml`'s signed release
  pipeline) — the updater *server-side* infrastructure is real and working,
  it's genuinely just the *client-side* auto-install UX that's missing.

## What's Missing

Full self-update: check → download → verify signature → install → relaunch,
without the user ever leaving the app or touching a browser/installer.

## Why It Wasn't Built Yet

Requires two Tauri plugins that are **not currently installed**:
- `@tauri-apps/plugin-updater` (npm) + the matching Rust crate
- `@tauri-apps/plugin-process` (npm) + the matching Rust crate (for the
  relaunch step)

Installing and wiring these is a real scope of work — new Cargo/npm deps,
new capability grants in `src-tauri/capabilities/default.json`, and (most
importantly) **this can only be properly tested against a real, signed
release artifact** — it can't be verified in a dev build alone. That's why
this is being handed off rather than attempted blind in the same pass as
the smaller bug fixes.

---

## Scope for the Implementer

### 1. Add the plugins
```bash
cd src-tauri
cargo add tauri-plugin-updater tauri-plugin-process
cd ..
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

### 2. Register in `src-tauri/src/lib.rs`
Add `.plugin(tauri_plugin_updater::Builder::new().build())` and
`.plugin(tauri_plugin_process::init())` to the `tauri::Builder` chain
(look at how existing plugins — `tauri_plugin_dialog`, etc. — are
registered nearby for the exact pattern already used in this file).

### 3. Add capability grants
`src-tauri/capabilities/default.json` needs `updater:default` (already
present — check it covers the new plugin's specific permissions, e.g.
`updater:allow-check`, `updater:allow-download-and-install`) and
`process:allow-restart` for the relaunch step. Verify against the
installed plugin's actual permission identifiers — do not guess, read
`gen/schemas/desktop-schema.json` after `cargo check` regenerates it.

### 4. Replace the click handler
In `App.tsx`, the `onUpdate` callback currently passed to
`<UpdaterNotification>` (~line 568-572) opens a URL. Replace with the
`@tauri-apps/plugin-updater` JS API: `check()` → `update.downloadAndInstall
(onProgressCallback)` → `relaunch()` from `@tauri-apps/plugin-process`.
Show real download progress in the existing banner (add a progress bar
to `UpdaterNotification.tsx` — it currently has no progress UI at all).

### 5. Handle failure paths
- Signature verification failure (corrupted/tampered download) — must
  fail loud, never silently fall back to the old open-URL behavior without
  telling the user why.
- Network interruption mid-download — resumable or at minimum a clean
  retry, not a silent hang.
- No update available / already on latest — existing `checkAppUpdate()`
  already handles this correctly, don't touch it.

### 6. Do NOT remove the existing `checkAppUpdate()` / `check_app_update`
Rust command — the new plugin's own `check()` call is a separate,
additional path specifically for the download+install flow. Keep both;
`checkAppUpdate()` remains useful for the lightweight "is there a new
version" banner check without pulling in the full updater plugin's more
opinionated API surface, per this repo's existing "Do NOT add a second
update-check path" note in `CLAUDE.md` — that note is about check-only
paths, this is explicitly the download/install path which is intentionally
new.

### 7. Testing
- `cargo check` and `cargo clippy -- -D warnings` must stay clean.
- This needs an actual signed test release to verify end-to-end — do not
  claim this is "done" from a dev build alone. At minimum, cut a real
  tagged pre-release via the existing `release.yml` pipeline and manually
  verify: old installed version detects the new one, downloads it,
  installs it, and relaunches into the new version with no data loss
  (settings/credentials/memory intact after relaunch).
- Add unit tests for the new click-handler logic (mock the plugin API)
  following the existing pattern in `src/test/services/` for
  `appUpdateService.test.ts`.

---

## Acceptance Criteria

- [ ] User sees the amber "Update Available" banner (unchanged)
- [ ] Clicking the button downloads the update in-app with visible progress
- [ ] Update is signature-verified before install
- [ ] App installs the update and relaunches automatically
- [ ] User's settings/credentials/memory persist across the relaunch
- [ ] Failure at any step shows a clear, honest error — never silently
      falls through to looking like success
- [ ] `cargo check` / `cargo clippy -- -D warnings` / `npm run typecheck`
      all clean
- [ ] Verified against a real signed release, not just a dev build

## PR Process

Open the PR against `main` from `feat/in-app-auto-update`. Tag it for
review — Claude Code will verify against this handoff's acceptance
criteria before merge, not just check that CI is green.
