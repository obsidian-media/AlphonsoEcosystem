import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether the user has asked their OS to reduce motion.
 *
 * `src/index.css` already neutralises CSS animations and transitions globally
 * under this same media query, so most of the app needs nothing further. This
 * hook exists for the cases CSS cannot reach: JavaScript-driven timing, where
 * an animation's *duration* is a `setTimeout` that holds the user on a screen
 * regardless of what the stylesheet says. The Setup activation sequence is
 * exactly that case.
 *
 * Falls back to `false` (motion allowed) when `matchMedia` is unavailable —
 * older webviews and jsdom both lack it, and showing an animation is a far
 * better failure mode than throwing inside a screen that gates the whole app.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(QUERY);
    const onChange = (event: { matches: boolean }) => setPrefersReduced(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return prefersReduced;
}
