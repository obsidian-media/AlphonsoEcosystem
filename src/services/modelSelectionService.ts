import { fetchOllamaModels, chooseBestModelForTask, listAvailableModels, PREFERRED_MODEL } from '../lib/ollama';

const MODEL_PREF_KEY = 'alphonso_model_preferences_v1';
const MAX_RECENT = 10;

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
