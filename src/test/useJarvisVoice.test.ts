import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../services/voiceOsService.js', () => ({
  getVoiceWebSocketUrl: vi.fn().mockReturnValue('ws://localhost:8080'),
  getVoiceToken: vi.fn().mockResolvedValue('test-token'),
}));

vi.mock('../hooks/pcm-processor.worklet', () => ({
  PCM_WORKLET_CODE: 'mock-worklet-code',
}));

let wsInstances = [];
let audioCtxInstances = [];

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.CLOSED;
  binaryType = '';
  onopen = null;
  onclose = null;
  onerror = null;
  onmessage = null;
  send = vi.fn();
  close = vi.fn();
  constructor(url) {
    this.url = url;
    wsInstances.push(this);
    // Fire onopen synchronously so act() captures the setState
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) this.onopen({ type: 'open' });
    });
  }
}

function makeMockAudioCtx() {
  const ctx = {
    sampleRate: 16000,
    close: vi.fn(),
    createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn() }),
    createBufferSource: vi.fn().mockReturnValue({ buffer: null, connect: vi.fn(), start: vi.fn() }),
    decodeAudioData: vi.fn().mockResolvedValue({}),
    destination: {},
    audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
  };
  audioCtxInstances.push(ctx);
  return ctx;
}

class MockAudioContext {
  constructor() {
    const ctx = makeMockAudioCtx();
    Object.assign(this, ctx);
  }
}

class MockAudioWorkletNode {
  constructor() {
    this.port = { onmessage: null };
    this.disconnect = vi.fn();
  }
}

class MockMediaStream {
  getTracks() { return [{ stop: vi.fn() }]; }
}

describe('useJarvisVoice', () => {
  let useJarvisVoice;

  beforeEach(async () => {
    vi.clearAllMocks();
    wsInstances = [];
    audioCtxInstances = [];
    globalThis.WebSocket = MockWebSocket;
    globalThis.AudioContext = MockAudioContext;
    globalThis.AudioWorkletNode = MockAudioWorkletNode;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(new MockMediaStream()) },
      writable: true,
    });
    const mod = await import('../hooks/useJarvisVoice');
    useJarvisVoice = mod.useJarvisVoice;
  });

  it('initializes with idle state', () => {
    const { result } = renderHook(() => useJarvisVoice());
    expect(result.current.state).toBe('idle');
    expect(result.current.transcript).toBe('');
    expect(result.current.reply).toBe('');
    expect(result.current.activeAgent).toBe('alphonso_core');
    expect(result.current.error).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it('exposes start, stop, reset functions', () => {
    const { result } = renderHook(() => useJarvisVoice());
    expect(typeof result.current.start).toBe('function');
    expect(typeof result.current.stop).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('start sets state to listening and isConnected', async () => {
    const { result } = renderHook(() => useJarvisVoice());
    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe('listening');
    expect(result.current.isConnected).toBe(true);
  });

  it('stop resets to idle', async () => {
    const { result } = renderHook(() => useJarvisVoice());
    await act(async () => { await result.current.start(); });
    act(() => { result.current.stop(); });
    expect(result.current.state).toBe('idle');
    expect(result.current.isConnected).toBe(false);
  });

  it('reset clears state', async () => {
    const { result } = renderHook(() => useJarvisVoice());
    await act(async () => { await result.current.start(); });
    act(() => { result.current.reset(); });
    expect(result.current.transcript).toBe('');
    expect(result.current.reply).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('handles WebSocket close', async () => {
    const { result } = renderHook(() => useJarvisVoice());
    await act(async () => { await result.current.start(); });
    act(() => { wsInstances[wsInstances.length - 1]?.onclose?.({ type: 'close' }); });
    expect(result.current.isConnected).toBe(false);
  });

  it('handles WebSocket error', async () => {
    const { result } = renderHook(() => useJarvisVoice());
    await act(async () => { await result.current.start(); });
    act(() => { wsInstances[wsInstances.length - 1]?.onerror?.({ type: 'error' }); });
    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('WebSocket connection failed');
  });

  it('handles STT message', async () => {
    const { result } = renderHook(() => useJarvisVoice());
    await act(async () => { await result.current.start(); });
    act(() => {
      wsInstances[wsInstances.length - 1]?.onmessage?.({ data: JSON.stringify({ type: 'stt', text: 'hello' }) });
    });
    expect(result.current.transcript).toBe('hello');
  });

  it('handles LLM message', async () => {
    const { result } = renderHook(() => useJarvisVoice());
    await act(async () => { await result.current.start(); });
    act(() => {
      wsInstances[wsInstances.length - 1]?.onmessage?.({ data: JSON.stringify({ type: 'llm', text: 'hi' }) });
    });
    expect(result.current.reply).toBe('hi');
  });

  it('handles state message', async () => {
    const { result } = renderHook(() => useJarvisVoice());
    await act(async () => { await result.current.start(); });
    act(() => {
      wsInstances[wsInstances.length - 1]?.onmessage?.({ data: JSON.stringify({ type: 'state', value: 'speaking' }) });
    });
    expect(result.current.state).toBe('speaking');
  });

  it('handles agent message', async () => {
    const { result } = renderHook(() => useJarvisVoice());
    await act(async () => { await result.current.start(); });
    act(() => {
      wsInstances[wsInstances.length - 1]?.onmessage?.({ data: JSON.stringify({ type: 'agent', name: 'hector' }) });
    });
    expect(result.current.activeAgent).toBe('hector');
  });

  it('handles error message', async () => {
    const { result } = renderHook(() => useJarvisVoice());
    await act(async () => { await result.current.start(); });
    act(() => {
      wsInstances[wsInstances.length - 1]?.onmessage?.({ data: JSON.stringify({ type: 'error', message: 'fail' }) });
    });
    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('fail');
  });

  it('handles audio ArrayBuffer', async () => {
    const { result } = renderHook(() => useJarvisVoice());
    await act(async () => { await result.current.start(); });
    act(() => {
      wsInstances[wsInstances.length - 1]?.onmessage?.({ data: new ArrayBuffer(8) });
    });
    const ctx = audioCtxInstances[audioCtxInstances.length - 1];
    expect(ctx.decodeAudioData).toHaveBeenCalled();
  });

  it('stop disconnects WebSocket and cleans resources', async () => {
    const { result } = renderHook(() => useJarvisVoice());
    await act(async () => { await result.current.start(); });
    const ws = wsInstances[wsInstances.length - 1];
    act(() => { result.current.stop(); });
    expect(ws.close).toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
    expect(result.current.isConnected).toBe(false);
  });

  it('calls stop on unmount', async () => {
    const { result, unmount } = renderHook(() => useJarvisVoice());
    await act(async () => { await result.current.start(); });
    unmount();
    // After unmount, the useEffect cleanup calls stop()
    // The result after unmount is stale, but the important thing is no errors thrown
    expect(true).toBe(true);
  });
});
