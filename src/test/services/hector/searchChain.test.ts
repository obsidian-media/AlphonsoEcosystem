// One search chain for every caller (agent phase 1, 2026-10-25).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const brave = vi.fn();
const braveOn = vi.fn();
const tavily = vi.fn();
const tavilyOn = vi.fn();
const perplexity = vi.fn();
const perplexityOn = vi.fn();
const invoke = vi.fn();
const rss = vi.fn();
const deepseek = vi.fn();
vi.mock('../../../services/connectors/braveSearchConnector', () => ({ isBraveSearchConfigured: () => braveOn(), searchBrave: (...a: unknown[]) => brave(...a) }));
vi.mock('../../../services/connectors/tavilyConnector', () => ({ isTavilyConfigured: () => tavilyOn(), searchTavily: (...a: unknown[]) => tavily(...a) }));
vi.mock('../../../services/connectors/perplexityConnector', () => ({ isPerplexityConfigured: () => perplexityOn(), searchPerplexity: (...a: unknown[]) => perplexity(...a) }));
vi.mock('../../../services/connectors/deepseekConnector', () => ({ isDeepSeekConfigured: () => true, searchWithDeepSeek: (...a: unknown[]) => deepseek(...a) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('../../../services/hector/feeds', () => ({ searchFeeds: (...a: unknown[]) => rss(...a) }));

import { searchChain } from '../../../services/hector/searchChain';

const hits = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://${prefix}.example/article-${i}`, title: `${prefix} ${i}`, snippet: `about ${prefix}` }));

beforeEach(() => {
  for (const f of [brave, braveOn, tavily, tavilyOn, perplexity, perplexityOn, invoke, rss, deepseek]) f.mockReset();
  braveOn.mockResolvedValue(false); tavilyOn.mockReturnValue(false); perplexityOn.mockReturnValue(false);
  invoke.mockResolvedValue([]); rss.mockResolvedValue([]);
});

describe('searchChain', () => {
  it('uses the set-up providers in order and stops at the limit', async () => {
    braveOn.mockResolvedValue(true); brave.mockResolvedValue({ success: true, results: hits('brave', 5) });
    tavilyOn.mockReturnValue(true); tavily.mockResolvedValue({ sources: hits('tavily', 5) });
    perplexityOn.mockReturnValue(true);
    const out = await searchChain(['honeybee colonies Europe'], { limit: 8 });
    expect(out.sources).toHaveLength(8);
    expect(out.providers).toEqual(['brave', 'tavily']);
    expect(perplexity).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('a provider that fails is noted and the next one tried', async () => {
    braveOn.mockResolvedValue(true); brave.mockRejectedValue(new Error('quota'));
    invoke.mockResolvedValue(hits('ddg', 3).map((h) => ({ ...h, sourceType: 'public_web' })));
    const out = await searchChain(['bees'], { limit: 8 });
    expect(out.errors[0]).toMatch(/brave: quota/);
    expect(out.providers).toContain('duckduckgo');
    expect(out.sources.map((s) => s.provider)).toEqual(['duckduckgo', 'duckduckgo', 'duckduckgo']);
  });

  it('drops duplicates and junk, and ranks primary sources first', async () => {
    invoke.mockResolvedValue([
      { url: 'https://blog.example/bees', title: 'Bees', snippet: 'x' },
      { url: 'https://blog.example/bees', title: 'Bees again', snippet: 'x' },
      { url: 'https://scholar.google.com/', title: 'Google Scholar', snippet: '' },
      { url: 'https://www.usda.gov/bees', title: 'USDA bees', snippet: 'y' },
    ]);
    const out = await searchChain(['bees'], { limit: 8 });
    expect(out.sources.map((s) => s.url)).toEqual(['https://www.usda.gov/bees', 'https://blog.example/bees']);
    expect(out.sources[0].kind).toBe('primary');
  });

  it('news feeds are the last resort, and their results come back (no crash)', async () => {
    rss.mockResolvedValue(hits('feed', 2));
    const out = await searchChain(['bees'], { limit: 8 });
    expect(out.sources).toHaveLength(2);
    expect(out.providers).toEqual(['duckduckgo', 'news feeds']);
  });

  it('never asks DeepSeek', async () => {
    await searchChain(['bees'], { limit: 8 });
    expect(deepseek).not.toHaveBeenCalled();
  });

  it('searches every query until the limit', async () => {
    invoke.mockImplementation(async (_cmd: string, args: { request: { query: string } }) => hits(args.request.query.replace(/\W/g, ''), 2));
    const out = await searchChain(['first q', 'second q'], { limit: 8 });
    expect(out.sources).toHaveLength(4);
  });
});
