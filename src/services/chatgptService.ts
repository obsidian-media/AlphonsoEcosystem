import { appendConnectorAudit, isConnectorAuthenticated } from './connectorRegistryService';
import { getConnectorCredential } from './connectors/connectorAuth';
import { TRUST_STATES, timestampMs } from './trustModel';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

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

function getApiKey(): string {
  return getConnectorCredential('chatgpt', 'OPENAI_API_KEY');
}

/**
 * Used when no model is set in Connectors → ChatGPT → Model. The old default,
 * gpt-4o-mini, is deprecated (removed from the API on 2027-01-14) and OpenAI
 * names gpt-6-luna as its replacement (QA, 2026-10-22).
 */
export const OPENAI_DEFAULT_MODEL = 'gpt-6-luna';

export interface CloudModelList {
  ok: boolean;
  models: string[];
  error?: string;
}

/** True for OpenAI models that chat (not embeddings, speech, images, moderation). */
export function isOpenAiChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  if (!/^(gpt-|o\d|chatgpt-)/.test(lower)) return false;
  return !/(embed|whisper|tts|audio|realtime|transcribe|image|dall-e|moderation|search)/.test(lower);
}

/**
 * The chat models this OpenAI key can use, from OpenAI's own list, so the
 * choice in Connectors is never a fixed list in the code (owner, 2026-10-22).
 */
export async function listOpenAiModels(apiKey: string = getConnectorCredential('chatgpt', 'OPENAI_API_KEY')): Promise<CloudModelList> {
  if (!apiKey) return { ok: false, models: [], error: 'Save an OpenAI API key first.' };
  try {
    const response = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) return { ok: false, models: [], error: `OpenAI answered HTTP ${response.status}.` };
    const body = await response.json();
    const ids = Array.isArray(body?.data) ? body.data.map((m: { id?: string }) => String(m?.id || '')).filter(Boolean) : [];
    return { ok: true, models: ids.filter(isOpenAiChatModel).sort() };
  } catch (error) {
    return { ok: false, models: [], error: error instanceof Error ? error.message : String(error) };
  }
}

function chosenModel(): string {
  return String(getConnectorCredential('chatgpt', 'OPENAI_MODEL') || '').trim();
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };
}

interface SSEEvent {
  type?: string;
  choices?: Array<{ delta?: { content?: string } }>;
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
      if (event.choices?.[0]?.delta?.content) {
        const deltaText = event.choices[0].delta.content;
        full += deltaText;
        onChunk?.(deltaText, full);
      } else if (event.type === 'content_block_delta' && (event.delta as { text?: string })?.text) {
        const deltaText = (event.delta as { text: string }).text;
        full += deltaText;
        onChunk?.(deltaText, full);
      }
    }
  }

  return full;
}

interface ChatGPTMessage {
  role: string;
  content: string;
}

interface ChatGPTOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  messages?: ChatGPTMessage[];
  stream?: boolean;
  onChunk?: (delta: string, full: string) => void;
}

interface ChatGPTResult {
  success: boolean;
  ok: boolean;
  connectorId: string;
  text?: string;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  latencyMs?: number;
  error?: string;
  trust: string;
}

export async function sendChatGPTMessage(text: string, options: ChatGPTOptions = {}): Promise<ChatGPTResult> {
  const auth = isConnectorAuthenticated('chatgpt');
  if (!auth.ok) {
    appendConnectorAudit('chatgpt', 'send_blocked_not_authenticated', {
      text: String(text || '').slice(0, 80)
    });
    return { success: false, ok: false, connectorId: 'chatgpt', error: 'ChatGPT connector is not authenticated.', trust: TRUST_STATES.FAILED };
  }

  const apiKey = options.apiKey || getApiKey();
  if (!apiKey) {
    appendConnectorAudit('chatgpt', 'send_blocked_missing_key', { text: String(text || '').slice(0, 80) });
    return { success: false, ok: false, connectorId: 'chatgpt', error: 'No API key configured for ChatGPT.', trust: TRUST_STATES.FAILED };
  }

  const model = options.model || chosenModel() || OPENAI_DEFAULT_MODEL;
  const maxTokens = options.maxTokens || 1024;
  const messages = options.messages || [{ role: 'user', content: text }];

  if (!options.stream) {
    return sendChatGPTOneShot({ apiKey, model, maxTokens, messages });
  }

  return sendChatGPTStreaming({ apiKey, model, maxTokens, messages, onChunk: options.onChunk });
}

interface OneShotParams {
  apiKey: string;
  model: string;
  maxTokens: number;
  messages: ChatGPTMessage[];
}

async function sendChatGPTOneShot({ apiKey, model, maxTokens, messages }: OneShotParams): Promise<ChatGPTResult> {
  const startTime = timestampMs();
  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify({ model, messages, max_tokens: maxTokens })
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorMsg = errorBody?.error?.message || `HTTP ${response.status}`;
      appendConnectorAudit('chatgpt', 'send_failed', { error: errorMsg, httpStatus: response.status });
      return { success: false, ok: false, connectorId: 'chatgpt', error: errorMsg, trust: TRUST_STATES.FAILED };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const latencyMs = timestampMs() - startTime;

    appendConnectorAudit('chatgpt', 'send_success', {
      model,
      latencyMs,
      promptTokens: data?.usage?.prompt_tokens || 0,
      completionTokens: data?.usage?.completion_tokens || 0
    });

    return {
      success: true,
      ok: true,
      connectorId: 'chatgpt',
      text: content,
      model,
      usage: data?.usage || null,
      latencyMs,
      trust: TRUST_STATES.VERIFIED
    };
  } catch (error) {
    const latencyMs = timestampMs() - startTime;
    appendConnectorAudit('chatgpt', 'send_failed', { error: String(error), latencyMs });
    return { success: false, ok: false, connectorId: 'chatgpt', error: String(error), trust: TRUST_STATES.FAILED };
  }
}

interface StreamingParams {
  apiKey: string;
  model: string;
  maxTokens: number;
  messages: ChatGPTMessage[];
  onChunk?: (delta: string, full: string) => void;
}

async function sendChatGPTStreaming({ apiKey, model, maxTokens, messages, onChunk }: StreamingParams): Promise<ChatGPTResult> {
  const startTime = timestampMs();
  const attemptStream = async (): Promise<string> => {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, stream: true })
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

    appendConnectorAudit('chatgpt', 'stream_success', { model, latencyMs });

    return {
      success: true,
      ok: true,
      connectorId: 'chatgpt',
      text: fullText,
      model,
      latencyMs,
      trust: TRUST_STATES.VERIFIED
    };
  } catch (error) {
    const latencyMs = timestampMs() - startTime;
    appendConnectorAudit('chatgpt', 'stream_failed', { error: String(error), latencyMs });
    return { success: false, ok: false, connectorId: 'chatgpt', error: String(error), trust: TRUST_STATES.FAILED };
  }
}

export async function streamChatGPTMessage(text: string, options: ChatGPTOptions = {}): Promise<ChatGPTResult> {
  return sendChatGPTMessage(text, { ...options, stream: true });
}
