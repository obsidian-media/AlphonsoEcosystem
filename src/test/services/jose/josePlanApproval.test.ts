import { describe, it, expect, beforeEach } from 'vitest';
import { getPlanFirstSetting, needsPlanApproval } from '../../../services/jose/josePlanApproval';
import type { PlanStep } from '../../../services/jose/stepGraph';

const step = (agent: string, actionType: string, effects: PlanStep['effects'] = ['read']): PlanStep =>
  ({ stepId: `${agent}-${actionType}`, agent, actionType, effects, needs: [] });

beforeEach(() => localStorage.clear());

describe('needsPlanApproval', () => {
  it('defaults to bigger requests only', () => {
    expect(getPlanFirstSetting()).toBe('bigger');
    localStorage.setItem('alphonso_settings', JSON.stringify({ showPlanFirst: 'never' }));
    expect(getPlanFirstSetting()).toBe('never');
    localStorage.setItem('alphonso_settings', JSON.stringify({ showPlanFirst: 'nonsense' }));
    expect(getPlanFirstSetting()).toBe('bigger');
  });

  it('shows a plan with 4 or more agents counting Jose and Maria (owner)', () => {
    expect(needsPlanApproval([step('hector', 'research'), step('nova', 'analysis_x')], 'bigger')).toBe(true);
    expect(needsPlanApproval([step('hector', 'research')], 'bigger')).toBe(false);
    expect(needsPlanApproval([step('hector', 'research'), step('maria', 'audit_x')], 'bigger')).toBe(false);
  });

  it('shows any plan with a step that always asks', () => {
    expect(needsPlanApproval([step('marcus', 'distribution_execution', ['publish_or_send'])], 'bigger')).toBe(true);
  });

  it('follows Always and Never', () => {
    expect(needsPlanApproval([step('hector', 'research')], 'always')).toBe(true);
    expect(needsPlanApproval([step('hector', 'research'), step('nova', 'analysis_x')], 'never')).toBe(false);
  });
});
