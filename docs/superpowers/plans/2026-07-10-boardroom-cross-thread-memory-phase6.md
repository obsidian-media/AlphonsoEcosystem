# Boardroom Cross-Thread Memory Recall — Phase 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec 1.10.7 — when an agent generates a Boardroom reply, it should
be able to recall relevant context from *other* threads, not just the
current thread's own history, so a decision made in "Q3 Pricing" can
surface when someone starts a new thread about "Renewal Terms."

**Honest scope limitation, stated up front:** Real semantic recall (embeddings,
vector search) is out of scope — `chromaDbService.ts` exists and is a real
semantic memory store, but wiring Boardroom into it is a separate, bigger
integration this phase does not attempt. What this phase builds instead: a
simple keyword-overlap search across all *other* threads' messages, scoped to
the current message text, returning the top few matches with enough score to
be non-trivial. Cheap, deterministic, testable — not smart, and not
pretending to be.

**Architecture:** A new `findCrossThreadContext()` function in
`boardroomThreadService.ts` scans every thread except the current one,
scores each message by keyword overlap with the query text, and returns the
top N. `boardroomFacilitatorService.ts`'s `buildFacilitatorPrompt` gains an
optional `crossThreadContext` param that renders as a labeled block in the
prompt when non-empty. `BoardroomChatView.tsx`'s `handleSend` calls
`findCrossThreadContext` before each generation call and passes the result
through.

**Tech Stack:** Same as Phases 1-5.

---

## Task 1: `findCrossThreadContext` in boardroomThreadService.ts

**Files:**
- Modify: `src/services/boardroomThreadService.ts`
- Test: `src/test/services/boardroomThreadService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/test/services/boardroomThreadService.test.ts, inside the existing describe block

  describe('findCrossThreadContext', () => {
    it('finds keyword-overlapping messages from other threads, excluding the current thread', () => {
      const { createThread, addThreadMessage, findCrossThreadContext } = require('../../services/boardroomThreadService');
      const pricing = createThread({ topic: 'Q3 Pricing', participants: ['jose'] });
      addThreadMessage({ threadId: pricing.id, speaker: 'jose', content: 'We decided on a tiered pricing structure for enterprise renewal contracts.' });
      const other = createThread({ topic: 'Unrelated Thread', participants: ['hector'] });
      addThreadMessage({ threadId: other.id, speaker: 'hector', content: 'Completely different market research about weather patterns.' });
      const current = createThread({ topic: 'Renewal Terms', participants: ['jose'] });

      const results = findCrossThreadContext({ excludeThreadId: current.id, queryText: 'what did we decide about renewal pricing?' });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].threadTopic).toBe('Q3 Pricing');
      expect(results.some((r) => r.threadTopic === current.id)).toBe(false);
    });

    it('returns an empty array when nothing overlaps', () => {
      const { createThread, addThreadMessage, findCrossThreadContext } = require('../../services/boardroomThreadService');
      const other = createThread({ topic: 'Zzz Thread', participants: ['hector'] });
      addThreadMessage({ threadId: other.id, speaker: 'hector', content: 'xyzzy plugh qwerty asdf.' });
      const current = createThread({ topic: 'Current Thread', participants: ['jose'] });

      const results = findCrossThreadContext({ excludeThreadId: current.id, queryText: 'completely unrelated banana topic' });

      expect(results).toEqual([]);
    });

    it('caps results at maxResults', () => {
      const { createThread, addThreadMessage, findCrossThreadContext } = require('../../services/boardroomThreadService');
      for (let i = 0; i < 5; i++) {
        const t = createThread({ topic: `Budget Thread ${i}`, participants: ['jose'] });
        addThreadMessage({ threadId: t.id, speaker: 'jose', content: 'budget budget budget planning discussion here' });
      }
      const current = createThread({ topic: 'Current', participants: ['jose'] });

      const results = findCrossThreadContext({ excludeThreadId: current.id, queryText: 'budget planning', maxResults: 3 });

      expect(results.length).toBeLessThanOrEqual(3);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts -t "findCrossThreadContext"`
Expected: FAIL — `findCrossThreadContext` is not exported

- [ ] **Step 3: Implement `findCrossThreadContext`**

Add to `src/services/boardroomThreadService.ts`, after `listThreadMessages`:

