# Alphonso on the phone, phase 1: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use Alphonso from an iPhone or Android phone, from anywhere: Chat, the Requests board, approvals, Stop / Carry on / Cancel, notifications, and an honest offline state, through an end-to-end encrypted Obsidian Media relay.

**Architecture:** The computer keeps running every service; the phone runs the desktop's React screens in a phone layout. Both talk through one encrypted protocol (`src/services/phone/`), used by the desktop window and the phone app alike, over a relay on Google Cloud that only forwards sealed frames. Screens read and act through small "data" interfaces with a here (desktop) and a remote (phone) implementation.

**Tech Stack:** React + TypeScript (shared), libsodium (`libsodium-wrappers`, `crypto_box`), Firebase Authentication (Apple, Google, email link) and Firestore and Firebase Cloud Messaging on Google Cloud, a Node 20 relay on Cloud Run, the phone packaging chosen in Task 1 (Tauri 2 mobile or Capacitor), Vitest, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-31-alphonso-mobile-design.md` (approved 2026-10-31). Phase 1 only; phases 2 to 4 get their own plans.

## Global Constraints

- The computer decides every approval: `effectsNeedingApproval()`, `LOCKED_EFFECTS`, the monthly cap and Approval Mode run on the computer. The phone only shows and answers.
- The relay never sees content: calls, results, store data, notification text, file names and costs are sealed with `crypto_box` between the paired phone and computer. The relay sees account ids, device ids, sizes and times.
- Keys: the computer's private key in the OS keychain (`secureSet`/`secureGet` in `secureStorageService.ts`), the phone's in its own secure storage. No key in localStorage, a log or an error.
- A step that spends, sends or publishes, or deletes (`LOCKED_EFFECTS`) is never approved from a notification: the notification opens the app on it, and Face ID / fingerprint confirms (owner, 2026-10-31).
- Face ID / fingerprint to open the app, on by default.
- Phone access is off on the computer until the user pairs a phone (Settings → Phones).
- No hardcoded addresses, model names or lists: the relay address and Firebase project come from build configuration.
- Plain words on screen; the desktop's existing tests keep passing; docs in the same commit as the code (CLAUDE.md row, CHANGELOG, `verify-doc-counts`, `generate:dnd-map`).
- No home-made cryptography.

## Review Focus

1. **The same step approved twice** (from the notification and in the app, or from two phones): the computer runs it once and the second answer says "Already done." (Task 6 test `approve twice runs once`).
2. **The computer restarts while a phone is connected:** the phone shows offline, then reconnects and replaces its mirror with a fresh snapshot, never merging stale data (Task 7 test `reconnect replaces the mirror`).
3. **A removed phone still holds its keys:** the computer refuses its frames even if the relay forwards them (Task 5 test `removed device is refused`).
4. **A notification action arrives after the request already moved on** (approved on the desktop, expired, stopped): the phone shows the request's current state, nothing runs (Task 9 test `stale notification action`).
5. **A message typed while offline is sent twice** when the link flaps: queued messages carry an id and the computer ignores a repeat (Task 7 test `queued message sent once`).

---

## Before Task 1: what the owner sets up

- A Google Cloud project with Firebase enabled (Authentication with Apple, Google and email link; Firestore; Cloud Messaging), and billing for Cloud Run.
- The APNs key from the Apple Developer account uploaded to Firebase; a Google Play developer account (for Task 10's test build).
- These are the owner's accounts; the plan never creates them.

### Task 1: Packaging spike (throwaway)

**Files:**
- Create: `docs/superpowers/specs/2026-11-xx-mobile-spike-findings.md` (dated when run)
- Throwaway code on branch `spike/mobile-packaging`, never merged

**Interfaces:**
- Produces: the packaging choice (`tauri-mobile` or `capacitor`), the push plugin and the notification-extension approach for each platform, and whether a WebSocket stays open long enough to answer a notification action. Later tasks read this file; Task 8's shell and Task 9's notification code use its choices.

- [ ] **Step 1:** Build a minimal app in each packaging that loads one desktop component (`JosePlanMap` with a fixed request) on an iPhone simulator and an Android emulator.
- [ ] **Step 2:** In each, receive a Firebase push whose payload is sealed with `crypto_box`, decrypt it in a notification extension (iOS Notification Service Extension; Android data message), and show the text.
- [ ] **Step 3:** In each, answer a notification action ("Approve") with a WebSocket frame within 10 seconds while the app is in the background.
- [ ] **Step 4:** Write the findings file: what worked on each platform, the choice and why, and anything Tasks 8–9 must do differently. Expected: one packaging passes Steps 1–3 on both platforms; if neither does, stop and bring the findings to the owner.
- [ ] **Step 5:** Commit the findings file on `feat/mobile-app`.

### Task 2: The protocol and its crypto

**Files:**
- Create: `src/services/phone/phoneCrypto.ts`, `src/services/phone/phoneProtocol.ts`
- Test: `src/test/services/phone/phoneCrypto.test.ts`, `src/test/services/phone/phoneProtocol.test.ts`

**Interfaces:**
- Produces:
  - `generateKeyPair(): Promise<{ publicKey: string; privateKey: string }>` (base64url)
  - `seal(message: Uint8Array, theirPublic: string, myPrivate: string): Promise<string>` / `open(sealed: string, theirPublic: string, myPrivate: string): Promise<Uint8Array | null>` (`crypto_box_easy` with a random nonce prefixed; `null` when it doesn't open)
  - `pairingPayload(input: { computerId: string; computerPublicKey: string; computerName: string; relayUrl: string }): string` and `readPairingPayload(text: string): PairingInfo | null` (the QR contents)
  - `type PhoneMessage = { id: string; kind: 'call'; name: PhoneCallName; args: unknown } | { id: string; kind: 'result'; ok: boolean; value?: unknown; error?: string } | { id: string; kind: 'snapshot'; store: MirroredStore; data: unknown; version: number } | { id: string; kind: 'change'; store: MirroredStore; data: unknown; version: number } | { id: string; kind: 'notice'; notification: PhoneNotification }`
  - `encodeMessage(msg: PhoneMessage, keys): Promise<string>` / `decodeMessage(frame: string, keys): Promise<PhoneMessage | null>`
  - `PHONE_PROTOCOL_VERSION = 1`

- [ ] **Step 1: Write the failing tests**: `a sealed message opens with the right keys`; `a sealed message does not open with another phone's keys` (→ `null`); `a frame changed by one byte does not open`; `the pairing payload round-trips and refuses an unknown version`; `a message larger than 4 MB is refused before sealing` (`PHONE_MAX_FRAME_BYTES = 4 * 1024 * 1024`).
- [ ] **Step 2:** Run `npx vitest run src/test/services/phone/`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement with `libsodium-wrappers` (add the dependency, pinned).
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with the CLAUDE.md row "Phone protocol" and the dnd map.

