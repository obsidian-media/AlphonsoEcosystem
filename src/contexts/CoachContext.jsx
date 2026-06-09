import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { openCoachWindow, closeCoachWindow } from '../services/coachModeService';
import { recordCoachInterventionAction, buildDemoSlotIntervention, getLatestSessionGuardBridgeIntervention } from '../services/coachInterventionService';
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
  const [coachIntervention, setCoachIntervention] = useState(() => getLatestSessionGuardBridgeIntervention());
  const [coachPauseUntilMs, setCoachPauseUntilMs] = useState(0);

  const handleToggleCoachMode = useCallback(async () => {
    if (coachMode) {
      await closeCoachWindow();
      setCoachMode(false);
      return;
    }
    await openCoachWindow(coachAlwaysOnTop, settings.coachAgent || 'alphonso');
    setCoachMode(true);
  }, [coachMode, coachAlwaysOnTop, settings.coachAgent]);

  const handleToggleCoachTop = useCallback(async () => {
    const next = !coachAlwaysOnTop;
    setCoachAlwaysOnTop(next);
    if (coachMode) {
      await openCoachWindow(next, settings.coachAgent || 'alphonso');
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
    } catch {
      // Ignore when not in Tauri runtime.
    }
  }, [coachAlwaysOnTop, settings.coachAgent]);

  const openAlphonsoDesktopCard = useCallback(async () => {
    try {
      await openCoachWindow(coachAlwaysOnTop, 'alphonso');
      setCoachMode(true);
    } catch {
      // Ignore when not in Tauri runtime.
    }
  }, [coachAlwaysOnTop]);

  const showDemoIntervention = useCallback(() => setCoachIntervention(buildDemoSlotIntervention()), []);

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
