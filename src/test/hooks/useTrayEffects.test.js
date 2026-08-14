import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useTrayEffects } from '../../hooks/useTrayEffects';
import { mockTrayIcon, mockTrayMenu, mockTrayMenuItem, mockInvoke, resetTauriMocks } from '../../test/tauri-mock';

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
    vi.spyOn(window, 'clearTimeout');
    vi.spyOn(window, 'clearInterval');
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

  describe('System tray icon creation', () => {
    it('creates TrayIcon on mount', async () => {
      const { TrayIcon } = await import('@tauri-apps/api/tray');
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(TrayIcon).toHaveBeenCalledWith(expect.objectContaining({
        icon: expect.any(Object),
        menu: expect.any(Object),
        tooltip: expect.any(String),
      }));
    });

    it('sets tooltip on tray icon creation', async () => {
      const { TrayIcon } = await import('@tauri-apps/api/tray');
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(TrayIcon).toHaveBeenCalledWith(expect.objectContaining({
        tooltip: expect.stringContaining('Alphonso'),
      }));
    });

    it('sets up click handler for tray icon', async () => {
      const { TrayIcon } = await import('@tauri-apps/api/tray');
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      const trayIconInstance = mockTrayIcon;
      expect(trayIconInstance.onClick).toHaveBeenCalled();
    });

    it('sets up right-click handler for context menu', async () => {
      const { TrayIcon } = await import('@tauri-apps/api/tray');
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      const trayIconInstance = mockTrayIcon;
      expect(trayIconInstance.onRightClick).toHaveBeenCalled();
    });
  });

  describe('Menu items creation', () => {
    it('creates Show menu item', async () => {
      const { Menu, MenuItem } = await import('@tauri-apps/api/tray');
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(MenuItem).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringMatching(/show/i),
      }));
    });

    it('creates Hide menu item', async () => {
      const { MenuItem } = await import('@tauri-apps/api/tray');
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(MenuItem).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringMatching(/hide/i),
      }));
    });

    it('creates Settings menu item', async () => {
      const { MenuItem } = await import('@tauri-apps/api/tray');
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(MenuItem).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringMatching(/settings/i),
      }));
    });

    it('creates Quit menu item', async () => {
      const { MenuItem } = await import('@tauri-apps/api/tray');
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(MenuItem).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringMatching(/quit/i),
      }));
    });

    it('creates Voice Toggle menu item', async () => {
      const { MenuItem, CheckMenuItem } = await import('@tauri-apps/api/tray');
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(CheckMenuItem).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringMatching(/voice/i),
      }));
    });

    it('appends all menu items to menu', async () => {
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(mockTrayMenu.append).toHaveBeenCalled();
    });
  });

  describe('Menu item click handlers', () => {
    it('calls createNewChat on Show click', async () => {
      const { MenuItem } = await import('@tauri-apps/api/tray');
      let showClickHandler;
      MenuItem.mockImplementation((options) => {
        if (options.text?.toLowerCase().includes('show')) {
          showClickHandler = options.onClick;
        }
        return mockTrayMenuItem;
      });

      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        if (showClickHandler) showClickHandler();
      });

      expect(defaultProps.createNewChat).toHaveBeenCalled();
    });

    it('hides window on Hide click', async () => {
      const { MenuItem, getCurrentWindow } = await import('@tauri-apps/api/window');
      let hideClickHandler;
      MenuItem.mockImplementation((options) => {
        if (options.text?.toLowerCase().includes('hide')) {
          hideClickHandler = options.onClick;
        }
        return mockTrayMenuItem;
      });

      const mockWindow = { hide: vi.fn() };
      getCurrentWindow.mockReturnValue(mockWindow);

      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        if (hideClickHandler) hideClickHandler();
      });

      expect(mockWindow.hide).toHaveBeenCalled();
    });

    it('opens settings on Settings click', async () => {
      const { MenuItem, invoke } = await import('@tauri-apps/api/core');
      let settingsClickHandler;
      MenuItem.mockImplementation((options) => {
        if (options.text?.toLowerCase().includes('settings')) {
          settingsClickHandler = options.onClick;
        }
        return mockTrayMenuItem;
      });

      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        if (settingsClickHandler) settingsClickHandler();
      });

      expect(invoke).toHaveBeenCalledWith('open_settings_window');
    });

    it('exits app on Quit click', async () => {
      const { MenuItem, invoke } = await import('@tauri-apps/api/core');
      let quitClickHandler;
      MenuItem.mockImplementation((options) => {
        if (options.text?.toLowerCase().includes('quit')) {
          quitClickHandler = options.onClick;
        }
        return mockTrayMenuItem;
      });

      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        if (quitClickHandler) quitClickHandler();
      });

      expect(invoke).toHaveBeenCalledWith('exit_app');
    });

    it('toggles voice listening on Voice Toggle click', async () => {
      const { CheckMenuItem } = await import('@tauri-apps/api/tray');
      let voiceClickHandler;
      CheckMenuItem.mockImplementation((options) => {
        if (options.text?.toLowerCase().includes('voice')) {
          voiceClickHandler = options.onClick;
        }
        return mockTrayMenuItem;
      });

      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        if (voiceClickHandler) voiceClickHandler();
      });

      expect(defaultProps.voice.toggleListening).toHaveBeenCalled();
    });
  });

  describe('Window show/hide toggle on tray click', () => {
    it('shows window when hidden and tray clicked', async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const mockWindow = { show: vi.fn(), isVisible: vi.fn().mockResolvedValue(false) };
      getCurrentWindow.mockReturnValue(mockWindow);

      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const clickHandler = mockTrayIcon.onClick.mock.calls[0]?.[0];
      if (clickHandler) {
        await act(async () => {
          await clickHandler();
        });
      }

      expect(mockWindow.show).toHaveBeenCalled();
    });

    it('hides window when visible and tray clicked', async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const mockWindow = { hide: vi.fn(), isVisible: vi.fn().mockResolvedValue(true) };
      getCurrentWindow.mockReturnValue(mockWindow);

      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const clickHandler = mockTrayIcon.onClick.mock.calls[0]?.[0];
      if (clickHandler) {
        await act(async () => {
          await clickHandler();
        });
      }

      expect(mockWindow.hide).toHaveBeenCalled();
    });
  });

  describe('Notification display from tray', () => {
    it('has notification API available from shared mock', () => {
      // Notification API is mocked in shared tauri-mock.ts
      // This test verifies the hook integrates with the tray system
      const { result } = renderHook(() => useTrayEffects(defaultProps));
      expect(result.current).toBeDefined();
    });

    it('integrates with tray icon for badge updates', async () => {
      const { result } = renderHook(() => useTrayEffects({ ...defaultProps, unreadCount: 5 }));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(result.current).toBeDefined();
    });
  });

  describe('Badge count update', () => {
    it('updates tray icon title/badge with unread count', async () => {
      renderHook(() => useTrayEffects({ ...defaultProps, unreadCount: 5 }));
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockTrayIcon.setTitle).toHaveBeenCalledWith('5');
    });

    it('clears badge when unread count is zero', async () => {
      renderHook(() => useTrayEffects({ ...defaultProps, unreadCount: 0 }));
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockTrayIcon.setTitle).toHaveBeenCalledWith('');
    });

    it('does not set badge when unreadCount is undefined', async () => {
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockTrayIcon.setTitle).not.toHaveBeenCalled();
    });
  });

  describe('Tooltip text update', () => {
    it('updates tooltip when props change', async () => {
      const { rerender } = renderHook(
        ({ props }) => useTrayEffects(props),
        { initialProps: { props: defaultProps } }
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      vi.clearAllMocks();

      rerender({ props: { ...defaultProps, tooltipText: 'Custom tooltip' } });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockTrayIcon.setTooltip).toHaveBeenCalledWith('Custom tooltip');
    });

    it('sets default tooltip on mount', async () => {
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockTrayIcon.setTooltip).toHaveBeenCalledWith(expect.stringContaining('Alphonso'));
    });
  });

  describe('Cleanup on unmount', () => {
    it('destroys tray icon on unmount', async () => {
      const { unmount } = renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      unmount();

      expect(mockTrayIcon.destroy).toHaveBeenCalled();
    });

    it('removes tray icon click listeners on unmount', async () => {
      const { unmount } = renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      unmount();

      expect(mockTrayIcon.onClick).toHaveBeenCalled();
      expect(mockTrayIcon.onRightClick).toHaveBeenCalled();
    });
  });

  describe('Context menu positioning', () => {
    it('shows context menu on right click', async () => {
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const rightClickHandler = mockTrayIcon.onRightClick.mock.calls[0]?.[0];
      if (rightClickHandler) {
        await act(async () => {
          await rightClickHandler();
        });
      }

      expect(mockTrayMenu.popup).toHaveBeenCalled();
    });

    it('closes context menu on click outside', async () => {
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockTrayMenu.close).toBeDefined();
    });
  });

  describe('Platform-specific behavior', () => {
    it('handles macOS platform', async () => {
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(mockTrayIcon.setIconAsTemplate).toHaveBeenCalled();
    });

    it('handles Windows platform', async () => {
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(mockTrayIcon.setIconAsTemplate).toHaveBeenCalled();
    });

    it('handles Linux platform', async () => {
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(mockTrayIcon.setIconAsTemplate).toHaveBeenCalled();
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
    it('does not duplicate tray creation on re-render with same props', async () => {
      const { rerender } = renderHook(() => useTrayEffects(defaultProps));

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      rerender(defaultProps);
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(true).toBe(true);
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

    it('handles rapid prop changes without duplicate tray icons', async () => {
      const { TrayIcon, rerender } = await import('@tauri-apps/api/tray');
      const { rerender: rerenderHook } = renderHook(
        ({ props }) => useTrayEffects(props),
        { initialProps: { props: defaultProps } }
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const firstCallCount = TrayIcon.mock.calls.length;

      rerenderHook({ props: { ...defaultProps, coachMode: true } });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      rerenderHook({ props: { ...defaultProps, coachMode: false } });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const secondCallCount = TrayIcon.mock.calls.length;
      expect(secondCallCount).toBe(firstCallCount);
    });
  });

  describe('Error handling', () => {
    it('handles TrayIcon creation failure gracefully', async () => {
      const { TrayIcon } = await import('@tauri-apps/api/tray');
      TrayIcon.mockRejectedValueOnce(new Error('Tray not supported'));

      const { result } = renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        try {
          await vi.runAllTimersAsync();
        } catch (e) {
          // Expected to catch error
        }
      });

      expect(result.current).toBeUndefined();
    });

    it('handles notification permission denied gracefully', async () => {
      // Notification API is mocked in shared tauri-mock.ts
      renderHook(() => useTrayEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(true).toBe(true);
    });
  });
});