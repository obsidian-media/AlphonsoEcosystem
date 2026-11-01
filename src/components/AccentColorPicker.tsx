// Settings → Appearance: the app's accent colour (buttons, highlights, links), in light and
// dark. Replaced three "environment themes" that only tinted the background at 2–3% (2.11.0 QA).
import React from 'react';
import { ACCENT_THEMES, useAccentTheme, type AccentTheme } from '../hooks/useAccentTheme';

// The swatch shows the colour itself: the same tokens, read under that accent.
const SWATCH: Record<AccentTheme, string> = {
  cyan: 'oklch(78% 0.18 200)',
  green: 'oklch(72% 0.19 145)',
  purple: 'oklch(72% 0.2 295)',
  gold: 'oklch(80% 0.16 80)',
};

export function AccentColorPicker() {
  const [accent, setAccent] = useAccentTheme();
  return (
    <div role="radiogroup" aria-label="Accent colour" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ACCENT_THEMES.map((theme) => {
        const active = accent === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={theme.label}
            data-testid={`accent-${theme.id}`}
            onClick={() => setAccent(theme.id)}
            className={`flex flex-col items-center gap-2 rounded-xl p-3 transition-all ${
              active ? 'bg-(--accent-dim) ring-1 ring-(--accent-border)' : 'bg-(--surface-2) hover:bg-(--surface-3)'
            }`}
          >
            <span aria-hidden="true" className="h-10 w-full rounded-lg" style={{ background: SWATCH[theme.id] }} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-3)">{theme.label}</span>
          </button>
        );
      })}
    </div>
  );
}
