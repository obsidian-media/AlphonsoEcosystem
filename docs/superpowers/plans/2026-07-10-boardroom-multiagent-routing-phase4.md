# Boardroom Multi-Agent @Mention Routing — Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a message `@mentions` one or more of the 9 agents, each
mentioned agent generates a real reply via Ollama and posts it into the
thread — the "route to that agent" half of spec 1.3, generalized from
Phase 3's Alphonso-only facilitator to any agent. This is deliberately one
hop only: if a mentioned agent's own generated reply itself contains an
`@mention`, nothing auto-triggers further generation in this phase. That
chaining is the critique/debate-loop engine (spec 1.4, 1.10.2), which needs
its own round-counter and escalation safeguard — building it un-bounded
here would risk exactly the runaway-loop failure mode the spec explicitly
warns against.

**Messaging-primitive decision (resolves the Step 0 open question):**
Boardroom's in-thread multi-agent chat does **not** route through
`agentBusService` (packet/approval-gated execution) or `a2aProtocolService`
(async task delegation with polling). Both model a fundamentally different
concern — governed execution of real actions — not "post a generated chat
message." Boardroom keeps its own thread-message model
(`boardroomThreadService.ts`) as the single source of truth; agent
generation is a pure function that reads thread context and returns text,
same shape as Phase 3's Alphonso facilitator.

