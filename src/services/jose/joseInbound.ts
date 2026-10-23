// One entry for a message from anywhere (phase 6a): Telegram, WhatsApp, the
// phone, schedules, the Orchestrator page. Jose decides as he does for Chat:
// a direct answer from Alphonso's model, or a request through submitToJose().
import { decideJoseRoute } from './joseDecision';
import { submitToJose } from './submitToJose';
import { generateAgentLlmResponse } from '../../lib/ollama';
import { CHAT_ASSISTANT_PROMPT } from '../../lib/chatUtils';
import type { PlanFirstSetting } from './josePlanApproval';

export interface AnswerOrPlanOptions {
  source: string;
  history?: { role: string; content: string }[];
  endpoint?: string;
  zeroCostMode?: boolean;
  showPlanFirst?: PlanFirstSetting;
  allowPaidModels?: boolean;
  onProgress?: (event: any) => void;
}

export type AnswerOrPlanResult =
  | { kind: 'answer'; text: string }
  | { kind: 'request'; requestId: string | null; waitingForPlan: boolean; result: any };

export async function answerOrPlan(text: string, options: AnswerOrPlanOptions): Promise<AnswerOrPlanResult> {
  const decision = await decideJoseRoute(text, { history: options.history });
  if (decision.route === 'direct') {
    const reply: any = await generateAgentLlmResponse('alphonso', {
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      prompt: `${CHAT_ASSISTANT_PROMPT}\n\nUser: ${text}\nAlphonso:`,
    });
    const answer = String(reply?.response || '').trim();
    if (!answer) throw new Error('The model returned an empty reply.');
    return { kind: 'answer', text: answer };
  }
  const result = await submitToJose({
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
  return { kind: 'request', requestId: result?.requestId ?? null, waitingForPlan: Boolean(result?.waitingForPlan), result };
}
