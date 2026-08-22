import { useEffect } from 'react';
import { readDurableAuditLog } from '../services/verificationService';
import { isConnectorAuthenticated, pollWhatsAppConnector } from '../services/connectorRegistryService';
import { isBraveSearchConfigured } from '../services/hectorResearchService';
import { stopScreenObserver } from '../services/screenIntelligenceService';

export function usePollingEffects({
  isCoachWindow,
  operatorMode,
  toast,
  setDurableAuditLogs,
  setBraveSearchConfigured,
  screenObserverRunRef
}) {
  // Update-check polling was removed here: App.tsx's own boot useEffect
  // (wired directly to checkAppUpdate()) already owns this — restoring it
  // here too would fire two independent update checks on the same interval.

  // Screen observer cleanup
  useEffect(() => () => {
    if (screenObserverRunRef.current) {
      stopScreenObserver();
    }
  }, []);

  // Brave search config check — deferred
  useEffect(() => {
    if (isCoachWindow) return;
    const timerId = window.setTimeout(() => {
      isBraveSearchConfigured().then((configured) => setBraveSearchConfigured(configured)).catch(() => {});
    }, 3000);
    return () => window.clearTimeout(timerId);
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

    timeoutId = window.setTimeout(poll, 20000);
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
