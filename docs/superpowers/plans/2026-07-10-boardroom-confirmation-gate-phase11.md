# Boardroom External-Action Confirmation Gate — Phase 11 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec 1.10.13 — gate high-risk, action-proposing content behind an
explicit user confirmation before it's shown in full, mirroring the real
`ApprovalModal.jsx` pattern used elsewhere in the app for actual connector
actions.

**Honest scope limitation, stated up front — this is the important one for
this phase:** grepped `BoardroomChatView.tsx`, `boardroomThreadService.ts`,
and `boardroomFacilitatorService.ts` for any connector/execution call
(`githubConnector`, `slackConnector`, `marcusExecutionService`,
`policyEnforcementService`, anything under `connectors/`) — there are
zero. Boardroom is pure text generation; no message posted in a thread
ever triggers a real external action (no GitHub PR, no Slack post, no
publish). So there is no live action-execution path to gate here, and
this phase does not invent a fake one just to have something to block.

What genuinely exists to gate: `addThreadMessage` already reuses
`classifyMissionRoomRisk` (the same real risk classifier
`missionRoomService.ts` uses for actual gated actions elsewhere in the
app) and flags high-risk content with `approvalRequired: true` — e.g. "Ready
to publish this to production." Today that flag only renders a small
"approval required" badge; the content is otherwise fully visible with
zero friction, so a user could skim past it and (outside Boardroom) act on
it without ever consciously registering the risk. This phase adds real
friction: any message with `approvalRequired: true` renders masked behind
a "Confirm to reveal" gate until the user explicitly confirms it once.
This is a content-exposure gate, not an action-execution gate — an honest
distinction, stated plainly rather than implying Boardroom blocks actions
it never runs in the first place.

