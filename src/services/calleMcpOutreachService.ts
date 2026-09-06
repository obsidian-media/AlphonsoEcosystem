import { invoke } from '@tauri-apps/api/core';
import { appendAgentActivity } from './agentActivityService';
import { planCall } from './connectors/calleMcpConnector';

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

// Placeholder -- real state machine added in Task 4.
export async function handleMcpOutreachMessage(chatId: string, text: string): Promise<string> {
  await hydrateRecords();
  appendAgentActivity({ agent: 'marcus', action: 'calle_mcp_plan_call', detail: text });
  const plan = await planCall(text);
  await persistRecord({
    chatId, stage: 'clarifying', goal: text, conversationHistory: [text],
    clarifyingQuestions: plan.clarifying_questions ?? []
  });
  return (plan.clarifying_questions ?? []).join('\n');
}
