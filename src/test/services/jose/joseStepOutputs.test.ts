import { describe, it, expect, beforeEach } from 'vitest';
import { setStepOutput, getStepOutput } from '../../../services/jose/joseStepOutputs';
import { createJoseRequest, setJoseRequestStatus } from '../../../services/jose/joseRequestStore';

const step = { stepId: 'a', agent: 'miya', actionType: 'creative_x', effects: ['write_own_work' as const], needs: [] };

beforeEach(() => localStorage.clear());

// Phase 6a: pruning to the last 50 commands kept no regard for requests still
// waiting, so a request approved days later had lost the work it was built on.
describe('step outputs of requests still in progress', () => {
  it('a waiting request keeps its outputs after 60 later commands', () => {
    createJoseRequest({ commandId: 'waiting', source: 'test', text: 'x', kind: 'normal', steps: [step] });
    setJoseRequestStatus('jose-request-waiting', 'waiting_approval');
    setStepOutput('waiting', 'a', 'miya', { summary: 'the script' });
    for (let i = 0; i < 60; i += 1) setStepOutput(`later-${i}`, 'a', 'miya', { summary: `later ${i}` });
    expect(getStepOutput('waiting', 'a')?.summary).toBe('the script');
  });

  for (const status of ['waiting_plan_approval', 'interrupted', 'running'] as const) {
    it(`so does a request that is ${status}`, () => {
      createJoseRequest({ commandId: 'kept', source: 'test', text: 'x', kind: 'normal', steps: [step] });
      setJoseRequestStatus('jose-request-kept', status);
      setStepOutput('kept', 'a', 'miya', { summary: 'kept work' });
      for (let i = 0; i < 60; i += 1) setStepOutput(`later-${i}`, 'a', 'miya', { summary: `later ${i}` });
      expect(getStepOutput('kept', 'a')?.summary).toBe('kept work');
    });
  }

  it("a finished request's outputs beyond the last 50 are removed", () => {
    createJoseRequest({ commandId: 'old', source: 'test', text: 'x', kind: 'normal', steps: [step] });
    setJoseRequestStatus('jose-request-old', 'done');
    setStepOutput('old', 'a', 'miya', { summary: 'old work' });
    for (let i = 0; i < 60; i += 1) setStepOutput(`later-${i}`, 'a', 'miya', { summary: `later ${i}` });
    expect(getStepOutput('old', 'a')).toBeNull();
    expect(getStepOutput('later-59', 'a')?.summary).toBe('later 59');
    expect(getStepOutput('later-9', 'a')).toBeNull();
  });
});
