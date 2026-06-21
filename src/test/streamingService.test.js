import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  subscribeToStreams,
  getStreamState,
  getActiveStreams,
  startStream,
  abortStream,
  clearStreamHistory
} from '../services/streamingService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../lib/ollama', () => ({
  generateOllamaStream: vi.fn(async ({ onToken }) => {
    onToken?.('Hello', 'Hello');
    onToken?.(' world', 'Hello world');
    return 'Hello world';
  }),
  generateOllamaChatStream: vi.fn(async ({ onToken }) => {
    onToken?.('Chat response', 'Chat response');
    return 'Chat response';
  }),
  normalizeEndpoint: vi.fn((e) => e || 'http://localhost:11434')
}));

// ── localStorage mock ─────────────────────────────────────────────────────────

const localStorageStore = {};
const mockLocalStorage = {
  getItem: vi.fn((k) => localStorageStore[k] ?? null),
  setItem: vi.fn((k, v) => { localStorageStore[k] = v; }),
  removeItem: vi.fn((k) => { delete localStorageStore[k]; }),
  clear: vi.fn(() => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]); })
};
vi.stubGlobal('localStorage', mockLocalStorage);

beforeEach(() => {
  mockLocalStorage.clear();
  vi.clearAllMocks();
  clearStreamHistory();
});

// ── subscribeToStreams ────────────────────────────────────────────────────────

