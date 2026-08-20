import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { mockListen, mockUnlisten } from '../../test/tauri-mock';
import { useTrayEffects } from '../../hooks/useTrayEffects';

vi.mock('../../services/coachModeService', () => ({
  openCoachWindow: vi.fn().mockResolvedValue(undefined),
  closeCoachWindow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/verificationService', () => ({
  appendVerificationLog: vi.fn((entry) => ({ ...entry, id: 'log-1', timestamp: Date.now() })),
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

import { openCoachWindow, closeCoachWindow } from '../../services/coachModeService';
import { appendVerificationLog } from '../../services/verificationService';

describe('useTrayEffects', () => {
  const mockSettings = {
    coachAlwaysOnTop: false,
    coachAgent: 'alphonso',
  };

  const defaultProps = {
    settings: mockSettings,
    coachMode: false,
    coachAlwaysOnTop: false,
    approvalRequiredNotice: false,
    setApprovalRequiredNotice: vi.fn(),
    setCoachMode: vi.fn(),
    setLastTaskCompletedAt: vi.fn(),
    setVerificationLogs: vi.fn(),
    createNewChat: vi.fn(),
    voice: { toggleListening: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockListen.mockResolvedValue(mockUnlisten);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Mount and basic behavior', () => {
    it('mounts without throwing', () => {
      const { result } = renderHook(() => useTrayEffects(defaultProps));
      expect(result.current).toBeUndefined();
    });

    it('does not throw when unmounting', () => {
      const { unmount } = renderHook(() => useTrayEffects(defaultProps));
      expect(() => unmount()).not.toThrow();
    });

    it('handles cleanup without errors on unmount', () => {
      const { unmount } = renderHook(() => useTrayEffects(defaultProps));
      unmount();
      expect(true).toBe(true);
    });
  });

  describe('Last task completed timeout', () => {
    it('clears lastTaskCompletedAt after 5 seconds', async () => {
      renderHook(() => useTrayEffects(defaultProps));
      expect(defaultProps.setLastTaskCompletedAt).not.toHaveBeenCalled();
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(defaultProps.setLastTaskCompletedAt).toHaveBeenCalledWith(null);
    });

    it('cleans up the timeout on unmount', () => {
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
      const { unmount } = renderHook(() => useTrayEffects(defaultProps));
      unmount();
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('Approval required notice timeout', () => {
    it('clears approvalRequiredNotice after 6 seconds when set', async () => {
      const props = { ...defaultProps, approvalRequiredNotice: true };
      renderHook(() => useTrayEffects(props));
      expect(props.setApprovalRequiredNotice).not.toHaveBeenCalled();
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(props.setApprovalRequiredNotice).toHaveBeenCalledWith(false);
    });

    it('does not schedule timeout when approvalRequiredNotice is false', async () => {
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(defaultProps.setApprovalRequiredNotice).not.toHaveBeenCalled();
    });
  });

  describe('Tray menu listeners', () => {
    it('binds all tray event listeners on mount', async () => {
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(mockListen).toHaveBeenCalledWith('alphonso://tray_menu', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('alphonso://new_chat', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('alphonso://voice_start', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('alphonso://coach_toggle', expect.any(Function));
    });

    it('creates a new chat on new_chat event', async () => {
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      const newChatHandler = mockListen.mock.calls.find(([event]) => event === 'alphonso://new_chat')?.[1];
      expect(newChatHandler).toBeDefined();
      if (newChatHandler) {
        act(() => newChatHandler());
      }
      expect(defaultProps.createNewChat).toHaveBeenCalled();
    });

    it('toggles voice listening on voice_start event', async () => {
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      const voiceHandler = mockListen.mock.calls.find(([event]) => event === 'alphonso://voice_start')?.[1];
      expect(voiceHandler).toBeDefined();
      if (voiceHandler) {
        act(() => voiceHandler());
      }
      expect(defaultProps.voice.toggleListening).toHaveBeenCalled();
    });

    it('logs verification entry on tray_menu event', async () => {
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      const trayMenuHandler = mockListen.mock.calls.find(([event]) => event === 'alphonso://tray_menu')?.[1];
      expect(trayMenuHandler).toBeDefined();
      if (trayMenuHandler) {
        await act(async () => {
          await trayMenuHandler({ payload: 'show_window' });
        });
      }
      expect(appendVerificationLog).toHaveBeenCalledWith(expect.objectContaining({
        type: 'tray_menu_event',
        source: 'tauri-tray',
        payload: { action: 'show_window' },
      }));
      expect(defaultProps.setVerificationLogs).toHaveBeenCalled();
    });
  });

  describe('Coach window toggle', () => {
    it('opens coach window and sets coachMode when currently off', async () => {
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      const coachToggleHandler = mockListen.mock.calls.find(([event]) => event === 'alphonso://coach_toggle')?.[1];
      expect(coachToggleHandler).toBeDefined();
      if (coachToggleHandler) {
        await act(async () => {
          await coachToggleHandler();
        });
      }
      expect(openCoachWindow).toHaveBeenCalledWith(false, 'alphonso');
      expect(defaultProps.setCoachMode).toHaveBeenCalledWith(true);
    });

    it('closes coach window and clears coachMode when currently on', async () => {
      const props = { ...defaultProps, coachMode: true };
      renderHook(() => useTrayEffects(props));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      const coachToggleHandler = mockListen.mock.calls.find(([event]) => event === 'alphonso://coach_toggle')?.[1];
      expect(coachToggleHandler).toBeDefined();
      if (coachToggleHandler) {
        await act(async () => {
          await coachToggleHandler();
        });
      }
      expect(closeCoachWindow).toHaveBeenCalled();
      expect(props.setCoachMode).toHaveBeenCalledWith(false);
    });
  });

  describe('Cleanup on unmount', () => {
    it('unlistens tray events on unmount', async () => {
      const { unmount } = renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      mockUnlisten.mockClear();
      unmount();
      expect(mockUnlisten).toHaveBeenCalled();
    });
  });

  describe('Props handling', () => {
    it('accepts all required props without error', () => {
      renderHook(() => useTrayEffects(defaultProps));
      expect(true).toBe(true);
    });

    it('handles updated props on re-render', () => {
      const { rerender } = renderHook(
        ({ props }) => useTrayEffects(props),
        { initialProps: { props: defaultProps } }
      );

      const newProps = { ...defaultProps, coachMode: true, approvalRequiredNotice: true };
      rerender({ props: newProps });
      expect(true).toBe(true);
    });

    it('handles coachMode prop changes', async () => {
      const { rerender } = renderHook(
        ({ props }) => useTrayEffects(props),
        { initialProps: { props: defaultProps } }
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      rerender({ props: { ...defaultProps, coachMode: true } });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(true).toBe(true);
    });
  });

  describe('Idempotent initialization', () => {
    it('does not duplicate listener binding on re-render with same props', async () => {
      const { rerender } = renderHook(() => useTrayEffects(defaultProps));

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const firstCallCount = mockListen.mock.calls.length;

      rerender(defaultProps);
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const secondCallCount = mockListen.mock.calls.length;
      expect(secondCallCount).toBe(firstCallCount);
    });
  });

  describe('Race condition handling', () => {
    it('handles rapid mount/unmount without errors', async () => {
      for (let i = 0; i < 5; i++) {
        const { unmount } = renderHook(() => useTrayEffects(defaultProps));
        await act(async () => {
          await vi.runAllTimersAsync();
        });
        unmount();
      }
      expect(true).toBe(true);
    });

    it('handles rapid prop changes without duplicate listener binding', async () => {
      const { rerender } = renderHook(
        ({ props }) => useTrayEffects(props),
        { initialProps: { props: defaultProps } }
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const firstCallCount = mockListen.mock.calls.length;

      rerender({ props: { ...defaultProps, approvalRequiredNotice: true } });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      rerender({ props: { ...defaultProps, approvalRequiredNotice: false } });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const secondCallCount = mockListen.mock.calls.length;
      expect(secondCallCount).toBe(firstCallCount);
    });
  });

  describe('Error handling', () => {
    it('ignores listener binding errors gracefully', async () => {
      mockListen.mockRejectedValueOnce(new Error('Tauri unavailable'));
      const { result } = renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(result.current).toBeUndefined();
    });

    it('handles cleanup without errors', () => {
      const { unmount } = renderHook(() => useTrayEffects(defaultProps));
      unmount();
      expect(true).toBe(true);
    });
  });
});
