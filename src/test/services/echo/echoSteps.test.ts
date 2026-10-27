// Agent phase 7 (Echo): his own steps — save, recall, forget.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const llm = vi.fn();
vi.mock('../../../lib/ollama', () => ({ generateAgentLlmResponse: (...a: unknown[]) => llm(...a) }));
vi.mock('../../../services/memoryGraphService', () => ({ addNode: vi.fn(async () => null), addEdge: vi.fn(async () => null) }));
vi.mock('../../../services/chromaDbService', () => ({ isChromaHealthy: vi.fn(async () => false), semanticSearchMemory: vi.fn(async () => null), addMemoryToChroma: vi.fn(async () => undefined) }));

import { extractDecisions, runEchoStep, NOTHING_TO_REMEMBER } from '../../../services/echo/echoSteps';
import { addDecision, listDecisions, getDecision } from '../../../services/echo/decisions';

const say = (o: unknown) => ({ response: typeof o === 'string' ? o : JSON.stringify(o) });
const input = (request: string, extra: Record<string, unknown> = {}) => ({ instruction: '', request, needs: [], others: [], memory: '', review: null, skill: null, ...extra }) as never;
const ctx = (extra: Record<string, unknown> = {}) => ({ commandId: 'c1', requestId: 'r1', surface: 'chat', packetId: 'pkt-1', ...extra }) as never;
const step = (actionType: string) => ({ stepId: 'echo', agent: 'echo', actionType }) as never;
const launch = () => addDecision({ kind: 'decision', text: 'The launch is on Friday the 14th at $29.', topics: ['launch', 'price'], source: { surface: 'chat', by: 'you' } } as never);

beforeEach(() => {
  localStorage.clear();
  llm.mockReset();
});

describe('saving', () => {
  it('"Remember that our launch is on Friday the 14th and the price is $29." saves one decision', async () => {
    llm.mockResolvedValueOnce(say({ decisions: [{ kind: 'decision', text: 'The launch is on Friday the 14th; the price is $29.', topics: ['launch', 'price'] }] }));
    const r = await runEchoStep(step('memory_preservation'), input('Remember that our launch is on Friday the 14th and the price is $29.'), ctx());
    expect(r.resultState).toBe('completed');
    expect(r.summary).toBe('Remembered: The launch is on Friday the 14th; the price is $29.');
    expect(listDecisions()[0]).toMatchObject({ kind: 'decision', source: { surface: 'chat', requestId: 'r1', by: 'you' } });
    expect(r.artifacts).toEqual([{ type: 'echo_decision', id: listDecisions()[0].id }]);
  });

  it('nothing decided → nothing saved', async () => {
    llm.mockResolvedValueOnce(say({ decisions: [] }));
    const r = await runEchoStep(step('memory_preservation'), input('Tell me a joke'), ctx());
    expect(r.summary).toBe(NOTHING_TO_REMEMBER);
    expect(listDecisions()).toEqual([]);
  });

  it('unreadable twice → the step fails and nothing is saved', async () => {
    llm.mockResolvedValue(say('not json'));
    const r = await runEchoStep(step('memory_preservation'), input('Remember X'), ctx());
    expect(r.resultState).toBe('failed');
    expect(r.summary.startsWith("Echo couldn't save what was decided:")).toBe(true);
    expect(listDecisions()).toEqual([]);
    expect(llm).toHaveBeenCalledTimes(2);
  });

  it('a replaces id he was not shown changes nothing (Review Focus 2)', async () => {
    const a = launch();
    llm.mockResolvedValueOnce(say({ decisions: [{ kind: 'decision', text: 'Price is $35.', topics: ['price'], replaces: 'invented-id' }] }));
    await extractDecisions({ request: 'Remember the price is $35', work: '', surface: 'chat' });
    expect(getDecision(a.id)!.status).toBe('active');
  });

  it('a replaces id he was shown marks the old one replaced', async () => {
    const a = launch();
    llm.mockImplementationOnce(async (_agent: string, opts: any) => {
      expect(opts.prompt).toContain(a.id);
      return say({ decisions: [{ kind: 'decision', text: 'The launch moved to Saturday the 15th.', topics: ['launch'], replaces: a.id }] });
    });
    await extractDecisions({ request: 'Remember the launch moved to Saturday the 15th', work: '', surface: 'chat' });
    expect(getDecision(a.id)!.status).toBe('replaced');
  });

  it('calls his model with no model or endpoint of his own, and his packet as the session', async () => {
    llm.mockResolvedValueOnce(say({ decisions: [] }));
    await runEchoStep(step('memory_preservation'), input('Remember nothing'), ctx());
    const opts = llm.mock.calls[0][1];
    expect(llm.mock.calls[0][0]).toBe('echo');
    expect(opts.model).toBeUndefined();
    expect(opts.endpoint).toBeUndefined();
    expect(opts.sessionId).toBeTruthy();
  });
});

