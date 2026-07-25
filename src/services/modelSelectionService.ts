import { fetchOllamaModels, chooseBestModelForTask, listAvailableModels, PREFERRED_MODEL } from '../lib/ollama';

const MODEL_PREF_KEY = 'alphonso_model_preferences_v1';
const MODEL_PROVIDER_KEY = 'alphonso_model_provider_v1';
const MAX_RECENT = 10;

export type ModelProvider = 'ollama' | 'nvidia_nim' | 'gemini';
const CLOUD_PROVIDERS: ModelProvider[] = ['nvidia_nim', 'gemini'];

// Curated, not enumerated via API — Gemini has no bulk free-tier-catalog
// endpoint the way NVIDIA does. gemini-1.5-* and Gemini 2.0 Flash/Flash-Lite
// are retired as of 2026-07-25; Pro-tier models are paid-only since
// 2026-04-01. This list must stay in sync with geminiConnector.ts's
// DEFAULT_MODEL. Reconfirm against ai.google.dev/gemini-api/docs before
// assuming these stay free-tier-eligible — Google's lineup shifts often.
// See docs/superpowers/plans/2026-07-23-free-tier-cloud-providers.md §4.
const GEMINI_FREE_TIER_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];

interface ModelPreferences {
  selected: string;
  recent: string[];
  taskOverrides: Record<string, string>;
}

function loadPreferences(): ModelPreferences {
  try {
    const raw = localStorage.getItem(MODEL_PREF_KEY);
    return raw ? JSON.parse(raw) : { selected: PREFERRED_MODEL, recent: [], taskOverrides: {} };
  } catch {
    return { selected: PREFERRED_MODEL, recent: [], taskOverrides: {} };
  }
}

function savePreferences(prefs: ModelPreferences) {
  try {
    localStorage.setItem(MODEL_PREF_KEY, JSON.stringify(prefs));
  } catch { /* quota */ }
}

export function getSelectedModel(): string {
  return loadPreferences().selected || PREFERRED_MODEL;
}

export function setSelectedModel(modelName: string) {
  const prefs = loadPreferences();
  prefs.selected = modelName;
  if (modelName && !prefs.recent.includes(modelName)) {
    prefs.recent.unshift(modelName);
    if (prefs.recent.length > MAX_RECENT) prefs.recent.length = MAX_RECENT;
  }
  savePreferences(prefs);
}

export function setTaskModelOverride(taskType: string, modelName: string) {
  const prefs = loadPreferences();
  prefs.taskOverrides[taskType] = modelName;
  savePreferences(prefs);
}

export function getModelForTask(taskType: string): string {
  const prefs = loadPreferences();
  if (prefs.taskOverrides[taskType]) return prefs.taskOverrides[taskType];
  return prefs.selected || PREFERRED_MODEL;
}

export function getRecentModels(): string[] {
  return loadPreferences().recent || [];
}

export async function getModelList(endpoint?: string | null) {
  try {
    const { models } = await fetchOllamaModels(endpoint);
    return listAvailableModels(models);
  } catch {
    return [];
  }
}

export async function getRecommendedModel(endpoint?: string | null, taskType?: string) {
  try {
    const { models } = await fetchOllamaModels(endpoint);
    return chooseBestModelForTask(models, taskType || 'code');
  } catch {
    return PREFERRED_MODEL;
  }
}

export function getSelectedProvider(): ModelProvider {
  try {
    const raw = localStorage.getItem(MODEL_PROVIDER_KEY);
    return (CLOUD_PROVIDERS as string[]).includes(raw || '') ? (raw as ModelProvider) : 'ollama';
  } catch {
    return 'ollama';
  }
}

export function setSelectedProvider(provider: ModelProvider) {
  try {
    localStorage.setItem(MODEL_PROVIDER_KEY, provider);
  } catch { /* quota */ }
}

export async function getCloudModelList(provider: 'nvidia_nim' | 'gemini'): Promise<string[]> {
  try {
    if (provider === 'nvidia_nim') {
      const { listNvidiaModels } = await import('./connectors/nvidiaNimConnector');
      return await listNvidiaModels();
    }
    return [...GEMINI_FREE_TIER_MODELS];
  } catch {
    return [];
  }
}
