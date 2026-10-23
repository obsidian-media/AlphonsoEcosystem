import { describe, it, expect } from 'vitest';
import { layoutPlan } from '../../../services/jose/josePlanLayout';
import { getTemplate } from '../../../services/jose/joseTemplates';
import type { PlanStep } from '../../../services/jose/stepGraph';

describe('layoutPlan', () => {
  it('puts each step one column after the steps it needs', () => {
    const steps = getTemplate('content_video')!.steps;
    const layout = layoutPlan(steps);
    const col = (id: string) => layout.nodes.find((n) => n.stepId === id)!.col;
    expect(new Set(layout.nodes.map((n) => n.col)).size).toBe(4);
    expect([col('research_trends'), col('research_market')]).toEqual([0, 0]);
    expect(col('script')).toBe(1);
    expect([col('review_value'), col('review_quality')]).toEqual([2, 2]);
    expect(col('campaign')).toBe(3);
    const expected = steps.flatMap((s) => s.needs.map((n) => `${n}->${s.stepId}`)).sort();
    expect(layout.edges.map((e) => `${e.from}->${e.to}`).sort()).toEqual(expected);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('never throws for a plan that breaks the rules: one row per step, no arrows', () => {
    const cycle: PlanStep[] = [
      { stepId: 'a', agent: 'nova', actionType: 'analysis_x', effects: ['read'], needs: ['b'] },
      { stepId: 'b', agent: 'nova', actionType: 'analysis_y', effects: ['read'], needs: ['a'] },
    ];
    const layout = layoutPlan(cycle);
    expect(layout.nodes.map((n) => [n.col, n.row])).toEqual([[0, 0], [0, 1]]);
    expect(layout.edges).toEqual([]);
  });
});
