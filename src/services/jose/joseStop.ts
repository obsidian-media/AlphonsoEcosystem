// Stopping a running request (Jose phase 7, owner 2026-10-27): the step that is running has its
// model call cancelled, steps already done keep their output, and nothing new starts. A stopped
// request is final. Something that already happened stays done: a send that went out, a file
// Alphonso wrote. A step that must not be cut in the middle (a send, writing an approved change)
// finishes its one action first.
import { getJoseRequest } from './joseRequestStore';
import { isMarcusSendStep } from '../marcus/prepareSend';
import { isAlphonsoCodeStep } from '../alphonso/codeStep';

export const STOPPED_LINE = 'Stopped by you.';
export const NOT_RUNNING = "This request isn't running.";

const controllers = new Map<string, AbortController>();
const listeners: ((requestId: string) => void)[] = [];

/** The request's stop signal; made on first use, so a stop pressed early still counts. */
export function stopSignal(requestId: string): AbortSignal {
  let controller = controllers.get(requestId);
  if (!controller) {
    controller = new AbortController();
    controllers.set(requestId, controller);
  }
  return controller.signal;
}

export function isStopRequested(requestId: string): boolean {
  return controllers.get(requestId)?.signal.aborted === true;
}

/** Forget the request's signal once its run has ended. */
export function clearStop(requestId: string): void {
  controllers.delete(requestId);
}

/** Called with the request id when Stop is pressed (the queue lets the request go). */
export function onStopRequested(listener: (requestId: string) => void): void {
  if (!listeners.includes(listener)) listeners.push(listener);
}

/** Stop a request that is running or waiting its turn. */
export function stopRequest(requestId: string): { ok: boolean; summary: string } {
  const request = getJoseRequest(requestId);
  if (!request || (request.status !== 'running' && request.status !== ('queued' as string))) return { ok: false, summary: NOT_RUNNING };
  stopSignal(requestId);
  controllers.get(requestId)!.abort();
  for (const listener of listeners) {
    try { listener(requestId); } catch { /* one listener never stops the others */ }
  }
  return { ok: true, summary: STOPPED_LINE };
}

/** A step that finishes its one action before a stop takes effect: a send, or an approved code change. */
export function stopWaitsFor(assignment: any, packet?: any): boolean {
  if (isMarcusSendStep(assignment)) return true;
  return isAlphonsoCodeStep(assignment) && (packet?.status === 'approved' || assignment?.approved === true);
}
