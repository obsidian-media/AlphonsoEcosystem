# Jose redesign, phase 5: away from the app — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jose's requests can be followed and approved from Telegram, a request cut off when the app closed can be carried on, and waiting requests don't wait forever.

**Architecture:** A new `jose/joseTelegram.ts` turns saved requests into notifications (pure, with a durable "already sent" log) and handles button presses; `telegramCompanionService.js` sends them from its push watcher and routes button presses and `/approve` through the request's resume path (`approveRequestStep`, `rejectRequestStep`, `runApprovedPlan`, `cancelPlan`, `resumeJoseRequest`). The Rust Telegram commands gain inline buttons (`reply_markup`), button presses (`callback_query`) in polling, and `answerCallbackQuery`. At start, requests left running are marked Interrupted and offered "Carry on"; waiting requests expire after the period set in Settings.

**Tech Stack:** TypeScript/React (Vitest), Rust (Tauri 2, reqwest), Telegram Bot API.

**Spec:** `docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md` (§10 phase 5), plus the owner's decisions below.

## Global Constraints

- Owner decisions (2026-10-23):
  - Telegram may approve any waiting step, spend/publish/delete included. Only the paired owner chat (`getOwnerChatId()`); the message names what the step does (instruction and effects in plain words) and, for a paid step, "about $X.XX".
  - At start, a request left `running` becomes `interrupted`; "Carry on" on the board, in Chat and on Telegram; nothing runs by itself.
  - Telegram sends four kinds, each switchable in Settings, all on by default: a step waits (Approve / Reject buttons); a plan waits (Run / Cancel buttons and the steps); a request finished or failed (one line); a review asked you to decide (the note, no buttons).
  - Waiting requests (`waiting_approval`, `waiting_plan_approval`) expire after `settings.joseWaitingExpiryDays` (default 7; 0 = never) with a note; their waiting packets are rejected.
  - Echo saves a request's decisions once, when it ends `done`.
  - One paid-model id check and one agent display-name map.
