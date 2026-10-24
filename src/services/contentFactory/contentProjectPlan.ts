// A Miya Studio project's plan (phase 6b): the Content video template's steps,
// each carrying the project's data, so the project runs as one Jose request.
import { getTemplate } from '../jose/joseTemplates';
import type { PlanStep } from '../jose/stepGraph';
import { STEP_ORDER, type ContentBrand, type ContentProject, type StepId } from './contentTypes';
import { chosenVersionOf, getVideoSettings } from './contentProjectService';
import { chosenScenes } from './clipEngine';
import { estimateRunwayUsd } from './runwayClip';

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
  clips: 'clips',
  assemble: 'assemble',
  shorts: 'shorts',
  carousel: 'carousel',
  campaign: 'campaign',
  timing: 'campaign',
  quality: 'quality',
  security: 'quality',
  publish: 'publish',
};

/** Why Scenes waits: you approve the review in Miya Studio first (owner, 2026-10-23). */
export const REVIEW_WAIT = 'Approve the review in Miya Studio first.';

/** Why AI clips wait (phase 2b): you check Miya's main moments first; for Runway, the cost too. */
export const CLIPS_WAIT = 'Check the main moments in Miya Studio first.';
export const CLIPS_WAIT_PAID = 'Check the main moments and the Runway cost in Miya Studio first.';

/** Why Publish waits (phase 3a): you approve the exact posts in Campaign Studio's Posts list. */
export const PUBLISH_WAIT = 'Check the posts in Campaign Studio and choose "Approve and schedule".';

/** Runway's estimate for the scenes AI clips would be made for, when the scene plan is known. */
export function runwayEstimate(project: ContentProject): number | null {
  const scenes = (chosenVersionOf(project, 'scenes')?.output as { miya?: { scenes?: { startSec?: number; endSec?: number; mainMoment?: unknown }[] } } | undefined)?.miya?.scenes;
  if (!scenes?.length) return null;
  const chosen = chosenScenes(scenes, getVideoSettings(project).aiClips);
  if (!chosen.length) return null;
  return estimateRunwayUsd(chosen.map((s) => Math.max(0, Number(s.endSec || 0) - Number(s.startSec || 0))));
}

/** The brief asks for a carousel (its "What to make" or its format says so; phase 3c). */
export function briefWantsCarousel(brief: { outputs?: string[]; format?: string }): boolean {
  return [...(brief.outputs || []), String(brief.format || '')].some((o) => /carousel/i.test(String(o)));
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/** The brief asks for Shorts or Reels (its "What to make" or its format; phase 3d). */
export function briefWantsShorts(brief: { outputs?: string[]; format?: string }): boolean {
  return [...(brief.outputs || []), String(brief.format || '')].some((o) => /\b(shorts?|reels?)\b/i.test(String(o)));
}

/** How many Shorts the brief asks for: "3 Shorts", "three shorts", "Shorts x2"; else 1. */
export function shortsCount(brief: { outputs?: string[] }): number {
  for (const raw of brief.outputs || []) {
    const text = String(raw).toLowerCase();
    if (!/\b(shorts?|reels?)\b/.test(text)) continue;
    const digits = /(\d+)\s*(?:x\s*)?(?:shorts?|reels?)|(?:shorts?|reels?)\s*x\s*(\d+)/.exec(text);
    if (digits) return Math.max(1, Math.min(10, Number(digits[1] || digits[2])));
    const word = /\b(one|two|three|four|five)\b/.exec(text);
    if (word) return NUMBER_WORDS[word[1]];
  }
  return 1;
}

/**
 * The project's plan from `from` (default research) onward, or with `only`
 * just that factory step's steps. Links to steps not in the plan are dropped.
 */
export function contentProjectPlanSteps(
  project: ContentProject,
  brand: ContentBrand,
  from: StepId = 'research',
  options: { only?: boolean; clipEngine?: 'local' | 'runway' | null } = {},
): PlanStep[] {
  const template = getTemplate('content_video');
  if (!template) throw new Error('The Content video template is missing.');
  const start = STEP_ORDER.indexOf(from);
  const included = template.steps.filter((s) => {
    const factoryStep = CONTENT_TEMPLATE_STEPS[s.stepId];
    if (!factoryStep) return false;
    if (options.only) return factoryStep === from;
    // A carousel is made only when the brief asks for one; it can always be run on its own.
    if (factoryStep === 'carousel' && !briefWantsCarousel(project.brief)) return false;
    if (factoryStep === 'shorts' && !briefWantsShorts(project.brief)) return false;
    return STEP_ORDER.indexOf(factoryStep) >= start;
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
    if (factoryStep === 'publish') step.waitFor = PUBLISH_WAIT;
    // AI clips stop once for the main moments; a Runway run is that same stop plus its cost.
    // Run on its own from Miya Studio, the user is already looking at the marks: no extra stop,
    // but a Runway run still asks for its cost (spending always asks).
    if (factoryStep === 'clips' && getVideoSettings(project).aiClips !== 'none') {
      if (options.clipEngine === 'runway') {
        step.effects = [...step.effects.filter((e) => e !== 'spend'), 'spend'];
        // The estimate travels with the step (phase 3b), so Telegram and the board say "(about $X.XX)".
        const estimate = runwayEstimate(project);
        if (estimate !== null) step.costEstimateUsd = estimate;
      }
      // No stop when nothing can make clips here (null); the step then says what to set up.
      // An unknown engine (undefined) still stops, to be safe.
      if (!options.only && options.clipEngine !== null) step.waitFor = options.clipEngine === 'runway' ? CLIPS_WAIT_PAID : CLIPS_WAIT;
    }
    return step;
  });
}
