// The one entry point for asking Jose to do something (phase 2, 2026-10-23).
// Shortcuts first (an image request, a named workflow), then Jose's plan. A
// plan from the model or a template runs as explicit steps on the step graph;
// the simple rule-based plan runs through the old path unchanged.
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §4, §9
import { toCurrentOwners } from './movedTaskTypes';
import { runJoseCommandExecutionPipeline, runPipelineShortcuts } from '../joseExecutionEngineService';
import { describePlanSource, planJoseRequest, type JosePlan } from './josePlanner';
import { needsPlanApproval, type PlanFirstSetting } from './josePlanApproval';
import { appendRequestNote, cancelJoseRequest, claimPlanForRun, createWaitingPlanRequest, returnPlanToWaiting, type JoseRequest } from './joseRequestStore';
import { addSecurityChecks } from '../sentinel/addSecurityChecks';
import { checkPlan, type PlanStep } from './stepGraph';
import { agentName } from './agentNames';
import { asksToMake, scoreTemplateFit, TEMPLATE_FIT_THRESHOLD } from './joseTemplates';

/** The output folder chosen in Settings, for a project started from Chat. */
function savedOutputFolder(): { outputFolder?: string | null } {
  try {
    const saved = JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
    return { outputFolder: typeof saved?.outputFolder === 'string' ? saved.outputFolder : null };
  } catch {
    return {};
  }
}

export const CONTENT_VIDEO_STUDIO_NOTE = 'For the full project with pictures and a saved folder, open Miya Studio.';


export interface SubmitToJoseInput {
  text: string;
  source: string;
  history?: { role: string; content: string }[];
  planFresh?: boolean;
  endpoint?: string;
  zeroCostMode?: boolean;
  previewMode?: boolean;
  onProgress?: (event: any) => void;
  onToken?: (tokenData: any) => void;
  /** Whether to show the plan first; the saved setting when not given (phase 3). */
  showPlanFirst?: PlanFirstSetting;
  /** False for a caller that may never spend (a schedule, phase 6a). */
  allowPaidModels?: boolean;
  /** Start from this template (agent roles Part C1: Projects uses Build an app). */
  templateId?: string;
}

/** The plan note, plus what changed while it ran (a review that still found problems). */
function withNotes(planNote: string, result: any): string {
  return [planNote, ...(Array.isArray(result?.adaptNotes) ? result.adaptNotes : [])].filter(Boolean).join(' ');
}

function noteFor(plan: JosePlan): string {
  const notes = [describePlanSource(plan)];
  if (plan.templateId === 'content_video') notes.push(CONTENT_VIDEO_STUDIO_NOTE);
  return notes.filter(Boolean).join(' ');
}

function toAssignments(steps: PlanStep[], planNote: string) {
  return steps.map((step) => ({
    agent: step.agent,
    stepId: step.stepId,
    actionType: step.actionType,
    effects: step.effects,
    needs: step.needs,
    instruction: step.instruction || '',
    ...(step.model ? { model: step.model } : {}),
    ...(step.reviewOf ? { reviewOf: step.reviewOf } : {}),
    ...(step.payload ? { payload: step.payload } : {}),
    ...(step.contentStep ? { contentStep: step.contentStep } : {}),
    ...(step.waitFor ? { waitFor: step.waitFor } : {}),
    // The cost reaches the approval message ("about $X.XX"; phase 4b).
    ...(Number.isFinite(step.costEstimateUsd) ? { costEstimateUsd: step.costEstimateUsd } : {}),
    title: `${agentName(step.agent)} ${step.actionType}`,
    rationale: planNote,
    riskLevel: 'low',
    requiresApproval: false,
    commandPreview: step.instruction || '',
    fragments: [],
  }));
}

/** A picture asked for in words: Miya's step (agent roles Part A, 2026-10-24). */
export const IMAGE_STEP: PlanStep = {
  stepId: 'picture', agent: 'miya', actionType: 'creative_image',
  instruction: 'Make the picture the request asks for.', effects: ['write_own_work'], needs: [],
};

/** What Sentinel's added checks say in the plan's note. */
function securityNote(secured: ReturnType<typeof addSecurityChecks>): string {
  const parts: string[] = [];
  if (secured.added.length) parts.push(`Sentinel checks added: ${secured.added.join(', ')}.`);
  if (secured.holdReason) parts.push(secured.holdReason);
  return parts.join(' ');
}

