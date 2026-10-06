import React from 'react';
import { UxMode } from '../hooks/useUxMode';

interface ModeToggleProps {
  mode: UxMode;
  onModeChange: (mode: UxMode) => void;
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg bg-(--surface-1) p-0.5"
      role="radiogroup"
      aria-label="Display mode"
    >
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'simple'}
        onClick={() => onModeChange('simple')}
        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
          mode === 'simple'
            ? 'bg-(--accent) text-(--accent-contrast)'
            : 'text-(--text-2) hover:text-(--text-1)'
        }`}
      >
        Simple
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'advanced'}
        onClick={() => onModeChange('advanced')}
        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
          mode === 'advanced'
            ? 'bg-(--accent) text-(--accent-contrast)'
            : 'text-(--text-2) hover:text-(--text-1)'
        }`}
      >
        Advanced
      </button>
    </div>
  );
}
