// Jose phase 7: requests that use the local model run one at a time; the rest wait their turn.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createJoseRequest, getJoseRequest, setJoseRequestStatus, listJoseRequests } from '../../../services/jose/joseRequestStore';
import { takeTurn, queuePosition, usesLocalModel, requeueAtStart, QUEUED_LINE, resetQueueForTests } from '../../../services/jose/joseQueue';
import { stopRequest } from '../../../services/jose/joseStop';
import type { PlanStep } from '../../../services/jose/stepGraph';

const made = (text: string, status = 'running') => {
  const request = createJoseRequest({ commandId: `c-${text}`, source: 'user', text, kind: 'normal', steps: [] });
  setJoseRequestStatus(request.id, status as never);
  return request.id;
};
const settle = () => new Promise((r) => setTimeout(r, 0));
const step = (agent: string, extra: Partial<PlanStep> = {}): PlanStep => ({ stepId: agent, agent, actionType: 'assistant_write', effects: ['write_own_work'], needs: [], ...extra });

beforeEach(() => {
  localStorage.clear();
  resetQueueForTests();
});

describe('the queue', () => {
  it('two local requests: the second waits until the first ends', async () => {
    const a = made('A');
    const b = made('B');
    await takeTurn(a);
    let bRuns = false;
    void takeTurn(b).then(() => { bRuns = true; });
    await settle();
    expect(bRuns).toBe(false);
    expect(getJoseRequest(b)!.status).toBe('queued');
    expect(queuePosition(b)).toBe(1);
    setJoseRequestStatus(a, 'done');
    await settle();
    expect(bRuns).toBe(true);
    expect(getJoseRequest(b)!.status).toBe('running');
    expect(queuePosition(b)).toBeNull();
  });

  it('a request that starts waiting for you gives its turn back, and rejoins at the back when carried on', async () => {
    const a = made('A');
    const b = made('B');
    const c = made('C');
    await takeTurn(a);
    const order: string[] = [];
    void takeTurn(b).then(() => order.push('B'));
    void takeTurn(c).then(() => order.push('C'));
    await settle();
    setJoseRequestStatus(a, 'waiting_approval');
    await settle();
    expect(order).toEqual(['B']);
    // A is approved and carried on: it queues behind C.
    setJoseRequestStatus(a, 'running');
    void takeTurn(a).then(() => order.push('A'));
    await settle();
    expect(queuePosition(c)).toBe(1);
    expect(queuePosition(a)).toBe(2);
    setJoseRequestStatus(b, 'done');
    await settle();
    setJoseRequestStatus(c, 'done');
    await settle();
    expect(order).toEqual(['B', 'C', 'A']);
  });

  it('stopping a queued request takes it out of the queue', async () => {
    const a = made('A');
    const b = made('B');
    await takeTurn(a);
    let released = false;
    void takeTurn(b).then(() => { released = true; });
    await settle();
    expect(stopRequest(b).ok).toBe(true);
    await settle();
    expect(released).toBe(true);
    expect(queuePosition(b)).toBeNull();
  });

  it('queued at start: run again oldest first, none twice', async () => {
    const older = made('older', 'running');
    const newer = made('newer', 'running');
    await takeTurn(made('holder'));
    void takeTurn(older);
    await settle();
    await new Promise((r) => setTimeout(r, 5));
    void takeTurn(newer);
    await settle();
    resetQueueForTests();
    const carried = vi.fn(async (_id: string) => ({ ok: true }));
    expect(requeueAtStart(carried)).toEqual([older, newer]);
    expect(carried.mock.calls.map((c) => c[0])).toEqual([older, newer]);
    expect(listJoseRequests().filter((r) => r.status === 'queued')).toHaveLength(2);
  });

  it('only requests using the local model queue', () => {
    expect(usesLocalModel([step('alphonso')])).toBe(true);
    expect(usesLocalModel([step('alphonso', { model: 'claude:claude-haiku-5-5' })])).toBe(false);
    expect(usesLocalModel([step('miya', { model: 'claude:x', contentStep: { projectId: 'p', step: 'scenes' } as never })])).toBe(true);
    expect(usesLocalModel([])).toBe(false);
  });

  it('positions are shown as Queued (2nd)', () => {
    expect(QUEUED_LINE(1)).toBe('Queued (1st).');
    expect(QUEUED_LINE(2)).toBe('Queued (2nd).');
    expect(QUEUED_LINE(3)).toBe('Queued (3rd).');
    expect(QUEUED_LINE(4)).toBe('Queued (4th).');
  });
});
