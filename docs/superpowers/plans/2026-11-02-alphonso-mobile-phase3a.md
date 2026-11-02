# Phone app phase 3 part A (Memory, Projects, Boardroom) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A paired phone can search Echo's memory and apply his clean-ups, follow, start and create Projects, and read, write and act in Boardroom, all through the computer's own functions.

**Architecture:** Three new mirrored stores (`memory`, `projects`, `boardroom`) join phase 1/2's mirror; new phone calls in one file map each action to the function the desktop screen uses; Boardroom's reply loop moves out of `BoardroomChatView.tsx` into a service both use. The phone app gets three screens under More.

**Tech Stack:** TypeScript, React, Vitest + Testing Library, Capacitor phone app (`mobile/`, shares `src/mobile`).

**Spec:** `docs/superpowers/specs/2026-11-02-alphonso-mobile-phase3a-design.md`

## Global Constraints

- Phases 1–2 rules: sealed messages through the relay, the computer decides, keys never cross the relay, plain words on screen, no hardcoded names, addresses or model lists; 4 MB message limit.
- Everything a store sends goes through `clean()` in `phoneMirror.ts` (secret fields stripped, `redactText()`).
- The phone keeps the newest **50** active decisions and the last **30** messages of each thread.
- A high-risk message (`approvalRequired && !confirmed`) never leaves the computer before the reveal; revealing needs `lock.confirm(…, { strict: true })` on the phone.
- Boardroom notifications: escalations only, each once.
- Every part-A screen shows `offlineLine()` and disables its buttons while offline (`readOnly`).
- Desktop Boardroom tests (`src/test/boardroomChatView.test.jsx`, `src/test/BoardroomChatView*.test.*`) pass unchanged.
- Docs in the same commit as the code: CLAUDE.md rows, `docs/CHANGELOG.md`, `docs/PHONE.md`, `npm run generate:dnd-map`, `npm run verify:dnd-coverage`, `node scripts/verify-doc-counts.mjs`.

## Review Focus

1. A Boardroom message sent twice (link dropped before the answer) gets one round of replies → test in Task 3 (`boardroom.send` with the same `messageId` twice).
2. A message to an agent set to Hermes from the phone can't show the desktop's approval window → refused with a line saying to approve on the computer, not silently "Approval denied" → test in Task 1.
3. A clean-up applied on the computer, then Apply on the phone → "Already done.", nothing applied twice → test in Task 3.
4. A search while offline → the offline line, no stale result shown as a search result → test in Task 5.
5. A masked message's text in any mirror snapshot or `boardroom.earlier` page → never present until revealed → test in Task 2 and Task 3.

---

### Task 1: One Boardroom reply loop for desktop and phone

**Files:**
- Create: `src/services/boardroomReplies.ts`
- Modify: `src/components/BoardroomChatView.tsx` (`handleSend`, `handOffToJose`)
- Test: `src/test/services/boardroomReplies.test.ts`

**Interfaces:**
- Produces:
  - `runBoardroomReplies(input: { threadId: string; text: string; approve: (agentId: string) => Promise<boolean>; isStopped?: () => boolean; signal?: AbortSignal; onChange?: () => void; onResponder?: (agentId: string | null) => void }): Promise<void>` — posts the user's message, hands work to Jose (`workRequestIn` → the old `handOffToJose` body, now `boardroomWorkOnJose(threadId, work, onChange)` in the same file), else runs the reply loop exactly as `handleSend` did (mentions else `alphonso`, `MAX_CHAIN_DEPTH`, fan-out budget, low-confidence escalation, chained mentions, stop line).
  - `HERMES_ON_COMPUTER = 'Replies through Hermes need your approval on the computer.'` — the failure text when `approve()` returns false for a Hermes agent and the caller is the phone.
  - `phoneApprove(agentId: string): Promise<boolean>` — true unless the agent's provider is Hermes with Approval Mode on.

- [ ] **Step 1: Write failing tests** (mock `generateAgentResponse`, `workOnJose`; real thread store on localStorage):
  - `it('posts the message and the mentioned agents reply in order')`: text `'@maria @nova thoughts?'` → messages speakers `['user','maria','nova']`.
  - `it('with no mention, Alphonso replies')`.
  - `it('stops after MAX_CHAIN_DEPTH chained replies with an escalation')`: each reply mentions the next agent → last message `kind === 'escalation'`.
  - `it('work asked for goes to Jose, not a chat reply')`: `'research the bakery market'` → `workOnJose` called once, no `generateAgentResponse`.
  - `it("a Hermes agent from the phone fails with HERMES_ON_COMPUTER")`: `approve` resolves false → failure message content contains `HERMES_ON_COMPUTER`.
