import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockInvoke = vi.fn().mockResolvedValue(null);
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args)
}));

const mockShow = vi.fn().mockResolvedValue(undefined);
const mockSetFocus = vi.fn().mockResolvedValue(undefined);
const mockSetAlwaysOnTop = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockGetByLabel = vi.fn().mockResolvedValue(null);
let nextOnceBehavior = 'created';

// Create a proper constructor mock
const MockWebviewWindow = vi.fn(function(label, opts) {
  this.label = label;
  this.opts = opts;
  this.show = mockShow;
  this.setFocus = mockSetFocus;
  this.setAlwaysOnTop = mockSetAlwaysOnTop;
  this.close = mockClose;
  this.once = vi.fn((event, callback) => {
    if (event === 'tauri://created' && nextOnceBehavior === 'created') {
      queueMicrotask(() => callback());
    }
    if (event === 'tauri://error' && nextOnceBehavior === 'error') {
      queueMicrotask(() => callback({ payload: 'mock creation failure' }));
    }
  });
});
MockWebviewWindow.getByLabel = mockGetByLabel;

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: MockWebviewWindow
}));

describe('coachModeService', () => {
  const storage = {};
  const localStorageMock = {
    getItem: vi.fn((k) => storage[k] ?? null),
    setItem: vi.fn((k, v) => { storage[k] = v; }),
    removeItem: vi.fn((k) => { delete storage[k]; }),
  };

  beforeEach(() => {
    Object.keys(storage).forEach(k => delete storage[k]);
    vi.stubGlobal('localStorage', localStorageMock);
    vi.clearAllMocks();
    MockWebviewWindow.mockClear();
    mockGetByLabel.mockResolvedValue(null);
    nextOnceBehavior = 'created';
  });

  describe('openCoachWindow', () => {
    it('creates new WebviewWindow when no existing window', async () => {
      const { openCoachWindow } = await import('../../services/coachModeService');
      await openCoachWindow(false, 'hector');

      expect(MockWebviewWindow).toHaveBeenCalledWith(
        'coach',
        expect.objectContaining({
          title: 'Alphonso Coach',
          width: 340,
          height: 430,
          alwaysOnTop: false
        })
      );
    });

    it('shows existing window instead of creating new one', async () => {
      const existingWindow = { show: mockShow, setFocus: mockSetFocus, setAlwaysOnTop: mockSetAlwaysOnTop };
      mockGetByLabel.mockResolvedValue(existingWindow);

      const { openCoachWindow } = await import('../../services/coachModeService');
      await openCoachWindow(true);

      expect(mockShow).toHaveBeenCalled();
      expect(mockSetFocus).toHaveBeenCalled();
      expect(mockSetAlwaysOnTop).toHaveBeenCalledWith(true);
    });

    it('saves coachAgent to localStorage', async () => {
      const { openCoachWindow } = await import('../../services/coachModeService');
      await openCoachWindow(false, 'sentinel');

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'alphonso_settings',
        expect.stringContaining('"coachAgent":"sentinel"')
      );
    });

    it('writes to SQLite via kv_set (best-effort)', async () => {
      const { openCoachWindow } = await import('../../services/coachModeService');
      await openCoachWindow(false, 'nova');

      expect(mockInvoke).toHaveBeenCalledWith(
        'kv_set',
        expect.objectContaining({ key: 'alphonso_settings' })
      );
    });

    it('rejects when the webview reports a tauri://error creation failure', async () => {
      nextOnceBehavior = 'error';
      const { openCoachWindow } = await import('../../services/coachModeService');

      await expect(openCoachWindow(false, 'alphonso')).rejects.toThrow(/Coach window failed to create/);
    });
  });

  describe('closeCoachWindow', () => {
    it('closes window if it exists', async () => {
      const existingWindow = { close: mockClose };
      mockGetByLabel.mockResolvedValue(existingWindow);

      const { closeCoachWindow } = await import('../../services/coachModeService');
      await closeCoachWindow();

      expect(mockClose).toHaveBeenCalled();
    });

    it('does nothing if no window exists', async () => {
      mockGetByLabel.mockResolvedValue(null);

      const { closeCoachWindow } = await import('../../services/coachModeService');
      await closeCoachWindow();

      expect(mockClose).not.toHaveBeenCalled();
    });
  });
});