```typescript
export interface CrossThreadContextResult {
  threadId: string;
  threadTopic: string;
  speaker: string;
  content: string;
  score: number;
}

const STOPWORDS = new Set([
  'what', 'did', 'we', 'the', 'about', 'that', 'this', 'with', 'from',
  'have', 'has', 'for', 'and', 'are', 'was', 'were', 'been', 'will',
  'would', 'could', 'should', 'a', 'an', 'to', 'of', 'in', 'on', 'is', 'it'
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

export function findCrossThreadContext({
  excludeThreadId,
  queryText,
  maxResults = 3
}: {
  excludeThreadId: string;
  queryText: string;
  maxResults?: number;
}): CrossThreadContextResult[] {
  const queryKeywords = new Set(extractKeywords(queryText));
  if (queryKeywords.size === 0) return [];

  const threads = listThreads().filter((t) => t.id !== excludeThreadId);
  const scored: CrossThreadContextResult[] = [];

  for (const thread of threads) {
    const messages = listThreadMessages(thread.id);
    for (const message of messages) {
      const messageKeywords = extractKeywords(message.content);
      const score = messageKeywords.filter((w) => queryKeywords.has(w)).length;
      if (score > 0) {
        scored.push({
          threadId: thread.id,
          threadTopic: thread.topic,
          speaker: message.speaker,
          content: message.content,
          score
        });
      }
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, maxResults);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/services/boardroomThreadService.ts src/test/services/boardroomThreadService.test.ts
git commit -m "feat(boardroom): add cross-thread keyword-overlap context recall"
```

---

## Task 2: Wire recall into the facilitator prompt

**Files:**
- Modify: `src/services/boardroomFacilitatorService.ts`
- Test: `src/test/services/boardroomFacilitatorService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/test/services/boardroomFacilitatorService.test.ts, inside the existing describe block

  describe('cross-thread context in prompts', () => {
    it('includes a labeled cross-thread context block when crossThreadContext is provided', () => {
      const { buildFacilitatorPrompt } = require('../../services/boardroomFacilitatorService');
      const prompt = buildFacilitatorPrompt({
        topic: 'Renewal Terms',
        priorMessages: [],
        newMessageText: 'What did we decide on pricing?',
        agentId: 'jose',
        crossThreadContext: [
          { threadId: 't1', threadTopic: 'Q3 Pricing', speaker: 'jose', content: 'Tiered pricing decided.', score: 2 }
        ]
      });

      expect(prompt).toContain('Relevant context from other threads');
      expect(prompt).toContain('Q3 Pricing');
      expect(prompt).toContain('Tiered pricing decided.');
    });

    it('omits the cross-thread block entirely when no context is provided', () => {
      const { buildFacilitatorPrompt } = require('../../services/boardroomFacilitatorService');
      const prompt = buildFacilitatorPrompt({
        topic: 'Renewal Terms',
        priorMessages: [],
        newMessageText: 'Hello',
        agentId: 'jose'
      });

      expect(prompt).not.toContain('Relevant context from other threads');
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/services/boardroomFacilitatorService.test.ts -t "cross-thread context"`
Expected: FAIL — no such block rendered, `crossThreadContext` param doesn't exist

- [ ] **Step 3: Implement**

In `src/services/boardroomFacilitatorService.ts`, add the type import and
extend `buildFacilitatorPrompt` and `generateAgentResponse`:

```typescript
import type { CrossThreadContextResult } from './boardroomThreadService';
```

Replace `buildFacilitatorPrompt`:

```typescript
export function buildFacilitatorPrompt({
  topic,
  priorMessages,
  newMessageText,
  agentId = 'alphonso',
  crossThreadContext = []
}: {
  topic: string;
  priorMessages: FacilitatorMessage[];
  newMessageText: string;
  agentId?: string;
  crossThreadContext?: CrossThreadContextResult[];
}): string {
  const historyLines = priorMessages.map((m) => `${m.speaker}: ${m.content}`).join('\n');
  const crossThreadLines = crossThreadContext
    .map((c) => `[${c.threadTopic}] ${c.speaker}: ${c.content}`)
    .join('\n');
  return [
    buildAgentSystemPrompt(agentId),
    '',
    `Thread topic: ${topic}`,
    historyLines ? `\nConversation so far:\n${historyLines}` : '',
    crossThreadLines ? `\nRelevant context from other threads (may or may not apply — use judgment):\n${crossThreadLines}` : '',
    `\nuser: ${newMessageText}`,
    `\n${agentId}:`
  ].join('\n');
}
```

Update `generateAgentResponse` to accept and forward `crossThreadContext`:

