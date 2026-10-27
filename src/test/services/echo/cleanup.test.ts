// Agent phase 7: cleanup he proposes and you approve.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const llm = vi.fn();
vi.mock('../../../lib/ollama', () => ({ generateAgentLlmResponse: (...a: unknown[]) => llm(...a) }));
vi.mock('../../../services/memoryGraphService', () => ({ addNode: vi.fn(async () => null), addEdge: vi.fn(async () => null) }));
vi.mock('../../../services/chromaDbService', () => ({ isChromaHealthy: vi.fn(async () => false), semanticSearchMemory: vi.fn(async () => null), addMemoryToChroma: vi.fn(async () => undefined) }));
const notes: any[] = [];
vi.mock('../../../services/unifiedMemoryService', () => ({ listMemoryItems: () => notes }));
const submitted: any[] = [];
vi.mock('../../../services/jose/submitToJose', () => ({ submitStepsToJose: vi.fn(async (input: any) => { submitted.push(input); return { ok: true, userReport: { summary: 'Echo proposes 1 change.' } }; }) }));

import { proposeCleanup, applyCleanup, dismissCleanup, getCleanup, openCleanup, askEchoCleanup, ECHO_CLEANUP_LABEL } from '../../../services/echo/cleanup';
import { addDecision, getDecision, listDecisions } from '../../../services/echo/decisions';

const say = (o: unknown) => ({ response: JSON.stringify(o) });
const add = (text: string) => addDecision({ kind: 'decision', text, topics: ['launch'], source: { surface: 'chat', by: 'you' } } as never);
const ctx = (requestStep: any = null) => ({ surface: 'chat', requestId: 'r1', packetId: 'p1', requestStep }) as never;
const step = { stepId: 'echo', agent: 'echo', actionType: 'memory_cleanup' };

beforeEach(() => {
  localStorage.clear();
  llm.mockReset();
  notes.length = 0;
  submitted.length = 0;
});

describe('proposeCleanup', () => {
  it('two decisions saying the same thing → the step waits with a merge proposal; nothing changes yet', async () => {
    const a = add('The launch is on Friday.');
    const b = add('Launch: Friday.');
    llm.mockResolvedValueOnce(say({ proposals: [{ kind: 'merge', ids: [a.id, b.id], text: 'The launch is on Friday.', reason: 'They say the same thing.' }] }));
    const r: any = await proposeCleanup(step, ctx());
    expect(r.resultState).toBe('setup_required');
    expect(r.summary).toBe('Echo proposes 1 changes to memory: tick the ones to apply.');
    const set = getCleanup(r.stepFields.cleanupSetId)!;
    expect(set.status).toBe('open');
    expect(set.proposals).toHaveLength(1);
    expect(listDecisions()).toHaveLength(2);
  });

  it('the set remembers the step that asked, so Settings can apply it', async () => {
    add('A.');
    llm.mockResolvedValueOnce(say({ proposals: [{ kind: 'drop', ids: [listDecisions()[0].id], reason: 'stale' }] }));
    const r: any = await proposeCleanup({ stepId: 'memory_cleanup', agent: 'echo', actionType: 'memory_cleanup' }, ctx());
    expect(getCleanup(r.stepFields.cleanupSetId)).toMatchObject({ requestId: 'r1', stepId: 'memory_cleanup' });
  });

  it('a proposal naming an id he was not shown is dropped', async () => {
    const a = add('A.');
    llm.mockResolvedValueOnce(say({ proposals: [{ kind: 'drop', ids: ['nope'], reason: 'x' }, { kind: 'drop', ids: [a.id], reason: 'stale' }] }));
    const r: any = await proposeCleanup(step, ctx());
    expect(getCleanup(r.stepFields.cleanupSetId)!.proposals.map((p) => p.ids)).toEqual([[a.id]]);
  });

  it("a proposal whose text is the answer format's own hint is dropped (found in the real app)", async () => {
    const a = add('Short email without emojis.');
    const b = add('Newsletter every Monday.');
    llm.mockResolvedValueOnce(say({ proposals: [
      { kind: 'merge', ids: [a.id, b.id], text: 'for merge and promote', reason: 'x' },
      { kind: 'drop', ids: [b.id], reason: 'stale' },
    ] }));
    const r: any = await proposeCleanup(step, ctx());
    expect(getCleanup(r.stepFields.cleanupSetId)!.proposals.map((p) => p.kind)).toEqual(['drop']);
  });

  it('nothing to tidy → done, "Memory looks tidy."', async () => {
    add('A.');
    llm.mockResolvedValueOnce(say({ proposals: [] }));
    expect((await proposeCleanup(step, ctx())).summary).toBe('Memory looks tidy.');
  });

  it('carried on after you applied or dismissed the set, the step reports it', async () => {
    const a = add('A.');
    llm.mockResolvedValueOnce(say({ proposals: [{ kind: 'drop', ids: [a.id], reason: 'stale' }] }));
    const r: any = await proposeCleanup(step, ctx());
    const setId = r.stepFields.cleanupSetId;
    applyCleanup(setId, getCleanup(setId)!.proposals.map((p) => p.id));
    expect((await proposeCleanup(step, ctx({ cleanupSetId: setId }))).summary).toBe('Applied 1 changes to memory.');
    llm.mockResolvedValueOnce(say({ proposals: [{ kind: 'drop', ids: [add('B.').id], reason: 'stale' }] }));
    const r2: any = await proposeCleanup(step, ctx());
    dismissCleanup(r2.stepFields.cleanupSetId);
    expect((await proposeCleanup(step, ctx({ cleanupSetId: r2.stepFields.cleanupSetId }))).summary).toBe('Left memory as it is.');
  });

  it('old notes are offered once, as note ids, and a promote turns one into a decision', async () => {
    notes.push({ id: 'n1', title: 'Pricing', content: 'We price at $29.' });
    llm.mockImplementationOnce(async (_agent: string, opts: any) => {
      expect(opts.prompt).toContain('note:n1');
      return say({ proposals: [{ kind: 'promote', ids: ['note:n1'], text: 'The price is $29.', reason: 'A real decision.' }] });
    });
    const r: any = await proposeCleanup(step, ctx());
    applyCleanup(r.stepFields.cleanupSetId, getCleanup(r.stepFields.cleanupSetId)!.proposals.map((p) => p.id));
    expect(listDecisions().map((d) => [d.text, d.source.by])).toEqual([['The price is $29.', 'you']]);
    llm.mockImplementationOnce(async (_agent: string, opts: any) => {
      expect(opts.prompt).not.toContain('note:n1');
      return say({ proposals: [] });
    });
    await proposeCleanup(step, ctx());
  });
});