- [ ] **Step 2:** Run `npx vitest run --pool=forks --maxWorkers=1 src/test/services/boardroomReplies.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `boardroomReplies.ts` by moving the loop; `BoardroomChatView.handleSend` calls `runBoardroomReplies` with `approve: (id) => resolveHermesApproval(id, requestApproval)`, its stop ref, abort signal and `onChange: () => setMessages(listThreadMessages(threadId))`.
- [ ] **Step 4:** Run the new test and every Boardroom component test → PASS, existing ones unchanged.
- [ ] **Step 5:** Commit `refactor(boardroom): one reply loop the phone can use`.

### Task 2: Mirror memory, projects and Boardroom to the phone

**Files:**
- Create: `src/services/phone/phase3Mirror.ts`
- Modify: `src/services/phone/phoneProtocol.ts` (`MirroredStore` adds `'memory' | 'projects' | 'boardroom'`), `src/services/phone/phoneMirror.ts` (`storeData`, `mirrorSnapshots`, a 5 s poll like content for the three)
- Test: `src/test/services/phone/phase3Mirror.test.ts`

**Interfaces:**
- Produces:
  - `PHONE_DECISIONS = 50`, `PHONE_THREAD_MESSAGES = 30`, `MASKED_LINE = 'Hidden: reveal it on the phone with Face ID or your fingerprint.'`
  - `memoryMirrorData(): { decisions: Decision[]; cleanup: { setId: string; requestId: string; stepId: string; proposals: CleanupSet['proposals'] } | null }` (newest 50 active; `openCleanup()` with its waiting step)
  - `projectsMirrorData(): Array<SavedProject & { latestRequestId: string | null }>`
  - `boardroomMirrorData(): { threads: BoardroomThread[]; messages: Record<string, PhoneThreadMessage[]> }` where `PhoneThreadMessage = BoardroomThreadMessage & { masked?: true }`; a message with `approvalRequired && !confirmed` has `content: MASKED_LINE`, `masked: true`.

- [ ] **Step 1: Failing tests:** 60 saved decisions → 50 newest; an open clean-up comes with its `requestId`/`stepId`; a project's `latestRequestId` is its newest run; 40 messages in a thread → the last 30; a masked message's original text appears nowhere in `JSON.stringify(mirrorSnapshots())`; a key in a decision's text is hidden (`redactText`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; `mirrorSnapshots()` includes the three stores; the poll publishes a store only when its JSON changed.
- [ ] **Step 4:** Run the new test and `src/test/services/phone` → PASS.
- [ ] **Step 5:** Commit `feat(phone): mirror memory, projects and Boardroom`.

### Task 3: The phone's part-A calls

**Files:**
- Create: `src/services/phone/phase3Calls.ts`
- Modify: `src/services/phone/phoneProtocol.ts` (`PhoneCallName`), `src/services/phone/phoneCalls.ts` (spread `PHASE3_CALLS`)
- Test: `src/test/services/phone/phase3Calls.test.ts`

**Interfaces:**
- Consumes: `runBoardroomReplies`, `phoneApprove` (Task 1); `MASKED_LINE`, `PHONE_THREAD_MESSAGES` (Task 2).
- Produces `PHASE3_CALLS: Record<PhoneCallName, Call>` with:
  - `'memory.search'` `{ query }` → `Decision[]` (≤20, `searchDecisions`, redacted)
  - `'memory.applyCleanup'` / `'memory.dismissCleanup'` `{ requestId, stepId, setId }` → `{ ok, summary }`; refused with `STALE = "This changed on your computer; here's the latest."` when `setId` isn't the open set; `ALREADY_DONE` when already applied
  - `'project.create'` `{ intake: ProjectIntake }` → `SavedProject` (`saveProject` without id; `PROJECT_NEEDS_TEXT` when name or description is empty)
  - `'project.start'` `{ id }` → `startProject(id)`'s result
  - `'boardroom.createThread'` `{ topic }` → `BoardroomThread` (participants: every agent, as the desktop does)
  - `'boardroom.send'` `{ threadId, text, messageId }` → `{ messageId }` at once; replies run in the background through `runBoardroomReplies(… approve: phoneApprove)`; the same `messageId` again starts nothing
  - `'boardroom.earlier'` `{ threadId, beforeSeq }` → up to 30 older messages, masked as in Task 2
  - `'boardroom.acknowledge'` `{ messageId }` → `acknowledgeThreadMessage`
  - `'boardroom.reveal'` `{ messageId }` → the real content, `confirmThreadMessage` called (the phone asks Face ID before sending this)
  - `'boardroom.conclude'` / `'boardroom.distribute'` `{ threadId, mode, channel? }` / `'boardroom.creativeBrief'` `{ threadId }` → the same `concludeOnJose` / `distributeOnJose` / `creativeBriefOnJose` arguments the desktop's buttons pass, posting the same thread note

- [ ] **Step 1: Failing tests:** one per call's happy path, plus: stale `setId` → `STALE`; applying twice → second `ALREADY_DONE`; `boardroom.send` twice with one `messageId` → `runBoardroomReplies` once; `boardroom.earlier` never returns a masked message's text; `project.create` with an empty name → `PROJECT_NEEDS_TEXT`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the new test and `src/test/services/phone` → PASS.
- [ ] **Step 5:** Commit `feat(phone): memory, projects and Boardroom calls`.

### Task 4: Escalations notify the phone

**Files:**
- Modify: `src/services/phone/phoneNotifications.ts`
- Test: `src/test/services/phone/phoneNotifications.test.ts`

**Interfaces:**
- Produces `boardroomEscalations(messages: BoardroomThreadMessage[], threads: BoardroomThread[], sent: Set<string>): PhoneNotification[]` — one per unacknowledged `kind === 'escalation'` message not in `sent` (key `boardroom:<messageId>`), title `Boardroom: <topic>`, body the message (redacted), `requestId: 'boardroom:<threadId>'`, `actions: ['open']`. `startPhoneNotifications` sends them with the other notices, recording the key.

- [ ] **Step 1: Failing tests:** an escalation → one notice with that key; sent again → none; acknowledged → none; an ordinary reply → none.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5:** Commit `feat(phone): Boardroom escalations notify the phone`.

### Task 5: The phone's data for part A

**Files:**
- Modify: `src/services/phone/remoteData.ts`
- Test: `src/test/services/phone/remoteData.test.ts`

**Interfaces:**
- Produces on `createRemoteData(…)`'s result: `more: MoreData` with
  `memory(): MemoryMirror`, `projects(): ProjectMirror[]`, `boardroom(): BoardroomMirror`,
  `call(name, args)` (same shape and offline answer as `StudioData.call`), `subscribe`, `readOnly`, `readOnlyReason`.

- [ ] **Step 1: Failing tests:** a `memory` snapshot shows in `more.memory()`; offline, `more.call('memory.search', …)` → `{ ok: false, reason: offlineLine(...) }` without calling the transport.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit `feat(phone): part A data on the phone`.

### Task 6: The phone screens

**Files:**
- Create: `src/mobile/screens/Memory.tsx`, `src/mobile/screens/Projects.tsx`, `src/mobile/screens/Boardroom.tsx`
- Modify: `src/mobile/screens/More.tsx` (Memory, Projects, Boardroom become entries; `ON_COMPUTER_FOR_NOW` keeps Teams, Skills, Settings and connectors), `src/mobile/MobileApp.tsx` (open a screen from More; a notice whose `requestId` starts `boardroom:` opens that thread)
- Test: `src/test/mobile/phase3Screens.test.tsx`

**Interfaces:**
- Consumes `MoreData` (Task 5), `PhoneLock` (`lock.confirm(reason, { strict: true })`), the Requests board from phase 1 for a project's run.

- [ ] **Step 1: Failing tests:**
  - Memory: lists decisions; typing a query and Search shows the call's results; a clean-up shows Apply / Dismiss calling `memory.applyCleanup` with its `setId`.
  - Projects: lists projects; Start calls `project.start`; New project's form calls `project.create` with the intake; a project's run opens on the Requests board.
  - Boardroom: threads newest first; a thread shows its messages and a composer that calls `boardroom.send` with a fresh `messageId`; "Show earlier" calls `boardroom.earlier`; Conclude / Distribute / Creative brief call their calls; an escalation shows Acknowledge; a masked message shows `MASKED_LINE` and Reveal calls `lock.confirm` with `strict: true` before `boardroom.reveal` (refused lock → no call).
  - Offline: every screen shows `offlineLine` and its buttons are disabled.
- [ ] **Step 2–4:** FAIL → implement (one column, thumb-sized buttons, the desktop's colour tokens) → PASS; also `cd mobile && npm run typecheck`.
- [ ] **Step 5:** Commit `feat(phone): Memory, Projects and Boardroom screens`, with the docs: CLAUDE.md rows ("Phone app" rows and Boardroom's), CHANGELOG under Phone app (in progress), `docs/PHONE.md` (what part A does), generated map, doc counts.

### Task 7: Check over the real relay

- [ ] Extend the phase 1/2 relay check (the by-hand script used for those phases) with: a Boardroom message from a test phone gets an agent's reply; `memory.search` returns a saved decision; a stale `memory.applyCleanup` is refused. Run it; record the result in `docs/PHONE.md` and the CHANGELOG.
- [ ] Hand the owner's real-phone checks from the spec's Checks list; a phone test build only with the owner's OK.
