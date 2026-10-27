// A running request's stop signal, scoped to the agent's step (Jose phase 7), the same way
// withAgentModel() scopes a step's model. generateAgentLlmResponse() reads it, so stopping a
// request cancels the model call its running step is waiting on.
const agentSignals = new Map<string, AbortSignal>();

export function getAgentSignal(agentId: string): AbortSignal | null {
  return agentSignals.get(agentId) || null;
}

export async function withAgentSignal<T>(agentId: string, signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
  const previous = agentSignals.get(agentId);
  agentSignals.set(agentId, signal);
  try {
    return await fn();
  } finally {
    if (previous) agentSignals.set(agentId, previous);
    else agentSignals.delete(agentId);
  }
}
