# Boardroom Confidence-Based Auto-Escalation — Phase 7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec 1.10.9 — when an agent's generated reply signals low
confidence, automatically flag it with the same "Needs your decision"
escalation treatment built in Phase 5, instead of presenting a hedgy
answer as if it were a solid one.

**Honest scope limitation, stated up front:** Ollama's `/api/generate` and
`/api/chat` endpoints do not return a real confidence score — there is no
logprob-based or model-native confidence signal available here. This
phase does not fabricate one. What it builds instead: a deterministic
hedge-language detector — a fixed list of phrases ("I'm not sure",
"unclear", "would need more context", etc.) scanned for in the agent's own
generated text. If found, the reply is still posted in full (it's real
content, not discarded), and immediately followed by an escalation message
using the exact same `kind: 'escalation'` rendering Phase 5 built. This is
a text-pattern heuristic, not genuine uncertainty quantification — stated
plainly, not oversold.

**Architecture:** `detectLowConfidence(text)` in
`boardroomFacilitatorService.ts` does the phrase scan.
`BoardroomChatView.tsx`'s `handleSend` calls it right after posting each
successful agent reply; if it returns true, an escalation message is
appended naming which agent's reply was flagged.

**Tech Stack:** Same as Phases 1-6.

---

## Task 1: `detectLowConfidence` in boardroomFacilitatorService.ts

**Files:**
- Modify: `src/services/boardroomFacilitatorService.ts`
- Test: `src/test/services/boardroomFacilitatorService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/test/services/boardroomFacilitatorService.test.ts, inside the existing describe block

  describe('detectLowConfidence', () => {
    it('flags text containing a hedging phrase', async () => {
      const { detectLowConfidence } = await import('../../services/boardroomFacilitatorService');
      expect(detectLowConfidence("I'm not sure, but it might be related to pricing.")).toBe(true);
      expect(detectLowConfidence('This is unclear without more data.')).toBe(true);
      expect(detectLowConfidence('I would need more context to answer that properly.')).toBe(true);
    });

    it('does not flag confident, direct text', async () => {
      const { detectLowConfidence } = await import('../../services/boardroomFacilitatorService');
      expect(detectLowConfidence('The Q3 pricing tier is finalized at $49/mo for the enterprise plan.')).toBe(false);
    });

    it('is case-insensitive', async () => {
      const { detectLowConfidence } = await import('../../services/boardroomFacilitatorService');
      expect(detectLowConfidence('Honestly, I DON\'T HAVE ENOUGH INFORMATION to say.')).toBe(true);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/services/boardroomFacilitatorService.test.ts -t "detectLowConfidence"`
Expected: FAIL — `detectLowConfidence` is not exported

- [ ] **Step 3: Implement**

Add to `src/services/boardroomFacilitatorService.ts`, after the imports:

```typescript
const LOW_CONFIDENCE_PHRASES = [
  "i'm not sure",
  'i am not sure',
  'not certain',
  'unclear',
  "i don't have enough information",
  'i do not have enough information',
  'hard to say',
  "can't be certain",
  'cannot be certain',
  'would need more context',
  'difficult to determine',
  'no way to know',
  "i don't know enough",
  'i do not know enough'
];

export function detectLowConfidence(text: string): boolean {
  const lower = text.toLowerCase();
  return LOW_CONFIDENCE_PHRASES.some((phrase) => lower.includes(phrase));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/services/boardroomFacilitatorService.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/boardroomFacilitatorService.ts src/test/services/boardroomFacilitatorService.test.ts
git commit -m "feat(boardroom): add hedge-language low-confidence detector"
```

---

## Task 2: Auto-escalate on low-confidence replies in BoardroomChatView

**Files:**
- Modify: `src/components/BoardroomChatView.tsx`
- Test: `src/test/boardroomChatView.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// append to src/test/boardroomChatView.test.jsx, inside the existing describe block, but
// mock detectLowConfidence too — update the top-of-file mock for boardroomFacilitatorService:
//
//   vi.mock('../services/boardroomFacilitatorService', () => ({
//     generateAlphonsoResponse: vi.fn().mockResolvedValue({ ok: true, text: 'default alphonso reply' }),
//     generateAgentResponse: vi.fn().mockResolvedValue({ ok: true, text: 'default agent reply' }),
//     detectLowConfidence: vi.fn().mockReturnValue(false)
//   }));

  it('auto-escalates when a generated reply is flagged as low confidence', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockResolvedValue({ ok: true, text: "I'm not sure about the exact figure." });
    facilitator.detectLowConfidence.mockReturnValue(true);

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Confidence Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Confidence Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector what is the exact figure?' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText("I'm not sure about the exact figure.");
    const escalation = await screen.findByText(/hector flagged low confidence/i);
    expect(escalation.closest('[data-message-kind="escalation"]')).toBeInTheDocument();
  });

  it('does not escalate when the reply is confident', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockResolvedValue({ ok: true, text: 'The figure is $49/mo.' });
    facilitator.detectLowConfidence.mockReturnValue(false);

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Confident Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Confident Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector what is the figure?' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText('The figure is $49/mo.');
    expect(screen.queryByText(/flagged low confidence/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/boardroomChatView.test.jsx -t "auto-escalates when a generated reply is flagged"`
Expected: FAIL — `detectLowConfidence` doesn't exist on the mock / no escalation posted

- [ ] **Step 3: Implement**

Update the mock at the top of `src/test/boardroomChatView.test.jsx`:

```jsx
vi.mock('../services/boardroomFacilitatorService', () => ({
  generateAlphonsoResponse: vi.fn().mockResolvedValue({ ok: true, text: 'default alphonso reply' }),
  generateAgentResponse: vi.fn().mockResolvedValue({ ok: true, text: 'default agent reply' }),
  detectLowConfidence: vi.fn().mockReturnValue(false)
}));
```

In `src/components/BoardroomChatView.tsx`, update the import:

```typescript
import { generateAgentResponse, detectLowConfidence } from '../services/boardroomFacilitatorService';
```

In `handleSend`, right after `addThreadMessage`/`setMessages` for the
agent's reply (inside the `if (result.ok)` branch, before the
`chainedMentions` computation), add:

```typescript
      if (result.ok) {
        if (detectLowConfidence(replyText)) {
          addThreadMessage({
            threadId: activeThreadId,
            speaker: 'alphonso',
            content: `${agentLabel(agentId)} flagged low confidence in that reply — needs your decision.`,
            kind: 'escalation'
          });
          setMessages(listThreadMessages(activeThreadId));
        }
        const chainedMentions = parseMentions(replyText, agentIds).filter((id) => id !== agentId);
        respondingAgents.push(...chainedMentions);
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/boardroomChatView.test.jsx`
Expected: PASS (all tests, 17 total).

- [ ] **Step 5: Commit**

```bash
git add src/components/BoardroomChatView.tsx src/test/boardroomChatView.test.jsx
git commit -m "feat(boardroom): auto-escalate low-confidence replies via hedge-language detection"
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

- Real model-native confidence/logprob scoring — Ollama doesn't expose
  this; this is a hedge-phrase heuristic only
- Escalating based on the chain-depth cap AND confidence interacting
  (e.g. suppressing a confidence escalation if a chain-cap escalation
  already fired in the same cascade) — both can fire independently and
  both are shown
- Tuning/expanding the hedge-phrase list beyond the fixed set above, or
  making it configurable
- Any UI affordance for the user to dismiss/acknowledge a confidence
  escalation differently than a chain-cap escalation — both render
  identically via the same `kind: 'escalation'` styling
