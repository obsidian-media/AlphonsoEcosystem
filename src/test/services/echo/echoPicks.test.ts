// Agent phase 7: the buttons' work — pick what to forget, apply or dismiss a cleanup.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/memoryGraphService', () => ({ addNode: vi.fn(async () => null), addEdge: vi.fn(async () => null) }));
vi.mock('../../../services/joseExecutionEngineService', () => ({ carryOnRequest: vi.fn(async () => ({ ok: true })) }));

import { pickForget, applyCleanupStep, dismissCleanupStep } from '../../../services/echo/echoPicks';
import { carryOnRequest } from '../../../services/joseExecutionEngineService';
import { createJoseRequest, getJoseRequest, setJoseRequestStatus, updateJoseStep } from '../../../services/jose/joseRequestStore';
import { addDecision, getDecision } from '../../../services/echo/decisions';
import { saveCleanupSet, getCleanup } from '../../../services/echo/cleanup';

let n = 0;
function waiting(fields: Record<string, unknown>) {
  n += 1;
  const r = createJoseRequest({ commandId: `c${n}`, source: 'user', text: 'x', kind: 'normal', steps: [{ stepId: 'echo', agent: 'echo', actionType: 'memory_forget', effects: ['write_own_work'], needs: [] }] } as never);
  updateJoseStep(r.id, 'echo', { status: 'setup_needed', ...fields } as never);
  setJoseRequestStatus(r.id, 'waiting_setup');
  return r.id;
}
const add = (text: string) => addDecision({ kind: 'decision', text, topics: [], source: { surface: 'chat', by: 'you' } } as never);

beforeEach(() => {
  localStorage.clear();
  vi.mocked(carryOnRequest).mockClear();
});

describe('pickForget', () => {
  it('saves the pick, notes it and carries the request on', async () => {
    const a = add('The launch is on Friday.');
    const id = waiting({ decisionChoices: [{ id: a.id, text: a.text }, { id: 'other', text: 'B' }] });
    expect(await pickForget(id, 'echo', a.id)).toEqual({ ok: true, summary: 'Forgot: The launch is on Friday.' });
    const step = getJoseRequest(id)!.steps[0] as any;
    expect(step.forgetId).toBe(a.id);
    expect(step.decisionChoices).toBeUndefined();
    expect(getJoseRequest(id)!.changeLog.map((c) => c.text)).toContain('You chose to forget: The launch is on Friday.');
    expect(carryOnRequest).toHaveBeenCalledWith(id);
  });

  it('a stale or unknown pick is "Already done."', async () => {
    const id = waiting({ decisionChoices: [{ id: 'd1', text: 'A' }] });
    expect(await pickForget(id, 'echo', 'not-a-choice')).toEqual({ ok: false, summary: 'Already done.' });
    setJoseRequestStatus(id, 'running');
    expect(await pickForget(id, 'echo', 'd1')).toEqual({ ok: false, summary: 'Already done.' });
    expect(carryOnRequest).not.toHaveBeenCalled();
  });
});

describe('cleanup buttons', () => {
  const set = (ids: string[]) => saveCleanupSet({ requestId: 'r', proposals: ids.map((id, i) => ({ id: `p${i}`, kind: 'drop', ids: [id], reason: 'stale' })) } as never);

  it('Apply applies the ticked proposals (all when none given) and carries on', async () => {
    const a = add('A.');
    const b = add('B.');
    const s = set([a.id, b.id]);
    const id = waiting({ cleanupSetId: s.id });
    expect(await applyCleanupStep(id, 'echo', ['p0'])).toEqual({ ok: true, summary: 'Applied 1 changes to memory.' });
    expect(getDecision(a.id)!.status).toBe('forgotten');
    expect(getDecision(b.id)!.status).toBe('active');
    expect(carryOnRequest).toHaveBeenCalledWith(id);
    expect(await applyCleanupStep(id, 'echo')).toEqual({ ok: false, summary: 'Already done.' });
  });

  it('Not now changes nothing and carries on', async () => {
    const a = add('A.');
    const s = set([a.id]);
    const id = waiting({ cleanupSetId: s.id });
    expect(await dismissCleanupStep(id, 'echo')).toEqual({ ok: true, summary: 'Left memory as it is.' });
    expect(getDecision(a.id)!.status).toBe('active');
    expect(getCleanup(s.id)!.status).toBe('dismissed');
    expect(carryOnRequest).toHaveBeenCalledWith(id);
  });
});
