import { describe, it, expect } from 'vitest';
import { removeStep, addStep, changeStepAgent, setStepNeeds, setStepInstruction, rewireNeeds } from '../../../services/jose/josePlanEdits';
import { checkPlan, type PlanStep } from '../../../services/jose/stepGraph';

const plan: PlanStep[] = [
  { stepId: 'facts', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [], instruction: 'Find the facts.' },
  { stepId: 'value', agent: 'nova', actionType: 'analysis_findings', effects: ['read'], needs: ['facts'], instruction: 'Judge them.' },
  { stepId: 'build', agent: 'alphonso', actionType: 'local_operation', effects: ['run'], needs: ['value'], instruction: 'Build it.' },
];

describe('josePlanEdits', () => {
  it('removing a step also removes it from what others need, so the plan stays valid', () => {
    const edited = removeStep(plan, 'facts');
    expect(edited.map((s) => s.stepId)).toEqual(['value', 'build']);
    expect(edited[0].needs).toEqual([]);
    expect(checkPlan(edited).ok).toBe(true);
    expect(plan).toHaveLength(3); // the original is untouched
  });

  it('adds steps with ids unique in the plan and effects from the task type', () => {
    const once = addStep(plan, { agent: 'nova', actionType: 'analysis_risks', instruction: 'List risks.', needs: ['facts'] });
    const twice = addStep(once, { agent: 'nova', actionType: 'analysis_timing', instruction: 'When?', needs: [] });
    const added = twice.slice(3);
    expect(new Set(added.map((s) => s.stepId)).size).toBe(2);
    expect(added.every((s) => s.stepId.startsWith('nova-'))).toBe(true);
    expect(added[0].effects).toEqual(['read']);
    expect(checkPlan(twice).ok).toBe(true);
  });

  it('lets an edit break the rules, for the check to report (it is not refused here)', () => {
    expect(checkPlan(setStepNeeds(plan, 'facts', ['build'])).problems.join(' ')).toMatch(/cycle/);
    expect(checkPlan(changeStepAgent(plan, 'build', 'miya')).ok).toBe(false);
  });

  it('changes a step’s instruction', () => {
    expect(setStepInstruction(plan, 'value', 'Rank them.')[1].instruction).toBe('Rank them.');
  });

  it('moves later steps from needing one step to needing others (not the steps already run)', () => {
    const steps: PlanStep[] = [
      { stepId: 'r', agent: 'nova', actionType: 'analysis_x', effects: ['read'], needs: [] },
      { stepId: 'r2', agent: 'nova', actionType: 'analysis_x', effects: ['read'], needs: [] },
      { stepId: 'done', agent: 'maria', actionType: 'audit_x', effects: ['read'], needs: ['r'] },
      { stepId: 'later', agent: 'miya', actionType: 'creative_x', effects: ['write_own_work'], needs: ['r', 'other'] },
    ];
    const rewired = rewireNeeds(steps, ['r'], ['r2'], ['done']);
    expect(rewired.find((s) => s.stepId === 'later')!.needs).toEqual(['other', 'r2']);
    expect(rewired.find((s) => s.stepId === 'done')!.needs).toEqual(['r']);
    expect(rewired.find((s) => s.stepId === 'r2')!.needs).toEqual([]);
  });
});
