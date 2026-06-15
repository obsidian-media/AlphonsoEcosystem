import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { TRUST_STATES } from '../services/trustModel';
import { appendVerificationLog } from '../services/verificationService';
import { openCoachWindow, closeCoachWindow } from '../services/coachModeService';

export function useTrayEffects({
  settings,
  coachMode,
  coachAlwaysOnTop,
  approvalRequiredNotice,
  setApprovalRequiredNotice,
  setCoachMode,
  setLastTaskCompletedAt,
  setVerificationLogs,
  createNewChat,
  voice
}) {
  // Last task completed timeout
  useEffect(() => {
    const timeoutId = window.setTimeout(() => setLastTaskCompletedAt(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [setLastTaskCompletedAt]);

  // Approval required notice timeout
  useEffect(() => {
    if (!approvalRequiredNotice) return undefined;
    const timeoutId = window.setTimeout(() => setApprovalRequiredNotice(false), 6000);
    return () => window.clearTimeout(timeoutId);
  }, [approvalRequiredNotice, setApprovalRequiredNotice]);

  // Tray menu listeners
  useEffect(() => {
    let unlistenTrayMenu;
    let unlistenCoachToggle;
    let disposed = false;

    const bindListeners = async () => {
      try {
        unlistenTrayMenu = await listen('alphonso://tray_menu', (event) => {
          const action = String(event.payload || 'unknown');
          const log = appendVerificationLog({
            type: 'tray_menu_event',
            source: 'tauri-tray',
            trust: TRUST_STATES.VERIFIED,
            payload: { action }
          });
          setVerificationLogs((current) => [...current, log].slice(-250));
        });

        await listen('alphonso://new_chat',    () => { if (!disposed) createNewChat(); });
        await listen('alphonso://voice_start', () => { if (!disposed) voice.toggleListening(); });

        unlistenCoachToggle = await listen('alphonso://coach_toggle', async () => {
          if (disposed) return;
          if (coachMode) {
            await closeCoachWindow();
            setCoachMode(false);
            return;
          }
          await openCoachWindow(coachAlwaysOnTop, settings.coachAgent || 'alphonso');
          setCoachMode(true);
        });
      } catch {
        // ignore outside Tauri runtime
      }
    };

    bindListeners();

    return () => {
      disposed = true;
      if (unlistenTrayMenu) unlistenTrayMenu();
      if (unlistenCoachToggle) unlistenCoachToggle();
    };
  }, [coachMode, coachAlwaysOnTop, settings.coachAgent, createNewChat, voice, setCoachMode, setVerificationLogs]);
}
