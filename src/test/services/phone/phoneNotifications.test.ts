import { describe, it, expect, beforeEach, vi } from 'vitest';
import { phoneNotificationsFor, startPhoneNotifications, PHONE_NOTIFY_SENT_KEY } from '../../../services/phone/phoneNotifications';

const waitingRequest = (effects: string[], stepId = 'marcus') => ({
  id: 'r1', commandId: 'c1', source: 'user', text: 'Post the launch note', kind: 'normal', status: 'waiting_approval',
  createdAtMs: 1, updatedAtMs: 2, changeLog: [],
  steps: [{ stepId, agent: 'marcus', actionType: 'distribution_slack', effects, needs: [], status: 'waiting_approval', startedAtMs: 1 }],
});

describe('phone notifications', () => {
  beforeEach(() => localStorage.clear());

  it('a step with a locked effect gets only Open, never Approve', () => {
    const [n] = phoneNotificationsFor([waitingRequest(['read', 'publish_or_send']) as any], new Set());
    expect(n.requestId).toBe('r1');
    expect(n.stepId).toBe('marcus');
    expect(n.actions).toEqual(['open']);
  });

  it('a step without one gets Approve and Reject', () => {
    const [n] = phoneNotificationsFor([waitingRequest(['read', 'write_own_work'], 'alphonso') as any], new Set());
    expect(n.actions).toEqual(['approve', 'reject', 'open']);
    expect(n.title).toBe('Waiting for you');
  });

  it('keys in the text are hidden', () => {
    const r: any = waitingRequest(['read']);
    r.text = 'Use sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123 to post';
    const [n] = phoneNotificationsFor([r], new Set());
    expect(n.body).not.toContain('abcdefghijklmnopqrstuvwxyz0123');
  });

  it('nothing is sent twice across a restart', () => {
    let requests: any[] = [];
    const push = vi.fn();
    // First start: what is already there counts as sent.
    const stop1 = startPhoneNotifications({ push, requests: () => requests, intervalMs: 0 });
    stop1();
    expect(localStorage.getItem(PHONE_NOTIFY_SENT_KEY)).not.toBeNull();
    requests = [waitingRequest(['read'])];
    const stop2 = startPhoneNotifications({ push, requests: () => requests, intervalMs: 0 });
    stop2();
    expect(push).toHaveBeenCalledTimes(1);
    const stop3 = startPhoneNotifications({ push, requests: () => requests, intervalMs: 0 });
    stop3();
    expect(push).toHaveBeenCalledTimes(1);
  });
});
