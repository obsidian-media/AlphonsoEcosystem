import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRemoteData, offlineLine, type PhoneTransport } from '../../../services/phone/remoteData';
import { NEEDS_COMPUTER } from '../../../services/phone/phoneRoute';

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

describe('Teams, Skills, Settings and Connectors on the phone (part B)', () => {
  beforeEach(() => localStorage.clear());

  it('mirrored part-B stores show in more', () => {
    const t = fakeTransport();
    const data = createRemoteData(t);
    t.push({ kind: 'snapshot', store: 'settings', data: { approvalMode: true, zeroCostMode: true }, version: 1 });
    t.push({ kind: 'snapshot', store: 'teams', data: [{ id: 'user_research', name: 'Research', steps: [], problems: [] }], version: 1 });
    t.push({ kind: 'snapshot', store: 'skills', data: { skills: [{ agent: 'hector', name: 'Research a question' }], refused: [] }, version: 1 });
    t.push({ kind: 'snapshot', store: 'connectors', data: [{ id: 'slack', name: 'Slack', enabled: true }], version: 1 });
    expect(data.more.settings()).toMatchObject({ approvalMode: true });
    expect(data.more.teams().map((x: any) => x.id)).toEqual(['user_research']);
    expect(data.more.skills().skills.map((x: any) => x.name)).toEqual(['Research a question']);
    expect(data.more.connectors().map((x: any) => x.id)).toEqual(['slack']);
  });

  it('before anything arrives: no settings yet, and empty lists', () => {
    const data = createRemoteData(fakeTransport());
    expect(data.more.settings()).toBeNull();
    expect(data.more.teams()).toEqual([]);
    expect(data.more.skills()).toEqual({ skills: [], refused: [] });
    expect(data.more.connectors()).toEqual([]);
  });
});

describe('Memory, Projects and Boardroom on the phone', () => {
  beforeEach(() => localStorage.clear());

  it('mirrored part-A stores show in more', () => {
    const t = fakeTransport();
    const data = createRemoteData(t);
    t.push({ kind: 'snapshot', store: 'memory', data: { decisions: [{ id: 'd1', text: 'Post on Tuesdays' }], cleanup: null }, version: 1 });
    t.push({ kind: 'snapshot', store: 'projects', data: [{ id: 'p1', name: 'Shop', latestRequestId: null }], version: 1 });
    t.push({ kind: 'snapshot', store: 'boardroom', data: { threads: [{ id: 't1', topic: 'Launch' }], messages: { t1: [] } }, version: 1 });
    expect(data.more.memory().decisions.map((d: any) => d.id)).toEqual(['d1']);
    expect(data.more.projects().map((p: any) => p.id)).toEqual(['p1']);
    expect(data.more.boardroom().threads.map((x: any) => x.id)).toEqual(['t1']);
  });

  it('before anything arrives, the stores are empty, not missing', () => {
    const data = createRemoteData(fakeTransport());
    expect(data.more.memory()).toEqual({ decisions: [], cleanup: null });
    expect(data.more.projects()).toEqual([]);
    expect(data.more.boardroom()).toEqual({ threads: [], messages: {} });
  });

  it('offline, a search says the computer is offline and sends nothing', async () => {
    const t = fakeTransport();
    const data = createRemoteData(t);
    t.goOffline(Date.UTC(2026, 10, 2, 14, 2));
    const result = await data.more.call('memory.search', { query: 'slack' });
    expect(result).toEqual({ ok: false, reason: offlineLine(t.offlineSince()) });
    expect(t.calls.filter((c) => c.name === 'memory.search')).toHaveLength(0);
    expect(data.more.readOnly).toBe(true);
  });

  it('online, a call returns the computer’s answer', async () => {
    const t = fakeTransport();
    const data = createRemoteData(t);
    await expect(data.more.call('project.start', { id: 'p1' })).resolves.toMatchObject({ ok: true });
    expect(t.calls.at(-1)).toMatchObject({ name: 'project.start', args: { id: 'p1' } });
  });
});

