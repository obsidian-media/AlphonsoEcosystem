import { describe, it, expect, beforeEach, vi } from 'vitest';
import { phoneNotificationsFor, startPhoneNotifications, PHONE_NOTIFY_SENT_KEY, PUSH_STILL_LIMIT, sealedNoticeChars } from '../../../services/phone/phoneNotifications';

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

const videoProject = (versions = 1, over: any = {}) => ({
  id: 'p1', name: 'Bakery tour', updatedAtMs: 1,
  steps: {
    script: { status: 'done', chosenVersion: 1, versions: [{ version: 1, output: { text: 'Hi' } }] },
    assemble: { status: 'done', chosenVersion: versions, versions: Array.from({ length: versions }, (_, i) => ({ version: i + 1, output: { files: { '9x16': `shop/p1/output/v${i + 1}-9x16.mp4` } } })) },
    ...over,
  },
});
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('ready to check', () => {
  beforeEach(() => localStorage.clear());

  it('a new video version waiting for review sends one ready_to_check notice', async () => {
    let projects: any[] = [videoProject(1)];
    const push = vi.fn();
    const still = vi.fn(async () => 'AAAA');
    // First start: the video already there counts as sent.
    startPhoneNotifications({ push, requests: () => [], projects: () => projects, still, intervalMs: 0 })();
    await flush();
    expect(push).not.toHaveBeenCalled();
    projects = [videoProject(2)];
    startPhoneNotifications({ push, requests: () => [], projects: () => projects, still, intervalMs: 0 })();
    await flush();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toEqual({
      key: 'ready:p1:assemble:2', title: 'Ready to check', body: "Miya's video for Bakery tour is ready to check",
      requestId: 'project:p1', actions: ['open'], still: 'AAAA',
    });
    expect(still).toHaveBeenCalledWith({ projectId: 'p1', path: 'shop/p1/output/v2-9x16.mp4', kind: 'video' });
    startPhoneNotifications({ push, requests: () => [], projects: () => projects, still, intervalMs: 0 })();
    await flush();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('pictures say "pictures", and writing steps send nothing', async () => {
    let projects: any[] = [];
    const push = vi.fn();
    startPhoneNotifications({ push, requests: () => [], projects: () => projects, still: async () => null, intervalMs: 0 })();
    projects = [videoProject(1, { scenes: { status: 'done', chosenVersion: 1, versions: [{ version: 1, output: { scenes: [{ picture: 'shop/p1/scenes/v1-s1.png' }] } }] } })];
    startPhoneNotifications({ push, requests: () => [], projects: () => projects, still: async () => null, intervalMs: 0 })();
    await flush();
    const bodies = push.mock.calls.map((c) => c[0].body).sort();
    expect(bodies).toEqual(["Miya's pictures for Bakery tour are ready to check", "Miya's video for Bakery tour is ready to check"]);
    expect(push.mock.calls.every((c) => c[0].still === undefined)).toBe(true);
  });

  it('a still that would make the push too large is left out', async () => {
    let projects: any[] = [];
    const push = vi.fn();
    const big = 'A'.repeat(PUSH_STILL_LIMIT);
    startPhoneNotifications({ push, requests: () => [], projects: () => projects, still: async () => big, intervalMs: 0 })();
    projects = [videoProject(1)];
    startPhoneNotifications({ push, requests: () => [], projects: () => projects, still: async () => big, intervalMs: 0 })();
    await flush();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0].still).toBeUndefined();
    expect(sealedNoticeChars(push.mock.calls[0][0])).toBeLessThan(PUSH_STILL_LIMIT);
  });
});

