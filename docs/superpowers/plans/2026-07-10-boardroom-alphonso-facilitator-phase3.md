# Boardroom Alphonso Facilitator — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user posts a message to a Boardroom thread with no `@mention`,
Alphonso responds automatically as the front-of-room facilitator — the first
real AI generation in Boardroom, fulfilling the remaining half of spec 1.3
("A message with no @mention goes to the room — Alphonso responds first").
Other agents generating replies, agent-to-agent handoffs, and the critique
engine are still out of scope — those need the messaging-primitive
reconciliation flagged in the Step 0 report, which this phase deliberately
does not touch.

**Architecture:** New `boardroomFacilitatorService.ts` with a pure,
network-free prompt-builder (`buildFacilitatorPrompt`) and a thin async
wrapper (`generateAlphonsoResponse`) around the existing
`generateOllamaResponse()` in `src/lib/ollama.js` — reused, not
reimplemented. `BoardroomChatView.tsx` calls it after `handleSend` whenever
the posted message has zero `parseMentions()` matches, shows a "Alphonso is
thinking…" indicator while pending, and posts the reply (or a visible
failure message on error — never a silent swallow) as a new thread message.

**Tech Stack:** Same as Phase 1/2, plus `src/lib/ollama.js`'s
`generateOllamaResponse` (already used elsewhere in the app; not new
infrastructure).

---

## Task 1: Facilitator prompt builder + Ollama call wrapper

**Files:**
- Create: `src/services/boardroomFacilitatorService.ts`
- Test: `src/test/services/boardroomFacilitatorService.test.ts`

- [ ] **Step 1: Write the failing test for `buildFacilitatorPrompt`**

```typescript
// src/test/services/boardroomFacilitatorService.test.ts
import { describe, it, expect } from 'vitest';

describe('boardroomFacilitatorService', () => {
  describe('buildFacilitatorPrompt', () => {
    it('includes the thread topic and the new message', async () => {
      const { buildFacilitatorPrompt } = await import('../../services/boardroomFacilitatorService');
      const prompt = buildFacilitatorPrompt({
        topic: 'Q3 Growth Plan',
        priorMessages: [],
        newMessageText: 'We need a plan to grow enterprise signups this quarter.'
      });
      expect(prompt).toContain('Q3 Growth Plan');
      expect(prompt).toContain('We need a plan to grow enterprise signups this quarter.');
    });

    it('includes prior message history in speaker: content format', async () => {
      const { buildFacilitatorPrompt } = await import('../../services/boardroomFacilitatorService');
      const prompt = buildFacilitatorPrompt({
        topic: 'Test',
        priorMessages: [
          { speaker: 'user', content: 'First question' },
          { speaker: 'alphonso', content: 'First answer' }
        ],
        newMessageText: 'Follow-up question'
      });
      expect(prompt).toContain('user: First question');
      expect(prompt).toContain('alphonso: First answer');
      expect(prompt).toContain('Follow-up question');
    });

    it('instructs Alphonso to name other agents when relevant, not just answer directly', async () => {
      const { buildFacilitatorPrompt } = await import('../../services/boardroomFacilitatorService');
      const prompt = buildFacilitatorPrompt({ topic: 'Test', priorMessages: [], newMessageText: 'hi' });
      expect(prompt.toLowerCase()).toContain('@hector');
      expect(prompt.toLowerCase()).toContain('facilitator');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/services/boardroomFacilitatorService.test.ts`
Expected: FAIL — `Cannot find module '../../services/boardroomFacilitatorService'`

- [ ] **Step 3: Implement `buildFacilitatorPrompt`**

```typescript
// src/services/boardroomFacilitatorService.ts
import { generateOllamaResponse, DEFAULT_OLLAMA_ENDPOINT } from '../lib/ollama';

const DEFAULT_MODEL = 'llama3.2:3b';

const FACILITATOR_SYSTEM_PROMPT = `You are Alphonso, the front-of-room facilitator in Alphonso's Boardroom — a multi-agent chat where you, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, and Nova collaborate with the user (Shayan) on real decisions.

When a message arrives with no @mention, you respond first. Either:
1. Answer directly if it's something you can genuinely help with, or
2. Say plainly who else should weigh in and why, using an @mention (e.g. "@Hector, can you research the current market signals here?") — do not silently do another agent's job.

