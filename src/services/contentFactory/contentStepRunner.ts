// Runs a Miya Studio project, or one of its steps, as a Jose request (phase 6b).
// The steps come from the Content video template (contentProjectPlan.ts); the
// engine hands each finished step to contentStepRecorder.ts, which saves its
// version, writes the project folder and makes the pictures.
import { submitStepsToJose } from '../jose/submitToJose';
import { approveRequestStep } from '../joseExecutionEngineService';
import { getJoseRequest } from '../jose/joseRequestStore';
import { getBrand } from './contentBrandService';
import {
  addStepProgress, approveStep, changeProjectPosts, failStep, getProject, markStepStatus, setProjectRequest, startStep,
} from './contentProjectService';
import { requireOutputRoot } from './contentProjectFiles';
import { CLIPS_WAIT, CLIPS_WAIT_PAID, contentProjectPlanSteps, PUBLISH_WAIT, REVIEW_WAIT } from './contentProjectPlan';
import { resolveProjectClipEngine } from './contentMediaExecutor';
import { STEP_AGENTS } from './contentStepAgents';
import { STEP_ORDER, type ContentProject, type StepId } from './contentTypes';

export { STEP_AGENTS, type StepAgent } from './contentStepAgents';

/** How a project's request is labelled on the board. */
export const PROJECT_LABEL = 'Steps set by Miya Studio.';

/** What the user sees while an agent works. */
const WORKING: Record<string, string> = {
  research_virality: 'Hector is researching what goes viral…',
  analysis_market: 'Nova is checking the market…',
  creative_script: 'Miya is writing the hooks and the script…',
  analysis_content_review: 'Nova is reviewing the hook and the script…',
  audit_content_quality: 'Maria is scoring it against your references…',
  creative_scenes: 'Miya is planning the scenes…',
  creative_thumbnails: 'Miya is designing three thumbnails…',
  creative_campaign: 'Miya is writing the campaign…',
  strategy_timing: 'Nova is choosing posting times…',
  security_content_check: 'Sentinel is checking the text and links…',
};

export const WAITING_FOR_APPROVAL = 'Waiting for your approval in the Approval panel.';

/** What each factory task says it does. Jose's bus and the agent contracts
 *  scan this text and the task type for words such as "publish", "post",
 *  "send" or "execute" and then hold the task as a risky outside action, so
 *  it must not contain them, even to say the opposite (found 2026-10-22). */
export const CONTENT_TASK_PREVIEW = 'Writes text and pictures for a content project. Nothing leaves this computer.';

export interface RunStepOptions {
  settings: { outputFolder?: string | null };
  /** Extra instruction, e.g. the reason the user sent the step back with. */
  extraTask?: string;
  onProgress?: (message: string) => void;
}

/** Why the project can't run now, or null. */
function cannotRun(project: ContentProject, settings: RunStepOptions['settings']): string | null {
  if (!getBrand(project.brandId)) return 'This project\'s brand no longer exists.';
  try {
    requireOutputRoot(settings);
  } catch (error) {
    return (error as Error).message;
  }
  if (!project.brief.idea.trim()) return 'Write the idea in the brief first.';
  return null;
}

function refusal(result: any): string {
  if (result?.reason === 'plan_rejected') return `Jose couldn't run it: ${(result.problems || []).join(' ')}`;
  return `Jose couldn't run it: ${result?.reason || 'it failed.'}`;
}

export async function runContentProject(projectId: string, options: RunStepOptions): Promise<{ ok: boolean; requestId: string | null; reason?: string }> {
  const project = getProject(projectId);
  if (!project) return { ok: false, requestId: null, reason: 'Content project not found.' };
  if (STEP_ORDER.some((s) => project.steps[s].status === 'running')) {
    return { ok: false, requestId: null, reason: 'A step of this project is already running.' };
  }
  const problem = cannotRun(project, options.settings);
  if (problem) return { ok: false, requestId: null, reason: problem };
  const brand = getBrand(project.brandId)!;
  const result: any = await submitStepsToJose({
    text: `Content project "${project.name}": ${project.brief.idea}`,
    source: 'content-factory',
    label: PROJECT_LABEL,
    // The factory saves its own lessons; Echo does not save each step.
    saveDecisions: false,
    // The plan knows which engine AI clips will use here, so a Runway run asks for its cost (phase 2b).
    steps: contentProjectPlanSteps(project, brand, 'research', { clipEngine: (await resolveProjectClipEngine(project)).engine }),
  });
  const requestId: string | null = result?.requestId || null;
  if (requestId) setProjectRequest(projectId, requestId);
  if (!result?.ok && !requestId) return { ok: false, requestId: null, reason: refusal(result) };
  return { ok: true, requestId };
}

