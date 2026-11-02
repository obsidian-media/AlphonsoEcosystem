// Phone app phase 3 part A (owner, 2026-11-02): the phone's Memory, Projects and Boardroom calls,
// each mapped to the computer's own function.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null), isTauri: () => false }));
const searchDecisions = vi.fn();
vi.mock('../../../services/echo/recall', () => ({ searchDecisions: (...a: unknown[]) => searchDecisions(...a) }));
const applyCleanupStep = vi.fn();
const dismissCleanupStep = vi.fn();
vi.mock('../../../services/echo/echoPicks', () => ({
  applyCleanupStep: (...a: unknown[]) => applyCleanupStep(...a),
  dismissCleanupStep: (...a: unknown[]) => dismissCleanupStep(...a),
}));
const startProject = vi.fn();
vi.mock('../../../services/projects/projectStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/projects/projectStore')>()),
  startProject: (...a: unknown[]) => startProject(...a),
}));
const runBoardroomReplies = vi.fn();
const concludeThread = vi.fn();
const distributeThread = vi.fn();
const creativeBriefThread = vi.fn();
vi.mock('../../../services/boardroomReplies', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/boardroomReplies')>()),
  runBoardroomReplies: (...a: unknown[]) => runBoardroomReplies(...a),
  concludeThread: (...a: unknown[]) => concludeThread(...a),
  distributeThread: (...a: unknown[]) => distributeThread(...a),
  creativeBriefThread: (...a: unknown[]) => creativeBriefThread(...a),
}));

const { PHASE3_CALLS, STALE, resetPhase3CallsForTests } = await import('../../../services/phone/phase3Calls');
const { MASKED_LINE } = await import('../../../services/phone/phase3Mirror');
const { saveCleanupSet } = await import('../../../services/echo/cleanupStore');
const { PROJECT_NEEDS_TEXT, listProjects } = await import('../../../services/projects/projectStore');
const { createThread, addThreadMessage, listThreadMessages } = await import('../../../services/boardroomThreadService');

const call = (name: string, args: Record<string, unknown>) => (PHASE3_CALLS as Record<string, (a: Record<string, unknown>, d: string) => Promise<unknown>>)[name](args, 'phone-1');
const intake = (name: string, description: string) => ({ name, description, stack: '', deadline: '', type: '', features: '', constraints: '', risks: '', priority: 'medium' });

function maskedMessage(threadId: string, content: string) {
  const m = addThreadMessage({ threadId, speaker: 'maria', content });
  const all = JSON.parse(localStorage.getItem('alphonso_boardroom_thread_messages_v2') || '[]');
  localStorage.setItem('alphonso_boardroom_thread_messages_v2', JSON.stringify(all.map((x: { id: string }) => (x.id === m?.id ? { ...x, approvalRequired: true, confirmed: false } : x))));
  return m!;
}

beforeEach(() => {
  localStorage.clear();
  resetPhase3CallsForTests();
  for (const f of [searchDecisions, applyCleanupStep, dismissCleanupStep, startProject, runBoardroomReplies, concludeThread, distributeThread, creativeBriefThread]) f.mockReset();
  runBoardroomReplies.mockResolvedValue(undefined);
});

describe('memory calls', () => {
  it('memory.search returns at most 20 matches with keys hidden', async () => {
    searchDecisions.mockResolvedValue(Array.from({ length: 25 }, (_, i) => ({ id: `d${i}`, text: i === 0 ? 'key sk-abcdefghijklmnopqrstuvwxyz0123' : 'x' })));
    const found = await call('memory.search', { query: 'slack' }) as Array<{ text: string }>;
    expect(searchDecisions).toHaveBeenCalledWith('slack', { limit: 20 });
    expect(found).toHaveLength(20);
    expect(JSON.stringify(found)).not.toContain('sk-abcdefghijklmnopqrstuvwxyz0123');
  });

  it('an empty search is refused', async () => {
    await expect(call('memory.search', { query: '  ' })).rejects.toThrow();
  });

  it('memory.applyCleanup applies the open set through its waiting step', async () => {
    const set = saveCleanupSet({ requestId: 'req-1', stepId: 'echo', proposals: [] } as never);
    applyCleanupStep.mockResolvedValue({ ok: true, summary: 'Applied 1 change.' });
    await expect(call('memory.applyCleanup', { requestId: 'req-1', stepId: 'echo', setId: set.id })).resolves.toMatchObject({ summary: 'Applied 1 change.' });
    expect(applyCleanupStep).toHaveBeenCalledWith('req-1', 'echo');
  });

  it('a clean-up that is no longer the open one is refused as stale', async () => {
    saveCleanupSet({ requestId: 'req-1', stepId: 'echo', proposals: [] } as never);
    await expect(call('memory.applyCleanup', { requestId: 'req-1', stepId: 'echo', setId: 'cleanup-old' })).rejects.toThrow(STALE);
    expect(applyCleanupStep).not.toHaveBeenCalled();
  });

  it('a clean-up already applied says so', async () => {
    const set = saveCleanupSet({ requestId: 'req-1', stepId: 'echo', proposals: [] } as never);
    applyCleanupStep.mockResolvedValue({ ok: false, summary: 'Already done.' });
    await expect(call('memory.applyCleanup', { requestId: 'req-1', stepId: 'echo', setId: set.id })).rejects.toThrow('Already done.');
  });

  it('memory.dismissCleanup dismisses through the waiting step', async () => {
    const set = saveCleanupSet({ requestId: 'req-1', stepId: 'echo', proposals: [] } as never);
    dismissCleanupStep.mockResolvedValue({ ok: true, summary: 'Dismissed.' });
    await call('memory.dismissCleanup', { requestId: 'req-1', stepId: 'echo', setId: set.id });
    expect(dismissCleanupStep).toHaveBeenCalledWith('req-1', 'echo');
  });
});

