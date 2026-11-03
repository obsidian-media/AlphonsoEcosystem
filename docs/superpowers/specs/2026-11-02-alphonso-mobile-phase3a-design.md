# Alphonso phone app, phase 3 part A: Memory, Projects and Boardroom

**Status:** approved by the owner on 2026-11-02.
Builds on `2026-10-31-alphonso-mobile-design.md` (phase 3: "everything else") and
`2026-11-01-alphonso-mobile-phase2-design.md`.

## Why

Phase 3 brings the rest of Alphonso to the phone so the old Swift companion can retire. The owner
chose to ship it daily-use first (2026-11-02):

- **Part A (this document):** Memory (what Echo remembers), Projects, Boardroom.
- **Part B:** Teams, Skills, Settings and Connectors. Settings on the phone: see and switch, no
  keys (owner); keys and passwords are typed only on the computer.
- **Part C:** retire the Swift app and the old PIN pairing (archived with the owner's OK, as
  `REPO_RULES.md` requires), and prepare the App Store and Google Play listings.

## Goals (owner, 2026-11-02)

### Memory (Echo)

1. **See and search** what Echo remembers: each decision, preference, instruction or rejection
   with its why, its topics and when it was decided. Search finds anything Echo has, including
   matching by meaning when that is on.
2. **Tidy-up proposals:** Echo's clean-up suggestions (the Sunday schedule, or asked for) show
   with Apply and Dismiss, each once, as on the board.
3. **Add by voice:** "Remember that …" said with the phone keyboard's microphone in the phone's
   Chat goes to Echo the way Chat does today (owner: keyboard microphone; nothing new to build or
   permit).

### Projects

4. **Follow and approve:** every saved project with its latest run: plan, steps, what waits for
   you (Approve / Reject), and results (locked while a step waits, as on the computer); "Open on
   the board" opens the request on the phone's Requests board.
5. **Start a run** of a saved project.
6. **Create a project:** the same intake as the computer's Projects page, as a phone form.

### Boardroom

7. **Read and reply:** the threads, newest first; post a message with @mentions; the mentioned
   agents reply on the computer, as on the desktop.
8. **Thread actions:** Conclude (Maria), Distribute (Marcus), Creative brief (Miya). A send still
   waits for approval like any send.
9. **Start a new thread.**
10. **Escalations:** "Needs your decision" notifies the phone and can be acknowledged there.

## Non-goals (part A)

- Editing or forgetting a decision on the phone (owner didn't choose it); the computer keeps it.
- Deleting projects or threads on the phone.
- A notification for every Boardroom reply (owner: escalations only).
- Teams, Skills, Settings, Connectors (part B); store release (part C).
- Agents working on the phone itself (phase 4).

## Anti-goals (owner)

- **Stale data that looks current.** Every part-A screen shows phase 1's offline line ("Your
  computer is offline since 14:02.") when the computer isn't reachable, turns its buttons off,
  and never shows something older as if it were new. A search answered while offline says it
  can't search.
- **Cramped desktop screens.** Every screen is laid out for the phone (one column, thumb-sized
  buttons), reusing desktop components only where they already fit a phone.

## Decisions

### Owner's

- Boardroom notifications: escalations only; replies appear when the thread is opened.
- Boardroom history: the last 30 messages of each thread are kept on the phone; "Show earlier"
  asks the computer for older ones.
- A message flagged high-risk stays masked on the phone; revealing it needs the tap and Face ID or
  the fingerprint (the same check as approving a spend).
- Voice: the phone keyboard's microphone, in Chat.

### My calls (the owner can change any)

- **Memory travels small.** The phone keeps the newest 50 active decisions and the open clean-up
  proposals. Search is a call to the computer (`searchDecisions()`, with meaning search when
  ready), so the phone never holds the whole store (up to 5,000 decisions).
- **Projects travel whole but light:** the saved projects (at most 50, already the store's limit)
  with their latest run's request id; steps, approvals and results come from the Requests mirror
  phase 1 already sends.
- **One way to reply in Boardroom.** Today the agents' reply logic (mentions, chaining up to
  `MAX_CHAIN_DEPTH`, the fan-out budget, low-confidence escalation, Stop, Retry) lives inside
  `BoardroomChatView.tsx`'s send handler. It moves into a service both the desktop screen and the
  phone call use, so a phone message gets exactly the same replies and limits. The desktop
  behaves as before; its tests must still pass unchanged.
- **Everything goes through the computer's own functions**, as in phases 1 and 2:
  `listDecisions` / `searchDecisions`, `applyCleanupStep` / `dismissCleanupStep` (Echo);
  `listProjects`, `saveProject`, `startProject`, `approveRequestStep` / `rejectRequestStep`
  (Projects); `listThreads`, `listThreadMessages`, `createThread`, `acknowledgeThreadMessage`,
  `confirmThreadMessage`, `concludeOnJose`, `distributeOnJose`, `creativeBriefOnJose`, and the new
  reply service (Boardroom). The phone gets no function the computer doesn't have.
- **Changing the same thing on both** keeps phase 2's rule: a change carries what it was based on
  (a clean-up set's id, a project's `updatedAtMs`, a thread's last message id) and is refused with
  the latest if the computer changed it meanwhile.
- **The More tab** lists Memory, Projects and Boardroom (part B adds Teams, Skills and Settings
  there).

## Constraints

- Phase 1 and 2 rules hold: sealed messages through the relay, the computer decides, keys never
  cross the relay, plain words on screen, no hardcoded names, addresses or model lists, the
  relay's 4 MB message limit and per-device daily limit.
- Keys stay hidden: decisions and Boardroom messages reach the phone after `redactText()`, as step
  outputs do today.
- iOS 16.4 / Android 8.0 minimums.

## Left to the builder

- Which mirrored stores carry part A (new `memory`, `projects`, `boardroom` stores, or calls) and
  how their changes are batched, within "the phone keeps 50 decisions and 30 messages a thread".
- The screens' layout within "phone-shaped", reusing desktop pieces where they fit.
- The escalation notification's text, through phase 1's notification path (each once).

## Checks

- Unit tests per new phone call: refused when stale, refused while the phone isn't paired,
  approving twice runs once, a masked message isn't sent before the reveal.
- The desktop Boardroom's tests pass unchanged after its reply logic moves to the service.
- An end-to-end test over the real relay, as in phases 1 and 2: a Boardroom message from the phone
  gets an agent's reply; a search returns a decision; a stale clean-up Apply is refused.
- The owner checks on real phones: search what was decided; apply a clean-up; start a project and
  approve its waiting step; post in a thread with an @mention and get the reply; acknowledge an
  escalation; reveal a masked message with Face ID.
