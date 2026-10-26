// After Maria reviews a plan (agent phase 3, owner 2026-10-25: "review, then offer to do it"),
// Chat offers to have Marcus prepare it. Pressing it asks Marcus for a readiness check, a
// one-step request that only reads: nothing is sent, and sending still asks for approval.
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { getJoseRequest } from '../../services/jose/joseRequestStore';
import { getStepOutput } from '../../services/jose/joseStepOutputs';

export const MARIA_OFFER_LABEL = "Asked from Maria's review.";

interface Props {
  requestId: string;
  onReply?: (text: string, requestId?: string) => void;
}

function mariaPlanReview(requestId: string): { offer: string; text: string; review: string } | null {
  const request = getJoseRequest(requestId);
  if (!request) return null;
  for (const step of request.steps || []) {
    if (step.agent !== 'maria' || step.reviewOf) continue;
    const output = getStepOutput(request.commandId, step.stepId) as { summary?: string; schema?: { kind?: string; offer?: string } } | null;
    const offer = String(output?.schema?.offer || '').trim();
    if (output?.schema?.kind === 'plan' && offer) return { offer, text: request.text, review: String(output.summary || '') };
  }
  return null;
}

export function MariaOfferButton({ requestId, onReply }: Props) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const found = mariaPlanReview(requestId);
  if (!found || done) return null;

  const prepare = async () => {
    setBusy(true);
    try {
      const { submitStepsToJose } = await import('../../services/jose/submitToJose');
      const result = await submitStepsToJose({
        text: [`The plan: ${found.text}`, `Maria's review:\n${found.review}`, `Prepare this: ${found.offer}`].join('\n\n'),
        source: 'user',
        label: MARIA_OFFER_LABEL,
        steps: [{ stepId: 'marcus', agent: 'marcus', actionType: 'distribution_readiness', effects: ['read'], needs: [], instruction: `Prepare this, sending nothing: ${found.offer}` } as never],
      });
      const reply = result?.ok === false
        ? `Marcus could not start: ${String(result.reason || (result.problems || []).join(' ') || 'unknown')}`
        : String(result?.userReport?.summary || 'Marcus is preparing it: see the board.');
      onReply?.(reply, result?.requestId);
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="maria-offer">
      <button
        type="button"
        disabled={busy}
        onClick={() => { void prepare(); }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-(--accent-dim) border border-(--accent-border) rounded-lg text-xs text-(--accent) hover:text-(--accent-hover) transition-colors disabled:opacity-60"
      >
        <ArrowRight className="w-3 h-3" />
        {busy ? 'Asking Marcus…' : 'Have Marcus prepare this'}
      </button>
      <span className="text-xs text-(--text-3)">{found.offer}</span>
    </div>
  );
}
