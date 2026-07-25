import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: vi.fn((connectorId, key) => {
    if (connectorId === 'nvidia_nim' && key === 'NVIDIA_API_KEY') return 'nvapi-test-key';
    return '';
  })
}));

vi.mock('../services/policyEnforcementService.js', () => ({
  evaluatePolicyGate: vi.fn(() => ({ ok: true, blocked: false }))
}));

const { isNvidiaConfigured, sendNvidiaMessage, listNvidiaModels } = await import('../services/connectors/nvidiaNimConnector.js');
const { evaluatePolicyGate } = await import('../services/policyEnforcementService.js');

describe('nvidiaNimConnector', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('isNvidiaConfigured returns true when key present', () => {
    expect(isNvidiaConfigured()).toBe(true);
  });

  it('sendNvidiaMessage calls the NVIDIA NIM API and returns content', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Hello from NVIDIA' } }],
        model: 'meta/llama-3.1-8b-instruct',
        usage: { total_tokens: 12 }
      })
    });

    const result = await sendNvidiaMessage([{ role: 'user', content: 'Hello' }]);
    expect(result.ok).toBe(true);
    expect(result.content).toBe('Hello from NVIDIA');
    expect(result.provider).toBe('nvidia_nim');
    expect(fetch).toHaveBeenCalledWith(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer nvapi-test-key' })
      })
    );
  });

  it('sendNvidiaMessage returns a typed rateLimited result on 429 instead of throwing', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'Rate limit exceeded' });

    const result = await sendNvidiaMessage([{ role: 'user', content: 'Hi' }]);
    expect(result.ok).toBe(false);
    expect(result.rateLimited).toBe(true);
    expect(result.provider).toBe('nvidia_nim');
  });

  it('sendNvidiaMessage throws on non-429 non-ok response', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' });
    await expect(sendNvidiaMessage([{ role: 'user', content: 'Hi' }])).rejects.toThrow('NVIDIA NIM API error 401');
  });

  it('sendNvidiaMessage throws when not configured', async () => {
    const { getConnectorCredential } = await import('../services/connectors/connectorAuth.js');
    getConnectorCredential.mockReturnValueOnce('');
    await expect(sendNvidiaMessage([{ role: 'user', content: 'Hi' }])).rejects.toThrow('NVIDIA API key not configured');
  });

  it('sendNvidiaMessage calls evaluatePolicyGate and throws when the gate blocks', async () => {
    evaluatePolicyGate.mockReturnValueOnce({ ok: false, blocked: true, reason: 'Approval Mode requires confirmation' });
    await expect(sendNvidiaMessage([{ role: 'user', content: 'Hi' }])).rejects.toThrow('Approval Mode requires confirmation');
    expect(evaluatePolicyGate).toHaveBeenCalledWith(expect.objectContaining({ connectorId: 'nvidia_nim' }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('listNvidiaModels returns the model id list', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'meta/llama-3.1-8b-instruct' }, { id: 'nvidia/nemotron-4-340b-instruct' }] })
    });

    const models = await listNvidiaModels();
    expect(models).toEqual(['meta/llama-3.1-8b-instruct', 'nvidia/nemotron-4-340b-instruct']);
    expect(fetch).toHaveBeenCalledWith(
      'https://integrate.api.nvidia.com/v1/models',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer nvapi-test-key' }) })
    );
  });
});
