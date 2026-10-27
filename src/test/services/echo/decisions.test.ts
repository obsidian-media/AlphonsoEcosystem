// Agent phase 7 (Echo): one store for the ecosystem's decisions.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const nodes: Array<[string, string]> = [];
const edges: Array<[string, string, string, any]> = [];
vi.mock('../../../services/memoryGraphService', () => ({
  addNode: vi.fn(async (type: string, ref: string) => { nodes.push([type, ref]); return `${type}:${ref}`; }),
  addEdge: vi.fn(async (from: string, to: string, type: string, opts: any) => { edges.push([from, to, type, opts]); return 'e'; }),
}));

import {
  addDecision, editDecision, forgetDecision, getDecision, listDecisions, activePreferences,
  decisionIds, surfaceOf, ECHO_LIMITS, DECISIONS_KEY,
} from '../../../services/echo/decisions';

const flush = () => new Promise((r) => setTimeout(r, 0));
const launch = (extra: Record<string, unknown> = {}) => addDecision({
  kind: 'decision', text: 'The launch is on Friday the 14th at $29.', topics: ['launch', 'price'],
  source: { surface: 'chat', requestId: 'r1', stepIds: ['write'], sources: ['https://example.com/a'], by: 'alphonso' }, ...extra,
} as never);

beforeEach(() => {
  localStorage.clear();
  nodes.length = 0;
  edges.length = 0;
});

describe('the decision store', () => {
  it('stores an active record with an id and time, in its own key', () => {
    const d = launch();
    expect(d.id).toBeTruthy();
    expect(d.atMs).toBeGreaterThan(0);
    expect(d.status).toBe('active');
    expect(JSON.parse(localStorage.getItem(DECISIONS_KEY) || '[]')).toHaveLength(1);
    expect(ECHO_LIMITS).toMatchObject({ maxDecisions: 5000, stepChars: 2000, largeStepChars: 6000, perStep: 8, shownToModel: 12, recallMax: 20 });
  });

  it('hides a key before saving (Review Focus 3)', () => {
    const d = addDecision({ kind: 'instruction', text: 'Remember the key sk-abcdefghijklmnop1234', topics: [], source: { surface: 'chat', by: 'you' } } as never);
    expect(d.text).toContain('[hidden key, ends …1234]');
    expect(d.text).not.toContain('sk-abc');
    expect(localStorage.getItem(DECISIONS_KEY)).not.toContain('sk-abc');
  });

  it('a new decision replaces the one it names; both are kept', () => {
    const a = launch();
    const b = launch({ text: 'The launch moved to Saturday the 15th.', replaces: a.id });
    expect(getDecision(a.id)).toMatchObject({ status: 'replaced', replacedBy: b.id });
    expect(listDecisions().map((d) => d.id)).toEqual([b.id]);
    expect(listDecisions({ status: 'all' }).map((d) => d.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('a replaces id that is not in the store changes nothing', () => {
    const a = launch();
    const b = launch({ replaces: 'nope' });
    expect(getDecision(a.id)!.status).toBe('active');
    expect(getDecision(b.id)!.replaces).toBeUndefined();
  });

  it('forget, edit and preferences', () => {
    const p = addDecision({ kind: 'preference', text: 'Short emails without emojis.', topics: ['email'], appliesTo: ['alphonso'], source: { surface: 'chat', by: 'you' } } as never);
    expect(activePreferences().map((d) => d.id)).toEqual([p.id]);
    expect(editDecision(p.id, 'Short emails, never emojis.')!.text).toBe('Short emails, never emojis.');
    expect(forgetDecision(p.id)).toBe(true);
    expect(getDecision(p.id)!.status).toBe('forgotten');
    expect(activePreferences()).toEqual([]);
    expect(forgetDecision('nope')).toBe(false);
  });

  it('two saves in a row both survive (Review Focus 4)', () => {
    launch();
    launch({ text: 'Second.' });
    expect(listDecisions()).toHaveLength(2);
    expect(decisionIds()).toHaveLength(2);
  });

  it('links each decision in the memory graph', async () => {
    const a = launch();
    const b = launch({ replaces: a.id });
    await flush(); await flush();
    expect(nodes).toContainEqual(['decision', b.id]);
    expect(nodes).toContainEqual(['jose_request', 'r1']);
    expect(nodes).toContainEqual(['source', 'https://example.com/a']);
    const types = edges.filter(([from]) => from === `decision:${b.id}`).map(([, , t]) => t);
    expect(types).toEqual(expect.arrayContaining(['decided_in', 'cites', 'replaces']));
    expect(edges.find(([, to]) => to === `decision:${a.id}`)?.[3]).toMatchObject({ createdBy: 'echo', confidence: 'inferred' });
  });

  it('a decision you made is linked as user confirmed', async () => {
    addDecision({ kind: 'instruction', text: 'Remember this.', topics: [], source: { surface: 'chat', requestId: 'r2', by: 'you' } } as never);
    await flush(); await flush();
    expect(edges[0][3].confidence).toBe('user_confirmed');
  });

  it('surfaceOf maps where a request came from', () => {
    expect(surfaceOf('user')).toBe('chat');
    expect(surfaceOf('companion')).toBe('phone');
    expect(surfaceOf('telegram')).toBe('telegram');
    expect(surfaceOf('content_factory')).toBe('miya');
    expect(surfaceOf('whatever')).toBe('other');
  });
});
