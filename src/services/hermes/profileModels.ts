// Hermes gateway (2026-10-30): what each profile Alphonso set up thinks with,
// kept here so the resource manager knows whether a Hermes step loads an
// Ollama model on this computer. The backend keeps the same in the profile's
// own settings; this copy is read without a call to the backend.
const MODELS_KEY = 'alphonso_hermes_profile_models_v1';

export type SavedProfileModel = { kind: 'ollama' | 'openrouter'; model: string };

function savedModels(): Record<string, SavedProfileModel> {
  try {
    const parsed = JSON.parse(localStorage.getItem(MODELS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Remembers what a profile Alphonso set up thinks with (null when removed). */
export function saveProfileModel(agent: string, model: SavedProfileModel | null): void {
  const all = savedModels();
  if (model) all[agent] = { kind: model.kind, model: model.model };
  else delete all[agent];
  try { localStorage.setItem(MODELS_KEY, JSON.stringify(all)); } catch { /* unavailable */ }
}

/** The Ollama model a profile Alphonso set up thinks with; null for any other profile. */
export function hermesLocalModel(agent: string): string | null {
  const saved = savedModels()[agent];
  return saved?.kind === 'ollama' && saved.model ? saved.model : null;
}

/** What a profile Alphonso set up thinks with, for Settings; null when unknown. */
export function savedProfileModel(agent: string): SavedProfileModel | null {
  return savedModels()[agent] || null;
}
