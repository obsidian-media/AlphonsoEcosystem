// An optional check of links against Google Web Risk's phishing and malware lists (agent phase
// 4, owner 2026-10-25: "optional, with your key"). Only the addresses are sent, from the backend
// (`web_risk_check`). Google's Safe Browsing API is for non-commercial use only and points to
// Web Risk for anything else (checked 2026-10-26). Never throws: unreachable or not set up
// means nothing is listed, and the exact checks still run.
import { invoke } from '@tauri-apps/api/core';
import { getConnectorCredential } from '../connectors/connectorAuth';
import { evaluatePolicyGate } from '../policyEnforcementService';

const THREAT_NAMES: Record<string, string> = {
  SOCIAL_ENGINEERING: 'phishing',
  MALWARE: 'malware',
  UNWANTED_SOFTWARE: 'unwanted software',
};

export function webRiskSetUp(): boolean {
  return Boolean(getConnectorCredential('web_risk', 'WEB_RISK_API_KEY'));
}

/** Each listed address with what it's listed as ("phishing", "malware", "unwanted software"). */
export async function checkLinksWithWebRisk(urls: string[]): Promise<Map<string, string>> {
  const listed = new Map<string, string>();
  const apiKey = getConnectorCredential('web_risk', 'WEB_RISK_API_KEY');
  const list = [...new Set(urls.filter((u) => /^https?:\/\//i.test(String(u || ''))))];
  if (!apiKey || !list.length) return listed;
  const gate = evaluatePolicyGate({ connectorId: 'web_risk', actionType: 'link_check', commandPreview: `${list.length} link(s)`, approved: false, auth: { enabled: false, isAuthorized: false } } as never) as { ok?: boolean };
  if (gate && gate.ok === false) return listed;
  try {
    const result: any = await invoke('web_risk_check', { urls: list, apiKey });
    for (const m of Array.isArray(result?.matches) ? result.matches : []) {
      const first = (m?.threats || [])[0];
      if (m?.url && first) listed.set(String(m.url), THREAT_NAMES[first] || String(first).toLowerCase().replace(/_/g, ' '));
    }
  } catch { /* unreachable: nothing listed */ }
  return listed;
}
