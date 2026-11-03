# Alphonso phone app, phase 3 part C: retire the Swift app, demo mode, App Store listing

**Status:** approved by the owner on 2026-11-02.
Builds on parts A and B (`2026-11-02-alphonso-mobile-phase3a-design.md`, `…-phase3b-design.md`)
and the phone app design (`2026-10-31-alphonso-mobile-design.md`, which says the Swift app retires
once the new app does everything).

## Why

After part B the new phone app does everything the old Swift companion did, through the sealed relay.
The old app and the desktop's local-network server behind it are now a second, weaker way into the
computer (a PIN over the local network) and code nobody uses. Part C retires them and gets the new app
ready for the App Store, which needs a way for Apple's reviewers to try an app that only works with a
paired computer.

## Goals (owner, 2026-11-02)

1. **Retire all of the old path**, archived to `archive/MIGHTBEUSEDLATER/` (not deleted, R14, owner
   approved 2026-11-02):
   - the Swift app `ios/AlphonsoCompanion/` with its Atlas preview, and its tests;
   - the desktop's local-network server: `companion_server.rs`, `companion_auth.rs`,
     `companion_discovery.rs`, `companion_router.rs`, `companion_types.rs`, their `lib.rs` wiring and
     commands, and the `mdns-sd` crate if nothing else uses it;
   - the desktop side that only served it: `CompanionPairingPanel.tsx` (Settings → Runtime → Remote
     Access), `companionCommandService.ts` and App's `companion://command` listener, and their tests
     (`CompanionPairingPanel.test.jsx`, `companionCommandService.test.ts`, `companionIntegration.test.js`,
     `appCompanionJose.test.js`, the Settings smoke checks for the panel);
   - the old iOS build workflow `.github/workflows/ios-build.yml`;
   - Atlas's server-side code: the control plane in `voice/cloud-backend/app/atlas_*.py` (and its demo
     doc), the Supabase migration and test for it, and `docs/platform/atlas-*`.
   The new app keeps its app ID `com.alphonso.companion`. The old app was on TestFlight only, so the
   new app is simply the next TestFlight build; nobody on the public store is affected.
2. **A demo mode** on the phone's sign-in screen ("Try a demo"), so Apple's reviewers, and anyone before
   pairing, can see the app work. It shows sample data for **Requests and approvals** (a request with a
   step waiting; Approve shows what would happen), **Chat** (a short sample conversation; new messages
   get a fixed answer saying it is a demo) and **Miya Studio** (a sample project with pictures and a
   calendar of posts). Clearly marked as a demo on every screen; it sends nothing and reaches no relay.
3. **The App Store listing**, prepared for the owner to submit (owner: "You submit; I prepare"):
   - store text: name, subtitle, description, keywords, promotional text, what's new, review notes
     (how to open the demo);
   - Apple's privacy labels, matched to what the app really collects;
   - screenshots from the demo mode at the sizes Apple requires;
   - a privacy policy page and a support page, published with GitHub Pages from this public repo; the
     publisher is **Obsidian Media**, and support is through the repo's GitHub Issues page, with no email
     published (owner);
   - a step-by-step submission checklist.
   Google Play is later (owner: Apple only for now).

## Non-goals

- Shutting down Cloud Voice on AWS or any live service. It keeps running untouched; whether to shut it
  down (and stop its costs) is logged as a separate decision in the deferred list (owner).
- A Google Play listing.
- Submitting to the store (the owner submits).
- A connection over the local network as a fallback for the new app.

## Anti-goals

- **A demo that could be mistaken for real**, or that reaches a computer, the relay or a store service.
- **Breaking anything that still uses a shared piece.** Before archiving a file, everything that
  imports it is checked; a piece that something else needs stays (for example `CompanionMode.tsx`, the
  Simple Mode chat, is unrelated and stays).
- **Claims in the listing or privacy labels the app doesn't live up to.**
- Dead references left behind: the port map, CLAUDE.md rows, guides and counts move with the code.

## Decisions

### Owner's (2026-11-02)
All of the old path retires; the old app was TestFlight only; demo mode for reviewers, showing
Requests and approvals, Chat and Miya Studio; store text, privacy answers, screenshots, privacy policy
and support page; pages on GitHub Pages; Apple only for now; the owner submits; Atlas's code is
archived and services keep running; publisher Obsidian Media, support through GitHub Issues.

### My calls (the owner can change any)
- **The demo is a second data source behind the same screens**: the screens take the same `board`,
  `chat`, `studio` and `more` objects; the demo supplies fixed sample data and refuses every call with
  "This is a demo: nothing is sent." Nothing in the demo imports the relay or the session code.
- **Demo content is written once, in plain words, with no real names, keys or addresses**; pictures are
  bundled sample images made for it (not from a real project).
- **More in the demo** lists its pages, each saying "Pair your computer to use this."
- **Leaving the demo** returns to sign-in; nothing from the demo is kept.
- **Privacy labels:** the app's content is end-to-end encrypted between the phone and the user's own
  computer and isn't readable by the relay; Apple's definition of "collected" then covers only what the
  relay or push service can read (device and push identifiers, the sign-in email). Each answer cites the
  code that backs it, and anything uncertain is marked for the owner rather than guessed.
- **GitHub Pages** publishes only a `site/` folder (privacy and support pages), through a workflow, so
  nothing else in the repo becomes a website. Turning Pages on in the repository's settings is the
  owner's step in the checklist.
- **Screenshots** are taken automatically from the demo in a phone-sized browser at Apple's required
  sizes, then checked by eye.
- **Price free, age rating and category** are filled in the checklist as suggestions (free, as Alphonso
  launches free; the age rating from Apple's questionnaire answered truthfully for an AI chat app) for
  the owner to confirm in App Store Connect.
- **The archive** keeps each retired piece's tests with it and a note in
  `archive/MIGHTBEUSEDLATER/MIGHTBEUSEDLATER.md` saying why it retired and what to check before
  bringing it back.

## Constraints

- Parts A and B's rules hold (sealed relay, nothing secret on the phone, plain words, no hardcoding).
- iOS 16.4 minimum; the new app's TestFlight workflow (`phone-app-testflight.yml`) stays the build path.
- R14: archiving needs the owner's OK (given 2026-11-02 for the list above); anything found during the
  work that isn't on the list is asked about first.
- Docs in the same commit as the code; counts and the generated map stay fresh.

## Left to the builder

- The exact sample data, within the content above.
- The order of the archiving commits, as long as each leaves the build and tests green.
- The store text's wording, within Apple's length limits, for the owner to review.

## Checks

- After the archive: the desktop builds (`cargo check`, `clippy -D warnings`, `npm run build`), all tests
  pass, nothing imports an archived file, and the app starts with no listener on port 8765.
- Demo: unit tests that every demo call is refused and nothing touches the relay or session; the demo
  banner shows on every screen; leaving it returns to sign-in.
- Pages: the workflow publishes only `site/`; both pages load once Pages is on.
- The owner checks the demo on a real iPhone from TestFlight before submitting.