describe('project calls', () => {
  it('project.create saves a project', async () => {
    const saved = await call('project.create', { intake: intake('Shop', 'An online shop') }) as { id: string };
    expect(listProjects().map((p) => p.id)).toEqual([saved.id]);
  });

  it('project.create without a name is refused', async () => {
    await expect(call('project.create', { intake: intake('', 'x') })).rejects.toThrow(PROJECT_NEEDS_TEXT);
  });

  it('project.start starts the saved project', async () => {
    startProject.mockResolvedValue({ ok: true, requestId: 'r1' });
    await expect(call('project.start', { id: 'p1' })).resolves.toMatchObject({ requestId: 'r1' });
    expect(startProject).toHaveBeenCalledWith('p1');
  });

  it('project.start that fails gives its reason', async () => {
    startProject.mockResolvedValue({ ok: false, reason: 'That project is no longer saved.' });
    await expect(call('project.start', { id: 'gone' })).rejects.toThrow('That project is no longer saved.');
  });
});

describe('Boardroom calls', () => {
  it('boardroom.createThread starts a thread with every agent', async () => {
    const t = await call('boardroom.createThread', { topic: 'Launch' }) as { participants: string[] };
    expect(t.participants).toEqual(expect.arrayContaining(['alphonso', 'maria', 'nova']));
  });

  it('boardroom.send answers at once and runs the replies with the phone approval', async () => {
    const t = createThread({ topic: 'Launch', participants: ['maria'] });
    await expect(call('boardroom.send', { threadId: t.id, text: '@maria hi', messageId: 'm1' })).resolves.toEqual({ messageId: 'm1' });
    expect(runBoardroomReplies).toHaveBeenCalledWith(expect.objectContaining({ threadId: t.id, text: '@maria hi' }));
  });

  it('the same message sent twice runs the replies once', async () => {
    const t = createThread({ topic: 'Launch', participants: ['maria'] });
    await call('boardroom.send', { threadId: t.id, text: 'hi', messageId: 'm1' });
    await call('boardroom.send', { threadId: t.id, text: 'hi', messageId: 'm1' });
    expect(runBoardroomReplies).toHaveBeenCalledTimes(1);
  });

  it('boardroom.earlier returns older messages, masked ones hidden', async () => {
    const t = createThread({ topic: 'Launch', participants: ['maria'] });
    for (let i = 0; i < 40; i += 1) addThreadMessage({ threadId: t.id, speaker: 'user', content: `m${i}` });
    maskedMessage(t.id, 'Wire to account 12345678');
    const all = listThreadMessages(t.id);
    const older = await call('boardroom.earlier', { threadId: t.id, beforeSeq: all[all.length - 30].seq }) as Array<{ content: string }>;
    expect(older.map((m) => m.content)).toEqual(Array.from({ length: 11 }, (_, i) => `m${i}`));
    const page = await call('boardroom.earlier', { threadId: t.id, beforeSeq: Number.MAX_SAFE_INTEGER }) as Array<{ content: string }>;
    expect(JSON.stringify(page)).not.toContain('12345678');
    expect(page.at(-1)?.content).toBe(MASKED_LINE);
  });

  it('boardroom.reveal confirms the message and returns its text', async () => {
    const t = createThread({ topic: 'Risky', participants: ['maria'] });
    const m = maskedMessage(t.id, 'Wire to account 12345678');
    await expect(call('boardroom.reveal', { messageId: m.id })).resolves.toMatchObject({ content: 'Wire to account 12345678' });
    expect(listThreadMessages(t.id)[0].confirmed).toBe(true);
  });

  it('boardroom.acknowledge acknowledges an escalation', async () => {
    const t = createThread({ topic: 'Launch', participants: ['maria'] });
    const m = addThreadMessage({ threadId: t.id, speaker: 'boardroom', content: 'Needs you', kind: 'escalation' });
    await call('boardroom.acknowledge', { messageId: m!.id });
    expect(listThreadMessages(t.id)[0].acknowledged).toBe(true);
  });

  it('thread actions call the same functions as the desktop', async () => {
    const t = createThread({ topic: 'Launch', participants: ['maria'] });
    distributeThread.mockResolvedValue(true);
    await call('boardroom.conclude', { threadId: t.id });
    await call('boardroom.distribute', { threadId: t.id, mode: 'slack', channel: '#news' });
    await call('boardroom.creativeBrief', { threadId: t.id });
    expect(concludeThread).toHaveBeenCalledWith(t.id);
    expect(distributeThread).toHaveBeenCalledWith(t.id, 'slack', '#news');
    expect(creativeBriefThread).toHaveBeenCalledWith(t.id);
  });

  it('distribute before Conclude is refused', async () => {
    const t = createThread({ topic: 'Launch', participants: ['maria'] });
    distributeThread.mockResolvedValue(false);
    await expect(call('boardroom.distribute', { threadId: t.id, mode: 'review' })).rejects.toThrow();
  });
});