**Architecture:** Generalize `boardroomFacilitatorService.ts`'s
Alphonso-specific function into `generateAgentResponse({agentId, topic,
priorMessages, newMessageText})`, building a per-agent persona prompt from
`agentRegistry.js`'s existing profile data (`role`, `title`) instead of a
hardcoded Alphonso description. `generateAlphonsoResponse` becomes a thin
back-compat wrapper so Phase 3's tests and call site keep working
unchanged. `BoardroomChatView.tsx`'s `handleSend` calls
`generateAgentResponse` once per distinct mentioned agent, sequentially
(not parallel — keeps local LLM resource contention modest, matching the
Step 0 report's "capped-concurrent" recommendation at the lowest sensible
cap for this phase's typical 1-2 mentions).

**Tech Stack:** Same as Phase 1-3.

---

## Task 1: Generalize the facilitator to any agent

**Files:**
- Modify: `src/services/boardroomFacilitatorService.ts`
- Test: `src/test/services/boardroomFacilitatorService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/test/services/boardroomFacilitatorService.test.ts, inside
// the existing describe('generateAlphonsoResponse', ...) block's parent
// describe('boardroomFacilitatorService', ...), as a new sibling describe

  describe('generateAgentResponse', () => {
    it('builds a persona prompt using the target agent\'s real role from agentRegistry, not a hardcoded Alphonso description', async () => {
      const ollama = await import('../../lib/ollama');
      (ollama.generateOllamaResponse as any).mockResolvedValue({ response: 'On it — checking sources now.', done: true });

      const { generateAgentResponse } = await import('../../services/boardroomFacilitatorService');
      const result = await generateAgentResponse({
        agentId: 'hector',
        topic: 'Q3 Growth Plan',
        priorMessages: [],
        newMessageText: '@Hector can you research current market signals?'
      });

      expect(result.ok).toBe(true);
      expect(result.text).toBe('On it — checking sources now.');
      const promptArg = (ollama.generateOllamaResponse as any).mock.calls[0][0].prompt;
      expect(promptArg.toLowerCase()).toContain('hector');
      expect(promptArg.toLowerCase()).toContain('research');
    });

    it('falls back to a generic persona for an unknown agent id rather than throwing', async () => {
      const ollama = await import('../../lib/ollama');
      (ollama.generateOllamaResponse as any).mockResolvedValue({ response: 'ok', done: true });

      const { generateAgentResponse } = await import('../../services/boardroomFacilitatorService');
      const result = await generateAgentResponse({
        agentId: 'nonexistent',
        topic: 'Test',
        priorMessages: [],
        newMessageText: 'hi'
      });

      expect(result.ok).toBe(true);
    });

    it('propagates errors the same way generateAlphonsoResponse does', async () => {
      const ollama = await import('../../lib/ollama');
      (ollama.generateOllamaResponse as any).mockRejectedValue(new Error('Ollama is not running'));

      const { generateAgentResponse } = await import('../../services/boardroomFacilitatorService');
      const result = await generateAgentResponse({
        agentId: 'maria',
        topic: 'Test',
        priorMessages: [],
        newMessageText: 'hi'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Ollama is not running');
    });
  });

  describe('generateAlphonsoResponse (back-compat wrapper)', () => {
    it('still works exactly as before — delegates to generateAgentResponse with agentId alphonso', async () => {
      const ollama = await import('../../lib/ollama');
      (ollama.generateOllamaResponse as any).mockResolvedValue({ response: 'facilitator reply', done: true });

      const { generateAlphonsoResponse } = await import('../../services/boardroomFacilitatorService');
      const result = await generateAlphonsoResponse({ topic: 'Test', priorMessages: [], newMessageText: 'hi' });

      expect(result.ok).toBe(true);
      expect(result.text).toBe('facilitator reply');
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/services/boardroomFacilitatorService.test.ts`
Expected: FAIL — `generateAgentResponse is not a function`

- [ ] **Step 3: Implement `generateAgentResponse` and the back-compat wrapper**

In `src/services/boardroomFacilitatorService.ts`, replace the entire file
content with:

```typescript
import { generateOllamaResponse, DEFAULT_OLLAMA_ENDPOINT } from '../lib/ollama';
import { listAgentProfiles } from '../agents/agentRegistry';

const DEFAULT_MODEL = 'llama3.2:3b';

interface FacilitatorMessage {
  speaker: string;
  content: string;
}

export interface FacilitatorResult {
  ok: boolean;
  text: string;
  error?: string;
}

interface AgentProfileLike {
  id: string;
  name: string;
  title?: string;
  role?: string;
}

function findAgentProfile(agentId: string): AgentProfileLike {
  const profiles = listAgentProfiles() as AgentProfileLike[];
  const found = profiles.find((p) => p.id === agentId);
  if (found) return found;
  return { id: agentId, name: agentId, title: 'Agent', role: 'A general-purpose Boardroom participant.' };
}

function buildAgentSystemPrompt(agentId: string): string {
  const profile = findAgentProfile(agentId);
  const isFacilitator = agentId === 'alphonso';
  const facilitatorClause = isFacilitator
    ? `\n\nWhen a message arrives with no @mention, you respond first. Either answer directly if it's something you can genuinely help with, or say plainly who else should weigh in and why, using an @mention (e.g. "@Hector, can you research the current market signals here?") — do not silently do another agent's job.`
    : '';
  return `You are ${profile.name}, a participant in Alphonso's Boardroom — a multi-agent chat where you, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, and Nova collaborate with the user (Shayan) on real decisions.

Your role: ${profile.title || profile.role || 'Boardroom participant'}. ${profile.role && profile.role !== profile.title ? profile.role : ''}${facilitatorClause}

Be concise and direct, like a real colleague in a live chat, not a formal report. Do not pad with disclaimers. Only speak from your own area of expertise — if something is outside your role, say who should handle it instead of guessing.`;
}

export function buildFacilitatorPrompt({
  topic,
  priorMessages,
  newMessageText,
  agentId = 'alphonso'
}: {
  topic: string;
  priorMessages: FacilitatorMessage[];
  newMessageText: string;
  agentId?: string;
}): string {
  const historyLines = priorMessages.map((m) => `${m.speaker}: ${m.content}`).join('\n');
  return [
    buildAgentSystemPrompt(agentId),
    '',
    `Thread topic: ${topic}`,
    historyLines ? `\nConversation so far:\n${historyLines}` : '',
    `\nuser: ${newMessageText}`,
    `\n${agentId}:`
  ].join('\n');
}

export async function generateAgentResponse({
  agentId,
  topic,
  priorMessages,
  newMessageText,
  endpoint = DEFAULT_OLLAMA_ENDPOINT,
  model = DEFAULT_MODEL
}: {
  agentId: string;
  topic: string;
  priorMessages: FacilitatorMessage[];
  newMessageText: string;
  endpoint?: string;
  model?: string;
}): Promise<FacilitatorResult> {
  const prompt = buildFacilitatorPrompt({ topic, priorMessages, newMessageText, agentId });
  try {
    const result = await generateOllamaResponse({ endpoint, model, prompt });
    return { ok: true, text: (result?.response || '').trim() };
  } catch (error) {
    return { ok: false, text: '', error: (error as Error)?.message || String(error) };
  }
}

export async function generateAlphonsoResponse(params: {
  topic: string;
  priorMessages: FacilitatorMessage[];
  newMessageText: string;
  endpoint?: string;
  model?: string;
}): Promise<FacilitatorResult> {
  return generateAgentResponse({ ...params, agentId: 'alphonso' });
}
```

Note this removes the old standalone `FACILITATOR_SYSTEM_PROMPT` constant
and the old `buildFacilitatorPrompt` signature (which took no `agentId`)
— the existing Phase 3 tests for `buildFacilitatorPrompt` call it without
`agentId`, which still works since it now defaults to `'alphonso'`. The
existing 3 `buildFacilitatorPrompt` tests and the 2 pre-existing
`generateAlphonsoResponse` tests must still pass unchanged — this is a
generalization, not a breaking change to the public API those tests use.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/services/boardroomFacilitatorService.test.ts`
Expected: PASS (11 tests total: 3 original prompt tests + 2 original
generateAlphonsoResponse tests + 3 new generateAgentResponse tests + 1
new back-compat wrapper test — recount against actual file once written,
this is the expected shape).

- [ ] **Step 5: Commit**

```bash
git add src/services/boardroomFacilitatorService.ts src/test/services/boardroomFacilitatorService.test.ts
git commit -m "feat(boardroom): generalize facilitator service to any of the 9 agents"
```

---

## Task 2: Trigger mentioned agents from the chat shell

**Files:**
- Modify: `src/components/BoardroomChatView.tsx`
- Test: `src/test/boardroomChatView.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// append to src/test/boardroomChatView.test.jsx, inside the existing
// describe block. Update the existing facilitator mock at the top of the
// file to also export generateAgentResponse:
//
// vi.mock('../services/boardroomFacilitatorService', () => ({
//   generateAlphonsoResponse: vi.fn().mockResolvedValue({ ok: true, text: 'default alphonso reply' }),
//   generateAgentResponse: vi.fn().mockResolvedValue({ ok: true, text: 'default agent reply' })
// }));

  it('triggers each mentioned agent to generate a reply, not just Alphonso', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockImplementation(({ agentId }: any) =>
      Promise.resolve({ ok: true, text: `${agentId} reply text` })
    );

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Routing Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Routing Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector look into this' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText('hector reply text')).toBeInTheDocument();
    expect(facilitator.generateAgentResponse).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'hector' })
    );
    expect(facilitator.generateAlphonsoResponse).not.toHaveBeenCalled();
  });

  it('triggers each of multiple mentioned agents once, in order', async () => {
    const facilitator = await import('../services/boardroomFacilitatorService');
    const calls: string[] = [];
    facilitator.generateAgentResponse.mockImplementation(({ agentId }: any) => {
      calls.push(agentId);
      return Promise.resolve({ ok: true, text: `${agentId} says hi` });
    });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Multi Routing Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Multi Routing Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector and @Jose please weigh in' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText('hector says hi');
    await screen.findByText('jose says hi');
    expect(calls).toEqual(['hector', 'jose']);
  });
