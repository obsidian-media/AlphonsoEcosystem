import { describe, it, expect, beforeEach } from 'vitest';
import {
  JOSE_EFFECTS,
  LOCKED_EFFECTS,
  EFFECT_LABELS,
  DEFAULT_EFFECT_APPROVALS,
  getEffectApprovals,
  effectsNeedingApproval,
  inferEffects,
} from '../../../services/jose/joseEffects';

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
    expect(inferEffects('external_publish_handoff')).toEqual(['publish_or_send']);
    const merged = inferEffects('local_operation+research');
    expect(merged).toContain('run');
    expect(merged).toContain('read');
  });

  it('treats an unknown task type as running code (fail closed)', () => {
    expect(inferEffects('unknown_x')).toEqual(['run']);
    expect(inferEffects('')).toEqual(['run']);
  });
});
