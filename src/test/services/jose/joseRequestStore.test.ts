import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createJoseRequest, updateJoseStep, setJoseRequestStatus, getJoseRequest, listJoseRequests, markRunningRequestsInterrupted, createWaitingPlanRequest, replacePlanSteps, claimPlanForRun, cancelJoseRequest, requestForCommand, attachRunToRequest } from '../../../services/jose/joseRequestStore';

const steps = [
  { stepId: 'hector', agent: 'hector', actionType: 'research', effects: ['read' as const], needs: [] },
  { stepId: 'miya', agent: 'miya', actionType: 'creative_package', effects: ['write_own_work' as const], needs: ['hector'] },
];

function make(text = 'Make a launch video') {
  return createJoseRequest({ commandId: `c-${text}`, source: 'user', text, kind: 'normal', steps });
}

beforeEach(() => localStorage.clear());

// Final review (agent phase 6): a plan approved first keeps its own id when it runs.
// Live run (2026-10-26): a step picked into blog finished but still said "Which project: shop, blog?".
describe('a step that runs again', () => {
  it('drops its old error once it is running or done', () => {
    localStorage.clear();
    const r = createJoseRequest({ commandId: 'c-err', source: 'user', text: 'x', kind: 'normal', steps: [{ stepId: 'a', agent: 'alphonso', actionType: 'local_operation', effects: ['run'], needs: [] }] } as never);
    updateJoseStep(r.id, 'a', { status: 'setup_needed', error: 'Which project: shop, blog?' } as never);
    updateJoseStep(r.id, 'a', { status: 'done' } as never);
    expect(getJoseRequest(r.id)!.steps[0].error).toBeUndefined();
    updateJoseStep(r.id, 'a', { status: 'failed', error: 'It broke.' } as never);
    expect(getJoseRequest(r.id)!.steps[0].error).toBe('It broke.');
  });
});

describe('requestForCommand', () => {
  it("finds a command's request, also one that was a plan approved first", () => {
    localStorage.clear();
    const plain = createJoseRequest({ commandId: 'c-plain', source: 'user', text: 'x', kind: 'normal', steps: [] } as never);
    expect(requestForCommand('c-plain')?.id).toBe(plain.id);
    const waiting = createWaitingPlanRequest({ text: 'y', source: 'user', kind: 'normal', steps: [], plan: { source: 'fresh' }, runOptions: { source: 'user' } } as never);
    attachRunToRequest(waiting.id, { commandId: 'c-plan', steps: [] } as never);
    expect(requestForCommand('c-plan')?.id).toBe(waiting.id);
    expect(waiting.id.startsWith('jose-request-plan-')).toBe(true);
    expect(requestForCommand('nope')).toBeNull();
    expect(requestForCommand('')).toBeNull();
  });
});

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

// Phase 3 (2026-10-23): a plan can wait for the user before it runs.
describe('requests waiting for plan approval', () => {
  const waiting = () => createWaitingPlanRequest({
    text: 'Make a video', source: 'user', kind: 'normal', steps,
    plan: { source: 'fresh', templateId: null, note: '' }, runOptions: { source: 'user', previewMode: true },
  });

  it('saves the plan as waiting, with its run options and an empty change log', () => {
    const r = waiting();
    expect(r.status).toBe('waiting_plan_approval');
    expect(r.id).toMatch(/^jose-request-plan-/);
    expect(r.changeLog).toEqual([]);
    expect(getJoseRequest(r.id)?.runOptions).toEqual({ source: 'user', previewMode: true });
  });

  it('is still waiting after a restart', () => {
    const r = waiting();
    markRunningRequestsInterrupted();
    expect(getJoseRequest(r.id)!.status).toBe('waiting_plan_approval');
  });

  it('runs only once: the second claim gets nothing', () => {
    const r = waiting();
    expect(claimPlanForRun(r.id)?.status).toBe('running');
    expect(claimPlanForRun(r.id)).toBeNull();
  });

  it('cannot run once cancelled', () => {
    const r = waiting();
    expect(cancelJoseRequest(r.id).status).toBe('cancelled');
    expect(claimPlanForRun(r.id)).toBeNull();
  });

  it('records an edit in the change log, and refuses edits once running', () => {
    const r = waiting();
    const edited = replacePlanSteps(r.id, [steps[0]], "Removed Miya's step");
    expect(edited.steps.map((s) => s.stepId)).toEqual(['hector']);
    expect(edited.steps[0].status).toBe('waiting');
    expect(edited.changeLog.map((c) => c.text)).toEqual(["Removed Miya's step"]);
    claimPlanForRun(r.id);
    expect(() => replacePlanSteps(r.id, steps, 'again')).toThrow();
  });
});
