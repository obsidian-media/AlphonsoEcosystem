import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hermes gateway (2026-10-30), Task 6: Hermes's approval requests wait on the board and Telegram.
const steps: Record<string, any> = {};
vi.mock('../../../services/jose/joseRequestStore', () => ({
  getJoseRequest: (id: string) => ({ id, status: 'running', steps: Object.values(steps) }),
  updateJoseStep: (_r: string, stepId: string, patch: any) => { steps[stepId] = { ...(steps[stepId] || { stepId }), ...patch }; },
}));

const { waitForHermesApproval, answerHermesApproval, endHermesApproval, describeHermesApproval, HERMES_TIMED_OUT } = await import('../../../services/hermes/hermesApprovals');

const req = { runId: 'run_1', agent: 'hector', command: 'rm -rf build', description: 'delete the build folder' };

describe('Hermes approvals through Alphonso', () => {
  beforeEach(() => {
    for (const k of Object.keys(steps)) delete steps[k];
    steps.hector = { stepId: 'hector', agent: 'hector', status: 'running' };
  });

  it('describes what Hermes wants in plain words', () => {
    expect(describeHermesApproval(req)).toBe("Hector's Hermes profile wants to run: rm -rf build");
    expect(describeHermesApproval({ runId: 'r', agent: 'nova', description: 'save a note' })).toBe("Nova's Hermes profile wants to: save a note");
  });

  it('makes the step wait, and Approve answers once', async () => {
    const wait = waitForHermesApproval('req-1', 'hector', req);
    expect(steps.hector).toMatchObject({ status: 'waiting_approval', hermesApproval: { runId: 'run_1', command: 'rm -rf build' }, note: describeHermesApproval(req) });
    expect(await answerHermesApproval('req-1', 'hector', true)).toEqual({ ok: true, summary: 'Approved. Hector carries on.' });
    expect(await wait).toBe('once');
    expect(steps.hector.status).toBe('running');
    expect(steps.hector.hermesApproval).toBeUndefined();
  });

  it('Reject answers deny', async () => {
    const wait = waitForHermesApproval('req-1', 'hector', req);
    expect((await answerHermesApproval('req-1', 'hector', false)).ok).toBe(true);
    expect(await wait).toBe('deny');
  });

  it('answers once only', async () => {
    void waitForHermesApproval('req-1', 'hector', req);
    await answerHermesApproval('req-1', 'hector', true);
    expect(await answerHermesApproval('req-1', 'hector', true)).toEqual({ ok: false, summary: 'Already done.' });
  });

  it('refuses an answer once Hermes stopped waiting, and the step says so', async () => {
    const wait = waitForHermesApproval('req-1', 'hector', req);
    endHermesApproval('req-1', 'hector');
    expect(await wait).toBe('deny');
    expect(HERMES_TIMED_OUT).toBe('Hermes stopped waiting for your answer.');
    expect(await answerHermesApproval('req-1', 'hector', true)).toEqual({ ok: false, summary: HERMES_TIMED_OUT });
    expect(steps.hector.note).toBe(HERMES_TIMED_OUT);
  });

  it('asks every time: an approval is never kept for the next request', async () => {
    const first = waitForHermesApproval('req-1', 'hector', req);
    await answerHermesApproval('req-1', 'hector', true);
    await first;
    void waitForHermesApproval('req-1', 'hector', req);
    expect(steps.hector.status).toBe('waiting_approval');
  });
});