### Task 3: The relay

**Files:**
- Create: `gateway/phone-relay/` (`package.json`, `Dockerfile`, `src/server.js`, `src/auth.js`, `src/routing.js`, `src/limits.js`, `src/push.js`, `README.md`)
- Test: `gateway/phone-relay/src/*.test.mjs`; add them to the "Gateway queue tests" step in `.github/workflows/ci.yml`

**Interfaces:**
- Produces (WebSocket at `/link`, JSON frames):
  - `{ type: 'hello', idToken, deviceId, role: 'computer' | 'phone' }` → `{ type: 'ready' }` or close with code 4401 (bad token) / 4403 (device not paired to this account)
  - `{ type: 'to', deviceId, frame }` → forwarded as `{ type: 'from', deviceId, frame }`; `{ type: 'offline', deviceId, sinceMs }` when the target isn't connected
  - `{ type: 'push', deviceId, sealed }` → an FCM data message to that phone
  - HTTP: `POST /pair` (`idToken`, `computerId`, `phoneDeviceId`, `phonePublicKey`) records the pairing in Firestore; `DELETE /pair/:phoneDeviceId`; `GET /healthz`
- Firestore collections: `devices/{deviceId}` (`uid`, `role`, `name`, `lastSeenMs`, `fcmToken`), `pairings/{phoneDeviceId}` (`uid`, `computerId`, `createdAtMs`). No content.

