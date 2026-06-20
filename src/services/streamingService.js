import { generateOllamaStream, generateOllamaChatStream, normalizeEndpoint } from '../lib/ollama';

const STREAM_STATE_KEY = 'alphonso_stream_state_v1';

let activeStreams = new Map();
let listeners = new Set();

function notifyListeners(event) {
  for (const fn of listeners) {
    try { fn(event); } catch { /* ignore listener errors */ }
  }
}

function persistStreamState(streamId, state) {
  try {
    const existing = JSON.parse(localStorage.getItem(STREAM_STATE_KEY) || '{}');
    existing[streamId] = { ...state, updatedAtMs: Date.now() };
    // Keep only last 20 stream states
    const keys = Object.keys(existing).sort((a, b) => (existing[b].updatedAtMs || 0) - (existing[a].updatedAtMs || 0));
    const trimmed = {};
    for (const k of keys.slice(0, 20)) trimmed[k] = existing[k];
    localStorage.setItem(STREAM_STATE_KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

export function subscribeToStreams(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getStreamState(streamId) {
  try {
    const existing = JSON.parse(localStorage.getItem(STREAM_STATE_KEY) || '{}');
    return existing[streamId] || null;
  } catch {
    return null;
  }
}

export function getActiveStreams() {
  const result = [];
  for (const [id, state] of activeStreams) {
    result.push({ id, ...state });
  }
  return result;
}

export async function startStream({ streamId, endpoint, model, prompt, messages, onToken, onStatus }) {
  if (activeStreams.has(streamId)) {
    return { error: 'Stream already active', streamId };
  }

  const state = {
    streamId,
    model,
    status: 'starting',
    tokens: 0,
    text: '',
    startedAtMs: Date.now(),
    updatedAtMs: Date.now()
  };
  activeStreams.set(streamId, state);
  persistStreamState(streamId, state);
  notifyListeners({ type: 'stream_start', streamId, model });

  const handleToken = (token, fullText) => {
    const newState = {
      ...state,
      status: 'streaming',
      tokens: fullText.length,
      text: fullText,
      updatedAtMs: Date.now()
    };
    activeStreams.set(streamId, newState);
    persistStreamState(streamId, newState);
    onToken?.(token, fullText);
    notifyListeners({ type: 'stream_token', streamId, token, tokens: fullText.length });
  };

  const handleStatus = (status) => {
    onStatus?.(status);
  };

  try {
    let result;
    if (messages && messages.length > 0) {
      result = await generateOllamaChatStream({
        endpoint,
        model,
        messages,
        onToken: handleToken,
        signal: activeStreams.get(streamId)?.abortSignal
      });
    } else {
      result = await generateOllamaStream({
        endpoint,
        model,
        prompt,
        onToken: handleToken,
        signal: activeStreams.get(streamId)?.abortSignal
      });
    }

    const finalState = {
      ...state,
      status: 'complete',
      text: result,
      tokens: result?.length || 0,
      completedAtMs: Date.now(),
      updatedAtMs: Date.now()
    };
    activeStreams.set(streamId, finalState);
    persistStreamState(streamId, finalState);
    notifyListeners({ type: 'stream_complete', streamId, text: result });
    return { ok: true, text: result, streamId };
  } catch (error) {
    const errorState = {
      ...state,
      status: 'error',
      error: String(error?.message || error),
      updatedAtMs: Date.now()
    };
    activeStreams.set(streamId, errorState);
    persistStreamState(streamId, errorState);
    notifyListeners({ type: 'stream_error', streamId, error: errorState.error });
    return { ok: false, error: errorState.error, streamId };
  } finally {
    // Keep stream state for 30s then clean up
    setTimeout(() => {
      activeStreams.delete(streamId);
      notifyListeners({ type: 'stream_cleanup', streamId });
    }, 30000);
  }
}

export function abortStream(streamId) {
  const state = activeStreams.get(streamId);
  if (!state) return false;
  // Note: actual abort requires passing an AbortController signal
  const abortedState = { ...state, status: 'aborted', updatedAtMs: Date.now() };
  activeStreams.set(streamId, abortedState);
  persistStreamState(streamId, abortedState);
  notifyListeners({ type: 'stream_abort', streamId });
  return true;
}

export function clearStreamHistory() {
  try { localStorage.removeItem(STREAM_STATE_KEY); } catch { /* ignore */ }
  activeStreams.clear();
  notifyListeners({ type: 'stream_clear' });
}
