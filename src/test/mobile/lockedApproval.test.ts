import { describe, it, expect, vi } from 'vitest';
import { withLockedConfirm, NOT_CONFIRMED, confirmLockedCall, LOCKED_CONTENT_CALLS } from '../../mobile/lockedApproval';

const request = (effects: string[]) => ({
  id: 'r1', steps: [{ stepId: 'marcus', agent: 'marcus', actionType: 'distribution_slack', effects, needs: [] }],
});

function board(effects: string[]) {
  return {
    request: () => request(effects),
    approveStep: vi.fn(async () => 'Approved.'),
  } as any;
}

describe('approving from the phone', () => {
  it('a locked step asks for Face ID / fingerprint first, and runs only when confirmed', async () => {
    const b = board(['read', 'publish_or_send']);
    const lock = { confirm: vi.fn(async () => true) };
    const result = await withLockedConfirm(b, lock).approveStep('r1', 'marcus');
    expect(lock.confirm).toHaveBeenCalledWith("Approve Marcus's step", { strict: true });
    expect(b.approveStep).toHaveBeenCalledWith('r1', 'marcus');
    expect(result).toBe('Approved.');
  });

  it('a locked step is not approved when Face ID / fingerprint is cancelled', async () => {
    const b = board(['spend']);
    const result = await withLockedConfirm(b, { confirm: async () => false }).approveStep('r1', 'marcus');
    expect(result).toBe(NOT_CONFIRMED);
    expect(b.approveStep).not.toHaveBeenCalled();
  });

  it('a step without a locked effect is approved without asking', async () => {
    const b = board(['read', 'write_own_work']);
    const lock = { confirm: vi.fn(async () => true) };
    await withLockedConfirm(b, lock).approveStep('r1', 'marcus');
    expect(lock.confirm).not.toHaveBeenCalled();
    expect(b.approveStep).toHaveBeenCalled();
  });

  it('the board stays live: going offline is seen through the wrapper', async () => {
    let online = true;
    const b = { ...board(['read']), get readOnly() { return !online; } };
    const wrapped = withLockedConfirm(b, { confirm: async () => true });
    expect(wrapped.readOnly).toBe(false);
    online = false;
    expect(wrapped.readOnly).toBe(true);
  });

  it('a step the phone does not know yet is treated as locked', async () => {
    const b = { request: () => null, approveStep: vi.fn(async () => 'Approved.') } as any;
    const lock = { confirm: vi.fn(async () => true) };
    await withLockedConfirm(b, lock).approveStep('r9', 'x');
    expect(lock.confirm).toHaveBeenCalled();
  });
});

describe('locked content calls from the phone', () => {
  it('Approve and schedule and Cancel post ask for Face ID / fingerprint first', async () => {
    expect([...LOCKED_CONTENT_CALLS].sort()).toEqual(['content.approvePosts', 'content.cancelPost']);
    const lock = { confirm: vi.fn(async () => true) };
    expect(await confirmLockedCall('content.approvePosts', 'Approve and schedule the posts', lock)).toBeNull();
    expect(lock.confirm).toHaveBeenCalledWith('Approve and schedule the posts', { strict: true });
  });

  it('a cancelled Face ID stops the call', async () => {
    const lock = { confirm: vi.fn(async () => false) };
    expect(await confirmLockedCall('content.cancelPost', 'Cancel the post', lock)).toBe(NOT_CONFIRMED);
  });

  it('other content calls do not ask', async () => {
    const lock = { confirm: vi.fn(async () => false) };
    expect(await confirmLockedCall('content.editPost', 'Save', lock)).toBeNull();
    expect(lock.confirm).not.toHaveBeenCalled();
  });
});
