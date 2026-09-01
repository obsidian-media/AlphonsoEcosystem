import { useState } from 'react';

export type UxMode = 'simple' | 'advanced';

export function useUxMode(): [UxMode, (mode: UxMode) => void] {
  // Defaults to 'advanced' (the full nav that already existed) so upgrading users keep
  // every surface they already had. 'simple' is an explicit opt-in via the TopBar toggle,
  // not a default — see the Playwright regression this caused when it briefly defaulted
  // to 'simple': e2e/{runtime-tools,smoke,voice}.spec.js failures from hidden nav items.
  const [mode, setMode] = useState<UxMode>(() => {
    return (localStorage.getItem('alphonso_ux_mode') as UxMode) || 'advanced';
  });

  const updateMode = (newMode: UxMode) => {
    localStorage.setItem('alphonso_ux_mode', newMode);
    setMode(newMode);
  };

  return [mode, updateMode];
}
