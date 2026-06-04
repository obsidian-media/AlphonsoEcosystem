import { useEffect } from 'react';

export function useIdleLock({ idleTimeoutMinutes, setIsLocked, idleTimerRef }) {
  useEffect(() => {
    const IDLE_MS = (idleTimeoutMinutes || 10) * 60 * 1000;
    const reset = () => {
      setIsLocked(false);
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setIsLocked(true), IDLE_MS);
    };
    const events = ['mousedown', 'keydown', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(idleTimerRef.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [idleTimeoutMinutes, setIsLocked, idleTimerRef]);
}
