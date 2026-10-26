// When Maria asks for your approval, or a "fix" is left after the review rounds, the steps
// after hers wait for you, with her reasons (agent phase 3, owner 2026-10-25).
import { describe, it, expect } from 'vitest';
import { holdStepsAfter, mariaHoldFor } from '../../../services/maria/mariaHolds';

const planResult = (needsApproval: boolean) => ({ resultState: 'completed', schema: { kind: 'plan', needsApproval, approvalReasons: ['Posting the code publicly gives it to everyone.'] } });
const workResult = (verdict: 'pass' | 'fix') => ({ resultState: 'completed', schema: { kind: 'work', verdict, findings: ['"200 times": wrong → say 11,400'] } });

describe('mariaHoldFor', () => {
  it('a plan review that asks for approval holds, with her reasons', () => {
    expect(mariaHoldFor({ agent: 'maria', stepId: 'm' }, planResult(true), 2)).toBe('Maria asks for your approval: Posting the code publicly gives it to everyone.');
    expect(mariaHoldFor({ agent: 'maria', stepId: 'm' }, planResult(false), 2)).toBeNull();
  });

  it('a fix holds only once the rounds have run out', () => {
    expect(mariaHoldFor({ agent: 'maria', stepId: 'check' }, workResult('fix'), 2)).toBeNull();
    expect(mariaHoldFor({ agent: 'maria', stepId: 'check-r2', round: 2 }, workResult('fix'), 2)).toBe('Maria asked for changes: "200 times": wrong → say 11,400');
    expect(mariaHoldFor({ agent: 'maria', stepId: 'check-r2', round: 2 }, workResult('pass'), 2)).toBeNull();
  });

  it('only Maria holds', () => {
    expect(mariaHoldFor({ agent: 'sentinel', stepId: 's' }, planResult(true), 2)).toBeNull();
  });
});

describe('holdStepsAfter', () => {
  it('holds the steps after hers with her reasons', () => {
    const steps: any[] = [{ stepId: 'm', needs: [] }, { stepId: 'marcus', needs: ['m'] }, { stepId: 'other', needs: [] }];
    expect(holdStepsAfter(steps, 'm', 'Maria asks for your approval: x')).toEqual(['marcus']);
    expect(steps[1].waitFor).toBe('Maria asks for your approval: x');
    expect(steps[2].waitFor).toBeUndefined();
  });

  it('with no step after hers nothing is held', () => {
    const steps: any[] = [{ stepId: 'm', needs: [] }];
    expect(holdStepsAfter(steps, 'm', 'r')).toEqual([]);
  });

  it('Marcus waits on a fix left after the rounds', () => {
    const steps: any[] = [{ stepId: 'check-r2', needs: ['write-fix-2'] }, { stepId: 'marcus', agent: 'marcus', needs: ['check-r2'] }];
    const reason = mariaHoldFor({ agent: 'maria', stepId: 'check-r2', round: 2 }, workResult('fix'), 2)!;
    holdStepsAfter(steps, 'check-r2', reason);
    expect(steps[1].waitFor).toBe('Maria asked for changes: "200 times": wrong → say 11,400');
  });

  it('keeps a wait reason a step already had', () => {
    const steps: any[] = [{ stepId: 'm', needs: [] }, { stepId: 'scenes', needs: ['m'], waitFor: 'Approve the review in Miya Studio first.' }];
    holdStepsAfter(steps, 'm', 'Maria asks for your approval: y');
    expect(steps[1].waitFor).toBe('Approve the review in Miya Studio first. Maria asks for your approval: y');
  });
});
