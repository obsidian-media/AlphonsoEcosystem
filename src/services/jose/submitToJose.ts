// The one entry point for asking Jose to do something (phase 2, 2026-10-23).
// Shortcuts first (an image request, a named workflow), then Jose's plan. A
// plan from the model or a template runs as explicit steps on the step graph;
// the simple rule-based plan runs through the old path unchanged.
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §4, §9
import { runJoseCommandExecutionPipeline, runPipelineShortcuts } from '../joseExecutionEngineService';
import { describePlanSource, planJoseRequest, type JosePlan } from './josePlanner';
import { needsPlanApproval, type PlanFirstSetting } from './josePlanApproval';
import { cancelJoseRequest, claimPlanForRun, createWaitingPlanRequest, returnPlanToWaiting, type JoseRequest } from './joseRequestStore';
import { checkPlan, type PlanStep } from './stepGraph';

export const CONTENT_VIDEO_STUDIO_NOTE = 'For the full project with pictures and a saved folder, open Miya Studio.';

const AGENT_NAMES: Record<string, string> = {
  alphonso: 'Alphonso', jose: 'Jose', miya: 'Miya', hector: 'Hector', maria: 'Maria',
  marcus: 'Marcus', echo: 'Echo', sentinel: 'Sentinel', nova: 'Nova',
};

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
    title: `${AGENT_NAMES[step.agent] || step.agent} ${step.actionType}`,
    rationale: planNote,
    riskLevel: 'low',
    requiresApproval: false,
    commandPreview: step.instruction || '',
    fragments: [],
  }));
}

export async function submitToJose(input: SubmitToJoseInput): Promise<any> {
  const { text, source, history, planFresh, endpoint, zeroCostMode, previewMode, onProgress, onToken } = input;

  const shortcut = await runPipelineShortcuts({ commandText: text, onProgress });
  if (shortcut) return { ...shortcut, plan: null, planNote: '' };

  onProgress?.({ stage: 'planning' });
  const plan: JosePlan = await planJoseRequest(text, { planFresh, history });
  const planNote = noteFor(plan);
  onProgress?.({ stage: 'planned', plan, planNote });

  // Bigger requests show their plan first (phase 3): saved to wait for the user.
  if (needsPlanApproval(plan.steps, input.showPlanFirst)) {
    const request = createWaitingPlanRequest({
      text, source, kind: plan.kind, steps: plan.steps,
      plan: { source: plan.source, templateId: plan.templateId, note: plan.note },
      runOptions: { source, previewMode, zeroCostMode, endpoint },
    });
    return { ok: true, waitingForPlan: true, requestId: request.id, plan, planNote, executedCount: 0, pendingApprovalCount: 0, failedCount: 0, executionReceipts: [] };
  }

  // Every plan, the simple one too, runs as explicit steps (phase 3), so a
  // failed step stops the steps that need it.
  const result = await runJoseCommandExecutionPipeline({
    commandText: text, source, endpoint, zeroCostMode, previewMode, onProgress, onToken, conversationHistory: history,
    assignments: toAssignments(plan.steps, planNote),
    requestKind: plan.kind,
    planInfo: { source: plan.source, templateId: plan.templateId, note: plan.note },
  });
  return { ...result, plan, planNote, requestId: result?.commandId ? `jose-request-${result.commandId}` : null };
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
  const steps: PlanStep[] = request.steps.map(({ stepId, agent, actionType, effects, needs, instruction }) => ({ stepId, agent, actionType, effects, needs, instruction }));
  const plan = planOf(request, steps);
  const edited = (request.changeLog || []).some((entry) => entry.text !== 'Cancelled.');
  const planNote = [noteFor(plan), edited ? 'You edited the plan.' : ''].filter(Boolean).join(' ');
  const check = checkPlan(steps);
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
    assignments: toAssignments(steps, planNote),
    requestKind: request.kind,
    planInfo: request.plan || null,
    existingRequestId: requestId,
  });
  return { ...result, plan, planNote, requestId };
}

/** Cancel a plan that is waiting. */
export function cancelPlan(requestId: string): JoseRequest {
  return cancelJoseRequest(requestId);
}
