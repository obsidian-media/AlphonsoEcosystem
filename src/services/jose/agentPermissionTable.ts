// One permission table for every agent: the task types each may do and the
// effects each may have. Jose, the contracts check (agentContractService),
// skill packs and the displays all read it.
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §7
// Before 2026-10-23 permissions lived in four places that disagreed, and the
// per-agent permission files were only displayed, never enforced. Task types
// are copied unchanged from the old contracts (phase 1 changes no behaviour).
import { EFFECT_LABELS, DEFAULT_EFFECT_APPROVALS, JOSE_EFFECTS, LOCKED_EFFECTS, type JoseEffect } from './joseEffects';

export interface AgentPermissions {
  role: string;
  /** Task-type prefixes the agent may do. */
  taskTypes: string[];
  /** Task-type prefixes the agent may never do. */
  blockedTaskTypes: string[];
  /** Effects the agent's steps may have. */
  effects: JoseEffect[];
}

const OWN_WORK: JoseEffect[] = ['read', 'write_own_work'];

export const AGENT_PERMISSION_TABLE: Record<string, AgentPermissions> = {
  jose: {
    role: 'orchestrator',
    taskTypes: ['orchestration_', 'agent_report', 'research_review', 'remote_message_route', 'creative_package_review'],
    blockedTaskTypes: ['execute_command', 'filesystem_write', 'external_publish', 'purchase'],
    effects: [...OWN_WORK, 'spend'],
  },
  alphonso: {
    role: 'operator',
    taskTypes: ['local_operation', 'verification_', 'runtime_', 'orchestration_', 'agent_report', 'execute_command', 'filesystem_'],
    blockedTaskTypes: ['purchase'],
    effects: ['read', 'write_own_work', 'change_project', 'run'],
  },
  miya: {
    role: 'creator',
    taskTypes: ['creative_', 'orchestration_', 'agent_report'],
    blockedTaskTypes: ['execute_command', 'filesystem_write', 'external_publish', 'purchase'],
    effects: OWN_WORK,
  },
  hector: {
    role: 'research',
    taskTypes: ['research', 'research_', 'source_', 'citation_', 'agent_report', 'remote_message_route'],
    blockedTaskTypes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase'],
    effects: OWN_WORK,
  },
  maria: {
    role: 'governance_audit',
    taskTypes: ['governance_', 'audit_', 'approval_', 'policy_', 'agent_report'],
    blockedTaskTypes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase'],
    effects: OWN_WORK,
  },
  marcus: {
    role: 'distribution_execution',
    taskTypes: ['approved_', 'distribution_', 'engagement_', 'performance_', 'agent_report'],
    blockedTaskTypes: ['execute_command', 'filesystem_write', 'purchase'],
    effects: ['read', 'write_own_work', 'publish_or_send', 'spend'],
  },
  echo: {
    role: 'memory_historian',
    taskTypes: ['memory_', 'retention_', 'knowledge_', 'timeline_', 'agent_report'],
    blockedTaskTypes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase'],
    effects: OWN_WORK,
  },
  sentinel: {
    role: 'security_monitoring',
    // Sentinel audits security; Maria audits quality and governance (audit_).
    taskTypes: ['security_', 'risk_', 'permission_', 'agent_report'],
    blockedTaskTypes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase'],
    effects: OWN_WORK,
  },
  nova: {
    role: 'opportunity_intelligence',
    taskTypes: ['opportunity_', 'analysis_', 'prioritization_', 'strategy_', 'agent_report'],
    blockedTaskTypes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase'],
    effects: OWN_WORK,
  },
};

function startsWithAny(value: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function entry(agent: string): AgentPermissions | null {
  return Object.prototype.hasOwnProperty.call(AGENT_PERMISSION_TABLE, agent) ? AGENT_PERMISSION_TABLE[agent] : null;
}

/** May `agent` do this task type? Every part of a merged type (`a+b`) must be allowed. */
export function isTaskTypeAllowed(agent: string, taskType: string): boolean {
  const permissions = entry(agent);
  if (!permissions) return false;
  const parts = String(taskType || '').toLowerCase().split('+').filter(Boolean);
  return parts.length > 0 && parts.every((part) => !startsWithAny(part, permissions.blockedTaskTypes) && startsWithAny(part, permissions.taskTypes));
}

export function isEffectAllowed(agent: string, effect: JoseEffect): boolean {
  return Boolean(entry(agent)?.effects.includes(effect));
}

/** Plain-language lines for the agent permission displays. */
export function describeAgentPermissions(agent: string): { allowed: string[]; blocked: string[]; approvalRequired: string[] } {
  const effects = entry(agent)?.effects || [];
  return {
    allowed: effects.map((effect) => EFFECT_LABELS[effect]),
    blocked: JOSE_EFFECTS.filter((effect) => !effects.includes(effect)).map((effect) => EFFECT_LABELS[effect]),
    approvalRequired: effects
      .filter((effect) => LOCKED_EFFECTS.includes(effect) || DEFAULT_EFFECT_APPROVALS[effect])
      .map((effect) => EFFECT_LABELS[effect]),
  };
}
