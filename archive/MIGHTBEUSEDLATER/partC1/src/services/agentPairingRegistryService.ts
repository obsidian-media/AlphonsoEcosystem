import { AGENT_PAIRINGS_V1, AGENT_PAIRING_ROUTES } from './agentPairingConstants';

export function resolveAgentPairingRoute(pairingId: string) {
  return (AGENT_PAIRING_ROUTES as Record<string, any>)[pairingId] || null;
}

export function listAvailablePairings() {
  return Object.values(AGENT_PAIRING_ROUTES).map((route: any) => ({
    id: AGENT_PAIRINGS_V1[Object.keys(AGENT_PAIRINGS_V1).find((key) => AGENT_PAIRINGS_V1[key] === `${route.from}->${route.to}`) as string],
    from: route.from,
    to: route.to,
    type: route.type,
    approvalMode: route.approvalMode,
    riskLevel: route.riskLevel
  }));
}

export function isAgentPairingRoute(pairingId: string): boolean {
  return Boolean((AGENT_PAIRING_ROUTES as Record<string, any>)[pairingId]);
}
