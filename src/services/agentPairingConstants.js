const AGENT_PAIRINGS_V1 = Object.freeze({
  MIYA_COMFYUI: 'miya->comfyui',
  JOSE_MIYA: 'jose->miya',
  MIYA_MARIA: 'miya->maria',
  MARIA_JOSE: 'maria->jose'
});

const AGENT_PAIRING_ROUTES = Object.freeze({
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

const PAIRING_SCOPE = 'agent_pairings_v1';

export {
  AGENT_PAIRINGS_V1,
  AGENT_PAIRING_ROUTES,
  PAIRING_SCOPE
};
