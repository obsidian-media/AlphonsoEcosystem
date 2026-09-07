import { appendAgentActivity } from './agentActivityService';
import { getConnectorCredential } from './connectors/connectorAuth.js';
import { createCall, getCall, pollCallUntilTerminal, type CalleCallStatus, type CalleCallTask } from './connectors/calleConnector';

const CALLE_OUTREACH_KEY = 'alphonso_calle_outreach_v1';
// Best-effort estimate only, sourced from CALL-E's pricing page as of
// 2026-09-06 -- that page itself states pricing is "early-stage... subject
// to change." Shown in the approval prompt as an estimate, never presented
// as a guaranteed/contractual figure; re-check before the actual demo.
export const ESTIMATED_COST_USD = 0.05;

export type PolicyBlockKind = 'needs_approval_click' | 'zero_cost_mode' | 'license_tier' | null;

export interface OutreachCallRecord {
  id: string;
  idempotencyKey: string;
  businessName: string;
  phone: string;
  taskType: 'outreach' | 'custom';
  task: string;
  // NOTE: 'failed_to_start' means CALL-E rejected createCall itself (a real,
  // confirmed API failure) -- it is a genuine terminal state. A client-side
  // POLL TIMEOUT is explicitly NOT one of these statuses; runOutreachCall's
  // poll .catch() handling leaves status as 'in_progress' in that case.
  status: CalleCallStatus | 'pending_approval' | 'failed_to_start' | 'dismissed';
  policyBlockKind: PolicyBlockKind;
  calleCallId: string | null;
  structuredResult: Record<string, unknown> | null;
  summary: string | null;
  // Populated from recipients[0].attempts[].transcriptTurns (the ONLY place
  // CALL-E's response actually carries transcript text). Since this
  // connector only ever creates a single-recipient call, recipients[0] is
  // always the right (and only) entry to read.
  transcript: Array<{ speaker: 'bot' | 'user' | 'unknown'; text: string }> | null;
  createdAtMs: number;
  completedAtMs: number | null;
  error: string | null;
}

const OUTREACH_RESULT_SCHEMA = {
  type: 'object',
  required: ['interested_in_website'],
  properties: {
    interested_in_website: { type: 'string', enum: ['yes', 'no', 'unknown'] },
    wants_demo_appointment: { type: 'boolean' },
    appointment_time: { type: ['string', 'null'] },
    notes: { type: 'string' }
  }
};

const DEFAULT_OUTREACH_TASK_TEMPLATE = "Call and ask if they'd be interested in an updated website; if so, offer to book a time for the owner to see a demo we've already built.";

