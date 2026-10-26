// What Marcus sends (agent phase 5): text handed to him, else the work of the step he sends
// from, else the one piece your request quotes. Never his own words, never a reviewer's verdict.
import type { StepInput } from '../jose/stepInput';
import { quotedPieces } from '../jose/quotedContent';

export const NOTHING_TO_SEND = 'Nothing to send: no earlier step wrote the text.';

/** Agents whose output is a review or a verdict, not work to send. */
const REVIEWERS = new Set(['maria', 'sentinel', 'nova']);

const fixRound = (stepId: string) => Number((/-fix-(\d+)$/.exec(stepId) || [])[1] || 0);

/** The needed step whose work is sent: the newest revision, else the latest non-review step. */
export function sourceStep(input: StepInput | null | undefined): StepInput['needs'][number] | null {
  const work = (input?.needs || []).filter((n) => !REVIEWERS.has(String(n.agent || '').toLowerCase()) && !n.failed && String(n.main || n.text || '').trim());
  if (!work.length) return null;
  const revised = work.filter((n) => fixRound(n.stepId) > 0).sort((a, b) => fixRound(b.stepId) - fixRound(a.stepId));
  return revised[0] || work[work.length - 1];
}

export function textToSend(
  assignment: { payload?: Record<string, unknown> } | null | undefined,
  input: StepInput | null | undefined,
): { text: string; sourceStepId: string | null } | null {
  const given = assignment?.payload?.text;
  if (typeof given === 'string' && given.trim()) return { text: given, sourceStepId: null };
  const source = sourceStep(input);
  if (source) return { text: String(source.main || source.text), sourceStepId: source.stepId };
  const quoted = quotedPieces(input?.request || '');
  if (quoted.length === 1) return { text: quoted[0], sourceStepId: null };
  return null;
}