Be concise and direct, like a real colleague in a live chat, not a formal report. Do not pad with disclaimers.`;

interface FacilitatorMessage {
  speaker: string;
  content: string;
}

export function buildFacilitatorPrompt({
  topic,
  priorMessages,
  newMessageText
}: {
  topic: string;
  priorMessages: FacilitatorMessage[];
  newMessageText: string;
}): string {
  const historyLines = priorMessages.map((m) => `${m.speaker}: ${m.content}`).join('\n');
  return [
    FACILITATOR_SYSTEM_PROMPT,
    '',
    `Thread topic: ${topic}`,
    historyLines ? `\nConversation so far:\n${historyLines}` : '',
    `\nuser: ${newMessageText}`,
    '\nalphonso:'
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/services/boardroomFacilitatorService.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for `generateAlphonsoResponse`**

```typescript
// append to src/test/services/boardroomFacilitatorService.test.ts, inside the same describe block

vi.mock('../../lib/ollama', async () => {
  const actual = await vi.importActual('../../lib/ollama');
  return {
    ...actual,
    generateOllamaResponse: vi.fn()
  };
});

  describe('generateAlphonsoResponse', () => {
    it('calls generateOllamaResponse with the built prompt and returns the response text', async () => {
      const ollama = await import('../../lib/ollama');
      (ollama.generateOllamaResponse as any).mockResolvedValue({ response: 'Got it — pulling in Hector.', done: true });

      const { generateAlphonsoResponse } = await import('../../services/boardroomFacilitatorService');
      const result = await generateAlphonsoResponse({
        topic: 'Q3 Growth Plan',
        priorMessages: [],
        newMessageText: 'We need a plan.'
      });

      expect(result.ok).toBe(true);
      expect(result.text).toBe('Got it — pulling in Hector.');
      expect(ollama.generateOllamaResponse).toHaveBeenCalledWith(
        expect.objectContaining({ model: expect.any(String), prompt: expect.stringContaining('We need a plan.') })
      );
    });

    it('returns ok:false with an error message when Ollama call throws', async () => {
      const ollama = await import('../../lib/ollama');
      (ollama.generateOllamaResponse as any).mockRejectedValue(new Error('Ollama is not running'));

      const { generateAlphonsoResponse } = await import('../../services/boardroomFacilitatorService');
      const result = await generateAlphonsoResponse({
        topic: 'Test',
        priorMessages: [],
        newMessageText: 'hi'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Ollama is not running');
    });
  });
```

Add `import { vi } from 'vitest';` to the top-level `vitest` import in the
test file (alongside `describe, it, expect`).

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/test/services/boardroomFacilitatorService.test.ts`
Expected: FAIL — `generateAlphonsoResponse is not a function`

- [ ] **Step 7: Implement `generateAlphonsoResponse`**

```typescript
// append to src/services/boardroomFacilitatorService.ts

export interface FacilitatorResult {
  ok: boolean;
  text: string;
  error?: string;
}

export async function generateAlphonsoResponse({
  topic,
  priorMessages,
  newMessageText,
  endpoint = DEFAULT_OLLAMA_ENDPOINT,
  model = DEFAULT_MODEL
}: {
  topic: string;
  priorMessages: FacilitatorMessage[];
  newMessageText: string;
  endpoint?: string;
  model?: string;
}): Promise<FacilitatorResult> {
  const prompt = buildFacilitatorPrompt({ topic, priorMessages, newMessageText });
  try {
    const result = await generateOllamaResponse({ endpoint, model, prompt });
    return { ok: true, text: (result?.response || '').trim() };
  } catch (error) {
    return { ok: false, text: '', error: (error as Error)?.message || String(error) };
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/test/services/boardroomFacilitatorService.test.ts`
Expected: PASS (5 tests total)

- [ ] **Step 9: Commit**

```bash
git add src/services/boardroomFacilitatorService.ts src/test/services/boardroomFacilitatorService.test.ts
git commit -m "feat(boardroom): add Alphonso facilitator prompt builder + Ollama call wrapper"
```

---

## Task 2: Wire into the chat shell

**Files:**
- Modify: `src/components/BoardroomChatView.tsx`
- Test: `src/test/boardroomChatView.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// append to src/test/boardroomChatView.test.jsx, inside the existing describe block, and add
// this mock near the top of the file alongside the existing agentRegistry mock:
//
// vi.mock('../services/boardroomFacilitatorService', () => ({
//   generateAlphonsoResponse: vi.fn()
// }));

  it('triggers Alphonso auto-response when a message has no @mention', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAlphonsoResponse.mockResolvedValue({ ok: true, text: 'Got it — pulling in Hector.' });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'No Mention Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('No Mention Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: 'We need a plan.' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText('Got it — pulling in Hector.')).toBeInTheDocument();
    expect(facilitator.generateAlphonsoResponse).toHaveBeenCalled();
  });

  it('does not trigger Alphonso auto-response when the message contains an @mention', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAlphonsoResponse.mockClear();

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Mentioned Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Mentioned Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector look into this' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText('@Hector look into this');
    expect(facilitator.generateAlphonsoResponse).not.toHaveBeenCalled();
  });

  it('shows a visible error message when Alphonso auto-response fails, not a silent swallow', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAlphonsoResponse.mockResolvedValue({ ok: false, text: '', error: 'Ollama is not running' });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Error Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Error Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText(/ollama is not running/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/boardroomChatView.test.jsx`
Expected: FAIL — Alphonso's reply never appears, `generateAlphonsoResponse` not called

- [ ] **Step 3: Wire the facilitator call into `handleSend`**

In `src/components/BoardroomChatView.tsx`, add the import:

```typescript
import { parseMentions } from '../services/boardroomThreadService';
import { generateAlphonsoResponse } from '../services/boardroomFacilitatorService';
```

Add a `facilitatorPending` state right after the existing `mentionQuery` state:

```typescript
  const [facilitatorPending, setFacilitatorPending] = useState(false);
```

Replace `handleSend` with:

```typescript
  async function handleSend() {
    if (!activeThreadId || !activeThread || !composerText.trim()) return;
    const text = composerText.trim();
    addThreadMessage({ threadId: activeThreadId, speaker: composerSpeaker, content: text });
    setMessages(listThreadMessages(activeThreadId));
    setComposerText('');

    const mentions = parseMentions(text, AGENT_PROFILES.map((p: { id: string }) => p.id));
    if (mentions.length === 0 && composerSpeaker !== 'alphonso') {
      setFacilitatorPending(true);
      const priorMessages = listThreadMessages(activeThreadId).map((m) => ({ speaker: m.speaker, content: m.content }));
      const result = await generateAlphonsoResponse({
        topic: activeThread.topic,
        priorMessages,
        newMessageText: text
      });
      addThreadMessage({
        threadId: activeThreadId,
        speaker: 'alphonso',
        content: result.ok ? result.text : `Alphonso couldn't respond: ${result.error}`
      });
      setMessages(listThreadMessages(activeThreadId));
      setFacilitatorPending(false);
    }
  }
