import { useState, useEffect, useCallback } from 'react';

const THEME_KEY = 'alphonso_theme_v1';

export type Theme = 'dark' | 'light';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(THEME_KEY) as Theme) || 'dark';
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
