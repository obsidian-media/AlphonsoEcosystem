import { useState, useEffect } from 'react';

export type AccentTheme = 'cyan' | 'green' | 'purple' | 'gold';

/** The accent colours Settings → Appearance offers (2.11.0 QA: the old themes changed nothing visible). */
export const ACCENT_THEMES: ReadonlyArray<{ id: AccentTheme; label: string }> = [
  { id: 'cyan', label: 'Cyan' },
  { id: 'green', label: 'Green' },
  { id: 'purple', label: 'Purple' },
  { id: 'gold', label: 'Gold' },
];

const STORAGE_KEY = 'alphonso_accent_theme';

function readStored(): AccentTheme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return ACCENT_THEMES.some((t) => t.id === value) ? (value as AccentTheme) : 'cyan';
  } catch {
    return 'cyan';
  }
}

export function useAccentTheme(): [AccentTheme, (theme: AccentTheme) => void] {
  const [theme, setThemeState] = useState<AccentTheme>(readStored);

  useEffect(() => {
    if (theme === 'cyan') {
      document.documentElement.removeAttribute('data-accent');
    } else {
      document.documentElement.setAttribute('data-accent', theme);
    }
  }, [theme]);

  const setTheme = (newTheme: AccentTheme) => {
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // The colour still changes for this session.
    }
    setThemeState(newTheme);
  };

  return [theme, setTheme];
}
