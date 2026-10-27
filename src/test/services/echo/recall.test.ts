// Agent phase 7 (Echo): finding the decisions that matter.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/memoryGraphService', () => ({ addNode: vi.fn(async () => null), addEdge: vi.fn(async () => null) }));
const chroma = { healthy: false, results: [] as Array<{ id: string; score: number; metadata: object }> };
vi.mock('../../../services/chromaDbService', () => ({
  isChromaHealthy: vi.fn(async () => chroma.healthy),
  semanticSearchMemory: vi.fn(async () => (chroma.healthy ? chroma.results : null)),
  addMemoryToChroma: vi.fn(async () => undefined),
}));

import { addDecision, forgetDecision } from '../../../services/echo/decisions';
import { searchDecisions, decisionsFor, decisionsText, indexDecision, resetChromaCheckForTests } from '../../../services/echo/recall';
import { addMemoryToChroma, isChromaHealthy } from '../../../services/chromaDbService';

const add = (text: string, extra: Record<string, unknown> = {}) => addDecision({
  kind: 'decision', text, topics: [], source: { surface: 'chat', by: 'you' }, ...extra,
} as never);

beforeEach(() => {
  localStorage.clear();
  chroma.healthy = false;
  chroma.results = [];
  resetChromaCheckForTests();
});

// Found in CI: each search waited up to 1.5 s for ChromaDB's heartbeat, and a request searches many times.
describe('the ChromaDB check', () => {
  it('is asked once a minute, not on every search', async () => {
    add('The launch is on Friday.', { topics: ['launch'] });
    vi.mocked(isChromaHealthy).mockClear();
    await searchDecisions('launch');
    await searchDecisions('launch date');
    await decisionsFor('the launch', {});
    expect(isChromaHealthy).toHaveBeenCalledTimes(1);
  });


  // Found in the Playwright check: the first check held a request back 1.5 s.
  it("the first search doesn't wait for the check; ChromaDB joins once it's known to run", async () => {
    const d = add('The launch is on Friday.', { topics: ['launch'] });
    chroma.healthy = true;
    chroma.results = [{ id: d.id, score: 0.9, metadata: {} }];
    vi.mocked(isChromaHealthy).mockImplementationOnce(() => new Promise((r) => setTimeout(() => r(true), 50)));
    const first = await Promise.race([searchDecisions('launch'), new Promise((r) => setTimeout(() => r('waited'), 20))]);
    expect(first).not.toBe('waited');
    await new Promise((r) => setTimeout(r, 80));
    const { semanticSearchMemory } = await import('../../../services/chromaDbService');
    vi.mocked(semanticSearchMemory).mockClear();
    await searchDecisions('launch');
    expect(semanticSearchMemory).toHaveBeenCalled();
  });
});

describe('searchDecisions', () => {
  it('finds a decision by its words and topics, and nothing for another subject', async () => {
    const d = add('The launch is on Friday the 14th at $29.', { topics: ['launch', 'price'] });
    add('We use pnpm in the shop project.', { topics: ['shop', 'pnpm'] });
    expect((await searchDecisions('write an email to Sam about the launch')).map((x) => x.id)).toEqual([d.id]);
    expect(await searchDecisions('tea recipes')).toEqual([]);
  });

  it('word stems match: "launching" finds "launch"', async () => {
    const d = add('The launch is on Friday.', { topics: ['launch'] });
    expect((await searchDecisions('when are we launching?')).map((x) => x.id)).toEqual([d.id]);
  });

  it("adds ChromaDB's matches when it is running, and ignores it when not", async () => {
    const d = add('Prices are shown with tax included.', { topics: ['pricing'] });
    chroma.healthy = true;
    chroma.results = [{ id: d.id, score: 0.2, metadata: {} }, { id: 'not-a-decision', score: 0.1, metadata: {} }];
    const known = async () => { await searchDecisions('warm up'); await new Promise((r) => setTimeout(r, 0)); };
    await known();
    expect((await searchDecisions('what customers pay')).map((x) => x.id)).toEqual([d.id]);
    chroma.healthy = false;
    resetChromaCheckForTests();
    await known();
    expect(await searchDecisions('what customers pay')).toEqual([]);
  });

  it('indexDecision sends a decision to ChromaDB', () => {
    const d = add('A thing.', { topics: ['thing'] });
    indexDecision(d);
    expect(addMemoryToChroma).toHaveBeenCalledWith(expect.objectContaining({ id: d.id, content: 'A thing.' }));
  });
});

describe('decisionsFor', () => {
  it("gives a step the preferences for its kind of work and the matching decisions", async () => {
    const pref = add('Short emails without emojis.', { kind: 'preference', appliesTo: ['alphonso'], topics: ['email'] });
    const writing = add('Formal tone in letters.', { kind: 'preference', appliesTo: ['assistant_write'], topics: ['tone'] });
    const launch = add('The launch is on Friday the 14th.', { topics: ['launch'] });
    const forAlphonso = (await decisionsFor('Write an email to Sam about the launch', { agent: 'alphonso', actionType: 'assistant_write' })).map((d) => d.id);
    expect(forAlphonso).toEqual(expect.arrayContaining([pref.id, writing.id, launch.id]));
    const forHector = (await decisionsFor('Research the launch market', { agent: 'hector', actionType: 'research_report' })).map((d) => d.id);
    expect(forHector).toEqual([launch.id]);
  });

  it('a forgotten preference stops at once (Review Focus 5)', async () => {
    const pref = add('Short emails.', { kind: 'preference', appliesTo: ['all'] });
    expect((await decisionsFor('anything', { agent: 'nova' })).map((d) => d.id)).toEqual([pref.id]);
    forgetDecision(pref.id);
    expect(await decisionsFor('anything', { agent: 'nova' })).toEqual([]);
  });
});

describe('decisionsText', () => {
  it('one line each with the date and where it was decided', () => {
    const d = add('The launch is on Friday.', { why: 'the venue is free then' });
    const p = add('Short emails.', { kind: 'preference', source: { surface: 'telegram', by: 'you' } });
    const r = add('No discount codes by email.', { kind: 'rejection' });
    const text = decisionsText([d, p, r]);
    const day = new Date(d.atMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    expect(text).toContain(`Decided ${day} (Chat): The launch is on Friday. — because the venue is free then`);
    expect(text).toContain(`Preference ${day} (Telegram): Short emails.`);
    expect(text).toContain(`You turned down ${day} (Chat): No discount codes by email.`);
    expect(decisionsText([])).toBe('');
  });

  it('is cut at 2,000 characters, 6,000 for a large model', () => {
    const list = Array.from({ length: 60 }, (_, i) => add(`Decision number ${i} ${'x'.repeat(80)}`));
    expect(decisionsText(list).length).toBeLessThanOrEqual(2000);
    expect(decisionsText(list, true).length).toBeGreaterThan(2000);
    expect(decisionsText(list, true).length).toBeLessThanOrEqual(6000);
  });
});
