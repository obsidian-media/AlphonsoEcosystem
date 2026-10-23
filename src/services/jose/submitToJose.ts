// The one entry point for asking Jose to do something (phase 2, 2026-10-23).
// Shortcuts first (an image request, a named workflow), then Jose's plan. A
// plan from the model or a template runs as explicit steps on the step graph;
// the simple rule-based plan runs through the old path unchanged.
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §4, §9
import { runJoseCommandExecutionPipeline, runPipelineShortcuts } from '../joseExecutionEngineService';
import { describePlanSource, planJoseRequest, type JosePlan } from './josePlanner';

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
}

export async function submitToJose(input: SubmitToJoseInput): Promise<any> {
  const { text, source, history, planFresh, endpoint, zeroCostMode, previewMode, onProgress, onToken } = input;

  const shortcut = await runPipelineShortcuts({ commandText: text, onProgress });
  if (shortcut) return { ...shortcut, plan: null, planNote: '' };

  onProgress?.({ stage: 'planning' });
  const plan: JosePlan = await planJoseRequest(text, { planFresh, history });
  const notes = [describePlanSource(plan)];
  if (plan.templateId === 'content_video') notes.push(CONTENT_VIDEO_STUDIO_NOTE);
  const planNote = notes.filter(Boolean).join(' ');
  onProgress?.({ stage: 'planned', plan, planNote });

  const common = { commandText: text, source, endpoint, zeroCostMode, previewMode, onProgress, onToken, conversationHistory: history };
  if (plan.source === 'rules') {
    const result = await runJoseCommandExecutionPipeline(common);
    return { ...result, plan, planNote };
  }

  const assignments = plan.steps.map((step) => ({
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
  const result = await runJoseCommandExecutionPipeline({
    ...common,
    assignments,
    requestKind: plan.kind,
    planInfo: { source: plan.source, templateId: plan.templateId, note: plan.note },
  });
  return { ...result, plan, planNote };
}
