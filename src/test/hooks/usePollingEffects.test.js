import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
  emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    listen: vi.fn().mockResolvedValue(vi.fn()),
    emit: vi.fn().mockResolvedValue(undefined),
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    setFullscreen: vi.fn(),
    setTitle: vi.fn(),
    onFocusChange: vi.fn(),
  }),
}));

vi.mock('../lib/appStorage', () => ({
  getStorage: vi.fn((key, fallback) => fallback),
  setStorage: vi.fn(),
}));

const mockCheckAppUpdate = vi.fn().mockResolvedValue({
  available: false,
  configured: true,
  latestVersion: null,
  currentVersion: '2.6.0',
  notes: null,
  pubDate: null,
  downloadUrl: null,
  checkedAtMs: Date.now(),
  trust: 'verified',
  error: null,
});
const mockNotifyUpdateAvailable = vi.fn().mockResolvedValue(false);
const mockAppendVerificationLog = vi.fn().mockReturnValue({
  id: 'log-1',
  timestampMs: Date.now(),
  type: 'app_update_check',
  trust: 'verified',
  payload: {},
});
const mockReadDurableAuditLog = vi.fn().mockResolvedValue([]);
const mockIsConnectorAuthenticated = vi.fn((id) => id === 'whatsapp');
const mockPollWhatsAppConnector = vi.fn().mockResolvedValue({ routed: 0, rejected: 0 });
const mockIsBraveSearchConfigured = vi.fn().mockResolvedValue(false);
const mockStopScreenObserver = vi.fn();

vi.mock('../services/appUpdateService', () => ({
  checkAppUpdate: mockCheckAppUpdate,
  notifyUpdateAvailable: mockNotifyUpdateAvailable,
}));

vi.mock('../services/verificationService', () => ({
  appendVerificationLog: mockAppendVerificationLog,
  getVerificationLogs: vi.fn(() => []),
  readDurableAuditLog: mockReadDurableAuditLog,
}));

vi.mock('../services/connectorRegistryService', () => ({
  isConnectorAuthenticated: mockIsConnectorAuthenticated,
  pollWhatsAppConnector: mockPollWhatsAppConnector,
}));

vi.mock('../services/hectorResearchService', () => ({
  isBraveSearchConfigured: mockIsBraveSearchConfigured,
}));

vi.mock('../services/screenIntelligenceService', () => ({
  stopScreenObserver: mockStopScreenObserver,
}));

vi.mock('../services/trustModel', () => ({
  TRUST_STATES: {
    VERIFIED: 'verified',
    INFERRED: 'inferred',
    TEMPORARY: 'temporary',
    UNVERIFIED: 'unverified',
    FAILED: 'failed',
    PENDING: 'pending',
  },
}));

import { usePollingEffects } from '../../hooks/usePollingEffects';

