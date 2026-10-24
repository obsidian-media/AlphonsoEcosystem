import { beforeEach, describe, expect, it, vi } from 'vitest';

// Jose on Telegram (phase 5): notifications with buttons, and button presses
// and /approve that carry the request on.
const mockInvoke = vi.fn(async () => ({ ok: true }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args) => mockInvoke(...args), isTauri: vi.fn(() => true) }));
vi.mock('../../services/connectors/connectorAuth', () => ({ getConnectorCredential: vi.fn(() => 'tok'), getConnectorCredentials: vi.fn(() => ({})) }));
vi.mock('../../lib/appStorage', () => ({
  getStorage: vi.fn((key) => (key === 'alphonso_telegram_owner_chat_id' ? '42' : null)),
  setStorage: vi.fn(),
}));
vi.mock('../../services/agentBusService', () => ({
  listApprovalQueue: vi.fn(() => globalThis.__tgQueue || []),
  approvePacket: vi.fn(),
  rejectPacket: vi.fn(),
  getPacketById: vi.fn((id) => (globalThis.__tgQueue || []).find((p) => p.id === id) || null),
  AGENTS: { JOSE: 'jose' },
}));
vi.mock('../../services/joseCommandRouterService', () => ({ createJoseCommandRoute: vi.fn(), listJoseCommands: vi.fn(() => globalThis.__tgCommands || []) }));
vi.mock('../../services/memoryService', () => ({ listMemoryItems: vi.fn(() => []) }));
vi.mock('../../services/agentActivityService', () => ({ listAgentActivity: vi.fn(() => globalThis.__tgActivity || []) }));
vi.mock('../../services/sentinelSecurityService', () => ({ scanForThreats: vi.fn() }));
vi.mock('../../services/novaAnalysisService', () => ({ getOpportunityHistory: vi.fn(() => []) }));
vi.mock('../../services/orchestrationReceiptService', () => ({ listOrchestrationReceipts: vi.fn(() => []) }));
vi.mock('../../agents/agentRegistry', () => ({ listAgentProfiles: vi.fn(() => []) }));
vi.mock('../../services/joseExecutionEngineService', () => ({
  approveRequestStep: vi.fn(async () => ({ ok: true, summary: 'done' })),
  rejectRequestStep: vi.fn(() => ({ ok: true, summary: 'Rejected.' })),
  carryOnRequest: vi.fn(async () => ({ ok: true })),
  executeApprovedPackets: vi.fn(async () => ({ ok: true, summary: 'done' })),
}));
vi.mock('../../services/jose/submitToJose', () => ({ runApprovedPlan: vi.fn(async () => ({ ok: true })), cancelPlan: vi.fn() }));

import { handleJoseButton, runPushWatcher, handleApproveCommand, handleRejectCommand, stopTelegramCompanion } from '../../services/telegramCompanionService';
import { approveRequestStep, rejectRequestStep, carryOnRequest, executeApprovedPackets } from '../../services/joseExecutionEngineService';
import { runApprovedPlan, cancelPlan } from '../../services/jose/submitToJose';
import { approvePacket } from '../../services/agentBusService';
import { buttonToken } from '../../services/jose/joseTelegram';
import { createJoseRequest, setJoseRequestStatus, updateJoseStep, createWaitingPlanRequest } from '../../services/jose/joseRequestStore';

const sends = () => mockInvoke.mock.calls.filter(([cmd]) => cmd === 'connector_send_telegram').map(([, args]) => args);
const press = (data, chatId = '42') => handleJoseButton('tok', { chatId, callbackId: 'cb', callbackData: data });

