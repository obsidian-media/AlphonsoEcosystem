// Hermes gateway (2026-10-30): what a running step wants from its Hermes run —
// progress lines and answers to Hermes's approval requests — scoped to the
// agent's step the same way withAgentSignal() scopes its stop signal.
// generateAgentLlmResponse() reads it when the agent's provider is Hermes.
import type { HermesApprovalRequest } from './hermesRun';

export interface HermesStepHooks {
  onProgress?: (line: string) => void;
  onApproval?: (req: HermesApprovalRequest) => Promise<'once' | 'deny'>;
}

const hooks = new Map<string, HermesStepHooks>();

export function getHermesHooks(agentId: string): HermesStepHooks | null {
  return hooks.get(agentId) || null;
}

export async function withHermesHooks<T>(agentId: string, value: HermesStepHooks, fn: () => Promise<T>): Promise<T> {
  const previous = hooks.get(agentId);
  hooks.set(agentId, value);
  try {
    return await fn();
  } finally {
    if (previous) hooks.set(agentId, previous);
    else hooks.delete(agentId);
  }
}