```

Add `{ id: 'jose', name: 'Jose', accentColor: 'amber' }` is already present
in the top-of-file `agentRegistry` mock (it already lists jose and
hector) — no change needed there.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/boardroomChatView.test.jsx`
Expected: FAIL — `generateAgentResponse` never called, mentioned-agent
replies never appear

- [ ] **Step 3: Wire mentioned-agent routing into `handleSend`**

In `src/components/BoardroomChatView.tsx`, change the import:

```typescript
import { generateAlphonsoResponse, generateAgentResponse } from '../services/boardroomFacilitatorService';
```

to just:

```typescript
import { generateAgentResponse } from '../services/boardroomFacilitatorService';
```

(the component never called `generateAlphonsoResponse` directly — Phase 3
wired the Alphonso-only path through it, this phase replaces that call
site with the generalized function).

Replace `handleSend` with:

```typescript
  async function handleSend() {
    if (!activeThreadId || !activeThread || !composerText.trim()) return;
    const text = composerText.trim();
    addThreadMessage({ threadId: activeThreadId, speaker: composerSpeaker, content: text });
    setMessages(listThreadMessages(activeThreadId));
    setComposerText('');

    const mentions = parseMentions(text, AGENT_PROFILES.map((p: { id: string }) => p.id));
    const respondingAgents = mentions.length > 0
      ? mentions.filter((agentId) => agentId !== composerSpeaker)
      : (composerSpeaker !== 'alphonso' ? ['alphonso'] : []);

    if (respondingAgents.length === 0) return;

    setFacilitatorPending(true);
    for (const agentId of respondingAgents) {
      const priorMessages = listThreadMessages(activeThreadId).map((m) => ({ speaker: m.speaker, content: m.content }));
      const result = await generateAgentResponse({
        agentId,
        topic: activeThread.topic,
        priorMessages,
        newMessageText: text
      });
      addThreadMessage({
        threadId: activeThreadId,
        speaker: agentId,
        content: result.ok ? result.text : `${agentId} couldn't respond: ${result.error}`
      });
      setMessages(listThreadMessages(activeThreadId));
    }
    setFacilitatorPending(false);
  }
