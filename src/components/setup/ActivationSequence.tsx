import React, { useEffect } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

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

// With reduced motion requested, both variants collapse to a brief beat.
// Deliberately not zero: this screen carries real "your setup finished"
// meaning, so it stays long enough to read and to be announced, it just
// stops being a spectacle. The global prefers-reduced-motion rule in
// index.css cannot do this — it neutralises CSS animation, but a setTimeout
// holds the user here regardless of what the stylesheet says.
const REDUCED_MOTION_MS = 300;

export function ActivationSequence({ variant, onFinish }: ActivationSequenceProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const duration = prefersReducedMotion ? REDUCED_MOTION_MS : DURATIONS_MS[variant];
    const timer = setTimeout(onFinish, duration);
    return () => clearTimeout(timer);
  }, [variant, onFinish, prefersReducedMotion]);

  // role="status" (an implicit aria-live="polite" region) rather than
  // role="alert": completion is good news, and should be announced when the
  // screen reader finishes its current utterance instead of interrupting it.
  if (variant === 'toast') {
    return (
      <div
        role="status"
        className="fixed bottom-6 right-6 rounded-lg border border-[var(--emblem-green,#8EDB64)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-1)]"
      >
        Alphonso is online.
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--surface-0)]">
      <p role="status" className="text-2xl font-semibold text-[var(--emblem-green,#8EDB64)]">
        Alphonso is online.
      </p>
    </div>
  );
}
