// Waiting requests don't wait forever (phase 5, owner 2026-10-23): a request
// waiting for your approval, or a plan waiting to be run, expires after the
// days set in Settings (`joseWaitingExpiryDays`, 7 by default; 0 or blank =
// never). Its waiting packets are rejected so they leave the approval queue.
import { getJoseRequest, listJoseRequests, setJoseRequestStatus, appendRequestNote } from './joseRequestStore';
import { listJoseCommands } from '../joseCommandRouterService';
import { getPacketById, rejectPacket } from '../agentBusService';

const DEFAULT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const WAITING = new Set(['waiting_approval', 'waiting_plan_approval']);

export function getWaitingExpiryDays(): number {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem('alphonso_settings') || '{}')?.joseWaitingExpiryDays;
  } catch {
    raw = undefined;
  }
  if (raw === undefined || raw === null) return DEFAULT_DAYS;
  if (raw === '') return 0;
  const days = Number(raw);
  if (!Number.isFinite(days) || days < 0) return DEFAULT_DAYS;
  return days;
}

/** Expire every request that has waited longer than the set days; returns how many. */
export function expireWaitingRequests(nowMs: number = Date.now()): number {
  const days = getWaitingExpiryDays();
  if (days === 0) return 0;
  let count = 0;
  for (const request of listJoseRequests()) {
    if (!WAITING.has(request.status) || nowMs - (request.updatedAtMs || request.createdAtMs) <= days * DAY_MS) continue;
    const command: any = request.commandId ? listJoseCommands().find((c) => c.id === request.commandId) : null;
    for (const assignment of command?.assignments || []) {
      const packet: any = assignment.packetId ? getPacketById(assignment.packetId) : null;
      if (packet?.status === 'pending_approval') rejectPacket(packet.id, 'The request expired while waiting.');
    }
    setJoseRequestStatus(request.id, 'expired');
    appendRequestNote(request.id, `Expired after ${days} day${days === 1 ? '' : 's'} without your approval.`);
    if (getJoseRequest(request.id)?.status === 'expired') count += 1;
  }
  return count;
}
