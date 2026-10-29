// A Marcus send, prepared before it asks you (agent phase 5): the text, the destination and
// the length, so the approval shows exactly what goes where. A problem ends the step without
// asking anything: nothing to send, a connector to set up, or text too long for the channel.
import { buildStepInput } from '../jose/stepInput';
import { findExactRisks, exactRiskText } from '../sentinel/exactChecks';
import { CHANNEL_LIMITS } from './destinations';
import { hintFromTaskType, pickDestination } from './pickDestination';
import { NOTHING_TO_SEND, textToSend } from './sendText';
import { readSendTime } from './sendTime';
import { withoutQuotedContent } from '../jose/quotedContent';
import type { Destination, PrepareResult, SendPreview } from './types';

interface SendAssignment {
  stepId?: string;
  agent?: string;
  actionType?: string;
  effects?: string[];
  needs?: string[];
  payload?: Record<string, unknown>;
  contentStep?: unknown;
  instruction?: string;
}

const SERIOUS = new Set(['key', 'password_request', 'disguised_link']);

/** A step where Marcus sends something you approve (not a call, not the content factory's posting). */
export function isMarcusSendStep(assignment: SendAssignment | null | undefined): boolean {
  if (!assignment || String(assignment.agent || '').toLowerCase() !== 'marcus') return false;
  if (assignment.contentStep) return false;
  // The content factory's posting steps carry `contentStep` (above). A planned posting step
  // without it is an ordinary send, prepared before it asks (QA batch 0).
  if (assignment.actionType === 'outreach_call') return false;
  return Array.isArray(assignment.effects) && assignment.effects.includes('publish_or_send');
}

const count = (n: number) => n.toLocaleString('en-US');

export function tooLongReason(label: string, length: number, limit: number): string {
  return `Too long for ${label}: ${count(length)} characters; the limit is ${count(limit)}.`;
}

function given(payload: Record<string, unknown> | undefined): Partial<Destination> | undefined {
  if (!payload) return undefined;
  const pick: Partial<Destination> = {};
  if (typeof payload.connector === 'string' && payload.connector) pick.connector = payload.connector as Destination['connector'];
  if (typeof payload.target === 'string' && payload.target) pick.target = payload.target;
  // Boardroom's Slack step names its channel as `channel`.
  if (!pick.target && typeof payload.channel === 'string' && payload.channel) pick.target = payload.channel;
  if (typeof payload.kind === 'string' && payload.kind) pick.kind = payload.kind as Destination['kind'];
  if (typeof payload.title === 'string' && payload.title) pick.title = payload.title;
  return Object.keys(pick).length ? pick : undefined;
}

// A gap the writer left to fill (QA batch 1: a 7B model wrote "[placeholder] The check passed.").
// Only words that mark a gap count, so a link "[text](url)" or "[v2.10]" is sent as it is.
const GAP = /\[(?:placeholder|insert[^\]\n]{0,40}|your [^\]\n]{1,40}|[^\]\n]{0,30}\bname|date|time|link|url|tbd|todo|x{2,})\](?!\()/gi;

export function unfilledGaps(text: string): string[] {
  return [...new Set(String(text || '').match(GAP) || [])];
}

export function unfilledReason(gaps: string[]): string {
  return `Fill in ${gaps.join(', ')} before it is sent: use the request, or write it without that part.`;
}

/** A send time the request gives but doesn't make clear (agent roles Part C2). */
export const SEND_TIME_UNCLEAR = 'When should Marcus send it? Ask again with a day and time, like “tomorrow at 9”.';

export async function prepareMarcusSend(commandId: string, assignment: SendAssignment, request: { text: string } | null): Promise<PrepareResult> {
  const requestText = String(request?.text || '');
  // The words being sent (quoted, or after a colon) are the message: a time in them isn't when to send.
  const when = readSendTime(withoutQuotedContent(requestText), Date.now());
  if (when && 'unclear' in when) return { ok: false, outcome: 'failed', reason: SEND_TIME_UNCLEAR };
  const input = buildStepInput(commandId, assignment as never, requestText);
  const picked = textToSend(assignment, input);
  if (!picked) return { ok: false, outcome: 'failed', reason: NOTHING_TO_SEND };
  const hint = (assignment.payload?.connector as Destination['connector'] | undefined) || hintFromTaskType(assignment.actionType);
  const fixed = given(assignment.payload);
  if (fixed?.target && !fixed.connector && hint) fixed.connector = hint;
  // A destination set by the screen that asked (Boardroom's channel, the Marcus panel's field)
  // was chosen by you there, so it counts as named.
  const named = fixed?.target ? `${requestText} ${fixed.target}` : requestText;
  const where = await pickDestination(named, picked.text, { given: fixed, hint, actionType: assignment.actionType });
  if (where.ok === false) return { ok: false, outcome: where.outcome, reason: where.reason };
  const limit = CHANNEL_LIMITS[`${where.destination.connector}:${where.destination.kind}`];
  if (limit && picked.text.length > limit) {
    return { ok: false, outcome: 'fix', reason: tooLongReason(where.destination.label, picked.text.length, limit), sourceStepId: picked.sourceStepId };
  }
  // A gap goes back to the step he sends from, like text too long for the channel.
  const gaps = unfilledGaps(picked.text);
  if (gaps.length) return { ok: false, outcome: 'fix', reason: unfilledReason(gaps), sourceStepId: picked.sourceStepId };
  // The final text may be a revision Sentinel didn't review: his exact checks run on it here.
  const exactFacts = findExactRisks(picked.text, { links: 'sent' }).filter((r) => SERIOUS.has(r.kind)).map(exactRiskText);
  const preview: SendPreview = {
    ...where.destination,
    text: picked.text,
    sourceStepId: picked.sourceStepId,
    preparedAtMs: Date.now(),
    ...(exactFacts.length ? { exactFacts } : {}),
    ...(when && 'atMs' in when ? { sendAtMs: when.atMs } : {}),
  };
  return { ok: true, preview };
}

export { describeSend } from './describeSend';
