import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendToolConnectionMessageMock, listToolConnectionsMock, appendSessionEventMock } = vi.hoisted(() => ({
  sendToolConnectionMessageMock: vi.fn(),
  listToolConnectionsMock: vi.fn(),
  appendSessionEventMock: vi.fn()
}));

vi.mock('../services/toolConnectionService', () => ({
  sendToolConnectionMessage: sendToolConnectionMessageMock,
  listToolConnections: listToolConnectionsMock
}));

vi.mock('../services/sessionIntelligenceService', () => ({
  appendSessionEvent: appendSessionEventMock
}));

import { dispatchReceiptNotifications } from '../services/toolNotificationDispatcher';

describe('toolNotificationDispatcher', () => {
  beforeEach(() => {
    sendToolConnectionMessageMock.mockReset();
    listToolConnectionsMock.mockReset();
    appendSessionEventMock.mockReset();
    listToolConnectionsMock.mockReturnValue([
      {
        id: 'slack-1',
        label: 'Slack Alerts',
        platform: 'slack',
        active: true,
        notifyOn: ['approval', 'blocked', 'executed', 'failed']
      },
      {
        id: 'discord-1',
        label: 'Discord Alerts',
        platform: 'discord',
        active: true,
        notifyOn: ['executed']
      },
      {
        id: 'custom-1',
        label: 'Custom',
        platform: 'custom',
        active: false,
        notifyOn: ['approval']
      }
    ]);
    sendToolConnectionMessageMock.mockResolvedValue({ ok: true });
  });

  it('fans out approval receipts to matching active connections', async () => {
    const result = await dispatchReceiptNotifications({
      id: 'receipt-1',
      workflowId: 'wf-approval',
      eventType: 'approval_created',
      status: 'pending',
      approved: false,
      blocked: false,
      setupRequired: false
    });

    expect(result.ok).toBe(true);
    expect(result.sent).toBe(1);
    expect(sendToolConnectionMessageMock).toHaveBeenCalledTimes(1);
    expect(sendToolConnectionMessageMock.mock.calls[0][0]).toBe('slack-1');
    expect(sendToolConnectionMessageMock.mock.calls[0][2]).toMatchObject({
      approved: true,
      internalDispatch: true
    });
  });

  it('skips tool connection workflows to avoid notification loops', async () => {
    const result = await dispatchReceiptNotifications({
      id: 'receipt-2',
      workflowId: 'tool_connection_registry',
      eventType: 'approval_created',
      status: 'pending'
    });

    expect(result.skipped).toBe(true);
    expect(sendToolConnectionMessageMock).not.toHaveBeenCalled();
  });
});

