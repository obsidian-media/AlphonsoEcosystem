// Placing a CALL-E call is Marcus's outreach (agent roles Part A, owner
// 2026-10-24): one Marcus step that sends and spends, so it asks like every
// send, shows on the board and on Telegram. Planning a call (plan_call) stays a
// conversation in Chat. The escalation service's calls are not outreach: they
// call you about an approval, which is Jose's approval channel.
import { submitStepsToJose } from './jose/submitToJose';
import type { PlanStep } from './jose/stepGraph';

export type CallToPlace = { kind: 'rest'; recordId: string } | { kind: 'mcp'; chatId: string };

export const CALL_LABEL = 'Call set up in CALL-E.';

/** Ask Marcus to place the call; it waits for your approval like any send. */
export async function askMarcusToCall(call: CallToPlace, summary: string): Promise<any> {
  const step: PlanStep & { payload: CallToPlace } = {
    stepId: 'call', agent: 'marcus', actionType: 'outreach_call',
    instruction: `Place the call: ${String(summary || 'the call set up in CALL-E').slice(0, 200)}`,
    effects: ['publish_or_send', 'spend'], needs: [], payload: call,
  };
  return submitStepsToJose({ text: summary || 'Place the call set up in CALL-E.', source: 'calle', label: CALL_LABEL, steps: [step] });
}

/** Marcus places the approved call (the engine runs this for an outreach_call step). */
export async function executeOutreachCall(assignment: any): Promise<{ summary: string; resultState: string; resultUrl: null; artifacts: unknown[]; sources: string[]; contractAction: string }> {
  const base = { resultUrl: null, artifacts: [] as unknown[], sources: [] as string[], contractAction: 'outreach_call' };
  const effects: string[] = Array.isArray(assignment?.effects) ? assignment.effects : [];
  if (!effects.includes('publish_or_send') || !effects.includes('spend')) {
    return { ...base, summary: 'Not placed: a call needs your approval to send and to spend.', resultState: 'failed' };
  }
  const call = assignment?.payload as CallToPlace | undefined;
  try {
    if (call?.kind === 'rest' && call.recordId) {
      const { runOutreachCall } = await import('./calleOutreachService');
      const record: any = await runOutreachCall(call.recordId, { approved: true });
      return { ...base, summary: `Marcus placed the call (${String(record?.status || 'started').replace(/_/g, ' ')}).`, resultState: 'completed' };
    }
    if (call?.kind === 'mcp' && call.chatId) {
      const { confirmMcpOutreachCall } = await import('./calleMcpOutreachService');
      return { ...base, summary: await confirmMcpOutreachCall(call.chatId), resultState: 'completed' };
    }
  } catch (error) {
    return { ...base, summary: `The call was not placed: ${error instanceof Error ? error.message : String(error)}`, resultState: 'failed' };
  }
  return { ...base, summary: 'Not placed: the call to place was not found.', resultState: 'failed' };
}
