import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { activationPulse, activationPortal, emblemIgnite } from '../../lib/motion';
import alphonsoEmblem from '../../assets/branding/alphonso-emblem.webp';

export interface BootRitualIntroProps {
  onFinish: () => void;
}

// Design doc §5 step 1 ("Boot / Ritual Intro"): "emblem forms, brief scanline
// sweep, skippable, 2-3s. Visual direction: Cyberpunk Ritual (neon grid
// lines, glow rings, monospace HUD readouts)." This is the opening beat of
// the same ritual grammar the closing Activation Sequence (step 7) already
// uses -- reuses its exact Framer Motion variants (activationPulse/
// activationPortal/emblemIgnite) rather than inventing a second animation
// language, just recolored: per the doc's own color-correction section,
// only step 7's emblem-reveal moment gets the real sampled green/orange --
// every other piece of Setup chrome, including this screen's grid/rings/HUD
// text, uses the app's existing --accent cyan token. The emblem image
// itself keeps its own baked-in colors regardless (it's a raster asset, not
// recolored by CSS `color`).
const DURATION_MS = 2600;
const REDUCED_MOTION_MS = 300;

const HUD_LINES = ['ALPHONSO', 'INITIALIZING SYSTEM…', 'ESTABLISHING NEURAL LINK…'];

export function BootRitualIntro({ onFinish }: BootRitualIntroProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  // A ref, not state: skip() can be reached twice in the same tick (the
  // native <button>'s own Enter/Space activation plus the document-level
  // keydown listener below both fire when the button happens to be
  // focused), and React state reads stale within a single synchronous
  // batch -- a state-based guard would let both calls through and invoke
  // onFinish twice. A ref updates immediately, so the second call always
  // sees it.
  const skippedRef = useRef(false);

  // "Skippable" per the design doc -- any of click, Enter, Space, or Escape
  // ends the intro immediately rather than making every user sit through a
  // few seconds of decoration on every single first run they ever trigger
  // (e.g. a QA/dev repeatedly clearing the setup-complete flag). The
  // auto-advance timer below also routes through this, not a raw onFinish
  // call, so the same guard covers "user skipped right as the timer fired"
  // without a second onFinish reaching the parent.
  const skip = () => {
    if (skippedRef.current) return;
    skippedRef.current = true;
    onFinish();
  };

  useEffect(() => {
    const duration = prefersReducedMotion ? REDUCED_MOTION_MS : DURATION_MS;
    const timer = setTimeout(skip, duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- skip is stable in behavior (only reads/writes the ref and calls the onFinish prop); re-arming the timer on every onFinish identity change would restart the countdown unnecessarily
  }, [prefersReducedMotion]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') skip();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- skip is stable in behavior (only reads/writes the ref); re-subscribing on every render would be wasteful, not incorrect
  }, []);

  return (
    <button
      type="button"
      onClick={skip}
      aria-label="Skip intro"
      // role="status" (not "alert"): this is atmosphere, not information the
      // user must act on -- a screen reader shouldn't interrupt anything to
      // announce it, and the "ALPHONSO" HUD line below is enough context.
      className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[var(--surface-0)] text-left cursor-pointer"
    >
      {!prefersReducedMotion && (
        <>
          {/* Neon grid lines -- a static CSS pattern rather than an animated
              particle field: real motion budget here is spent on the pulse/
              portal/emblem beats below, which already carry the "reveal"
              feeling; a busy animated grid underneath would compete with
              them rather than support them. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'linear-gradient(var(--accent) 1px, transparent 1px), linear-gradient(90deg, var(--accent) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          {/* Scanline sweep -- one pass top-to-bottom, timed to finish before
              the emblem ignites so it reads as "revealing" the scene rather
              than covering the payoff. */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-x-0 h-24"
            style={{
              background: 'linear-gradient(180deg, transparent, var(--accent-glow), transparent)',
            }}
            initial={{ top: '-10%', opacity: 0 }}
            animate={{ top: '110%', opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.3, ease: 'easeInOut' }}
          />
          {/* Glow rings -- the same pulse/portal shape language as the
              closing Activation Sequence, recolored to --accent cyan per
              the design doc's resolved color split. */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={activationPulse}
            className="absolute inset-0 rounded-full"
            style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)' }}
          />
          <motion.div
            initial="hidden"
            animate="visible"
            variants={activationPortal}
            className="absolute h-64 w-64 rounded-full border-4"
            style={{ borderColor: 'var(--accent)' }}
          />
        </>
      )}
      {/* Emblem forms + monospace HUD readouts. Reduced motion renders at
          final state immediately, same pattern as ActivationSequence. */}
      <motion.div
        initial={prefersReducedMotion ? 'visible' : 'hidden'}
        animate="visible"
        variants={emblemIgnite}
        className="relative z-10 flex flex-col items-center gap-4"
        style={{ color: 'var(--accent)' }}
      >
        <img src={alphonsoEmblem} alt="" aria-hidden="true" className="h-20 w-20" />
        <div role="status" className="flex flex-col items-center gap-1.5 font-mono">
          {HUD_LINES.map((line, i) => (
            <p
              key={line}
              className={i === 0 ? 'text-lg font-bold uppercase tracking-[0.3em] text-[var(--accent)]' : 'text-[11px] uppercase tracking-widest text-[var(--text-3)]'}
            >
              {line}
            </p>
          ))}
        </div>
      </motion.div>
      <span className="absolute bottom-6 right-6 text-[10px] uppercase tracking-widest text-[var(--text-4)]">
        Click or press Enter to skip
      </span>
    </button>
  );
}
