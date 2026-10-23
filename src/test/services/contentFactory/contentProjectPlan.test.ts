import { describe, it, expect, beforeEach } from 'vitest';
import { getTemplate } from '../../../services/jose/joseTemplates';
import { checkPlan } from '../../../services/jose/stepGraph';
import { STEP_AGENTS } from '../../../services/contentFactory/contentStepAgents';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief } from '../../../services/contentFactory/contentProjectService';
import { CONTENT_TEMPLATE_STEPS, REVIEW_WAIT, contentProjectPlanSteps } from '../../../services/contentFactory/contentProjectPlan';

// Phase 2a added voice, music, broll and assemble: 15 steps.
const IDS = ['research_trends', 'research_market', 'script', 'review_value', 'review_quality', 'scenes', 'thumbnail', 'voice', 'music', 'broll', 'assemble', 'campaign', 'timing', 'quality', 'security'];

function newProject() {
  const brand = saveBrand({ name: 'My brand' });
  return { brand, project: createProject(brand.id, 'Launch', { ...emptyBrief(), idea: 'Why we wait' }) };
}

beforeEach(() => localStorage.clear());

// Phase 6b: the Content video template is the content factory's own plan.
describe('the Content video template', () => {
  it("has the factory's steps in order, with the factory's agents and tasks", () => {
    const steps = getTemplate('content_video')!.steps;
    expect(steps.map((s) => s.stepId)).toEqual(IDS);
    expect(steps.filter((s) => s.reviewOf).map((s) => [s.stepId, s.reviewOf])).toEqual([['review_value', 'script'], ['review_quality', 'script']]);
    for (const s of steps) {
      const factoryStep = CONTENT_TEMPLATE_STEPS[s.stepId];
      expect(STEP_AGENTS[factoryStep].some((a) => a.agent === s.agent && a.actionType === s.actionType)).toBe(true);
    }
    // Every agent of every factory step has a template step.
    for (const [factoryStep, agents] of Object.entries(STEP_AGENTS)) {
      for (const a of agents) {
        expect(steps.some((s) => CONTENT_TEMPLATE_STEPS[s.stepId] === factoryStep && s.agent === a.agent)).toBe(true);
      }
    }
  });
});

describe('contentProjectPlanSteps', () => {
  it('carries the project and waits before scenes', () => {
    const { brand, project } = newProject();
    const steps = contentProjectPlanSteps(project, brand);
    expect(steps.map((s) => s.stepId)).toEqual(IDS);
    expect(steps.every((s) => s.contentStep?.projectId === project.id)).toBe(true);
    expect(steps.find((s) => s.stepId === 'research_market')!.contentStep!.step).toBe('research');
    expect(steps.filter((s) => s.waitFor).map((s) => [s.stepId, s.waitFor])).toEqual([['scenes', REVIEW_WAIT]]);
    expect(REVIEW_WAIT).toBe('Approve the review in Miya Studio first.');
    expect(checkPlan(steps, { taskTypes: true }).problems).toEqual([]);
  });

  it('from a later step the plan starts there', () => {
    const { brand, project } = newProject();
    const steps = contentProjectPlanSteps(project, brand, 'scenes');
    expect(steps.map((s) => s.stepId)).toEqual(['scenes', 'thumbnail', 'voice', 'music', 'broll', 'assemble', 'campaign', 'timing', 'quality', 'security']);
    expect(steps[0]).toMatchObject({ needs: [] });
    expect(steps[0].waitFor).toBeUndefined();
    expect(checkPlan(steps, { taskTypes: true }).problems).toEqual([]);
  });

  it('the finished video comes before the campaign: voice, music and B-roll, then assemble', () => {
    const { brand, project } = newProject();
    const steps = contentProjectPlanSteps(project, brand);
    const byId = Object.fromEntries(steps.map((s) => [s.stepId, s]));
    expect(byId.assemble).toMatchObject({ agent: 'alphonso', actionType: 'runtime_assemble_video', needs: ['voice', 'music', 'broll'] });
    expect(byId.broll).toMatchObject({ agent: 'hector', actionType: 'research_broll' });
    expect(byId.campaign.needs).toEqual(['assemble']);
    expect(byId.assemble.effects).toEqual(['write_own_work']);
    expect(steps.filter((s) => s.waitFor).map((s) => s.stepId)).toEqual(['scenes']);
  });

  it("a step's plan alone drops links to steps that are not in it", () => {
    const { brand, project } = newProject();
    const steps = contentProjectPlanSteps(project, brand, 'review', { only: true });
    expect(steps.map((s) => s.stepId)).toEqual(['review_value', 'review_quality']);
    expect(steps.every((s) => s.needs.length === 0 && !s.reviewOf && !s.waitFor)).toBe(true);
    expect(checkPlan(steps, { taskTypes: true }).problems).toEqual([]);
  });
});
