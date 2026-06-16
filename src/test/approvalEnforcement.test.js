import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => ({ ok: true })),
  isTauri: vi.fn().mockReturnValue(false)
}));

import { requireApproval } from '../services/approval/approvalService';
import { sendTelegramConnectorMessage } from '../services/connectorRegistryService';

describe('approval enforcement', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('blocks external actions until approval is present', async () => {
    const result = await requireApproval({
      actionType: 'external_send',
      approved: false,
      force: true,
      summary: 'Send a message externally',
      requestedBy: 'jose'
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('approval_required');
    expect(result.approval.id).toBeTruthy();
  });

  it('returns not_authenticated when the connector profile is disabled', async () => {
    const result = await sendTelegramConnectorMessage('chat-1', 'hello', {
      approved: true,
      requestedBy: 'jose'
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('not_authenticated');
    expect(result.connector).toBe('telegram');
  });
});