export async function submitToJose(input: SubmitToJoseInput): Promise<any> {
  const { text, source, history, planFresh, endpoint, zeroCostMode, previewMode, onProgress, onToken } = input;

  // A team asked for by name (agent roles Part C1): its own steps, checked, with its label.
  const { parseTeamRequest, runNamedTeam } = await import('./teams');
  const teamRequest = parseTeamRequest(text);
  if (teamRequest) return runNamedTeam(teamRequest, { source, endpoint, zeroCostMode });

  // Asked for Higgsfield by name (phase 4b): one Miya step that asks with the estimate. Checked first:
  // "a Higgsfield video for my channel" also fits the content video template.
  const { askHiggsfieldByName } = await import('../contentFactory/higgsfieldByName');
  const higgsfield = await askHiggsfieldByName({ text, source, onProgress, allowPaidModels: input.allowPaidModels });
  if (higgsfield) return higgsfield;

  // From Chat, a content video becomes a Miya Studio project run as one request
  // (phase 6b, owner). "Plan this fresh" still plans it. Checked before the
  // shortcuts: the creative one would answer "videos aren't available" first.
  if (source === 'user' && !planFresh) {
    const best = scoreTemplateFit(text)[0];
    // Only a request to make something; naming YouTube in a question isn't one (agent phase 2).
    if (best?.templateId === 'content_video' && best.score >= TEMPLATE_FIT_THRESHOLD && asksToMake(text)) {
      const { startContentProjectFromChat } = await import('../contentFactory/contentFromChat');
      const started = await startContentProjectFromChat(text, savedOutputFolder());
      return { ok: started.ok, reason: started.ok ? undefined : started.note, contentProjectId: started.projectId || null, plan: null, planNote: started.note };
    }
  }

  const shortcut = await runPipelineShortcuts({ commandText: text, onProgress });
  // A picture is Miya's work: one step of hers, like any other (agent roles Part A).
  if (shortcut?.kind === 'image_step') {
    return submitStepsToJose({
      text, source, endpoint, zeroCostMode, onProgress, allowPaidModels: input.allowPaidModels,
      label: source === 'user' ? 'Picture asked for in Chat.' : 'Picture asked for.',
      steps: [IMAGE_STEP],
    });
  }
  if (shortcut) return { ...shortcut, plan: null, planNote: '' };

  onProgress?.({ stage: 'planning' });
  const allowPaidModels = input.allowPaidModels !== false;
  const planned: JosePlan = await planJoseRequest(text, { planFresh, history, allowPaidModels, templateId: input.templateId });
  // Sentinel looks without being asked (agent phase 4): his checks join every plan.
  const secured = addSecurityChecks(planned.steps, text);
  const plan: JosePlan = { ...planned, steps: secured.steps };
  const planNote = [noteFor(plan), securityNote(secured)].filter(Boolean).join(' ');
  onProgress?.({ stage: 'planned', plan, planNote });

  // Bigger requests show their plan first (phase 3): saved to wait for the user.
  if (needsPlanApproval(plan.steps, input.showPlanFirst)) {
    const request = createWaitingPlanRequest({
      text, source, kind: plan.kind, steps: plan.steps,
      plan: { source: plan.source, templateId: plan.templateId, note: plan.note },
      runOptions: { source, previewMode, zeroCostMode, endpoint, allowPaidModels },
    });
    return { ok: true, waitingForPlan: true, requestId: request.id, plan, planNote, executedCount: 0, pendingApprovalCount: 0, failedCount: 0, executionReceipts: [] };
  }

  // Every plan, the simple one too, runs as explicit steps (phase 3), so a
  // failed step stops the steps that need it.
  const result = await runJoseCommandExecutionPipeline({
    commandText: text, source, endpoint, zeroCostMode, previewMode, onProgress, onToken, conversationHistory: history,
    allowPaidModels,
    assignments: toAssignments(plan.steps, planNote),
    requestKind: plan.kind,
    planInfo: { source: plan.source, templateId: plan.templateId, note: plan.note },
  });
  return { ...result, plan, planNote: withNotes(planNote, result), requestId: result?.commandId ? `jose-request-${result.commandId}` : null };
}

/**
 * Run steps a caller already decided (Boardroom, a workflow, the batch
 * orchestrator; phase 6a) as a request like any other: checked against the
 * rules first, saved, approvals by effect, shown on the board with the label.
 */
