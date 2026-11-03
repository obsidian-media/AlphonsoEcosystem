# Phone phase 4 build: answering on the phone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the computer is offline, a message typed in the phone's Chat can be answered on the phone. The user picks Apple's on-device model or OpenRouter's free models. Anything that needs the computer waits for it, and every phone answer is copied to the computer once it's back.

**Architecture:**
- **Shared logic.** Jose's answer-or-plan decision, Alphonso's answer prompt and Echo's decision ranking stay in the shared TypeScript, with the model passed in. The phone supplies its own "ask a model" function.
- **The phone's data layer** (`remoteData.ts`) keeps phone answers locally and sends them to the computer with one new idempotent call, `chat.phoneAnswered`.
- **Native code.** One native plugin method reaches Apple's model. OpenRouter is called through Capacitor's native HTTP.

**Tech Stack:** TypeScript, React, Vitest, Capacitor 8, Swift (FoundationModels, iOS 26, guarded), Java stubs.

**Spec:** `docs/superpowers/specs/2026-11-02-alphonso-mobile-phase4-design.md`, with the "Build decisions" section this plan adds in Task 1. Results: `docs/phone/phase4-test-round-report.md`. Proven spike code: branch `spike/phone-phase4`, commits `22492a4` (Swift) and `793ac81` (cloud calls).

## Global Constraints

- Nothing happens until the user picks: no automatic phone answering.
- Every phone answer shows where it came from: "Answered on this phone" or "Answered with OpenRouter (free)". This applies in Chat on the phone and in the computer's copy.
- Only free models: OpenRouter is called with `OPENROUTER_CHOOSE_FREE` from `openRouterConnector.ts`. No model id is written in the code, and no paid model is used.
- The OpenRouter key is typed on the phone, kept in its keychain (`secrets`) under `phone_openrouter_key`, and never sent through the relay, a mirror, a result or a log.
- Only data the phone already has: Echo's mirrored 50 decisions (`mirror.memory.decisions`) and the last 6 chat messages.
- No second copy of an agent's prompts or rules: import `ALPHONSO_ANSWER_PROMPT`, the Jose decision prompt and `ruleRoute` from their shared files.
- The app's iOS minimum stays 16.4. Apple's model is checked at run time.
- The phone answers on its own only with Jose, Alphonso and Echo. Anything else goes to the computer.
- Plain words on screen. LF line endings. Never `git add -A`. Docs go in the same commit as the code they describe.
- A question on Apple's model has a 120000 ms limit, then shows as timed out (test round).

## Review Focus

1. **The computer comes back while a phone answer is running:** the message must not also go to the computer as an ordinary message. Pinned in Task 5 (`answerHere removes the message from the outbox before asking`).
2. **OpenRouter refuses (daily free limit 429, wrong key 401, no network):** a plain reason shows, the message stays waiting, and nothing is retried on its own. Pinned in Task 3.
3. **Apple Intelligence switched off after the app started:** the choice shows Apple's reason instead of failing silently. Pinned in Task 6 (`status is read when Chat shows the choices`).
4. **A phone answer is copied twice** (link drops before the acknowledgement): the computer keeps it once. Pinned in Task 4.
5. **The key leaks:** it must not appear in `chat.phoneAnswered`'s arguments, the phone's saved answers or an error. Pinned in Task 3 and Task 5.

---

### Task 1: Jose decides with any model; the phone's hand-over check

**Files:**
- Modify: `src/services/jose/joseDecision.ts`.
- Create: `src/services/phone/phoneRoute.ts`.
- Test: `src/test/services/jose/joseDecisionPrompt.test.ts` and `src/test/services/phone/phoneRoute.test.ts`.
- Modify: the spec. Add a "Build decisions (owner, 2026-11-02, after the test round)" section:
  - A plan goes to the computer whole.
  - Phone answers are copied to the computer's phone conversation.
  - "Remember …" waits for the computer's Echo.
  - Apple's model comes first, with OpenRouter free as the backup.
  - Waking is not built.

