// Boardroom's thread actions as Jose requests (phase 6a): Conclude is one
// Maria review step, Distribute one Marcus step (posting to Slack sends, so it
// waits for your approval), Creative brief one Miya step. Each shows on the
// Requests board with the label below.
import { submitStepsToJose, submitToJose } from './jose/submitToJose';
import { ruleRoute } from './jose/joseDecision';
import { getJoseRequest } from './jose/joseRequestStore';
import { closingSummary } from './jose/joseSummary';
import { outcomeLine } from './jose/joseInbound';
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

// ── Work asked for in a thread (2.11.0 QA, owner 2026-11-01) ──────────────────
// Agents in a thread only talk: Hector said "I'll research…" and never could, and "/jose" was
// answered by Alphonso. Work asked for in a thread is a real Jose request instead.

/**
 * The work a thread message asks Jose for, or null for discussion: "/jose …", or anything the
 * rules plan without a model (research, look up, several kinds of work, …), after any leading
 * @mentions. Discussion is never sent to Jose's model to decide.
 */
export function workRequestIn(text: string, agentNames: string[]): string | null {
  let rest = String(text || '').trim();
  const names = agentNames.map((n) => n.toLowerCase());
  for (;;) {
    const m = rest.match(/^@([\w-]+)[,:]?\s*/);
    if (!m || !names.includes(m[1].toLowerCase())) break;
    rest = rest.slice(m[0].length);
  }
  const explicit = rest.match(/^\/jose\b\s*/i);
  if (explicit) return rest.slice(explicit[0].length).trim() || null;
  return ruleRoute(rest)?.route === 'plan' ? rest : null;
}

/** Runs it as a Jose request; the result is Jose's closing summary, or why it waits or stopped. */
export async function workOnJose(
  text: string,
  options: { onStarted?: (requestId: string) => void; history?: { role: string; content: string }[] } = {},
): Promise<{ requestId: string | null; waiting: boolean; summary: string }> {
  const result = await submitToJose({
    text,
    source: 'boardroom',
    history: options.history,
    onProgress: (event: any) => {
      if (event?.stage === 'request_started' && typeof event.requestId === 'string') options.onStarted?.(event.requestId);
    },
  });
  const requestId: string | null = result?.requestId || null;
  const waiting = Boolean(result?.waitingForPlan) || Number(result?.pendingApprovalCount || 0) > 0;
  const request = requestId && !waiting ? getJoseRequest(requestId) : null;
  return { requestId, waiting, summary: request ? closingSummary(request) : outcomeLine(result) };
}
