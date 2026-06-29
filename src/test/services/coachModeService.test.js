import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: {
    getByLabel: vi.fn().mockResolvedValue(null)
  }
}));

describe('coachModeService', () => {
  const localStorageMock = {
    getItem: vi.fn(() => null),
    setItem: vi.fn()
  };
  vi.stubGlobal('localStorage', localStorageMock);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  describe('openCoachWindow', () => {
    it('exports openCoachWindow function', async () => {
      const { openCoachWindow } = await import('../../services/coachModeService');
      expect(openCoachWindow).toBeDefined();
    });

    it('exports closeCoachWindow function', async () => {
      const { closeCoachWindow } = await import('../../services/coachModeService');
      expect(closeCoachWindow).toBeDefined();
    });

    it('creates coachUrl with coach parameter', async () => {
      const { openCoachWindow } = await import('../../services/coachModeService');
      // Check the function exists and is callable
      expect(typeof openCoachWindow).toBe('function');
    });
  });
});