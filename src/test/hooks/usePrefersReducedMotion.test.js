import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

/**
 * Builds a controllable matchMedia stub. jsdom does not implement matchMedia
 * at all, so without this the hook has nothing to read.
 */
function stubMatchMedia(initialMatches) {
  const listeners = new Set();
  const mql = {
    get matches() { return mql._matches; },
    _matches: initialMatches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_event, cb) => listeners.add(cb),
    removeEventListener: (_event, cb) => listeners.delete(cb),
    // Emulate the OS-level setting changing while the app is open.
    _change(next) {
      mql._matches = next;
      listeners.forEach((cb) => cb({ matches: next }));
    },
    _listenerCount: () => listeners.size,
  };
  window.matchMedia = vi.fn(() => mql);
  return mql;
}

const originalMatchMedia = window.matchMedia;
afterEach(() => { window.matchMedia = originalMatchMedia; });
beforeEach(() => vi.clearAllMocks());

describe('usePrefersReducedMotion', () => {
  it('reports false when the user has expressed no reduced-motion preference', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it('reports true when the OS reduced-motion setting is on', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it('reacts to the preference changing while the app is open', () => {
    const mql = stubMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    act(() => mql._change(true));
    expect(result.current).toBe(true);
  });

  it('removes its listener on unmount so it does not leak', () => {
    const mql = stubMatchMedia(false);
    const { unmount } = renderHook(() => usePrefersReducedMotion());
    expect(mql._listenerCount()).toBe(1);
    unmount();
    expect(mql._listenerCount()).toBe(0);
  });

  it('defaults to false when matchMedia is unavailable rather than throwing', () => {
    // Older webviews (and jsdom itself) may not implement matchMedia. Motion
    // is the safe default here: we would rather show the animation than crash
    // the screen that gates the entire app.
    window.matchMedia = undefined;
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });
});