**Interfaces:**
- Produces:
  - `joseDecisionPrompt(text: string, history?: { role: string; content: string }[]): string`, which `decideJoseRoute` uses unchanged.
  - `readJoseDecision(raw: string): { route: 'direct' | 'plan'; reason: string } | null` (the existing `readDecision`, exported).
  - `phoneRoute(text, ask): Promise<PhoneRoute>`, where `ask: (system: string, prompt: string) => Promise<string>` and `PhoneRoute = { route: 'answer' | 'computer'; reason: string }`.
  - `NEEDS_COMPUTER = 'This needs your computer. It will start when your computer is back.'`

- [ ] **Step 1: Write the failing tests**
  - `joseDecisionPrompt('hi')` contains `'Message: hi'` and `'Answer with JSON only'`.
  - `readJoseDecision('```json\n{"route":"plan","reason":"x"}\n```')` returns `{ route: 'plan', reason: 'x' }`.
  - `phoneRoute`: the model is not asked, and the answer is `computer`, for each of:
    - `'post our new opening hours on Slack'`
    - `'send Sam the meeting notes from today'`
    - `'publish the post'`
    - `'upload the video'`
    - `'Change the price of the blue mug in my shop project to 18 dollars.'` (`parseJoseCommand(...).intents.localExecution`)
    - `'Remember that the launch is Friday'` (`ruleRoute` plan)
  - `'How many minutes is 2.5 hours?'` → `answer`, and the model is not asked.
  - `'thanks, that was really helpful'` with `ask` returning a fenced `{"route":"direct"}` → `answer`.
  - The same message with `ask` returning `{"route":"plan"}` → `computer`.
  - `ask` throwing, or returning garbage → `computer` with reason `"Jose couldn't decide on this phone."`.
- [ ] **Step 2: Run** `npx vitest run src/test/services/jose/joseDecisionPrompt.test.ts src/test/services/phone/phoneRoute.test.ts`. Expected: FAIL, because the exports don't exist yet.
- [ ] **Step 3: Implement.**
  - Move the prompt-building in `decideJoseRoute` into `joseDecisionPrompt`, and export `readDecision` as `readJoseDecision`.
  - `phoneRoute` checks, in order:
    1. `ruleRoute(text)`. Plan → computer, direct → answer.
    2. `SEND_WORDS = /\b(send|post|publish|upload|tweet)\b/i`, or `parseJoseCommand(text).intents.publishing || .localExecution` → computer.
    3. Otherwise `ask('', joseDecisionPrompt(text))` → `readJoseDecision`. Plan → computer, null or a throw → computer.

  `ruleRoute`'s picture check stays shared, and Miya's work goes to the computer.
- [ ] **Step 4: Run** the same command plus `npx vitest run src/test/services/jose`. Expected: PASS, with Jose's existing tests unchanged.
- [ ] **Step 5: Commit** `feat(phone): Jose decides on the phone; sends and project work go to the computer` (the code, the tests and the spec section).

### Task 2: Echo ranks a given list of decisions

**Files:**
- Modify: `src/services/echo/recall.ts`.
- Test: `src/test/services/echo/rankDecisions.test.ts`.

**Interfaces:**
- Produces:
  - `rankDecisions(pool: Decision[], query: string, limit: number): Decision[]`: the word ranking `searchDecisions` already uses, now pure, and `searchDecisions` calls it.
  - `decisionsBlockFrom(pool: Decision[], text: string): string`: active preferences that apply to `alphonso`/`assistant_answer`, then `rankDecisions(..., ECHO_LIMITS.perStep)` matches. Returns `"Decisions you saved:\n…"` through `decisionsText`, or `''`.

- [ ] **Step 1: Write the failing tests.** These use the test round's spring-launch decisions (see `spike/phone-phase4` `phase4Questions.ts`):
  - `rankDecisions(pool, 'When is the spring launch?', 5)[0].id === 'd1'`.
  - A replaced decision is never returned.
  - `decisionsBlockFrom(pool, 'When is the spring launch?')` starts with `'Decisions you saved:'` and contains `'14 March'`.
  - `decisionsBlockFrom([], 'x') === ''`.
