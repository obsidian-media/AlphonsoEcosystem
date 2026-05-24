import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock, requireApprovalMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  requireApprovalMock: vi.fn()
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock
}));

vi.mock('../services/approval/approvalService', () => ({
  requireApproval: requireApprovalMock
}));

import {
  buildToolConnectionPayload,
  listToolConnectionAudit,
  listToolConnections,
  removeToolConnection,
  sendToolConnectionMessage,
  upsertToolConnection
} from '../services/toolConnectionService';

describe('toolConnectionService', () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    requireApprovalMock.mockReset();
    requireApprovalMock.mockResolvedValue({ ok: true, approved: true });
    invokeMock.mockResolvedValue({
      ok: true,
      platform: 'slack',
      connectionName: 'Slack Alerts',
      webhookHost: 'hooks.slack.com',
      httpStatus: 200,
      responsePreview: '',
      sentAtMs: 123,
      trust: 'verified',
      error: null
    });
  });

  it('builds platform-specific payloads', () => {
    expect(buildToolConnectionPayload({ platform: 'slack', messagePrefix: 'Alphonso' }, 'hello')).toEqual({
      text: 'Alphonso hello',
      unfurl_links: false,
      unfurl_media: false,
      mrkdwn: true
    });

    expect(buildToolConnectionPayload({ platform: 'discord' }, 'hello')).toEqual({
      content: 'hello',
      allowed_mentions: { parse: [] }
    });

    expect(buildToolConnectionPayload({
      platform: 'custom',
      label: 'Ops',
      payloadTemplate: '{\n  "text": "{{message}}",\n  "connection": "{{connectionName}}"\n}'
    }, 'hello')).toEqual({
      text: 'hello',
      connection: 'Ops'
    });
  });

  it('stores and removes tool connections', () => {
    const created = upsertToolConnection({
      type: 'slack_webhook',
      label: 'Slack Alerts',
      webhookUrl: 'https://hooks.slack.com/services/test',
      messagePrefix: 'Alphonso'
    });

    expect(created.ok).toBe(true);
    expect(listToolConnections()).toHaveLength(1);
    expect(listToolConnectionAudit().some((row) => row.action === 'connection_upserted')).toBe(true);

    const removed = removeToolConnection(created.connection.id);
    expect(removed.ok).toBe(true);
    expect(listToolConnections()).toHaveLength(0);
  });

  it('posts a webhook connection through approval and invoke', async () => {
    const created = upsertToolConnection({
      type: 'slack_webhook',
      label: 'Slack Alerts',
      webhookUrl: 'https://hooks.slack.com/services/test',
      messagePrefix: 'Alphonso'
    });

    const result = await sendToolConnectionMessage(created.connection.id, 'hello team', { approved: true });

    expect(requireApprovalMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0][0]).toBe('tool_connection_post_webhook');
    expect(result.ok).toBe(true);
    expect(result.connection.lastTestStatus).toBe('verified');
  });
});
