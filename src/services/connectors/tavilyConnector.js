import { getConnectorCredential } from './connectorAuth.js';
import { evaluatePolicyGate } from '../policyEnforcementService';

const TAVILY_API_BASE = 'https://api.tavily.com';

export function isTavilyConfigured() {
  return Boolean(getConnectorCredential('tavily', 'TAVILY_API_KEY'));
}

export async function searchTavily(query, { maxResults = 8, searchDepth = 'basic' } = {}) {
  const apiKey = getConnectorCredential('tavily', 'TAVILY_API_KEY');
  if (!apiKey) throw new Error('Tavily API key not configured');

  // Policy gate check
  const gate = evaluatePolicyGate({
    connectorId: 'tavily',
    actionType: 'search',
    commandPreview: JSON.stringify({ query, maxResults, searchDepth }),
    approved: false,
    auth: { enabled: false, isAuthorized: false }
  });
  if (!gate.ok) {
    throw new Error(gate.reason || 'Policy gate blocked');
  }

  const r = await fetch(`${TAVILY_API_BASE}/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      search_depth: searchDepth,
      max_results: maxResults,
      include_answer: true,
      include_raw_content: false
    })
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Tavily API error ${r.status}: ${err}`);
  }

  const data = await r.json();
  const results = data.results || [];

  return {
    summary: data.answer || results[0]?.content || '',
    sources: results.map(item => ({
      url: item.url,
      title: item.title,
      snippet: item.content?.slice(0, 300) || '',
      relevance: item.score ?? 0.8
    })),
    confidenceLevel: 'high',
    provider: 'tavily'
  };
}
