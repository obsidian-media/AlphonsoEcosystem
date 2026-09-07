import React, { useEffect } from 'react';

export interface ActivationSequenceProps {
  variant: 'full' | 'toast';
  onFinish: () => void;
}

// Real durations per the design doc §5 step 7. Full = 3-4s full-screen;
// toast = ~1.5s non-blocking. Framer Motion choreography (pulse/portal/
// emblem-ignite animation timing) is the deferred visual-polish pass —
// this is the functionally-correct, plainly-styled version.
const DURATIONS_MS: Record<'full' | 'toast', number> = {
  full: 3500,
  toast: 1500,
};

export function ActivationSequence({ variant, onFinish }: ActivationSequenceProps) {
  useEffect(() => {
    const timer = setTimeout(onFinish, DURATIONS_MS[variant]);
    return () => clearTimeout(timer);
  }, [variant, onFinish]);

  if (variant === 'toast') {
    return (
      <div className="fixed bottom-6 right-6 rounded-lg border border-[var(--emblem-green,#8EDB64)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-1)]">
        Alphonso is online.
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--surface-0)]">
      <p className="text-2xl font-semibold text-[var(--emblem-green,#8EDB64)]">Alphonso is online.</p>
    </div>
  );
}
