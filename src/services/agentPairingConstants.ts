export type AgentPairingKey = 'miya->comfyui' | 'jose->miya' | 'miya->maria' | 'maria->jose';

export type PairingRouteType = 'generation_request' | 'task_delegation' | 'content_handoff' | 'status_report';

export type ApprovalMode = 'auto' | 'manual';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface AgentPairingRoute {
  from: string;
  to: string;
  type: PairingRouteType;
  approvalMode: ApprovalMode;
  riskLevel: RiskLevel;
}

export const AGENT_PAIRINGS_V1: Record<string, AgentPairingKey> = Object.freeze({
  MIYA_COMFYUI: 'miya->comfyui',
  JOSE_MIYA: 'jose->miya',
  MIYA_MARIA: 'miya->maria',
  MARIA_JOSE: 'maria->jose'
});

export const AGENT_PAIRING_ROUTES: Record<AgentPairingKey, AgentPairingRoute> = Object.freeze({
  [AGENT_PAIRINGS_V1.MIYA_COMFYUI]: {
    from: 'miya',
    to: 'comfyui',
    type: 'generation_request',
    approvalMode: 'auto',
    riskLevel: 'low'
  },
  [AGENT_PAIRINGS_V1.JOSE_MIYA]: {
    from: 'jose',
    to: 'miya',
    type: 'task_delegation',
    approvalMode: 'auto',
    riskLevel: 'low'
  },
  [AGENT_PAIRINGS_V1.MIYA_MARIA]: {
    from: 'miya',
    to: 'maria',
    type: 'content_handoff',
    approvalMode: 'auto',
    riskLevel: 'low'
  },
  [AGENT_PAIRINGS_V1.MARIA_JOSE]: {
    from: 'maria',
    to: 'jose',
    type: 'status_report',
    approvalMode: 'auto',
    riskLevel: 'low'
  }
});

export const PAIRING_SCOPE: string = 'agent_pairings_v1';
