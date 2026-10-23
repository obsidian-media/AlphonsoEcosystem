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

/**
 * Asked per command, not per step: the command check (commandApprovalService,
 * assessCommandRisk) decides which of a step's commands ask, so the whole
 * step does not wait as well (design §7: run asks "per assessCommandRisk()
 * and Settings"). Otherwise the user would be asked twice.
 */
export const COMMAND_CHECKED_EFFECTS: JoseEffect[] = ['run'];

/** The effects a whole step waits on before it starts. */
export function stepEffectsToWaitFor(
  effects: JoseEffect[],
  approvals: Record<JoseEffect, boolean> = getEffectApprovals(),
  approvalMode: boolean = getRuntimePolicySettings().approvalMode,
): JoseEffect[] {
  return effectsNeedingApproval(effects, approvals, approvalMode).filter((effect) => !COMMAND_CHECKED_EFFECTS.includes(effect));
}

/** Effects of the task types Jose and the content factory use today. */
export const ACTION_EFFECTS: Record<string, JoseEffect[]> = {
  research: ['read'],
  // Hector checks whether something is ready to publish; he publishes nothing.
  // It still asks first: its task sets requiresApproval.
  external_publish_handoff: ['read'],
  creative_package: ['write_own_work'],
  local_operation: ['run'],
  governance_audit: ['read'],
  security_monitor: ['read'],
  memory_preservation: ['write_own_work'],
  opportunity_analysis: ['read'],
  distribution_execution: ['publish_or_send'],
  distribution_schedule_posts: ['publish_or_send'],
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
  // The finished video (phase 2a): files in the project folder only.
  creative_voice: ['write_own_work'],
  creative_music: ['write_own_work'],
  research_broll: ['read'],
  runtime_assemble_video: ['write_own_work'],
  // AI clips (phase 2b): local clips write files; a Runway run adds `spend` in the plan.
  creative_video_clips: ['write_own_work'],
  // Templates (phase 2, joseTemplates.ts).
  research_report: ['read'],
  analysis_findings: ['read'],
  audit_quality: ['read'],
  security_review: ['read'],
  creative_ui_design: ['write_own_work'],
  orchestration_summary: ['write_own_work'],
};

/**
 * A task type the planner writes (phase 2) is judged by its family prefix,
 * the same families the permission table uses. Families that can change the
 * project or run things (local_, execute_, runtime_, verification_,
 * filesystem_) are deliberately absent: they stay "running code".
 */
const FAMILY_EFFECTS: [string, JoseEffect[]][] = [
  ['research', ['read']],
  ['source_', ['read']],
  ['citation_', ['read']],
  ['analysis_', ['read']],
  ['opportunity_', ['read']],
  ['prioritization_', ['read']],
  ['strategy_', ['read']],
  ['audit_', ['read']],
  ['governance_', ['read']],
  ['policy_', ['read']],
  ['security_', ['read']],
  ['risk_', ['read']],
  ['permission_', ['read']],
  ['orchestration_', ['read']],
  ['creative_', ['write_own_work']],
  ['memory_', ['write_own_work']],
  ['retention_', ['write_own_work']],
  ['knowledge_', ['write_own_work']],
  ['timeline_', ['write_own_work']],
  ['distribution_', ['publish_or_send']],
  ['engagement_', ['publish_or_send']],
];

function familyEffects(part: string): JoseEffect[] | null {
  const family = FAMILY_EFFECTS.find(([prefix]) => part.startsWith(prefix));
  return family ? family[1] : null;
}

/** Effects of a task type; `a+b` (merged tasks) is the union. An unknown family counts as running code, so it asks. */
export function inferEffects(actionType: string): JoseEffect[] {
  const parts = String(actionType || '').split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return ['run'];
  const effects = new Set<JoseEffect>();
  for (const part of parts) {
    const known = Object.prototype.hasOwnProperty.call(ACTION_EFFECTS, part) ? ACTION_EFFECTS[part] : null;
    for (const effect of known || familyEffects(part) || (['run'] as JoseEffect[])) effects.add(effect);
  }
  return [...effects];
}
