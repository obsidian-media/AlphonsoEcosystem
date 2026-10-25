import { AGENT_PERMISSION_TABLE, isEffectAllowed, taskTypePartAllowed } from './jose/agentPermissionTable';
import { EFFECT_LABELS, type JoseEffect } from './jose/joseEffects';

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

// Built from the one permission table (src/services/jose/agentPermissionTable.ts,
// 2026-10-23); same shape as before so every caller keeps working.
export const AGENT_EXECUTION_CONTRACTS: Record<string, AgentExecutionContract> = Object.fromEntries(
  Object.entries(AGENT_PERMISSION_TABLE).map(([agent, p]) => [
    agent,
    { role: p.role, allowedActionPrefixes: p.taskTypes, blockedActionPrefixes: p.blockedTaskTypes },
  ]),
);

export interface AgentContractPacket {
  toAgent?: string;
  actionType?: string;
  commandPreview?: string;
  /** Declared effects (Jose steps since 2026-10-23); checked against the table instead of guessing from words. */
  effects?: JoseEffect[];
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

  // Each part of a merged type (a+b) is checked with the permission table's rule,
  // where an exact allowed entry wins over a blocked prefix (2026-10-23).
  const parts = action.split('+').filter(Boolean);
  const blockedByPrefix = parts.some((part) => !contract.allowedActionPrefixes.includes(part) && startsWithAny(part, contract.blockedActionPrefixes));
  if (Array.isArray(packet.effects)) {
    // A task that declares its effects is checked against the table, not its words.
    const notAllowed = packet.effects.filter((effect) => !isEffectAllowed(toAgent, effect));
    if (notAllowed.length > 0) {
      return { ok: false, reason: `${toAgent} may not: ${notAllowed.map((e) => EFFECT_LABELS[e]).join(', ')}.` };
    }
  }
  // Older tasks without declared effects keep the word check.
  const previewStatesDisabled = /disabled unless separately approved|requires shayan approval before|read-only|draft\/package only/i.test(preview);
  const blockedByPreview = !Array.isArray(packet.effects)
    && /execute|delete|remove|format|publish|upload|buy|purchase|post/.test(preview)
    && !previewStatesDisabled
    && toAgent !== AGENTS.ALPHONSO;
  if (blockedByPrefix || blockedByPreview) {
    return {
      ok: false,
      reason: `${toAgent} contract blocked action "${packet?.actionType || 'unknown'}".`
    };
  }

  const allowed = parts.every((part) => taskTypePartAllowed(part, contract.allowedActionPrefixes, contract.blockedActionPrefixes));
  if (!allowed && action) {
    return {
      ok: false,
      reason: `${toAgent} contract does not allow action "${packet.actionType}".`
    };
  }
  return { ok: true, reason: null };
}

