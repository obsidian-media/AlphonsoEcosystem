// When each skill was last used (agent roles Part B). A small record for the
// Skills page and the Coach's "never used" check; Part C's outcome record
// (what each skill achieved) builds on it.
const KEY = 'alphonso_skill_last_used_v1';
const MAX = 500;

function read(): Record<string, number> {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

const keyOf = (agent: string, name: string) => `${agent}:${name.toLowerCase()}`;

export function recordSkillUse(agent: string, name: string, nowMs = Date.now()): void {
  const all = read();
  all[keyOf(agent, name)] = nowMs;
  const kept = Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept))); } catch { /* storage full: the record is a convenience */ }
}

export function skillLastUsed(agent: string, name: string): number | null {
  const value = read()[keyOf(agent, name)];
  return typeof value === 'number' ? value : null;
}
