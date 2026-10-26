// Agent phase 4: a serious Sentinel finding holds the steps after his.
import { describe, it, expect } from 'vitest';
import { sentinelHoldFor } from '../../../services/sentinel/sentinelHolds';

const result = (requiresApproval: boolean) => ({ resultState: 'completed', schema: { kind: 'security', requiresApproval, findings: ['http://paypa1-secure-login.com/verify: A fake PayPal login → Remove the link.'] } });

describe('sentinelHoldFor', () => {
  it('a high finding holds the next steps with his reasons', () => {
    expect(sentinelHoldFor({ agent: 'sentinel' }, result(true))).toBe('Sentinel asks for your approval: http://paypa1-secure-login.com/verify: A fake PayPal login → Remove the link.');
  });
  it('safe holds nothing', () => {
    expect(sentinelHoldFor({ agent: 'sentinel' }, result(false))).toBeNull();
    expect(sentinelHoldFor({ agent: 'maria' }, result(true))).toBeNull();
  });
});

describe('a fix left after the rounds', () => {
  it('holds once the rounds have run out', () => {
    const fix = { resultState: 'completed', schema: { kind: 'security', requiresApproval: false, reviewVerdict: 'fix', findings: ['"Log in": asks for a password → Remove it.'] } };
    expect(sentinelHoldFor({ agent: 'sentinel', round: 1 }, fix, 2)).toBeNull();
    expect(sentinelHoldFor({ agent: 'sentinel', round: 2 }, fix, 2)).toBe('Sentinel asked for changes: "Log in": asks for a password → Remove it.');
  });
});

describe("the content factory's campaign check", () => {
  const check = (data: unknown) => ({ resultState: 'completed', artifacts: [{ type: 'content_step_output', actionType: 'security_content_check', data }] });
  it('an issue keeps Publish waiting with his issues', async () => {
    const { SECURITY_WAIT } = await import('../../../services/sentinel/sentinelHolds');
    const reason = sentinelHoldFor({ agent: 'sentinel', actionType: 'security_content_check' } as never, check({ ok: false, issues: [{ what: 'A fake login link', where: 'http://paypa1.com', fix: 'Remove it.' }] }));
    expect(reason).toBe(SECURITY_WAIT(['http://paypa1.com: A fake login link → Remove it.']));
    expect(reason).toContain('Approve to post anyway, or fix the campaign.');
  });
  it('a campaign that passes holds nothing', () => {
    expect(sentinelHoldFor({ agent: 'sentinel', actionType: 'security_content_check' } as never, check({ ok: true, issues: [] }))).toBeNull();
  });
});
