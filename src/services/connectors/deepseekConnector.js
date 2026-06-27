import { getConnectorCredential } from './connectorAuth.js';

const DEEPSEEK_API_BASE = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';

export function isDeepSeekConfigured() {
  return Boolean(getConnectorCredential('deepseek', 'DEEPSEEK_API_KEY'));
}

export async function sendDeepSeekMessage(messages, { model = DEFAULT_MODEL, maxTokens = 2048, temperature = 0.7 } = {}) {
  const apiKey = getConnectorCredential('deepseek', 'DEEPSEEK_API_KEY');
  if (!apiKey) throw new Error('DeepSeek API key not configured');

  const r = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature
    })
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`DeepSeek API error ${r.status}: ${err}`);
  }

  const data = await r.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    model: data.model || model,
    usage: data.usage || null,
    provider: 'deepseek'
  };
}

export async function searchWithDeepSeek(query, { maxTokens = 1024 } = {}) {
  const result = await sendDeepSeekMessage(
    [{ role: 'user', content: query }],
    { maxTokens, model: 'deepseek-chat' }
  );
  return {
    summary: result.content,
    sources: [],
    confidenceLevel: 'inferred',
    provider: 'deepseek'
  };
}