```

This preserves Phase 3's behavior exactly (no mention → Alphonso responds,
unless Alphonso itself is the speaker) while adding: any number of
mentioned agents → each one responds once, sequentially, in the order they
were mentioned. A mentioned agent that is also the message's own speaker
is excluded (an agent doesn't reply to itself).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/boardroomChatView.test.jsx`
Expected: PASS (11 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/components/BoardroomChatView.tsx src/test/boardroomChatView.test.jsx
git commit -m "feat(boardroom): route @mentioned messages to each mentioned agent, not just Alphonso"
```

---

## Task 3: Full-suite verification + live check

- [ ] **Step 1: Run the full affected test set**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts src/test/services/boardroomFacilitatorService.test.ts src/test/boardroomChatView.test.jsx src/test/appLazyImports.test.js`
Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Live verification against real Ollama**

Same pattern as Phase 3: write a throwaway test importing
`generateAgentResponse` directly with `agentId: 'hector'`, run it against
the real local Ollama instance (already confirmed reachable with
`llama3.2:3b` installed), confirm a real non-empty response, delete the
throwaway file. Do not skip this — Phase 3's live check caught a real
30-second-timeout bug that no mocked test could have found.

---

## Explicitly NOT in this phase

- Chaining: a mentioned agent's reply that itself contains an `@mention`
  does not trigger further generation
- The critique/pushback engine (spec 1.4) — agents don't yet review or
  object to each other's output
- The debate-loop round cap and "Needs your decision" escalation (1.10.1,
  1.10.2) — not needed yet since there's no chaining to cap
- Confidence scoring (1.10.9), diff view (1.10.4), regenerate (1.10.3),
  cards (1.5), stop/cancel (1.10.12)
- Parallel generation for multiple mentioned agents — sequential only,
  per the Step 0 report's capped-concurrent recommendation; true
  concurrency (with a cap) is a later optimization once real usage shows
  sequential is too slow in practice
