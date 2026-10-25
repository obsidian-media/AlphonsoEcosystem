// The daily Nova schedule (agent phase 2, owner 2026-10-25): instead of scoring a summary of
// the week as one number, Nova is asked, as a one-step request, what to do next from the
// week's work and what is still waiting. It is on the board, saved as a verdict, and
// Telegram's "finished" message goes out when that is on.
import { listJoseRequests } from '../jose/joseRequestStore';

export const NOVA_DAILY_LABEL = 'Asked by the daily Nova schedule.';
const MAX_WAITING = 12;

export async function askNovaWhatNext(work: string): Promise<{ state: 'done' | 'failed'; summary: string }> {
  const waiting = listJoseRequests()
    .filter((r: { status?: string }) => String(r.status || '').startsWith('waiting_'))
    .slice(0, MAX_WAITING)
    .map((r: { text?: string }) => `- ${String(r.text || '').split('\n')[0].slice(0, 160)}`);
  const text = [
    'What should I do next? Rank the things worth doing, from the work done this week and what is still waiting.',
    `This week's work:\n${work}`,
    waiting.length ? `Still waiting:\n${waiting.join('\n')}` : 'Still waiting: nothing.',
  ].join('\n\n');
  const { submitStepsToJose } = await import('../jose/submitToJose');
  const result = await submitStepsToJose({
    text,
    source: 'schedule',
    label: NOVA_DAILY_LABEL,
    allowPaidModels: false,
    steps: [{ stepId: 'nova', agent: 'nova', actionType: 'analysis_findings', effects: ['read'], needs: [], instruction: 'Say what to do next, in order, with reasons.' } as never],
  });
  if (result?.ok === false) return { state: 'failed', summary: String(result.reason || 'Nova could not answer.') };
  return { state: 'done', summary: String(result?.userReport?.summary || 'Nova answered: see the board.') };
}