describe('remoteData: answering on the phone (phase 4)', () => {
  const KEY = 'sk-or-v1-abcdef1234567890abcdef1234567890';
  const decision = { id: 'd1', kind: 'decision', text: 'The spring launch is on Friday 14 March', topics: [], source: { surface: 'chat', by: 'echo' }, atMs: 1, status: 'active' };
  beforeEach(() => localStorage.clear());

  async function offlineWithQueued(ask: (system: string, prompt: string) => Promise<string>, text = 'When is the spring launch?') {
    const t = fakeTransport();
    t.snapshots.push({ requests: [], stepOutputs: {}, chat: [], computer: {}, memory: { decisions: [decision], cleanup: null } });
    const asks = { phone: vi.fn(async () => ask), openrouter: vi.fn(async () => null) };
    const data = createRemoteData(t, {}, {}, { asks });
    await data.reconnected();
    t.goOffline(1000);
    await data.chat.send(text);
    const id = data.chat.messages().find((m) => m.queued)!.id;
    return { t, data, id, asks };
  }

  it('takes the message out of the outbox before asking, then shows the answer with where it came from', async () => {
    let outboxWhileAsking = 'unset';
    const { data, id } = await offlineWithQueued(async (system) => {
      outboxWhileAsking = localStorage.getItem('alphonso_phone_outbox_v1') || '';
      return system ? 'Friday 14 March.' : '{"route":"direct"}';
    });
    await data.chat.answerHere(id, 'phone');
    expect(JSON.parse(outboxWhileAsking)).toEqual([]);
    const shown = data.chat.messages();
    expect(shown.map((m) => [m.role, m.text, m.answeredBy, m.queued])).toEqual([
      ['user', 'When is the spring launch?', undefined, undefined],
      ['assistant', 'Friday 14 March.', 'phone', undefined],
    ]);
    expect(JSON.parse(localStorage.getItem('alphonso_phone_local_answers_v1') || '[]')).toHaveLength(1);
  });

  it('puts a message the phone may not answer back in the outbox, with why', async () => {
    const { data, id } = await offlineWithQueued(async () => 'should not be asked', 'send Sam the meeting notes');
    await data.chat.answerHere(id, 'phone');
    const m = data.chat.messages().find((x) => x.id === id)!;
    expect(m.queued).toBe(true);
    expect(m.note).toBe(NEEDS_COMPUTER);
    expect(m.text).toBe('send Sam the meeting notes');
  });

  it('puts it back with the reason when the model fails', async () => {
    const { data, id } = await offlineWithQueued(async (system) => {
      if (!system) return '{"route":"direct"}';
      throw new Error("OpenRouter couldn't be reached.");
    });
    await data.chat.answerHere(id, 'phone');
    expect(data.chat.messages().find((x) => x.id === id)).toMatchObject({ queued: true, note: "OpenRouter couldn't be reached." });
  });

  it("an engine that can't be used leaves the message waiting with why", async () => {
    const { data, id } = await offlineWithQueued(async () => 'x');
    await data.chat.answerHere(id, 'openrouter');
    expect(data.chat.messages().find((x) => x.id === id)).toMatchObject({ queued: true, note: expect.stringContaining('OpenRouter') });
  });

  it('copies each phone answer to the computer once when it is back, then shows it once', async () => {
    const { t, data, id } = await offlineWithQueued(async (system) => (system ? 'Friday 14 March.' : '{"route":"direct"}'));
    await data.chat.answerHere(id, 'phone');
    t.snapshots.push({ requests: [], stepOutputs: {}, chat: [], computer: {} });
    t.goOnline();
    await flush(); await flush();
    const copies = t.calls.filter((c) => c.name === 'chat.phoneAnswered');
    expect(copies).toHaveLength(1);
    expect(copies[0].args).toMatchObject({ messageId: id, question: 'When is the spring launch?', answer: 'Friday 14 March.', answeredBy: 'phone' });
    expect(t.calls.filter((c) => c.name === 'chat.send')).toHaveLength(0);
    // The computer's conversation now holds it: shown once.
    t.push({ kind: 'change', store: 'chat', data: [
      { id, role: 'user', text: 'When is the spring launch?', atMs: 1 },
      { id: `${id}-a`, role: 'assistant', text: 'Friday 14 March.', atMs: 1, answeredBy: 'phone' },
    ], version: 1 });
    expect(data.chat.messages()).toHaveLength(2);
    t.goOffline(2000);
    t.snapshots.push({ requests: [], stepOutputs: {}, chat: [], computer: {} });
    t.goOnline();
    await flush(); await flush();
    expect(t.calls.filter((c) => c.name === 'chat.phoneAnswered')).toHaveLength(1);
  });

  it('sends a message back to the computer at once when it came back while the phone was deciding', async () => {
    let release: (v: string) => void = () => {};
    const { t, data, id } = await offlineWithQueued(() => new Promise((r) => { release = r; }), 'thanks, that was really helpful');
    const answering = data.chat.answerHere(id, 'phone');
    await flush();
    t.snapshots.push({ requests: [], stepOutputs: {}, chat: [], computer: {} });
    t.goOnline();
    await flush(); await flush();
    release('{"route":"plan"}');
    await answering;
    await flush();
    expect(t.calls.filter((c) => c.name === 'chat.send').map((c) => c.args.messageId)).toEqual([id]);
    expect(data.chat.messages().some((m) => m.queued)).toBe(false);
  });

  it('never keeps or sends a key, and ignores a second tap while answering', async () => {
    let release: (v: string) => void = () => {};
    const { t, data, id } = await offlineWithQueued((system) => (system ? new Promise((r) => { release = r; }) : Promise.resolve('{"route":"direct"}')));
    const first = data.chat.answerHere(id, 'phone');
    await flush();
    expect(data.chat.answering()).toBe(id);
    await data.chat.answerHere(id, 'phone');
    release('Friday.');
    await first;
    expect(data.chat.answering()).toBeNull();
    t.snapshots.push({ requests: [], stepOutputs: {}, chat: [], computer: {} });
    t.goOnline();
    await flush(); await flush();
    expect(JSON.stringify(t.calls)).not.toContain(KEY);
    expect(Object.values({ ...localStorage }).join('')).not.toContain(KEY);
    expect(data.chat.messages().filter((m) => m.role === 'assistant')).toHaveLength(1);
  });
});
