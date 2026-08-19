import { describe, it, expect, vi, beforeEach } from 'vitest';

const credStore = {};

vi.mock('../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: vi.fn((connectorId, key) => credStore[`${connectorId}:${key}`] || ''),
  saveConnectorCredential: vi.fn((connectorId, key, value) => {
    credStore[`${connectorId}:${key}`] = String(value || '');
  })
}));

vi.mock('../services/policyEnforcementService.js', () => ({
  evaluatePolicyGate: vi.fn(() => ({ ok: true, blocked: false }))
}));

const {
  isHermesAgentConfigured,
  getHermesAgentEndpoint,
  saveHermesAgentEndpoint,
  getHermesAgentHealth,
  listHermesAgentModels,
  sendHermesAgentMessage
} = await import('../services/connectors/hermesAgentConnector.js');
const { evaluatePolicyGate } = await import('../services/policyEnforcementService.js');

describe('hermesAgentConnector', () => {
  beforeEach(() => {
    for (const key of Object.keys(credStore)) delete credStore[key];
    vi.stubGlobal('fetch', vi.fn());
  });

  it('isHermesAgentConfigured is false when nothing saved', () => {
    expect(isHermesAgentConfigured('jose')).toBe(false);
  });

  it('isHermesAgentConfigured is false when only one of url/key is saved', () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', '');
    expect(isHermesAgentConfigured('jose')).toBe(false);
  });

  it('saveHermesAgentEndpoint + isHermesAgentConfigured round-trip', () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'test-key');
    expect(isHermesAgentConfigured('jose')).toBe(true);
    expect(getHermesAgentEndpoint('jose')).toEqual({ url: 'http://127.0.0.1:8645', key: 'test-key' });
  });

  it('credentials are stored per agent — configuring one agent does not configure another', () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    expect(isHermesAgentConfigured('hector')).toBe(false);
  });

  it('getHermesAgentHealth calls the unauthenticated /health route with no Authorization header', async () => {
    saveHermesAgentEndpoint('hector', 'http://127.0.0.1:8644', 'hector-key');
    fetch.mockResolvedValueOnce({ ok: true });
    const health = await getHermesAgentHealth('hector');
    expect(health.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetch.mock.calls[0];
    expect(calledUrl).toBe('http://127.0.0.1:8644/health');
    expect(calledInit?.headers).toBeUndefined();
  });

  it('getHermesAgentHealth returns ok:false with no endpoint configured', async () => {
    const health = await getHermesAgentHealth('nova');
    expect(health.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('getHermesAgentHealth returns ok:false on non-2xx', async () => {
    saveHermesAgentEndpoint('hector', 'http://127.0.0.1:8644', 'hector-key');
    fetch.mockResolvedValueOnce({ ok: false, status: 503 });
    const health = await getHermesAgentHealth('hector');
    expect(health.ok).toBe(false);
    expect(health.error).toContain('503');
  });

  it('listHermesAgentModels returns the model id list', async () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 'hermes-agent' }, { id: 'claude-sonnet-5' }] }) });
    const models = await listHermesAgentModels('jose');
    expect(models).toEqual(['hermes-agent', 'claude-sonnet-5']);
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8645/v1/models', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer jose-key' }) }));
  });

  it('listHermesAgentModels throws when not configured', async () => {
    await expect(listHermesAgentModels('nova')).rejects.toThrow('not configured');
  });

  it('sendHermesAgentMessage calls /v1/chat/completions and returns content', async () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'Hello from Jose' } }], model: 'hermes-agent', usage: { total_tokens: 5 } })
    });
    const result = await sendHermesAgentMessage('jose', [{ role: 'user', content: 'Hello' }]);
    expect(result.ok).toBe(true);
    expect(result.content).toBe('Hello from Jose');
    expect(result.provider).toBe('hermes');
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8645/v1/chat/completions',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer jose-key' }) })
    );
  });

  it('sendHermesAgentMessage returns a typed rateLimited result on 429 instead of throwing', async () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    fetch.mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'Rate limit exceeded' });
    const result = await sendHermesAgentMessage('jose', [{ role: 'user', content: 'Hi' }]);
    expect(result.ok).toBe(false);
    expect(result.rateLimited).toBe(true);
    expect(result.provider).toBe('hermes');
  });

  it('sendHermesAgentMessage throws on non-429 non-ok response', async () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    fetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' });
    await expect(sendHermesAgentMessage('jose', [{ role: 'user', content: 'Hi' }])).rejects.toThrow('Hermes API error 401');
  });

  it('sendHermesAgentMessage throws when not configured for that agent', async () => {
    await expect(sendHermesAgentMessage('nova', [{ role: 'user', content: 'Hi' }])).rejects.toThrow('not configured for agent "nova"');
  });

  it('sendHermesAgentMessage calls evaluatePolicyGate and throws when the gate blocks', async () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    evaluatePolicyGate.mockReturnValueOnce({ ok: false, blocked: true, reason: 'Approval Mode requires confirmation' });
    await expect(sendHermesAgentMessage('jose', [{ role: 'user', content: 'Hi' }])).rejects.toThrow('Approval Mode requires confirmation');
    expect(evaluatePolicyGate).toHaveBeenCalledWith(expect.objectContaining({ connectorId: 'hermes_agents' }));
    expect(fetch).not.toHaveBeenCalled();
  });
});
