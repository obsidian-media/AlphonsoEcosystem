# Boardroom Model/Latency Indicator — Phase 12 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec 1.10.5 — show which model generated a reply and how long
it took, so the user isn't guessing why one reply appeared instantly and
another took over a minute (per the Phase 3/4 live-verification finding
that a cold model swap alone took 47.3s).

**Honest scope limitation, stated up front:** This is real, measured
data — `Date.now()` around the actual `generateOllamaResponse` call, and
the actual `model` string passed to it — not an estimate. It does not
track cumulative session cost, tokens/sec, or historical latency trends;
it's a per-message "this reply: model X, took Y seconds" label, nothing
more.

**Architecture:** `FacilitatorResult` gains `model` and `latencyMs`.
`generateAgentResponse` measures elapsed time around the
`generateOllamaResponse` call and returns both. `BoardroomThreadMessage`
gains optional `model?: string` / `latencyMs?: number`, populated by
`addThreadMessage` when passed. `handleSend` and `handleRetry` in
`BoardroomChatView.tsx` pass `result.model`/`result.latencyMs` through
when posting a successful reply. `MessageBubble` renders a small muted
`model · Xs` label under agent (non-escalation, non-failure, non-system)
messages that have it.

**Tech Stack:** Same as Phases 1-11.

---

## Task 1: Measure and return model + latency from generateAgentResponse

**Files:**
- Modify: `src/services/boardroomFacilitatorService.ts`
- Test: `src/test/services/boardroomFacilitatorService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/test/services/boardroomFacilitatorService.test.ts, inside
// describe('generateAgentResponse', ...)

    it('returns the model used and a measured latencyMs on success', async () => {
      const ollama = await import('../../lib/ollama');
      (ollama.generateOllamaResponse as any).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ response: 'ok', done: true }), 5))
      );

      const { generateAgentResponse } = await import('../../services/boardroomFacilitatorService');
      const result = await generateAgentResponse({
        agentId: 'hector',
        topic: 'Test',
        priorMessages: [],
        newMessageText: 'hi',
        model: 'llama3.2:3b'
      });

      expect(result.model).toBe('llama3.2:3b');
      expect(result.latencyMs).toBeGreaterThanOrEqual(5);
    });

    it('does not return model/latencyMs on failure', async () => {
      const ollama = await import('../../lib/ollama');
      (ollama.generateOllamaResponse as any).mockRejectedValue(new Error('Ollama is not running'));

      const { generateAgentResponse } = await import('../../services/boardroomFacilitatorService');
      const result = await generateAgentResponse({
        agentId: 'hector',
        topic: 'Test',
        priorMessages: [],
        newMessageText: 'hi'
      });

      expect(result.model).toBeUndefined();
      expect(result.latencyMs).toBeUndefined();
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/services/boardroomFacilitatorService.test.ts -t "measured latencyMs"`
Expected: FAIL — `result.model`/`result.latencyMs` are undefined on success too

- [ ] **Step 3: Implement**

In `src/services/boardroomFacilitatorService.ts`, update
`FacilitatorResult`:

```typescript
export interface FacilitatorResult {
  ok: boolean;
  text: string;
  error?: string;
  model?: string;
  latencyMs?: number;
}
```

Update `generateAgentResponse`'s body:

```typescript
  const prompt = buildFacilitatorPrompt({ topic, priorMessages, newMessageText, agentId, crossThreadContext });
  const startedAt = Date.now();
  try {
    const result = await generateOllamaResponse({ endpoint, model, prompt });
    return { ok: true, text: (result?.response || '').trim(), model, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, text: '', error: (error as Error)?.message || String(error) };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/services/boardroomFacilitatorService.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/boardroomFacilitatorService.ts src/test/services/boardroomFacilitatorService.test.ts
git commit -m "feat(boardroom): return measured model + latencyMs from generateAgentResponse"
```

---

## Task 2: Store and render the model/latency label

**Files:**
- Modify: `src/services/boardroomThreadService.ts`
- Modify: `src/components/BoardroomChatView.tsx`
- Test: `src/test/services/boardroomThreadService.test.ts`
- Test: `src/test/boardroomChatView.test.jsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// append to src/test/services/boardroomThreadService.test.ts, inside the existing
// describe('addThreadMessage', ...) block

    it('stores optional model and latencyMs fields when provided', async () => {
      const { createThread, addThreadMessage } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['hector'] });
      const msg = addThreadMessage({
        threadId: thread.id,
        speaker: 'hector',
        content: 'On it.',
        model: 'llama3.2:3b',
        latencyMs: 2345
      });
      expect(msg?.model).toBe('llama3.2:3b');
      expect(msg?.latencyMs).toBe(2345);
    });
```

```jsx
// append to src/test/boardroomChatView.test.jsx, inside the existing describe block

  it('shows a model + latency label under a successful agent reply', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockResolvedValue({ ok: true, text: 'On it.', model: 'llama3.2:3b', latencyMs: 2345 });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Latency Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Latency Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector status?' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText('On it.');
    expect(await screen.findByText(/llama3\.2:3b · 2\.3s/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts -t "model and latencyMs"`
Run: `npx vitest run src/test/boardroomChatView.test.jsx -t "model + latency label"`
Expected: both FAIL

- [ ] **Step 3: Implement**

In `src/services/boardroomThreadService.ts`, add optional fields to
`BoardroomThreadMessage`, right after `confirmed: boolean;`:

```typescript
  confirmed: boolean;
  model?: string;
  latencyMs?: number;
```

Update `addThreadMessage`'s param list and body:

```typescript
export function addThreadMessage({
  threadId,
  speaker,
  content,
  kind = 'message',
  retryContext,
  model,
  latencyMs
}: {
  threadId: string;
  speaker: string;
  content: string;
  kind?: BoardroomThreadMessage['kind'];
  retryContext?: string;
  model?: string;
  latencyMs?: number;
}): BoardroomThreadMessage | null {
```

and in the constructed `message` object, add `model, latencyMs,` next to
`retryContext,`.

In `src/components/BoardroomChatView.tsx`, update both `addThreadMessage`
call sites inside `handleSend` and `handleRetry` that post a successful
reply to pass the new fields through:

```typescript
      addThreadMessage({
        threadId: activeThreadId,
        speaker: agentId,
        content: replyText,
        kind: result.ok ? 'message' : 'failure',
        retryContext: result.ok ? undefined : text,
        model: result.ok ? result.model : undefined,
        latencyMs: result.ok ? result.latencyMs : undefined
      });
```

(apply the equivalent to `handleRetry`'s `addThreadMessage` call, using
`message.retryContext` in place of `text`).

Add a small formatting helper near `agentLabel`:

```typescript
function formatLatency(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
```

In `MessageBubble`, right after the content/gated block (before the
Retry button), add:

```tsx
      {!isEscalation && !isFailure && message.model && (
        <div className="mt-1 text-[9px] text-[var(--text-3)]">
          {message.model} · {formatLatency(message.latencyMs || 0)}
        </div>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts src/test/boardroomChatView.test.jsx`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/boardroomThreadService.ts src/components/BoardroomChatView.tsx src/test/services/boardroomThreadService.test.ts src/test/boardroomChatView.test.jsx
git commit -m "feat(boardroom): show model + latency label on successful agent replies"
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

- Cumulative session cost/token tracking
- Tokens/sec throughput
- Historical latency trends or charts
- A label on escalation/failure/system messages — only real successful
  agent replies get one, since only those actually ran a model
