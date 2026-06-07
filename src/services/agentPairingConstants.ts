export type AgentPairingKey =
  | 'miya->comfyui'
  | 'jose->miya'
  | 'miya->maria'
  | 'maria->jose'
  | 'hector->miya'
  | 'maria->marcus'
  | 'miya->alphonso'
  | 'hector->echo'
  | 'miya->echo'
  | 'maria->echo'
  | 'marcus->echo'
  | 'sentinel->echo'
  | 'nova->echo';

export type PairingRouteType = 'generation_request' | 'task_delegation' | 'content_handoff' | 'status_report' | 'research_to_creative' | 'governance_to_execution' | 'creative_to_operator' | 'memory_preservation';

export type ApprovalMode = 'auto' | 'manual';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface AgentPairingRoute {
  from: string;
  to: string;
  type: PairingRouteType;
  approvalMode: ApprovalMode;
  riskLevel: RiskLevel;
  description?: string;
}

export const AGENT_PAIRINGS_V1: Record<string, AgentPairingKey> = Object.freeze({
  MIYA_COMFYUI: 'miya->comfyui',
  JOSE_MIYA: 'jose->miya',
  MIYA_MARIA: 'miya->maria',
  MARIA_JOSE: 'maria->jose',
  HECTOR_MIYA: 'hector->miya',
  MARIA_MARCUS: 'maria->marcus',
  MIYA_ALPHONSO: 'miya->alphonso',
  HECTOR_ECHO: 'hector->echo',
  MIYA_ECHO: 'miya->echo',
  MARIA_ECHO: 'maria->echo',
  MARCUS_ECHO: 'marcus->echo',
  SENTINEL_ECHO: 'sentinel->echo',
  NOVA_ECHO: 'nova->echo'
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
  },
  [AGENT_PAIRINGS_V1.HECTOR_MIYA]: {
    from: 'hector',
    to: 'miya',
    type: 'research_to_creative',
    approvalMode: 'auto',
    riskLevel: 'low',
    description: 'Hector research findings flow into Miya creative context'
  },
  [AGENT_PAIRINGS_V1.MARIA_MARCUS]: {
    from: 'maria',
    to: 'marcus',
    type: 'governance_to_execution',
    approvalMode: 'manual',
    riskLevel: 'medium',
    description: 'Maria governance approval gates Marcus distribution execution'
  },
  [AGENT_PAIRINGS_V1.MIYA_ALPHONSO]: {
    from: 'miya',
    to: 'alphonso',
    type: 'creative_to_operator',
    approvalMode: 'auto',
    riskLevel: 'low',
    description: 'Miya creative proposals flow into Alphonso operator context'
  },
  [AGENT_PAIRINGS_V1.HECTOR_ECHO]: {
    from: 'hector',
    to: 'echo',
    type: 'memory_preservation',
    approvalMode: 'auto',
    riskLevel: 'low',
    description: 'Hector research outputs preserved by Echo'
  },
  [AGENT_PAIRINGS_V1.MIYA_ECHO]: {
    from: 'miya',
    to: 'echo',
    type: 'memory_preservation',
    approvalMode: 'auto',
    riskLevel: 'low',
    description: 'Miya creative outputs preserved by Echo'
  },
  [AGENT_PAIRINGS_V1.MARIA_ECHO]: {
    from: 'maria',
    to: 'echo',
    type: 'memory_preservation',
    approvalMode: 'auto',
    riskLevel: 'low',
    description: 'Maria governance outputs preserved by Echo'
  },
  [AGENT_PAIRINGS_V1.MARCUS_ECHO]: {
    from: 'marcus',
    to: 'echo',
    type: 'memory_preservation',
    approvalMode: 'auto',
    riskLevel: 'low',
    description: 'Marcus distribution outputs preserved by Echo'
  },
  [AGENT_PAIRINGS_V1.SENTINEL_ECHO]: {
    from: 'sentinel',
    to: 'echo',
    type: 'memory_preservation',
    approvalMode: 'auto',
    riskLevel: 'low',
    description: 'Sentinel security outputs preserved by Echo'
  },
  [AGENT_PAIRINGS_V1.NOVA_ECHO]: {
    from: 'nova',
    to: 'echo',
    type: 'memory_preservation',
    approvalMode: 'auto',
    riskLevel: 'low',
    description: 'Nova analysis outputs preserved by Echo'
  }
});

export const PAIRING_SCOPE: string = 'agent_pairings_v1';
