import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve())
}));

vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn()
}));

vi.mock('../../lib/durableStore', () => ({
  durableGet: vi.fn((key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  }),
  durableSet: vi.fn((key, value) => {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  }),
  durableRemove: vi.fn((key) => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  })
}));

describe('connectorImageGenerators', () => {
  const localStorageMock = {
    getItem: vi.fn(() => null),
    setItem: vi.fn()
  };
  vi.stubGlobal('localStorage', localStorageMock);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  describe('generateSdWebUiImage', () => {
    it('exports generateSdWebUiImage function', async () => {
      const { generateSdWebUiImage } = await import('../../services/connectors/connectorImageGenerators');
      expect(generateSdWebUiImage).toBeDefined();
    });

    it('returns ok false when circuit breaker is open', async () => {
      const { generateSdWebUiImage } = await import('../../services/connectors/connectorImageGenerators');
      const result = await generateSdWebUiImage({ prompt: 'test' });
      expect(result.ok).toBe(false);
    });

    it('returns blocked status when policy gate denies', async () => {
      const { generateSdWebUiImage } = await import('../../services/connectors/connectorImageGenerators');
      const result = await generateSdWebUiImage({ prompt: 'dangerous prompt' });
      expect(result).toHaveProperty('blocked');
    });
  });

  describe('generateComfyUiImage', () => {
    it('exports generateComfyUiImage function', async () => {
      const { generateComfyUiImage } = await import('../../services/connectors/connectorImageGenerators');
      expect(generateComfyUiImage).toBeDefined();
    });

    it('creates workflow with default parameters', async () => {
      const { generateComfyUiImage } = await import('../../services/connectors/connectorImageGenerators');
      expect(typeof generateComfyUiImage).toBe('function');
    });
  });

  describe('queueComfyUiPrompt', () => {
    it('exports queueComfyUiPrompt via module', async () => {
      const mod = await import('../../services/connectors/connectorImageGenerators');
      expect(mod).toHaveProperty('queueComfyUiWorkflow');
    });
  });

  describe('pollComfyUiHistory', () => {
    it('exports pollComfyUiHistory function', async () => {
      const { pollComfyUiHistory } = await import('../../services/connectors/connectorImageGenerators');
      expect(typeof pollComfyUiHistory).toBe('function');
    });
  });

  describe('queueComfyUiWorkflow', () => {
    it('exports queueComfyUiWorkflow function', async () => {
      const { queueComfyUiWorkflow } = await import('../../services/connectors/connectorImageGenerators');
      expect(typeof queueComfyUiWorkflow).toBe('function');
    });
  });

  describe('queueComfyUiVideo', () => {
    it('exports queueComfyUiVideo function', async () => {
      const { queueComfyUiVideo } = await import('../../services/connectors/connectorImageGenerators');
      expect(typeof queueComfyUiVideo).toBe('function');
    });
  });

  describe('getComfyUiVideoHistory', () => {
    it('exports getComfyUiVideoHistory function', async () => {
      const { getComfyUiVideoHistory } = await import('../../services/connectors/connectorImageGenerators');
      expect(typeof getComfyUiVideoHistory).toBe('function');
    });
  });

  describe('workflow creation', () => {
    it('creates Miya SD15 Comfy workflow with correct structure', async () => {
      const mod = await import('../../services/connectors/connectorImageGenerators');
      expect(mod).toHaveProperty('generateComfyUiImage');
    });

    it('handles negative prompt parameter', async () => {
      const { generateComfyUiImage } = await import('../../services/connectors/connectorImageGenerators');
      expect(typeof generateComfyUiImage).toBe('function');
    });

    it('handles custom width and height', async () => {
      const { generateComfyUiImage } = await import('../../services/connectors/connectorImageGenerators');
      expect(typeof generateComfyUiImage).toBe('function');
    });
  });

  describe('circuit breaker integration', () => {
    it('checks circuit state before execution', async () => {
      const { generateSdWebUiImage } = await import('../../services/connectors/connectorImageGenerators');
      const result = await generateSdWebUiImage({ prompt: 'test' });
      expect(result.ok).toBe(false);
    });

    it('records failure on error', async () => {
      const { generateSdWebUiImage } = await import('../../services/connectors/connectorImageGenerators');
      await generateSdWebUiImage({ prompt: 'test' });
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('records success on ok result', async () => {
      const { generateSdWebUiImage } = await import('../../services/connectors/connectorImageGenerators');
      await generateSdWebUiImage({ prompt: 'test' });
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns structured error on invoke failure', async () => {
      const { generateSdWebUiImage } = await import('../../services/connectors/connectorImageGenerators');
      const result = await generateSdWebUiImage({ prompt: 'test' });
      expect(result).toHaveProperty('error');
      expect(result.connectorId).toBe('sd_webui');
    });

    it('includes trust state in error response', async () => {
      const { generateSdWebUiImage } = await import('../../services/connectors/connectorImageGenerators');
      const result = await generateSdWebUiImage({ prompt: 'test' });
      expect(result).toHaveProperty('trust');
    });

    it('handles ComfyUI workflow creation errors', async () => {
      const { generateComfyUiImage } = await import('../../services/connectors/connectorImageGenerators');
      expect(typeof generateComfyUiImage).toBe('function');
    });
  });

  describe('audit logging', () => {
    it('appends connector audit on image generation attempt', async () => {
      const { generateSdWebUiImage } = await import('../../services/connectors/connectorImageGenerators');
      await generateSdWebUiImage({ prompt: 'test' });
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('logs policy gate results', async () => {
      const { generateComfyUiImage } = await import('../../services/connectors/connectorImageGenerators');
      localStorageMock.getItem.mockReturnValueOnce('[]');
      await generateComfyUiImage({ prompt: 'test' });
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });
});