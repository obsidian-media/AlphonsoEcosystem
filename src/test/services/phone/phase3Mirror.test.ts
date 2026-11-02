// Phone app phase 3 part A (owner, 2026-11-02): memory, projects and Boardroom reach the phone,
// small (50 decisions, 30 messages a thread), with keys hidden and masked messages never sent.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null), isTauri: () => false }));

const { memoryMirrorData, projectsMirrorData, boardroomMirrorData, PHONE_DECISIONS, PHONE_THREAD_MESSAGES, MASKED_LINE, BOARDROOM_MIRROR_BYTES } = await import('../../../services/phone/phase3Mirror');
const { mirrorSnapshots } = await import('../../../services/phone/phoneMirror');
const { saveCleanupSet } = await import('../../../services/echo/cleanupStore');
const { createThread, addThreadMessage } = await import('../../../services/boardroomThreadService');

const decision = (i: number, text = `Decision ${i}`) => ({
  id: `d-${i}`, kind: 'decision', text, why: '', topics: [], appliesTo: [], source: { surface: 'chat' }, status: 'active', atMs: 1000 + i,
});

beforeEach(() => { localStorage.clear(); });

describe('phase 3 part A mirror', () => {
  it('sends the newest 50 active decisions', () => {
    localStorage.setItem('alphonso_echo_decisions_v1', JSON.stringify(Array.from({ length: 60 }, (_, i) => decision(i))));
    const { decisions } = memoryMirrorData();
    expect(PHONE_DECISIONS).toBe(50);
    expect(decisions).toHaveLength(50);
    expect(decisions[0].id).toBe('d-59');
  });

  it('an open clean-up comes with the step that waits for it', () => {
    saveCleanupSet({ requestId: 'req-1', stepId: 'echo', proposals: [{ id: 'p1', kind: 'drop', ids: ['d-1'], reason: 'old' }] } as never);
    const { cleanup } = memoryMirrorData();
    expect(cleanup).toMatchObject({ requestId: 'req-1', stepId: 'echo', proposals: [expect.objectContaining({ id: 'p1' })] });
    expect(typeof cleanup?.setId).toBe('string');
  });

  it("a project's latest run is its newest one", () => {
    localStorage.setItem('alphonso_projects_v2', JSON.stringify([{ id: 'p1', name: 'Shop', intake: { name: 'Shop', description: 'x' }, runs: [{ requestId: 'r-old', atMs: 1 }, { requestId: 'r-new', atMs: 2 }], createdAtMs: 1 }]));
    expect(projectsMirrorData()[0]).toMatchObject({ id: 'p1', latestRequestId: 'r-new' });
  });

  it('keeps the last 30 messages of a thread', () => {
    const t = createThread({ topic: 'Launch', participants: ['maria'] });
    for (let i = 0; i < 40; i += 1) addThreadMessage({ threadId: t.id, speaker: 'user', content: `m${i}` });
    const { threads, messages } = boardroomMirrorData();
    expect(PHONE_THREAD_MESSAGES).toBe(30);
    expect(threads.map((x) => x.id)).toEqual([t.id]);
    expect(messages[t.id]).toHaveLength(30);
    expect(messages[t.id][29].content).toBe('m39');
  });

  it("a masked message's text never leaves the computer before the reveal", () => {
    const t = createThread({ topic: 'Risky', participants: ['maria'] });
    const m = addThreadMessage({ threadId: t.id, speaker: 'maria', content: 'Wire the money to account 12345678 today.' });
    // Mark it as needing the reveal, as the risk check does.
    const all = JSON.parse(localStorage.getItem('alphonso_boardroom_thread_messages_v2') || '[]');
    localStorage.setItem('alphonso_boardroom_thread_messages_v2', JSON.stringify(all.map((x: { id: string }) => (x.id === m?.id ? { ...x, approvalRequired: true, confirmed: false } : x))));
    const shown = boardroomMirrorData().messages[t.id][0];
    expect(shown).toMatchObject({ content: MASKED_LINE, masked: true });
    expect(JSON.stringify(mirrorSnapshots())).not.toContain('account 12345678');
  });

  it('many long threads stay within the Boardroom budget, newest first', () => {
    const threads = Array.from({ length: 120 }, (_, i) => ({ id: `t${i}`, topic: `Topic ${i}`, participants: [], status: 'active', createdAt: '', createdAtMs: i, seq: i, updatedAt: '', updatedAtMs: i }));
    const messages = threads.flatMap((t) => Array.from({ length: 30 }, (_, j) => ({ id: `${t.id}-m${j}`, threadId: t.id, speaker: 'maria', content: 'x'.repeat(3000), kind: 'message', riskLevel: 'low', approvalRequired: false, secretRedacted: false, mentionedAgents: [], acknowledged: false, confirmed: false, createdAt: '', createdAtMs: j, seq: j })));
    localStorage.setItem('alphonso_boardroom_threads_v2', JSON.stringify(threads));
    localStorage.setItem('alphonso_boardroom_thread_messages_v2', JSON.stringify(messages));
    const data = boardroomMirrorData();
    expect(JSON.stringify(data).length).toBeLessThanOrEqual(BOARDROOM_MIRROR_BYTES);
    expect(data.threads[0].id).toBe('t119');
    expect(data.threads.length).toBeGreaterThan(0);
    expect(data.threads.every((t) => data.messages[t.id]?.length === 30)).toBe(true);
  });

  it('hides a key inside a decision', () => {
    localStorage.setItem('alphonso_echo_decisions_v1', JSON.stringify([decision(1, 'Use the key sk-abcdefghijklmnopqrstuvwxyz0123 for Slack')]));
    expect(JSON.stringify(mirrorSnapshots().memory)).not.toContain('sk-abcdefghijklmnopqrstuvwxyz0123');
  });
});
