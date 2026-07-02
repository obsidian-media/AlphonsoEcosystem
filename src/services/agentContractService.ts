const AGENTS: Record<string, string> = {
  ALPHONSO: 'alphonso',
  MIYA: 'miya',
  JOSE: 'jose',
  HECTOR: 'hector',
  MARIA: 'maria',
  MARCUS: 'marcus',
  ECHO: 'echo',
  SENTINEL: 'sentinel',
  NOVA: 'nova'
};

export type AgentId = typeof AGENTS[keyof typeof AGENTS];

export interface AgentExecutionContract {
  role: string;
  allowedActionPrefixes: string[];
  blockedActionPrefixes: string[];
}

export const AGENT_EXECUTION_CONTRACTS: Record<string, AgentExecutionContract> = {
  [AGENTS.JOSE]: {
    role: 'orchestrator',
    allowedActionPrefixes: ['orchestration_', 'agent_report', 'research_review', 'remote_message_route', 'creative_package_review'],
    blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'purchase']
  },
  [AGENTS.ALPHONSO]: {
    role: 'operator',
    allowedActionPrefixes: ['local_operation', 'verification_', 'runtime_', 'orchestration_', 'agent_report', 'execute_command', 'filesystem_'],
    blockedActionPrefixes: ['purchase']
  },
  [AGENTS.MIYA]: {
    role: 'creator',
    allowedActionPrefixes: ['creative_', 'orchestration_', 'agent_report'],
    blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'purchase']
  },
  [AGENTS.HECTOR]: {
    role: 'research',
    allowedActionPrefixes: ['research', 'research_', 'source_', 'citation_', 'agent_report', 'remote_message_route'],
    blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase']
  },
  [AGENTS.MARIA]: {
    role: 'governance_audit',
    allowedActionPrefixes: ['governance_', 'audit_', 'approval_', 'policy_', 'agent_report'],
    blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase']
  },
  [AGENTS.MARCUS]: {
    role: 'distribution_execution',
    allowedActionPrefixes: ['approved_', 'distribution_', 'engagement_', 'performance_', 'agent_report'],
    blockedActionPrefixes: ['execute_command', 'filesystem_write', 'purchase']
  },
  [AGENTS.ECHO]: {
    role: 'memory_historian',
    allowedActionPrefixes: ['memory_', 'retention_', 'knowledge_', 'timeline_', 'agent_report'],
    blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase']
  },
  [AGENTS.SENTINEL]: {
    role: 'security_monitoring',
    allowedActionPrefixes: ['security_', 'risk_', 'permission_', 'audit_', 'agent_report'],
    blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase']
  },
  [AGENTS.NOVA]: {
    role: 'opportunity_intelligence',
    allowedActionPrefixes: ['opportunity_', 'analysis_', 'prioritization_', 'strategy_', 'agent_report'],
    blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase']
  }
};

// Permission-tag prefixes each agent's skill packs are allowed to carry.
// Distinct from allowedActionPrefixes above: those gate orchestration action
// packets, this gates skill-pack permissions declared in skillPackService.js.
const AGENT_SKILL_PERMISSION_PREFIXES: Record<string, string[]> = {
  [AGENTS.JOSE]: ['task_routing', 'approval_gating', 'cross_agent_synthesis', 'execution_tracking', 'workflows.', 'runtime.read'],
  [AGENTS.ALPHONSO]: ['workflows.', 'runtime.', 'code.', 'local_operation', 'verification_', 'execute_command', 'filesystem_'],
  [AGENTS.MIYA]: ['media.', 'video.', 'image.', 'creative.', 'runway.'],
  [AGENTS.HECTOR]: ['market_research', 'content_strategy', 'campaign_planning', 'workflow_review', 'research', 'competitive_scan', 'source_verification', 'citation_gathering', 'confidence_scoring', 'feed_monitoring'],
  [AGENTS.MARIA]: ['workflow.audit', 'risk.', 'claim.', 'approval.', 'trust.', 'receipt.', 'evidence.', 'state.'],
  [AGENTS.MARCUS]: ['distribution.', 'engagement.', 'performance.', 'approved_'],
  [AGENTS.ECHO]: ['memory.', 'retention.', 'knowledge.', 'timeline.'],
  [AGENTS.SENTINEL]: ['security.', 'risk.', 'permission.', 'audit.'],
  [AGENTS.NOVA]: ['opportunity.', 'analysis.', 'prioritization.', 'strategy.']
};

// Permission tags no agent skill pack may carry except Alphonso's own operator role.
const UNIVERSAL_BLOCKED_SKILL_PERMISSIONS = ['filesystem.write', 'execute_command', 'external_publish', 'purchase'];

