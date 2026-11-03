# Phone app phase 3 part C (retire the Swift app, demo mode, App Store listing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The old Swift companion and the desktop's local-network server are archived, the phone app has a "Try a demo" mode that reaches nothing, and everything for the App Store submission is ready for the owner.

**Architecture:** Archiving moves files under `archive/MIGHTBEUSEDLATER/` and unhooks them, one green commit per area. The demo is a stand-in `PhoneLink` (`demoLink.ts`) that answers the same calls and mirror messages the real link does, from fixed sample data, so the real screens run unchanged. The listing is files under `docs/store/` plus a `site/` folder published by a GitHub Pages workflow.

**Tech Stack:** Rust/Tauri, TypeScript/React, Vitest, Capacitor phone app, GitHub Actions, Playwright (screenshots).

**Spec:** `docs/superpowers/specs/2026-11-02-alphonso-mobile-phase3c-design.md`

## Global Constraints

- R14: archive, never delete; owner approved the spec's list on 2026-11-02; anything else found is asked about first.
- Live services are not touched (Cloud Voice on AWS keeps running; no deploy, no AWS call).
- The demo sends nothing: it never imports `phoneSession`'s `connectPhone`, the relay, or push code.
- Demo refusal line: `DEMO_REFUSED = 'This is a demo: nothing is sent.'`; banner `DEMO_BANNER = 'Demo · sample data, nothing is sent'`.
- Publisher **Obsidian Media**; support through the repo's GitHub Issues page; no email published.
- iOS 16.4 minimum; app ID stays `com.alphonso.companion`; `phone-app-testflight.yml` stays the build path.
- Docs in the same commit as the code; `verify:dnd-coverage`, `verify-doc-counts`, the port map in CLAUDE.md, and `cargo clippy -D warnings` stay green.
- Actions pinned to exact versions (as the rest of `.github/workflows`).

## Review Focus

1. Something still imports an archived file (desktop build or a test breaks later) → Task 1 and 2 grep checks plus full build.
2. Port 8765 still opened by some other path after the server's removal → Task 1 test that `lib.rs` has no companion setup.
3. A demo action that reaches a real computer (e.g. a notification button, a queued outbox message replayed after pairing) → Task 3 test: after leaving the demo, the outbox is empty and no demo data stays in storage.
4. Leaving the demo then signing in shows sample data instead of the real computer's → Task 4 test.
5. The Pages workflow publishing more than `site/` → Task 5 check of the artifact path.

---

### Task 1: Archive the desktop's local-network companion server

**Files:** Move to `archive/MIGHTBEUSEDLATER/companion-lan/`: `src-tauri/src/companion_{auth,discovery,router,server,types}.rs`, `src/components/CompanionPairingPanel.tsx`, `src/services/companionCommandService.ts`, tests `src/test/CompanionPairingPanel.test.jsx`, `src/test/services/companionCommandService.test.ts`, `src/test/services/companionIntegration.test.js`, `src/test/appCompanionJose.test.js`. Modify `src-tauri/src/lib.rs` (the five `mod`s, setup at ~695–705, the seven commands at ~1008–1014), `src-tauri/Cargo.toml` + `Cargo.lock` (drop `mdns-sd` and `tokio-tungstenite` if nothing else uses them: grep first), `src/App.tsx` (the `companion://command` listener), `src/components/SettingsView.tsx` (Remote Access section), `src/test/SettingsView.smoke.test.jsx`, `capabilities/*.json` if they name companion commands, CLAUDE.md (port map: 8765 retired; remove/redirect rows), `archive/MIGHTBEUSEDLATER/MIGHTBEUSEDLATER.md`.

- [ ] Failing test `src/test/companionRetired.test.js`: `lib.rs` contains no `companion_`; no file under `src/` imports `CompanionPairingPanel` or `companionCommandService`; `App.tsx` has no `companion://`; Settings → Runtime no longer renders "Remote Access" pairing (smoke test).
- [ ] Run → FAIL. Move the files with `git mv`, unhook them. Run the new test, the Settings tests, `npx tsc --noEmit`, `cargo check`, `cargo clippy -- -D warnings` (from `src-tauri`; on Code-Integrity block, rely on CI and say so) → PASS.
- [ ] Docs: CLAUDE.md rows (Companion server, Companion pairing UI, Phone companion commands, iOS companion contract test, port map), AGENTS.md module list, counts (`fix_counts.py`), generated map, archive note. Commit `refactor: archive the local-network companion server (phone phase 3 part C)`.

