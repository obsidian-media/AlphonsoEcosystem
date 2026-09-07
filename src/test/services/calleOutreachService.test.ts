import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAppendAgentActivity = vi.fn();
vi.mock('../../services/agentActivityService', () => ({
  appendAgentActivity: (...args: unknown[]) => mockAppendAgentActivity(...args)
}));

const mockCreateCall = vi.fn();
const mockGetCall = vi.fn();
const mockPollCallUntilTerminal = vi.fn();
vi.mock('../../services/connectors/calleConnector', () => ({
  createCall: (...args: unknown[]) => mockCreateCall(...args),
  getCall: (...args: unknown[]) => mockGetCall(...args),
  pollCallUntilTerminal: (...args: unknown[]) => mockPollCallUntilTerminal(...args)
}));

vi.mock('../../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: vi.fn(() => 'test-api-key')
}));

import {
  createOutreachDraft,
  dismissOutreachCall,
  listOutreachCalls,
  runOutreachCall,
  recoverInterruptedOutreachCalls
} from '../../services/calleOutreachService';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('createOutreachDraft', () => {
  it('creates a pending_approval record with a stable idempotencyKey', () => {
    const record = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });

    expect(record.status).toBe('pending_approval');
    expect(record.idempotencyKey).toBeTruthy();
    expect(listOutreachCalls()).toHaveLength(1);
  });

  it('returns the existing record instead of creating a duplicate for a non-terminal phone number', () => {
    const first = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    const second = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });

    expect(second.id).toBe(first.id);
    expect(listOutreachCalls()).toHaveLength(1);
  });

  it('allows a new draft once the prior record for that phone is dismissed', () => {
    const first = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    dismissOutreachCall(first.id);
    const second = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });

    expect(second.id).not.toBe(first.id);
    expect(listOutreachCalls()).toHaveLength(2);
  });
});

describe('dismissOutreachCall', () => {
  it('sets status to dismissed', () => {
    const record = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    dismissOutreachCall(record.id);

    const updated = listOutreachCalls().find((r) => r.id === record.id);
    expect(updated?.status).toBe('dismissed');
  });
});

describe('runOutreachCall', () => {
  it('resolves as soon as createCall resolves, without waiting for a slow pollCallUntilTerminal', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    mockCreateCall.mockResolvedValue({ id: 'call_1', status: 'queued' });
    let resolvePoll: (value: unknown) => void = () => {};
    mockPollCallUntilTerminal.mockReturnValue(new Promise((resolve) => { resolvePoll = resolve; }));

    const result = await runOutreachCall(draft.id, { approved: true });

    expect(result.status).toBe('queued');
    expect(mockCreateCall).toHaveBeenCalled();
    expect(mockPollCallUntilTerminal).toHaveBeenCalled();
    resolvePoll({ status: 'completed', structuredResult: null, summary: null, recipients: [] });
  });

  it('reuses the same idempotencyKey across a retry', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    mockCreateCall.mockResolvedValue({ id: 'call_1', status: 'queued' });
    mockPollCallUntilTerminal.mockReturnValue(new Promise(() => {}));

    await runOutreachCall(draft.id, { approved: true });
    await runOutreachCall(draft.id, { approved: true });

    expect(mockCreateCall.mock.calls[0][2]).toBe(draft.idempotencyKey);
    expect(mockCreateCall.mock.calls[1][2]).toBe(draft.idempotencyKey);
  });

  it('sets policyBlockKind and keeps status pending_approval when createCall throws a policy-gate error', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    mockCreateCall.mockRejectedValue(new Error('Approval Mode requires explicit approval for this action.'));

    const result = await runOutreachCall(draft.id, { approved: false });

    expect(result.status).toBe('pending_approval');
    expect(result.policyBlockKind).toBe('needs_approval_click');
  });

  it('sets status failed_to_start (not pending_approval) when createCall throws a genuine API error', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    mockCreateCall.mockRejectedValue(new Error('CALL-E API error (400): Invalid phone number'));

    const result = await runOutreachCall(draft.id, { approved: true });

    expect(result.status).toBe('failed_to_start');
    expect(result.policyBlockKind).toBeNull();
    expect(result.error).toContain('Invalid phone number');
  });

  it('persists in_progress status updates as pollCallUntilTerminal reports onProgress, before the terminal result arrives', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    mockCreateCall.mockResolvedValue({ id: 'call_1', status: 'queued' });
    let capturedOnProgress: ((call: any) => void) | undefined;
    mockPollCallUntilTerminal.mockImplementation((_apiKey: string, _callId: string, opts: { onProgress?: (call: any) => void }) => {
      capturedOnProgress = opts?.onProgress;
      return new Promise(() => {});
    });

    await runOutreachCall(draft.id, { approved: true });
    capturedOnProgress?.({ status: 'in_progress' });

    const updated = listOutreachCalls().find((r) => r.id === draft.id);
    expect(updated?.status).toBe('in_progress');
  });

  it('calls appendAgentActivity attributed to marcus', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    mockCreateCall.mockResolvedValue({ id: 'call_1', status: 'queued' });
    mockPollCallUntilTerminal.mockReturnValue(new Promise(() => {}));

    await runOutreachCall(draft.id, { approved: true });

    expect(mockAppendAgentActivity).toHaveBeenCalledWith(expect.objectContaining({ agent: 'marcus' }));
  });

  it('updates the record with structuredResult/summary/transcript once the fire-and-forget poll resolves', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    mockCreateCall.mockResolvedValue({ id: 'call_1', status: 'queued' });
    let resolvePoll: (value: unknown) => void = () => {};
    mockPollCallUntilTerminal.mockReturnValue(new Promise((resolve) => { resolvePoll = resolve; }));

    await runOutreachCall(draft.id, { approved: true });
    resolvePoll({
      status: 'completed',
      structuredResult: { interested_in_website: 'yes' },
      summary: 'They are interested.',
      recipients: [{ attempts: [{ transcriptTurns: [{ speaker: 'bot', text: 'Hello' }] }] }]
    });
    await new Promise((r) => setTimeout(r, 0));

    const updated = listOutreachCalls().find((r) => r.id === draft.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.structuredResult).toEqual({ interested_in_website: 'yes' });
    expect(updated?.transcript).toEqual([{ speaker: 'bot', text: 'Hello' }]);
  });

  it('leaves status as in_progress (not a new terminal value) when the fire-and-forget poll rejects with a timeout', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    mockCreateCall.mockResolvedValue({ id: 'call_1', status: 'in_progress' });
    let rejectPoll: (reason: unknown) => void = () => {};
    mockPollCallUntilTerminal.mockReturnValue(new Promise((_, reject) => { rejectPoll = reject; }));

    await runOutreachCall(draft.id, { approved: true });
    rejectPoll(new Error('did not reach a terminal state'));
    await new Promise((r) => setTimeout(r, 0));

    const updated = listOutreachCalls().find((r) => r.id === draft.id);
    expect(updated?.status).toBe('in_progress');
    expect(updated?.error).toContain('did not reach a terminal state');
  });
});

