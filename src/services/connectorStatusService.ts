// Regression fix for a real QA finding (Q&A E2E Test.md, Round 3 N-13):
// ConnectorStatusIndicators.tsx (sidebar) and ConnectorHealthPanel.tsx (view)
// each had their own copy of deriveStatus() that had drifted apart — the
// panel's copy classified chatgpt/claude with no credentials as a distinct
// "placeholder" bucket the sidebar's copy folded into "disabled" — so the
// same 25 connectors produced two different counts on screen at once
// (e.g. sidebar "21 disabled" vs. panel "0 live | 0 missing config |
// 4 local only | 19 disabled"). One shared, exported function is now the
// only place this logic lives; both components import from here.

export interface StatusConnector {
  id: string;
  status?: string;
  requiredEnv?: string[];
  envPresence?: Record<string, boolean>;
  lastTestStatus?: string;
}

export type ConnectorStatusKind = 'live' | 'missing_config' | 'foundation_only' | 'placeholder' | 'disabled';

/**
 * Derives a simplified UX status from a connector registry object.
 *
 * Returns one of:
 *   'live'            — configured + env verified + last test verified
 *   'missing_config'  — has required env keys but none/not all are present
 *   'foundation_only' — local-only connector with no env requirements
 *   'placeholder'     — visible but intentionally inactive placeholder connector
 *                       (chatgpt/claude with zero credentials configured)
 *   'disabled'        — everything else (not_configured, unknown, etc.)
 */
export function deriveConnectorStatus(connector: StatusConnector | null | undefined): ConnectorStatusKind {
  if (!connector) return 'disabled';
  const status = String(connector.status || '').toLowerCase();
  const requiredEnv = Array.isArray(connector.requiredEnv) ? connector.requiredEnv : [];
  const envPresence = connector.envPresence || {};

  if (status === 'foundation_only') return 'foundation_only';

  if (['chatgpt', 'claude'].includes(connector.id) && requiredEnv.length > 0) {
    const anyPresent = requiredEnv.some((k) => Boolean(envPresence[k]));
    if (!anyPresent) return 'placeholder';
  }

  if (status === 'configured') {
    const allEnvPresent = requiredEnv.length === 0 || requiredEnv.every((k) => Boolean(envPresence[k]));
    const testOk = connector.lastTestStatus === 'verified';
    if (allEnvPresent && testOk) return 'live';
    return 'missing_config';
  }

  if (requiredEnv.length > 0) {
    const anyPresent = requiredEnv.some((k) => Boolean(envPresence[k]));
    if (anyPresent) return 'missing_config';
  }

  return 'disabled';
}
