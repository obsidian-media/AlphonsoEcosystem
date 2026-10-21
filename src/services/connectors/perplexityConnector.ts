import { getConnectorCredential } from './connectorAuth';
import { evaluatePolicyGate } from '../policyEnforcementService';

const PERPLEXITY_API_BASE = 'https://api.perplexity.ai';

// Perplexity's Search API (POST /search) returns a ranked list of web pages
// with a snippet each, which is what Hector's source pipeline needs. The
// connector used to call /chat/completions with the
// `llama-3.1-sonar-small-128k-online` model; Perplexity retired those model
// names, and its docs say Sonar Chat Completions support ended on
// 2026-09-27. Request and response fields below follow
// https://docs.perplexity.ai/api-reference/search-post (checked 2026-10-21).

export interface PerplexitySearchOptions {
  maxResults?: number;
}

export interface PerplexitySource {
  url: string;
  title: string;
  snippet: string;
  date: string | null;
  relevance: number;
}

export interface PerplexitySearchResult {
  summary: string;
  sources: PerplexitySource[];
  confidenceLevel: string;
  provider: string;
}

interface PerplexitySearchApiResult {
  title?: string;
  url?: string;
  snippet?: string;
  date?: string | null;
}

export function isPerplexityConfigured(): boolean {
  return Boolean(getConnectorCredential('perplexity', 'PERPLEXITY_API_KEY'));
}

export async function searchPerplexity(
  query: string,
  { maxResults = 8 }: PerplexitySearchOptions = {}
): Promise<PerplexitySearchResult> {
  const apiKey = getConnectorCredential('perplexity', 'PERPLEXITY_API_KEY');
  if (!apiKey) throw new Error('Perplexity API key not configured');

  // The Search API accepts 1-20 results for ordinary web searches.
  const boundedMaxResults = Math.min(20, Math.max(1, Math.floor(maxResults)));

  // Policy gate check
  const gate = evaluatePolicyGate({
    connectorId: 'perplexity',
    actionType: 'search',
    commandPreview: JSON.stringify({ query, maxResults: boundedMaxResults }),
    approved: false,
    auth: { enabled: false, isAuthorized: false }
  });
  if (!gate.ok) {
    throw new Error(gate.reason || 'Policy gate blocked');
  }

  const r = await fetch(`${PERPLEXITY_API_BASE}/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, max_results: boundedMaxResults })
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Perplexity API error ${r.status}: ${err}`);
  }

  const data = await r.json();
  const results: PerplexitySearchApiResult[] = Array.isArray(data?.results) ? data.results : [];
  const sources = results
    .filter((item) => typeof item?.url === 'string' && item.url.trim())
    .map((item, index) => ({
      url: String(item.url),
      title: item.title || `Source ${index + 1}`,
      snippet: item.snippet || '',
      date: item.date ?? null,
      // Results arrive ranked; keep that order visible to callers.
      relevance: Math.max(0.1, 1 - index * 0.05)
    }));

  return {
    summary: sources.slice(0, 3).map((source) => source.snippet).filter(Boolean).join(' '),
    sources,
    confidenceLevel: sources.length > 0 ? 'high' : 'low',
    provider: 'perplexity'
  };
}
