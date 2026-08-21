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

vi.mock('../agents/agentRegistry', () => ({
  listAgentProfiles: vi.fn(() => [{ id: 'jose' }, { id: 'hector' }, { id: 'miya' }]),
}));

const hermesConfigured = {};
vi.mock('../services/connectors/hermesAgentConnector', () => ({
  isHermesAgentConfigured: vi.fn((agentId) => Boolean(hermesConfigured[agentId])),
  getHermesAgentHealth: vi.fn(async (agentId) => hermesConfigured[agentId] === 'unreachable' ? { ok: false, error: 'timeout' } : { ok: true }),
}));

import { checkConnectorHealth, checkTelegramConnection, checkHermesAgentsConnection } from '../services/connectorHealthCheckService';

describe('connectorHealthCheckService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    for (const key of Object.keys(hermesConfigured)) delete hermesConfigured[key];
  });

  describe('checkHermesAgentsConnection', () => {
    it('returns missing_config when no agent has Hermes configured', async () => {
      const result = await checkHermesAgentsConnection();
      expect(result.ok).toBe(false);
      expect(result.details.reason).toBe('missing_config');
    });

    it('returns ok:true when at least one configured agent is reachable', async () => {
      hermesConfigured.jose = 'ok';
      hermesConfigured.hector = 'ok';
      const result = await checkHermesAgentsConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toBe('2/2 configured Hermes agent profile(s) reachable.');
      expect(result.details.reachable).toEqual(['jose', 'hector']);
    });

    it('returns ok:false when configured agents are all unreachable', async () => {
      hermesConfigured.jose = 'unreachable';
      const result = await checkHermesAgentsConnection();
      expect(result.ok).toBe(false);
      expect(result.details.unreachable).toEqual([{ id: 'jose', error: 'timeout' }]);
    });

    it('aggregates a mix of reachable and unreachable configured agents', async () => {
      hermesConfigured.jose = 'ok';
      hermesConfigured.hector = 'unreachable';
      const result = await checkHermesAgentsConnection();
      expect(result.ok).toBe(true);
      expect(result.message).toBe('1/2 configured Hermes agent profile(s) reachable.');
    });

    it('checkConnectorHealth("hermes_agents") dispatches to checkHermesAgentsConnection', async () => {
      hermesConfigured.miya = 'ok';
      const result = await checkConnectorHealth('hermes_agents');
      expect(result.ok).toBe(true);
      expect(result.details.configured).toEqual(['miya']);
    });
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