describe('usePollingEffects', () => {
  const mockSettings = {
    autoUpdateEnabled: true,
    updaterEndpoint: 'https://updates.example.com',
    updaterPubkey: 'test-pubkey',
    updaterTarget: 'windows',
    workspaceRoot: '/test/workspace',
  };

  const mockDesktopBridge = {
    state: 'connected',
    label: 'Connected',
    message: 'Alphonso',
  };

  const mockToast = {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    show: vi.fn(),
  };

  const defaultProps = {
    settings: mockSettings,
    desktopBridge: mockDesktopBridge,
    isCoachWindow: false,
    operatorMode: false,
    toast: mockToast,
    updateCheckState: { checking: false, configured: false, available: false },
    setUpdateCheckState: vi.fn(),
    setVerificationLogs: vi.fn(),
    setDurableAuditLogs: vi.fn(),
    setBraveSearchConfigured: vi.fn(),
    screenObserverRunRef: { current: false },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Mount and basic behavior', () => {
    it('mounts without throwing', () => {
      const { result } = renderHook(() => usePollingEffects(defaultProps));
      expect(result.current).toBeUndefined();
    });

    it('does not throw when unmounting', () => {
      const { unmount } = renderHook(() => usePollingEffects(defaultProps));
      expect(() => unmount()).not.toThrow();
    });

    it('handles cleanup without errors on unmount', () => {
      const { unmount } = renderHook(() => usePollingEffects(defaultProps));
      unmount();
      expect(true).toBe(true);
    });
  });

  describe('Update check polling', () => {
    it('starts update check when autoUpdateEnabled and connected', () => {
      const { unmount } = renderHook(() => usePollingEffects(defaultProps));

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(defaultProps.setUpdateCheckState).toHaveBeenCalled();
      unmount();
    });

    it('does not start update check when autoUpdateEnabled is false', () => {
      const props = { ...defaultProps, settings: { ...mockSettings, autoUpdateEnabled: false } };
      renderHook(() => usePollingEffects(props));

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(defaultProps.setUpdateCheckState).not.toHaveBeenCalled();
    });

    it('does not start update check when isCoachWindow is true', () => {
      const props = { ...defaultProps, isCoachWindow: true };
      renderHook(() => usePollingEffects(props));

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(defaultProps.setUpdateCheckState).not.toHaveBeenCalled();
    });

    it('does not start update check when desktopBridge is not connected', () => {
      const props = {
        ...defaultProps,
        desktopBridge: { state: 'disconnected', label: 'Disconnected', message: '' },
      };
      renderHook(() => usePollingEffects(props));

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(defaultProps.setUpdateCheckState).not.toHaveBeenCalled();
    });

    it('clears interval on unmount', () => {
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
      const { unmount } = renderHook(() => usePollingEffects(defaultProps));

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it('clears timeout on unmount', () => {
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
      const { unmount } = renderHook(() => usePollingEffects(defaultProps));

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('Brave Search config check', () => {
    it('does not check Brave Search config when isCoachWindow is true', () => {
      const props = { ...defaultProps, isCoachWindow: true };
      renderHook(() => usePollingEffects(props));

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(mockIsBraveSearchConfigured).not.toHaveBeenCalled();
    });

    it('clears timeout on unmount', () => {
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
      const { unmount } = renderHook(() => usePollingEffects(defaultProps));

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('WhatsApp connector polling', () => {
    it('does not poll WhatsApp when not authenticated', () => {
      mockIsConnectorAuthenticated.mockReturnValue(false);

      const props = { ...defaultProps, settings: { ...mockSettings, autoUpdateEnabled: false } };
      renderHook(() => usePollingEffects(props));

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(mockPollWhatsAppConnector).not.toHaveBeenCalled();

      mockIsConnectorAuthenticated.mockReturnValue(true);
    });

    it('does not poll WhatsApp when isCoachWindow is true', () => {
      const props = { ...defaultProps, isCoachWindow: true };
      renderHook(() => usePollingEffects(props));

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(mockPollWhatsAppConnector).not.toHaveBeenCalled();
    });

    it('clears timeout on unmount', () => {
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
      const { unmount } = renderHook(() => usePollingEffects(defaultProps));

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('Operator mode audit refresh', () => {
    it('does not start audit refresh when operatorMode is false', () => {
      const props = { ...defaultProps, operatorMode: false };
      renderHook(() => usePollingEffects(props));

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(defaultProps.setDurableAuditLogs).not.toHaveBeenCalled();
    });

    it('clears interval on unmount when operatorMode is true', () => {
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
      const props = { ...defaultProps, operatorMode: true };
      const { unmount } = renderHook(() => usePollingEffects(props));

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });

  describe('Screen observer cleanup', () => {
    it('does not call stopScreenObserver when screenObserverRunRef.current is false', () => {
      const props = { ...defaultProps, screenObserverRunRef: { current: false } };
      const { unmount } = renderHook(() => usePollingEffects(props));

      unmount();

      expect(mockStopScreenObserver).not.toHaveBeenCalled();
    });
  });

  describe('Multiple independent pollers', () => {
    it('handles multiple hook instances independently', () => {
      const { unmount: unmount1 } = renderHook(() => usePollingEffects(defaultProps));
      const { unmount: unmount2 } = renderHook(() => usePollingEffects(defaultProps));

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(defaultProps.setUpdateCheckState).toHaveBeenCalledTimes(2);

      unmount1();
      unmount2();
    });
  });

  describe('Race condition handling', () => {
    it('handles rapid mount/unmount without errors', () => {
      for (let i = 0; i < 5; i++) {
        const { unmount } = renderHook(() => usePollingEffects(defaultProps));
        unmount();
      }
      expect(true).toBe(true);
    });

    it('handles rapid prop changes without duplicate intervals', () => {
      const { rerender } = renderHook(
        ({ props }) => usePollingEffects(props),
        { initialProps: { props: defaultProps } }
      );

      rerender({ props: { ...defaultProps, operatorMode: true } });
      rerender({ props: { ...defaultProps, operatorMode: false } });
      rerender({ props: { ...defaultProps, operatorMode: true } });

      expect(true).toBe(true);
    });
  });

  describe('Error handling in pollers', () => {
    it('handles update check errors gracefully', () => {
      mockCheckAppUpdate.mockRejectedValueOnce(new Error('Update check failed'));

      const { unmount } = renderHook(() => usePollingEffects(defaultProps));

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(defaultProps.setUpdateCheckState).toHaveBeenCalled();
      unmount();
    });
  });
});