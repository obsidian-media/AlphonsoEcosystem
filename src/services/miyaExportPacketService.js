import { AGENTS, createAgentPacket } from './agentBusService';
import { TRUST_STATES, timestampMs } from './trustModel';

export function buildMiyaExportPacket({
  exportType,
  title,
  topic = '',
  summary = '',
  artifactPaths = [],
  workflowJson = null,
  target = '',
  privacyStatus = 'private',
  metadata = {}
}) {
  return {
    exportVersion: '1.0.0',
    exportType,
    title: title || 'Untitled export',
    topic,
    summary,
    artifactPaths: Array.isArray(artifactPaths) ? artifactPaths.filter(Boolean) : [],
    workflowJson,
    target,
    privacyStatus,
    metadata: {
      ...metadata,
      generatedAtMs: timestampMs(),
      sourceAgent: AGENTS.MIYA
    }
  };
}

export function createMiyaExportHandoffPacket(payload, options = {}) {
  return createAgentPacket({
    fromAgent: AGENTS.MIYA,
    toAgent: AGENTS.JOSE,
    title: payload.title || 'Miya export handoff',
    packetType: 'miya_export_handoff',
    payload,
    source: options.source || 'miya-export',
    requiresApproval: true,
    riskLevel: options.riskLevel || 'medium',
    actionType: options.actionType || 'creative_export_handoff',
    commandPreview: options.commandPreview || 'Miya export handoff packet.',
    fileChangePreview: options.fileChangePreview || 'No file write. Export packet only.',
    rollbackAvailable: false,
    confidence: options.confidence || TRUST_STATES.TEMPORARY,
    verificationState: options.verificationState || TRUST_STATES.UNVERIFIED
  });
}
