// The weekly Maria schedule (agent phase 3, owner 2026-10-25): one review of the week's risks,
// asked as a one-step request instead of the old governance audit and the separate weekly
// report. It is on the board, and Telegram's "finished" message goes out when that is on.
import { listJoseRequests } from '../jose/joseRequestStore';

export const MARIA_WEEKLY_LABEL = 'Asked by the weekly Maria schedule.';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LISTED = 12;

const firstLine = (r: { text?: string }) => `- ${String(r.text || '').split('\n')[0].slice(0, 160)}`;

export async function askMariaWeeklyRisks(work: string): Promise<{ state: 'done' | 'failed'; summary: string }> {
  const requests = listJoseRequests() as Array<{ text?: string; status?: string; updatedAtMs?: number }>;
  const since = Date.now() - WEEK_MS;
  const failed = requests.filter((r) => r.status === 'failed' && Number(r.updatedAtMs || 0) >= since).slice(0, MAX_LISTED).map(firstLine);
  const waiting = requests.filter((r) => String(r.status || '').startsWith('waiting_')).slice(0, MAX_LISTED).map(firstLine);
  const text = [
    "Review the week's risks: what went out or changed this week, what failed, and what is still waiting. Say what needs my attention and why.",
    `This week's work:\n${work}`,
    failed.length ? `Failed this week:\n${failed.join('\n')}` : 'Failed this week: nothing.',
    waiting.length ? `Still waiting:\n${waiting.join('\n')}` : 'Still waiting: nothing.',
  ].join('\n\n');
  const { submitStepsToJose } = await import('../jose/submitToJose');
  const result = await submitStepsToJose({
    text,
    source: 'schedule',
    label: MARIA_WEEKLY_LABEL,
    allowPaidModels: false,
    steps: [{ stepId: 'maria', agent: 'maria', actionType: 'governance_audit', effects: ['read'], needs: [], instruction: "Review the week's risks: the rules that apply, what needs my approval, and why." } as never],
  });
  if (result?.ok === false) return { state: 'failed', summary: String(result.reason || 'Maria could not answer.') };
  return { state: 'done', summary: String(result?.userReport?.summary || 'Maria answered: see the board.') };
}