describe('recoverInterruptedOutreachCalls', () => {
  it('checks getCall exactly once for a record left in_progress and updates it if now terminal', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    const rows = JSON.parse(localStorage.getItem('alphonso_calle_outreach_v1') || '[]');
    rows[0].status = 'in_progress';
    rows[0].calleCallId = 'call_1';
    localStorage.setItem('alphonso_calle_outreach_v1', JSON.stringify(rows));

    mockGetCall.mockResolvedValue({ id: 'call_1', status: 'completed', structuredResult: { interested_in_website: 'no' }, summary: 'Not interested.', recipients: [] });

    await recoverInterruptedOutreachCalls();

    expect(mockGetCall).toHaveBeenCalledTimes(1);
    const updated = listOutreachCalls().find((r) => r.id === draft.id);
    expect(updated?.status).toBe('completed');
  });

  it('leaves an already-terminal record untouched (no getCall call)', async () => {
    createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    const rows = JSON.parse(localStorage.getItem('alphonso_calle_outreach_v1') || '[]');
    rows[0].status = 'completed';
    localStorage.setItem('alphonso_calle_outreach_v1', JSON.stringify(rows));

    await recoverInterruptedOutreachCalls();

    expect(mockGetCall).not.toHaveBeenCalled();
  });

  it('leaves a record still non-terminal after the check as in_progress, checked exactly once via getCall', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    const rows = JSON.parse(localStorage.getItem('alphonso_calle_outreach_v1') || '[]');
    rows[0].status = 'in_progress';
    rows[0].calleCallId = 'call_1';
    localStorage.setItem('alphonso_calle_outreach_v1', JSON.stringify(rows));

    mockGetCall.mockResolvedValue({ id: 'call_1', status: 'in_progress' });
    mockPollCallUntilTerminal.mockReturnValue(new Promise(() => {}));

    await recoverInterruptedOutreachCalls();

    expect(mockGetCall).toHaveBeenCalledTimes(1);
    const updated = listOutreachCalls().find((r) => r.id === draft.id);
    expect(updated?.status).toBe('in_progress');
  });

  it('resumes bounded polling for a record still non-terminal at boot, so it eventually gets its terminal result without another restart', async () => {
    const draft = createOutreachDraft({ businessName: 'Joe\'s Pizza', phone: '+15550123456', taskType: 'outreach', task: '' });
    const rows = JSON.parse(localStorage.getItem('alphonso_calle_outreach_v1') || '[]');
    rows[0].status = 'in_progress';
    rows[0].calleCallId = 'call_1';
    localStorage.setItem('alphonso_calle_outreach_v1', JSON.stringify(rows));

    mockGetCall.mockResolvedValue({ id: 'call_1', status: 'in_progress' });
    let resolvePoll: (value: unknown) => void = () => {};
    mockPollCallUntilTerminal.mockReturnValue(new Promise((resolve) => { resolvePoll = resolve; }));

    await recoverInterruptedOutreachCalls();
    expect(mockPollCallUntilTerminal).toHaveBeenCalledWith('test-api-key', 'call_1', expect.objectContaining({ onProgress: expect.any(Function) }));

    resolvePoll({ status: 'completed', structuredResult: { interested_in_website: 'yes' }, summary: 'done', recipients: [] });
    await new Promise((r) => setTimeout(r, 0));

    const updated = listOutreachCalls().find((r) => r.id === draft.id);
    expect(updated?.status).toBe('completed');
  });
});