// Found in the real app (2026-10-26).
describe('saving: what the real run showed', () => {
  it('a decision that just copies the work is not saved, nor one already saved', async () => {
    launch();
    const email = 'Dear Sam, The launch is on Friday the 14th and the price is $29. Let me know if you need anything!';
    llm.mockResolvedValueOnce(say({ decisions: [
      { kind: 'decision', text: email, topics: ['email'] },
      { kind: 'decision', text: 'The launch is on Friday the 14th at $29.', topics: ['launch'] },
    ] }));
    const out = await extractDecisions({ request: 'Write a short email to Sam about the launch.', work: `[alphonso] ${email}\n\nBest regards, Alphonso`, surface: 'chat' } as never);
    expect(out).toEqual({ ok: true, saved: [] });
    expect(listDecisions()).toHaveLength(1);
  });

  it('"Remember that …" is saved without those words', async () => {
    llm.mockResolvedValueOnce(say({ decisions: [{ kind: 'decision', text: 'Remember that our launch is on Friday the 14th.', topics: ['launch'] }] }));
    await runEchoStep(step('memory_preservation'), input('Remember that our launch is on Friday the 14th.'), ctx());
    expect(listDecisions()[0].text).toBe('Our launch is on Friday the 14th.');
  });

  it('you asked to remember and his model saves nothing: asked once more, then your words are kept', async () => {
    launch();
    llm.mockResolvedValueOnce(say({ decisions: [] })).mockResolvedValueOnce(say({ decisions: [] }));
    const r = await runEchoStep(step('memory_preservation'), input('Remember that the launch moved to Saturday the 15th.'), ctx());
    expect(String(llm.mock.calls[1][1].prompt)).toContain('The user asked you to remember something');
    expect(r.summary).toBe('Remembered: The launch moved to Saturday the 15th.');
    expect(listDecisions().find((d) => d.kind === 'instruction')).toMatchObject({ text: 'The launch moved to Saturday the 15th.', source: { by: 'you' } });
  });

  it('the retry for a remember request can still replace a saved decision', async () => {
    const old = launch();
    llm.mockResolvedValueOnce(say({ decisions: [] }))
      .mockResolvedValueOnce(say({ decisions: [{ kind: 'decision', text: 'The launch is on Saturday the 15th.', topics: ['launch'], replaces: old.id }] }));
    await runEchoStep(step('memory_preservation'), input('Remember that the launch moved to Saturday the 15th.'), ctx());
    expect(getDecision(old.id)!.status).toBe('replaced');
  });
});

