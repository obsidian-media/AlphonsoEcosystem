// One entry for a message from anywhere (phase 6a): Telegram, WhatsApp, the
// phone, schedules, the Orchestrator page. Jose decides as he does for Chat:
// a direct answer from Alphonso's model, or a request through submitToJose().
import { decideJoseRoute } from './joseDecision';
import { submitToJose } from './submitToJose';
import { generateAgentLlmResponse } from '../../lib/ollama';
import { ALPHONSO_ANSWER_PROMPT } from '../alphonso/answerPrompt';
import type { PlanFirstSetting } from './josePlanApproval';

export interface AnswerOrPlanOptions {
  source: string;
  history?: { role: string; content: string }[];
  endpoint?: string;
  zeroCostMode?: boolean;
  showPlanFirst?: PlanFirstSetting;
  allowPaidModels?: boolean;
  onProgress?: (event: any) => void;
  /**
   * Start a planned request and return at once (a channel that also handles
   * other messages and button presses while the request runs).
   */
  background?: boolean;
}

export type AnswerOrPlanResult =
  | { kind: 'answer'; text: string }
  | { kind: 'request'; requestId: string | null; waitingForPlan: boolean; result: any }
  | { kind: 'started'; done: Promise<any> };

/** The answer's prompt: his instructions, the last 6 messages, then the message (agent phase 6). */
function answerPromptWithHistory(text: string, history: unknown): string {
  const turns = (Array.isArray(history) ? history : [])
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
    .slice(-6)
    .map((m: any) => `${m.role === 'user' ? 'User' : 'Alphonso'}: ${String(m.content).slice(0, 2000)}`);
  return [ALPHONSO_ANSWER_PROMPT, ...turns, `User: ${text}\nAlphonso:`].join('\n\n');
}

export async function answerOrPlan(text: string, options: AnswerOrPlanOptions): Promise<AnswerOrPlanResult> {
  const decision = await decideJoseRoute(text, { history: options.history });
  if (decision.route === 'direct') {
    const reply: any = await generateAgentLlmResponse('alphonso', {
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      prompt: answerPromptWithHistory(text, options.history),
    });
    const answer = String(reply?.response || '').trim();
    if (!answer) throw new Error('The model returned an empty reply.');
    return { kind: 'answer', text: answer };
  }
  const run = submitToJose({
    text,
    source: options.source,
    history: options.history,
    endpoint: options.endpoint,
    zeroCostMode: options.zeroCostMode,
    previewMode: false,
    onProgress: options.onProgress,
    ...(options.showPlanFirst ? { showPlanFirst: options.showPlanFirst } : {}),
    ...(options.allowPaidModels === false ? { allowPaidModels: false } : {}),
  });
  if (options.background) return { kind: 'started', done: run };
  const result = await run;
  return { kind: 'request', requestId: result?.requestId ?? null, waitingForPlan: Boolean(result?.waitingForPlan), result };
}

/** What a channel says back right away. */
export function inboundReply(result: AnswerOrPlanResult, channel: string): string {
  if (result.kind === 'answer') return result.text;
  return channel === 'telegram'
    ? "Jose is on it. I'll tell you when it's done, or when something needs you."
    : "Jose is on it. I'll tell you when it's done.";
}

/** One line for how a request ended, for a channel without Jose's own messages (WhatsApp). */
export function outcomeLine(result: any): string {
  if (result?.waitingForPlan) return "Jose's plan is waiting for you on the board in the app.";
  if (result?.reason === 'plan_rejected') return `Jose couldn't run it: ${(result.problems || []).join(' ')}`;
  if (Number(result?.pendingApprovalCount) > 0) return 'A step is waiting for your approval in the app.';
  if (Number(result?.failedCount) > 0) return 'Finished, but a step failed. See the board in the app.';
  if (result?.ok === false) return `Jose couldn't run it: ${result?.reason || 'it failed.'}`;
  return 'Done.';
}