```

Add a lightweight pending indicator right before the composer bar's closing `</div>` (inside the `activeThread ? (...)` branch, after the messages `<div>` and before the composer `<div className="flex items-center gap-2 border-t ...">`):

```tsx
            {facilitatorPending && (
              <div className="px-4 pb-1 text-xs text-[var(--text-3)]">Alphonso is thinking…</div>
            )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/boardroomChatView.test.jsx`
Expected: PASS (9 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/components/BoardroomChatView.tsx src/test/boardroomChatView.test.jsx
git commit -m "feat(boardroom): trigger Alphonso auto-response for unmentioned messages"
```

---

## Task 3: Full-suite verification

- [ ] **Step 1: Run the full affected test set**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts src/test/services/boardroomFacilitatorService.test.ts src/test/boardroomChatView.test.jsx src/test/appLazyImports.test.js`
Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Manual verification** (since this is the first real network call in Boardroom)

Run `npm run tauri dev` (or `npm run dev` with Ollama running locally on
`http://localhost:11434` with `llama3.2:3b` pulled). Open Boardroom, create
a thread, send a message with no `@mention`, confirm Alphonso actually
replies with real generated text (not a canned string) within a few
seconds, and that a genuinely @mentioned message does *not* trigger an
Alphonso auto-reply.

---

## Explicitly NOT in this phase

- Other agents (Hector, Miya, etc.) generating their own replies — only
  Alphonso-as-facilitator exists in this phase
- Real agent-to-agent handoffs — Alphonso's reply can *mention* another
  agent in text, but nothing automatically triggers that agent to respond
- Streaming responses, stop/cancel (1.10.12) — this phase uses the
  non-streaming `generateOllamaResponse`, matching the existing pending
  indicator's simplicity; streaming is a later, separate enhancement
- Confidence scoring (1.10.9), model/latency indicator (1.10.5), critique
  engine (1.4), cards (1.5), escalation (1.10.1)
- The messaging-primitive reconciliation (`agentBusService` vs
  `a2aProtocolService` vs Mission Room) — still deferred to whichever phase
  first needs real agent-to-agent delegation