describe('saving: the second real run', () => {
  it('a near-repeat of a saved decision is not saved; a different date or price is', async () => {
    addDecision({ kind: 'decision', text: 'Our launch is on Friday the 14th at $29.', topics: ['launch'], source: { surface: 'chat', by: 'you' } } as never);
    addDecision({ kind: 'preference', text: 'I prefer short emails without emojis', topics: ['email'], appliesTo: ['all'], source: { surface: 'chat', by: 'you' } } as never);
    llm.mockResolvedValueOnce(say({ decisions: [
      { kind: 'decision', text: 'The launch is on Friday the 14th at $29.', topics: ['launch'] },
      { kind: 'preference', text: 'Short email without emojis', topics: ['email'] },
      { kind: 'decision', text: 'The price is $35.', topics: ['price'] },
    ] })).mockResolvedValue(say({ replaces: null }));
    const out: any = await extractDecisions({ request: 'Write a short email to Sam about the launch.', work: '[alphonso] Dear Sam …', surface: 'chat' } as never);
    expect(out.saved.map((d: any) => d.text)).toEqual(['The price is $35.']);
  });

  it('a new decision on a saved topic is checked once more for what it replaces', async () => {
    const old = launch();
    llm.mockResolvedValueOnce(say({ decisions: [{ kind: 'decision', text: 'The launch moved to Saturday the 15th.', topics: ['launch'] }] }))
      .mockResolvedValueOnce(say({ replaces: old.id }));
    await runEchoStep(step('memory_preservation'), input('Remember that the launch moved to Saturday the 15th.'), ctx());
    expect(String(llm.mock.calls[1][1].prompt)).toContain(old.id);
    expect(getDecision(old.id)).toMatchObject({ status: 'replaced' });
  });

  it("a replaces answer naming an id he wasn't shown changes nothing", async () => {
    const old = launch();
    llm.mockResolvedValueOnce(say({ decisions: [{ kind: 'decision', text: 'The launch moved to Saturday the 15th.', topics: ['launch'] }] }))
      .mockResolvedValueOnce(say({ replaces: 'made-up' }));
    await runEchoStep(step('memory_preservation'), input('Remember that the launch moved to Saturday the 15th.'), ctx());
    expect(getDecision(old.id)!.status).toBe('active');
  });

  it("the answer format's own hint is never saved as a decision", async () => {
    llm.mockResolvedValueOnce(say({ decisions: [{ kind: 'decision', text: 'one plain sentence', topics: [] }] }));
    const r = await runEchoStep(step('memory_preservation'), input('Tell me a joke'), ctx());
    expect(r.summary).toBe(NOTHING_TO_REMEMBER);
  });
});

describe('forget: what the real run showed', () => {
  it('unclear with one id named → every possible match is offered, the named one first', async () => {
    const a = launch();
    const b = addDecision({ kind: 'decision', text: 'The launch party is at the shop.', topics: ['launch', 'party'], source: { surface: 'chat', by: 'you' } } as never);
    llm.mockResolvedValueOnce(say({ forget: [b.id], unclear: true }));
    const r: any = await runEchoStep(step('memory_forget'), input('/jose Forget the launch decision'), ctx());
    expect(r.resultState).toBe('setup_required');
    expect(r.stepFields.decisionChoices.map((c: any) => c.id)).toEqual([b.id, a.id]);
  });

  it('"/jose" is not quoted back', async () => {
    const r = await runEchoStep(step('memory_forget'), input('/jose Forget the boat trip'), ctx());
    expect(r.summary).toBe('I have nothing saved about "Forget the boat trip".');
  });
});

describe('recall', () => {
  it('nothing saved → says so and asks no model (Review Focus 1)', async () => {
    const r = await runEchoStep(step('memory_recall'), input('What did we decide about the launch?'), ctx());
    expect(r.summary.startsWith('I have nothing saved about')).toBe(true);
    expect(llm).not.toHaveBeenCalled();
  });

  // Found in the real app: the Friday decision (which also held the price) stayed active next to "moved
  // to Saturday", and the answer gave only Saturday.
  it('the records carry the time, so two the same day read in order', async () => {
    launch();
    llm.mockResolvedValueOnce(say('Friday the 14th.'));
    await runEchoStep(step('memory_recall'), input('What did we decide about the launch?'), ctx());
    expect(String(llm.mock.calls[0][1].prompt)).toMatch(/Decided \d{1,2} \w{3} \d{2}:\d{2} \(Chat\)/);
  });

  it('lists the records oldest first and says the newer one stands when two disagree', async () => {
    launch();
    await new Promise((r) => setTimeout(r, 5));
    addDecision({ kind: 'decision', text: 'The launch moved to Saturday the 15th.', topics: ['launch'], source: { surface: 'chat', by: 'you' } } as never);
    llm.mockResolvedValueOnce(say('It was Friday the 14th; it moved to Saturday the 15th.'));
    await runEchoStep(step('memory_recall'), input('What did we decide about the launch date?'), ctx());
    const prompt = String(llm.mock.calls[0][1].prompt);
    expect(prompt.indexOf('Friday the 14th')).toBeLessThan(prompt.indexOf('Saturday the 15th'));
    expect(prompt).toContain('oldest first');
    expect(prompt).toContain('the newer one stands');
  });

  it('answers from the records, with a replaced one and its history in the prompt', async () => {
    const a = launch();
    const b = addDecision({ kind: 'decision', text: 'The launch moved to Saturday the 15th.', topics: ['launch'], replaces: a.id, source: { surface: 'telegram', by: 'you' } } as never);
    llm.mockResolvedValueOnce(say('It was Friday the 14th, then moved to Saturday the 15th.'));
    const r = await runEchoStep(step('memory_recall'), input('What did we decide about the launch?'), ctx());
    const prompt = String(llm.mock.calls[0][1].prompt);
    expect(prompt).toContain('Friday the 14th');
    expect(prompt).toContain('Saturday the 15th');
    expect(prompt).toContain('replaced');
    expect(r.summary).toBe('It was Friday the 14th, then moved to Saturday the 15th.');
    expect(b.id).toBeTruthy();
  });

  it("his model failing still gives the records, nothing made up", async () => {
    launch();
    llm.mockRejectedValueOnce(new Error('down'));
    const r = await runEchoStep(step('memory_recall'), input('What did we decide about the launch?'), ctx());
    expect(r.summary).toContain('The launch is on Friday the 14th at $29.');
  });
});

