import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppKeyboardShortcuts } from '../../hooks/useAppKeyboardShortcuts';

function createKeyEvent(key, options = {}) {
  const target = options.target || document.body;
  const event = new KeyboardEvent('keydown', {
    key,
    metaKey: options.metaKey || false,
    ctrlKey: options.ctrlKey || false,
    shiftKey: options.shiftKey || false,
    altKey: options.altKey || false,
    cancelable: true,
    bubbles: true,
    ...options
  });
  Object.defineProperty(event, 'target', { value: target, writable: false });
  return event;
}

describe('useAppKeyboardShortcuts', () => {
  let props;

  beforeEach(() => {
    vi.clearAllMocks();
    props = {
      approvalPending: null,
      setApprovalPending: vi.fn(),
      setApprovalRequiredNotice: vi.fn(),
      approvalResolveRef: { current: vi.fn() },
      switchTab: vi.fn(),
      setShowKeyboardShortcuts: vi.fn()
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Shortcut registration and handler execution', () => {
    it('registers keydown listener on mount', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      renderHook(() => useAppKeyboardShortcuts(props));
      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      addEventListenerSpy.mockRestore();
    });

    it('unregisters keydown listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => useAppKeyboardShortcuts(props));
      unmount();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });

    it('executes handler for Cmd+, (switchTab settings) on Mac', () => {
      renderHook(() => useAppKeyboardShortcuts(props));

      act(() => {
        document.body.dispatchEvent(createKeyEvent(',', { metaKey: true }));
      });

      expect(props.switchTab).toHaveBeenCalledWith('settings');
    });

    it('executes handler for Ctrl+, (switchTab settings) on Windows', () => {
      renderHook(() => useAppKeyboardShortcuts(props));

      act(() => {
        document.body.dispatchEvent(createKeyEvent(',', { ctrlKey: true }));
      });

      expect(props.switchTab).toHaveBeenCalledWith('settings');
    });

    it('executes handler for Cmd+? (show keyboard shortcuts)', () => {
      renderHook(() => useAppKeyboardShortcuts(props));

      act(() => {
        document.body.dispatchEvent(createKeyEvent('?', { metaKey: true }));
      });

      expect(props.setShowKeyboardShortcuts).toHaveBeenCalledWith(true);
    });

    it('executes handler for Ctrl+? (show keyboard shortcuts) on Windows', () => {
      renderHook(() => useAppKeyboardShortcuts(props));

      act(() => {
        document.body.dispatchEvent(createKeyEvent('?', { ctrlKey: true }));
      });

      expect(props.setShowKeyboardShortcuts).toHaveBeenCalledWith(true);
    });

    it('executes handler for Escape when approvalPending is truthy', () => {
      props.approvalPending = { id: 'approval-123', type: 'tool_call' };
      renderHook(() => useAppKeyboardShortcuts(props));

      act(() => {
        document.body.dispatchEvent(createKeyEvent('Escape'));
      });

      expect(props.setApprovalPending).toHaveBeenCalledWith(null);
      expect(props.setApprovalRequiredNotice).toHaveBeenCalledWith(true);
      expect(props.approvalResolveRef.current).toHaveBeenCalledWith(false);
    });

    it('does NOT execute Escape handler when approvalPending is null', () => {
      props.approvalPending = null;
      renderHook(() => useAppKeyboardShortcuts(props));

      act(() => {
        document.body.dispatchEvent(createKeyEvent('Escape'));
      });

      expect(props.setApprovalPending).not.toHaveBeenCalled();
      expect(props.setApprovalRequiredNotice).not.toHaveBeenCalled();
      expect(props.approvalResolveRef.current).not.toHaveBeenCalled();
    });
  });

  describe('Context-aware: Escape key with approvalPending', () => {
    it('executes handler for Escape when approvalPending is truthy', () => {
      const approvalPending = { id: 'approval-123' };
      const testProps = { ...props, approvalPending };
      renderHook(() => useAppKeyboardShortcuts(testProps));

      act(() => {
        document.body.dispatchEvent(createKeyEvent('Escape'));
      });

      expect(testProps.setApprovalPending).toHaveBeenCalledWith(null);
      expect(testProps.setApprovalRequiredNotice).toHaveBeenCalledWith(true);
      expect(testProps.approvalResolveRef.current).toHaveBeenCalledWith(false);
    });

    it('does NOT execute Escape handler when approvalPending is null', () => {
      const testProps = { ...props, approvalPending: null };
      renderHook(() => useAppKeyboardShortcuts(testProps));

      act(() => {
        document.body.dispatchEvent(createKeyEvent('Escape'));
      });

      expect(testProps.setApprovalPending).not.toHaveBeenCalled();
      expect(testProps.setApprovalRequiredNotice).not.toHaveBeenCalled();
      expect(testProps.approvalResolveRef.current).not.toHaveBeenCalled();
    });
  });

  describe('Platform-specific keys (Mac Meta vs Win Ctrl)', () => {
    it('handles Meta key as modifier on Mac for Cmd+,', () => {
      renderHook(() => useAppKeyboardShortcuts(props));

      act(() => {
        document.body.dispatchEvent(createKeyEvent(',', { metaKey: true }));
      });

      expect(props.switchTab).toHaveBeenCalledWith('settings');
    });

    it('handles Ctrl key as modifier on Windows for Ctrl+,', () => {
      renderHook(() => useAppKeyboardShortcuts(props));

      act(() => {
        document.body.dispatchEvent(createKeyEvent(',', { ctrlKey: true }));
      });

      expect(props.switchTab).toHaveBeenCalledWith('settings');
    });

    it('requires modifier key (metaKey OR ctrlKey) for shortcuts', () => {
      renderHook(() => useAppKeyboardShortcuts(props));

      act(() => {
        document.body.dispatchEvent(createKeyEvent(','));
      });

      expect(props.switchTab).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup on unmount', () => {
    it('removes event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => useAppKeyboardShortcuts(props));

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledTimes(1);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });

    it('does not execute handlers after unmount', () => {
      const { unmount } = renderHook(() => useAppKeyboardShortcuts(props));

      unmount();

      act(() => {
        document.body.dispatchEvent(createKeyEvent(',', { metaKey: true }));
      });

      expect(props.switchTab).not.toHaveBeenCalled();
    });

    it('can be mounted and unmounted multiple times', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount: unmount1 } = renderHook(() => useAppKeyboardShortcuts(props));
      unmount1();

      const { unmount: unmount2 } = renderHook(() => useAppKeyboardShortcuts(props));
      unmount2();

      expect(addSpy).toHaveBeenCalledTimes(2);
      expect(removeSpy).toHaveBeenCalledTimes(2);
      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe('Dynamic shortcut reconfiguration', () => {
    it('uses updated props when dependencies change', () => {
      const initialProps = { ...props, switchTab: vi.fn() };
      const { rerender } = renderHook(
        ({ props }) => useAppKeyboardShortcuts(props),
        { initialProps: { props: initialProps } }
      );

      act(() => {
        document.body.dispatchEvent(createKeyEvent(',', { metaKey: true }));
      });
      expect(initialProps.switchTab).toHaveBeenCalledWith('settings');

      const newSwitchTab = vi.fn();
      const newProps = { ...props, switchTab: newSwitchTab };
      rerender({ props: newProps });

      act(() => {
        document.body.dispatchEvent(createKeyEvent(',', { metaKey: true }));
      });
      expect(newSwitchTab).toHaveBeenCalledWith('settings');
    });

    it('uses updated approvalPending when it changes', () => {
      const initialProps = { ...props, approvalPending: null };
      const { rerender } = renderHook(
        ({ props }) => useAppKeyboardShortcuts(props),
        { initialProps: { props: initialProps } }
      );

      act(() => {
        document.body.dispatchEvent(createKeyEvent('Escape'));
      });
      expect(initialProps.setApprovalPending).not.toHaveBeenCalled();

      const newProps = { ...props, approvalPending: { id: 'approval-456' } };
      rerender({ props: newProps });

      act(() => {
        document.body.dispatchEvent(createKeyEvent('Escape'));
      });
      expect(newProps.setApprovalPending).toHaveBeenCalledWith(null);
    });
  });

  describe('Prevent default behavior', () => {
    it('prevents default browser behavior for registered shortcuts', () => {
      renderHook(() => useAppKeyboardShortcuts(props));

      const event = createKeyEvent(',', { metaKey: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      act(() => {
        document.body.dispatchEvent(event);
      });

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('does not prevent default for unregistered keys', () => {
      renderHook(() => useAppKeyboardShortcuts(props));

      const event = createKeyEvent('x', { metaKey: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      act(() => {
        document.body.dispatchEvent(event);
      });

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });
});