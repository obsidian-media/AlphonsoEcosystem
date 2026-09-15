import { invoke } from '@tauri-apps/api/core';
import { appendAgentActivity } from './agentActivityService';
import { planCall, runCall, getCallRun, type PlanCallResult } from './connectors/calleMcpConnector';
import { evaluatePolicyGate } from './policyEnforcementService';

export type McpOutreachStage = 'clarifying' | 'ready_to_confirm' | 'submitting' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface McpOutreachRecord {
  chatId: string;
  stage: McpOutreachStage;
  /** display_goal from the most recent plan_call response -- server-authored, not user text. */
  goal: string;
  planId?: string;
  confirmToken?: string;
  runId?: string;
  clarifyingQuestions?: string[];
  /** confirm_summary from plan_call -- the pre-call "here's what I'll do" text shown before Approve. */
  confirmSummary?: string;
  /** post_summary/summary from get_call_run's terminal result -- the post-call outcome text. */
  summary?: string;
  structuredResult?: unknown;
  transcript?: string | null;
  error?: string;
  delivered?: boolean;
}

const RECORD_KEY_PREFIX = 'calle_mcp_outreach:';
const INDEX_KEY = 'calle_mcp_outreach_index';

const records = new Map<string, McpOutreachRecord>();
let hydrated = false;
let indexWriteQueue: Promise<void> = Promise.resolve();

function recordKey(chatId: string): string {
  return `${RECORD_KEY_PREFIX}${chatId}`;
}

