// When Jose shows his plan before running it (owner, 2026-10-23): bigger
// requests only by default, meaning 4 or more agents counting Jose and Maria
// (who are always involved), or any step that always asks. A setting decides:
// Always / Bigger requests only / Never.
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §2.5
import { LOCKED_EFFECTS } from './joseEffects';
import type { PlanStep } from './stepGraph';

export type PlanFirstSetting = 'always' | 'bigger' | 'never';

const SETTINGS: PlanFirstSetting[] = ['always', 'bigger', 'never'];

export function getPlanFirstSetting(): PlanFirstSetting {
  try {
    const value = JSON.parse(localStorage.getItem('alphonso_settings') || '{}')?.showPlanFirst;
    return SETTINGS.includes(value) ? value : 'bigger';
  } catch {
    return 'bigger';
  }
}

export function needsPlanApproval(steps: PlanStep[], setting: PlanFirstSetting = getPlanFirstSetting()): boolean {
  if (setting === 'always') return true;
  if (setting === 'never') return false;
  const agents = new Set(['jose', 'maria', ...steps.map((s) => s.agent)]);
  const alwaysAsks = steps.some((s) => s.effects.some((e) => LOCKED_EFFECTS.includes(e)));
  return agents.size >= 4 || alwaysAsks;
}