function readRows(): OutreachCallRecord[] {
  try {
    const raw = localStorage.getItem(CALLE_OUTREACH_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows: OutreachCallRecord[]): void {
  localStorage.setItem(CALLE_OUTREACH_KEY, JSON.stringify(rows.slice(-200)));
}

function updateRecord(recordId: string, patch: Partial<OutreachCallRecord>): OutreachCallRecord | null {
  const rows = readRows();
  const nextRows = rows.map((r) => (r.id === recordId ? { ...r, ...patch } : r));
  writeRows(nextRows);
  return nextRows.find((r) => r.id === recordId) || null;
}

function normalizePhoneForTask(phone: string, task: string): string {
  return task.includes(phone) ? task : `${task} Phone: ${phone}.`;
}

export function listOutreachCalls(): OutreachCallRecord[] {
  return readRows();
}

const NON_TERMINAL_STATUSES = new Set(['pending_approval', 'queued', 'in_progress']);

export function createOutreachDraft({ businessName, phone, taskType, task }: {
  businessName: string; phone: string; taskType: OutreachCallRecord['taskType']; task: string;
}): OutreachCallRecord {
  const existing = readRows().find((r) => r.phone === phone && NON_TERMINAL_STATUSES.has(r.status));
  if (existing) return existing;

  const record: OutreachCallRecord = {
    id: `calle-outreach-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    idempotencyKey: `outreach-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    businessName,
    phone,
    taskType,
    task: taskType === 'outreach' ? (task || DEFAULT_OUTREACH_TASK_TEMPLATE) : task,
    status: 'pending_approval',
    policyBlockKind: 'needs_approval_click',
    calleCallId: null,
    structuredResult: null,
    summary: null,
    transcript: null,
    createdAtMs: Date.now(),
    completedAtMs: null,
    error: null
  };

  const rows = readRows();
  writeRows([...rows, record]);
  return record;
}

export function dismissOutreachCall(recordId: string): void {
  updateRecord(recordId, { status: 'dismissed' });
}

// Returns null when `message` isn't a recognized policyEnforcementService
// block reason (e.g. a genuine "CALL-E API error (400): ..." failure) --
// callers must not fall back to 'needs_approval_click' for those, or a real
// API failure gets silently relabeled as an approval prompt the user can
// retry forever instead of a terminal failed_to_start.
function classifyPolicyBlockReason(message: string): PolicyBlockKind | null {
  const lower = message.toLowerCase();
  // NOTE: don't match a bare 'pro' substring here -- 'approval' itself
  // contains 'pro' ("ap-PRO-val"), which previously misclassified every
  // Approval Mode block as a license-tier block. Match on 'pro license' or
  // 'upgrade', which is what evaluatePolicyGate's real license-tier message
  // actually contains, instead.
  if (lower.includes('zero-cost')) return 'zero_cost_mode';
  if (lower.includes('license') || lower.includes('upgrade')) return 'license_tier';
  if (lower.includes('approval') || lower.includes('allowlist') || lower.includes('policy gate blocked')) return 'needs_approval_click';
  return null;
}

export async function runOutreachCall(recordId: string, options: { approved?: boolean } = {}): Promise<OutreachCallRecord> {
  const draft = readRows().find((r) => r.id === recordId);
  if (!draft) throw new Error('Outreach call record not found.');

  const apiKey = getConnectorCredential('calle', 'CALLE_API_KEY') as string;
  const request = {
    task: normalizePhoneForTask(draft.phone, draft.task),
    resultSchema: draft.taskType === 'outreach' ? OUTREACH_RESULT_SCHEMA : undefined
  };

  appendAgentActivity({ agent: 'marcus', action: 'calle_outreach_call', detail: draft.businessName });

  let created: CalleCallTask;
  try {
    created = await createCall(apiKey, request, draft.idempotencyKey, { approved: options.approved });
  } catch (error: unknown) {
    const message = String((error as Error)?.message || error);
    const policyBlockKind = classifyPolicyBlockReason(message);
    if (policyBlockKind) {
      return updateRecord(recordId, { status: 'pending_approval', policyBlockKind, error: message })!;
    }
    // Not a recognized policy denial -- a real CALL-E API failure (bad phone
    // number, rate limit, etc.). Report it as a terminal failure instead of
    // offering another "Approve" action that will fail identically forever.
    return updateRecord(recordId, { status: 'failed_to_start', policyBlockKind: null, error: message })!;
  }

  const queuedRecord = updateRecord(recordId, {
    status: created.status,
    calleCallId: created.id,
    policyBlockKind: null,
    error: null
  })!;

  startBackgroundPoll(apiKey, recordId, created.id);

  return queuedRecord;
}

// Fire-and-forget: NOT awaited by callers. Awaiting would hold open whatever
// invoked them for up to ~6 minutes. Shared by runOutreachCall (a call just
// placed) and recoverInterruptedOutreachCalls (a call observed still
// non-terminal at boot) -- listOutreachCalls() only reads the local
// persisted record, it never itself polls CALL-E, so without this a
// non-terminal call recovered at boot would never receive its terminal
// result until another app restart.
function startBackgroundPoll(apiKey: string, recordId: string, calleCallId: string): void {
  pollCallUntilTerminal(apiKey, calleCallId, {
    onProgress: (call) => {
      // Persists in_progress/queued status updates as they're observed, so
      // the panel can show a live state instead of appearing stuck at
      // whatever status was last written when the call was created.
      updateRecord(recordId, { status: call.status });
    }
  })
    .then((call) => {
      const attempts = call.recipients?.[0]?.attempts ?? [];
      const transcript = attempts.flatMap((a) => a.transcriptTurns ?? []);
      updateRecord(recordId, {
        status: call.status,
        structuredResult: call.structuredResult,
        summary: call.summary,
        transcript: transcript.length ? transcript : null,
        completedAtMs: Date.now()
      });
    })
    .catch((error: unknown) => {
      // A poll TIMEOUT is not proof the real call failed -- leave status
      // unchanged (still in_progress) so the duplicate guard and boot
      // recovery can still find it later.
      updateRecord(recordId, { error: String((error as Error)?.message || error) });
    });
}

export async function recoverInterruptedOutreachCalls(): Promise<void> {
  const apiKey = getConnectorCredential('calle', 'CALLE_API_KEY') as string;
  if (!apiKey) return;
  const stuck = readRows().filter((r) => (r.status === 'queued' || r.status === 'in_progress') && r.calleCallId);
  for (const record of stuck) {
    try {
      const call = await getCall(apiKey, record.calleCallId!);
      const terminal = new Set(['completed', 'failed', 'canceled']);
      if (terminal.has(call.status)) {
        const attempts = call.recipients?.[0]?.attempts ?? [];
        const transcript = attempts.flatMap((a) => a.transcriptTurns ?? []);
        updateRecord(record.id, {
          status: call.status,
          structuredResult: call.structuredResult,
          summary: call.summary,
          transcript: transcript.length ? transcript : null,
          completedAtMs: Date.now()
        });
      } else {
        // Still non-terminal: resume bounded polling now rather than leaving
        // the record to wait on a panel that never actually re-checks CALL-E.
        startBackgroundPoll(apiKey, record.id, record.calleCallId!);
      }
    } catch {
      // non-critical: leave the record as-is, try again on the next boot
    }
  }
}
