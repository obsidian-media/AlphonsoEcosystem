import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createJoseRequest,
  updateJoseStep,
  setJoseRequestStatus,
  getJoseRequest,
  listJoseRequests,
  markRunningRequestsInterrupted,
} from '../../../services/jose/joseRequestStore';

const steps = [
  { stepId: 'hector', agent: 'hector', actionType: 'research', effects: ['read' as const], needs: [] },
  { stepId: 'miya', agent: 'miya', actionType: 'creative_package', effects: ['write_own_work' as const], needs: ['hector'] },
];

function make(text = 'Make a launch video') {
  return createJoseRequest({ commandId: `c-${text}`, source: 'user', text, kind: 'normal', steps });
}

beforeEach(() => localStorage.clear());

describe('joseRequestStore', () => {
  it('saves a request with its steps waiting', () => {
    const r = make();
    expect(r.status).toBe('running');
    expect(r.steps.map((s) => s.status)).toEqual(['waiting', 'waiting']);
    expect(getJoseRequest(r.id)?.text).toBe('Make a launch video');
  });

  it('updates one step', () => {
    const r = make();
    updateJoseStep(r.id, 'miya', { status: 'running', startedAtMs: 5 });
    const step = getJoseRequest(r.id)!.steps.find((s) => s.stepId === 'miya')!;
    expect(step).toMatchObject({ status: 'running', startedAtMs: 5 });
    expect(setJoseRequestStatus(r.id, 'done').status).toBe('done');
  });

  it('lists newest first and keeps at most 200', () => {
    const now = vi.spyOn(Date, 'now');
    for (let i = 0; i < 201; i += 1) {
      now.mockReturnValue(1000 + i);
      make(`r${i}`);
    }
    now.mockRestore();
    const list = listJoseRequests();
    expect(list).toHaveLength(200);
    expect(list[0].text).toBe('r200');
    expect(list.some((r) => r.text === 'r0')).toBe(false);
  });

  it('marks requests left running as interrupted', () => {
    const a = make('a');
    const b = make('b');
    setJoseRequestStatus(b.id, 'done');
    expect(markRunningRequestsInterrupted()).toBe(1);
    expect(getJoseRequest(a.id)!.status).toBe('interrupted');
    expect(getJoseRequest(b.id)!.status).toBe('done');
  });
});
