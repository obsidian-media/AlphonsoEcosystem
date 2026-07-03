import { generateOllamaStream, generateOllamaChatStream, normalizeEndpoint } from '../lib/ollama';
import type { OllamaMessage } from '../lib/ollama';

const STREAM_STATE_KEY = 'alphonso_stream_state_v1';

interface StreamState {
  streamId: string;
  model: string;
  status: string;
  tokens: number;
  text: string;
  startedAtMs: number;
  updatedAtMs: number;
  completedAtMs?: number;
  error?: string;
  abortSignal?: AbortSignal;
}

export interface StreamEvent {
  type: string;
  streamId?: string;
  model?: string;
  token?: string;
  tokens?: number;
  text?: string;
  error?: string;
}

type StreamListener = (event: StreamEvent) => void;

const activeStreams = new Map<string, StreamState>();
const listeners = new Set<StreamListener>();

function notifyListeners(event: StreamEvent): void {
  for (const fn of listeners) {
    try { fn(event); } catch { /* ignore listener errors */ }
  }
}

function persistStreamState(streamId: string, state: Partial<StreamState>): void {
  try {
    const existing: Record<string, StreamState> = JSON.parse(localStorage.getItem(STREAM_STATE_KEY) || '{}');
    existing[streamId] = { ...state, updatedAtMs: Date.now() } as StreamState;
    // Keep only last 20 stream states
    const keys = Object.keys(existing).sort((a, b) => (existing[b].updatedAtMs || 0) - (existing[a].updatedAtMs || 0));
    const trimmed: Record<string, StreamState> = {};
    for (const k of keys.slice(0, 20)) trimmed[k] = existing[k];
    localStorage.setItem(STREAM_STATE_KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

export function subscribeToStreams(fn: StreamListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getStreamState(streamId: string): StreamState | null {
  try {
    const existing: Record<string, StreamState> = JSON.parse(localStorage.getItem(STREAM_STATE_KEY) || '{}');
    return existing[streamId] || null;
  } catch {
    return null;
  }
}

export function getActiveStreams(): StreamState[] {
  const result: StreamState[] = [];
  for (const [id, state] of activeStreams) {
    result.push({ id, ...state } as unknown as StreamState);
  }
  return result;
}

interface StartStreamOptions {
  streamId: string;
  endpoint: string;
  model: string;
  prompt?: string;
  messages?: OllamaMessage[];
  onToken?: (token: string, fullText: string) => void;
  onStatus?: (status: string) => void;
}

export async function startStream({ streamId, endpoint, model, prompt, messages, onToken, onStatus }: StartStreamOptions): Promise<{ ok?: boolean; error?: string; streamId: string; text?: string }> {
  if (activeStreams.has(streamId)) {
    return { error: 'Stream already active', streamId };
  }

  const state: StreamState = {
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

  const handleToken = (token: string, fullText: string) => {
    const newState: StreamState = {
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

  const handleStatus = (status: string) => {
    onStatus?.(status);
  };

  try {
    let result: string;
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
        prompt: prompt || '',
        onToken: handleToken,
        signal: activeStreams.get(streamId)?.abortSignal
      });
    }

    const finalState: StreamState = {
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
    const errorState: StreamState = {
      ...state,
      status: 'error',
      error: String((error as Error)?.message || error),
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

export function abortStream(streamId: string): boolean {
  const state = activeStreams.get(streamId);
  if (!state) return false;
  // Note: actual abort requires passing an AbortController signal
  const abortedState: StreamState = { ...state, status: 'aborted', updatedAtMs: Date.now() };
  activeStreams.set(streamId, abortedState);
  persistStreamState(streamId, abortedState);
  notifyListeners({ type: 'stream_abort', streamId });
  return true;
}

export function clearStreamHistory(): void {
  try { localStorage.removeItem(STREAM_STATE_KEY); } catch { /* ignore */ }
  activeStreams.clear();
  notifyListeners({ type: 'stream_clear' });
}
