// One real review of the week (agent phase 4, owner 2026-10-25): Telegram's /scan, the
// sidebar's Re-scan and the daily schedule "Sentinel: the week's security" ask Sentinel, as a
// one-step request on the board, to review the last week's activity. Replaces the keyword
// scans that read an empty string.
import { listJoseRequests } from '../jose/joseRequestStore';
import { getStepOutput } from '../jose/joseStepOutputs';
import { hideSecrets } from './exactChecks';

export const SENTINEL_WEEKLY_LABEL = "Asked by Sentinel's review of the week.";

export async function askSentinelWeekReview(work: string, opts: { source?: 'schedule' | 'user' | 'telegram' } = {}): Promise<{ state: 'done' | 'failed'; summary: string; requestId?: string }> {
  const source = opts.source || 'user';
  const text = [
    "Review the last week's activity for security and safety: keys or passwords written down, unsafe or disguised links, commands that delete or run code, and anything asking for permissions it shouldn't.",
    `The week's activity:\n${hideSecrets(work)}`,
  ].join('\n\n');
  const { submitStepsToJose } = await import('../jose/submitToJose');
  const result = await submitStepsToJose({
    text,
    source,
    label: SENTINEL_WEEKLY_LABEL,
    allowPaidModels: source === 'schedule' ? false : undefined,
    steps: [{ stepId: 'sentinel', agent: 'sentinel', actionType: 'security_review', effects: ['read'], needs: [], instruction: "Review the week's activity for security problems: what, where, how serious, what to do." } as never],
  });
  if (result?.ok === false) return { state: 'failed', summary: String(result.reason || 'Sentinel could not review.') };
  return { state: 'done', summary: String(result?.userReport?.summary || 'Sentinel reviewed the week: see the board.'), requestId: result?.requestId || undefined };
}

export interface SentinelReviewCard { requestId: string; verdict: 'safe' | 'risky' | 'unsafe' | null; findings: string[]; summary: string; atMs: number }

/** The newest weekly review, read from its request (for the sidebar card). */
export function lastSentinelReview(): SentinelReviewCard | null {
  const request = listJoseRequests()
    .filter((r) => r.plan?.note === SENTINEL_WEEKLY_LABEL)
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))[0];
  if (!request) return null;
  const output = getStepOutput(request.commandId, 'sentinel') as { summary?: string; schema?: { verdict?: string; findings?: string[] } } | null;
  const verdict = output?.schema?.verdict;
  return {
    requestId: request.id,
    verdict: verdict === 'safe' || verdict === 'risky' || verdict === 'unsafe' ? verdict : null,
    findings: Array.isArray(output?.schema?.findings) ? output!.schema!.findings! : [],
    summary: String(output?.summary || ''),
    atMs: request.updatedAtMs || request.createdAtMs || 0,
  };
}
