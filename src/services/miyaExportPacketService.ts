import { AGENTS, createAgentPacket } from './agentBusService';
import { TRUST_STATES, timestampMs } from './trustModel';

interface MiyaExportPacketOptions {
  exportType: string;
  title?: string;
  topic?: string;
  summary?: string;
  artifactPaths?: (string | null | undefined)[];
  workflowJson?: unknown | null;
  target?: string;
  privacyStatus?: string;
  metadata?: Record<string, unknown>;
}

interface MiyaExportHandoffOptions {
  source?: string;
  riskLevel?: string;
  actionType?: string;
  commandPreview?: string;
  fileChangePreview?: string;
  confidence?: string;
  verificationState?: string;
}

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
}: MiyaExportPacketOptions) {
  return {
    exportVersion: '1.0.0',
    exportType,
    title: title || 'Untitled export',
    topic,
    summary,
    artifactPaths: Array.isArray(artifactPaths) ? artifactPaths.filter(Boolean) as string[] : [],
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

export function createMiyaExportHandoffPacket(payload: Record<string, unknown>, options: MiyaExportHandoffOptions = {}) {
  return createAgentPacket({
    fromAgent: AGENTS.MIYA,
    toAgent: AGENTS.JOSE,
    title: (payload.title as string) || 'Miya export handoff',
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
