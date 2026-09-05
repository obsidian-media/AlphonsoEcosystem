import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUxMode } from '../hooks/useUxMode';

beforeEach(() => {
  localStorage.clear();
});

describe('useUxMode', () => {
  it('defaults to advanced', () => {
    const { result } = renderHook(() => useUxMode());
    expect(result.current[0]).toBe('advanced');
  });

  it('reads persisted mode from localStorage', () => {
    localStorage.setItem('alphonso_ux_mode', 'simple');
    const { result } = renderHook(() => useUxMode());
    expect(result.current[0]).toBe('simple');
  });

  it('updates mode', () => {
    const { result } = renderHook(() => useUxMode());
    act(() => {
      result.current[1]('simple');
    });
    expect(result.current[0]).toBe('simple');
  });

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useUxMode());
    act(() => {
      result.current[1]('simple');
    });
    expect(localStorage.getItem('alphonso_ux_mode')).toBe('simple');
  });

  it('toggles back to advanced', () => {
    const { result } = renderHook(() => useUxMode());
    act(() => {
      result.current[1]('simple');
    });
    act(() => {
      result.current[1]('advanced');
    });
    expect(result.current[0]).toBe('advanced');
  });

  it('returns a tuple', () => {
    const { result } = renderHook(() => useUxMode());
    expect(Array.isArray(result.current)).toBe(true);
    expect(result.current).toHaveLength(2);
    expect(typeof result.current[1]).toBe('function');
  });
});