describe('forget', () => {
  it('a clear match is forgotten', async () => {
    const a = launch();
    llm.mockResolvedValueOnce(say({ forget: [a.id] }));
    const r = await runEchoStep(step('memory_forget'), input('Forget the launch decision'), ctx());
    expect(r.summary).toBe('Forgot: The launch is on Friday the 14th at $29.');
    expect(getDecision(a.id)!.status).toBe('forgotten');
  });

  // Found in the real app: with five launch decisions, the model called "the launch decision" clear.
  it('several matches and the request names only the topic → asks, even when his model calls it clear', async () => {
    const a = launch();
    const b = addDecision({ kind: 'decision', text: 'The launch party is at the shop.', topics: ['launch'], source: { surface: 'chat', by: 'you' } } as never);
    llm.mockResolvedValueOnce(say({ forget: [a.id], unclear: false }));
    const r: any = await runEchoStep(step('memory_forget'), input('Forget the launch decision'), ctx());
    expect(r.resultState).toBe('setup_required');
    expect(r.stepFields.decisionChoices.map((c: any) => c.id)).toEqual([a.id, b.id]);
    expect(getDecision(a.id)!.status).toBe('active');
  });

  it('several matches but the request says which → forgotten directly', async () => {
    launch();
    const venue = addDecision({ kind: 'decision', text: 'The launch venue is the Blue Room.', topics: ['launch', 'venue'], source: { surface: 'chat', by: 'you' } } as never);
    llm.mockResolvedValueOnce(say({ forget: [venue.id] }));
    const r = await runEchoStep(step('memory_forget'), input('Forget that the venue is the Blue Room'), ctx());
    expect(r.summary).toBe('Forgot: The launch venue is the Blue Room.');
  });

  it('two possible matches → the step waits with a button for each, nothing forgotten', async () => {
    const a = launch();
    const b = addDecision({ kind: 'decision', text: 'The launch party is at the shop.', topics: ['launch'], source: { surface: 'chat', by: 'you' } } as never);
    llm.mockResolvedValueOnce(say({ forget: [a.id, b.id], unclear: true }));
    const r: any = await runEchoStep(step('memory_forget'), input('Forget the launch decision'), ctx());
    expect(r.resultState).toBe('setup_required');
    expect(r.summary).toBe('Which one should I forget?');
    expect(r.stepFields.decisionChoices.map((c: any) => c.id).sort()).toEqual([a.id, b.id].sort());
    expect(listDecisions()).toHaveLength(2);
  });

  it('the one you picked is forgotten', async () => {
    const a = launch();
    const r = await runEchoStep(step('memory_forget'), input('Forget the launch decision'), ctx({ requestStep: { forgetId: a.id } }));
    expect(r.summary).toBe('Forgot: The launch is on Friday the 14th at $29.');
    expect(llm).not.toHaveBeenCalled();
  });

  it('nothing matches → says so', async () => {
    const r = await runEchoStep(step('memory_forget'), input('Forget the tea order'), ctx());
    expect(r.summary.startsWith('I have nothing saved about')).toBe(true);
  });
});
