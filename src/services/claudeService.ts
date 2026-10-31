import { appendConnectorAudit, isConnectorAuthenticated } from './connectorRegistryService';
import { getConnectorCredential } from './connectors/connectorAuth';
import { TRUST_STATES, timestampMs } from './trustModel';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function streamWithReconnect<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
        await delayMs(backoffMs);
      }
    }
  }
  throw lastError;
}

/**
 * Used when no model is set in Connectors → Claude → Model. The old default,
 * claude-3-haiku-20240307, was retired on 2026-04-20, so every call failed
 * (QA, 2026-10-22; see Anthropic's model deprecations page).
 */
export const CLAUDE_DEFAULT_MODEL = 'claude-haiku-5-5';

export interface CloudModelList {
  ok: boolean;
  models: string[];
  error?: string;
}

/**
 * The models this Anthropic key can use, from Anthropic's own list, so the
 * choice in Connectors is never a fixed list in the code (owner, 2026-10-22).
 */
export async function listClaudeModels(apiKey: string = getConnectorCredential('claude', 'ANTHROPIC_API_KEY')): Promise<CloudModelList> {
  if (!apiKey) return { ok: false, models: [], error: 'Save an Anthropic API key first.' };
  try {
    const response = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: buildHeaders(apiKey) });
    if (!response.ok) return { ok: false, models: [], error: `Anthropic answered HTTP ${response.status}.` };
    const body = await response.json();
    const models = Array.isArray(body?.data) ? body.data.map((m: { id?: string }) => String(m?.id || '')).filter(Boolean) : [];
    return { ok: true, models };
  } catch (error) {
    return { ok: false, models: [], error: error instanceof Error ? error.message : String(error) };
  }
}

function getApiKey(): string {
  return getConnectorCredential('claude', 'ANTHROPIC_API_KEY');
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  };
}

interface SSEEvent {
  type?: string;
  delta?: { text?: string };
  [key: string]: unknown;
}

function parseSSELine(line: string): SSEEvent | null {
  if (!line.startsWith('data: ')) return null;
  const json = line.slice(6);
  if (json === '[DONE]') return { type: 'done' };
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  onChunk?: (delta: string, full: string) => void
): Promise<string> {
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = parseSSELine(trimmed);
      if (!event) continue;
      if (event.type === 'done') break;
      if (event.type === 'content_block_delta' && event.delta?.text) {
        full += event.delta.text;
        onChunk?.(event.delta.text, full);
      }
    }
  }

  return full;
}

interface ClaudeMessage {
  role: string;
  content: string;
}

interface ClaudeOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  messages?: ClaudeMessage[];
  stream?: boolean;
  system?: string;
  onChunk?: (delta: string, full: string) => void;
}

interface ClaudeResult {
  success: boolean;
  ok: boolean;
  connectorId: string;
  text?: string;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number } | null;
  latencyMs?: number;
  error?: string;
  trust: string;
}

export async function sendClaudeMessage(text: string, options: ClaudeOptions = {}): Promise<ClaudeResult> {
  const auth = isConnectorAuthenticated('claude');
  if (!auth.ok) {
    appendConnectorAudit('claude', 'send_blocked_not_authenticated', {
      text: String(text || '').slice(0, 80)
    });
    return { success: false, ok: false, connectorId: 'claude', error: 'Claude connector is not authenticated.', trust: TRUST_STATES.FAILED };
  }

  const apiKey = options.apiKey || getApiKey();
  if (!apiKey) {
    appendConnectorAudit('claude', 'send_blocked_missing_key', { text: String(text || '').slice(0, 80) });
    return { success: false, ok: false, connectorId: 'claude', error: 'No API key configured for Claude.', trust: TRUST_STATES.FAILED };
  }

  const model = options.model || String(getConnectorCredential('claude', 'CLAUDE_MODEL') || '').trim() || CLAUDE_DEFAULT_MODEL;
  const maxTokens = options.maxTokens || 1024;
  const messages = options.messages || [{ role: 'user', content: text }];
  const systemPrompt = options.system || '';

  if (!options.stream) {
    return sendClaudeOneShot({ apiKey, model, maxTokens, messages, systemPrompt });
  }

  return sendClaudeStreaming({ apiKey, model, maxTokens, messages, systemPrompt, onChunk: options.onChunk });
}

