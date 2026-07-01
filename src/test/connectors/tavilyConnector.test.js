import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetConnectorCredential = vi.fn();
vi.mock('../../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: (...args) => mockGetConnectorCredential(...args)
}));

const mockEvaluatePolicyGate = vi.fn().mockReturnValue({
  ok: true, blocked: false, setupRequired: false, reason: null,
  riskLevel: 'low', confidence: 'verified', verificationState: 'verified'
});

vi.mock('../../services/policyEnforcementService', () => ({
  evaluatePolicyGate: (...args) => mockEvaluatePolicyGate(...args)
}));

let mockFetch;

async function getModule() {
  return import('../../services/connectors/tavilyConnector.js');
}

describe('tavilyConnector', () => {
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    mockGetConnectorCredential.mockReturnValue('');
    mockEvaluatePolicyGate.mockReturnValue({
      ok: true, blocked: false, setupRequired: false, reason: null,
      riskLevel: 'low', confidence: 'verified', verificationState: 'verified'
    });
  });

  describe('isTavilyConfigured', () => {
    it('returns false when no key stored', async () => {
      mockGetConnectorCredential.mockReturnValue('');
      const { isTavilyConfigured } = await getModule();
      expect(isTavilyConfigured()).toBe(false);
    });

    it('returns false when null', async () => {
      mockGetConnectorCredential.mockReturnValue(null);
      const { isTavilyConfigured } = await getModule();
      expect(isTavilyConfigured()).toBe(false);
    });

    it('returns true when key is present', async () => {
      mockGetConnectorCredential.mockReturnValue('tvly-abc123');
      const { isTavilyConfigured } = await getModule();
      expect(isTavilyConfigured()).toBe(true);
    });

    it('calls getConnectorCredential with correct args', async () => {
      mockGetConnectorCredential.mockReturnValue('key');
      const { isTavilyConfigured } = await getModule();
      isTavilyConfigured();
      expect(mockGetConnectorCredential).toHaveBeenCalledWith('tavily', 'TAVILY_API_KEY');
    });
  });

  describe('policy gate blocking', () => {
    it('throws when policy gate blocks search', async () => {
      mockGetConnectorCredential.mockReturnValue('tvly-test');
      mockEvaluatePolicyGate.mockReturnValue({
        ok: false, blocked: true, setupRequired: false,
        reason: 'Zero-Cost Mode blocked tavily',
        riskLevel: 'low', confidence: 'verified', verificationState: 'pending'
      });
      const { searchTavily } = await getModule();
      await expect(searchTavily('query')).rejects.toThrow('Zero-Cost Mode blocked tavily');
    });

    it('calls evaluatePolicyGate with correct params', async () => {
      mockGetConnectorCredential.mockReturnValue('tvly-test');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ answer: 'a', results: [] })
      });
      const { searchTavily } = await getModule();
      await searchTavily('test query', { maxResults: 3, searchDepth: 'advanced' });
      expect(mockEvaluatePolicyGate).toHaveBeenCalledWith({
        connectorId: 'tavily',
        actionType: 'search',
        commandPreview: JSON.stringify({ query: 'test query', maxResults: 3, searchDepth: 'advanced' }),
        approved: false,
        auth: { enabled: false, isAuthorized: false }
      });
    });

    it('does not fetch when gate blocks', async () => {
      mockGetConnectorCredential.mockReturnValue('tvly-test');
      mockEvaluatePolicyGate.mockReturnValue({
        ok: false, blocked: true, setupRequired: false,
        reason: 'blocked', riskLevel: 'low',
        confidence: 'verified', verificationState: 'pending'
      });
      const { searchTavily } = await getModule();
      await expect(searchTavily('q')).rejects.toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('searchTavily', () => {
    it('throws when no API key configured', async () => {
      mockGetConnectorCredential.mockReturnValue('');
      const { searchTavily } = await getModule();
      await expect(searchTavily('test query')).rejects.toThrow('Tavily API key not configured');
    });

    it('throws when key is null', async () => {
      mockGetConnectorCredential.mockReturnValue(null);
      const { searchTavily } = await getModule();
      await expect(searchTavily('query')).rejects.toThrow('Tavily API key not configured');
    });

    it('sends correct POST request and parses results', async () => {
      mockGetConnectorCredential.mockReturnValue('tvly-test');
      const mockResponse = {
        answer: 'AI is a field of computer science.',
        results: [
          { url: 'https://example.com', title: 'Example', content: 'Some content here', score: 0.9 },
          { url: 'https://other.com', title: 'Other', content: 'More content', score: 0.7 }
        ]
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const { searchTavily } = await getModule();
      const result = await searchTavily('what is AI');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.tavily.com/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer tvly-test',
            'Content-Type': 'application/json'
          })
        })
      );
      expect(result.summary).toBe('AI is a field of computer science.');
      expect(result.sources).toHaveLength(2);
      expect(result.sources[0].url).toBe('https://example.com');
      expect(result.sources[0].relevance).toBe(0.9);
      expect(result.provider).toBe('tavily');
      expect(result.confidenceLevel).toBe('high');
    });

    it('uses default options when not provided', async () => {
      mockGetConnectorCredential.mockReturnValue('tvly-test');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ answer: 'a', results: [] })
      });
      const { searchTavily } = await getModule();
      await searchTavily('query');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.max_results).toBe(8);
      expect(body.search_depth).toBe('basic');
      expect(body.include_answer).toBe(true);
      expect(body.include_raw_content).toBe(false);
    });

    it('respects custom options', async () => {
      mockGetConnectorCredential.mockReturnValue('tvly-test');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ answer: 'a', results: [] })
      });
      const { searchTavily } = await getModule();
      await searchTavily('query', { maxResults: 3, searchDepth: 'advanced' });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.max_results).toBe(3);
      expect(body.search_depth).toBe('advanced');
    });

    it('returns summary from first result when no answer field', async () => {
      mockGetConnectorCredential.mockReturnValue('tvly-test');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { url: 'https://a.com', title: 'A', content: 'First result content', score: 0.9 }
          ]
        })
      });
      const { searchTavily } = await getModule();
      const result = await searchTavily('query');
      expect(result.summary).toBe('First result content');
    });

    it('truncates snippet to 300 chars', async () => {
      mockGetConnectorCredential.mockReturnValue('tvly-test');
      const longContent = 'X'.repeat(500);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ url: 'https://a.com', title: 'A', content: longContent, score: 0.8 }]
        })
      });
      const { searchTavily } = await getModule();
      const result = await searchTavily('query');
      expect(result.sources[0].snippet).toHaveLength(300);
    });

    it('handles empty results array', async () => {
      mockGetConnectorCredential.mockReturnValue('tvly-test');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] })
      });
      const { searchTavily } = await getModule();
      const result = await searchTavily('query');
      expect(result.sources).toEqual([]);
      expect(result.summary).toBe('');
    });

    it('defaults relevance score to 0.8 when not provided', async () => {
      mockGetConnectorCredential.mockReturnValue('tvly-test');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ url: 'https://a.com', title: 'A', content: 'c' }]
        })
      });
      const { searchTavily } = await getModule();
      const result = await searchTavily('query');
      expect(result.sources[0].relevance).toBe(0.8);
    });

    it('throws on non-ok response', async () => {
      mockGetConnectorCredential.mockReturnValue('tvly-test');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized')
      });

      const { searchTavily } = await getModule();
      await expect(searchTavily('query')).rejects.toThrow('Tavily API error 401');
    });

    it('includes status code in error message', async () => {
      mockGetConnectorCredential.mockReturnValue('tvly-test');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limited')
      });
      const { searchTavily } = await getModule();
      await expect(searchTavily('query')).rejects.toThrow('Tavily API error 429');
    });

    it('handles network errors', async () => {
      mockGetConnectorCredential.mockReturnValue('tvly-test');
      mockFetch.mockRejectedValue(new Error('fetch failed'));
      const { searchTavily } = await getModule();
      await expect(searchTavily('query')).rejects.toThrow('fetch failed');
    });
  });
});
