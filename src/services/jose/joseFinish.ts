// When a request finishes (phase 4): Echo saves what was decided, so later
// requests can find it. Skipped when the plan had its own Echo step. Never
// changes the request's status; a failure is only noted.
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §2.9
import { runEchoPreservation } from '../echoMemoryService';
import { appendRequestNote, type JoseRequest } from './joseRequestStore';

export const DECISIONS_SAVED = 'Echo saved what was decided.';

export async function saveRequestDecisions(
  request: JoseRequest,
  outputs: Record<string, { summary?: string }>,
  options: { draftDisabled?: boolean; endpoint?: string } = {},
): Promise<{ saved: boolean; note: string }> {
  if (request.steps.some((step) => step.agent === 'echo')) {
    return { saved: false, note: 'The plan had its own Echo step.' };
  }
  let result: { saved: boolean; note: string };
  try {
    await runEchoPreservation(request.text, { packetId: request.id }, outputs, options);
    result = { saved: true, note: DECISIONS_SAVED };
  } catch (err) {
    result = { saved: false, note: `Echo couldn't save what was decided: ${String((err as Error)?.message || err)}` };
  }
  try { appendRequestNote(request.id, result.note); } catch { /* display aid only */ }
  return result;
}
