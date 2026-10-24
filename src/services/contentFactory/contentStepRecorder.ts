// A content-factory step's results, saved as they arrive from Jose (phase 6b).
// A project runs as one Jose request and may be carried on from the board,
// Telegram or Carry on, so the saving happens here, reached from the engine,
// not in Miya Studio's own run call.
import { getBrand } from './contentBrandService';
import {
  appendShortPlan,
  addStepProgress, approveStep, getProject, markStepStatus, saveStepVersion, setPendingAgents, startStep,
} from './contentProjectService';
import { requireOutputRoot, writeProjectFile, writeStepText } from './contentProjectFiles';
import { getJoseRequest, updateJoseStep } from '../jose/joseRequestStore';
import { runwayEstimate } from './contentProjectPlan';
import { makeShorts, redoShort, shortsSummary } from './shortMaker';
import { renderCarouselSlides, renderScenePictures, renderThumbnails } from './contentImages';
import { STEP_AGENTS, stepMarkdown } from './contentStepAgents';
import { hasOwnKey, type StepId } from './contentTypes';

/** The app's saved settings (the output folder). */
export function contentAppSettings(): { outputFolder?: string | null } {
  try {
    const saved = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

/** Shows a step as running when its first agent starts. Scenes starting means the review was accepted. */
export function beginContentStep(projectId: string, step: StepId): void {
  const project = getProject(projectId);
  if (!project) return;
  if (step === 'scenes' && project.steps.review.status === 'needs_approval') approveStep(projectId, 'review');
  if (project.steps[step].status !== 'running') startStep(projectId, step);
}

export async function recordContentStepResult(input: {
  projectId: string;
  step: StepId;
  agent: string;
  data: unknown;
  commandId: string | null;
  /** Add a Short as a mini-script (phase 4a): add it to the chosen Shorts, then make it. */
  appendShort?: boolean;
  /** The run's Runway clips for its Shorts were approved (phase 4a). */
  runwayApproved?: boolean;
}): Promise<'partial' | 'saved' | 'ignored'> {
  const project = getProject(input.projectId);
  const agents = STEP_AGENTS[input.step] || [];
  if (!project || !agents.some((a) => a.agent === input.agent)) return 'ignored';
  if (input.appendShort && input.step === 'shorts') {
    const plan = (input.data as { shorts?: Record<string, unknown>[] } | null)?.shorts?.[0];
    if (!plan) return 'ignored';
    const shortId = appendShortPlan(input.projectId, plan);
    await redoShort(input.projectId, shortId, contentAppSettings());
    return 'saved';
  }

  const pending = { ...(project.steps[input.step].pendingAgents || {}), [input.agent]: input.data };
  if (!agents.every((a) => hasOwnKey(pending, a.agent))) {
    setPendingAgents(input.projectId, input.step, pending);
    return 'partial';
  }
  const output: Record<string, unknown> = {};
  for (const { agent } of agents) output[agent] = pending[agent];
  const saved = saveStepVersion(input.projectId, input.step, {
    output,
    summary: agents.map((a) => a.title).join(', '),
    joseCommandId: input.commandId,
  });
  const say = (message: string) => { addStepProgress(input.projectId, input.step, message); };
  const settings = contentAppSettings();
  const brand = getBrand(saved.brandId);
  if (brand) {
    try {
      const root = requireOutputRoot(settings);
      const version = saved.steps[input.step].chosenVersion as number;
      await writeStepText(root, brand, saved, input.step, version, stepMarkdown(saved, input.step, version, output));
      await writeProjectFile(root, brand, getProject(input.projectId) || saved);
    } catch (error) {
      say(`Saved in the app, but the project folder could not be written: ${(error as Error).message}`);
    }
  }
  // Once the scenes exist, a waiting Runway clips step shows its cost on Telegram and the board (phase 3d).
  if (input.step === 'scenes') fillClipsEstimate(input.projectId);
  // Shorts (phase 3d): once planned, each is made in turn; the step stays "running" meanwhile.
  if (input.step === 'shorts') {
    markStepStatus(input.projectId, 'shorts', 'running', null);
    try {
      const outputs = input.runwayApproved
        ? await makeShorts(input.projectId, settings, say, { runwayApproved: true })
        : await makeShorts(input.projectId, settings, say);
      say(shortsSummary(outputs));
    } catch (error) {
      say(`The Shorts could not be made: ${(error as Error).message}`);
    }
    markStepStatus(input.projectId, 'shorts', 'done', null);
  }
  // Scenes, thumbnails and carousel slides go on to make their pictures; the step stays "running" meanwhile.
  if (input.step === 'scenes' || input.step === 'thumbnail' || input.step === 'carousel') {
    markStepStatus(input.projectId, input.step, 'running', null);
    try {
      if (input.step === 'scenes') await renderScenePictures(input.projectId, settings, say);
      else if (input.step === 'carousel') await renderCarouselSlides(input.projectId, settings, say);
      else await renderThumbnails(input.projectId, settings, say);
    } catch (error) {
      say(`The pictures could not be made: ${(error as Error).message}`);
    }
    markStepStatus(input.projectId, input.step, 'done', null);
  }
  return 'saved';
}

/** Sets the project's AI clips step's Runway estimate on its request, when it spends and has none yet. */
function fillClipsEstimate(projectId: string): void {
  try {
    const project = getProject(projectId);
    const requestId = project?.joseRequestId;
    if (!project || !requestId) return;
    const step = getJoseRequest(requestId)?.steps.find((s) => s.stepId === 'clips');
    if (!step || !(step.effects || []).includes('spend') || typeof step.costEstimateUsd === 'number') return;
    const usd = runwayEstimate(project);
    if (usd !== null) updateJoseStep(requestId, 'clips', { costEstimateUsd: usd });
  } catch {
    // Only the estimate is missing; the step still asks before spending.
  }
}
