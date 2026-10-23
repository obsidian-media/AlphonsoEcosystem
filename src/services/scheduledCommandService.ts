// A schedule's command (phase 6a): through Jose's one entry like anything
// typed, but it never waits for you to look at the plan and never uses a paid
// model (owner, 2026-10-23). A step that needs approval still waits, and
// Telegram tells you about it.
import { answerOrPlan, outcomeLine } from './jose/joseInbound';

export interface ScheduledCommandResult {
  ok: boolean;
  summary: string;
  details: string;
  pendingApprovalCount?: number;
  error?: string;
}

export async function runScheduledCommand(
  text: string,
  settings: { endpoint?: string; zeroCostMode?: boolean },
): Promise<ScheduledCommandResult> {
  const result = await answerOrPlan(text, {
    source: 'schedule',
    endpoint: settings.endpoint,
    zeroCostMode: settings.zeroCostMode,
    showPlanFirst: 'never',
    allowPaidModels: false,
  });
  if (result.kind === 'answer') {
    return { ok: true, summary: result.text.split('\n')[0].slice(0, 200), details: result.text };
  }
  const run = result.kind === 'request' ? result.result : null;
  const reports = (run?.command?.userReport?.assignmentSummaries || [])
    .filter((a: { reportSummary?: string }) => a?.reportSummary)
    .map((a: { agent?: string; reportSummary?: string }) => `${a.agent || 'agent'}: ${a.reportSummary}`)
    .join('\n\n');
  return {
    ok: Boolean(run?.ok),
    summary: run?.command?.userReport?.summary || '',
    details: reports,
    pendingApprovalCount: Number(run?.pendingApprovalCount || 0),
    error: run?.ok ? undefined : outcomeLine(run),
  };
}
