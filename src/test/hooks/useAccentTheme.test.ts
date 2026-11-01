import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAccentTheme, ACCENT_THEMES } from '../../hooks/useAccentTheme';

describe('useAccentTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-accent');
  });

  it('defaults to cyan (no data-accent attribute set) when nothing is persisted', () => {
    const { result } = renderHook(() => useAccentTheme());
    expect(result.current[0]).toBe('cyan');
    expect(document.documentElement.getAttribute('data-accent')).toBeNull();
  });

  it('persists the chosen theme to localStorage and sets the data-accent attribute', () => {
    const { result } = renderHook(() => useAccentTheme());
    act(() => result.current[1]('green'));
    expect(result.current[0]).toBe('green');
    expect(localStorage.getItem('alphonso_accent_theme')).toBe('green');
    expect(document.documentElement.getAttribute('data-accent')).toBe('green');
  });

  it('reads a previously-persisted theme on mount', () => {
    localStorage.setItem('alphonso_accent_theme', 'purple');
    const { result } = renderHook(() => useAccentTheme());
    expect(result.current[0]).toBe('purple');
    expect(document.documentElement.getAttribute('data-accent')).toBe('purple');
  });

  it('removes the data-accent attribute when switching back to cyan', () => {
    const { result } = renderHook(() => useAccentTheme());
    act(() => result.current[1]('green'));
    act(() => result.current[1]('cyan'));
    expect(document.documentElement.getAttribute('data-accent')).toBeNull();
  });

  // 2.11.0 QA (owner, 2026-11-01): Appearance's themes did nothing; it now offers these colours.
  it('offers cyan, green, purple and gold, and ignores a saved value it does not know', () => {
    expect(ACCENT_THEMES.map((t) => t.id)).toEqual(['cyan', 'green', 'purple', 'gold']);
    localStorage.setItem('alphonso_accent_theme', 'orchestrator_gold');
    const { result } = renderHook(() => useAccentTheme());
    expect(result.current[0]).toBe('cyan');
    act(() => result.current[1]('gold'));
    expect(document.documentElement.getAttribute('data-accent')).toBe('gold');
  });
});
