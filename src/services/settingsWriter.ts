// One way to change the app's settings from outside the Settings screen (phone app phase 3 part B,
// 2026-11-02). The running app holds settings in SettingsProvider's state and saves that state, so a
// write straight to storage would be put back by its next save; a patch here is saved and also
// merged into that state through SETTINGS_PATCH_EVENT. Groups of switches merge key by key.
export const SETTINGS_KEY = 'alphonso_settings';
export const SETTINGS_PATCH_EVENT = 'alphonso:settings-patch';
const NESTED = new Set(['effectApprovals', 'paidModels', 'phoneNotify']);

export function readAppSettings(): Record<string, any> {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

/** `current` with `patch` applied; the switch groups merge instead of being replaced. */
export function mergeSettings(current: Record<string, any>, patch: Record<string, unknown>): Record<string, any> {
  const next: Record<string, any> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    next[key] = NESTED.has(key) && value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(current[key] && typeof current[key] === 'object' ? current[key] : {}), ...value }
      : value;
  }
  return next;
}

export function applySettingsPatch(patch: Record<string, unknown>): Record<string, any> {
  const next = mergeSettings(readAppSettings(), patch);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* full: the running app still gets it */ }
  try { window.dispatchEvent(new CustomEvent(SETTINGS_PATCH_EVENT, { detail: patch })); } catch { /* no window in a worker */ }
  return next;
}
