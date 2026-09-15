import { fetchOllamaModels, chooseBestModelForTask, listAvailableModels, PREFERRED_MODEL } from '../lib/ollama';
import { isHermesAgentConfigured } from './connectors/hermesAgentConnector';

const MODEL_PREF_KEY = 'alphonso_model_preferences_v1';
const MODEL_PROVIDER_KEY = 'alphonso_model_provider_v1';
const AGENT_PROVIDER_KEY = 'alphonso_agent_provider_v1';
const MAX_RECENT = 10;

export type ModelProvider = 'ollama' | 'nvidia_nim' | 'gemini';
const CLOUD_PROVIDERS: ModelProvider[] = ['nvidia_nim', 'gemini'];

export type AgentModelProvider = ModelProvider | 'hermes';

export interface AgentProviderConfig {
  provider: AgentModelProvider;
  /** For 'hermes': a model id pulled live from that agent's own /v1/models. Unused otherwise. */
  model?: string;
}

const DEFAULT_AGENT_PROVIDER: AgentProviderConfig = { provider: 'ollama' };
const VALID_AGENT_PROVIDERS: AgentModelProvider[] = ['ollama', 'nvidia_nim', 'gemini', 'hermes'];

function loadAgentProviderMap(): Record<string, AgentProviderConfig> {
  try {
    const raw = localStorage.getItem(AGENT_PROVIDER_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveAgentProviderMap(map: Record<string, AgentProviderConfig>) {
  try {
    localStorage.setItem(AGENT_PROVIDER_KEY, JSON.stringify(map));
  } catch { /* quota */ }
}

/**
 * Per-agent LLM provider — the `alphonso` agent's row is deliberately backed
 * by the pre-existing global `getSelectedProvider()`/`setSelectedProvider()`
 * storage rather than a new entry, so ChatView's existing provider picker
 * (which already drives the Alphonso agent's replies) needs no changes and
 * nothing regresses for users who never touch the new per-agent UI. Every
 * other agent defaults to `{ provider: 'ollama' }` until explicitly set —
 * a fresh install / untouched setting is byte-identical to today's behavior.
 */
export function getAgentProvider(agentId: string): AgentProviderConfig {
  const map = loadAgentProviderMap();
  if (agentId === 'alphonso') {
    // A 'hermes' selection for Alphonso lives in the per-agent map (the legacy
    // global key's type can't represent it) and takes precedence when present;
    // otherwise fall back to the pre-existing global picker's value.
    if (map.alphonso?.provider === 'hermes') return map.alphonso;
    return { provider: getSelectedProvider() };
  }
  return map[agentId] || { ...DEFAULT_AGENT_PROVIDER };
}

/**
 * Only accepts 'hermes' once that agent has a saved, reachable Hermes
 * endpoint (per §1.1 of the design) — never lets the UI put an agent into a
 * state where its provider is set but unusable.
 */
export function setAgentProvider(agentId: string, config: AgentProviderConfig): void {
  if (!VALID_AGENT_PROVIDERS.includes(config.provider)) {
    throw new Error(`Unknown provider "${config.provider}"`);
  }
  if (config.provider === 'hermes' && !isHermesAgentConfigured(agentId)) {
    throw new Error(`Hermes is not configured for agent "${agentId}" — add its endpoint first`);
  }
  if (agentId === 'alphonso') {
    // 'hermes' isn't part of the legacy ModelProvider union ChatView's picker
    // uses — Alphonso's row supports it too via this same per-agent path,
    // it's just stored alongside the others rather than in the legacy key.
    if (config.provider === 'ollama' || config.provider === 'nvidia_nim' || config.provider === 'gemini') {
      setSelectedProvider(config.provider);
      // Clear any stale 'hermes' override so getAgentProvider('alphonso')
      // stops preferring it over the legacy key just updated above.
      const map = loadAgentProviderMap();
      if (map.alphonso) {
        delete map.alphonso;
        saveAgentProviderMap(map);
      }
      return;
    }
  }
  const map = loadAgentProviderMap();
  map[agentId] = { provider: config.provider, ...(config.model ? { model: config.model } : {}) };
  saveAgentProviderMap(map);
}

// Curated, not enumerated via API — Gemini has no bulk free-tier-catalog
// endpoint the way NVIDIA does. gemini-1.5-*, Gemini 2.0 Flash/Flash-Lite,
// and (as of a live check on 2026-09-04) the entire gemini-2.5-* line are
// all now retired; Pro-tier models are paid-only since 2026-04-01. This
// list must stay in sync with geminiConnector.ts's DEFAULT_MODEL. Reconfirm
// against ai.google.dev/gemini-api/docs before assuming these stay
// free-tier-eligible — Google has retired this lineup twice in under two
// months. See docs/superpowers/plans/2026-07-23-free-tier-cloud-providers.md §4.
const GEMINI_FREE_TIER_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash'];

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
