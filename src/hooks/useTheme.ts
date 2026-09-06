import { useState, useEffect, useCallback } from 'react';

const THEME_KEY = 'alphonso_theme_v1';

export type Theme = 'dark' | 'light';

function isValidTheme(value: string | null): value is Theme {
  return value === 'dark' || value === 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      // A corrupted/arbitrary stored value (manual edit, a stale key from an
      // older schema) must not become the live theme -- it would get set as
      // the `data-theme` attribute verbatim and match neither the dark nor
      // light CSS, breaking theming silently. Fall back to the safe default.
      return isValidTheme(stored) ? stored : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const setThemeExplicit = useCallback((newTheme: Theme) => {
    setTheme(newTheme);
    try {
      localStorage.setItem(THEME_KEY, newTheme);
    } catch { /* ignore */ }
  }, []);

  return { theme, toggleTheme, setTheme: setThemeExplicit };
}
