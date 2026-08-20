import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOllamaHealth } from '../../hooks/useOllamaHealth';
import { mockInvoke, setupTauriInvokeMock, resetTauriMocks } from '../../test/tauri-mock';
import { TRUST_STATES, timestampMs } from '../../services/trustModel';
import { checkOllama, chooseDefaultModel } from '../../lib/ollama';
import { verifyOllamaRuntimeProof } from '../../services/verificationService';
import { appendVerificationLog } from '../../services/verificationService';
import { pushMemoryItem } from '../../services/memoryService';

vi.mock('../../lib/ollama', () => ({
  checkOllama: vi.fn(),
  chooseDefaultModel: vi.fn()
}));

vi.mock('../../services/verificationService', () => ({
  verifyOllamaRuntimeProof: vi.fn(),
  appendVerificationLog: vi.fn()
}));

vi.mock('../../services/memoryService', () => ({
  pushMemoryItem: vi.fn()
}));

vi.mock('../../services/trustModel', () => ({
  TRUST_STATES: { VERIFIED: 'verified', FAILED: 'failed', UNVERIFIED: 'unverified' },
  timestampMs: vi.fn(() => Date.now())
}));

const createMockSettings = (overrides = {}) => ({
  endpoint: 'http://localhost:11434',
  selectedModel: 'qwen2.5-coder:7b',
  ...overrides
});

const createMockDesktopBridge = (overrides = {}) => ({
  state: 'connected',
  ...overrides
});

const mockSetters = () => ({
  setOllamaStatus: vi.fn(),
  setLastCheckedAt: vi.fn(),
  setVerificationLogs: vi.fn(),
  setMemoryItems: vi.fn(),
  setSettings: vi.fn()
});

const mockOllamaCheckRunRef = { current: 0 };