describe('applyCleanup', () => {
  it('applies only the ticked proposals', async () => {
    const a = add('A.');
    const b = add('B.');
    llm.mockResolvedValueOnce(say({ proposals: [{ kind: 'drop', ids: [a.id], reason: '1' }, { kind: 'drop', ids: [b.id], reason: '2' }] }));
    const r: any = await proposeCleanup(step, ctx());
    const set = getCleanup(r.stepFields.cleanupSetId)!;
    expect(applyCleanup(set.id, [set.proposals[0].id])).toEqual({ applied: 1 });
    expect(getDecision(a.id)!.status).toBe('forgotten');
    expect(getDecision(b.id)!.status).toBe('active');
    expect(getCleanup(set.id)!.status).toBe('applied');
    expect(openCleanup()).toBeNull();
  });

  it('merge, replace and contradiction leave one active decision', async () => {
    const a = add('Launch Friday.');
    const b = add('Launch is Friday the 14th.');
    const c = add('Price $29.');
    const d = add('Price $35.');
    llm.mockResolvedValueOnce(say({ proposals: [
      { kind: 'merge', ids: [a.id, b.id], text: 'The launch is on Friday the 14th.', reason: 'same' },
      { kind: 'contradiction', ids: [c.id, d.id], keep: d.id, reason: 'the later price stands' },
    ] }));
    const r: any = await proposeCleanup(step, ctx());
    const set = getCleanup(r.stepFields.cleanupSetId)!;
    applyCleanup(set.id, set.proposals.map((p) => p.id));
    expect(listDecisions().map((x) => x.text).sort()).toEqual(['Price $35.', 'The launch is on Friday the 14th.']);
    expect(getDecision(a.id)!.status).toBe('replaced');
    expect(getDecision(b.id)!.status).toBe('replaced');
    expect(getDecision(c.id)).toMatchObject({ status: 'replaced', replacedBy: d.id });
  });
});

describe('the weekly cleanup', () => {
  it('asks Echo as a one-step request set by Echo, with no paid model', async () => {
    const r = await askEchoCleanup();
    expect(submitted[0]).toMatchObject({ source: 'schedule', label: ECHO_CLEANUP_LABEL, allowPaidModels: false });
    expect(submitted[0].steps).toEqual([expect.objectContaining({ agent: 'echo', actionType: 'memory_cleanup' })]);
    expect(r.state).toBe('done');
    expect(ECHO_CLEANUP_LABEL).toBe('Steps set by Echo.');
  });
});
