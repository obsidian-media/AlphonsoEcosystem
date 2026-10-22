import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PolicyGateResult } from '../../services/policyEnforcementService';

const mockGetConnectorCredential = vi.fn((..._args: unknown[]) => 'mock-perplexity-key');
const mockEvaluatePolicyGate = vi.fn((..._args: unknown[]): Partial<PolicyGateResult> => ({ ok: true }));
const fetchMock = vi.fn();

vi.mock('../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: (...args: unknown[]) => mockGetConnectorCredential(...args)
}));

vi.mock('../../services/policyEnforcementService', () => ({
  evaluatePolicyGate: (...args: unknown[]) => mockEvaluatePolicyGate(...args)
}));

vi.stubGlobal('fetch', fetchMock);

describe('perplexityConnector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConnectorCredential.mockReturnValue('mock-perplexity-key');
    mockEvaluatePolicyGate.mockReturnValue({ ok: true });
  });

  it('reports whether Perplexity is configured', async () => {
    const { isPerplexityConfigured } = await import('../../services/connectors/perplexityConnector');
    expect(isPerplexityConfigured()).toBe(true);
  });

  it('fails closed when the API key is missing', async () => {
    const { searchPerplexity } = await import('../../services/connectors/perplexityConnector');
    mockGetConnectorCredential.mockReturnValueOnce('');

    await expect(searchPerplexity('what is alphonso?')).rejects.toThrow('Perplexity API key not configured');
  });

  it('fails closed when the policy gate blocks the search', async () => {
    const { searchPerplexity } = await import('../../services/connectors/perplexityConnector');
    mockEvaluatePolicyGate.mockReturnValueOnce({ ok: false, reason: 'blocked by policy' });

    await expect(searchPerplexity('what is alphonso?')).rejects.toThrow('blocked by policy');
  });

  it('posts to the Search API and maps ranked results', async () => {
    const { searchPerplexity } = await import('../../services/connectors/perplexityConnector');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'req-1',
        results: [
          { title: 'Alphonso docs', url: 'https://example.com/a', snippet: 'First snippet.', date: '2026-10-01' },
          { title: 'Second page', url: 'https://example.com/b', snippet: 'Second snippet.' },
          { title: 'No url', snippet: 'dropped' }
        ]
      })
    });

    const result = await searchPerplexity('what is alphonso?', { maxResults: 5 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.perplexity.ai/search',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'what is alphonso?', max_results: 5 })
      })
    );
    expect(result.provider).toBe('perplexity');
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]).toEqual(expect.objectContaining({
      url: 'https://example.com/a',
      title: 'Alphonso docs',
      snippet: 'First snippet.',
      date: '2026-10-01'
    }));
    expect(result.sources[1].date).toBeNull();
    expect(result.sources[0].relevance).toBeGreaterThan(result.sources[1].relevance);
    expect(result.summary).toBe('First snippet. Second snippet.');
  });

  it('keeps max_results inside the range the Search API accepts', async () => {
    const { searchPerplexity } = await import('../../services/connectors/perplexityConnector');
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) });

    const result = await searchPerplexity('q', { maxResults: 99 });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).max_results).toBe(20);
    expect(result.sources).toEqual([]);
    expect(result.confidenceLevel).toBe('low');
  });

  it('reports the HTTP status when the API rejects the request', async () => {
    const { searchPerplexity } = await import('../../services/connectors/perplexityConnector');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'invalid key' });

    await expect(searchPerplexity('q')).rejects.toThrow('Perplexity API error 401: invalid key');
  });
});