// Optional narrower allowlist for a SPECIFIC pack ID, scoped tighter than its
// owning agent's default AGENT_SKILL_PERMISSION_PREFIXES. Lets a multi-skill
// library (e.g. Miya's 5 packs) enforce per-skill boundaries instead of only
// a flat per-agent boundary — e.g. Miya's brand-identity pack should not be
// able to carry video/runway permissions even though Miya's agent-wide list
// allows them for her video-generation pack. Packs with no entry here fall
// back to the agent-wide list (fully backward compatible).
const AGENT_SKILL_PACK_SCOPE_OVERRIDES: Record<string, string[]> = {
  'pack.miya-creative-image': ['media.generate', 'image.', 'creative.preview'],
  'pack.miya-ui-ux-design': ['creative.ui_direction', 'creative.ux_flow', 'creative.wireframe'],
  'pack.miya-brand-identity': ['creative.brand_direction', 'creative.style_guide'],
  'pack.miya-motion-graphics': ['media.generate', 'video.motion', 'creative.animation'],
  'pack.hector-market-research': ['market_research', 'source_verification', 'citation_gathering'],
  'pack.hector-competitive-analysis': ['competitive_scan', 'market_research', 'campaign_planning'],
  'pack.hector-source-verification': ['source_verification', 'citation_gathering', 'confidence_scoring'],
  'pack.hector-rss-monitoring': ['feed_monitoring', 'source_verification'],
  'pack.jose-task-routing': ['task_routing', 'execution_tracking'],
  'pack.jose-approval-gating': ['approval_gating', 'execution_tracking'],
  'pack.jose-cross-agent-synthesis': ['cross_agent_synthesis', 'task_routing'],
  'pack.jose-pipeline-governance': ['execution_tracking', 'approval_gating']
};

export interface SkillPermissionValidationResult {
  ok: boolean;
  reason: string | null;
  offendingPermissions?: string[];
}

/**
 * Cross-checks a skill pack's declared permissions against its owning agent's
 * execution contract. Packs with no ownerAgent (generic/cross-agent workflow
 * packs) are not scoped by this check — only agent-owned packs are.
 *
 * When `packId` is supplied and has an entry in
 * AGENT_SKILL_PACK_SCOPE_OVERRIDES, that pack is validated against its own
 * narrower allowlist instead of the agent-wide default — this is the
 * per-skill scoping layer on top of the original per-agent check. Omitting
 * `packId` (or passing one with no override) preserves the original
 * agent-wide behavior exactly.
 */
export function validateSkillPackAgainstContract(agentName: string | undefined, permissions: string[] = [], packId?: string): SkillPermissionValidationResult {
  if (!agentName) {
    return { ok: true, reason: null };
  }
  const contract = AGENT_EXECUTION_CONTRACTS[agentName];
  const allowedPrefixes = (packId && AGENT_SKILL_PACK_SCOPE_OVERRIDES[packId]) || AGENT_SKILL_PERMISSION_PREFIXES[agentName];
  if (!contract || !allowedPrefixes) {
    // Unknown agent or no declared skill-permission scope — nothing to validate against.
    return { ok: true, reason: null };
  }

  const offendingPermissions = (permissions || []).filter((permission) => {
    const value = String(permission || '').toLowerCase();
    if (agentName !== AGENTS.ALPHONSO && startsWithAny(value, UNIVERSAL_BLOCKED_SKILL_PERMISSIONS)) {
      return true;
    }
    return !startsWithAny(value, allowedPrefixes);
  });

  if (offendingPermissions.length > 0) {
    return {
      ok: false,
      reason: `${agentName} contract does not permit skill permissions: ${offendingPermissions.join(', ')}.`,
      offendingPermissions
    };
  }
  return { ok: true, reason: null };
}

export interface AgentContractPacket {
  toAgent?: string;
  actionType?: string;
  commandPreview?: string;
}

export interface ContractValidationResult {
  ok: boolean;
  reason: string | null;
}

function startsWithAny(value: string, prefixes: string[] = []): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

export function validateAgentExecutionContract(packet: AgentContractPacket): ContractValidationResult {
  const toAgent = packet?.toAgent;
  const action = String(packet?.actionType || '').toLowerCase();
  const preview = String(packet?.commandPreview || '').toLowerCase();
  if (!toAgent) {
    return { ok: false, reason: 'Missing toAgent — contract validation requires an explicit target agent.' };
  }

  const contract = AGENT_EXECUTION_CONTRACTS[toAgent];

  if (!contract) {
    return { ok: true, reason: null };
  }

  const blockedByPrefix = startsWithAny(action, contract.blockedActionPrefixes);
  const previewStatesDisabled = /disabled unless separately approved|requires shayan approval before|read-only|draft\/package only/i.test(preview);
  const blockedByPreview = /execute|delete|remove|format|publish|upload|buy|purchase|post/.test(preview)
    && !previewStatesDisabled
    && toAgent !== AGENTS.ALPHONSO;
  if (blockedByPrefix || blockedByPreview) {
    return {
      ok: false,
      reason: `${toAgent} contract blocked action "${packet?.actionType || 'unknown'}".`
    };
  }

  const allowed = startsWithAny(action, contract.allowedActionPrefixes);
  if (!allowed && action) {
    return {
      ok: false,
      reason: `${toAgent} contract does not allow action "${packet.actionType}".`
    };
  }
  return { ok: true, reason: null };
}
