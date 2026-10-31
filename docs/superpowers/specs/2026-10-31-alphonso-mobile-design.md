# Alphonso on the phone: design

**Status:** design, waiting for the owner's approval. Not started. Planned for right after 2.11.0.
**Owner's decisions (2026-10-31):** every screen of the desktop app, reshaped for a phone; iPhone and Android; usable from anywhere through an Obsidian Media relay, end-to-end encrypted; the desktop's own screens reused ("A"), not native apps rebuilt; when the computer is off, say so and show the last known state; notifications with Approve/Reject like Telegram; for everyone who installs Alphonso, in the App Store and Google Play, free; sign in with Apple or Google, plus email; the relay runs on Google Cloud next to Cloud Voice; first after 2.11.0.

## Why

The owner wants to use Alphonso from the phone as the same app, not a remote with a few buttons: start work, follow it, approve and stop it, open Miya's projects and the Calendar, while away from the computer. Telegram does part of this in text. For a public launch, users will expect a phone app.

## What exists and what happens to it

- **The Swift app** (`ios/AlphonsoCompanion/`, about 11,000 lines, 8 tabs) talks to the desktop over the local network (`companion_server.rs`, port 8765, a PIN). Chat works through Jose. Its approvals list reads `alphonso_project_execution_approvals_v1` (the Projects page archived on 2026-10-27), its Approve only opens the desktop's approval window, and its Boardroom reads the sessions from before threads. **It retires** when the new app ships, with its **Atlas** preview (a cloud shell wired to a demo control plane, "not production eligible" by its own release doc). Per R14, the code moves to `archive/MIGHTBEUSEDLATER/` with the owner's approval, not deleted.
- **Voice and Translator** (Cloud Voice) are not part of this design; they move to Google Cloud separately. The new app gets them once Cloud Voice has moved (my call: keep this project from waiting on that).
- **The desktop companion server** (WebSocket, PIN, mDNS) is replaced by the relay link below. The LAN pairing panel in Settings becomes the phone pairing panel.

## Goals

1. Every desktop screen on the phone, reshaped for a phone: Chat, the Requests board (plan map, steps, outputs, change log), approvals with the exact text and cost, Stop / Carry on / Cancel, Miya Studio, the Calendar, Echo's memory, Projects, Teams, Skills, Boardroom, Settings and Connectors.
2. Works from anywhere: home Wi-Fi or mobile data, through the relay.
3. Notifications for a step waiting, a plan waiting, a request done or failed, and a request cut off when the app closed: the same events and wording as `collectJoseNotifications()`. Approve/Reject from the notification for a step whose effects are not locked; a step that spends, publishes or sends, or deletes (`LOCKED_EFFECTS`) opens the app on its approval (owner, 2026-10-31: a notification can be cut short, so a send, a spend or a delete is approved where the exact text and cost are shown in full, confirmed with Face ID / fingerprint).
4. One app for iPhone and Android, built from the desktop's React screens.
5. Honest when the computer is off: the last known state, read-only, with "Your computer is offline since 14:02." Messages typed meanwhile wait on the phone and are sent when it is back.

## Non-goals

- Agents, models or tools running on the phone. The computer does all the work.
- A cloud copy of the user's data. The relay passes encrypted messages and keeps nothing it can read.
- Waking the computer, or answering in the cloud while it is off.
- Several computers per account (that comes with "Echo on several computers"; the design must not prevent it).

## Anti-goals (a failure even if it works)

- **Approvals get weaker on the phone.** Every approval rule (`effectsNeedingApproval()`, locked effects, the monthly cap, Approval Mode) is decided by the computer, exactly as for the desktop window. The phone only shows and answers.
- **The relay can read anything.** Message content, notification text, file names and costs are encrypted end to end; the relay sees account and device ids, sizes and times only.
- **The phone drifts from the desktop.** A screen exists once. A desktop change reaches the phone without a second implementation.
- **A stolen phone controls the computer.** Devices can be removed from the computer (Settings → Phones) and from the phone's account; the app can require Face ID / fingerprint to open (on by default, my call).

## How it works

### The app