export async function submitStepsToJose(input: {
  text: string;
  source: string;
  steps: PlanStep[];
  label: string;
  kind?: 'normal' | 'project';
  endpoint?: string;
  zeroCostMode?: boolean;
  allowPaidModels?: boolean;
  /** False when the caller keeps its own record (the content factory, phase 6b). */
  saveDecisions?: boolean;
  onProgress?: (event: any) => void;
}): Promise<any> {
  // Steps saved before 2026-10-24 go to their current owner (agent roles Part A).
  const ownedSteps = toCurrentOwners(input.steps);
  const secured = addSecurityChecks(ownedSteps.steps, input.text);
  const owned = { ...ownedSteps, steps: secured.steps, notes: [...ownedSteps.notes, securityNote(secured)].filter(Boolean) };
  const check = checkPlan(owned.steps, { taskTypes: true });
  if (!check.ok) return { ok: false, reason: 'plan_rejected', problems: check.problems, plan: null, planNote: '' };
  const plan: JosePlan = { steps: owned.steps, source: 'given', templateId: null, kind: input.kind || 'normal', note: input.label };
  const planNote = [input.label, ...owned.notes].join(' ');
  const result = await runJoseCommandExecutionPipeline({
    commandText: input.text,
    source: input.source,
    endpoint: input.endpoint,
    zeroCostMode: input.zeroCostMode,
    previewMode: false,
    onProgress: input.onProgress,
    allowPaidModels: input.allowPaidModels !== false,
    saveDecisions: input.saveDecisions !== false,
    assignments: toAssignments(owned.steps, planNote),
    requestKind: plan.kind,
    planInfo: { source: 'given', templateId: null, note: input.label },
  });
  return { ...result, plan, planNote: withNotes(planNote, result), requestId: result?.commandId ? `jose-request-${result.commandId}` : null };
}

function planOf(request: JoseRequest, steps: PlanStep[]): JosePlan {
  return {
    steps,
    source: (request.plan?.source as JosePlan['source']) || 'fresh',
    templateId: request.plan?.templateId ?? null,
    kind: request.kind,
    note: request.plan?.note || '',
  };
}

/** Run a plan the user approved (from Chat or the board). Runs once; a cancelled plan never runs. */
export async function runApprovedPlan(requestId: string, options: { onProgress?: (event: any) => void; onToken?: (tokenData: any) => void; history?: { role: string; content: string }[] } = {}): Promise<any> {
  const request = claimPlanForRun(requestId);
  if (!request) return { ok: false, reason: 'This plan is no longer waiting.' };
  // Every plan field (model, reviewOf, …), not the step's run state (phase 5:
  // a plan you approved first lost its reviews and models).
  const saved: PlanStep[] = request.steps.map(({ status: _status, error: _error, startedAtMs: _started, endedAtMs: _ended, verdict: _verdict, ...step }) => step);
  // A plan waiting since before 2026-10-24 runs with each step at its current owner.
  const { steps, notes } = toCurrentOwners(saved);
  for (const note of notes) appendRequestNote(requestId, note);
  const plan = planOf(request, steps);
  const edited = (request.changeLog || []).some((entry) => entry.text !== 'Cancelled.');
  const planNote = [noteFor(plan), edited ? 'You edited the plan.' : ''].filter(Boolean).join(' ');
  const check = checkPlan(steps, { taskTypes: true });
  if (!check.ok) {
    returnPlanToWaiting(requestId, `Not run: ${check.problems[0]}`);
    return { ok: false, reason: 'plan_rejected', problems: check.problems, plan, planNote };
  }
  const run = request.runOptions || { source: request.source };
  const result = await runJoseCommandExecutionPipeline({
    commandText: request.text,
    source: run.source,
    endpoint: run.endpoint,
    zeroCostMode: run.zeroCostMode,
    previewMode: run.previewMode,
    onProgress: options.onProgress,
    onToken: options.onToken,
    conversationHistory: options.history,
    allowPaidModels: run.allowPaidModels !== false,
    assignments: toAssignments(steps, planNote),
    requestKind: request.kind,
    planInfo: request.plan || null,
    existingRequestId: requestId,
  });
  return { ...result, plan, planNote: withNotes(planNote, result), requestId };
}

/** Cancel a plan that is waiting. */
export function cancelPlan(requestId: string): JoseRequest {
  return cancelJoseRequest(requestId);
}
