import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../services/jose/submitToJose', () => ({ submitStepsToJose: vi.fn() }));

import { submitStepsToJose } from '../../services/jose/submitToJose';
import { checkPlan } from '../../services/jose/stepGraph';
import { listWorkflows, runWorkflow, workflowSteps, WORKFLOW_LABEL } from '../../services/workflowRegistryService';

beforeEach(() => vi.clearAllMocks());

describe('workflows as given steps (phase 6a)', () => {
  it('every built-in workflow makes a plan Jose accepts', () => {
    for (const workflow of listWorkflows()) {
      const check = checkPlan(workflowSteps(workflow, 'x'), { taskTypes: true });
      expect({ id: workflow.id, problems: check.problems }).toEqual({ id: workflow.id, problems: [] });
    }
  });

  it('one step per agent in the chain, each after the one before; Jose plans, so he has no step', () => {
    const workflow = listWorkflows().find((w) => w.id === 'WF_REVENUE_GEN');
    const steps = workflowSteps(workflow, 'Find new clients');
    expect(steps.map((s) => s.agent)).toEqual(['nova', 'hector', 'marcus']);
    expect(steps.map((s) => s.needs)).toEqual([[], ['nova'], ['hector']]);
    expect(steps[0].instruction).toContain('Find new clients');
    expect(steps[0].instruction).toContain('Revenue Generation');
  });

  it("Marcus's workflow step reviews where things could go and sends nothing", () => {
    const workflow = listWorkflows().find((w) => w.id === 'WF_REVENUE_GEN');
    const marcus = workflowSteps(workflow, 'x').find((s) => s.agent === 'marcus');
    expect(marcus).toMatchObject({ actionType: 'distribution_review', effects: ['read'] });
  });

  it('runWorkflow runs the chain through Jose, labelled', async () => {
    vi.mocked(submitStepsToJose).mockResolvedValueOnce({ ok: true, commandId: 'c1', requestId: 'jose-request-c1' });
    const result = await runWorkflow('WF_REVENUE_GEN', { prompt: 'Find new clients' });
    expect(vi.mocked(submitStepsToJose).mock.calls[0][0]).toMatchObject({ text: 'Find new clients', source: 'workflow_engine', label: WORKFLOW_LABEL });
    expect(result).toMatchObject({ ok: true, workflowId: 'WF_REVENUE_GEN', commandId: 'c1', requestId: 'jose-request-c1', chain: ['jose', 'nova', 'hector', 'marcus'] });
  });

  it('a refused or failed run is not ok', async () => {
    vi.mocked(submitStepsToJose).mockResolvedValueOnce({ ok: false, reason: 'plan_rejected', problems: ['x'] });
    expect(await runWorkflow('WF_REVENUE_GEN', {})).toMatchObject({ ok: false, workflowId: 'WF_REVENUE_GEN', error: 'x' });
  });
});