function waitingRequest() {
  const request = createJoseRequest({ commandId: 'c1', source: 'user', text: 'Post the launch video', kind: 'normal',
    steps: [{ stepId: 'post', agent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send'], needs: [], instruction: 'Post it.' }] });
  updateJoseStep(request.id, 'post', { status: 'waiting_approval' });
  setJoseRequestStatus(request.id, 'waiting_approval');
  return request.id;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('alphonso_jose_telegram_sent_v1', '[]'); // not the first run
  vi.clearAllMocks();
  globalThis.__tgQueue = [];
  globalThis.__tgActivity = [];
  globalThis.__tgCommands = [];
  stopTelegramCompanion();
});

describe('Jose notifications on Telegram', () => {
  it('sends a waiting step with Approve and Reject buttons, once', async () => {
    waitingRequest();
    await runPushWatcher('tok');
    await runPushWatcher('tok');
    const sent = sends().filter((s) => /wants to/.test(s.text));
    expect(sent).toHaveLength(1);
    expect(sent[0].chatId).toBe('42');
    expect(sent[0].buttons[0].map((b) => b.text)).toEqual(['Approve', 'Reject']);
    expect(sent[0].buttons[0][0].data).toMatch(/^j:[A-Za-z0-9]{8}$/);
  });

  it("doesn't also send the old approval message for a request's packet", async () => {
    waitingRequest();
    globalThis.__tgQueue = [{ id: 'p1', title: 'Post', payload: { joseCommandId: 'c1', assignment: { stepId: 'post' } } }];
    await runPushWatcher('tok');
    expect(sends().some((s) => /Approval needed/.test(s.text))).toBe(false);
  });

  it('counts the history as sent the first time it runs', async () => {
    localStorage.removeItem('alphonso_jose_telegram_sent_v1');
    waitingRequest();
    await runPushWatcher('tok');
    expect(sends().some((s) => /wants to/.test(s.text))).toBe(false);
  });
});

describe('Telegram buttons', () => {
  it('Approve from your chat carries the request on', async () => {
    const id = waitingRequest();
    const token = buttonToken({ text: 'Approve', action: 'approve', requestId: id, stepId: 'post' });
    expect(await press(token)).toBe('Approved. Marcus carries on.');
    expect(approveRequestStep).toHaveBeenCalledWith(id, 'post');
  });

  it('a press from another chat does nothing', async () => {
    const id = waitingRequest();
    const token = buttonToken({ text: 'Approve', action: 'approve', requestId: id, stepId: 'post' });
    expect(await press(token, '999')).toBe('Unauthorized.');
    expect(approveRequestStep).not.toHaveBeenCalled();
  });

  it('an unknown or old button has expired', async () => {
    expect(await press('j:nothere1')).toBe('That button has expired.');
  });

  it('pressing Approve twice runs it once', async () => {
    const id = waitingRequest();
    const token = buttonToken({ text: 'Approve', action: 'approve', requestId: id, stepId: 'post' });
    vi.mocked(approveRequestStep).mockImplementationOnce(async () => { setJoseRequestStatus(id, 'running'); return { ok: true }; });
    await press(token);
    expect(await press(token)).toBe('Already done.');
    expect(approveRequestStep).toHaveBeenCalledTimes(1);
  });

  it('Reject cancels the request', async () => {
    const id = waitingRequest();
    expect(await press(buttonToken({ text: 'Reject', action: 'reject', requestId: id, stepId: 'post' }))).toBe('Rejected. The request was cancelled.');
    expect(rejectRequestStep).toHaveBeenCalledWith(id, 'post');
  });

  it('Run and Cancel on a waiting plan', async () => {
    const plan = () => createWaitingPlanRequest({ text: 'Plan', source: 'user', kind: 'normal',
      steps: [{ stepId: 'a', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [] }],
      plan: { source: 'fresh', templateId: null, note: '' }, runOptions: { source: 'user' } });
    const a = plan();
    expect(await press(buttonToken({ text: 'Run this plan', action: 'run', requestId: a.id }))).toBe('Running the plan.');
    expect(runApprovedPlan).toHaveBeenCalledWith(a.id);
    const b = plan();
    expect(await press(buttonToken({ text: 'Cancel', action: 'cancel', requestId: b.id }))).toBe('Cancelled.');
    expect(cancelPlan).toHaveBeenCalledWith(b.id);
  });

  it('Carry on resumes a request cut off when the app closed', async () => {
    const request = createJoseRequest({ commandId: 'c2', source: 'user', text: 'x', kind: 'normal', steps: [] });
    setJoseRequestStatus(request.id, 'interrupted');
    expect(await press(buttonToken({ text: 'Carry on', action: 'carry_on', requestId: request.id }))).toBe('Carrying on.');
    expect(carryOnRequest).toHaveBeenCalledWith(request.id);
  });
});

describe('/approve and /reject for a request\'s step', () => {
  it('/approve carries the request on instead of only marking the packet', async () => {
    waitingRequest();
    globalThis.__tgQueue = [{ id: 'p1', title: 'Post', payload: { joseCommandId: 'c1', assignment: { stepId: 'post' } } }];
    await handleApproveCommand('tok', '42', 'p1');
    expect(executeApprovedPackets).toHaveBeenCalledWith(['p1']);
    expect(approvePacket).not.toHaveBeenCalled();
  });

  it('/reject cancels the request', async () => {
    const id = waitingRequest();
    globalThis.__tgQueue = [{ id: 'p1', title: 'Post', payload: { joseCommandId: 'c1', assignment: { stepId: 'post' } } }];
    await handleRejectCommand('tok', '42', 'p1');
    expect(rejectRequestStep).toHaveBeenCalledWith(id, 'post');
  });
});

describe('the older notifier', () => {
  const activity = () => [1, 2, 3].map((i) => ({ agent: 'connector', action: `check ${i}` }));

  it('sends no agent-activity summaries unless you switch them on', async () => {
    globalThis.__tgActivity = activity();
    await runPushWatcher('tok');
    expect(sends().some((s) => /agent actions since your last check/.test(s.text))).toBe(false);
  });

  it('sends them when switched on in Settings', async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ joseTelegram: { activitySummaries: true } }));
    globalThis.__tgActivity = activity();
    await runPushWatcher('tok');
    expect(sends().some((s) => /agent actions since your last check/.test(s.text))).toBe(true);
  });

  it("doesn't repeat Jose's Done line with an old 'completed a task' message", async () => {
    const request = createJoseRequest({ commandId: 'c9', source: 'user', text: 'x', kind: 'normal', steps: [] });
    setJoseRequestStatus(request.id, 'done');
    globalThis.__tgCommands = [{ id: 'c9', status: 'reported_to_user', commandText: 'x', userReport: { summary: 'ok' } }];
    await runPushWatcher('tok');
    expect(sends().some((s) => /Jose completed a task/.test(s.text))).toBe(false);
  });
});