interface OneShotParams {
  apiKey: string;
  model: string;
  maxTokens: number;
  messages: ClaudeMessage[];
  systemPrompt: string;
}

async function sendClaudeOneShot({ apiKey, model, maxTokens, messages, systemPrompt }: OneShotParams): Promise<ClaudeResult> {
  const startTime = timestampMs();
  try {
    const body: Record<string, unknown> = { model, max_tokens: maxTokens, messages };
    if (systemPrompt) body.system = systemPrompt;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorMsg = errorBody?.error?.message || `HTTP ${response.status}`;
      appendConnectorAudit('claude', 'send_failed', { error: errorMsg, httpStatus: response.status });
      return { success: false, ok: false, connectorId: 'claude', error: errorMsg, trust: TRUST_STATES.FAILED };
    }

    const data = await response.json();
    // Join the text blocks: newer models put a thinking block first (QA, 2026-10-31: claude-haiku-5-5
    // did, so reading only the first block gave every paid step an empty answer).
    const blocks: Array<{ type?: string; text?: unknown }> = Array.isArray(data?.content) ? data.content : [];
    const content = blocks.filter((b) => (b?.type === undefined || b.type === 'text') && typeof b?.text === 'string').map((b) => b.text as string).join('');
    const latencyMs = timestampMs() - startTime;

    appendConnectorAudit('claude', 'send_success', {
      model,
      latencyMs,
      inputTokens: data?.usage?.input_tokens || 0,
      outputTokens: data?.usage?.output_tokens || 0
    });

    return {
      success: true,
      ok: true,
      connectorId: 'claude',
      text: content,
      model,
      usage: data?.usage || null,
      latencyMs,
      trust: TRUST_STATES.VERIFIED
    };
  } catch (error) {
    const latencyMs = timestampMs() - startTime;
    appendConnectorAudit('claude', 'send_failed', { error: String(error), latencyMs });
    return { success: false, ok: false, connectorId: 'claude', error: String(error), trust: TRUST_STATES.FAILED };
  }
}

interface StreamingParams {
  apiKey: string;
  model: string;
  maxTokens: number;
  messages: ClaudeMessage[];
  systemPrompt: string;
  onChunk?: (delta: string, full: string) => void;
}

async function sendClaudeStreaming({ apiKey, model, maxTokens, messages, systemPrompt, onChunk }: StreamingParams): Promise<ClaudeResult> {
  const startTime = timestampMs();
  const attemptStream = async (): Promise<string> => {
    const body: Record<string, unknown> = { model, max_tokens: maxTokens, messages, stream: true };
    if (systemPrompt) body.system = systemPrompt;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorMsg = errorBody?.error?.message || `HTTP ${response.status}`;
      throw new Error(errorMsg);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    return await readSSEStream(reader, decoder, onChunk);
  };

  try {
    const fullText = await streamWithReconnect(attemptStream);
    const latencyMs = timestampMs() - startTime;

    appendConnectorAudit('claude', 'stream_success', { model, latencyMs });

    return {
      success: true,
      ok: true,
      connectorId: 'claude',
      text: fullText,
      model,
      latencyMs,
      trust: TRUST_STATES.VERIFIED
    };
  } catch (error) {
    const latencyMs = timestampMs() - startTime;
    appendConnectorAudit('claude', 'stream_failed', { error: String(error), latencyMs });
    return { success: false, ok: false, connectorId: 'claude', error: String(error), trust: TRUST_STATES.FAILED };
  }
}

export async function streamClaudeMessage(text: string, options: ClaudeOptions = {}): Promise<ClaudeResult> {
  return sendClaudeMessage(text, { ...options, stream: true });
}
