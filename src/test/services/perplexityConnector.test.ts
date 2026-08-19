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

  it('submits a configured search and maps citations', async () => {
    const { searchPerplexity } = await import('../../services/connectors/perplexityConnector');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Perplexity summary' } }],
        citations: ['https://example.com/a', 'https://example.com/b']
      })
    });

    const result = await searchPerplexity('what is alphonso?', { maxTokens: 256 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.perplexity.ai/chat/completions',
      expect.objectContaining({
        method: 'POST'
      })
    );
    expect(result.summary).toBe('Perplexity summary');
    expect(result.provider).toBe('perplexity');
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]).toEqual(expect.objectContaining({ url: 'https://example.com/a' }));
  });
});
