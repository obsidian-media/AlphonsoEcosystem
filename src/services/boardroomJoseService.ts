// Boardroom's thread actions as Jose requests (phase 6a): Conclude is one
// Maria review step, Distribute one Marcus step (posting to Slack sends, so it
// waits for your approval), Creative brief one Miya step. Each shows on the
// Requests board with the label below.
import { submitStepsToJose } from './jose/submitToJose';
import { getStepOutput } from './jose/joseStepOutputs';
import type { PlanStep } from './jose/stepGraph';

export const BOARDROOM_LABEL = 'Steps set by Boardroom.';

export interface BoardroomReview {
  riskLevel: string;
  approvalRequired: boolean;
  summary: string;
  confidenceLevel?: string;
}

async function runOne(text: string, step: PlanStep) {
  const result = await submitStepsToJose({ text, source: 'boardroom', label: BOARDROOM_LABEL, steps: [step] });
  const commandId: string | null = result?.commandId || null;
  return {
    result,
    commandId,
    requestId: (result?.requestId as string | null) || null,
    waiting: Number(result?.pendingApprovalCount || 0) > 0,
  };
}

export async function concludeOnJose(topic: string, transcript: string): Promise<{ requestId: string | null; review: BoardroomReview | null; waiting?: boolean }> {
  const { commandId, requestId, waiting } = await runOne(`Boardroom discussion: ${topic}\n\n${transcript}`, {
    stepId: 'maria', agent: 'maria', actionType: 'audit_governance', effects: ['read'], needs: [],
    instruction: `Review this Boardroom discussion about "${topic}": its risk, and whether anything needs approval before it is sent out.`,
  });
  // Reading can be set to ask first (Settings → Approvals); then her step waits.
  if (waiting) return { requestId, review: null, waiting: true };
  const schema: any = commandId ? getStepOutput(commandId, 'maria')?.schema : null;
  if (!schema?.riskLevel) return { requestId, review: null };
  return {
    requestId,
    review: {
      riskLevel: String(schema.riskLevel),
      approvalRequired: Boolean(schema.approvalRequired),
      summary: String(schema.summary || '').trim(),
      confidenceLevel: schema.confidenceLevel,
    },
  };
}

export async function distributeOnJose(
  topic: string,
  summary: string,
  mode: 'review' | 'slack',
  channel: string,
): Promise<{ requestId: string | null; waiting: boolean; summary: string }> {
  const text = `Boardroom: ${topic}\n${summary}`;
  const step: PlanStep = mode === 'slack'
    ? { stepId: 'marcus', agent: 'marcus', actionType: 'distribution_slack', effects: ['publish_or_send'], needs: [], instruction: `Post the Boardroom conclusion to Slack ${channel}.`, payload: { channel, text } }
    : { stepId: 'marcus', agent: 'marcus', actionType: 'distribution_review', effects: ['read'], needs: [], instruction: 'Review where this Boardroom conclusion could go. Send nothing.' };
  const { commandId, requestId, waiting } = await runOne(text, step);
  const output = !waiting && commandId ? getStepOutput(commandId, 'marcus') : null;
  return { requestId, waiting, summary: String(output?.summary || '').trim() };
}

export async function creativeBriefOnJose(topic: string, context: string): Promise<{ requestId: string | null; waiting: boolean; summary: string }> {
  const { commandId, requestId, waiting } = await runOne(`Creative brief for: ${topic}`, {
    stepId: 'miya', agent: 'miya', actionType: 'creative_brief', effects: ['write_own_work'], needs: [],
    instruction: `Write a creative brief for: ${topic}\nContext: ${context}`,
  });
  const output = !waiting && commandId ? getStepOutput(commandId, 'miya') : null;
  return { requestId, waiting, summary: String(output?.summary || '').trim() };
}
