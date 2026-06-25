import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isTavilyConfigured, searchTavily } from '../services/connectors/tavilyConnector.js';

vi.mock('../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: vi.fn()
}));

import { getConnectorCredential } from '../services/connectors/connectorAuth.js';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('isTavilyConfigured', () => {
  it('returns false when no key stored', () => {
    getConnectorCredential.mockReturnValue(null);
    expect(isTavilyConfigured()).toBe(false);
  });

  it('returns true when key is present', () => {
    getConnectorCredential.mockReturnValue('tvly-abc123');
    expect(isTavilyConfigured()).toBe(true);
  });
});

describe('searchTavily', () => {
  it('throws when no API key configured', async () => {
    getConnectorCredential.mockReturnValue(null);
    await expect(searchTavily('test query')).rejects.toThrow('Tavily API key not configured');
  });

  it('sends correct POST request and parses results', async () => {
    getConnectorCredential.mockReturnValue('tvly-test');
    const mockResponse = {
      answer: 'AI is a field of computer science.',
      results: [
        { url: 'https://example.com', title: 'Example', content: 'Some content here', score: 0.9 },
        { url: 'https://other.com', title: 'Other', content: 'More content', score: 0.7 }
      ]
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const result = await searchTavily('what is AI');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.summary).toBe('AI is a field of computer science.');
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].url).toBe('https://example.com');
    expect(result.sources[0].relevance).toBe(0.9);
    expect(result.provider).toBe('tavily');
  });

  it('throws on non-ok response', async () => {
    getConnectorCredential.mockReturnValue('tvly-test');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized')
    });

    await expect(searchTavily('query')).rejects.toThrow('Tavily API error 401');
  });
});
