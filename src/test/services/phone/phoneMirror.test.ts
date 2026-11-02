import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  listeners: [] as Array<(id: string, status: string) => void>,
  requests: [{ id: 'r1', commandId: 'c1', status: 'running', text: 'Research with key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123', steps: [{ stepId: 'hector', payload: { apiKey: 'sk-secret-1234', channel: '#news' } }] }],
}));
vi.mock('../../../services/jose/joseStepOutputs', () => ({ listStepOutputs: () => [] }));
vi.mock('../../../services/jose/joseRequestStore', () => ({
  listJoseRequests: () => h.requests,
  onRequestStatusChange: (fn: any) => { h.listeners.push(fn); return () => {}; },
}));

import { mirrorSnapshots, startPhoneMirror, MIRROR_BATCH_MS } from '../../../services/phone/phoneMirror';

describe('phoneMirror', () => {
  beforeEach(() => { h.listeners.length = 0; });

  it('the snapshot has no secret fields', () => {
    const snaps = mirrorSnapshots();
    const text = JSON.stringify(snaps);
    expect(text).not.toContain('sk-secret-1234');
    expect(text).not.toContain('abcdefghijklmnopqrstuvwxyz0123');
    expect(text).toContain('#news');
    expect(snaps.requests).toHaveLength(1);
    expect(Object.keys(snaps)).toEqual(expect.arrayContaining(['requests', 'stepOutputs', 'chat', 'computer']));
  });

  it('changes are batched per 500 ms', () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const stop = startPhoneMirror({ publish });
    expect(MIRROR_BATCH_MS).toBe(500);
    for (let i = 0; i < 5; i += 1) h.listeners.forEach((fn) => fn('r1', 'running'));
    expect(publish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(publish.mock.calls.filter((c) => c[0] === 'requests')).toHaveLength(1);
    expect(publish).toHaveBeenCalledWith('requests', expect.any(Array), 'change');
    stop();
    vi.useRealTimers();
  });
});
