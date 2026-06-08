import { fetchOllamaModels, chooseDefaultModel, chooseBestModelForTask, classifyModelTier, listAvailableModels, PREFERRED_MODEL } from '../lib/ollama';

const MODEL_PREF_KEY = 'alphonso_model_preferences_v1';
const MAX_RECENT = 10;

function loadPreferences() {
  try {
    const raw = localStorage.getItem(MODEL_PREF_KEY);
    return raw ? JSON.parse(raw) : { selected: PREFERRED_MODEL, recent: [], taskOverrides: {} };
  } catch {
    return { selected: PREFERRED_MODEL, recent: [], taskOverrides: {} };
  }
}

function savePreferences(prefs) {
  try {
    localStorage.setItem(MODEL_PREF_KEY, JSON.stringify(prefs));
  } catch { /* quota */ }
}

export function getSelectedModel() {
  return loadPreferences().selected || PREFERRED_MODEL;
}

export function setSelectedModel(modelName) {
  const prefs = loadPreferences();
  prefs.selected = modelName;
  if (modelName && !prefs.recent.includes(modelName)) {
    prefs.recent.unshift(modelName);
    if (prefs.recent.length > MAX_RECENT) prefs.recent.length = MAX_RECENT;
  }
  savePreferences(prefs);
}

export function setTaskModelOverride(taskType, modelName) {
  const prefs = loadPreferences();
  prefs.taskOverrides[taskType] = modelName;
  savePreferences(prefs);
}

export function getModelForTask(taskType) {
  const prefs = loadPreferences();
  if (prefs.taskOverrides[taskType]) return prefs.taskOverrides[taskType];
  return prefs.selected || PREFERRED_MODEL;
}

export function getRecentModels() {
  return loadPreferences().recent || [];
}

export async function getModelList(endpoint) {
  try {
    const { models } = await fetchOllamaModels(endpoint);
    return listAvailableModels(models);
  } catch {
    return [];
  }
}

export async function getRecommendedModel(endpoint, taskType) {
  try {
    const { models } = await fetchOllamaModels(endpoint);
    return chooseBestModelForTask(models, taskType || 'code');
  } catch {
    return PREFERRED_MODEL;
  }
}
