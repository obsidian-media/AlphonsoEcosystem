// A Miya Studio project's plan (phase 6b): the Content video template's steps,
// each carrying the project's data, so the project runs as one Jose request.
import { getTemplate } from '../jose/joseTemplates';
import type { PlanStep } from '../jose/stepGraph';
import { STEP_ORDER, type ContentBrand, type ContentProject, type StepId } from './contentTypes';

/** Which content-factory step each template step belongs to. */
export const CONTENT_TEMPLATE_STEPS: Record<string, StepId> = {
  research_trends: 'research',
  research_market: 'research',
  script: 'script',
  review_value: 'review',
  review_quality: 'review',
  scenes: 'scenes',
  thumbnail: 'thumbnail',
  voice: 'voice',
  music: 'music',
  broll: 'broll',
  assemble: 'assemble',
  campaign: 'campaign',
  timing: 'campaign',
  quality: 'quality',
  security: 'quality',
};

/** Why Scenes waits: you approve the review in Miya Studio first (owner, 2026-10-23). */
export const REVIEW_WAIT = 'Approve the review in Miya Studio first.';

/**
 * The project's plan from `from` (default research) onward, or with `only`
 * just that factory step's steps. Links to steps not in the plan are dropped.
 */
export function contentProjectPlanSteps(
  project: ContentProject,
  brand: ContentBrand,
  from: StepId = 'research',
  options: { only?: boolean } = {},
): PlanStep[] {
  const template = getTemplate('content_video');
  if (!template) throw new Error('The Content video template is missing.');
  const start = STEP_ORDER.indexOf(from);
  const included = template.steps.filter((s) => {
    const factoryStep = CONTENT_TEMPLATE_STEPS[s.stepId];
    if (!factoryStep) return false;
    return options.only ? factoryStep === from : STEP_ORDER.indexOf(factoryStep) >= start;
  });
  const ids = new Set(included.map((s) => s.stepId));
  const hasReview = included.some((s) => CONTENT_TEMPLATE_STEPS[s.stepId] === 'review');
  return included.map((s) => {
    const factoryStep = CONTENT_TEMPLATE_STEPS[s.stepId];
    const step: PlanStep = {
      stepId: s.stepId,
      agent: s.agent,
      actionType: s.actionType,
      effects: [...s.effects],
      needs: s.needs.filter((id) => ids.has(id)),
      instruction: s.instruction,
      contentStep: {
        projectId: project.id,
        step: factoryStep,
        brief: project.brief,
        brand,
        prior: {},
        task: s.instruction || '',
      },
    };
    if (s.reviewOf && ids.has(s.reviewOf)) step.reviewOf = s.reviewOf;
    if (factoryStep === 'scenes' && hasReview) step.waitFor = REVIEW_WAIT;
    return step;
  });
}
