// Editing the text Marcus sends, while his send waits for your approval (phone app phase 2,
// also on the board). The edit goes through the same checks as preparing a send (the
// channel's length, gaps like [Your Name], a line saying where it goes, Sentinel's exact
// checks), and what you saved is exactly what is sent. An edit based on text that changed
// meanwhile is refused with the latest.
import { getJoseRequest, updateJoseStep, appendRequestNote } from '../jose/joseRequestStore';
import { findExactRisks, exactRiskText } from '../sentinel/exactChecks';
import { CHANNEL_LIMITS } from './destinations';
import { deliveryLines, deliveryReason, tooLongReason, unfilledGaps, unfilledReason } from './prepareSend';
import { describeSend } from './describeSend';
import { listAgentPackets, updatePacketStatus } from '../agentBusService';
import type { SendPreview } from './types';

export const SEND_TEXT_CHANGED = "This changed on your computer; here's the latest.";
export const SEND_NOT_WAITING = "That send isn't waiting any more.";
const SERIOUS = new Set(['key', 'password_request', 'disguised_link']);

export type EditedSendPreview = SendPreview & { editedByYou?: boolean };

/** `baseText` is the text you were shown; a different text now means it changed meanwhile. */
export function editSendText(requestId: string, stepId: string, text: string, baseText: string):
  { ok: true; preview: EditedSendPreview } | { ok: false; reason: string; latest?: EditedSendPreview } {
  const request = getJoseRequest(requestId);
  const step = request?.steps.find((s) => s.stepId === stepId);
  const preview = step?.sendPreview as EditedSendPreview | undefined;
  if (!request || request.status !== 'waiting_approval' || step?.status !== 'waiting_approval' || !preview) return { ok: false, reason: SEND_NOT_WAITING };
  if (preview.text !== baseText) return { ok: false, reason: SEND_TEXT_CHANGED, latest: preview };
  const next = String(text || '').trim();
  if (!next) return { ok: false, reason: 'Write the text first.' };
  const limit = CHANNEL_LIMITS[`${preview.connector}:${preview.kind}`];
  if (limit && next.length > limit) return { ok: false, reason: tooLongReason(preview.label, next.length, limit) };
  const gaps = unfilledGaps(next);
  if (gaps.length) return { ok: false, reason: unfilledReason(gaps) };
  const delivery = deliveryLines(next, preview.connector);
  if (delivery.length) return { ok: false, reason: deliveryReason(delivery) };
  const exactFacts = findExactRisks(next, { links: 'sent' }).filter((r) => SERIOUS.has(r.kind)).map(exactRiskText);
  const edited: EditedSendPreview = { ...preview, text: next, preparedAtMs: Date.now(), editedByYou: true, exactFacts };
  // Every approval screen shows the new text: the board (the preview), the step's note, and
  // the waiting packet that Chat's approvals and the Orchestrator read.
  const line = describeSend(edited);
  updateJoseStep(requestId, stepId, { sendPreview: edited, note: line });
  const packet = listAgentPackets().find((p: any) => p.status === 'pending_approval'
    && p.payload?.joseCommandId === request.commandId && p.payload?.assignment?.stepId === stepId);
  if (packet) updatePacketStatus(packet.id, 'pending_approval', { policyReason: `Waiting for your approval: ${line}`, commandPreview: line });
  appendRequestNote(requestId, 'You changed the text Marcus sends.');
  return { ok: true, preview: edited };
}
