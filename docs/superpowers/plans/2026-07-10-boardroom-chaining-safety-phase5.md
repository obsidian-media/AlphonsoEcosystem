# Boardroom Chained @Mentions + Debate-Loop Safety Cap — Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a mentioned agent's own generated reply to `@mention`
another agent and have that trigger a real response too (Phase 4
deliberately stopped at one hop) — but bounded by a hard round cap, per
spec 1.10.2, with a distinct visible escalation banner when the cap is
hit, per spec 1.10.1's "distinct, visually different message type... so it
doesn't get lost in scrollback."

**Honest scope limitation, stated up front:** The full spec 1.10.1 wants
escalation to name the *specific unresolved disagreement* and show both
agents' positions side by side. That requires detecting that two agents
actually disagree — a real semantic-understanding problem this phase does
not attempt to solve. What this phase builds instead: a hard cap on how
many chained AI-generated hops can fire from one user message, and when
that cap is hit, a distinct escalation banner that says the conversation
kept going without stopping and needs the user's input to continue — safe
and honest, not the full richness, and not pretending to be more than it
is.

**Architecture:** `handleSend` in `BoardroomChatView.tsx` currently fires
one round of `generateAgentResponse` calls for the mentioned/facilitator
agents and stops. This phase turns that into a bounded loop: after each
generated reply, check if *that reply* itself contains new `@mentions`
(excluding the agent who just spoke and anyone already responded to in
this cascade); if so and the round cap isn't hit, generate those replies
too; if the cap is hit, stop and post an escalation message instead of
further replies. A new `BoardroomThreadMessage.kind` value (`'escalation'`)
gets distinct rendering in `MessageBubble`.

**Tech Stack:** Same as Phase 1-4.

---

## Task 1: Escalation message kind + distinct rendering

**Files:**
- Modify: `src/components/BoardroomChatView.tsx`
- Test: `src/test/boardroomChatView.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// append to src/test/boardroomChatView.test.jsx, inside the existing describe block

  it('renders an escalation message with distinct amber styling, not a normal bubble', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    const { createThread, addThreadMessage } = await import('../services/boardroomThreadService');

    const thread = createThread({ topic: 'Escalation Render Test', participants: ['jose', 'hector'] });
    addThreadMessage({ threadId: thread.id, speaker: 'alphonso', content: 'Round cap reached — please weigh in.', kind: 'escalation' });

    render(<BoardroomChatView />);

    const banner = await screen.findByText('Round cap reached — please weigh in.');
    expect(banner.closest('[data-message-kind="escalation"]')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/boardroomChatView.test.jsx -t "renders an escalation message"`
Expected: FAIL — no `[data-message-kind="escalation"]` element exists

- [ ] **Step 3: Add escalation rendering to `MessageBubble`**

In `src/components/BoardroomChatView.tsx`, replace the `MessageBubble`
function with:

```tsx
function MessageBubble({ message }: { message: BoardroomThreadMessage }) {
  const isEscalation = message.kind === 'escalation';
  return (
    <div
      data-message-kind={message.kind}
      className={
        isEscalation
          ? 'rounded-lg border border-amber-400/40 bg-amber-500/10 p-2.5 text-xs'
          : 'rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs'
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`font-semibold ${isEscalation ? 'text-amber-300' : 'text-[var(--text-1)]'}`}>
          {isEscalation ? 'Needs your decision' : agentLabel(message.speaker)}
        </span>
        {message.approvalRequired && (
          <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">
            approval required
          </span>
        )}
      </div>
      <div className={`mt-1 whitespace-pre-wrap ${isEscalation ? 'text-amber-200' : 'text-[var(--text-2)]'}`}>{message.content}</div>
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/boardroomChatView.test.jsx -t "renders an escalation message"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BoardroomChatView.tsx src/test/boardroomChatView.test.jsx
git commit -m "feat(boardroom): add distinct escalation message rendering"
```

---

## Task 2: Bounded chaining with round cap

**Files:**
- Modify: `src/components/BoardroomChatView.tsx`
- Test: `src/test/boardroomChatView.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// append to src/test/boardroomChatView.test.jsx, inside the existing describe block

  it('chains a mentioned agent whose reply itself @mentions another agent, within the round cap', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockImplementation(({ agentId }) => {
      if (agentId === 'hector') return Promise.resolve({ ok: true, text: '@Jose can you route this further?' });
      return Promise.resolve({ ok: true, text: `${agentId} final reply` });
    });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Chain Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Chain Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector look into this' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText('@Jose can you route this further?')).toBeInTheDocument();
    expect(await screen.findByText('jose final reply')).toBeInTheDocument();
  });

  it('stops chaining and posts an escalation message once the round cap is hit', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    // Every agent's reply mentions the next one, forming an unbroken chain
    // that would run forever without a cap: hector -> jose -> hector -> jose ...
    facilitator.generateAgentResponse.mockImplementation(({ agentId }) => {
      const next = agentId === 'hector' ? 'jose' : 'hector';
      return Promise.resolve({ ok: true, text: `@${next[0].toUpperCase()}${next.slice(1)} keep going` });
    });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Cap Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Cap Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector start the chain' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    const escalation = await screen.findByText(/needs your decision/i);
    expect(escalation).toBeInTheDocument();
    // Round cap of 3 means at most 3 chained AI replies fire before escalating.
    expect(facilitator.generateAgentResponse.mock.calls.length).toBeLessThanOrEqual(3);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/boardroomChatView.test.jsx -t "chains a mentioned agent"`
