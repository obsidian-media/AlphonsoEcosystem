// A thumb-sized on/off switch for the phone's Settings and Connectors (phase 3 part B).
import React from 'react';

export function PhoneSwitch({ label, on, disabled, onChange }: { label: string; on: boolean; disabled?: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-(--accent)' : 'bg-(--surface-3)'}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${on ? 'right-1' : 'left-1'}`} />
    </button>
  );
}