- [ ] **Step 2: Run** `npx vitest run src/test/services/echo/rankDecisions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both functions. `searchDecisions` keeps its meaning and ChromaDB additions after `rankDecisions`.
- [ ] **Step 4: Run** the new test plus `npx vitest run src/test/services/echo`. Expected: PASS.
- [ ] **Step 5: Commit** `refactor(echo): rank a given list of decisions, for the phone`.

### Task 3: The phone's answer engines

**Files:**
- Create: `src/services/phone/phoneAnswer.ts` and `src/services/phone/phoneOpenRouter.ts`.
- Test: `src/test/services/phone/phoneAnswer.test.ts` and `src/test/services/phone/phoneOpenRouter.test.ts`.

**Interfaces:**
- Consumes:
  - `phoneRoute`, `NEEDS_COMPUTER` (Task 1).
  - `decisionsBlockFrom` (Task 2).
  - `ALPHONSO_ANSWER_PROMPT`, `OPENROUTER_CHOOSE_FREE`.
- Produces:
  - `type PhoneEngine = 'phone' | 'openrouter'`.
  - `ENGINE_LABEL: Record<PhoneEngine, string> = { phone: 'Answered on this phone', openrouter: 'Answered with OpenRouter (free)' }`.
  - `type Ask = (system: string, prompt: string) => Promise<string>`.
  - `answerOnPhone(input: { text: string; history: { role: 'user' | 'assistant'; text: string }[]; decisions: Decision[]; ask: Ask }): Promise<{ kind: 'answer'; text: string } | { kind: 'computer'; reason: string } | { kind: 'failed'; reason: string }>`.
  - `type PhoneHttp = (req: { url: string; method: 'POST'; headers: Record<string, string>; body: unknown }) => Promise<{ status: number; data: unknown }>`.
  - `openRouterAsk(http: PhoneHttp, key: string): Ask`. It throws an `Error` with a plain message and never the key.
  - `PHONE_OPENROUTER_KEY = 'phone_openrouter_key'`.

- [ ] **Step 1: Write the failing tests.**
  - `answerOnPhone` with `ask` capturing its args:
    - For `'When is the spring launch?'` with the d1 pool, `system` is `ALPHONSO_ANSWER_PROMPT` and the prompt contains `'Decisions you saved:'`, the last 6 history lines, and the question.
    - The result is `{ kind: 'answer', text }`, trimmed.
  - `'send Sam the notes'` → `{ kind: 'computer', reason: NEEDS_COMPUTER }`, and the answer `ask` is never called.
  - An empty reply → `failed` with `'No answer came back.'`.
  - `openRouterAsk`:
    - The POST goes to `https://openrouter.ai/api/v1/chat/completions` with `model: OPENROUTER_CHOOSE_FREE` and `Authorization: Bearer <key>`.
    - It returns `choices[0].message.content`.
    - 429 throws `"OpenRouter's free limit is used up for now. Try again later, or wait for your computer."`.
    - 401 throws `"OpenRouter refused the key. Check it in Settings → On this phone."`.
    - A thrown network error becomes `"OpenRouter couldn't be reached."`.
    - None of these messages contains the key, even when the response body echoes it.
- [ ] **Step 2: Run** `npx vitest run src/test/services/phone/phoneAnswer.test.ts src/test/services/phone/phoneOpenRouter.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `answerOnPhone` calls `phoneRoute(text, ask)` first, then `ask(ALPHONSO_ANSWER_PROMPT, prompt)`.
  - The prompt is: the decisions block, a blank line, the history as `user: …` / `assistant: …`, a blank line, then `User: <text>`.
  - Exceptions from `ask` become `failed` with the error's message.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(phone): answer on the phone with its own model or OpenRouter free`.

### Task 4: The computer keeps phone answers

**Files:**
- Modify:
  - `src/services/phone/phoneChatLog.ts` (`PhoneChatMessage.answeredBy?: PhoneEngine`).
  - `src/services/phone/phoneCalls.ts`.
  - `src/services/phone/phoneProtocol.ts` (add `'chat.phoneAnswered'` to `PhoneCallName`).
- Test: `src/test/services/phone/phoneCalls.test.ts`.

