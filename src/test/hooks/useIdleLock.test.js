import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useIdleLock } from '../../hooks/useIdleLock';

function createMouseEvent(type, options = {}) {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    ...options
  });
}

function createKeyboardEvent(type, options = {}) {
  return new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    ...options
  });
}

function createTouchEvent(type, options = {}) {
  return new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    ...options
  });
}

function createEvent(type, options = {}) {
  return new Event(type, {
    bubbles: true,
    cancelable: true,
    ...options
  });
}

describe('useIdleLock', () => {
  let setIsLocked;
  let idleTimerRef;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    document.body.innerHTML = '';
    setIsLocked = vi.fn();
    idleTimerRef = { current: null };
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  describe('Idle detection timer', () => {
    it('calls setIsLocked(false) on mount via reset()', () => {
      renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.083, setIsLocked, idleTimerRef })); // 5000ms = 0.083 minutes

      expect(setIsLocked).toHaveBeenCalledWith(false);
    });

    it('starts idle timer on mount and calls setIsLocked(true) after threshold', () => {
      renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.083, setIsLocked, idleTimerRef })); // 5000ms

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(setIsLocked).toHaveBeenCalledWith(true);
    });

    it('uses custom idle threshold', () => {
      renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.166, setIsLocked, idleTimerRef })); // 10000ms

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(setIsLocked).not.toHaveBeenCalledWith(true);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(setIsLocked).toHaveBeenCalledWith(true);
    });

    it('resets timer on mousemove (calls setIsLocked(false))', () => {
      renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.083, setIsLocked, idleTimerRef }));

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      act(() => {
        window.dispatchEvent(createMouseEvent('mousemove'));
      });

      expect(setIsLocked).toHaveBeenCalledWith(false);

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(setIsLocked).toHaveBeenCalledWith(true);
    });

    it('resets timer on keydown', () => {
      renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.083, setIsLocked, idleTimerRef }));

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      act(() => {
        window.dispatchEvent(createKeyboardEvent('keydown', { key: 'a' }));
      });

      expect(setIsLocked).toHaveBeenCalledWith(false);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(setIsLocked).toHaveBeenCalledWith(true);
    });

    it('resets timer on touchstart', () => {
      renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.083, setIsLocked, idleTimerRef }));

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      act(() => {
        window.dispatchEvent(createTouchEvent('touchstart'));
      });

      expect(setIsLocked).toHaveBeenCalledWith(false);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(setIsLocked).toHaveBeenCalledWith(true);
    });

    it('resets timer on click', () => {
      renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.083, setIsLocked, idleTimerRef }));

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      act(() => {
        window.dispatchEvent(createMouseEvent('click'));
      });

      expect(setIsLocked).toHaveBeenCalledWith(false);
    });

    it('resets timer on scroll', () => {
      renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.083, setIsLocked, idleTimerRef }));

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      act(() => {
        window.dispatchEvent(createEvent('scroll'));
      });

      expect(setIsLocked).toHaveBeenCalledWith(false);
    });
  });

  describe('Activity event listeners', () => {
    it('adds mousedown listener on mount', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.083, setIsLocked, idleTimerRef }));
      expect(addEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function), { passive: true });
      addEventListenerSpy.mockRestore();
    });

    it('adds keydown listener on mount', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.083, setIsLocked, idleTimerRef }));
      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), { passive: true });
      addEventListenerSpy.mockRestore();
    });

    it('adds touchstart listener on mount', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.083, setIsLocked, idleTimerRef }));
      expect(addEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), { passive: true });
      addEventListenerSpy.mockRestore();
    });

    it('removes all listeners on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.083, setIsLocked, idleTimerRef }));
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });
  });

  describe('Auto-lock trigger', () => {
    it('calls setIsLocked(true) when idle threshold reached', () => {
      renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.083, setIsLocked, idleTimerRef }));

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(setIsLocked).toHaveBeenCalledWith(true);
    });

    it('calls setIsLocked(false) when activity resumes after idle', () => {
      renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.083, setIsLocked, idleTimerRef }));

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(setIsLocked).toHaveBeenCalledWith(true);

      act(() => {
        window.dispatchEvent(createMouseEvent('mousemove'));
      });

      expect(setIsLocked).toHaveBeenCalledWith(false);
    });

    it('does not call setIsLocked(true) multiple times without activity in between', () => {
      renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.083, setIsLocked, idleTimerRef }));

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      const callCountAfterFirstIdle = setIsLocked.mock.calls.length;

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(setIsLocked).toHaveBeenCalledTimes(callCountAfterFirstIdle);
    });

    it('calls setIsLocked(true) again after activity and new idle period', () => {
      renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.083, setIsLocked, idleTimerRef }));

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(setIsLocked).toHaveBeenCalledWith(true);

      act(() => {
        window.dispatchEvent(createMouseEvent('mousemove'));
      });
      expect(setIsLocked).toHaveBeenCalledWith(false);

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(setIsLocked).toHaveBeenCalledWith(true);
    });
  });

  describe('Cleanup on unmount', () => {
    it('clears idle timer on unmount', () => {
      const { unmount } = renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.083, setIsLocked, idleTimerRef }));

      act(() => {
        vi.advanceTimersByTime(4000);
      });

      unmount();

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(setIsLocked).not.toHaveBeenCalledWith(true);
    });

    it('removes all event listeners on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => useIdleLock({ idleTimeoutMinutes: 0.083, setIsLocked, idleTimerRef }));

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });
  });
});