async function readIndex(): Promise<string[]> {
  const raw = await invoke<string | null>('kv_get', { key: INDEX_KEY }).catch(() => null);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function updateIndex(mutate: (chatIds: string[]) => string[]): Promise<void> {
  // Chain off a *recovered* view of the previous queue -- if an earlier write
  // rejected and left indexWriteQueue permanently rejected, `.then()` on it
  // would skip every future write's callback (INDEX_KEY would silently stop
  // receiving updates). Recover the queue for chaining purposes, but still
  // return the real `operation` promise so this call's own failure reaches
  // its caller.
  const operation = indexWriteQueue.catch(() => {}).then(async () => {
    const current = await readIndex();
    const next = mutate(current);
    await invoke('kv_set', { key: INDEX_KEY, value: JSON.stringify(next) });
  });
  indexWriteQueue = operation.catch(() => {});
  return operation;
}

async function readIndexWithStatus(): Promise<{ chatIds: string[]; ok: boolean }> {
  let raw: string | null;
  try {
    raw = await invoke<string | null>('kv_get', { key: INDEX_KEY });
  } catch {
    return { chatIds: [], ok: false };
  }
  if (!raw) return { chatIds: [], ok: true };
  try {
    const parsed = JSON.parse(raw);
    return { chatIds: Array.isArray(parsed) ? parsed : [], ok: true };
  } catch {
    return { chatIds: [], ok: true };
  }
}

async function hydrateRecords(): Promise<void> {
  if (hydrated) return;
  // Only mark hydration complete once the index read actually succeeded --
  // otherwise a transient kv_get failure would permanently skip hydration
  // for the rest of this session, silently dropping persisted in-progress
  // records from `records` and from recovery.
  const { chatIds, ok } = await readIndexWithStatus();
  if (ok) hydrated = true;
  for (const chatId of chatIds) {
    const raw = await invoke<string | null>('kv_get', { key: recordKey(chatId) }).catch(() => null);
    if (!raw) continue;
    try {
      records.set(chatId, JSON.parse(raw));
    } catch {
      // Corrupt entry -- skip rather than crash hydration for every other record.
    }
  }
}

async function persistRecord(record: McpOutreachRecord): Promise<void> {
  records.set(record.chatId, record);
  await invoke('kv_set', { key: recordKey(record.chatId), value: JSON.stringify(record) });
  await updateIndex((chatIds) => (chatIds.includes(record.chatId) ? chatIds : [...chatIds, record.chatId]));
}

async function deleteRecord(chatId: string): Promise<void> {
  records.delete(chatId);
  await invoke('kv_delete', { key: recordKey(chatId) });
  await updateIndex((chatIds) => chatIds.filter((id) => id !== chatId));
}

// Test-only reset for this module's singleton in-memory cache -- same pattern
// chatPersistenceService.ts's resetDurableCache() already establishes for the
// identical class of problem (a module-level cache that must not leak state
// between test cases, but must behave as a real singleton at runtime).
export function __resetMcpOutreachStateForTests(): void {
  records.clear();
  hydrated = false;
  indexWriteQueue = Promise.resolve();
}

export async function getMcpOutreachRecord(chatId: string): Promise<McpOutreachRecord | null> {
  await hydrateRecords();
  return records.get(chatId) ?? null;
}

export function isAwaitingMcpOutreachInput(record: McpOutreachRecord | null): boolean {
  return record !== null && (record.stage === 'clarifying' || record.stage === 'ready_to_confirm');
}

// NOTE: an earlier version of this file tried to dedupe concurrent calls to
// the same phone number across chats by reading `plan.phone_number` off the
// plan_call response. Verified live against the real MCP server (2026-09-07):
// plan_call's response never echoes a phone number at all -- there is no
// such field. That check was therefore always a silent no-op. Removed rather
// than kept as dead code; the real duplicate-submission guards that DO work
// are per-chat (`confirmInFlight` below and the `submitting` stage), not
// cross-chat by phone number. A cross-chat guard would require parsing a
// phone number out of user text ourselves, which plan_call's own tool
// description explicitly says not to do ("do not guess/reformat").

async function advancePlan(chatId: string, plan: PlanCallResult): Promise<string> {
  if (!plan.ready_to_run) {
    await persistRecord({
      chatId, stage: 'clarifying', goal: plan.display_goal ?? '',
      planId: plan.plan_id, clarifyingQuestions: plan.clarifying_questions ?? []
    });
    return (plan.clarifying_questions ?? []).join('\n') || plan.next_step;
  }
  await persistRecord({
    chatId, stage: 'ready_to_confirm', goal: plan.display_goal ?? '',
    planId: plan.plan_id, confirmToken: plan.confirm_token ?? undefined, confirmSummary: plan.confirm_summary
  });
  return plan.confirm_summary || 'Ready to place this call.';
}

export async function handleMcpOutreachMessage(chatId: string, text: string): Promise<string> {
  try {
    await hydrateRecords();
    const existing = records.get(chatId);
    const lower = text.trim().toLowerCase();

    if (existing && isAwaitingMcpOutreachInput(existing) && lower === 'cancel') {
      await deleteRecord(chatId);
      return 'Call plan dropped.';
    }

    if (!existing || existing.stage === 'completed' || existing.stage === 'failed' || existing.stage === 'cancelled') {
      appendAgentActivity({ agent: 'marcus', action: 'calle_mcp_plan_call', detail: text });
      // plan_call has no conversation_history param -- it tracks state itself
      // via plan_id. The very first message has no plan_id yet.
      const plan = await planCall({ userInput: text });
      return await advancePlan(chatId, plan);
    }

    if (existing.stage === 'clarifying') {
      appendAgentActivity({ agent: 'marcus', action: 'calle_mcp_plan_call', detail: text });
      const plan = await planCall({ planId: existing.planId, userInput: text });
      return await advancePlan(chatId, plan);
    }

    if (existing.stage === 'ready_to_confirm') {
      return 'Use the Approve or Cancel button above to continue with this call plan.';
    }

    // stage === 'in_progress'/'submitting': reachable when a fresh call-like message arrives
    // in a chat that already has one running -- only one live outreach flow is supported per chat.
    return 'This call is already running; I will post the result when it finishes.';
  } catch (error) {
    return `CALL-E error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// A double-click (or any rapid re-invocation) between reading
// existing.stage === 'ready_to_confirm' and the persistRecord call that
// moves it to 'in_progress' could otherwise call runCall twice for the same
// plan -- and run_call has NO idempotency mechanism, so that specific race
// is a direct path to placing two real phone calls from one click.
const confirmInFlight = new Set<string>();

export async function confirmMcpOutreachCall(chatId: string): Promise<string> {
  if (confirmInFlight.has(chatId)) {
    return 'Already placing this call -- please wait.';
  }
  confirmInFlight.add(chatId);
  try {
    await hydrateRecords();
    const existing = records.get(chatId);
    if (existing?.stage === 'submitting') {
      return 'This call plan was already submitted to CALL-E and its outcome could not be confirmed. Resubmitting risks placing a duplicate call -- check CALL-E directly before retrying.';
    }
    if (!existing || existing.stage !== 'ready_to_confirm') {
      return 'No pending call plan to confirm.';
    }
    const gate = evaluatePolicyGate({ connectorId: 'calle', actionType: 'external_call', approved: true });
    if (!gate.ok) {
      return `Blocked: ${gate.reason}`;
    }
    appendAgentActivity({ agent: 'marcus', action: 'calle_mcp_run_call', detail: existing.confirmSummary ?? '' });
    // Persist a durable, unreconciled "submitting" marker BEFORE calling
    // runCall. run_call has no idempotency mechanism -- if the process
    // crashes or a later persistRecord fails right after a successful
    // runCall, a stale 'ready_to_confirm' record would let a later approval
    // resubmit the same planId and place a duplicate real phone call.
    // 'submitting' blocks any resubmission until this is manually reconciled.
    await persistRecord({ ...existing, stage: 'submitting' });
    const { run_id } = await runCall(existing.planId!, existing.confirmToken!);
    await persistRecord({ ...existing, stage: 'in_progress', runId: run_id });
    pollMcpCallUntilTerminal(chatId, run_id).catch((error) => {
      persistRecord({ ...existing, stage: 'in_progress', runId: run_id, error: error instanceof Error ? error.message : String(error) });
    });
    return 'Call started. I will notify you when it finishes.';
  } catch (error) {
    return `CALL-E error: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    confirmInFlight.delete(chatId);
  }
}

export async function cancelMcpOutreachCall(chatId: string): Promise<string> {
  await hydrateRecords();
  const existing = records.get(chatId);
  // CALL-E's MCP tools expose no cancel operation -- there is no remote call
  // to stop. Deleting a 'submitting'/'in_progress' record here would report
  // "dropped" while the real call keeps running, silently losing recovery,
  // status delivery, and audit tracking for it. Only pre-submission plans
  // (nothing placed yet) are safe to delete.
  if (existing && (existing.stage === 'submitting' || existing.stage === 'in_progress')) {
    return 'This call is already running at CALL-E and cannot be cancelled remotely from here. I will still notify you when it finishes.';
  }
  await deleteRecord(chatId);
  return 'Call plan dropped.';
}

export async function markMcpOutreachDelivered(chatId: string): Promise<void> {
  const record = records.get(chatId);
  if (record) await persistRecord({ ...record, delivered: true });
}

// A stuck run_id would otherwise poll forever -- bounded the same way
// joseExecutionEngineService.ts's PIPELINE_MAX_DURATION_MS bounds a
// different runaway loop elsewhere in this codebase.
const MAX_POLL_DURATION_MS = 60 * 60 * 1000;

// Verified live 2026-09-07: run_call/get_call_run's own tool schema documents
// status values with a literal space ("NO ANSWER"), while this skill's own
// CLI-facing docs list them with an underscore ("NO_ANSWER"). Normalize both
// forms before matching so a real terminal status is never missed due to
// that inconsistency.
function normalizeStatus(status: unknown): string {
  return String(status || '').toUpperCase().replace(/\s+/g, '_');
}

async function pollMcpCallUntilTerminal(chatId: string, runId: string): Promise<void> {
  const TERMINAL = new Set(['COMPLETED', 'FAILED', 'NO_ANSWER', 'DECLINED', 'CANCELED', 'CANCELLED', 'VOICEMAIL', 'BUSY', 'EXPIRED']);
  const deadline = Date.now() + MAX_POLL_DURATION_MS;
  for (;;) {
    if (Date.now() > deadline) {
      const record = records.get(chatId);
      if (record) {
        await persistRecord({ ...record, stage: 'failed', error: 'Timed out waiting for CALL-E to report a final status.', delivered: false });
        dispatchEvent(new CustomEvent('alphonso:toast', {
          detail: { type: 'warning', title: 'CALL-E call timed out', message: 'No final status after 60 minutes of polling.' }
        }));
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 10_000));
    let result;
    try {
      result = await getCallRun(runId);
    } catch {
      continue;
    }
    const status = normalizeStatus(result.status);
    if (TERMINAL.has(status)) {
      const record = records.get(chatId);
      if (record) {
        const updated: McpOutreachRecord = {
          ...record,
          stage: status === 'COMPLETED' ? 'completed' : 'failed',
          structuredResult: result.result?.extracted,
          summary: result.result?.post_summary ?? result.result?.summary ?? record.summary,
          transcript: result.result?.transcript ?? null,
          delivered: false
        };
        await persistRecord(updated);
        dispatchEvent(new CustomEvent('alphonso:toast', {
          detail: {
            type: status === 'COMPLETED' ? 'success' : 'warning',
            title: status === 'COMPLETED' ? 'CALL-E call completed' : `CALL-E call ${status.toLowerCase()}`,
            message: updated.summary ?? ''
          }
        }));
      }
      return;
    }
  }
}

export async function recoverInterruptedMcpOutreachCalls(): Promise<void> {
  await hydrateRecords();
  for (const record of records.values()) {
    if (record.stage === 'in_progress' && record.runId) {
      pollMcpCallUntilTerminal(record.chatId, record.runId).catch((error) => {
        persistRecord({ ...record, error: error instanceof Error ? error.message : String(error) });
      });
    }
  }
}
