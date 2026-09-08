import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { activationPulse, activationPortal, emblemIgnite } from '../../lib/motion';
import alphonsoEmblem from '../../assets/branding/alphonso-emblem.webp';

export interface ActivationSequenceProps {
  variant: 'full' | 'toast';
  onFinish: () => void;
}

// Real durations per the design doc §5 step 7. Full = 3-4s full-screen;
// toast = ~1.5s non-blocking. The full variant's Framer Motion choreography
// (activationPulse/activationPortal/emblemIgnite in lib/motion.ts) is timed
// to land inside this window — see that file's comments for the exact beat.
const DURATIONS_MS: Record<'full' | 'toast', number> = {
  full: 3500,
  toast: 1500,
};

// With reduced motion requested, both variants collapse to a brief beat.
// Deliberately not zero: this screen carries real "your setup finished"
// meaning, so it stays long enough to read and to be announced, it just
// stops being a spectacle. The global prefers-reduced-motion rule in
// index.css cannot do this — it neutralises CSS animation, but a setTimeout
// holds the user here regardless of what the stylesheet says, and Framer
// Motion's own animations still need to be skipped explicitly below.
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
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[var(--surface-0)]">
      {!prefersReducedMotion && (
        <>
          {/* Step A: full-screen pulse in the real Alphonso green. */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={activationPulse}
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle, var(--emblem-green,#8EDB64) 0%, transparent 70%)',
            }}
          />
          {/* Step B: portal/radial expansion. */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={activationPortal}
            className="absolute h-64 w-64 rounded-full border-4"
            style={{ borderColor: 'var(--emblem-orange,#F87C02)' }}
          />
        </>
      )}
      {/* Step C: emblem ignite. With reduced motion this renders immediately
          at its final state instead of animating in — still the same
          content, just without the transition. */}
      <motion.div
        initial={prefersReducedMotion ? 'visible' : 'hidden'}
        animate="visible"
        variants={emblemIgnite}
        className="relative z-10 flex flex-col items-center gap-4"
        style={{ color: 'var(--emblem-green,#8EDB64)' }}
      >
        <img src={alphonsoEmblem} alt="Alphonso emblem" className="h-24 w-24" />
        <p role="status" className="text-2xl font-semibold text-[var(--emblem-green,#8EDB64)]">
          Alphonso is online.
        </p>
      </motion.div>
    </div>
  );
}
