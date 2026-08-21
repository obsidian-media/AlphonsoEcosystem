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

vi.mock('../services/connectorRegistryService', () => ({
  appendConnectorAudit: vi.fn()
}));

const {
  isHermesAgentConfigured,
  getHermesAgentEndpoint,
  saveHermesAgentEndpoint,
  getHermesAgentHealth,
  getHermesSessionMode,
  setHermesSessionMode,
  listHermesAgentModels,
  sendHermesAgentMessage
} = await import('../services/connectors/hermesAgentConnector.js');
const { evaluatePolicyGate } = await import('../services/policyEnforcementService.js');
const { appendConnectorAudit } = await import('../services/connectorRegistryService');
const rateLimiter = await import('../services/connectorRateLimiterService');
const circuitBreaker = await import('../services/connectorCircuitBreakerService');

describe('hermesAgentConnector', () => {
  beforeEach(() => {
    for (const key of Object.keys(credStore)) delete credStore[key];
    vi.stubGlobal('fetch', vi.fn());
    vi.clearAllMocks();
    rateLimiter.resetAll();
    circuitBreaker.resetAllConfigs();
    circuitBreaker.resetCircuit('hermes_agents');
    // Re-apply the connector's own tuning, since resetAll()/resetAllConfigs()
    // clear it and the module-load-time configure() calls only run once.
    rateLimiter.configure('hermes_agents', { maxTokens: 300, refillRate: 300 });
    circuitBreaker.configure('hermes_agents', { failureThreshold: 8, cooldownMs: 15_000 });
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

  it('sendHermesAgentMessage returns a typed blocked result when the policy gate blocks, instead of throwing', async () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    evaluatePolicyGate.mockReturnValueOnce({ ok: false, blocked: true, reason: 'Approval Mode requires confirmation' });
    const result = await sendHermesAgentMessage('jose', [{ role: 'user', content: 'Hi' }]);
    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.message).toBe('Approval Mode requires confirmation');
    expect(result.provider).toBe('hermes');
    expect(evaluatePolicyGate).toHaveBeenCalledWith(expect.objectContaining({ connectorId: 'hermes_agents', actionType: 'hermesAgentDelegation', approved: false }));
    expect(fetch).not.toHaveBeenCalled();
    expect(appendConnectorAudit).toHaveBeenCalledWith('hermes_agents', 'send_blocked_policy_gate', expect.objectContaining({ agentId: 'jose' }));
  });

  it('sendHermesAgentMessage passes approved:true through to evaluatePolicyGate when the caller has already resolved approval', async () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }], model: 'hermes-agent', usage: null }) });
    await sendHermesAgentMessage('jose', [{ role: 'user', content: 'Hi' }], { approved: true });
    expect(evaluatePolicyGate).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
  });

  it('sendHermesAgentMessage fails fast with a circuitOpen result when the circuit breaker is open, without calling fetch', async () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    for (let i = 0; i < 8; i++) circuitBreaker.recordFailure('hermes_agents');
    const result = await sendHermesAgentMessage('jose', [{ role: 'user', content: 'Hi' }]);
    expect(result.ok).toBe(false);
    expect(result.circuitOpen).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(appendConnectorAudit).toHaveBeenCalledWith('hermes_agents', 'send_blocked_circuit_open', expect.objectContaining({ agentId: 'jose' }));
  });

  it('sendHermesAgentMessage records a circuit-breaker failure on a network error, then throws', async () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    fetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(sendHermesAgentMessage('jose', [{ role: 'user', content: 'Hi' }])).rejects.toThrow('Hermes profile unreachable');
    expect(circuitBreaker.getCircuitState('hermes_agents').failures).toBe(1);
  });

  it('sendHermesAgentMessage records a circuit-breaker failure on a non-429 error response, then throws', async () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    fetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Internal error' });
    await expect(sendHermesAgentMessage('jose', [{ role: 'user', content: 'Hi' }])).rejects.toThrow('Hermes API error 500');
    expect(circuitBreaker.getCircuitState('hermes_agents').failures).toBe(1);
  });

  it('sendHermesAgentMessage records circuit-breaker success and does not throw after a prior failure', async () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    circuitBreaker.recordFailure('hermes_agents');
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }], model: 'hermes-agent', usage: null }) });
    await sendHermesAgentMessage('jose', [{ role: 'user', content: 'Hi' }]);
    expect(circuitBreaker.getCircuitState('hermes_agents').failures).toBe(0);
  });

  it('getHermesSessionMode defaults to persistent when unset', () => {
    expect(getHermesSessionMode('jose')).toBe('persistent');
  });

  it('setHermesSessionMode + getHermesSessionMode round-trip to stateless', () => {
    setHermesSessionMode('jose', 'stateless');
    expect(getHermesSessionMode('jose')).toBe('stateless');
  });

  it('sendHermesAgentMessage sends a secure, UUID-shaped X-Hermes-Session-Id derived from (not equal to) the raw sessionId — the raw id is Math.random()-generated elsewhere and must never be sent directly (CodeQL js/insecure-randomness)', async () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }], model: 'hermes-agent', usage: null }) });
    await sendHermesAgentMessage('jose', [{ role: 'user', content: 'Hi' }], { sessionId: 'receipt-42' });
    const [, calledInit] = fetch.mock.calls[0];
    const sentHeader = calledInit.headers['X-Hermes-Session-Id'];
    expect(sentHeader).not.toBe('receipt-42');
    expect(sentHeader).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('sendHermesAgentMessage maps the same raw sessionId to the same secure header value across calls (preserves "one unit of work = one session")', async () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }], model: 'hermes-agent', usage: null }) });
    await sendHermesAgentMessage('jose', [{ role: 'user', content: 'Hi' }], { sessionId: 'receipt-99' });
    await sendHermesAgentMessage('jose', [{ role: 'user', content: 'Again' }], { sessionId: 'receipt-99' });
    const first = fetch.mock.calls[0][1].headers['X-Hermes-Session-Id'];
    const second = fetch.mock.calls[1][1].headers['X-Hermes-Session-Id'];
    expect(first).toBe(second);
  });

  it('sendHermesAgentMessage maps different raw sessionIds to different secure header values', async () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }], model: 'hermes-agent', usage: null }) });
    await sendHermesAgentMessage('jose', [{ role: 'user', content: 'Hi' }], { sessionId: 'receipt-a' });
    await sendHermesAgentMessage('jose', [{ role: 'user', content: 'Hi' }], { sessionId: 'receipt-b' });
    const first = fetch.mock.calls[0][1].headers['X-Hermes-Session-Id'];
    const second = fetch.mock.calls[1][1].headers['X-Hermes-Session-Id'];
    expect(first).not.toBe(second);
  });

  it('sendHermesAgentMessage omits X-Hermes-Session-Id when no sessionId is given', async () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }], model: 'hermes-agent', usage: null }) });
    await sendHermesAgentMessage('jose', [{ role: 'user', content: 'Hi' }]);
    const [, calledInit] = fetch.mock.calls[0];
    expect(calledInit.headers['X-Hermes-Session-Id']).toBeUndefined();
  });

  it('sendHermesAgentMessage omits X-Hermes-Session-Id when session mode is stateless even if sessionId is given', async () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    setHermesSessionMode('jose', 'stateless');
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }], model: 'hermes-agent', usage: null }) });
    await sendHermesAgentMessage('jose', [{ role: 'user', content: 'Hi' }], { sessionId: 'receipt-42' });
    const [, calledInit] = fetch.mock.calls[0];
    expect(calledInit.headers['X-Hermes-Session-Id']).toBeUndefined();
  });

  it('sendHermesAgentMessage audits a successful call with the resolved model and sessionId', async () => {
    saveHermesAgentEndpoint('jose', 'http://127.0.0.1:8645', 'jose-key');
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }], model: 'hermes-agent', usage: null }) });
    await sendHermesAgentMessage('jose', [{ role: 'user', content: 'Hi' }], { sessionId: 'receipt-42' });
    expect(appendConnectorAudit).toHaveBeenCalledWith('hermes_agents', 'send_success', expect.objectContaining({ agentId: 'jose', model: 'hermes-agent', sessionId: 'receipt-42' }));
  });
});
