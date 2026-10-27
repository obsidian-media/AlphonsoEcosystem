// When each skill was last used (agent roles Part B). Since Part C1 the skill results record
// (`skillOutcomes.ts`) is the source; the old last-used record is read once to seed it, then
// left alone, so the Coach's "never used" check keeps what was already known.
import { listSkillOutcomes } from './skillOutcomes';

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

/** Kept for the moment a skill is picked; the results record adds the step's outcome later. */
export function recordSkillUse(agent: string, name: string, nowMs = Date.now()): void {
  const all = read();
  all[keyOf(agent, name)] = nowMs;
  const kept = Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept))); } catch { /* storage full: the record is a convenience */ }
}

export function skillLastUsed(agent: string, name: string): number | null {
  const fromResults = listSkillOutcomes()
    .filter((o) => o.agent === agent && String(o.skill || '').toLowerCase() === name.toLowerCase())
    .reduce<number | null>((max, o) => (max === null || o.atMs > max ? o.atMs : max), null);
  const old = read()[keyOf(agent, name)];
  const seeded = typeof old === 'number' ? old : null;
  if (fromResults === null) return seeded;
  return seeded !== null && seeded > fromResults ? seeded : fromResults;
}
