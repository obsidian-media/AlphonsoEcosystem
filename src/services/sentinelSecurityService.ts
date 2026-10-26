// Sentinel (agent phase 4, owner 2026-10-25): his step is his own review of the real work, the
// exact checks handed to him as facts (`sentinel/sentinelReview.ts`); the scans are one real
// review of the week, as a request (`sentinel/sentinelWeekly.ts`). The keyword score, its
// fallback and the scans of an empty string that used to live here are gone.
import type { StepInput } from './jose/stepInput';
import { listOrchestrationReceipts } from './orchestrationReceiptService';
import { listAgentActivity } from './agentActivityService';
import { runSentinelReview, type SentinelAssignment, type SentinelStepResult } from './sentinel/sentinelReview';
import { redactText } from './sentinel/exactChecks';

export interface SentinelScanOptions {
  stepInput?: StepInput | null;
  commandId?: string;
  projectDirectory?: string;
  workspaceRoot?: string;
  signal?: AbortSignal;
  [key: string]: unknown;
}

/** Sentinel's step: his review of the work, else the request. */
export async function runSentinelSecurityScan(commandText: string, assignment: SentinelAssignment | null, options: SentinelScanOptions = {}): Promise<SentinelStepResult> {
  const input: StepInput = options.stepInput || { instruction: '', request: String(commandText || ''), needs: [], others: [], memory: '', review: null };
  return runSentinelReview((assignment || {}) as SentinelAssignment, input, {
    commandId: options.commandId || assignment?.commandId || undefined,
    workspaceRoot: options.projectDirectory || options.workspaceRoot,
    signal: options.signal,
  });
}

/**
 * The last `days` days of orchestration receipts and agent activity, one line each (keys
 * hidden), for Sentinel's review of the week.
 */
export function recentActivityText(days = 7): { text: string; items: number } {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const lines: string[] = [];
  try {
    for (const r of listOrchestrationReceipts().filter((row) => Number(row.timestampMs || 0) > since).slice(0, 200)) {
      const detail = String(r.details?.summary || r.details?.error || r.details?.reason || '');
      lines.push(`- ${r.agent} ${r.eventType} ${r.status} ${r.actionType || ''} ${detail}`.replace(/\s+/g, ' ').trim());
    }
  } catch { /* receipts unavailable */ }
  try {
    for (const a of listAgentActivity().filter((row) => row.ts > since).slice(-200)) {
      lines.push(`- ${a.agent} ${a.action} ${a.detail || ''}`.replace(/\s+/g, ' ').trim());
    }
  } catch { /* activity unavailable */ }
  return { text: redactText(lines.join('\n')), items: lines.length };
}
