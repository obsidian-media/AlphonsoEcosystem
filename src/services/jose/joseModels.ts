// Models for Jose's steps (phase 4): a step can run with a model Jose chose,
// and a step that keeps failing is tried once more with the next larger model
// the user has installed (owner: Q15, Q18). Only installed local models; a
// model's size is read from its tag (qwen2.5:7b → 7).
import { fetchOllamaModels, getConfiguredOllamaEndpoint, getConfiguredOllamaModel, isChatModel } from '../../lib/ollama';
import { getAgentProvider } from '../modelSelectionService';

/** Billions of parameters from a model tag, or null when the tag doesn't say. */
export function modelSize(name: string): number | null {
  const match = String(name || '').toLowerCase().match(/:(\d+(?:\.\d+)?)b\b/);
  return match ? Number(match[1]) : null;
}

/** The smallest installed model larger than `current`; null when none, or when a size is unknown. */
export function pickLargerModel(current: string, installed: string[]): string | null {
  const size = modelSize(current);
  if (size === null) return null;
  const larger = installed
    .map((name) => ({ name, size: modelSize(name) }))
    .filter((m): m is { name: string; size: number } => m.size !== null && m.size > size)
    .sort((a, b) => a.size - b.size);
  return larger[0]?.name || null;
}

/** Models the user has installed in Ollama; [] when Ollama can't be reached. */
export async function listInstalledModels(): Promise<string[]> {
  try {
    const { models } = await fetchOllamaModels(getConfiguredOllamaEndpoint());
    // Only models that can write a reply: an embedding model is never offered to a step (QA batch 0).
    return (models || []).filter(isChatModel).map((m) => m.name).filter(Boolean);
  } catch {
    return [];
  }
}

/** Models this size (billions) and larger call their skills' tools themselves (Settings → Agents; agent roles Part B). */
export const DEFAULT_TOOL_CALL_MIN_SIZE = 14;

export function getToolCallMinSize(): number {
  try {
    const value = Number(JSON.parse(localStorage.getItem('alphonso_settings') || '{}')?.agentToolCallMinSizeB);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_TOOL_CALL_MIN_SIZE;
  } catch {
    return DEFAULT_TOOL_CALL_MIN_SIZE;
  }
}

/** The model a step runs with: its own, else the agent's chosen one, else the Settings model. */
export function stepModel(assignment: { agent?: string; model?: string } | null | undefined): string {
  if (assignment?.model) return assignment.model;
  const chosen = assignment?.agent ? getAgentProvider(assignment.agent) : null;
  if (chosen?.model) return chosen.model;
  return getConfiguredOllamaModel();
}

/** Paid and cloud models, and local models at or above the size in Settings, call tools themselves. */
export function usesOwnToolCalls(assignment: { agent?: string; model?: string } | null | undefined): boolean {
  const model = stepModel(assignment);
  if (model.startsWith('claude:') || model.startsWith('chatgpt:')) return true;
  const provider = !assignment?.model && assignment?.agent ? getAgentProvider(assignment.agent)?.provider : 'ollama';
  if (provider && provider !== 'ollama') return true;
  const size = modelSize(model);
  return size !== null && size >= getToolCallMinSize();
}
