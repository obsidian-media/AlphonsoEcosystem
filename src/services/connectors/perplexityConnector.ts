import { getConnectorCredential } from './connectorAuth';
import { evaluatePolicyGate } from '../policyEnforcementService';

const PERPLEXITY_API_BASE = 'https://api.perplexity.ai';

export interface PerplexitySearchOptions {
  maxTokens?: number;
}

export interface PerplexitySource {
  url: string;
  title: string;
  relevance: number;
}

export interface PerplexitySearchResult {
  summary: string;
  sources: PerplexitySource[];
  confidenceLevel: string;
  provider: string;
}

export function isPerplexityConfigured(): boolean {
  return Boolean(getConnectorCredential('perplexity', 'PERPLEXITY_API_KEY'));
}

export async function searchPerplexity(
  query: string,
  { maxTokens = 512 }: PerplexitySearchOptions = {}
): Promise<PerplexitySearchResult> {
  const apiKey = getConnectorCredential('perplexity', 'PERPLEXITY_API_KEY');
  if (!apiKey) throw new Error('Perplexity API key not configured');

  // Policy gate check
  const gate = evaluatePolicyGate({
    connectorId: 'perplexity',
    actionType: 'search',
    commandPreview: JSON.stringify({ query, maxTokens }),
    approved: false,
    auth: { enabled: false, isAuthorized: false }
  });
  if (!gate.ok) {
    throw new Error(gate.reason || 'Policy gate blocked');
  }

  const r = await fetch(`${PERPLEXITY_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-sonar-small-128k-online',
      messages: [{ role: 'user', content: query }],
      max_tokens: maxTokens,
      return_citations: true
    })
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Perplexity API error ${r.status}: ${err}`);
  }

  const data = await r.json();
  const content = data.choices?.[0]?.message?.content || '';
  const citations = data.citations || [];

  return {
    summary: content,
    sources: citations.map((url: string, i: number) => ({ url, title: `Source ${i + 1}`, relevance: 0.8 })),
    confidenceLevel: 'high',
    provider: 'perplexity'
  };
}