export async function runContentStep(projectId: string, step: StepId, options: RunStepOptions): Promise<ContentProject> {
  const project = getProject(projectId);
  if (!project) throw new Error(`Content project not found: ${projectId}`);
  const problem = cannotRun(project, options.settings);
  if (problem) return failStep(projectId, step, problem);
  const agents = STEP_AGENTS[step];
  if (agents.length === 0) return project;
  const brand = getBrand(project.brandId)!;

  const started = startStep(projectId, step);
  const say = (message: string) => {
    addStepProgress(projectId, step, message);
    options.onProgress?.(message);
  };
  const clipEngine = step === 'clips' ? (await resolveProjectClipEngine(started)).engine : null;
  const steps = contentProjectPlanSteps(started, brand, step, { only: true, clipEngine }).map((s) => {
    const task = [s.contentStep!.task, options.extraTask].filter(Boolean).join('. ');
    return { ...s, instruction: task, contentStep: { ...s.contentStep!, task } };
  });

  let result: any;
  try {
    result = await submitStepsToJose({
      text: `Content factory: ${step} for "${started.name}"`,
      source: 'content-factory',
      label: PROJECT_LABEL,
      saveDecisions: false,
      steps,
      onProgress: (event: { stage?: string; agents?: string[] }) => {
        if (event?.stage === 'wave_start') {
          for (const agent of event.agents || []) {
            const job = agents.find((a) => a.agent === agent);
            if (job) say(WORKING[job.actionType] || `${agent} is working…`);
          }
        }
      },
    });
  } catch (error) {
    return failStep(projectId, step, `Jose could not run this step: ${(error as Error).message}`);
  }
  if (result?.requestId) setProjectRequest(projectId, result.requestId);
  if (result?.reason === 'plan_rejected') return failStep(projectId, step, refusal(result));

  const failure = (result?.executionReceipts || []).find((r: any) => r.status === 'dead_letter' || r.status === 'failed');
  if ((result?.failedCount || 0) > 0) {
    return failStep(projectId, step, failure?.reason || 'An agent could not finish this step.');
  }
  if ((result?.pendingApprovalCount || 0) > 0) {
    return markStepStatus(projectId, step, 'needs_approval', WAITING_FOR_APPROVAL);
  }
  // The recorder saved the version as the agents finished.
  const after = getProject(projectId)!;
  if (after.steps[step].status === 'running' && !after.steps[step].versions.some((v) => v.joseCommandId === result?.commandId)) {
    return failStep(projectId, step, 'No result was saved for this step.');
  }
  return after;
}

/** Approve a step in Miya Studio; after the review this also carries the project's request on. */
export async function approveContentStep(projectId: string, step: StepId, settings?: { outputFolder?: string | null }): Promise<ContentProject> {
  // "Approve and schedule" (phase 3a): approves the draft posts you see, then carries the
  // request on at Publish, or runs Publish through Jose when no request is waiting there.
  if (step === 'publish') {
    const drafts = (getProject(projectId)?.posts || []).filter((p) => p.status === 'draft');
    if (!drafts.length) return getProject(projectId) as ContentProject;
    changeProjectPosts(projectId, (posts) => posts.map((p) => (p.status === 'draft' ? { ...p, status: 'approved' } : p)));
    const project = getProject(projectId);
    const request = project?.joseRequestId ? getJoseRequest(project.joseRequestId) : null;
    const waiting = request?.status === 'waiting_approval'
      ? request.steps.find((s) => s.status === 'waiting_approval' && (s.waitFor === PUBLISH_WAIT || s.stepId === 'publish'))
      : null;
    if (request && waiting) {
      await approveRequestStep(request.id, waiting.stepId);
      return getProject(projectId) as ContentProject;
    }
    // Run on its own, Publish stops for approval like any post; this click, with the list in
    // front of you, is that approval, so you are not asked a second time on the board.
    await runContentStep(projectId, 'publish', { settings: settings || {} });
    const started = getProject(projectId);
    const run = started?.joseRequestId ? getJoseRequest(started.joseRequestId) : null;
    const stopped = run?.status === 'waiting_approval'
      ? run.steps.find((s) => s.status === 'waiting_approval' && (s.waitFor === PUBLISH_WAIT || s.stepId === 'publish'))
      : null;
    if (run && stopped) await approveRequestStep(run.id, stopped.stepId);
    return getProject(projectId) as ContentProject;
  }
  // "Make AI clips" (phase 2b): the request waits at the clips step; approving it carries the run
  // on (and, for Runway, approves the cost). The step itself is not an approval step.
  if (step === 'clips') {
    const project = getProject(projectId);
    const request = project?.joseRequestId ? getJoseRequest(project.joseRequestId) : null;
    const waiting = request?.status === 'waiting_approval'
      ? request.steps.find((s) => s.status === 'waiting_approval' && (s.waitFor === CLIPS_WAIT || s.waitFor === CLIPS_WAIT_PAID || s.stepId === 'clips'))
      : null;
    if (request && waiting) await approveRequestStep(request.id, waiting.stepId);
    return getProject(projectId) as ContentProject;
  }
  const approved = approveStep(projectId, step);
  const requestId = approved.joseRequestId;
  const request = requestId ? getJoseRequest(requestId) : null;
  const waiting = request?.status === 'waiting_approval'
    ? request.steps.find((s) => s.status === 'waiting_approval' && s.waitFor === REVIEW_WAIT)
    : null;
  if (step === 'review' && requestId && waiting) await approveRequestStep(requestId, waiting.stepId);
  return getProject(projectId) || approved;
}
