import { getConnectorCredential } from './connectorAuth.js';

const PERPLEXITY_API_BASE = 'https://api.perplexity.ai';

export function isPerplexityConfigured() {
  return Boolean(getConnectorCredential('perplexity', 'PERPLEXITY_API_KEY'));
}

export async function searchPerplexity(query, { maxTokens = 512 } = {}) {
  const apiKey = getConnectorCredential('perplexity', 'PERPLEXITY_API_KEY');
  if (!apiKey) throw new Error('Perplexity API key not configured');

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
    sources: citations.map((url, i) => ({ url, title: `Source ${i + 1}`, relevance: 0.8 })),
    confidenceLevel: 'high',
    provider: 'perplexity'
  };
}
