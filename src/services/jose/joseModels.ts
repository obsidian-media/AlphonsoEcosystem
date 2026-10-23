// Models for Jose's steps (phase 4): a step can run with a model Jose chose,
// and a step that keeps failing is tried once more with the next larger model
// the user has installed (owner: Q15, Q18). Only installed local models; a
// model's size is read from its tag (qwen2.5:7b → 7).
import { fetchOllamaModels, getConfiguredOllamaEndpoint } from '../../lib/ollama';

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
    return (models || []).map((m) => m.name).filter(Boolean);
  } catch {
    return [];
  }
}
