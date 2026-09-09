import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusable(container: HTMLElement): HTMLElement[] {
  // No visibility filter: every consumer of this hook is a "mounted only
  // while open" modal/panel, never a hidden-but-present one, so anything
  // matching the selector inside the container is genuinely meant to be
  // focusable. (offsetParent-based visibility checks are also unreliable
  // here regardless -- jsdom never computes real layout, so offsetParent is
  // always null in tests even for elements that are visibly rendered.)
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Traps Tab/Shift+Tab focus within `containerRef` while `active` is true, and
 * restores focus to whatever had it beforehand once `active` goes false or
 * the component unmounts. Deliberately does NOT handle Escape -- every
 * modal-like surface in this app already has its own Escape behavior (some,
 * like CoachHardInterruptOverlay, deliberately have none), so mixing that in
 * here would be a second, conflicting place to look for it.
 *
 * Does not steal focus from an element a caller already focused on open
 * (e.g. MemorySearch.tsx focusing its own search input) -- only focuses the
 * first focusable element when nothing inside the container already has
 * focus, checked on the same tick `active` flips true.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    if (!container.contains(document.activeElement)) {
      const focusable = getFocusable(container);
      (focusable[0] ?? container).focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable(container);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;

      if (e.shiftKey) {
        if (current === first || !container.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !container.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // The element that had focus before may itself be gone by now (e.g. a
      // list row that got removed) -- restoring to a detached element is a
      // silent no-op in every browser, not an error, so no guard is needed
      // beyond confirming it's still connected to the document at all.
      if (previouslyFocused.current && document.contains(previouslyFocused.current)) {
        previouslyFocused.current.focus();
      }
    };
  }, [active, containerRef]);
}
