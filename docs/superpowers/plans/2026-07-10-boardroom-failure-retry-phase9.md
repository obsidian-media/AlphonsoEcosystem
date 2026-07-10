# Boardroom Agent Failure Handling + Retry — Phase 9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec 1.10.11 — when an agent fails to respond (Ollama down,
network timeout, model error), the failure needs to be visually distinct
from a normal reply (right now it renders as plain gray text — easy to
miss scrolling past it) and the user needs a way to retry without
retyping the whole message.

**Honest scope limitation, stated up front:** Retry re-runs exactly the
one hop that failed, using the same triggering text and the thread's
current history at retry time. It does **not** re-run the chaining logic
that would have followed a successful reply (i.e. if the failed agent's
reply would have `@mentioned` someone else, a successful retry does not
auto-chain to them) — that would reintroduce exactly the kind of
uncontrolled-cascade risk Phase 5's `MAX_CHAIN_DEPTH` cap exists to
prevent, and retry-triggered chaining is out of scope for a first pass.
Retry also does not distinguish "Ollama is down" from "this specific
model errored" from "network timeout" — `generateAgentResponse`'s
`FacilitatorResult.error` is a raw error string already, and this phase
just surfaces it, not categorizes it.

**Architecture:** `BoardroomThreadMessage.kind` gains a `'failure'`
variant. `addThreadMessage` gains an optional `retryContext` field
(the triggering message text) stored on failure messages so a later Retry
click can reconstruct the call. `handleSend` posts failure messages with
`kind: 'failure'` and `retryContext: text`. `MessageBubble` renders
`'failure'` with distinct rose styling and a Retry button; clicking it
calls a new `handleRetry(message)` in `BoardroomChatView` that re-runs
`generateAgentResponse` for that one agent and posts the result as a new
message (never mutates the original failure message — the thread stays an
append-only log, consistent with every prior phase).

**Tech Stack:** Same as Phases 1-8.

---

## Task 1: `'failure'` kind + `retryContext` field

**Files:**
- Modify: `src/services/boardroomThreadService.ts`
- Test: `src/test/services/boardroomThreadService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/test/services/boardroomThreadService.test.ts, inside the existing
// describe('addThreadMessage', ...) block

    it('stores an optional retryContext on a message for later retry reconstruction', async () => {
      const { createThread, addThreadMessage, listThreadMessages } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['jose'] });
      addThreadMessage({
        threadId: thread.id,
        speaker: 'jose',
        content: "jose couldn't respond: Ollama is not running",
        kind: 'failure',
        retryContext: 'What is the current status?'
      });
      const messages = listThreadMessages(thread.id);
      expect(messages[0].kind).toBe('failure');
      expect(messages[0].retryContext).toBe('What is the current status?');
    });

    it('defaults retryContext to undefined when not provided', async () => {
      const { createThread, addThreadMessage } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['jose'] });
      const msg = addThreadMessage({ threadId: thread.id, speaker: 'jose', content: 'hi' });
      expect(msg?.retryContext).toBeUndefined();
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts -t "retryContext"`
Expected: FAIL — `kind: 'failure'` not a valid type, `retryContext` not stored

- [ ] **Step 3: Implement**

In `src/services/boardroomThreadService.ts`, update the `kind` union:

```typescript
  kind: 'message' | 'briefing' | 'conclusion' | 'system' | 'response' | 'escalation' | 'failure';
```

Add `retryContext?: string` to the `BoardroomThreadMessage` interface, right
after `mentionedAgents: string[];`:

```typescript
  mentionedAgents: string[];
  retryContext?: string;
```

Update `addThreadMessage`'s signature and body to accept and store it:

```typescript
export function addThreadMessage({
  threadId,
  speaker,
  content,
  kind = 'message',
  retryContext
}: {
  threadId: string;
  speaker: string;
  content: string;
  kind?: BoardroomThreadMessage['kind'];
  retryContext?: string;
}): BoardroomThreadMessage | null {
```