```typescript
export async function generateAgentResponse({
  agentId,
  topic,
  priorMessages,
  newMessageText,
  crossThreadContext = [],
  endpoint = DEFAULT_OLLAMA_ENDPOINT,
  model = DEFAULT_MODEL
}: {
  agentId: string;
  topic: string;
  priorMessages: FacilitatorMessage[];
  newMessageText: string;
  crossThreadContext?: CrossThreadContextResult[];
  endpoint?: string;
  model?: string;
}): Promise<FacilitatorResult> {
  const prompt = buildFacilitatorPrompt({ topic, priorMessages, newMessageText, agentId, crossThreadContext });
  try {
    const result = await generateOllamaResponse({ endpoint, model, prompt });
    return { ok: true, text: (result?.response || '').trim() };
  } catch (error) {
    return { ok: false, text: '', error: (error as Error)?.message || String(error) };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/services/boardroomFacilitatorService.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/boardroomFacilitatorService.ts src/test/services/boardroomFacilitatorService.test.ts
git commit -m "feat(boardroom): thread facilitator prompt with cross-thread context block"
```

---

## Task 3: Wire recall into BoardroomChatView's handleSend

**Files:**
- Modify: `src/components/BoardroomChatView.tsx`
- Test: `src/test/boardroomChatView.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// append to src/test/boardroomChatView.test.jsx, inside the existing describe block

  it('passes cross-thread context to generateAgentResponse when relevant history exists in another thread', async () => {
    const threadService = await import('../services/boardroomThreadService');
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockResolvedValue({ ok: true, text: 'Based on that, yes.' });

    const otherThread = threadService.createThread({ topic: 'Q3 Pricing', participants: ['jose'] });
    threadService.addThreadMessage({ threadId: otherThread.id, speaker: 'jose', content: 'Tiered pricing decided for enterprise renewal contracts.' });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Renewal Terms' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Renewal Terms');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Jose what did we decide about renewal pricing contracts?' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText('Based on that, yes.');
    expect(facilitator.generateAgentResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        crossThreadContext: expect.arrayContaining([
          expect.objectContaining({ threadTopic: 'Q3 Pricing' })
        ])
      })
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/boardroomChatView.test.jsx -t "passes cross-thread context"`
Expected: FAIL — `generateAgentResponse` never called with `crossThreadContext`

- [ ] **Step 3: Implement**

In `src/components/BoardroomChatView.tsx`, add `findCrossThreadContext` to
the import from `boardroomThreadService`:

```typescript
import {
  createThread,
  listThreads,
  listThreadMessages,
  addThreadMessage,
  migrateLegacySessions,
  parseMentions,
  findCrossThreadContext,
  type BoardroomThread,
  type BoardroomThreadMessage
} from '../services/boardroomThreadService';
```

In `handleSend`, inside the `while` loop, add the recall call right before
`generateAgentResponse` and pass it through:

```typescript
      const priorMessages = listThreadMessages(activeThreadId).map((m) => ({ speaker: m.speaker, content: m.content }));
      const crossThreadContext = findCrossThreadContext({ excludeThreadId: activeThreadId, queryText: text });
      const result = await generateAgentResponse({
        agentId,
        topic: activeThread.topic,
        priorMessages,
        newMessageText: text,
        crossThreadContext
      });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/boardroomChatView.test.jsx`
Expected: PASS (all tests, 15 total).

- [ ] **Step 5: Commit**

```bash
git add src/components/BoardroomChatView.tsx src/test/boardroomChatView.test.jsx
git commit -m "feat(boardroom): wire cross-thread context recall into message send"
```

---

## Task 4: Full verification

- [ ] **Step 1: Run the full affected test set**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts src/test/services/boardroomFacilitatorService.test.ts src/test/boardroomChatView.test.jsx src/test/appLazyImports.test.js`
Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors (pre-existing unrelated `ChatView.tsx` console warning is not in scope).

---

## Explicitly NOT in this phase

- Real semantic/embedding-based recall via `chromaDbService.ts` — this is
  pure keyword overlap, no vector search
- Recall ranking beyond simple keyword-count score (no recency weighting,
  no thread-importance weighting)
- Surfacing cross-thread context visibly in the UI (e.g. a "referenced
  from Q3 Pricing" chip on the message) — the recall only feeds the LLM
  prompt, it is not shown to the user directly
- Configurable `maxResults` or a relevance threshold in Settings
