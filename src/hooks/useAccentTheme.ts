import { useState, useEffect } from 'react';

export type AccentTheme = 'cyan' | 'green' | 'purple';

const STORAGE_KEY = 'alphonso_accent_theme';

export function useAccentTheme(): [AccentTheme, (theme: AccentTheme) => void] {
  const [theme, setThemeState] = useState<AccentTheme>(() => {
    return (localStorage.getItem(STORAGE_KEY) as AccentTheme) || 'cyan';
  });

  useEffect(() => {
    if (theme === 'cyan') {
      document.documentElement.removeAttribute('data-accent');
    } else {
      document.documentElement.setAttribute('data-accent', theme);
    }
  }, [theme]);

  const setTheme = (newTheme: AccentTheme) => {
    localStorage.setItem(STORAGE_KEY, newTheme);
    setThemeState(newTheme);
  };

  return [theme, setTheme];
}