**Architecture:** `BoardroomThreadMessage` gains `confirmed: boolean`
(defaults `false`). A new `confirmThreadMessage(messageId)` in
`boardroomThreadService.ts` flips it (one-way, matching
`acknowledgeThreadMessage`'s pattern from Phase 10).
`MessageBubble` renders any `approvalRequired && !confirmed` message with
its content replaced by a masked placeholder and a "Confirm to reveal"
button; once confirmed, the real content shows permanently with a small
"Confirmed" badge instead of the plain "approval required" one.

**Tech Stack:** Same as Phases 1-10.

---

## Task 1: `confirmThreadMessage` in boardroomThreadService.ts

**Files:**
- Modify: `src/services/boardroomThreadService.ts`
- Test: `src/test/services/boardroomThreadService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/test/services/boardroomThreadService.test.ts, inside the existing
// describe('addThreadMessage', ...) block

    it('confirmThreadMessage marks a message as confirmed and persists it', async () => {
      const { createThread, addThreadMessage, confirmThreadMessage, listThreadMessages } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['marcus'] });
      const msg = addThreadMessage({ threadId: thread.id, speaker: 'marcus', content: 'Ready to publish this to production.' });
      expect(msg?.approvalRequired).toBe(true);
      expect(msg?.confirmed).toBe(false);

      const updated = confirmThreadMessage(msg!.id);
      expect(updated?.confirmed).toBe(true);

      const messages = listThreadMessages(thread.id);
      expect(messages[0].confirmed).toBe(true);
    });

    it('confirmThreadMessage returns null for an unknown message id', async () => {
      const { confirmThreadMessage } = await import('../../services/boardroomThreadService');
      expect(confirmThreadMessage('nonexistent_id')).toBeNull();
    });

    it('a low-risk message defaults confirmed to false but is not gated (no approvalRequired)', async () => {
      const { createThread, addThreadMessage } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['jose'] });
      const msg = addThreadMessage({ threadId: thread.id, speaker: 'jose', content: 'Just a normal update.' });
      expect(msg?.approvalRequired).toBe(false);
      expect(msg?.confirmed).toBe(false);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts -t "confirmThreadMessage"`
Expected: FAIL — `confirmThreadMessage` is not exported, `confirmed` is undefined

- [ ] **Step 3: Implement**

In `src/services/boardroomThreadService.ts`, add `confirmed: boolean` to
the `BoardroomThreadMessage` interface, right after `acknowledged:
boolean;`:

```typescript
  acknowledged: boolean;
  confirmed: boolean;
```

In `addThreadMessage`, set the default in the constructed `message`
object:

```typescript
    mentionedAgents,
    retryContext,
    acknowledged: false,
    confirmed: false,
    createdAt: nowIso(),
```

Add the two `BoardroomThreadMessage` object literals inside
`migrateLegacySessions` (there are two — one in the `.map()` for migrated
messages, one for the "migrated from legacy session" system note) also
need `confirmed: false` added next to their existing `acknowledged:
false` line, or `tsc --noEmit` will fail exactly like it did in Phase 10
Task 1.

Add a new exported function, after `acknowledgeThreadMessage`:

```typescript
export function confirmThreadMessage(messageId: string): BoardroomThreadMessage | null {
  const rows = readJson<BoardroomThreadMessage[]>(MESSAGES_KEY, []);
  const index = rows.findIndex((row) => row.id === messageId);
  if (index === -1) return null;
  const updated = { ...rows[index], confirmed: true };
  const next = [...rows];
  next[index] = updated;
  writeJson(MESSAGES_KEY, next);
  return updated;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Run typecheck to catch any other object-literal sites**

Run: `npx tsc --noEmit`
Expected: clean — fix any `BoardroomThreadMessage` literal missing
`confirmed` that tsc flags.

- [ ] **Step 6: Commit**

```bash
git add src/services/boardroomThreadService.ts src/test/services/boardroomThreadService.test.ts
git commit -m "feat(boardroom): add confirmThreadMessage + confirmed field"
```

---

## Task 2: Content-masking confirmation gate in the UI

**Files:**
- Modify: `src/components/BoardroomChatView.tsx`
- Test: `src/test/boardroomChatView.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// append to src/test/boardroomChatView.test.jsx, inside the existing describe block

  it('masks a high-risk (approvalRequired) message behind a Confirm gate until confirmed', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    const { createThread, addThreadMessage } = await import('../services/boardroomThreadService');

    const thread = createThread({ topic: 'Risk Test', participants: ['marcus'] });
    addThreadMessage({ threadId: thread.id, speaker: 'marcus', content: 'Ready to publish this to production.' });

    render(<BoardroomChatView />);

    expect(screen.queryByText('Ready to publish this to production.')).not.toBeInTheDocument();
    expect(await screen.findByText(/proposes a high-risk action/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /confirm to reveal/i }));

    expect(await screen.findByText('Ready to publish this to production.')).toBeInTheDocument();
    expect(screen.getByText(/^confirmed$/i)).toBeInTheDocument();
  });

  it('does not mask a normal (non-approval-required) message', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    const { createThread, addThreadMessage } = await import('../services/boardroomThreadService');

    const thread = createThread({ topic: 'Normal Risk Test', participants: ['jose'] });
    addThreadMessage({ threadId: thread.id, speaker: 'jose', content: 'Just a normal update.' });

    render(<BoardroomChatView />);

    expect(await screen.findByText('Just a normal update.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm to reveal/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/boardroomChatView.test.jsx -t "masks a high-risk"`
Expected: FAIL — content shows unmasked, no Confirm gate exists

- [ ] **Step 3: Implement**

In `src/components/BoardroomChatView.tsx`, import `confirmThreadMessage`:

```typescript
import {
  createThread,
  listThreads,
  listThreadMessages,
  addThreadMessage,
  acknowledgeThreadMessage,
  confirmThreadMessage,
  migrateLegacySessions,
  parseMentions,
  findCrossThreadContext,
  type BoardroomThread,
  type BoardroomThreadMessage
} from '../services/boardroomThreadService';
```

Update `MessageBubble`'s props and body — add `onConfirm`, and gate the
content render:

```tsx
function MessageBubble({
  message,
  onRetry,
  onAcknowledge,
  onConfirm
}: {
  message: BoardroomThreadMessage;
  onRetry: (message: BoardroomThreadMessage) => void;
  onAcknowledge: (message: BoardroomThreadMessage) => void;
  onConfirm: (message: BoardroomThreadMessage) => void;
}) {
```

Right after the `isFailure` declaration, add:

```typescript
  const isGated = message.approvalRequired && !message.confirmed;
```

Replace the content `<div>` line:

```tsx
      <div className={`mt-1 whitespace-pre-wrap ${isEscalation ? 'text-amber-200' : isFailure ? 'text-rose-200' : 'text-[var(--text-2)]'}`}>{message.content}</div>
```

with:

```tsx
      {isGated ? (
        <div className="mt-1.5 rounded-md border border-amber-400/30 bg-amber-500/5 p-2">
          <p className="text-amber-300">This message proposes a high-risk action — content hidden until confirmed.</p>
          <button
            onClick={() => onConfirm(message)}
            className="mt-1.5 rounded-md border border-amber-400/40 px-2 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/10"
          >
            Confirm to reveal
          </button>
        </div>
      ) : (
        <div className={`mt-1 whitespace-pre-wrap ${isEscalation ? 'text-amber-200' : isFailure ? 'text-rose-200' : 'text-[var(--text-2)]'}`}>{message.content}</div>
      )}
```

Update the `approvalRequired` badge to distinguish confirmed from
unconfirmed — replace:

```tsx
        {message.approvalRequired && (
          <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">
            approval required
          </span>
        )}
```

with:

```tsx
        {message.approvalRequired && (
          <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">
            {message.confirmed ? 'confirmed' : 'approval required'}
          </span>
        )}
```

Add a `handleConfirm` function near `handleAcknowledge`:

```typescript
  function handleConfirm(message: BoardroomThreadMessage) {
    if (!activeThreadId) return;
    confirmThreadMessage(message.id);
    setMessages(listThreadMessages(activeThreadId));
  }
```

Update the render call:

```tsx
                <MessageBubble key={m.id} message={m} onRetry={handleRetry} onAcknowledge={handleAcknowledge} onConfirm={handleConfirm} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/boardroomChatView.test.jsx`
Expected: PASS (all tests, 25 total).

- [ ] **Step 5: Commit**

```bash
git add src/components/BoardroomChatView.tsx src/test/boardroomChatView.test.jsx
git commit -m "feat(boardroom): mask high-risk message content behind a confirmation gate"
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

- Gating a real connector/execution call — none exists in Boardroom's
  code path today; this gates content *exposure*, not action *execution*
- Un-confirming (one-way transition, matching every other state flag
  added in prior phases)
- Any policy-engine integration (`policyEnforcementService.ts`) — that
  governs real connector calls elsewhere in the app; Boardroom chat has
  no connector calls to route through it
- Gating based on anything other than the existing `approvalRequired`
  flag already computed by the reused `classifyMissionRoomRisk`