### Task 2: Archive the Swift app, its build workflow and Atlas

**Files:** `git mv` to `archive/MIGHTBEUSEDLATER/swift-companion/`: `ios/AlphonsoCompanion/`, `.github/workflows/ios-build.yml`, `voice/cloud-backend/app/atlas_*.py` and `voice/cloud-backend/ATLAS_CONTROL_PLANE_DEMO.md`, `supabase/migrations/20260826230000_atlas_control_plane_foundation.sql`, `supabase/tests/atlas_control_plane_rls.test.sql`, `docs/platform/atlas-*`. Modify anything that imports the Atlas modules (`voice/cloud-backend/app/main.py` or routers: grep `atlas_`) and its tests (`voice/cloud-backend/tests`), CI references (`ci.yml` paths, CodeQL swift language, dependabot entries for the Swift project), docs naming the Swift app, `docs/governance/DEFERRED_WORK.md` (new entry: decide whether to shut down Cloud Voice on AWS; its only client retired).

- [ ] Failing check `src/test/swiftRetired.test.js`: no workflow references `ios/AlphonsoCompanion`; no `voice/cloud-backend/app/*.py` imports `atlas_`; `.github/codeql` / workflow matrix has no `swift`.
- [ ] Run → FAIL. Move and unhook. Run the check, `python -I -m pytest voice/cloud-backend/tests -q` (if the environment has the deps; else note it), `node scripts/verify-doc-counts.mjs` → PASS. Note: a removed Supabase migration is not reversed on any database (live data untouched); say so in the archive note.
- [ ] Docs and archive note; commit `refactor: archive the Swift companion, its iOS workflow and Atlas (phone phase 3 part C)`.

### Task 3: The demo link

**Files:** Create `src/mobile/demo/demoLink.ts`, `src/mobile/demo/demoData.ts`, bundled pictures `src/mobile/demo/pictures/*.webp` (2–3 made for the demo, small); Test `src/test/mobile/demoLink.test.ts`.

