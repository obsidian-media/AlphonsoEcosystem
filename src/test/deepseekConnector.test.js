import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: vi.fn((connectorId, key) => {
    if (connectorId === 'deepseek' && key === 'DEEPSEEK_API_KEY') return 'sk-test-key';
    return '';
  })
}));

const { isDeepSeekConfigured, sendDeepSeekMessage, searchWithDeepSeek } = await import('../services/connectors/deepseekConnector.js');

describe('deepseekConnector', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('isDeepSeekConfigured returns true when key present', () => {
    expect(isDeepSeekConfigured()).toBe(true);
  });

  it('sendDeepSeekMessage calls the DeepSeek API and returns content', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hello from DeepSeek' } }],
        model: 'deepseek-chat',
        usage: { total_tokens: 10 }
      })
    });

    const result = await sendDeepSeekMessage([{ role: 'user', content: 'Hello' }]);
    expect(result.content).toBe('Hello from DeepSeek');
    expect(result.provider).toBe('deepseek');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sendDeepSeekMessage throws on non-ok response', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' });
    await expect(sendDeepSeekMessage([{ role: 'user', content: 'Hi' }])).rejects.toThrow('DeepSeek API error 401');
  });

  it('searchWithDeepSeek returns a summary', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'AI synthesis result' } }],
        model: 'deepseek-chat'
      })
    });

    const result = await searchWithDeepSeek('what is machine learning?');
    expect(result.summary).toBe('AI synthesis result');
    expect(result.provider).toBe('deepseek');
    expect(result.sources).toEqual([]);
  });
});
