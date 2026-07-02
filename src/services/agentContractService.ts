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
  [AGENTS.MIYA]: ['media.', 'video.', 'creative.', 'runway.'],
  [AGENTS.HECTOR]: ['market_research', 'content_strategy', 'campaign_planning', 'workflow_review', 'research'],
  [AGENTS.MARIA]: ['workflow.audit', 'risk.', 'claim.', 'approval.', 'trust.', 'receipt.', 'evidence.', 'state.'],
  [AGENTS.MARCUS]: ['distribution.', 'engagement.', 'performance.', 'approved_'],
  [AGENTS.ECHO]: ['memory.', 'retention.', 'knowledge.', 'timeline.'],
  [AGENTS.SENTINEL]: ['security.', 'risk.', 'permission.', 'audit.'],
  [AGENTS.NOVA]: ['opportunity.', 'analysis.', 'prioritization.', 'strategy.']
};

// Permission tags no agent skill pack may carry except Alphonso's own operator role.
const UNIVERSAL_BLOCKED_SKILL_PERMISSIONS = ['filesystem.write', 'execute_command', 'external_publish', 'purchase'];

export interface SkillPermissionValidationResult {
  ok: boolean;
  reason: string | null;
  offendingPermissions?: string[];
}

/**
 * Cross-checks a skill pack's declared permissions against its owning agent's
 * execution contract. Packs with no ownerAgent (generic/cross-agent workflow
 * packs) are not scoped by this check — only agent-owned packs are.
 */
export function validateSkillPackAgainstContract(agentName: string | undefined, permissions: string[] = []): SkillPermissionValidationResult {
  if (!agentName) {
    return { ok: true, reason: null };
  }
  const contract = AGENT_EXECUTION_CONTRACTS[agentName];
  const allowedPrefixes = AGENT_SKILL_PERMISSION_PREFIXES[agentName];
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