- One React codebase: the desktop's components with phone layouts (one column, bottom tabs: Chat, Requests, Studio, Calendar, More), packaged for iPhone and Android. The builder chooses the packaging (Tauri 2 mobile or Capacitor) after a short spike on two points: push notifications with a notification extension on both platforms, and the WebSocket staying usable in the background long enough to answer a notification action.
- **The computer runs the services; the phone runs the screens.** Today screens call services directly and the services keep their state in the desktop window's storage (`durableStore`, localStorage plus the KV store). The phone cannot run those services. The design needs a seam:
  - **Read:** the stores a screen reads (requests, step outputs, settings without secrets, brands and projects, the calendar's items, Echo's decisions, skills, teams, connector status) are mirrored to the phone through the link, read-only, and kept current by change events from the computer.
  - **Act:** each action a screen takes is a named call the computer runs with its existing function (`approveRequestStep`, `rejectRequestStep`, `stopRequest`, `carryOnRequest`, `submitToJose`, `answerOrPlan`, `movePost`, …). The phone never writes the computer's stores.
  - Screens get their data and actions through one interface with a "here" implementation (the desktop, unchanged behaviour) and a "remote" one (the phone). Making screens go through it is most of the work, screen by screen.
- **Files and pictures** (Studio's pictures and videos, Hector's sources) are fetched from the computer on demand, encrypted, cached on the phone.
- **Things that can only happen on the computer** (choosing a folder, installing a tool in Runtime Hub, signing in to a service in the computer's browser) show what they need and "Do this on your computer", never a broken button.

### The relay (Obsidian Media, Google Cloud)

- Accounts: Sign in with Apple, Google, or email (one-time link). The account links devices to computers; it stores no user content.
- Pairing: the computer shows a QR code in Settings → Phones. Scanning it exchanges the two devices' public keys directly (in the QR), so the relay never holds a key that decrypts traffic. Each phone has its own key and can be removed.
- Traffic: an end-to-end encrypted channel per phone–computer pair (an established protocol such as Noise or libsodium sealed boxes; the builder picks, no home-made cryptography). The relay forwards frames between the computer's outgoing connection and the phone; neither side needs an open port.
- Notifications: the computer encrypts the notification and the relay hands it to Apple's or Google's push service; the phone decrypts it on the device (a notification extension) before showing it.
- Limits: per account and per device rate limits and size caps; an account with no paired computer cannot send traffic. Cost and limits are written into the plan with numbers.
- Runs beside Cloud Voice on Google Cloud, deployed by CI from the repo like Cloud Voice, with its own health check.

### On the computer

- Settings → Phones: sign in, show the QR code, list paired phones with their last use, remove one, and a switch to turn phone access off (off until the user pairs a phone).
- The link is an outgoing connection to the relay while the app is open, so no port is opened on the user's network. When the app closes, the phone sees "offline since".

## Phases (my call; each one ships something usable)

1. **The link and the everyday screens:** relay with sign-in and pairing, the seam for Chat and the Requests board, approvals, Stop / Carry on / Cancel, notifications, offline state. Replaces Telegram for the owner's daily use.
2. **Studio and Calendar:** Miya Studio's tabs and the Calendar, with pictures and videos from the computer.
3. **Everything else:** memory, Projects, Teams, Skills, Boardroom, Settings and Connectors. Then the Swift app retires and both stores get the new app.

## Constraints

- The project's rules apply: no hardcoded model names, addresses or lists; plain words on screen; secrets never leave the keychain and never cross the relay unencrypted; R14 for anything archived.
- App Store and Google Play rules: Sign in with Apple when other sign-ins are offered (owner chose it); the app must be useful without a paid account (it is free).
- Desktop E2E keeps testing the desktop; the phone app gets its own end-to-end tests against a stand-in relay and a debug desktop build, plus a by-hand check on real phones before each store release.

## Left to the builder

- Tauri 2 mobile or Capacitor (after the spike above).
- The encryption library and protocol, within "established, not home-made".
- How each screen's store mirroring and change events are batched.
- The relay's language and Google Cloud service (Cloud Run is the default unless the spike shows long-lived connections need something else).