- [ ] **Step 1: Write the failing tests** (Firebase Admin and Firestore stubbed): `a frame is forwarded only between devices paired under the same account`; `a bad ID token closes with 4401`; `an unpaired device closes with 4403`; `frames over 4 MB are refused`; `a device over 60 frames a second, or 200 MB a day, is slowed and then refused` (`LIMITS` in `limits.js`, the numbers as constants); `the computer's absence is answered with offline and its last-seen time`; `a removed pairing stops forwarding at once`.
- [ ] **Step 2:** Run `node --test gateway/phone-relay/src/`. Expected: FAIL.
- [ ] **Step 3:** Implement with `ws` and `firebase-admin` (pinned). The relay never parses `frame` or `sealed`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with the README (how to run it, what it stores, what it can't read).

### Task 4: Deploying the relay

**Files:**
- Create: `.github/workflows/deploy-phone-relay.yml`, `gateway/phone-relay/cloudrun.md`

**Interfaces:**
- Consumes: Task 3's container.
- Produces: `PHONE_RELAY_URL` (a build setting for the desktop and the phone app, never written in code).

- [ ] **Step 1:** Write the workflow (manual trigger, Workload Identity Federation to the owner's project, build, deploy to Cloud Run with session affinity and a 3,600-second request timeout; clients reconnect at the limit).
- [ ] **Step 2:** Run it once with the owner. Expected: `GET /healthz` answers 200; `cloudrun.md` records the service name, region and monthly cost estimate.
- [ ] **Step 3:** Commit.

### Task 5: The computer's side: Settings → Phones and the link

**Files:**
- Create: `src/services/phone/phoneLink.ts`, `src/services/phone/phoneAccount.ts`, `src/components/phone/PhonesSection.tsx`
- Modify: `src/components/SettingsView.tsx` (the section, replacing `CompanionPairingPanel` under Runtime → Remote Access), `src-tauri/tauri.conf.json` (CSP `connect-src` gains the relay origin from the build setting), `src/App.tsx` (start the link at first render when phone access is on; not in the Coach window)
- Test: `src/test/services/phone/phoneLink.test.ts`, `src/test/components/phone/PhonesSection.test.tsx`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `signInComputer(method: 'apple' | 'google' | 'email', email?: string): Promise<{ ok: boolean; reason?: string }>` (Firebase Auth in the window; the refresh token kept with `secureSet`)
  - `pairingQr(): Promise<string>` (Task 2's payload)
  - `listPhones(): Promise<Array<{ deviceId: string; name: string; lastSeenMs: number | null }>>`, `removePhone(deviceId: string): Promise<void>`
  - `startPhoneLink(): () => void`, `onPhoneCall(handler: (msg: PhoneMessage & { kind: 'call' }, from: string) => Promise<unknown>)`, `publish(store: MirroredStore, data: unknown, kind: 'snapshot' | 'change'): void`, `pushNotice(n: PhoneNotification): void`
  - `PHONE_ACCESS_KEY = 'alphonso_phone_access_v1'` (on/off, off until a phone is paired)

- [ ] **Step 1: Write the failing tests**: `phone access is off until a phone is paired`; `a frame from a removed device is refused` (Review Focus 3); `the link reconnects with backoff after the relay closes, and stops when phone access is turned off`; `the computer's private key is read from the keychain and never written to localStorage`; PhonesSection: `shows the QR after sign-in`, `lists phones with last use`, `Remove asks first, then removes`.
- [ ] **Step 2:** Run `npx vitest run src/test/services/phone/ src/test/components/phone/`. Expected: FAIL.
- [ ] **Step 3:** Implement. The section's words: "Phones", "Sign in to pair a phone", "Scan this with the Alphonso app", "Last used", "Remove", "Phone access" (switch).
- [ ] **Step 4:** Run the same command, then `npx vitest run src/test/SettingsView*`. Expected: PASS.
- [ ] **Step 5:** Commit with the CLAUDE.md rows (Phones, the companion pairing row marked replaced) and docs.

### Task 6: What a phone may do: named calls and mirrored stores

**Files:**
- Create: `src/services/phone/phoneCalls.ts`, `src/services/phone/phoneMirror.ts`
- Test: `src/test/services/phone/phoneCalls.test.ts`, `src/test/services/phone/phoneMirror.test.ts`

**Interfaces:**
- Consumes: Task 5's `onPhoneCall`, `publish`.
- Produces:
  - `type PhoneCallName = 'chat.send' | 'request.approveStep' | 'request.rejectStep' | 'request.stop' | 'request.carryOn' | 'request.cancel' | 'plan.run' | 'plan.cancel'`
  - `PHONE_CALLS: Record<PhoneCallName, (args) => Promise<unknown>>` mapping to `answerOrPlan` (with `source: 'phone'`), `approveRequestStep`, `rejectRequestStep`, `stopRequest`, `carryOnRequest`, `cancelRequest`, `runApprovedPlan`, `cancelPlan`. Anything else is refused ("Not available from the phone yet.").
  - `type MirroredStore = 'requests' | 'stepOutputs' | 'chat' | 'computer'` (`computer` = name, model, Zero-Cost Mode, whether paid models are on; no secrets)
  - `startPhoneMirror(): () => void` (a snapshot of each store when a phone connects; changes from `onRequestStatusChange`, step-output saves and chat updates, at most one change per store per 500 ms)

- [ ] **Step 1: Write the failing tests**: `approve twice runs once and the second says Already done.` (Review Focus 1); `a call not in PHONE_CALLS is refused`; `chat.send reaches answerOrPlan with source phone and the repeat id is ignored` (Review Focus 5's computer half); `a spend step approved from the phone still needs the cap` (the cap check runs); `the snapshot has no secret fields` (run through `stripSecretFields`); `changes are batched per 500 ms`.
- [ ] **Step 2:** Run `npx vitest run src/test/services/phone/`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with the CLAUDE.md row.

### Task 7: The seam: the board and Chat read and act through data interfaces

**Files:**
- Create: `src/services/phone/boardData.ts`, `src/services/phone/chatData.ts`, `src/services/phone/remoteData.ts`
- Modify: `src/components/jose/JoseRequestsBoard.tsx` (reads requests and acts through `useBoardData()` instead of importing `listJoseRequests`, `approveRequestStep`, …), `src/components/ChatView.tsx` (its send path and message list through `useChatData()`)
- Test: `src/test/services/phone/remoteData.test.ts`; the existing `JoseRequestsBoard` and `ChatView` tests keep passing unchanged

**Interfaces:**
- Consumes: Task 2's messages, Task 6's call names and stores.
- Produces:
  - `interface BoardData { requests(): JoseRequest[]; request(id: string): JoseRequest | null; stepOutput(commandId: string, stepId: string): StepOutput | null; approveStep(requestId: string, stepId: string): Promise<string>; rejectStep(...): Promise<string>; stop(requestId: string): Promise<string>; carryOn(requestId: string): Promise<string>; cancel(requestId: string): Promise<string>; runPlan(requestId: string): Promise<string>; cancelPlan(requestId: string): Promise<string>; subscribe(listener: () => void): () => void; readOnly: boolean }`
  - `interface ChatData { messages(): ChatMessage[]; send(text: string): Promise<void>; subscribe(listener: () => void): () => void; readOnly: boolean }`
  - `BoardDataProvider` / `useBoardData()`, `ChatDataProvider` / `useChatData()`; `localBoardData`, `localChatData` (the desktop, today's behaviour); `remoteBoardData(link)`, `remoteChatData(link)` (the phone)
  - `remoteData` keeps the mirror; `readOnly` is true while the computer is offline; messages typed offline queue with an id and send once (Review Focus 5)

- [ ] **Step 1: Write the failing tests**: `reconnect replaces the mirror` (Review Focus 2); `queued message sent once`; `offline makes the board read-only and says since when`; `an action while offline is refused with the offline line`.
- [ ] **Step 2:** Run `npx vitest run src/test/services/phone/remoteData.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the interfaces and the local implementations; move the board's and Chat's imports behind them. Buttons that act are disabled when `readOnly`.
- [ ] **Step 4:** Run `npx vitest run src/test/services/phone/ src/test/components/jose/ src/test/ChatView.test.jsx`. Expected: PASS, with the existing board and Chat tests unchanged.
- [ ] **Step 5:** Commit.

### Task 8: The phone app

**Files:**
- Create: `mobile/` (the packaging from Task 1), `src/mobile/MobileApp.tsx`, `src/mobile/screens/{SignIn,Pair,Chat,Requests,More,Offline}.tsx`, `src/mobile/phoneSession.ts`
- Test: `src/test/mobile/*.test.tsx`

**Interfaces:**
- Consumes: Tasks 2, 6, 7.
- Produces: the app: sign in (Apple, Google, email link), scan the QR, then bottom tabs Chat, Requests, More (More lists what comes in later phases as "On your computer for now"). `phoneSession.ts`: `connectPhone(): Promise<void>`, `offlineSince(): number | null`.

- [ ] **Step 1: Write the failing tests**: `a QR from another app is refused with a plain line`; `the Requests tab renders the desktop's board in one column`; `offline shows "Your computer is offline since 14:02." with the last known requests`; `the app asks for Face ID / fingerprint on open when it is on, and the setting can be turned off`.
- [ ] **Step 2:** Run `npx vitest run src/test/mobile/`. Expected: FAIL.
- [ ] **Step 3:** Implement. Phone layout: one column, bottom tabs, the desktop's colours and agent colours.
- [ ] **Step 4:** Run the same command; then build for the iPhone simulator and the Android emulator per Task 1's findings. Expected: PASS; both builds start.
- [ ] **Step 5:** Commit.

### Task 9: Notifications

**Files:**
- Create: `src/services/phone/phoneNotifications.ts`, the notification extensions in `mobile/` per Task 1
- Modify: `src/services/jose/joseTelegram.ts` only to export what's shared (`collectJoseNotifications` stays pure and shared)
- Test: `src/test/services/phone/phoneNotifications.test.ts`

**Interfaces:**
- Consumes: `collectJoseNotifications(requests, sent, settings, nowMs)`, Task 5's `pushNotice`, Task 6's calls.
- Produces: `type PhoneNotification = { key: string; title: string; body: string; requestId: string; stepId?: string; actions: Array<'approve' | 'reject' | 'open'> }`; `startPhoneNotifications(): () => void` (its own sent log, `alphonso_phone_notifications_sent_v1`, same kinds as Telegram, switches in Settings → Phones).

- [ ] **Step 1: Write the failing tests**: `a step with a locked effect gets only Open, never Approve`; `a step without one gets Approve and Reject`; `stale notification action` (Review Focus 4: the request moved on → nothing runs, the app shows its current state); `nothing is sent twice across a restart` (sent log).
- [ ] **Step 2:** Run `npx vitest run src/test/services/phone/phoneNotifications.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement; the extension decrypts with the phone's key and shows title and body.
- [ ] **Step 4:** Run the same command; then on the simulator and emulator, approve one non-locked step from a notification and open a locked one. Expected: PASS; the non-locked step runs once; the locked one opens the app on its approval and asks for Face ID / fingerprint.
- [ ] **Step 5:** Commit.

### Task 10: End to end, docs, test builds

**Files:**
- Create: `e2e-mobile/` (tests driving the phone app's web build against a stand-in relay and the desktop debug build), `docs/PHONE.md` (for users: install, sign in, pair, what works from the phone in phase 1)
- Modify: CLAUDE.md, README.md (a "Phone" line), CHANGELOG, `docs/USER_MANUAL.md`, `ios-build.yml` (the new app replaces the Swift app's job once phase 3 is done; until then both build)

- [ ] **Step 1:** Write the end-to-end checks: pair; send a chat message from the phone and see the answer; approve a waiting step from the phone and see it run on the desktop board; stop a running request; turn the desktop app off and see "offline since". Expected: all pass locally with the stand-in relay.
- [ ] **Step 2:** TestFlight and an Android internal test build; the owner runs the five checks on real phones over mobile data.
- [ ] **Step 3:** Commit; one PR for phase 1.
