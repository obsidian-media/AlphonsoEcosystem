// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command) => {
    if (command === 'check_env_vars_presence') {
      return {
        TELEGRAM_BOT_TOKEN: true,
        TELEGRAM_ALLOWED_CHAT_IDS: true
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
    updateConnectorAuthProfile('telegram', {
      enabled: true,
      allowlist: ['chat-1']
    });
  });

  it('runs a real telegram send proof when env and approval are present', async () => {
    const proof = await proveTelegramConnectorPath('chat-1', 'Hello from Alphonso proof', {
      approved: true,
      requestedBy: 'jose'
    });

    expect(proof.ok).toBe(true);
    expect(proof.connectorId).toBe('telegram');
    expect(proof.proofType).toBe('telegram_live_send');
    expect(proof.externalId).toBe('telegram-proof-1');
  });
});
