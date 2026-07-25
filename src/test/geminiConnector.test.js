import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: vi.fn((connectorId, key) => {
    if (connectorId === 'gemini' && key === 'GEMINI_API_KEY') return 'gemini-test-key';
    return '';
  })
}));

vi.mock('../services/policyEnforcementService.js', () => ({
  evaluatePolicyGate: vi.fn(() => ({ ok: true, blocked: false }))
}));

const { isGeminiConfigured, sendGeminiMessage } = await import('../services/connectors/geminiConnector.js');
const { evaluatePolicyGate } = await import('../services/policyEnforcementService.js');

describe('geminiConnector', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('isGeminiConfigured returns true when key present', () => {
    expect(isGeminiConfigured()).toBe(true);
  });

  it('sendGeminiMessage calls the Gemini API and returns content', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Hello from Gemini' }] } }],
        usageMetadata: { totalTokenCount: 8 }
      })
    });

    const result = await sendGeminiMessage([{ role: 'user', content: 'Hello' }]);
    expect(result.ok).toBe(true);
    expect(result.content).toBe('Hello from Gemini');
    expect(result.provider).toBe('gemini');

    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('key=gemini-test-key');
    const body = JSON.parse(options.body);
    expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'Hello' }] });
  });

  it('maps assistant role to Gemini "model" role', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ack' }] } }] })
    });

    await sendGeminiMessage([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello there' },
      { role: 'user', content: 'How are you?' }
    ]);

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.contents[1].role).toBe('model');
  });

  it('sendGeminiMessage returns a typed rateLimited result on 429 instead of throwing', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'Quota exceeded' });

    const result = await sendGeminiMessage([{ role: 'user', content: 'Hi' }]);
    expect(result.ok).toBe(false);
    expect(result.rateLimited).toBe(true);
    expect(result.provider).toBe('gemini');
  });

  it('sendGeminiMessage throws on non-429 non-ok response', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'Bad request' });
    await expect(sendGeminiMessage([{ role: 'user', content: 'Hi' }])).rejects.toThrow('Gemini API error 400');
  });

  it('sendGeminiMessage throws when not configured', async () => {
    const { getConnectorCredential } = await import('../services/connectors/connectorAuth.js');
    getConnectorCredential.mockReturnValueOnce('');
    await expect(sendGeminiMessage([{ role: 'user', content: 'Hi' }])).rejects.toThrow('Gemini API key not configured');
  });

  it('sendGeminiMessage calls evaluatePolicyGate and throws when the gate blocks', async () => {
    evaluatePolicyGate.mockReturnValueOnce({ ok: false, blocked: true, reason: 'Approval Mode requires confirmation' });
    await expect(sendGeminiMessage([{ role: 'user', content: 'Hi' }])).rejects.toThrow('Approval Mode requires confirmation');
    expect(evaluatePolicyGate).toHaveBeenCalledWith(expect.objectContaining({ connectorId: 'gemini' }));
    expect(fetch).not.toHaveBeenCalled();
  });
});
