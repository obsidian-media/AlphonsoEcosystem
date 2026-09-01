import { useState } from 'react';

export type UxMode = 'simple' | 'advanced';

export function useUxMode(): [UxMode, (mode: UxMode) => void] {
  const [mode, setMode] = useState<UxMode>(() => {
    return (localStorage.getItem('alphonso_ux_mode') as UxMode) || 'simple';
  });

  const updateMode = (newMode: UxMode) => {
    localStorage.setItem('alphonso_ux_mode', newMode);
    setMode(newMode);
  };

  return [mode, updateMode];
}