(Locate the existing function body — it builds a `message` object and
calls `writeJson`. Add `retryContext` into that constructed object.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/boardroomThreadService.ts src/test/services/boardroomThreadService.test.ts
git commit -m "feat(boardroom): add failure message kind + retryContext field"
```

---

## Task 2: Distinct failure rendering + Retry button

**Files:**
- Modify: `src/components/BoardroomChatView.tsx`
- Test: `src/test/boardroomChatView.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// append to src/test/boardroomChatView.test.jsx, inside the existing describe block

  it('posts a failure-kind message with retryContext when an agent errors, rendered distinctly with a Retry button', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockResolvedValue({ ok: false, text: '', error: 'Ollama is not running' });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Failure Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Failure Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector status check' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    const failureText = await screen.findByText(/ollama is not running/i);
    expect(failureText.closest('[data-message-kind="failure"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^retry$/i })).toBeInTheDocument();
  });

  it('re-runs generation for that agent when Retry is clicked, posting a new message on success', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse
      .mockResolvedValueOnce({ ok: false, text: '', error: 'Ollama is not running' })
      .mockResolvedValueOnce({ ok: true, text: 'All systems normal now.' });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Retry Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Retry Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector status check' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText(/ollama is not running/i);
    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));

    expect(await screen.findByText('All systems normal now.')).toBeInTheDocument();
    expect(facilitator.generateAgentResponse).toHaveBeenCalledTimes(2);
    expect(facilitator.generateAgentResponse.mock.calls[1][0]).toEqual(
      expect.objectContaining({ agentId: 'hector', newMessageText: '@Hector status check' })
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/boardroomChatView.test.jsx -t "failure-kind message"`
Expected: FAIL — failure messages render with default styling, no Retry button exists

- [ ] **Step 3: Implement**

In `src/components/BoardroomChatView.tsx`, update `MessageBubble` to accept
an `onRetry` callback and render failure styling:

```tsx
function MessageBubble({ message, onRetry }: { message: BoardroomThreadMessage; onRetry: (message: BoardroomThreadMessage) => void }) {
  const isEscalation = message.kind === 'escalation';
  const isFailure = message.kind === 'failure';
  const toneClass = isEscalation
    ? 'border-amber-400/40 bg-amber-500/10'
    : isFailure
      ? 'border-rose-400/40 bg-rose-500/10'
      : 'border-[var(--border)] bg-[var(--surface-2)]';
  return (
    <div data-message-kind={message.kind} className={`rounded-lg border p-2.5 text-xs ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`font-semibold ${isEscalation ? 'text-amber-300' : isFailure ? 'text-rose-300' : 'text-[var(--text-1)]'}`}>
          {isEscalation ? 'Needs your decision' : isFailure ? `${agentLabel(message.speaker)} — failed` : agentLabel(message.speaker)}
        </span>
        {message.approvalRequired && (
          <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">
            approval required
          </span>
        )}
      </div>
      <div className={`mt-1 whitespace-pre-wrap ${isEscalation ? 'text-amber-200' : isFailure ? 'text-rose-200' : 'text-[var(--text-2)]'}`}>{message.content}</div>
      {isFailure && message.retryContext && (
        <button
          onClick={() => onRetry(message)}
          className="mt-1.5 rounded-md border border-rose-400/30 px-2 py-0.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10"
        >
          Retry
        </button>
      )}
      {message.mentionedAgents.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {message.mentionedAgents.map((agentId) => (
            <span key={agentId} className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-dim)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--accent)]">
              → {agentLabel(agentId)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

Update the failure-posting call site inside `handleSend`'s `while` loop —
replace:

```typescript
      const replyText = result.ok ? result.text : `${agentId} couldn't respond: ${result.error}`;
      addThreadMessage({ threadId: activeThreadId, speaker: agentId, content: replyText });
      setMessages(listThreadMessages(activeThreadId));
```

with:

```typescript
      const replyText = result.ok ? result.text : `${agentId} couldn't respond: ${result.error}`;
      addThreadMessage({
        threadId: activeThreadId,
        speaker: agentId,
        content: replyText,
        kind: result.ok ? 'message' : 'failure',
        retryContext: result.ok ? undefined : text
      });
      setMessages(listThreadMessages(activeThreadId));
```

Add a `handleRetry` function near `handleStop`:

```typescript
  async function handleRetry(message: BoardroomThreadMessage) {
    if (!activeThreadId || !activeThread || !message.retryContext) return;
    const agentId = message.speaker;
    const priorMessages = listThreadMessages(activeThreadId).map((m) => ({ speaker: m.speaker, content: m.content }));
    const crossThreadContext = findCrossThreadContext({ excludeThreadId: activeThreadId, queryText: message.retryContext });
    const result = await generateAgentResponse({
      agentId,
      topic: activeThread.topic,
      priorMessages,
      newMessageText: message.retryContext,
      crossThreadContext
    });
    const replyText = result.ok ? result.text : `${agentId} couldn't respond: ${result.error}`;
    addThreadMessage({
      threadId: activeThreadId,
      speaker: agentId,
      content: replyText,
      kind: result.ok ? 'message' : 'failure',
      retryContext: result.ok ? undefined : message.retryContext
    });
    setMessages(listThreadMessages(activeThreadId));
  }
```

Update the JSX that renders `messages.map(...)` to pass `onRetry`:

```tsx
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} onRetry={handleRetry} />
              ))}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/boardroomChatView.test.jsx`
Expected: PASS (all tests, 21 total).

- [ ] **Step 5: Commit**

```bash
git add src/components/BoardroomChatView.tsx src/test/boardroomChatView.test.jsx
git commit -m "feat(boardroom): distinct failure rendering + Retry for failed agent replies"
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

- Retry does not re-trigger the chaining logic that a successful original
  reply would have (no auto-chaining on retry — see the honest scope
  statement above)
- No error categorization (network vs. model vs. timeout) beyond
  surfacing the raw error string already returned by `generateAgentResponse`
- No automatic retry / exponential backoff — Retry is always a manual,
  user-initiated click
- No retry limit or lockout after repeated failures on the same message
