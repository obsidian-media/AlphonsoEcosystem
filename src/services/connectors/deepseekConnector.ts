import { getConnectorCredential } from './connectorAuth';
import { evaluatePolicyGate } from '../policyEnforcementService';

const DEEPSEEK_API_BASE = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';

export interface DeepSeekMessage {
  role: string;
  content: string;
}

export interface DeepSeekChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface DeepSeekChatResult {
  content: string;
  model: string;
  usage: any;
  provider: string;
}

export interface DeepSeekSearchResult {
  summary: string;
  sources: unknown[];
  confidenceLevel: string;
  provider: string;
}

export function isDeepSeekConfigured(): boolean {
  return Boolean(getConnectorCredential('deepseek', 'DEEPSEEK_API_KEY'));
}

export async function sendDeepSeekMessage(
  messages: DeepSeekMessage[],
  { model = DEFAULT_MODEL, maxTokens = 2048, temperature = 0.7 }: DeepSeekChatOptions = {}
): Promise<DeepSeekChatResult> {
  const apiKey = getConnectorCredential('deepseek', 'DEEPSEEK_API_KEY');
  if (!apiKey) throw new Error('DeepSeek API key not configured');

  // Policy gate check
  const gate = evaluatePolicyGate({
    connectorId: 'deepseek',
    actionType: 'chat',
    commandPreview: JSON.stringify({ model, messages, maxTokens, temperature }),
    approved: false,
    auth: { enabled: false, isAuthorized: false }
  });
  if (!gate.ok) {
    throw new Error(gate.reason || 'Policy gate blocked');
  }

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

export async function searchWithDeepSeek(query: string, { maxTokens = 1024 }: { maxTokens?: number } = {}): Promise<DeepSeekSearchResult> {
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
