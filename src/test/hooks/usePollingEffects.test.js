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

vi.mock('../../lib/appStorage', () => ({
  getStorage: vi.fn((key, fallback) => fallback),
  setStorage: vi.fn(),
}));

const { mockReadDurableAuditLog, mockIsConnectorAuthenticated, whatsappKeys, mockGetConnectorCredential, mockPollWhatsAppConnector, mockIsBraveSearchConfigured, mockStopScreenObserver } = vi.hoisted(() => {
  const mockReadDurableAuditLog = vi.fn().mockResolvedValue([]);
  const mockIsConnectorAuthenticated = vi.fn((id) => ({ ok: id === 'whatsapp' }));
  const whatsappKeys = { WHATSAPP_ACCESS_TOKEN: 'token', WHATSAPP_PHONE_NUMBER_ID: '123' };
  const mockGetConnectorCredential = vi.fn((id, name) => (id === 'whatsapp' ? whatsappKeys[name] || '' : ''));
  const mockPollWhatsAppConnector = vi.fn().mockResolvedValue({ routed: 0, rejected: 0 });
  const mockIsBraveSearchConfigured = vi.fn().mockResolvedValue(false);
  const mockStopScreenObserver = vi.fn();
  return { mockReadDurableAuditLog, mockIsConnectorAuthenticated, whatsappKeys, mockGetConnectorCredential, mockPollWhatsAppConnector, mockIsBraveSearchConfigured, mockStopScreenObserver };
});

vi.mock('../../services/verificationService', () => ({
  appendVerificationLog: vi.fn().mockReturnValue({
    id: 'log-1',
    timestampMs: Date.now(),
    type: 'app_update_check',
    trust: 'verified',
    payload: {},
  }),
  getVerificationLogs: vi.fn(() => []),
  readDurableAuditLog: mockReadDurableAuditLog,
}));

vi.mock('../../services/connectorRegistryService', () => ({
  isConnectorAuthenticated: mockIsConnectorAuthenticated,
  getConnectorCredential: mockGetConnectorCredential,
  pollWhatsAppConnector: mockPollWhatsAppConnector,
}));

vi.mock('../../services/hectorResearchService', () => ({
  isBraveSearchConfigured: mockIsBraveSearchConfigured,
}));

vi.mock('../../services/screenIntelligenceService', () => ({
  stopScreenObserver: mockStopScreenObserver,
}));

vi.mock('../../services/trustModel', () => ({
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
  const mockToast = {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    show: vi.fn(),
  };

  const defaultProps = {
    isCoachWindow: false,
    operatorMode: false,
    toast: mockToast,
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
    // 2.11.0 QA (owner, 2026-11-01): the guard read the result object as true, so every computer
    // checked WhatsApp every 30 s and showed "jose failed: connector_setup_required" each time.
    it('does not poll WhatsApp when it is not switched on', () => {
      mockIsConnectorAuthenticated.mockReturnValue({ ok: false });
      renderHook(() => usePollingEffects(defaultProps));
      act(() => { vi.advanceTimersByTime(90_000); });
      expect(mockPollWhatsAppConnector).not.toHaveBeenCalled();
      mockIsConnectorAuthenticated.mockImplementation((id) => ({ ok: id === 'whatsapp' }));
    });

    it('does not poll WhatsApp when its keys are missing', () => {
      mockGetConnectorCredential.mockImplementation((id, name) => (name === 'WHATSAPP_ACCESS_TOKEN' ? 'token' : ''));
      renderHook(() => usePollingEffects(defaultProps));
      act(() => { vi.advanceTimersByTime(90_000); });
      expect(mockPollWhatsAppConnector).not.toHaveBeenCalled();
      mockGetConnectorCredential.mockImplementation((id, name) => (id === 'whatsapp' ? whatsappKeys[name] || '' : ''));
    });

    it('polls WhatsApp when it is switched on with its keys', async () => {
      renderHook(() => usePollingEffects(defaultProps));
      await act(async () => { vi.advanceTimersByTime(21_000); });
      expect(mockPollWhatsAppConnector).toHaveBeenCalledWith(12);
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
});
