// One search chain for every caller (agent phase 1, owner 2026-10-25): Jose's
// research steps, the Research Desk, the content factory and the skill tools.
// Until then Jose steps searched Brave → DuckDuckGo → RSS while the content
// factory searched Brave → Tavily → Perplexity → DeepSeek, and DeepSeek (a chat
// model) was added as a source. The order: whichever are set up of Brave,
// Tavily, Perplexity; then free DuckDuckGo through the backend; then news feeds.
import { invoke } from '@tauri-apps/api/core';
import { isBraveSearchConfigured, searchBrave } from '../connectors/braveSearchConnector';
import { isTavilyConfigured, searchTavily } from '../connectors/tavilyConnector';
import { isPerplexityConfigured, searchPerplexity } from '../connectors/perplexityConnector';
import { searchFeeds } from './feeds';
import { isJunkResult, rankSources, sourceKind, type SourceKind } from './sourceQuality';

export interface FoundSource {
  url: string;
  title: string;
  snippet: string;
  provider: string;
  kind: SourceKind;
}

interface Hit { url?: string; title?: string; snippet?: string; summary?: string }
type Provider = { name: string; available: () => Promise<boolean> | boolean; search: (query: string, limit: number) => Promise<Hit[]> };

const PROVIDERS: Provider[] = [
  { name: 'brave', available: () => isBraveSearchConfigured(), search: async (q, n) => {
    const result: any = await searchBrave(q, n);
    if (result && result.success === false && result.error) throw new Error(String(result.error));
    return result?.results || [];
  } },
  { name: 'tavily', available: () => isTavilyConfigured(), search: async (q, n) => ((await searchTavily(q, { maxResults: n })) as any)?.sources || [] },
  { name: 'perplexity', available: () => isPerplexityConfigured(), search: async (q, n) => ((await searchPerplexity(q, { maxResults: n })) as any)?.sources || [] },
  { name: 'duckduckgo', available: () => true, search: async (q, n) => {
    const rows = await invoke<Hit[]>('search_research_sources', { request: { query: q, sourceType: 'public_web', limit: n } });
    return Array.isArray(rows) ? rows : [];
  } },
  { name: 'news feeds', available: () => true, search: (q, n) => searchFeeds(q, n) },
];

export async function searchChain(queries: string[], { limit = 8 }: { limit?: number } = {}): Promise<{ sources: FoundSource[]; providers: string[]; errors: string[] }> {
  const found = new Map<string, FoundSource>();
  const providers: string[] = [];
  const errors: string[] = [];
  const wanted = queries.map((q) => q.trim()).filter(Boolean);
  for (const provider of PROVIDERS) {
    if (found.size >= limit) break;
    let available = false;
    try { available = Boolean(await provider.available()); } catch { available = false; }
    if (!available) continue;
    let used = false;
    for (const query of wanted) {
      if (found.size >= limit) break;
      let hits: Hit[] = [];
      try {
        hits = await provider.search(query, limit);
      } catch (error) {
        errors.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
      for (const hit of hits) {
        const url = String(hit?.url || '').trim();
        if (!url || found.has(url)) continue;
        const title = String(hit.title || '');
        const snippet = String(hit.snippet || hit.summary || '');
        if (isJunkResult(url, title, snippet)) continue;
        found.set(url, { url, title, snippet, provider: provider.name, kind: sourceKind(url) });
        used = true;
        if (found.size >= limit) break;
      }
    }
    if (used || provider.name === 'duckduckgo') providers.push(provider.name);
  }
  return { sources: rankSources([...found.values()]), providers, errors };
}
