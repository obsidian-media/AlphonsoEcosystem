// Every send from outside a Jose request is one Marcus step (agent phase 5): Project Execution's
// Marcus panel, its old handoff packets, a workflow's Publishing task, old scheduled sends. The
// step is prepared, shown with the exact text, approved once and checked by Sentinel first.
import { submitStepsToJose } from '../jose/submitToJose';
import type { PlanStep } from '../jose/stepGraph';
import type { SendKind } from './types';

export const MARCUS_LABEL = (source: string) => `Steps set by ${source}.`;
export const NOTHING_TO_PUBLISH = 'Nothing to publish: this workflow writes no post. Ask Jose to write and post it.';

export interface AskMarcus {
  text: string;
  connector?: string;
  target?: string;
  kind?: SendKind;
  title?: string;
  /** Who asked, for the request's label: "Project Execution", "Content Empire", "Marcus's schedule". */
  source: string;
}

const TASK_TYPE: Partial<Record<SendKind, string>> = { release: 'distribution_release', issue: 'distribution_issue' };

export async function askMarcusToSend(ask: AskMarcus): Promise<{ ok: boolean; requestId?: string; reason?: string }> {
  const text = String(ask.text || '').trim();
  if (!text) return { ok: false, reason: 'Nothing to send: there is no text.' };
  const payload: Record<string, unknown> = { text };
  if (ask.connector) payload.connector = ask.connector;
  if (ask.target) payload.target = ask.target;
  if (ask.kind) payload.kind = ask.kind;
  if (ask.title) payload.title = ask.title;
  const where = ask.target ? `${ask.connector ? `${ask.connector} ` : ''}${ask.target}` : ask.connector || 'where it should go';
  const step: PlanStep & { payload: Record<string, unknown> } = {
    stepId: 'marcus',
    agent: 'marcus',
    actionType: (ask.kind && TASK_TYPE[ask.kind]) || 'distribution_execution',
    instruction: `Send this to ${where}.`,
    effects: ['publish_or_send'],
    needs: [],
    payload,
  };
  try {
    const result: any = await submitStepsToJose({ text: `Send to ${where}: ${text.slice(0, 200)}`, source: 'marcus', label: MARCUS_LABEL(ask.source), steps: [step] });
    const requestId = result?.requestId || (result?.commandId ? `jose-request-${result.commandId}` : undefined);
    if (result?.ok === false && !requestId) return { ok: false, reason: String(result?.reason || (result?.problems || []).join(' ') || 'It could not be set up.') };
    return { ok: true, ...(requestId ? { requestId } : {}) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
