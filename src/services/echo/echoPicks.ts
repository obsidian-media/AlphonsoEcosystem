// The buttons' work for Echo's waiting steps (agent phase 7), the way pickAlphonsoProject does it:
// pick which decision to forget, or apply / dismiss a cleanup, then carry the request on.
import { appendRequestNote, getJoseRequest, updateJoseStep } from '../jose/joseRequestStore';
import { getDecision } from './decisions';
import { applyCleanup, dismissCleanup, getCleanup } from './cleanup';

const ALREADY = { ok: false, summary: 'Already done.' };

function waitingStep(requestId: string, stepId: string): any | null {
  const request: any = getJoseRequest(requestId);
  if (!request || request.status !== 'waiting_setup') return null;
  const step = request.steps?.find((s: any) => s.stepId === stepId);
  return step && step.status === 'setup_needed' ? step : null;
}

async function carryOn(requestId: string): Promise<void> {
  const { carryOnRequest } = await import('../joseExecutionEngineService');
  await carryOnRequest(requestId);
}

export async function pickForget(requestId: string, stepId: string, decisionId: string): Promise<{ ok: boolean; summary: string }> {
  const step = waitingStep(requestId, stepId);
  const choice = (step?.decisionChoices || []).find((c: any) => c?.id === decisionId);
  if (!choice) return ALREADY;
  const text = getDecision(decisionId)?.text || choice.text;
  updateJoseStep(requestId, stepId, { forgetId: decisionId, decisionChoices: undefined } as never);
  appendRequestNote(requestId, `You chose to forget: ${text}`);
  await carryOn(requestId);
  return { ok: true, summary: `Forgot: ${text}` };
}

export async function applyCleanupStep(requestId: string, stepId: string, proposalIds?: string[]): Promise<{ ok: boolean; summary: string }> {
  const step = waitingStep(requestId, stepId);
  const set = step?.cleanupSetId ? getCleanup(String(step.cleanupSetId)) : null;
  if (!set || set.status !== 'open') return ALREADY;
  const { applied } = applyCleanup(set.id, proposalIds || set.proposals.map((p) => p.id));
  appendRequestNote(requestId, `You applied ${applied} changes to memory.`);
  await carryOn(requestId);
  return { ok: true, summary: `Applied ${applied} changes to memory.` };
}

export async function dismissCleanupStep(requestId: string, stepId: string): Promise<{ ok: boolean; summary: string }> {
  const step = waitingStep(requestId, stepId);
  const set = step?.cleanupSetId ? getCleanup(String(step.cleanupSetId)) : null;
  if (!set || set.status !== 'open') return ALREADY;
  dismissCleanup(set.id);
  appendRequestNote(requestId, 'You left memory as it is.');
  await carryOn(requestId);
  return { ok: true, summary: 'Left memory as it is.' };
}