**Interfaces — Produces:** `createDemoLink(): PhoneLink` (from `phoneSession.ts`'s type): `online() === true`, `offlineSince() === null`; on `onMirror` subscription and on a `mirror.snapshot` call it emits `snapshot` messages for `requests`, `stepOutputs`, `chat`, `computer` (`{ name: 'Demo computer', demo: true }`), `content`, and empty part A/B stores; `call('chat.send', { messageId, text })` appends the user message and a fixed assistant reply `DEMO_CHAT_REPLY = "This is a demo, so I can't do that here. Pair your computer and I'll answer for real."` and returns ok; `call('media.preview', …)` serves the bundled pictures in the same info/piece shape `previewFetch.ts` expects; every other call → `{ ok: false, error: DEMO_REFUSED }`; `stop()` drops listeners. `DEMO_REFUSED`, `DEMO_BANNER`, `DEMO_CHAT_REPLY` exported. Sample data (`demoData.ts`): one request with Hector's research step done and a Marcus Slack send waiting with its exact text (`sendPreview`), one finished request; a three-message chat; one Miya Studio project with two scene pictures, a thumbnail and two calendar posts. No real names, keys or addresses.

- [ ] Failing tests: snapshots arrive; `createRemoteData(createDemoLink())` shows the waiting request and `approveStep` returns `DEMO_REFUSED`; a chat message gets `DEMO_CHAT_REPLY`; a Studio preview resolves to a picture; `settings.set`, `team.run`, `content.approvePosts` are refused; `demoLink.ts` source does not import `phoneSession`'s `connectPhone`, `phoneAccount` or any relay/push module.
- [ ] Run → FAIL. Implement. Run → PASS. Commit `feat(phone): a demo link with sample data that sends nothing`.

### Task 4: Try a demo, the banner, leaving it

**Files:** Modify `src/mobile/screens/SignIn.tsx` (button "Try a demo", prop `onDemo`), `src/mobile/MobileApp.tsx` (state `demo`; when on, render `LinkedApp` with `createDemoLink()`, no lock prompt for opening, header `DEMO_BANNER` with "Leave demo"; More's Sign out becomes Leave demo), `src/mobile/screens/More.tsx` (prop `demo`: each page button shows "Pair your computer to use this." instead of opening; lock and sign-out rows hidden); Test `src/test/mobile/demoMode.test.tsx`.

- [ ] Failing tests: sign-in screen has "Try a demo"; tapping it shows `DEMO_BANNER` on Chat, Requests, Studio, Calendar and More; Approve on the waiting step shows `DEMO_REFUSED`; More's pages say "Pair your computer to use this."; Leave demo returns to sign-in and leaves no demo request, chat or outbox entry in `localStorage`; signing in afterwards uses the real `connect` (spy) not the demo.
- [ ] Run → FAIL. Implement. Run → PASS; `cd mobile && npm run typecheck && npm run build`. Docs: `docs/PHONE.md` (Try a demo), CHANGELOG, CLAUDE.md row. Commit `feat(phone): Try a demo on the sign-in screen`.

### Task 5: Privacy policy and support pages on GitHub Pages

**Files:** Create `site/index.html` (links to both), `site/privacy.html`, `site/support.html`, `site/style.css`; `.github/workflows/pages.yml` (on push to `main` touching `site/**` and manual; `actions/configure-pages`, `actions/upload-pages-artifact` with `path: site`, `actions/deploy-pages`, exact versions; permissions `pages: write`, `id-token: write`); Test `src/test/sitePages.test.js`.

- [ ] Failing test: the three pages exist; privacy names Obsidian Media and links the GitHub Issues page; neither page contains an `@` email address; the workflow uploads `path: site` only.
- [ ] Write the privacy policy from the code, citing in a comment block at the top which file backs each statement: what the relay can read (read `gateway/phone-relay` store and logs), push identifiers and that notices carry only "New activity", the sign-in providers and email, Face ID staying on the phone, no tracking or ads, no data sold, deletion (Remove a phone / sign out; how to ask through Issues). Anything you can't confirm from the code is written as a question in `docs/store/OPEN_QUESTIONS.md` for the owner, not guessed.
- [ ] Run → PASS. Commit `docs(store): privacy policy and support pages for GitHub Pages`.

### Task 6: The App Store listing, privacy labels, screenshots, checklist

**Files:** Create `docs/store/app-store.md` (name "Alphonso" (≤30), subtitle (≤30), promotional text (≤170), description (≤4000), keywords (≤100, comma-separated), what's new, support URL `https://github.com/obsidian-media/AlphonsoEcosystem/issues`, privacy URL `https://obsidian-media.github.io/AlphonsoEcosystem/privacy.html`, marketing URL optional, review notes: open "Try a demo" on the sign-in screen; real use needs the free desktop app), `docs/store/privacy-labels.md` (each Apple data type: collected or not, linked to the user or not, used for tracking (no), with the file that backs it), `docs/store/SUBMIT_CHECKLIST.md` (owner steps: turn on Pages (Settings → Pages → Source: GitHub Actions), App Store Connect app record, price Free, category Productivity (suggestion), age rating questionnaire, privacy labels, screenshots, review notes, build from `phone-app-testflight.yml`, submit), `mobile/scripts/store-screenshots.mjs` (Playwright: builds nothing, serves `mobile/dist`, opens the demo at 440×956 @3x (6.9") and 414×896 @3x (6.5"; check Apple's current required sizes and record the source and date in the checklist), screens Chat, Requests with the waiting step, Studio project, Calendar; writes PNGs to `docs/store/screenshots/<size>/`); Test `src/test/storeListing.test.js`.

- [ ] Check whether the Capacitor iOS project targets iPad (`TARGETED_DEVICE_FAMILY` in `mobile/ios`); if it does, add 13" iPad screenshots or set iPhone only, as a ledger ruling (iPhone only unless the design says otherwise).
- [ ] Failing test: each field in `app-store.md` within Apple's limits; keywords have no spaces after commas; privacy labels list "Tracking: No"; no email address in any store file.
- [ ] Run → FAIL. Write the files; run the screenshot script (`cd mobile && npm run build && node scripts/store-screenshots.mjs`); look at each PNG. Run → PASS. Docs: CHANGELOG, `docs/PHONE.md` (pointer to `docs/store/`). Commit `docs(store): App Store listing, privacy labels, screenshots and checklist`.
