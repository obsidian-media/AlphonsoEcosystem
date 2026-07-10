# Boardroom Stop/Cancel Generation — Phase 8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec 1.10.12 — give the user a way to stop an in-progress
generation cascade instead of being stuck waiting out however many hops
remain (up to `MAX_CHAIN_DEPTH` real Ollama calls, each of which can take
tens of seconds per the Phase 3/4 live-verification findings).

**Honest scope limitation, stated up front:** This phase does not abort an
in-flight network request — `generateOllamaResponse` in `src/lib/ollama.js`
has no `AbortController` wiring, and adding real fetch cancellation is a
separate, larger change to the Ollama client shared by every other caller
in the app (ChatView, all agent services), not something to bolt on here
without its own review. What this phase builds instead: a "Stop" button
that prevents the *next* hop in the chain from starting. If a hop is
already in flight when Stop is clicked, that one hop finishes normally (its
reply still posts — it's real content, not discarded), but no further hops
or the escalation/confidence checks that would have triggered new hops are
executed. This bounds the wait to "at most one more in-flight call," not
zero, and that tradeoff is stated plainly rather than pretending Stop is
instant.

**Architecture:** A `useRef<boolean>` flag (`stopRequestedRef`) is set by a
"Stop" button shown next to the "Alphonso is thinking…" indicator while
`facilitatorPending` is true. `handleSend`'s `while` loop checks the flag
at the top of each iteration (before starting a new hop) and, if set,
posts a `kind: 'system'` message noting generation was stopped by the user,
then breaks.

**Tech Stack:** Same as Phases 1-7.

---

## Task 1: Stop button + loop-check wiring

**Files:**
- Modify: `src/components/BoardroomChatView.tsx`
- Test: `src/test/boardroomChatView.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// append to src/test/boardroomChatView.test.jsx, inside the existing describe block

  it('shows a Stop button while generation is in progress and stops further hops when clicked', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    let resolveFirstHop;
    const firstHopPromise = new Promise((resolve) => { resolveFirstHop = resolve; });
    facilitator.generateAgentResponse.mockImplementation(({ agentId }) => {
      if (agentId === 'hector') return firstHopPromise;
      return Promise.resolve({ ok: true, text: 'jose should not be called' });
    });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Stop Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Stop Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector look into this' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    const stopButton = await screen.findByRole('button', { name: /^stop$/i });
    fireEvent.click(stopButton);

    resolveFirstHop({ ok: true, text: '@Jose keep going' });

    await screen.findByText('@Jose keep going');
    await screen.findByText(/generation stopped/i);
    expect(facilitator.generateAgentResponse).not.toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'jose' })
    );
  });

  it('does not show a Stop button when nothing is generating', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);
    expect(screen.queryByRole('button', { name: /^stop$/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/boardroomChatView.test.jsx -t "shows a Stop button"`
Expected: FAIL — no Stop button exists, jose still gets called

- [ ] **Step 3: Implement**

In `src/components/BoardroomChatView.tsx`, add `useRef` to the React
import:

```typescript
import React, { useEffect, useMemo, useRef, useState } from 'react';
```

Add the ref inside the component, alongside the other `useState` calls:

```typescript
  const stopRequestedRef = useRef(false);
```

At the start of `handleSend`, right after `setFacilitatorPending(true);`,
reset the flag:

```typescript
    setFacilitatorPending(true);
    stopRequestedRef.current = false;
    let hopsUsed = 0;
```

At the top of the `while` loop body (before the `hopsUsed >=
MAX_CHAIN_DEPTH` check), add the stop check:

```typescript
    while (respondingAgents.length > 0) {
      const agentId = respondingAgents.shift() as string;

      if (stopRequestedRef.current) {
        addThreadMessage({
          threadId: activeThreadId,
          speaker: 'alphonso',
          content: 'Generation stopped by user.',
          kind: 'system'
        });
        setMessages(listThreadMessages(activeThreadId));
        break;
      }

      if (hopsUsed >= MAX_CHAIN_DEPTH) {
```

Add a `handleStop` function near `handleSend`:

```typescript
  function handleStop() {
    stopRequestedRef.current = true;
  }
```

In the JSX, replace the `facilitatorPending` indicator block:

```tsx
            {facilitatorPending && (
              <div className="flex items-center justify-between px-4 pb-1 text-xs text-[var(--text-3)]">
                <span>Alphonso is thinking…</span>
                <button
                  onClick={handleStop}
                  className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-2)] hover:bg-[var(--surface-2)]"
                >
                  Stop
                </button>
              </div>
            )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/boardroomChatView.test.jsx`
Expected: PASS (all tests, 19 total).

- [ ] **Step 5: Commit**

```bash
git add src/components/BoardroomChatView.tsx src/test/boardroomChatView.test.jsx
git commit -m "feat(boardroom): add Stop button to halt further chained generation hops"
```

---

## Task 2: Full verification

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

- True in-flight fetch cancellation via `AbortController` — the currently
  in-flight hop always finishes and posts its reply
- Stop affecting a single-hop (non-chained) generation meaningfully
  differently — the button appears any time `facilitatorPending` is true,
  even for a one-hop reply, but since there's nothing queued after a
  single hop, clicking it just prevents a chain that was never going to
  start
- Any confirmation dialog before stopping, undo, or resuming a stopped
  cascade
