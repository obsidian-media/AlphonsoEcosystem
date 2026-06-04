import { appendConnectorAudit, isConnectorAuthenticated } from './connectorRegistryService';
import { TRUST_STATES, timestampMs } from './trustModel';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

function getApiKey() {
  try {
    const raw = localStorage.getItem('alphonso_connector_auth_profiles_v1');
    const profiles = raw ? JSON.parse(raw) : {};
    return profiles?.claude?.apiKey || '';
  } catch {
    return '';
  }
}

function buildHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
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
      if (event.type === 'content_block_delta' && event.delta?.text) {
        full += event.delta.text;
        onChunk?.(event.delta.text, full);
      }
    }
  }

  return full;
}

export async function sendClaudeMessage(text, options = {}) {
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

  const model = options.model || 'claude-3-haiku-20240307';
  const maxTokens = options.maxTokens || 1024;
  const messages = options.messages || [{ role: 'user', content: text }];
  const systemPrompt = options.system || '';

  if (!options.stream) {
    return sendClaudeOneShot({ apiKey, model, maxTokens, messages, systemPrompt });
  }

  return sendClaudeStreaming({ apiKey, model, maxTokens, messages, systemPrompt, onChunk: options.onChunk });
}

async function sendClaudeOneShot({ apiKey, model, maxTokens, messages, systemPrompt }) {
  const startTime = timestampMs();
  try {
    const body = { model, max_tokens: maxTokens, messages };
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
    const content = data?.content?.[0]?.text || '';
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

async function sendClaudeStreaming({ apiKey, model, maxTokens, messages, systemPrompt, onChunk }) {
  const startTime = timestampMs();
  try {
    const body = { model, max_tokens: maxTokens, messages, stream: true };
    if (systemPrompt) body.system = systemPrompt;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorMsg = errorBody?.error?.message || `HTTP ${response.status}`;
      appendConnectorAudit('claude', 'stream_failed', { error: errorMsg, httpStatus: response.status });
      return { success: false, ok: false, connectorId: 'claude', error: errorMsg, trust: TRUST_STATES.FAILED };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const fullText = await readSSEStream(reader, decoder, onChunk);
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

export async function streamClaudeMessage(text, options = {}) {
  return sendClaudeMessage(text, { ...options, stream: true });
}
