import { describe, it, expect, beforeEach } from 'vitest';
import {
  JOSE_EFFECTS,
  LOCKED_EFFECTS,
  EFFECT_LABELS,
  DEFAULT_EFFECT_APPROVALS,
  getEffectApprovals,
  effectsNeedingApproval,
  inferEffects, stepEffectsToWaitFor } from '../../../services/jose/joseEffects';

beforeEach(() => localStorage.clear());

describe('joseEffects', () => {
  it('names the effects and locks spend, publish/send and delete', () => {
    expect(JOSE_EFFECTS).toEqual(['read', 'write_own_work', 'change_project', 'run', 'spend', 'publish_or_send', 'delete']);
    expect(LOCKED_EFFECTS).toEqual(['spend', 'publish_or_send', 'delete']);
    expect(EFFECT_LABELS.spend).toBe('Spend money');
    expect(DEFAULT_EFFECT_APPROVALS).toMatchObject({ read: false, write_own_work: false, change_project: true, run: true, spend: true });
  });

  it('only risky effects need approval by default', () => {
    expect(effectsNeedingApproval(['read', 'write_own_work'], undefined, true)).toEqual([]);
    expect(effectsNeedingApproval(['run'], undefined, true)).toEqual(['run']);
  });

  it('with Approval Mode off, the locked effects still ask', () => {
    expect(effectsNeedingApproval(['run', 'spend'], undefined, false)).toEqual(['spend']);
  });

  it('reads the saved table, but locked effects always ask', () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ effectApprovals: { spend: false, run: false } }));
    const approvals = getEffectApprovals();
    expect(approvals.spend).toBe(true);
    expect(approvals.run).toBe(false);
  });

  it('follows Approval Mode from Settings when not given', () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ approvalMode: false }));
    expect(effectsNeedingApproval(['run', 'delete'])).toEqual(['delete']);
  });

  it('infers effects for today\'s task types, merged types included', () => {
    expect(inferEffects('research')).toEqual(['read']);
    expect(inferEffects('distribution_execution')).toEqual(['publish_or_send']);
    const merged = inferEffects('local_operation+research');
    expect(merged).toContain('run');
    expect(merged).toContain('read');
  });

  it('leaves running code to the per-command check, so a step is never asked twice', () => {
    expect(stepEffectsToWaitFor(['run'], undefined, true)).toEqual([]);
    expect(stepEffectsToWaitFor(['run', 'publish_or_send'], undefined, true)).toEqual(['publish_or_send']);
    expect(stepEffectsToWaitFor(['change_project'], undefined, true)).toEqual(['change_project']);
    expect(stepEffectsToWaitFor(['change_project'], undefined, false)).toEqual([]);
  });

  // Phase 2: a planner-written task type is judged by its family prefix.
  it('infers a new task type from its family, as each agent uses them', () => {
    expect(inferEffects('analysis_party')).toEqual(['read']);
    expect(inferEffects('audit_launch')).toEqual(['read']);
    expect(inferEffects('creative_poster')).toEqual(['write_own_work']);
    expect(inferEffects('distribution_newsletter')).toEqual(['publish_or_send']);
    expect(inferEffects('research_pricing')).toEqual(['read']);
  });

  it('treats an unknown task type as running code (fail closed)', () => {
    expect(inferEffects('unknown_x')).toEqual(['run']);
    expect(inferEffects('')).toEqual(['run']);
  });
});
