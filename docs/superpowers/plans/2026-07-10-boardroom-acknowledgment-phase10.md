# Boardroom Escalation Acknowledgment State — Phase 10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec 1.10.10 — give escalation messages ("Needs your decision")
a way to be marked as seen/handled, so they don't sit indistinguishable
from unaddressed ones as a thread scrolls on.

**Honest scope limitation, stated up front:** Boardroom is a single-user
(Shayan) desktop app talking to 9 AI agents — there is no multi-human
"seen by Alice, seen by Bob" roster to build here, and this phase does not
invent one. What "seen-by/acknowledgment" means in this product is
narrower: did the user acknowledge an escalation that needed their
decision. This phase adds exactly that — an `acknowledged` boolean on
escalation messages, toggled by a click, nothing more. It does not track
per-agent read state, timestamps of when something was seen, or
acknowledgment of non-escalation messages (a normal chat message doesn't
need an "acknowledge" button — only escalations, which are explicitly the
"needs your decision" ones).

**Architecture:** `BoardroomThreadMessage` gains `acknowledged?: boolean`.
A new `acknowledgeThreadMessage(messageId)` in `boardroomThreadService.ts`
flips it to `true` and persists. `MessageBubble` shows an "Acknowledge"
button on unacknowledged escalation messages; once acknowledged, it
renders a static "✓ Acknowledged" badge instead (no more button — this is
a one-way transition, consistent with the rest of the append-only-log
design where nothing gets un-done).

**Tech Stack:** Same as Phases 1-9.

---

## Task 1: `acknowledgeThreadMessage` in boardroomThreadService.ts

**Files:**
- Modify: `src/services/boardroomThreadService.ts`
- Test: `src/test/services/boardroomThreadService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/test/services/boardroomThreadService.test.ts, inside the existing
// describe('addThreadMessage', ...) block

    it('acknowledgeThreadMessage marks a message as acknowledged and persists it', async () => {
      const { createThread, addThreadMessage, acknowledgeThreadMessage, listThreadMessages } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['jose'] });
      const msg = addThreadMessage({ threadId: thread.id, speaker: 'alphonso', content: 'Needs your decision.', kind: 'escalation' });

      const updated = acknowledgeThreadMessage(msg.id);
      expect(updated?.acknowledged).toBe(true);

      const messages = listThreadMessages(thread.id);
      expect(messages[0].acknowledged).toBe(true);
    });

    it('acknowledgeThreadMessage returns null for an unknown message id', async () => {
      const { acknowledgeThreadMessage } = await import('../../services/boardroomThreadService');
      expect(acknowledgeThreadMessage('nonexistent_id')).toBeNull();
    });

    it('a freshly created message defaults to unacknowledged', async () => {
      const { createThread, addThreadMessage } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['jose'] });
      const msg = addThreadMessage({ threadId: thread.id, speaker: 'alphonso', content: 'hi' });
      expect(msg?.acknowledged).toBe(false);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts -t "acknowledgeThreadMessage"`
Expected: FAIL — `acknowledgeThreadMessage` is not exported

- [ ] **Step 3: Implement**

In `src/services/boardroomThreadService.ts`, add `acknowledged: boolean`
to the `BoardroomThreadMessage` interface (right after `retryContext?:
string;`):

```typescript
  retryContext?: string;
  acknowledged: boolean;
```

In `addThreadMessage`, set the default when constructing `message`:

```typescript
  const message: BoardroomThreadMessage = {
    id: makeId('boardroom_msg'),
    threadId,
    speaker,
    content: text,
    kind,
    riskLevel: risk.riskLevel,
    approvalRequired: risk.approvalRequired,
    secretRedacted: risk.secretDetected,
    mentionedAgents,
    retryContext,
    acknowledged: false,
    createdAt: nowIso(),
    createdAtMs: nowMs(),
    seq: nextSeq()
  };
```

Add a new exported function, after `addThreadMessage`:

```typescript
export function acknowledgeThreadMessage(messageId: string): BoardroomThreadMessage | null {
  const rows = readJson<BoardroomThreadMessage[]>(MESSAGES_KEY, []);
  const index = rows.findIndex((row) => row.id === messageId);
  if (index === -1) return null;
  const updated = { ...rows[index], acknowledged: true };
  const next = [...rows];
  next[index] = updated;
  writeJson(MESSAGES_KEY, next);
  return updated;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/boardroomThreadService.ts src/test/services/boardroomThreadService.test.ts
git commit -m "feat(boardroom): add acknowledgeThreadMessage + acknowledged field"
```

