import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/connectorRegistryService', () => ({
  isConnectorAuthenticated: vi.fn(() => ({ ok: true })),
}));
vi.mock('../services/trustModel', () => ({
  timestampMs: vi.fn(() => Date.now()),
}));

const storage = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((k) => storage[k] ?? null),
  setItem: vi.fn((k, v) => { storage[k] = v; }),
  removeItem: vi.fn((k) => { delete storage[k]; }),
});

import { checkConnectorHealth, checkTelegramConnection } from '../services/connectorHealthCheckService';

describe('connectorHealthCheckService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns not_implemented for unknown connector', async () => {
    const result = await checkConnectorHealth('unknown_connector');
    expect(result.ok).toBe(false);
    expect(result.details.reason).toBe('not_implemented');
  });

  it('returns missing_token when no Telegram token', async () => {
    const result = await checkTelegramConnection({});
    expect(result.ok).toBe(false);
    expect(result.details.reason).toBe('missing_token');
  });

  it('returns ok:true for successful Telegram check', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { username: 'AlphonsoBot', id: 123 } }),
    }));
    const result = await checkTelegramConnection({ botToken: 'fake-token' });
    expect(result.ok).toBe(true);
    expect(result.details.botUsername).toBe('AlphonsoBot');
  });

  it('handles Telegram API error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, description: 'Unauthorized' }),
    }));
    const result = await checkTelegramConnection({ botToken: 'bad-token' });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Unauthorized/);
  });

  it('handles fetch network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));
    const result = await checkTelegramConnection({ botToken: 'some-token' });
    expect(result.ok).toBe(false);
    expect(result.details.reason).toBe('network_error');
  });
});