describe('subscribeToStreams', () => {
  it('returns an unsubscribe function', () => {
    const unsub = subscribeToStreams(vi.fn());
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('listener receives stream events', async () => {
    const events = [];
    const unsub = subscribeToStreams((e) => events.push(e));

    await startStream({
      streamId: 'test-sub-1',
      endpoint: 'http://localhost:11434',
      model: 'llama3',
      prompt: 'hello'
    });

    unsub();
    expect(events.some((e) => e.type === 'stream_start')).toBe(true);
  });

  it('unsubscribed listener does not receive events', async () => {
    const events = [];
    const unsub = subscribeToStreams((e) => events.push(e));
    unsub();

    await startStream({
      streamId: 'test-sub-2',
      endpoint: 'http://localhost:11434',
      model: 'llama3',
      prompt: 'hello'
    });

    expect(events.length).toBe(0);
  });
});

// ── getStreamState ────────────────────────────────────────────────────────────

describe('getStreamState', () => {
  it('returns null for unknown stream ID', () => {
    mockLocalStorage.getItem.mockReturnValueOnce('{}');
    const state = getStreamState('nonexistent-id');
    expect(state).toBeNull();
  });

  it('returns stored stream state for known stream', async () => {
    const stored = JSON.stringify({
      'my-stream': { streamId: 'my-stream', status: 'complete', text: 'done', updatedAtMs: Date.now() }
    });
    mockLocalStorage.getItem.mockReturnValueOnce(stored);
    const state = getStreamState('my-stream');
    expect(state).not.toBeNull();
    expect(state.status).toBe('complete');
  });

  it('returns null when localStorage throws', () => {
    mockLocalStorage.getItem.mockImplementationOnce(() => { throw new Error('Storage error'); });
    const state = getStreamState('any-id');
    expect(state).toBeNull();
  });
});

// ── getActiveStreams ──────────────────────────────────────────────────────────

describe('getActiveStreams', () => {
  it('returns empty array when no streams active', () => {
    const streams = getActiveStreams();
    expect(Array.isArray(streams)).toBe(true);
    expect(streams.length).toBe(0);
  });

  it('returns active stream during streaming', async () => {
    const { generateOllamaStream } = await import('../lib/ollama');
    let resolveStream;
    generateOllamaStream.mockImplementationOnce(async () => {
      await new Promise((r) => { resolveStream = r; });
      return 'done';
    });

    const streamPromise = startStream({
      streamId: 'active-test',
      endpoint: 'http://localhost:11434',
      model: 'llama3',
      prompt: 'test'
    });

    // Check while stream is in-flight
    const active = getActiveStreams();
    expect(active.some((s) => s.id === 'active-test')).toBe(true);

    resolveStream?.();
    await streamPromise;
  });
});

// ── startStream ───────────────────────────────────────────────────────────────

describe('startStream', () => {
  it('returns ok:true and text on success with prompt', async () => {
    const result = await startStream({
      streamId: 'prompt-stream',
      endpoint: 'http://localhost:11434',
      model: 'llama3',
      prompt: 'hello world'
    });
    expect(result.ok).toBe(true);
    expect(result.text).toBe('Hello world');
    expect(result.streamId).toBe('prompt-stream');
  });

  it('uses generateOllamaChatStream when messages are provided', async () => {
    const result = await startStream({
      streamId: 'chat-stream',
      endpoint: 'http://localhost:11434',
      model: 'llama3',
      messages: [{ role: 'user', content: 'hi' }]
    });
    expect(result.ok).toBe(true);
    expect(result.text).toBe('Chat response');
  });

  it('calls onToken callback with tokens', async () => {
    const tokens = [];
    await startStream({
      streamId: 'token-stream',
      endpoint: 'http://localhost:11434',
      model: 'llama3',
      prompt: 'test',
      onToken: (token) => tokens.push(token)
    });
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('returns error when stream already active', async () => {
    const { generateOllamaStream } = await import('../lib/ollama');
    let resolveFirst;
    generateOllamaStream.mockImplementationOnce(async () => {
      await new Promise((r) => { resolveFirst = r; });
      return 'done';
    });

    const firstPromise = startStream({
      streamId: 'duplicate-stream',
      endpoint: 'http://localhost:11434',
      model: 'llama3',
      prompt: 'first'
    });

    const secondResult = await startStream({
      streamId: 'duplicate-stream',
      endpoint: 'http://localhost:11434',
      model: 'llama3',
      prompt: 'second'
    });

    expect(secondResult.error).toMatch(/already active/i);

    resolveFirst?.();
    await firstPromise;
  });

  it('returns ok:false on stream error', async () => {
    const { generateOllamaStream } = await import('../lib/ollama');
    generateOllamaStream.mockRejectedValueOnce(new Error('Network error'));

    const result = await startStream({
      streamId: 'error-stream',
      endpoint: 'http://localhost:11434',
      model: 'llama3',
      prompt: 'test'
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Network error');
  });
});

// ── abortStream ───────────────────────────────────────────────────────────────

describe('abortStream', () => {
  it('returns false when stream does not exist', () => {
    const result = abortStream('nonexistent-stream-id');
    expect(result).toBe(false);
  });

  it('returns true and marks stream as aborted when active', async () => {
    const { generateOllamaStream } = await import('../lib/ollama');
    let resolveStream;
    generateOllamaStream.mockImplementationOnce(async () => {
      await new Promise((r) => { resolveStream = r; });
      return 'done';
    });

    const streamPromise = startStream({
      streamId: 'abort-test',
      endpoint: 'http://localhost:11434',
      model: 'llama3',
      prompt: 'test'
    });

    const aborted = abortStream('abort-test');
    expect(aborted).toBe(true);

    resolveStream?.();
    await streamPromise;
  });
});

// ── clearStreamHistory ────────────────────────────────────────────────────────

describe('clearStreamHistory', () => {
  it('clears localStorage stream state', () => {
    clearStreamHistory();
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('alphonso_stream_state_v1');
  });

  it('notifies listeners of stream_clear event', () => {
    const events = [];
    const unsub = subscribeToStreams((e) => events.push(e));
    clearStreamHistory();
    unsub();
    expect(events.some((e) => e.type === 'stream_clear')).toBe(true);
  });

  it('resets active streams map', async () => {
    clearStreamHistory();
    const active = getActiveStreams();
    expect(active.length).toBe(0);
  });
});
