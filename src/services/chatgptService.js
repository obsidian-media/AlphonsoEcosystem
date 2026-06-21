import { appendConnectorAudit, isConnectorAuthenticated } from './connectorRegistryService';
import { getConnectorCredential } from './connectors/connectorAuth';
import { TRUST_STATES, timestampMs } from './trustModel';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

function delayMs(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function streamWithReconnect(fn, maxRetries = 3) {
  let lastError = null;
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

function getApiKey() {
  return getConnectorCredential('chatgpt', 'OPENAI_API_KEY');
}

function buildHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };
}

function parseSSELine(line) {
  if (!line.startsWith('data: ')) return null;
  const json = line.slice(6);
  if (json === '[DONE]') return { type: 'done' };
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function readSSEStream(reader, decoder, onChunk) {
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
      if (event.type === 'content_block_delta' || event.type === 'delta') {
        const deltaText = event.choices?.[0]?.delta?.content;
        if (deltaText) {
          full += deltaText;
          onChunk?.(deltaText, full);
        }
      }
    }
  }

  return full;
}

export async function sendChatGPTMessage(text, options = {}) {
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

  const model = options.model || 'gpt-4o-mini';
  const maxTokens = options.maxTokens || 1024;
  const messages = options.messages || [{ role: 'user', content: text }];

  if (!options.stream) {
    return sendChatGPTOneShot({ apiKey, model, maxTokens, messages });
  }

  return sendChatGPTStreaming({ apiKey, model, maxTokens, messages, onChunk: options.onChunk });
}

async function sendChatGPTOneShot({ apiKey, model, maxTokens, messages }) {
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

async function sendChatGPTStreaming({ apiKey, model, maxTokens, messages, onChunk }) {
  const startTime = timestampMs();
  const attemptStream = async () => {
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

    const reader = response.body.getReader();
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

export async function streamChatGPTMessage(text, options = {}) {
  return sendChatGPTMessage(text, { ...options, stream: true });
}
