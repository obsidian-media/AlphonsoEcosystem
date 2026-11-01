// Send back a waiting send with a reason (phone app phase 2, also on the board): the step
// whose text Marcus would send is redone as a fix round ("Fix what you were asked: …"), the
// send waits for the new version and asks you again with the new text. The plan changes
// inside the engine, the way review rounds are added: the request remembers what you sent
// back (`sentBack` on the waiting step) and the pipeline applies `sentBackChange()` when the
// request carries on. Limited to JOSE_LIMITS.maxFixRounds, like reviews.
import { agentName } from './agentNames';
import { getJoseRequest, updateJoseStep, appendRequestNote, type JoseRequestStep } from './joseRequestStore';
import { JOSE_LIMITS, type PlanStep } from './stepGraph';
import type { PlanChange } from './joseAdapt';

export const SEND_BACK_NOT_HERE = 'Only work an agent wrote can be sent back. Edit the text yourself, or approve or reject it.';
export type SentBack = { workStepId: string; reason: string; atMs: number };

function original(steps: Array<Pick<PlanStep, 'stepId' | 'revises'>>, workId: string) {
  const work = steps.find((s) => s.stepId === workId);
  return work?.revises || workId;
}

function nextRound(steps: Array<Pick<PlanStep, 'revises' | 'round'>>, originalId: string): number {
  return Math.max(0, ...steps.filter((s) => s.revises === originalId).map((s) => s.round || 0)) + 1;
}

export async function sendBackStep(requestId: string, stepId: string, reason: string): Promise<{ ok: boolean; summary: string }> {
  const request = getJoseRequest(requestId);
  const step = request?.steps.find((s) => s.stepId === stepId);
  if (!request || request.status !== 'waiting_approval' || step?.status !== 'waiting_approval') return { ok: false, summary: 'That step is no longer waiting.' };
  const why = String(reason || '').trim().slice(0, 2000);
  if (!why) return { ok: false, summary: 'Say what to change.' };
  const workStepId = step.sendPreview?.sourceStepId;
  const work = workStepId ? request.steps.find((s) => s.stepId === workStepId) : null;
  if (!work) return { ok: false, summary: SEND_BACK_NOT_HERE };
  if (nextRound(request.steps, original(request.steps, work.stepId)) > JOSE_LIMITS.maxFixRounds) {
    return { ok: false, summary: `It was already redone ${JOSE_LIMITS.maxFixRounds} times. Edit the text yourself, or approve or reject it.` };
  }
  updateJoseStep(requestId, stepId, { sentBack: { workStepId: work.stepId, reason: why, atMs: Date.now() }, sendPreview: undefined } as Partial<JoseRequestStep>);
  appendRequestNote(requestId, `You sent ${agentName(work.agent)}'s work back: ${why}`);
  const { resumeJoseRequest } = await import('../joseExecutionEngineService');
  void Promise.resolve(resumeJoseRequest(requestId)).catch(() => undefined);
  return { ok: true, summary: `Sent back to ${agentName(work.agent)}.` };
}

/** The plan change for a step sent back: a fix of the work, and the send waiting for it. */
export function sentBackChange(steps: PlanStep[], waiting: { stepId: string; sentBack?: SentBack }): PlanChange | null {
  const sent = waiting.sentBack;
  const work = sent ? steps.find((s) => s.stepId === sent.workStepId) : null;
  if (!sent || !work) return null;
  const firstId = original(steps, work.stepId);
  const first = steps.find((s) => s.stepId === firstId) || work;
  const round = nextRound(steps, firstId);
  const fix: PlanStep = {
    stepId: `${firstId}-fix-${round}`,
    agent: first.agent,
    actionType: first.actionType,
    effects: [...first.effects],
    needs: [work.stepId],
    instruction: `${first.instruction || ''}\n\nFix what you were asked: ${sent.reason}`.trim(),
    revises: firstId,
    round,
    ...(first.model ? { model: first.model } : {}),
    ...(first.contentStep ? { contentStep: first.contentStep } : {}),
  };
  return { add: [fix], rewire: { from: [work.stepId], to: [fix.stepId] }, reason: `You sent ${agentName(first.agent)}'s work back: ${sent.reason}` };
}
