import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { openCoachWindow, closeCoachWindow } from '../services/coachModeService';
import { recordCoachInterventionAction, buildDemoIntervention, getLatestCoachEngineIntervention, subscribeCoachEngine } from '../services/coachInterventionService';
import { runCoachDetectors } from '../services/coachEngineService';
import { COACH_LAYOUT_KEY, COACH_CORNERS, COACH_PAUSE_MS } from '../constants/appConstants';
import { getStorage } from '../lib/appStorage';
import { useSettings } from './SettingsContext';

const CoachContext = createContext(null);

export function CoachProvider({ children }) {
  const { settings } = useSettings();
  const [coachMode, setCoachMode] = useState(false);
  const [coachAlwaysOnTop, setCoachAlwaysOnTop] = useState(true);
  const [coachMiniMode, setCoachMiniMode] = useState(() => {
    const layout = getStorage(COACH_LAYOUT_KEY, { mini: false, corner: 'bottom-right' });
    return Boolean(layout?.mini);
  });
  const [coachSnapCorner, setCoachSnapCorner] = useState(() => {
    const layout = getStorage(COACH_LAYOUT_KEY, { mini: false, corner: 'bottom-right' });
    return COACH_CORNERS.includes(layout?.corner) ? layout.corner : 'bottom-right';
  });
  const [coachIntervention, setCoachIntervention] = useState(() => getLatestCoachEngineIntervention());
  const [coachPauseUntilMs, setCoachPauseUntilMs] = useState(0);
  const detectorIntervalRef = useRef(null);

  useEffect(() => {
    const runDetectors = () => {
      const signal = runCoachDetectors();
      if (signal) {
        setCoachIntervention({
          id: signal.id,
          source: 'coach-engine',
          sessionType: 'alphonso-session',
          type: signal.id,
          level: signal.severity === 'critical' ? 'hard' : signal.severity === 'warning' ? 'firm' : 'quiet',
          title: signal.severity === 'critical' ? 'Hard pause recommended' : signal.severity === 'warning' ? 'Coach check-in' : 'Quiet nudge',
          message: signal.message,
          rawMessage: signal.message,
          metrics: { spinCount: 0, netResult: 0, longestLosingStretch: 0, elapsedMinutes: 0 },
          timestampMs: signal.detectedAtMs,
          localOnly: true,
          actions: signal.severity === 'critical'
            ? ['pause_60_seconds', 'end_session', 'continue_anyway']
            : signal.severity === 'warning'
              ? ['pause_60_seconds', 'continue']
              : ['continue']
        });
      }
    };

    runDetectors();
    detectorIntervalRef.current = window.setInterval(runDetectors, 120_000);

    const unsubscribe = subscribeCoachEngine((event) => {
      if (event?.intervention) setCoachIntervention(event.intervention);
    });

    return () => {
      if (detectorIntervalRef.current) window.clearInterval(detectorIntervalRef.current);
      unsubscribe();
    };
  }, []);

  const handleToggleCoachMode = useCallback(async () => {
    if (coachMode) {
      await closeCoachWindow().catch(() => {});
      setCoachMode(false);
      return;
    }

    try {
      await openCoachWindow(coachAlwaysOnTop, settings.coachAgent || 'alphonso');
      setCoachMode(true);
    } catch (error) {
      const isTauriDesktop = typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;
      if (isTauriDesktop) {
        // Real failure inside the desktop runtime (e.g. missing window capability
        // grant) — do not claim success, surface the actual error to the user.
        window.dispatchEvent(new CustomEvent('alphonso:toast', {
          detail: { message: `Coach mode failed to open: ${error?.message || error}`, type: 'error' }
        }));
        return;
      }
      // Expected no-op outside the Tauri desktop runtime (e.g. `npm run dev` in a browser).
      setCoachMode(true);
      window.dispatchEvent(new CustomEvent('alphonso:toast', {
        detail: { message: 'Coach mode active (desktop window requires Tauri runtime)', type: 'info' }
      }));
    }
  }, [coachMode, coachAlwaysOnTop, settings.coachAgent]);

  const handleToggleCoachTop = useCallback(async () => {
    const next = !coachAlwaysOnTop;
    setCoachAlwaysOnTop(next);
    if (coachMode) {
      await openCoachWindow(next, settings.coachAgent || 'alphonso').catch((error) => {
        const isTauriDesktop = typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;
        if (isTauriDesktop) {
          window.dispatchEvent(new CustomEvent('alphonso:toast', {
            detail: { message: `Coach mode failed to update: ${error?.message || error}`, type: 'error' }
          }));
        }
      });
    }
  }, [coachAlwaysOnTop, coachMode, settings.coachAgent]);

  const handleCoachInterventionAction = useCallback((action) => {
    if (!coachIntervention) return;
    const details = action === 'pause_60_seconds' ? { durationMs: COACH_PAUSE_MS } : {};
    recordCoachInterventionAction(coachIntervention, action, details);
    if (action === 'pause_60_seconds') {
      setCoachPauseUntilMs(Date.now() + COACH_PAUSE_MS);
      return;
    }
    if (['end_session', 'continue', 'continue_anyway'].includes(action)) {
      setCoachIntervention(null);
    }
  }, [coachIntervention]);

  const minimizeToCoach = useCallback(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    try {
      await openCoachWindow(coachAlwaysOnTop, settings.coachAgent || 'alphonso');
      setCoachMode(true);
      await getCurrentWindow().minimize();
    } catch (error) {
      // This path only ever runs inside the Tauri desktop runtime (it imports
      // @tauri-apps/api/window directly, unlike the other toggles which guard
      // for web/dev mode) — any failure here is real and should be surfaced.
      window.dispatchEvent(new CustomEvent('alphonso:toast', {
        detail: { message: `Coach mode failed to open: ${error?.message || error}`, type: 'error' }
      }));
    }
  }, [coachAlwaysOnTop, settings.coachAgent]);

  const openAlphonsoDesktopCard = useCallback(async () => {
    try {
      await openCoachWindow(coachAlwaysOnTop, 'alphonso');
      setCoachMode(true);
    } catch (error) {
      const isTauriDesktop = typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;
      if (isTauriDesktop) {
        window.dispatchEvent(new CustomEvent('alphonso:toast', {
          detail: { message: `Coach mode failed to open: ${error?.message || error}`, type: 'error' }
        }));
      }
    }
  }, [coachAlwaysOnTop]);

  const showDemoIntervention = useCallback(() => setCoachIntervention(buildDemoIntervention()), []);

  const value = useMemo(() => ({
    coachMode, setCoachMode,
    coachAlwaysOnTop, setCoachAlwaysOnTop,
    coachMiniMode, setCoachMiniMode,
    coachSnapCorner, setCoachSnapCorner,
    coachIntervention, setCoachIntervention,
    coachPauseUntilMs, setCoachPauseUntilMs,
    handleToggleCoachMode, handleToggleCoachTop, handleCoachInterventionAction,
    minimizeToCoach, openAlphonsoDesktopCard, showDemoIntervention
  }), [coachMode, coachAlwaysOnTop, coachMiniMode, coachSnapCorner, coachIntervention, coachPauseUntilMs,
    handleToggleCoachMode, handleToggleCoachTop, handleCoachInterventionAction,
    minimizeToCoach, openAlphonsoDesktopCard, showDemoIntervention]);

  return (
    <CoachContext.Provider value={value}>
      {children}
    </CoachContext.Provider>
  );
}

export function useCoach() {
  const ctx = useContext(CoachContext);
  if (!ctx) throw new Error('useCoach must be used within CoachProvider');
  return ctx;
}
