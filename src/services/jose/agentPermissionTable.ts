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
  /** What the agent owns, in one plain sentence (prompts and screens use it). */
  owns: string;
  /** What the agent never does, in one plain sentence. */
  never: string;
}

const OWN_WORK: JoseEffect[] = ['read', 'write_own_work'];

export const AGENT_PERMISSION_TABLE: Record<string, AgentPermissions> = {
  // One owner per kind of work (owner, 2026-10-24): no task-type prefix belongs
  // to two agents (agent_report, every agent's report to Jose, is the only shared
  // entry). src/test/services/jose/agentOwnership.test.ts keeps it that way.
  jose: {
    role: 'orchestrator',
    owns: 'Planning requests, routing each step to its owner, approvals, and the closing summary.',
    never: 'Does the work itself: no writing, research or reviews.',
    // boardroom_ and cost_policy_ are the splitter's own Jose tasks; routing an
    // inbound message (remote_message_route) is orchestration.
    taskTypes: ['orchestration_', 'agent_report', 'remote_message_route', 'boardroom_', 'cost_policy_'],
    blockedTaskTypes: ['execute_command', 'filesystem_write', 'external_publish', 'purchase'],
    effects: [...OWN_WORK, 'spend'],
  },
  alphonso: {
    role: 'operator',
    owns: 'Code (front-end too), running commands, changing the project, plain questions and everyday writing such as emails and notes.',
    never: 'Brand content or design.',
    taskTypes: ['local_operation', 'verification_', 'runtime_', 'assistant_', 'agent_report', 'execute_command', 'filesystem_'],
    blockedTaskTypes: ['purchase'],
    effects: ['read', 'write_own_work', 'change_project', 'run'],
  },
  miya: {
    role: 'creator',
    owns: 'Content and design: scripts, scenes, pictures, voice, music, Shorts, carousels, campaign copy, UI and UX design, and editing the finished video.',
    never: 'Writes code.',
    taskTypes: ['creative_', 'design_', 'agent_report'],
    blockedTaskTypes: ['execute_command', 'filesystem_write', 'external_publish', 'purchase'],
    effects: OWN_WORK,
  },
  hector: {
    role: 'research',
    owns: 'Finding facts: research, sources, competitor material and stock footage.',
    never: 'Judges value or writes content.',
    taskTypes: ['research', 'research_', 'source_', 'citation_', 'agent_report'],
    blockedTaskTypes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase'],
    effects: OWN_WORK,
  },
  maria: {
    role: 'governance_audit',
    owns: 'Quality, governance and risk reviews.',
    never: 'Checks security.',
    taskTypes: ['governance_', 'audit_', 'approval_', 'policy_', 'risk_', 'agent_report'],
    blockedTaskTypes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase'],
    effects: OWN_WORK,
  },
  marcus: {
    role: 'distribution_execution',
    owns: 'Sending and publishing approved work, and placing calls.',
    never: 'Decides what to say.',
    taskTypes: ['approved_', 'distribution_', 'engagement_', 'performance_', 'outreach_', 'agent_report'],
    blockedTaskTypes: ['execute_command', 'filesystem_write', 'purchase'],
    effects: ['read', 'write_own_work', 'publish_or_send', 'spend'],
  },
  echo: {
    role: 'memory_historian',
    owns: 'Organising, merging and cleaning memory (other agents may save their own notes).',
    never: "Does the other agents' work.",
    taskTypes: ['memory_', 'retention_', 'knowledge_', 'timeline_', 'agent_report'],
    blockedTaskTypes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase'],
    effects: OWN_WORK,
  },
  sentinel: {
    role: 'security_monitoring',
    owns: 'Security and safety checks.',
    never: 'Reviews quality.',
    taskTypes: ['security_', 'permission_', 'agent_report'],
    blockedTaskTypes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase'],
    effects: OWN_WORK,
  },
  nova: {
    role: 'opportunity_intelligence',
    owns: 'Judging value, priority and timing from what Hector found.',
    never: 'Gathers facts.',
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

/**
 * May an agent with these lists do this one task type? An exact entry in
 * `taskTypes` wins over a blocked prefix; otherwise a blocked prefix refuses
 * it and an allowed prefix allows it. Shared with the contracts check.
 */
export function taskTypePartAllowed(part: string, taskTypes: string[], blockedTaskTypes: string[]): boolean {
  if (taskTypes.includes(part)) return true;
  return !startsWithAny(part, blockedTaskTypes) && startsWithAny(part, taskTypes);
}

/** May `agent` do this task type? Every part of a merged type (`a+b`) must be allowed. */
export function isTaskTypeAllowed(agent: string, taskType: string): boolean {
  const permissions = entry(agent);
  if (!permissions) return false;
  const parts = String(taskType || '').toLowerCase().split('+').filter(Boolean);
  return parts.length > 0 && parts.every((part) => taskTypePartAllowed(part, permissions.taskTypes, permissions.blockedTaskTypes));
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

/** What an agent owns and never does, or null for an unknown agent. */
export function describeResponsibility(agent: string): { owns: string; never: string } | null {
  const permissions = entry(agent);
  return permissions ? { owns: permissions.owns, never: permissions.never } : null;
}

/**
 * The one agent that owns this task type, or null when none or more than one
 * does. agent_report is every agent's report to Jose, so it has no owner.
 */
export function ownerOf(taskType: string): string | null {
  const type = String(taskType || '').toLowerCase();
  if (!type || type === 'agent_report') return null;
  const owners = Object.keys(AGENT_PERMISSION_TABLE).filter((agent) => isTaskTypeAllowed(agent, type));
  return owners.length === 1 ? owners[0] : null;
}

/** "<agent> owns: ... Never: ..." for every agent, for prompts that need the whole map. */
export function responsibilityLines(): string[] {
  return Object.entries(AGENT_PERMISSION_TABLE).map(([agent, p]) => `${agent} owns: ${p.owns} Never: ${p.never}`);
}