Expected: FAIL — Jose never responds, no chaining happens (Phase 4 stops after one hop)

- [ ] **Step 3: Implement bounded chaining**

In `src/components/BoardroomChatView.tsx`, add a constant near the top of
the file, after `const AGENT_PROFILES = listAgentProfiles();`:

```typescript
// Spec 1.10.2: a hard cap on chained AI-generated hops per message, so an
// unbroken chain of agents @mentioning each other can't run forever. This
// is deliberately a simple global depth cap per cascade, not full
// per-topic round tracking (which needs real disagreement detection) —
// see the phase 5 plan doc for the honest scope statement.
const MAX_CHAIN_DEPTH = 3;
```

Replace `handleSend` with:

```typescript
  async function handleSend() {
    if (!activeThreadId || !activeThread || !composerText.trim()) return;
    const text = composerText.trim();
    addThreadMessage({ threadId: activeThreadId, speaker: composerSpeaker, content: text });
    setMessages(listThreadMessages(activeThreadId));
    setComposerText('');

    const agentIds = AGENT_PROFILES.map((p: { id: string }) => p.id);
    const mentions = parseMentions(text, agentIds);
    let respondingAgents = mentions.length > 0
      ? mentions.filter((agentId) => agentId !== composerSpeaker)
      : (composerSpeaker !== 'alphonso' ? ['alphonso'] : []);

    if (respondingAgents.length === 0) return;

    setFacilitatorPending(true);
    const alreadyResponded = new Set<string>();
    let hopsUsed = 0;

    while (respondingAgents.length > 0) {
      const agentId = respondingAgents.shift() as string;
      if (alreadyResponded.has(agentId)) continue;

      if (hopsUsed >= MAX_CHAIN_DEPTH) {
        addThreadMessage({
          threadId: activeThreadId,
          speaker: 'alphonso',
          content: `The conversation reached ${MAX_CHAIN_DEPTH} chained replies without stopping — further @mentions won't auto-trigger. Reply directly to keep it going, or make a call on where this should land.`,
          kind: 'escalation'
        });
        setMessages(listThreadMessages(activeThreadId));
        break;
      }

      alreadyResponded.add(agentId);
      hopsUsed += 1;

      const priorMessages = listThreadMessages(activeThreadId).map((m) => ({ speaker: m.speaker, content: m.content }));
      const result = await generateAgentResponse({
        agentId,
        topic: activeThread.topic,
        priorMessages,
        newMessageText: text
      });
      const replyText = result.ok ? result.text : `${agentId} couldn't respond: ${result.error}`;
      addThreadMessage({ threadId: activeThreadId, speaker: agentId, content: replyText });
      setMessages(listThreadMessages(activeThreadId));

      if (result.ok) {
        const chainedMentions = parseMentions(replyText, agentIds).filter(
          (id) => id !== agentId && !alreadyResponded.has(id)
        );
        respondingAgents.push(...chainedMentions);
      }
    }
    setFacilitatorPending(false);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/boardroomChatView.test.jsx`
Expected: PASS (14 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/components/BoardroomChatView.tsx src/test/boardroomChatView.test.jsx
git commit -m "feat(boardroom): bounded @mention chaining with a hard round cap + escalation"
```

---

## Task 3: Full-suite verification

- [ ] **Step 1: Run the full affected test set**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts src/test/services/boardroomFacilitatorService.test.ts src/test/boardroomChatView.test.jsx src/test/appLazyImports.test.js`
Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Manually reason through the loop-termination proof, don't just trust the test**

The `while` loop terminates because: (a) `respondingAgents` only grows via
`chainedMentions`, which excludes any agent already in `alreadyResponded`;
(b) there are only 9 possible agent ids total, so `alreadyResponded` can
grow at most 9 times before every mentionable agent is exhausted; (c)
independently of (b), `hopsUsed` is strictly incremented every real
generation call and the loop hard-stops the moment it reaches
`MAX_CHAIN_DEPTH`, regardless of queue size. Both are independent
termination guarantees — even if (a)/(b)'s dedup logic had a bug, (c)
alone bounds total generation calls to `MAX_CHAIN_DEPTH`.

---

## Explicitly NOT in this phase

- Real disagreement detection between agents — the escalation trigger is
  purely "hit the round cap," not "two agents actually disagree"
- Showing both agents' positions side by side on the escalation card
- A way for the user to reply to an escalation and have that resume the
  chain from where it stopped — for now the thread just sits there,
  ready for the user to type a normal follow-up message
- Per-topic/per-pair round tracking — this is a single global depth
  counter per message cascade, reset on each new user message
- Making `MAX_CHAIN_DEPTH` user-configurable in Settings — spec 1.10.2
  wants this eventually, currently a hardcoded constant with a comment
  explaining why, not wired to any UI
