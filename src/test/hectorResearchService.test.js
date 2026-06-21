import { beforeEach, describe, expect, it, vi } from 'vitest';

let braveEnabled = false;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command, args) => {
    if (command === 'check_env_vars_presence') {
      return { BRAVE_SEARCH_API_KEY: braveEnabled };
    }

    if (command === 'search_brave_sources') {
      if (!braveEnabled) throw new Error('BRAVE_SEARCH_API_KEY not set');
      return [
        {
          url: 'https://brave.com/search/result',
          title: 'Brave Search Result',
          snippet: 'Brave search snippet.',
          sourceType: args?.sourceType || 'official_docs',
          provider: 'brave_search',
          dateChecked: '2026-05-29T00:00:00.000Z',
          confidence: 'inferred',
          riskLevel: 'medium',
          verificationState: 'inferred'
        }
      ];
    }

    if (command === 'search_research_sources') {
      const query = String(args?.request?.query || '');
      if (query === 'How does Alphonso verify WhatsApp webhooks?') {
        return [];
      }
      if (query === 'official WhatsApp webhook verification docs') {
        return [
          {
            url: 'https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks',
            sourceType: 'official_docs',
            confidence: 'verified',
            verificationState: 'verified',
            riskLevel: 'low',
            provider: 'duckduckgo_html',
            title: 'WhatsApp Cloud API Webhooks',
            snippet: 'Official webhook verification and inbound events.'
          }
        ];
      }
      return [];
    }

    if (command === 'ollama_list_models') {
      return {
        endpoint: 'http://localhost:11434',
        httpStatus: 200,
        models: [{ name: 'llama3.1' }],
        trust: 'verified',
        reason: null
      };
    }

    if (command === 'ollama_generate') {
      return {
        endpoint: 'http://localhost:11434',
        httpStatus: 200,
        model: args.model,
        response: '["official WhatsApp webhook verification docs"]',
        done: true,
        trust: 'verified',
        error: null
      };
    }

    if (command === 'fetch_research_sources') {
      return [
        {
          url: args.sources?.[0]?.url,
          sourceType: 'official_docs',
          official: true,
          fetchedAtMs: 1,
          httpStatus: 200,
          ok: true,
          title: 'WhatsApp Cloud API Webhooks',
          snippet: 'Official webhook verification and inbound events.',
          dateChecked: '2026-05-19T12:00:00.000Z',
          confidence: 'verified',
          riskLevel: 'low',
          verificationState: 'verified',
          error: null
        }
      ];
    }

    return { ok: true };
  }),
  isTauri: vi.fn().mockReturnValue(false)
}));

import {
  createResearchDraft,
  fetchRssSources,
  isBraveSearchConfigured,
  listHectorReports,
  parseRssItems,
  RSS_FEED_CATALOG,
  runHectorLiveResearch,
  scoreRssFeed
} from '../services/hectorResearchService';

describe('hector research provider failover', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses ollama query refinement when the primary search returns nothing', async () => {
    const draft = createResearchDraft({
      researchQuestion: 'How does Alphonso verify WhatsApp webhooks?'
    });

    const report = await runHectorLiveResearch(draft.id);
    const saved = listHectorReports().find((item) => item.id === draft.id);

    expect(report.status).toBe('sources_verified');
    expect(report.providerUsed).toBe('duckduckgo_html_refined');
    expect(report.providerChain).toContain('ollama_query_refinement');
    expect(report.queryUsed).toBe('official WhatsApp webhook verification docs');
    expect(saved.providerUsed).toBe('duckduckgo_html_refined');
    expect(saved.sources).toHaveLength(1);
  });

  it('uses brave_search as primary provider when BRAVE_SEARCH_API_KEY is set', async () => {
    braveEnabled = true;
    const draft = createResearchDraft({
      researchQuestion: 'How does Alphonso verify WhatsApp webhooks?'
    });

    const report = await runHectorLiveResearch(draft.id);
    const saved = listHectorReports().find((item) => item.id === draft.id);

    expect(report.status).toBe('sources_verified');
    expect(report.providerUsed).toBe('brave_search');
    expect(report.providerChain).toEqual(['brave_search']);
    expect(saved.sources).toHaveLength(1);
    expect(saved.sources[0].provider).toBe('brave_search');
    braveEnabled = false;
  });

  it('isBraveSearchConfigured returns true when key is present', async () => {
    braveEnabled = true;
    const result = await isBraveSearchConfigured();
    expect(result).toBe(true);
    braveEnabled = false;
  });

  it('isBraveSearchConfigured returns false when key is absent', async () => {
    braveEnabled = false;
    const result = await isBraveSearchConfigured();
    expect(result).toBe(false);
  });
});

const rssXml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Test Article</title>
    <link>https://example.com/article</link>
    <description>A test snippet.</description>
  </item>
</channel></rss>`;

describe('RSS failover', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('RSS_FEED_CATALOG is an array with at least 5 items', () => {
    expect(Array.isArray(RSS_FEED_CATALOG)).toBe(true);
    expect(RSS_FEED_CATALOG.length).toBeGreaterThanOrEqual(5);
  });

  it('RSS_FEED_CATALOG items have url, name, and topics fields', () => {
    for (const feed of RSS_FEED_CATALOG) {
      expect(typeof feed.url).toBe('string');
      expect(feed.url.length).toBeGreaterThan(0);
      expect(typeof feed.name).toBe('string');
      expect(feed.name.length).toBeGreaterThan(0);
      expect(Array.isArray(feed.topics)).toBe(true);
      expect(feed.topics.length).toBeGreaterThan(0);
    }
  });

  it('scoreRssFeed returns > 0 when topics overlap with query words', () => {
    const score = scoreRssFeed({ topics: ['tech', 'ai'] }, 'ai tech research');
    expect(score).toBeGreaterThan(0);
  });

  it('scoreRssFeed returns 0 when no topics overlap with query', () => {
    const score = scoreRssFeed({ topics: ['cooking'] }, 'artificial intelligence');
    expect(score).toBe(0);
  });

  it('parseRssItems parses a minimal RSS XML string into items', () => {
    const items = parseRssItems(rssXml, 'https://example.com/feed', 10);
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].title).toBe('Test Article');
    expect(items[0].url).toBe('https://example.com/article');
    expect(items[0].source).toBe('rss');
  });

  it('parseRssItems returns empty array for empty or invalid XML', () => {
    expect(parseRssItems('', 'https://example.com/feed', 10)).toEqual([]);
    expect(Array.isArray(parseRssItems('<not-rss>', 'https://example.com/feed', 10))).toBe(true);
  });

  it('fetchRssSources calls fetch and returns results', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => rssXml
    });
    const results = await fetchRssSources('artificial intelligence tech', 8);
    expect(global.fetch).toHaveBeenCalled();
    expect(Array.isArray(results)).toBe(true);
  });

  it('fetchRssSources handles fetch failure gracefully and returns empty array', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const results = await fetchRssSources('artificial intelligence tech', 8);
    expect(Array.isArray(results)).toBe(true);
    expect(results).toEqual([]);
  });
});