// Phase 4a: the content factory's 7-day summaries and ideas, with their own buttons.
describe('content notifications on Telegram', () => {
  it('sends a new idea with Start project and Dismiss, once, and a press starts the project', async () => {
    const { saveBrand } = await import('../../services/contentFactory/contentBrandService');
    const { saveIdeas } = await import('../../services/contentFactory/contentIdeas');
    const { listProjects } = await import('../../services/contentFactory/contentProjectService');
    const brand = saveBrand({ name: 'Acme' });
    saveIdeas(brand.id, ['Part two'], { projectId: 'p', postId: 'a' });
    await runPushWatcher('tok');
    await runPushWatcher('tok');
    const sent = sends().filter((s) => /New idea for Acme/.test(s.text));
    expect(sent).toHaveLength(1);
    expect(sent[0].buttons[0].map((b) => b.text)).toEqual(['Start project', 'Dismiss']);
    expect(sent[0].buttons[0][0].data).toMatch(/^c:[A-Za-z0-9]{8}$/);
    expect(await press(sent[0].buttons[0][0].data)).toBe('Project started: Part two.');
    expect(listProjects(brand.id).map((p) => p.name)).toEqual(['Part two']);
  });

  it('a content button from another chat does nothing', async () => {
    const { contentButtonToken } = await import('../../services/contentFactory/contentTelegram');
    expect(await press(contentButtonToken({ action: 'dismiss', ref: 'x' }), '999')).toBe('Unauthorized.');
  });
});

