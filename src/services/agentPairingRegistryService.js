import { AGENT_PAIRINGS_V1, AGENT_PAIRING_ROUTES, PAIRING_SCOPE } from './agentPairingConstants';

export function resolveAgentPairingRoute(pairingId) {
  return AGENT_PAIRING_ROUTES[pairingId] || null;
}

export function listAvailablePairings() {
  return Object.values(AGENT_PAIRING_ROUTES).map((route) => ({
    id: AGENT_PAIRINGS_V1[Object.keys(AGENT_PAIRINGS_V1).find((key) => AGENT_PAIRINGS_V1[key] === `${route.from}->${route.to}`)],
    from: route.from,
    to: route.to,
    type: route.type,
    approvalMode: route.approvalMode,
    riskLevel: route.riskLevel
  }));
}

export function isAgentPairingRoute(pairingId) {
  return Boolean(AGENT_PAIRING_ROUTES[pairingId]);
}
