import { useEffect } from 'react';
import { checkAppUpdate, notifyUpdateAvailable } from '../services/appUpdateService';
import { TRUST_STATES } from '../services/trustModel';
import { appendVerificationLog } from '../services/verificationService';
import { readDurableAuditLog } from '../services/verificationService';
import { isConnectorAuthenticated, pollWhatsAppConnector } from '../services/connectorRegistryService';
import { isBraveSearchConfigured } from '../services/hectorResearchService';
import { stopScreenObserver } from '../services/screenIntelligenceService';

export function usePollingEffects({
  settings,
  desktopBridge,
  isCoachWindow,
  operatorMode,
  toast,
  updateCheckState,
  setUpdateCheckState,
  setVerificationLogs,
  setDurableAuditLogs,
  setBraveSearchConfigured,
  screenObserverRunRef
}) {
  // Update check callback and interval
  useEffect(() => {
    if (!settings.autoUpdateEnabled || isCoachWindow || desktopBridge.state !== 'connected') return undefined;

    const runUpdateCheck = async ({ manual = false } = {}) => {
      if (!settings.autoUpdateEnabled && !manual) return;

      setUpdateCheckState((current) => ({
        ...current,
        checking: true
      }));

      const proof = await checkAppUpdate({
        endpoint: settings.updaterEndpoint,
        pubkey: settings.updaterPubkey,
        target: settings.updaterTarget
      });

      const notificationSent = proof.available ? await notifyUpdateAvailable(proof) : false;
      setUpdateCheckState({
        checking: false,
        configured: Boolean(proof.configured),
        available: Boolean(proof.available),
        latestVersion: proof.latestVersion || null,
        currentVersion: proof.currentVersion || '',
        notes: proof.notes || null,
        pubDate: proof.pubDate || null,
        downloadUrl: proof.downloadUrl || null,
        checkedAtMs: proof.checkedAtMs || Date.now(),
        trust: proof.trust || TRUST_STATES.UNVERIFIED,
        error: proof.error || null,
        notificationSent
      });

      const trust = proof.available ? TRUST_STATES.VERIFIED : (proof.configured ? TRUST_STATES.INFERRED : TRUST_STATES.UNVERIFIED);
      const log = appendVerificationLog({
        type: 'app_update_check',
        source: 'tauri-updater-runtime',
        trust,
        payload: {
          configured: Boolean(proof.configured),
          available: Boolean(proof.available),
          latestVersion: proof.latestVersion || null,
          error: proof.error || null
        }
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
    };

    runUpdateCheck({ manual: false });
    const intervalMs = 1000 * 60 * 30;
    const timer = window.setInterval(() => runUpdateCheck({ manual: false }), intervalMs);
    return () => window.clearInterval(timer);
  }, [desktopBridge.state, isCoachWindow, settings.autoUpdateEnabled, settings.updaterEndpoint, settings.updaterPubkey, settings.updaterTarget, setUpdateCheckState, setVerificationLogs]);

  // Screen observer cleanup
  useEffect(() => () => {
    if (screenObserverRunRef.current) {
      stopScreenObserver();
    }
  }, []);

  // Brave search config check
  useEffect(() => {
    if (isCoachWindow) return;
    isBraveSearchConfigured().then((configured) => setBraveSearchConfigured(configured)).catch(() => {});
  }, [isCoachWindow, setBraveSearchConfigured]);

  // WhatsApp connector polling — deferred to avoid boot storm
  useEffect(() => {
    if (isCoachWindow) return;
    if (!isConnectorAuthenticated('whatsapp')) return;
    let cancelled = false;
    let timeoutId = null;

    const poll = async () => {
      if (cancelled) return;
      try {
        const result = await pollWhatsAppConnector(12);
        if (!cancelled && result?.routed > 0) {
          toast.info(
            `WhatsApp — ${result.routed} message${result.routed > 1 ? 's' : ''} routed to Jose`,
            `${result.rejected > 0 ? `${result.rejected} rejected (not on allowlist). ` : ''}Check Orchestrator for approvals.`
          );
        }
      } catch { /* best-effort */ }
      if (!cancelled) {
        timeoutId = window.setTimeout(poll, 30000);
      }
    };

    timeoutId = window.setTimeout(poll, 15000);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isCoachWindow, toast]);

  // Operator mode audit refresh
  useEffect(() => {
    if (!operatorMode) return undefined;
    let cancelled = false;

    const refreshAudit = async () => {
      const logs = await readDurableAuditLog(200);
      if (!cancelled) {
        setDurableAuditLogs(Array.isArray(logs) ? logs : []);
      }
    };

    refreshAudit();
    const timer = window.setInterval(refreshAudit, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [operatorMode, setDurableAuditLogs]);
}