**Interfaces:**
- Consumes: `PhoneEngine` (Task 3).
- Produces: the call `chat.phoneAnswered` with args `{ messageId: string; question: string; answer: string; answeredBy: PhoneEngine; atMs: number }`.
  - It appends the user message with id `messageId`, then the assistant message with id `${messageId}-a` and `answeredBy`.
  - It returns `{ messageId }`.

- [ ] **Step 1: Write the failing tests.**
  - The call adds two messages to `listPhoneChat()`, and the second has `answeredBy: 'openrouter'`.
  - Calling it twice with the same `messageId` keeps exactly two messages: check by id in `listPhoneChat()`, which survives an app restart, not only by memory.
  - An unknown `answeredBy` (`'claude'`) throws `'Not a phone answer.'`.
  - An empty question or answer throws `'Nothing to send.'`.
  - Nothing is planned or answered: `answerOrPlan` is not called.
- [ ] **Step 2: Run** `npx vitest run src/test/services/phone/phoneCalls.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the call next to `chat.send`. Cut each text at 8000 characters, as `chat.send` does.
- [ ] **Step 4: Run** the same file plus `src/test/services/phone/phoneProtocol.test.ts` and `phoneMirror.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(phone): the computer keeps what the phone answered, once`.

### Task 5: The phone's data layer: choose, answer, hand over

**Files:**
- Modify: `src/services/phone/remoteData.ts`.
- Test: `src/test/services/phone/remoteData.test.ts`.

**Interfaces:**
- Consumes: `answerOnPhone`, `ENGINE_LABEL`, `PhoneEngine`, `Ask` (Task 3), and `chat.phoneAnswered` (Task 4).
- Produces:
  - `ChatMessage` gains `answeredBy?: PhoneEngine` and `note?: string`.
  - `ChatData` gains `answerHere(messageId: string, engine: PhoneEngine): Promise<void>` and `answering(): string | null` (the id being answered).
  - `PhoneAnswerParts = { asks: Partial<Record<PhoneEngine, () => Promise<Ask | null>>> }`. A part returns null when that engine can't be used.
  - `createRemoteData(transport, parts, options, answer?: PhoneAnswerParts)`.
  - Store key `alphonso_phone_local_answers_v1`. Each entry is `{ messageId, question, answer, answeredBy, atMs, copied: boolean }`.

- [ ] **Step 1: Write the failing tests**, with a fake transport (offline) and a fake `ask`.
  - `answerHere(id, 'phone')`:
    - Removes the message from the outbox before `ask` is called. The test checks `localStorage['alphonso_phone_outbox_v1']` inside `ask`.
    - Shows the question and the answer in `messages()` with `answeredBy: 'phone'`.
    - Saves them to the local answers key.
  - A `computer` result puts the message back in the outbox, unchanged, with `note: NEEDS_COMPUTER`.
  - A `failed` result puts it back with `note: <reason>`.
  - On reconnect:
    - Each uncopied answer is sent with `chat.phoneAnswered` exactly once and then marked copied.
    - Once the mirror's chat holds `messageId`, `messages()` doesn't show it twice.
  - The saved local answers and the call's arguments never contain the test key string.
  - A second `answerHere` while one runs is ignored.
- [ ] **Step 2: Run** `npx vitest run src/test/services/phone/remoteData.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `messages()` = mirror chat, then local answers whose ids aren't in the mirror, then the outbox.
  - History for the model is the last 6 of those.
  - Decisions come from `mirror.memory.decisions`.
  - Copying happens in `reconnected()`, before `flushOutbox()`.
- [ ] **Step 4: Run** the same file plus `npx vitest run src/test/services/phone src/test/mobile`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(phone): answer a waiting message on the phone, copy it to the computer when it's back`.

### Task 6: Native parts and screens

