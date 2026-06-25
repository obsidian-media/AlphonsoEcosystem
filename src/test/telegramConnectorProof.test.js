// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command) => {
    if (command === 'check_env_vars_presence') {
      return {
        TELEGRAM_BOT_TOKEN: 'mock-bot-token',
        TELEGRAM_ALLOWED_CHAT_IDS: 'chat-1'
      };
    }
    if (command === 'connector_send_telegram') {
      return {
        ok: true,
        externalId: 'telegram-proof-1',
      };
    }
    return { ok: true };
  }),
  isTauri: vi.fn().mockReturnValue(false)
}));

import { proveTelegramConnectorPath, updateConnectorAuthProfile } from '../services/connectorRegistryService';

describe('telegram live connector proof path', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('alphonso_connector_credentials_v1', JSON.stringify({
      telegram: { TELEGRAM_BOT_TOKEN: 'mock-bot-token', TELEGRAM_ALLOWED_CHAT_IDS: 'chat-1' }
    }));
    updateConnectorAuthProfile('telegram', {
      enabled: true,
      allowlist: ['chat-1']
    });
  });

  it('runs a real telegram send proof when env and approval are present', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: { message_id: 42, chat: { id: 'chat-1' } }
      })
    });
    vi.stubGlobal('fetch', mockFetch);

    const proof = await proveTelegramConnectorPath('chat-1', 'Hello from Alphonso proof', {
      approved: true,
      requestedBy: 'jose'
    });

    expect(proof.ok).toBe(true);
    expect(proof.connectorId).toBe('telegram');
    expect(proof.proofType).toBe('telegram_live_send');
    expect(proof.external_id).toBe('42');
  });
});
