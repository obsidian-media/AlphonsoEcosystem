// What a Jose step does, and which of those ask the user first.
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §2.9
// Approval is decided by these declared effects, not by words in the task
// text (which held "nothing is published" as publishing, 2026-10-22).
import { getRuntimePolicySettings } from '../policyEnforcementService';

export type JoseEffect = 'read' | 'write_own_work' | 'change_project' | 'run' | 'spend' | 'publish_or_send' | 'delete';

export const JOSE_EFFECTS: JoseEffect[] = ['read', 'write_own_work', 'change_project', 'run', 'spend', 'publish_or_send', 'delete'];

/** Always ask, whatever the settings (owner, 2026-10-23). */
export const LOCKED_EFFECTS: JoseEffect[] = ['spend', 'publish_or_send', 'delete'];

export const EFFECT_LABELS: Record<JoseEffect, string> = {
  read: 'Read and analyse',
  write_own_work: 'Create new files in the project folder',
  change_project: 'Change existing project files or install things',
  run: 'Run code and commands',
  spend: 'Spend money',
  publish_or_send: 'Publish or send anything outside',
  delete: 'Delete anything',
};

export const DEFAULT_EFFECT_APPROVALS: Record<JoseEffect, boolean> = {
  read: false,
  write_own_work: false,
  change_project: true,
  run: true,
  spend: true,
  publish_or_send: true,
  delete: true,
};

/** The Settings table (alphonso_settings.effectApprovals) over the defaults; locked effects always ask. */
export function getEffectApprovals(): Record<JoseEffect, boolean> {
  let saved: Partial<Record<JoseEffect, unknown>> = {};
  try {
    const parsed = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
    if (parsed && typeof parsed.effectApprovals === 'object' && parsed.effectApprovals) saved = parsed.effectApprovals;
  } catch { /* settings unreadable: defaults */ }
  const approvals = { ...DEFAULT_EFFECT_APPROVALS };
  for (const effect of JOSE_EFFECTS) {
    if (typeof saved[effect] === 'boolean') approvals[effect] = saved[effect] as boolean;
    if (LOCKED_EFFECTS.includes(effect)) approvals[effect] = true;
  }
  return approvals;
}

/** The effects of a step that must wait for the user. With Approval Mode off, only the locked ones. */
export function effectsNeedingApproval(
  effects: JoseEffect[],
  approvals: Record<JoseEffect, boolean> = getEffectApprovals(),
  approvalMode: boolean = getRuntimePolicySettings().approvalMode,
): JoseEffect[] {
  const unique = [...new Set(effects)];
  return unique.filter((effect) => (LOCKED_EFFECTS.includes(effect) ? true : approvalMode && approvals[effect] === true));
}

/** Effects of the task types Jose and the content factory use today. */
export const ACTION_EFFECTS: Record<string, JoseEffect[]> = {
  research: ['read'],
  external_publish_handoff: ['publish_or_send'],
  creative_package: ['write_own_work'],
  local_operation: ['run'],
  governance_audit: ['read'],
  security_monitor: ['read'],
  memory_preservation: ['write_own_work'],
  opportunity_analysis: ['read'],
  distribution_execution: ['publish_or_send'],
  orchestration_review: ['read'],
  boardroom_planning: ['write_own_work'],
  boardroom_execute: ['write_own_work'],
  boardroom_advance: ['read'],
  cost_policy_enforcement: ['spend'],
  // Miya content factory
  research_virality: ['read'],
  analysis_market: ['read'],
  analysis_content_review: ['read'],
  audit_content_quality: ['read'],
  strategy_timing: ['read'],
  security_content_check: ['read'],
  creative_script: ['write_own_work'],
  creative_scenes: ['write_own_work'],
  creative_thumbnails: ['write_own_work'],
  creative_campaign: ['write_own_work'],
};

/** Effects of a task type; `a+b` (merged tasks) is the union. Unknown counts as running code, so it asks. */
export function inferEffects(actionType: string): JoseEffect[] {
  const parts = String(actionType || '').split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return ['run'];
  const effects = new Set<JoseEffect>();
  for (const part of parts) {
    const known = Object.prototype.hasOwnProperty.call(ACTION_EFFECTS, part) ? ACTION_EFFECTS[part] : null;
    for (const effect of known || (['run'] as JoseEffect[])) effects.add(effect);
  }
  return [...effects];
}
