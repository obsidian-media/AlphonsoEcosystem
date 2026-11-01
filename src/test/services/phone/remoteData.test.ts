import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRemoteData, offlineLine, type PhoneTransport } from '../../../services/phone/remoteData';

function fakeTransport() {
  let mirrorFn: (m: any) => void = () => {};
  let statusFn: (online: boolean, since: number | null) => void = () => {};
  const state = { online: true, since: null as number | null };
  const snapshots: any[] = [];
  const t: PhoneTransport & { calls: any[]; push(m: any): void; goOffline(ms: number): void; goOnline(): void; snapshots: any[] } = {
    calls: [], snapshots,
    call: vi.fn(async (name: string, args: any) => {
      t.calls.push({ name, args });
      if (name === 'mirror.snapshot') return { ok: true, value: snapshots.shift() };
      if (name === 'chat.send') return { ok: true, value: { messageId: args.messageId, reply: 'ok' } };
      return { ok: true, value: 'Approved. It carries on.' };
    }) as any,
    onMirror(fn) { mirrorFn = fn; return () => {}; },
    onStatus(fn) { statusFn = fn; return () => {}; },
    online: () => state.online,
    offlineSince: () => state.since,
    push(m) { mirrorFn(m); },
    goOffline(ms) { state.online = false; state.since = ms; statusFn(false, ms); },
    goOnline() { state.online = true; state.since = null; statusFn(true, null); },
  };
  return t;
}

const req = (id: string, status = 'running') => ({ id, commandId: `c-${id}`, status, text: id, steps: [], createdAtMs: 1 });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('remoteData', () => {
  beforeEach(() => localStorage.clear());

  it('reconnect replaces the mirror', async () => {
    const t = fakeTransport();
    t.snapshots.push({ requests: [req('a'), req('b')], stepOutputs: {}, chat: [], computer: {} });
    const data = createRemoteData(t);
    await data.reconnected();
    expect(data.board.requests().map((r) => r.id)).toEqual(['a', 'b']);
    t.push({ kind: 'change', store: 'requests', data: [req('a', 'done'), req('b'), req('c')], version: 7 });
    expect(data.board.requests()).toHaveLength(3);
    // The computer restarted: its new snapshot replaces everything, and its new changes count from 1.
    t.snapshots.push({ requests: [req('z')], stepOutputs: {}, chat: [], computer: {} });
    t.goOffline(1000);
    t.goOnline();
    await flush(); await flush();
    expect(data.board.requests().map((r) => r.id)).toEqual(['z']);
    t.push({ kind: 'change', store: 'requests', data: [req('z'), req('y')], version: 1 });
    expect(data.board.requests().map((r) => r.id)).toEqual(['z', 'y']);
  });

  it('offline makes the board read-only and says since when', async () => {
    const t = fakeTransport();
    t.snapshots.push({ requests: [req('a', 'waiting_approval')], stepOutputs: {}, chat: [], computer: {} });
    const data = createRemoteData(t);
    await data.reconnected();
    const at = new Date(2026, 9, 31, 14, 2).getTime();
    t.goOffline(at);
    expect(data.board.readOnly).toBe(true);
    expect(data.board.requests().map((r) => r.id)).toEqual(['a']);
    expect(offlineLine(at)).toBe('Your computer is offline since 14:02.');
  });

  it('an action while offline is refused with the offline line', async () => {
    const t = fakeTransport();
    const data = createRemoteData(t);
    t.goOffline(new Date(2026, 9, 31, 9, 5).getTime());
    expect(await data.board.approveStep('r1', 'hector')).toBe('Your computer is offline since 09:05.');
    expect(t.calls.filter((c) => c.name === 'request.approveStep')).toHaveLength(0);
  });

  it('queued message sent once', async () => {
    const t = fakeTransport();
    const data = createRemoteData(t);
    t.goOffline(1000);
    await data.chat.send('Hello from the train');
    expect(t.calls.filter((c) => c.name === 'chat.send')).toHaveLength(0);
    expect(data.chat.messages().at(-1)).toMatchObject({ role: 'user', text: 'Hello from the train', queued: true });
    t.snapshots.push({ requests: [], stepOutputs: {}, chat: [], computer: {} }, { requests: [], stepOutputs: {}, chat: [], computer: {} });
    t.goOnline();
    t.goOffline(2000);
    t.goOnline();
    await flush(); await flush(); await flush();
    const sends = t.calls.filter((c) => c.name === 'chat.send');
    expect(sends).toHaveLength(1);
    expect(sends[0].args).toMatchObject({ text: 'Hello from the train' });
    expect(typeof sends[0].args.messageId).toBe('string');
  });

  it('online actions go to the computer as named calls', async () => {
    const t = fakeTransport();
    const data = createRemoteData(t);
    expect(await data.board.approveStep('r1', 'hector')).toBe('Approved. It carries on.');
    expect(t.calls.at(-1)).toEqual({ name: 'request.approveStep', args: { requestId: 'r1', stepId: 'hector' } });
    expect(data.board.local).toBe(false);
  });
});

describe('the Studio on the phone', () => {
  beforeEach(() => localStorage.clear());

  it('the content store reaches the Studio, and stays while the computer is off', async () => {
    const t = fakeTransport();
    const data = createRemoteData(t);
    t.push({ kind: 'snapshot', store: 'content', data: { projects: [{ id: 'p1', name: 'Tour', media: [] }], brands: [{ id: 'b1', name: 'Shop' }], calendar: [] }, version: 1 });
    expect(data.studio.projects().map((p) => p.id)).toEqual(['p1']);
    expect(data.studio.brands()).toEqual([{ id: 'b1', name: 'Shop' }]);
    t.goOffline(5000);
    expect(data.studio.projects()).toHaveLength(1);
    expect(data.studio.readOnly).toBe(true);
    expect(await data.studio.call('content.approveStep', { projectId: 'p1' })).toEqual({ ok: false, reason: offlineLine(5000) });
  });

  it("a call's answer, or its refusal in the computer's words", async () => {
    const t = fakeTransport();
    const data = createRemoteData(t);
    vi.mocked(t.call).mockResolvedValueOnce({ ok: true, value: { ok: true, latest: { id: 'p1' } } });
    expect(await data.studio.call('content.editPost', { projectId: 'p1' })).toEqual({ ok: true, value: { ok: true, latest: { id: 'p1' } } });
    vi.mocked(t.call).mockResolvedValueOnce({ ok: false, error: "That post isn't on your computer any more." });
    expect(await data.studio.call('content.editPost', { projectId: 'p1' })).toEqual({ ok: false, reason: "That post isn't on your computer any more." });
  });

  it('a preview already on the phone is shown without asking the computer', async () => {
    const t = fakeTransport();
    const store = { get: vi.fn(async () => 'blob:x'), put: vi.fn(), remove: vi.fn(), keys: vi.fn(async () => []) };
    const data = createRemoteData(t, { previewStore: store as any, network: async () => 'wifi' });
    expect(await data.studio.preview({ projectId: 'p1', path: 'a/b.mp4', kind: 'video' }, async () => true)).toEqual({ ok: true, url: 'blob:x' });
    expect(t.calls).toEqual([]);
  });
});
