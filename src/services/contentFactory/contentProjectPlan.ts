// A Miya Studio project's plan (phase 6b): the Content video template's steps,
// each carrying the project's data, so the project runs as one Jose request.
import { getTemplate } from '../jose/joseTemplates';
import type { PlanStep } from '../jose/stepGraph';
import { STEP_ORDER, type ContentBrand, type ContentProject, type StepId } from './contentTypes';
import { chosenVersionOf, getShortsSettings, getVideoSettings } from './contentProjectService';
import { chosenScenes } from './clipEngine';
import { estimateRunwayUsd, runwayClipAvailable } from './runwayClip';
import { estimateEffectsUsd, estimateElevenLabsUsd } from '../jose/joseSpend';
import { higgsfieldPictureLimit, paidEngineAvailable, resolvePictures, resolveVoice } from './engineChoice';

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
  sfx: 'sfx',
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

/** Why a full run waits for Higgsfield pictures (phase 4b): once per step, with the most they could cost. */
export const PICTURES_WAIT_PAID = (max: number, usd: number): string => `Make up to ${max} pictures with Higgsfield, about $${usd.toFixed(2)} at most.`;

/** Why a full run waits at Sound effects (phase 4b): once, with the most they could cost. */
export const SFX_WAIT_PAID = (max: number, usd: number): string => `Make up to ${max} sound effects, about $${usd.toFixed(2)} at most.`;

/** Why a full run waits at Voice when the brand reads with ElevenLabs (phase 4b): once, with the cost. */
export const VOICE_WAIT_PAID = (usd: number): string => `Read the voice-over with ElevenLabs, about $${usd.toFixed(2)}.`;

/** Spoken characters: the chosen script's, else about 15 a second of the brief's length. */
function spokenCharacters(project: ContentProject): number {
  const parts = (chosenVersionOf(project, 'script')?.output as { miya?: { script?: { spoken?: string }[] } } | undefined)?.miya?.script;
  if (parts?.length) return parts.reduce((n, p) => n + String(p.spoken || '').length, 0);
  return Math.max(0, Number(project.brief.lengthSec || 60)) * 15;
}

/** Why a run with Runway clips in its Shorts waits (phase 4a): once, with the cost. */
export const SHORTS_WAIT_PAID = (clips: number, shorts: number, usd: number): string =>
  `Make ${clips} Runway clips for ${shorts} Shorts, about $${usd.toFixed(2)}.`;

/** Clips per Short before the Shorts are written: the hook and the ending, or about six parts for every part. */
const SHORT_CLIPS_GUESS = { main: 2, every: 6 } as const;

/** What Runway clips in the Shorts would cost, before the Shorts are written (phase 4a); null when Runway isn't used. */
export function shortsRunwayEstimate(project: ContentProject): { clips: number; shorts: number; usd: number } | null {
  const settings = getShortsSettings(project);
  if (settings.clipEngine !== 'runway' || settings.aiClips === 'none') return null;
  if (!runwayClipAvailable().ok) return null;
  const shorts = shortsCount(project.brief);
  const clips = shorts * SHORT_CLIPS_GUESS[settings.aiClips];
  const usd = estimateRunwayUsd(Array.from({ length: clips }, () => 5));
  return usd === null ? null : { clips, shorts, usd };
}

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
    // Higgsfield pictures (phase 4b): the step spends, asked once with Higgsfield's estimate × the most pictures.
    if (factoryStep === 'scenes' || factoryStep === 'thumbnail' || factoryStep === 'carousel') {
      const pictures = resolvePictures(project, brand);
      if (pictures.engine === 'higgsfield' && pictures.usd !== undefined) {
        const max = higgsfieldPictureLimit(project, factoryStep);
        const usd = Math.round(max * pictures.usd * 10000) / 10000;
        step.effects = [...step.effects.filter((e) => e !== 'spend'), 'spend'];
        step.costEstimateUsd = usd;
        if (!options.only) step.waitFor = step.waitFor ? `${step.waitFor} ${PICTURES_WAIT_PAID(max, usd)}` : PICTURES_WAIT_PAID(max, usd);
      }
    }
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
    // An ElevenLabs voice (phase 4b): spending always asks; a full run stops once at Voice with the cost.
    if (factoryStep === 'voice' && resolveVoice(project, brand).engine === 'elevenlabs') {
      const usd = estimateElevenLabsUsd(spokenCharacters(project));
      if (usd !== null) {
        step.effects = [...step.effects.filter((e) => e !== 'spend'), 'spend'];
        step.costEstimateUsd = usd;
        if (!options.only) step.waitFor = VOICE_WAIT_PAID(usd);
      }
    }
    // Sound effects (phase 4b): at most one per scene, so the stop shows the most they could cost.
    if (factoryStep === 'sfx' && brand.engines?.soundEffects && paidEngineAvailable('elevenlabs').ok) {
      const scenes = (chosenVersionOf(project, 'scenes')?.output as { miya?: { scenes?: unknown[] } } | undefined)?.miya?.scenes;
      const max = scenes?.length || Math.max(1, Math.ceil(Number(project.brief.lengthSec || 60) / 6));
      const usd = estimateEffectsUsd(max);
      if (usd !== null) {
        step.effects = [...step.effects.filter((e) => e !== 'spend'), 'spend'];
        step.costEstimateUsd = usd;
        if (!options.only) step.waitFor = SFX_WAIT_PAID(max, usd);
      }
    }
    // Runway clips in the Shorts (phase 4a): spending always asks; a full run stops once with the cost.
    if (factoryStep === 'shorts') {
      const estimate = shortsRunwayEstimate(project);
      if (estimate) {
        step.effects = [...step.effects.filter((e) => e !== 'spend'), 'spend'];
        step.costEstimateUsd = estimate.usd;
        if (!options.only) step.waitFor = SHORTS_WAIT_PAID(estimate.clips, estimate.shorts, estimate.usd);
      }
    }
    return step;
  });
}