describe('useOllamaHealth', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetTauriMocks();
    setupTauriInvokeMock({});
    mockOllamaCheckRunRef.current = 0;

    checkOllama.mockResolvedValue({
      state: 'connected',
      label: 'Connected',
      message: 'Ollama is running',
      models: [{ name: 'qwen2.5-coder:7b' }],
      selectedModel: 'qwen2.5-coder:7b'
    });

    chooseDefaultModel.mockImplementation((models, current) =>
      models[0]?.name || current
    );

    verifyOllamaRuntimeProof.mockResolvedValue({
      reachable: false,
      reason: '',
      payload: {}
    });

    appendVerificationLog.mockImplementation(log => ({
      id: `log-${Date.now()}`,
      ...log
    }));

    pushMemoryItem.mockImplementation(item => ({
      id: `mem-${Date.now()}`,
      ...item
    }));

    timestampMs.mockReturnValue(Date.now());
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Health polling interval', () => {
    it('runs initial check after 1.5s delay', async () => {
      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(checkOllama).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(checkOllama).toHaveBeenCalledTimes(1);
    });

    it('polls at 30s interval after initial 5s delay', async () => {
      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(checkOllama).toHaveBeenCalledTimes(2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      expect(checkOllama).toHaveBeenCalledTimes(3);
    });

    it('stops polling on unmount', async () => {
      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      const { unmount } = renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(checkOllama).toHaveBeenCalledTimes(2);

      unmount();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60000);
      });

      expect(checkOllama).toHaveBeenCalledTimes(2);
    });
  });

  describe('Model list fetch and status updates', () => {
    it('fetches model list on health check', async () => {
      const models = [
        { name: 'qwen2.5-coder:7b', size: 4000000000 },
        { name: 'mistral:latest', size: 3500000000 },
        { name: 'llama3.2:3b', size: 2000000000 }
      ];
      checkOllama.mockResolvedValue({
        state: 'connected',
        label: 'Connected',
        message: 'Ollama is running',
        models,
        selectedModel: 'qwen2.5-coder:7b'
      });

      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      const { result } = renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(checkOllama).toHaveBeenCalledWith(settings.endpoint, settings.selectedModel);
      expect(setters.setOllamaStatus).toHaveBeenCalled();
      expect(setters.setOllamaStatus).toHaveBeenLastCalledWith(
        expect.objectContaining({ models })
      );
    });

    it('handles empty model list', async () => {
      checkOllama.mockResolvedValue({
        state: 'no_models',
        label: 'No models',
        message: 'No models available',
        models: [],
        selectedModel: null
      });

      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(setters.setOllamaStatus).toHaveBeenLastCalledWith(
        expect.objectContaining({ state: 'no_models', models: [] })
      );
    });
  });

  describe('Auto-reconnect with desktop bridge', () => {
    it('attempts desktop bridge when frontend fails and bridge connected', async () => {
      checkOllama.mockResolvedValue({
        state: 'cors',
        label: 'CORS Error',
        message: 'CORS blocked',
        models: [],
        selectedModel: null
      });

      verifyOllamaRuntimeProof.mockResolvedValueOnce({
        reachable: true,
        reason: '',
        payload: { models: [{ name: 'bridge-model' }] }
      });

      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge({ state: 'connected' });
      const setters = mockSetters();

      renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(verifyOllamaRuntimeProof).toHaveBeenCalledWith(settings.endpoint);
      // Status is updated after desktop bridge proof
      expect(setters.setOllamaStatus).toHaveBeenCalled();
    });

    it('does not use desktop bridge when bridge is disconnected', async () => {
      checkOllama.mockResolvedValue({
        state: 'not_running',
        label: 'Not running',
        message: 'Ollama not running',
        models: [],
        selectedModel: null
      });

      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge({ state: 'disconnected' });
      const setters = mockSetters();

      renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(verifyOllamaRuntimeProof).not.toHaveBeenCalled();
      expect(setters.setOllamaStatus).toHaveBeenLastCalledWith(
        expect.objectContaining({ state: 'not_running' })
      );
    });
  });

  describe('Model availability detection', () => {
    it('detects installed models from Ollama API', async () => {
      checkOllama.mockResolvedValue({
        state: 'connected',
        label: 'Connected',
        message: 'OK',
        models: [
          { name: 'qwen2.5-coder:7b' },
          { name: 'mistral:latest' },
          { name: 'llama3.2:3b' }
        ],
        selectedModel: 'qwen2.5-coder:7b'
      });

      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(setters.setOllamaStatus).toHaveBeenLastCalledWith(
        expect.objectContaining({
          models: expect.arrayContaining([
            expect.objectContaining({ name: 'qwen2.5-coder:7b' }),
            expect.objectContaining({ name: 'mistral:latest' }),
            expect.objectContaining({ name: 'llama3.2:3b' })
          ])
        })
      );
    });

    it('detects when selected model is missing', async () => {
      checkOllama.mockResolvedValue({
        state: 'model_missing',
        label: 'Model missing',
        message: 'Selected model not found',
        models: [{ name: 'mistral:latest' }],
        selectedModel: 'mistral:latest'
      });

      const settings = createMockSettings({ selectedModel: 'qwen2.5-coder:7b' });
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(setters.setOllamaStatus).toHaveBeenLastCalledWith(
        expect.objectContaining({ state: 'model_missing' })
      );
    });
  });

  describe('Streaming health updates to subscribers', () => {
    it('updates lastCheckedAt timestamp on each check', async () => {
      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(setters.setLastCheckedAt).toHaveBeenCalledTimes(1);
      expect(setters.setLastCheckedAt).toHaveBeenCalledWith(expect.any(Date));
    });

    it('appends verification log on each check', async () => {
      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(appendVerificationLog).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ollama_health_check',
          source: 'frontend-fetch'
        })
      );
    });

    it('pushes memory item on each check', async () => {
      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(pushMemoryItem).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'runtime_memory',
          source: 'ollama-health-check'
        })
      );
    });
  });

  describe('Graceful degradation when Ollama unavailable', () => {
    it('sets failed trust state when Ollama not running', async () => {
      checkOllama.mockResolvedValue({
        state: 'not_running',
        label: 'Not running',
        message: 'Ollama is not running',
        models: [],
        selectedModel: null
      });

      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge({ state: 'disconnected' });
      const setters = mockSetters();

      renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(setters.setOllamaStatus).toHaveBeenLastCalledWith(
        expect.objectContaining({ trust: TRUST_STATES.FAILED })
      );
    });

    it('continues polling even when Ollama unavailable', async () => {
      checkOllama.mockResolvedValue({
        state: 'not_running',
        label: 'Not running',
        message: 'Ollama not running',
        models: [],
        selectedModel: null
      });

      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge({ state: 'disconnected' });
      const setters = mockSetters();

      renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(checkOllama).toHaveBeenCalledTimes(2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(35000);
      });
      expect(checkOllama).toHaveBeenCalledTimes(3);
    });
  });

  describe('Manual refresh trigger', () => {
    it('returns runOllamaCheck function for manual triggering', async () => {
      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      const { result } = renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(checkOllama).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current();
      });

      expect(checkOllama).toHaveBeenCalledTimes(2);
    });

    it('manual check updates status and logs', async () => {
      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      const { result } = renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      await act(async () => {
        await result.current();
      });

      expect(setters.setOllamaStatus).toHaveBeenCalled();
      expect(setters.setLastCheckedAt).toHaveBeenCalledTimes(2);
      expect(appendVerificationLog).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cleanup on unmount', () => {
    it('clears polling interval on unmount', async () => {
      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      const { unmount } = renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(checkOllama).toHaveBeenCalledTimes(2);

      unmount();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60000);
      });

      expect(checkOllama).toHaveBeenCalledTimes(2);
    });

    it('clears initial check timeout on unmount before it fires', async () => {
      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      const { unmount } = renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      unmount();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(checkOllama).not.toHaveBeenCalled();
    });
  });

  describe('Race condition handling', () => {
    it('handles rapid consecutive manual checks', async () => {
      checkOllama
        .mockResolvedValueOnce({
          state: 'connected',
          label: '1',
          message: '1',
          models: [],
          selectedModel: null
        })
        .mockResolvedValueOnce({
          state: 'connected',
          label: '2',
          message: '2',
          models: [],
          selectedModel: null
        })
        .mockResolvedValueOnce({
          state: 'connected',
          label: '3',
          message: '3',
          models: [],
          selectedModel: null
        });

      const settings = createMockSettings();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      const { result } = renderHook(() =>
        useOllamaHealth({ settings, desktopBridge, ...setters, ollamaCheckRunRef: mockOllamaCheckRunRef })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      await act(async () => {
        await result.current();
        await result.current();
        await result.current();
      });

      expect(checkOllama).toHaveBeenCalledTimes(4);
    });
  });
});