**Files:**
- Modify:
  - `mobile/ios/App/App/AlphonsoPhonePlugin.swift`: port `modelStatus`/`modelAnswer` from spike commit `22492a4`.
  - `mobile/android/.../AlphonsoPhonePlugin.java`: stubs, reason `android`.
  - `mobile/src/native.ts`: `phoneAnswerParts: PhoneAnswerParts`, with the `phone` part via `modelStatus` + `modelAnswer` and a 120000 ms limit, and the `openrouter` part via `secrets.get(PHONE_OPENROUTER_KEY)` + `CapacitorHttp.request`.
  - `mobile/src/main.tsx`.
  - `src/mobile/MobileApp.tsx` (prop `phoneAnswer?: PhoneAnswerParts`, plus `phoneModelStatus?: () => Promise<{ available: boolean; reason: string | null }>` for Settings).
  - `src/mobile/screens/Chat.tsx`.
  - `src/mobile/screens/PhoneSettings.tsx`.
  - `src/test/mobile/nativeContract.test.js` (method list).
- Test: `src/test/mobile/phase4Chat.test.tsx`.

**Interfaces:**
- Consumes: `ChatData.answerHere`, `answering`, `ENGINE_LABEL`, and `PHONE_OPENROUTER_KEY`.
- Produces: no new shared names.

- [ ] **Step 1: Write the failing tests.**
  - **Offline Chat, a queued message, both parts given:**
    - Buttons "Answer on this phone" and "Answer with OpenRouter (free)" show under it.
    - Tapping one calls `answerHere(id, engine)`.
    - The answer shows `ENGINE_LABEL[engine]` under it.
  - **Choices hidden:**
    - Online, or no parts given: no buttons.
    - The `phone` part returns null: its button is replaced by Apple's reason, using the spike's reason labels (e.g. `appleIntelligenceNotEnabled` → "Apple Intelligence is off"). The status is read when Chat shows the choices, not once at start.
  - **A note:** a message with `note` shows that note.
  - **PhoneSettings "On this phone":**
    - A password field labelled "OpenRouter key (free)". Save calls `secrets.set(PHONE_OPENROUTER_KEY, value)`, then shows "Saved on this phone." and clears the field.
    - Apple's model status shows as text.
  - **Native contract:** the test lists `modelStatus` and `modelAnswer` and passes for Swift and Java.
- [ ] **Step 2: Run** `npx vitest run src/test/mobile/phase4Chat.test.tsx src/test/mobile/nativeContract.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Port the spike's Swift code unchanged, except that the method names stay `modelStatus`/`modelAnswer`.
- [ ] **Step 4: Run** `npx vitest run src/test/mobile src/test/services/phone`, `npx tsc --noEmit -p mobile`, `npm run typecheck` and `npm run lint`. Expected: all clean.
- [ ] **Step 5: Commit** `feat(phone): Answer on this phone / with OpenRouter (free) in Chat, and the key in Settings`.

### Task 7: Docs, a TestFlight build, the owner's check

**Files:**
- Modify:
  - `docs/CHANGELOG.md`.
  - `CLAUDE.md`: Do Not Duplicate rows for `phoneRoute.ts`, `phoneAnswer.ts`, `phoneOpenRouter.ts`, `rankDecisions`, and `chat.phoneAnswered`.
  - `docs/DO_NOT_DUPLICATE.generated.md` (`npm run generate:dnd-map`).
  - The README, AGENTS.md and ARCHITECTURE.md counts, if `node scripts/verify-doc-counts.mjs` asks.

- [ ] **Step 1: Run** `npm run verify:dnd-map`, `node scripts/verify-doc-counts.mjs` and `npm run test`. Expected: PASS after the doc updates.
- [ ] **Step 2: Commit** `docs(phone): phase 4 answering on the phone`, push `feat/mobile-phase4`, and run `phone-app-testflight.yml` on that branch. Expected: success, with the build number printed.
- [ ] **Step 3: The owner checks, with the computer's Alphonso closed:**
  1. "How many minutes is 2.5 hours?" on the phone's model: an answer labelled "Answered on this phone".
  2. "When is …" about a saved decision: Echo's facts appear.
  3. "send Sam the notes": "This needs your computer…".
  4. With the OpenRouter key saved, one question: labelled "Answered with OpenRouter (free)".
  5. Open the computer's Alphonso: the phone answers appear in its phone conversation, once, and the Slack message runs there.

  Record each result in `docs/phone/phase4-test-round-report.md` under "Build check".
