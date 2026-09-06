import { invoke } from '@tauri-apps/api/core';
import { appendAgentActivity } from './agentActivityService';
import { planCall, type PlanCallResult } from './connectors/calleMcpConnector';

export type McpOutreachStage = 'clarifying' | 'ready_to_confirm' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface McpOutreachRecord {
  chatId: string;
  stage: McpOutreachStage;
  goal: string;
  conversationHistory: string[];
  planId?: string;
  confirmToken?: string;
  runId?: string;
  phoneNumber?: string;
  clarifyingQuestions?: string[];
  summary?: string;
  structuredResult?: unknown;
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
  indexWriteQueue = indexWriteQueue.then(async () => {
    const current = await readIndex();
    const next = mutate(current);
    await invoke('kv_set', { key: INDEX_KEY, value: JSON.stringify(next) });
  });
  return indexWriteQueue;
}

async function hydrateRecords(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  const chatIds = await readIndex();
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

function isPhoneAlreadyInFlight(phoneNumber: string | undefined): boolean {
  if (!phoneNumber) return false;
  for (const record of records.values()) {
    if (record.phoneNumber === phoneNumber && (record.stage === 'ready_to_confirm' || record.stage === 'in_progress')) {
      return true;
    }
  }
  return false;
}

async function advancePlan(chatId: string, goal: string, conversationHistory: string[], plan: PlanCallResult): Promise<string> {
  if (!plan.ready_to_run) {
    await persistRecord({
      chatId, stage: 'clarifying', goal, conversationHistory,
      clarifyingQuestions: plan.clarifying_questions ?? []
    });
    return (plan.clarifying_questions ?? []).join('\n');
  }
  if (isPhoneAlreadyInFlight(plan.phone_number)) {
    return `A call to ${plan.phone_number} is already pending or in progress in another chat. Wait for it to finish before starting another.`;
  }
  await persistRecord({
    chatId, stage: 'ready_to_confirm', goal, conversationHistory,
    planId: plan.plan_id, confirmToken: plan.confirm_token, phoneNumber: plan.phone_number,
    summary: plan.summary
  });
  return plan.summary ?? 'Ready to place this call.';
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
      const plan = await planCall(text);
      return await advancePlan(chatId, text, [text], plan);
    }

    if (existing.stage === 'clarifying') {
      const conversationHistory = [...existing.conversationHistory, text];
      appendAgentActivity({ agent: 'marcus', action: 'calle_mcp_plan_call', detail: text });
      const plan = await planCall(existing.goal, conversationHistory);
      return await advancePlan(chatId, existing.goal, conversationHistory, plan);
    }

    if (existing.stage === 'ready_to_confirm') {
      return 'Use the Approve or Cancel button above to continue with this call plan.';
    }

    // stage === 'in_progress': reachable when a fresh call-like message arrives in a chat
    // that already has one running -- only one live outreach flow is supported per chat.
    return 'This call is already running; I will post the result when it finishes.';
  } catch (error) {
    return `CALL-E error: ${error instanceof Error ? error.message : String(error)}`;
  }
}