- Fixes: Telegram `/approve` must carry the request on; `markRunningRequestsInterrupted()` must run at start.
- Hardcode nothing the user chooses; no secrets in logs or tests; callback data ≤ 64 bytes (Telegram's limit).
- Repo rules: LF in files stored LF; docs in the same commits; doc-count, dnd-map, dnd-coverage, skill-matrix checks; `cargo fmt`, `cargo clippy -- -D warnings`, `verify:no-window-coverage`.

## Review Focus

1. **A button press from a chat that is not the owner's, or a forged/old token.** Expected: ignored with "Unauthorized." / "That button has expired."; nothing approved. Pinned in Task 5.
2. **A button pressed twice, or after the step was approved in the app.** Expected: runs once; the second press answers "Already done." Pinned in Task 5.
3. **The app restarted: notifications already sent.** Expected: not sent again (durable sent log). Pinned in Task 4.
4. **Carry on for a request whose waiting step was approved before the crash.** Expected: steps already done are kept; a step that needs approval asks again rather than running unasked. Pinned in Task 1.
5. **Expiry with 0 days, a blank or a negative value.** Expected: 0 or blank = never; negative = default 7. Pinned in Task 2.

---

### Task 1: Interrupted requests and "Carry on"

**Files:**
- Modify: `src/App.tsx` (boot: call `markRunningRequestsInterrupted()` next to `recoverInterruptedExecutions()`), `src/services/joseExecutionEngineService.ts` (`resumeJoseRequest` accepts `interrupted`), `src/components/jose/JoseRequestsBoard.tsx` ("Carry on" for an interrupted request), `src/components/ChatView.tsx` (a notice above the messages: "N requests were cut off when the app closed." with "Carry on" per request and "Open on the board")
- Test: `src/test/services/jose/joseStepGraphPipeline.test.js`, `src/test/components/jose/JoseRequestsBoard.test.tsx`, `src/test/ChatView.test.jsx`, `src/test/appBootInterrupted.test.js` (reads `App.tsx` source: the call exists in the boot effect)

**Interfaces:**
- Produces: `resumeJoseRequest(requestId, options)` resumes `waiting_approval` or `interrupted` (claims `running` first, as before). `carryOnRequest(requestId)` in the engine = `resumeJoseRequest` for an interrupted request, `{ ok:false, reason }` otherwise.

- [ ] Step 1: failing tests:
  - an interrupted request with steps `a` done and `b` running resumes: `b` runs, `a` does not, the request ends `done`;
  - a step that needs approval asks again after Carry on (Review Focus 4);
  - Carry on on a `done` request does nothing;
  - the board shows "Carry on" for an interrupted request and calls `carryOnRequest`;
  - Chat shows the notice for interrupted requests and its "Carry on" calls `carryOnRequest`.
- [ ] Step 2: run, expect FAIL. Step 3: implement. Step 4: run the Jose suites, ChatView, board. Step 5: commit `feat(jose): carry on a request the app was closed on`.

### Task 2: Waiting requests expire; Echo saves once

**Files:**
- Create: `src/services/jose/joseExpiry.ts`
- Modify: `joseRequestStore.ts` (status `expired`), `JoseRequestsBoard.tsx` (label "Expired"), `App.tsx` (run at start and every hour), `joseExecutionEngineService.ts` (Echo only on `done`), `SettingsView.tsx` (Approvals: "Waiting requests expire after (days)", blank or 0 = never)
- Test: `src/test/services/jose/joseExpiry.test.ts`, `joseStepGraphPipeline.test.js`, `SettingsView.smoke.test.jsx`

**Interfaces:**
- Produces: `getWaitingExpiryDays(): number` (default 7; 0 = never; negative → 7), `expireWaitingRequests(nowMs = Date.now()): number` (sets `expired`, note "Expired after N days without your approval.", rejects the request's `pending_approval` packets).

- [ ] Step 1: failing tests: a request waiting 8 days with the default expires and its packet is rejected; 6 days does not; 0 never; negative → 7 (Review Focus 5); a waiting plan expires too; Echo is not called for `waiting_approval`, once for `done`; the Settings field saves `joseWaitingExpiryDays`.
- [ ] Step 2–4 as usual. Step 5: commit `feat(jose): waiting requests expire; Echo saves once`.

### Task 3: Telegram buttons in the backend

**Files:**
- Modify: `src-tauri/src/telegram.rs`, `src-tauri/src/lib.rs` (`ConnectorInboundMessage` gains `callback_id: Option<String>`, `callback_data: Option<String>`; register `connector_answer_telegram_callback`)
- Test: Rust unit tests in `telegram.rs`

**Interfaces:**
- Produces:
  - `connector_send_telegram(token, chatId, text, buttons?: Vec<Vec<{ text, data }>>)` → sends `reply_markup.inline_keyboard` when given;
  - polling asks for `["message","callback_query"]`; `parse_telegram_update(row: &Value, now) -> Option<ConnectorInboundMessage>` (pure) maps a callback to `chat_id` = the message's chat, `from_id`, `text` = "", `callback_id`, `callback_data`;
  - `connector_answer_telegram_callback(token, callbackId, text)` (`answerCallbackQuery`).
- [ ] Step 1: failing Rust tests: a message row parses as before; a callback row parses with its id/data/chat; a button with data over 64 bytes is refused before sending; the send payload has `inline_keyboard` only when buttons are given.
- [ ] Step 2–4 (`cargo test telegram`, fmt, clippy). Step 5: commit `feat(telegram): buttons and button presses`.

### Task 4: Jose's notifications

**Files:**
- Create: `src/services/jose/joseTelegram.ts`
- Modify: `SettingsView.tsx` (Approvals: "Jose on Telegram" with four switches, saved as `settings.joseTelegram`)
- Test: `src/test/services/jose/joseTelegram.test.ts`, `SettingsView.smoke.test.jsx`

**Interfaces:**
- Produces:
  - `JoseNotification = { key: string; kind: 'step_waiting'|'plan_waiting'|'finished'|'review_decision'|'interrupted'; text: string; buttons?: { text: string; data: string }[][] }`;
  - `collectJoseNotifications(requests: JoseRequest[], sent: Set<string>, settings): JoseNotification[]` (pure; key = `<requestId>:<kind>:<stepId|status>`);
  - `getJoseTelegramSettings()` (`{ stepWaiting, planWaiting, finished, reviewDecision }`, all true by default);
  - `markSent(key)`, `wasSent(key)` (`alphonso_jose_telegram_sent_v1`, 500 kept);
  - `buttonToken(action, requestId, stepId?) => string` (`j:<8 random chars>`, saved in `alphonso_jose_telegram_buttons_v1`, 200 kept, 7 days), `readButtonToken(data) => { action, requestId, stepId } | null`.
  - Texts: step waiting = "<Agent> wants to <what it does: effect labels>: <instruction, 300 chars>. For: <request text>" + " (about $X.XX)" for a paid step, buttons Approve / Reject; plan waiting = the steps as "1. Agent: instruction", buttons Run / Cancel; finished = "Done: <request text>" or "Failed: <request text> — <first error>"; review decision = the "still found problems" note; interrupted = "Cut off when the app closed: <request text>", button Carry on.
- [ ] Step 1: failing tests: each kind's text and buttons; a sent key is not sent again (Review Focus 3); a switched-off kind is not collected; a paid step shows the cost; tokens fit 64 bytes and an unknown/expired token reads as null; the Settings switches save.
- [ ] Step 2–4. Step 5: commit `feat(jose): what Jose tells you on Telegram`.

### Task 5: Telegram approvals carry the request on

**Files:**
- Modify: `src/services/telegramCompanionService.js` (push watcher sends `collectJoseNotifications` with buttons and marks them sent, and skips the old "Approval needed" for packets of a saved request; inbound handles callback updates; `/approve <id>` and `/reject <id>` go through the request), `src/services/joseExecutionEngineService.ts` (`rejectRequestStep(requestId, stepId)`), `JoseRequestsBoard.tsx` ("Reject" beside "Approve and carry on")
- Test: `src/test/connectors/telegramCompanionService.test.js`, `joseStepGraphPipeline.test.js`, `JoseRequestsBoard.test.tsx`

**Interfaces:**
- Consumes: `readButtonToken`, `approveRequestStep`, `runApprovedPlan`, `cancelPlan`, `carryOnRequest`, `connector_answer_telegram_callback`.
- Produces: `rejectRequestStep(requestId, stepId)`: rejects the packet, step `rejected`, request `cancelled` with "You rejected <Agent>'s step." (owner may overrule; recorded as a ruling). `handleJoseButton(token, update) => Promise<string>` (the answer text).
- [ ] Step 1: failing tests: an Approve press from the owner runs the step and the steps after it; from another chat → "Unauthorized." and nothing runs (Review Focus 1); an unknown token → "That button has expired."; pressing twice runs once and answers "Already done." (Review Focus 2); Reject cancels the request; Run / Cancel on a waiting plan; Carry on; `/approve` on a request's packet resumes the request; a request's packet gets no second, old-style approval message.
- [ ] Step 2–4. Step 5: commit `feat(telegram): approve, reject, run and carry on from Telegram`.

### Task 6: Tidy

**Files:**
- Create: `src/services/jose/agentNames.ts` (`AGENT_NAMES`, `agentName(id)`)
- Modify: `JosePlanMap.tsx`, `JosePlanEditor.tsx`, `joseAdapt.ts`, `submitToJose.ts`, `joseTelegram.ts` (use it); `stepGraph.ts` exports `isPaidModelId(model?: string): boolean`, used by `joseAdapt.ts`, `lib/ollama.ts`, `checkPlan`
- Test: existing suites; `src/test/services/jose/agentNames.test.ts` (all 9 agents)
- [ ] Steps: test, run, replace, run Jose/board/map suites, commit `refactor(jose): one agent-name map, one paid-model check`.

### Task 7: Real app, docs, PR

- Create `e2e-desktop/specs/jose-away.e2e.mjs`: a request saved as `running` before a restart is shown Interrupted with Carry on, and Carry on finishes it; a waiting request older than the set days expires at start. (Telegram itself is unit-tested; a live check with the owner's bot is offered, not automated.)
- Docs: CLAUDE.md rows (`joseTelegram`, `joseExpiry`, `agentNames`, the Telegram backend commands, resume/carry on, reject), CHANGELOG, DEFERRED_WORK (close phase 5 items, Echo twice, duplicates; open: live Telegram check, WhatsApp and the phone in phase 6), QA coverage, counts, desktop E2E counts.
- Run `npm test`, build, run `jose-away`, `jose-loops`, `jose-board`, `jose-approval`, `chat`, `smoke`; self-review; PR; merge when green.
