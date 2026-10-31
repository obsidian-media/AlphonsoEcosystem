// What a paired phone may ask the computer to do (phone app, phase 1), each mapped to the
// computer's own function, the same one the board or Telegram uses. Nothing else is
// possible from a phone. The computer still decides: approvals, the monthly cap, Zero-Cost
// Mode and Approval Mode are checked by the engine when a step runs, exactly as on the
// desktop.
import { getJoseRequest } from '../jose/joseRequestStore';
import { appendPhoneChat, listPhoneChat } from './phoneChatLog';
import { mirrorSnapshots } from './phoneMirror';
import type { PhoneCallName, PhoneMessage } from './phoneProtocol';

export const NOT_FROM_PHONE = 'Not available from the phone yet.';
export const ALREADY_DONE = 'Already done.';
const SEEN_LIMIT = 500;

type Args = Record<string, unknown>;
type Call = (args: Args, fromDeviceId: string) => Promise<unknown>;

let claimed = new Set<string>();
let seenMessages = new Map<string, Promise<unknown>>();
export function resetPhoneCallsForTests(): void { claimed = new Set(); seenMessages = new Map(); }

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const quietly = (p: Promise<unknown>) => { p.catch(() => { /* the request shows what happened */ }); };
const engine = () => import('../joseExecutionEngineService');

function waitingStep(requestId: string, stepId: string) {
  const request = getJoseRequest(requestId);
  const step = request?.steps.find((s) => s.stepId === stepId);
  return request && request.status === 'waiting_approval' && step?.status === 'waiting_approval' ? { request, step } : null;
}

async function answerChat(text: string, messageId: string): Promise<unknown> {
  const history = listPhoneChat().slice(-6).map((m) => ({ role: m.role, content: m.text }));
  appendPhoneChat({ role: 'user', text, id: messageId });
  const { answerOrPlan, inboundReply, outcomeLine } = await import('../jose/joseInbound');
  const result = await answerOrPlan(text, { source: 'phone', history, background: true });
  const reply = inboundReply(result, 'phone');
  appendPhoneChat({ role: 'assistant', text: reply });
  if (result.kind === 'started' && typeof outcomeLine === 'function') {
    result.done.then((done) => appendPhoneChat({ role: 'assistant', text: outcomeLine(done), requestId: done?.requestId || undefined })).catch(() => undefined);
  }
  return { messageId, reply };
}

export const PHONE_CALLS: Record<PhoneCallName, Call> = {
  'chat.send': async (args) => {
    const text = str(args.text).trim();
    const messageId = str(args.messageId);
    if (!text || !messageId) throw new Error('Nothing to send.');
    // A message sent again (the link dropped before the answer arrived) is answered once.
    const known = seenMessages.get(messageId);
    if (known) return known;
    const answer = answerChat(text.slice(0, 8000), messageId);
    seenMessages.set(messageId, answer);
    if (seenMessages.size > SEEN_LIMIT) seenMessages.delete(seenMessages.keys().next().value as string);
    return answer;
  },
  'request.approveStep': async (args) => {
    const requestId = str(args.requestId);
    const stepId = str(args.stepId);
    const key = `${requestId}/${stepId}`;
    const found = waitingStep(requestId, stepId);
    if (!found || claimed.has(key)) return ALREADY_DONE;
    claimed.add(key);
    if ((found.step as { hermesApproval?: unknown }).hermesApproval) {
      const { answerHermesApproval } = await import('../hermes/hermesApprovals');
      return (await answerHermesApproval(requestId, stepId, true)).summary;
    }
    const { approveRequestStep } = await engine();
    quietly(approveRequestStep(requestId, stepId));
    return 'Approved. It carries on.';
  },
  'request.rejectStep': async (args) => {
    const requestId = str(args.requestId);
    const stepId = str(args.stepId);
    const key = `${requestId}/${stepId}`;
    if (!waitingStep(requestId, stepId) || claimed.has(key)) return ALREADY_DONE;
    claimed.add(key);
    const { rejectRequestStep } = await engine();
    const result = rejectRequestStep(requestId, stepId);
    return result.ok ? 'Rejected. The request was cancelled.' : result.summary;
  },
  'request.stop': async (args) => {
    const { stopRequest } = await import('../jose/joseStop');
    return stopRequest(str(args.requestId)).summary;
  },
  'request.carryOn': async (args) => {
    const requestId = str(args.requestId);
    const status = getJoseRequest(requestId)?.status;
    if (status !== 'interrupted' && status !== 'waiting_setup' && status !== 'queued') return ALREADY_DONE;
    const { carryOnRequest } = await engine();
    quietly(carryOnRequest(requestId));
    return 'Carrying on.';
  },
  'request.cancel': async (args) => {
    const { cancelRequest } = await engine();
    return cancelRequest(str(args.requestId)).summary;
  },
  'plan.run': async (args) => {
    const requestId = str(args.requestId);
    if (getJoseRequest(requestId)?.status !== 'waiting_plan_approval') return ALREADY_DONE;
    const { runApprovedPlan } = await import('../jose/submitToJose');
    quietly(runApprovedPlan(requestId));
    return 'Running the plan.';
  },
  'plan.cancel': async (args) => {
    const requestId = str(args.requestId);
    if (getJoseRequest(requestId)?.status !== 'waiting_plan_approval') return ALREADY_DONE;
    const { cancelPlan } = await import('../jose/submitToJose');
    cancelPlan(requestId);
    return 'Plan cancelled.';
  },
  // The phone asks for everything when it connects, and replaces what it had.
  'mirror.snapshot': async () => mirrorSnapshots(),
};

export async function handlePhoneCall(msg: Extract<PhoneMessage, { kind: 'call' }>, fromDeviceId: string): Promise<unknown> {
  const call = Object.prototype.hasOwnProperty.call(PHONE_CALLS, msg.name) ? PHONE_CALLS[msg.name] : null;
  if (!call) throw new Error(NOT_FROM_PHONE);
  const args = msg.args && typeof msg.args === 'object' ? (msg.args as Args) : {};
  return call(args, fromDeviceId);
}