---

## Task 2: Acknowledge button on escalation messages

**Files:**
- Modify: `src/components/BoardroomChatView.tsx`
- Test: `src/test/boardroomChatView.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// append to src/test/boardroomChatView.test.jsx, inside the existing describe block

  it('shows an Acknowledge button on an unacknowledged escalation message, which becomes a static badge once clicked', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    const { createThread, addThreadMessage } = await import('../services/boardroomThreadService');

    const thread = createThread({ topic: 'Ack Test', participants: ['jose', 'hector'] });
    addThreadMessage({ threadId: thread.id, speaker: 'alphonso', content: 'Round cap reached — please weigh in.', kind: 'escalation' });

    render(<BoardroomChatView />);
    await screen.findByText('Round cap reached — please weigh in.');

    const ackButton = screen.getByRole('button', { name: /^acknowledge$/i });
    fireEvent.click(ackButton);

    expect(await screen.findByText(/✓ acknowledged/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^acknowledge$/i })).not.toBeInTheDocument();
  });

  it('does not show an Acknowledge control on a normal (non-escalation) message', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    const { createThread, addThreadMessage } = await import('../services/boardroomThreadService');

    const thread = createThread({ topic: 'Normal Test', participants: ['jose'] });
    addThreadMessage({ threadId: thread.id, speaker: 'jose', content: 'Just a normal update.' });

    render(<BoardroomChatView />);
    await screen.findByText('Just a normal update.');

    expect(screen.queryByRole('button', { name: /^acknowledge$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/✓ acknowledged/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/boardroomChatView.test.jsx -t "Acknowledge button"`
Expected: FAIL — no Acknowledge button rendered

- [ ] **Step 3: Implement**

In `src/components/BoardroomChatView.tsx`, import `acknowledgeThreadMessage`:

```typescript
import {
  createThread,
  listThreads,
  listThreadMessages,
  addThreadMessage,
  acknowledgeThreadMessage,
  migrateLegacySessions,
  parseMentions,
  findCrossThreadContext,
  type BoardroomThread,
  type BoardroomThreadMessage
} from '../services/boardroomThreadService';
```

Update `MessageBubble` to accept `onAcknowledge` and render the
escalation-only control:

```tsx
function MessageBubble({
  message,
  onRetry,
  onAcknowledge
}: {
  message: BoardroomThreadMessage;
  onRetry: (message: BoardroomThreadMessage) => void;
  onAcknowledge: (message: BoardroomThreadMessage) => void;
}) {
```

(keep the existing body, then right after the `isFailure && message.retryContext`
Retry button block, add:)

```tsx
      {isEscalation && (
        message.acknowledged ? (
          <span className="mt-1.5 inline-block text-[10px] font-semibold text-amber-400/70">✓ Acknowledged</span>
        ) : (
          <button
            onClick={() => onAcknowledge(message)}
            className="mt-1.5 rounded-md border border-amber-400/30 px-2 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/10"
          >
            Acknowledge
          </button>
        )
      )}
```

Add a `handleAcknowledge` function near `handleRetry`:

```typescript
  function handleAcknowledge(message: BoardroomThreadMessage) {
    if (!activeThreadId) return;
    acknowledgeThreadMessage(message.id);
    setMessages(listThreadMessages(activeThreadId));
  }
```

Update the render call to pass it through:

```tsx
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} onRetry={handleRetry} onAcknowledge={handleAcknowledge} />
              ))}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/boardroomChatView.test.jsx`
Expected: PASS (all tests, 23 total).

- [ ] **Step 5: Commit**

```bash
git add src/components/BoardroomChatView.tsx src/test/boardroomChatView.test.jsx
git commit -m "feat(boardroom): add Acknowledge control for escalation messages"
```

---

## Task 3: Full verification

- [ ] **Step 1: Run the full affected test set**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts src/test/services/boardroomFacilitatorService.test.ts src/test/boardroomChatView.test.jsx src/test/appLazyImports.test.js`
Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors.

---

## Explicitly NOT in this phase

- Per-agent "seen by" roster — there is no multi-human-user concept in
  this product to model
- Acknowledgment of non-escalation messages
- Un-acknowledging (one-way transition, matching the append-only-log
  design used everywhere else in Boardroom)
- Any notification/reminder system for unacknowledged escalations
