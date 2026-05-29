// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command) => {
    if (command === 'tool_connection_post_webhook') {
      return {
        ok: true,
        externalId: 'webhook-proof-1',
        webhookHost: 'hooks.example.test'
      };
    }
    return { ok: true };
  })
}));

import { proveToolConnectionPath, upsertToolConnection } from '../services/toolConnectionService';

describe('tool connection live proof', () => {
  beforeEach(() => {
    localStorage.clear();
    upsertToolConnection({
      id: 'slack-proof',
      type: 'slack_webhook',
      label: 'Slack Proof',
      webhookUrl: 'https://hooks.example.test/services/alpha',
      messagePrefix: 'Alphonso',
      active: true
    });
  });

  it('runs a live webhook proof through the existing tool connection path', async () => {
    const proof = await proveToolConnectionPath('slack-proof', 'Hello from Alphonso proof', {
      approved: true,
      requestedBy: 'jose'
    });

    expect(proof.ok).toBe(true);
    expect(proof.proofMode).toBe('webhook_live_proof');
    expect(proof.proofType).toBe('webhook_live_send');
    expect(proof.externalId).toBe('webhook-proof-1');
  });
});
