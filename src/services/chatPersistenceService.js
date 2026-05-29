import { invoke } from '@tauri-apps/api/core';
import { TRUST_STATES, timestampMs } from './trustModel';

const CHAT_CATEGORY = 'chat_message';
let durableAvailable = null;
let durableCheckAtMs = 0;
let writeQueue = Promise.resolve();

async function isDurableAvailable() {
  const now = timestampMs();
  if (durableAvailable !== null && now < durableCheckAtMs) return durableAvailable;
  try {
    const status = await invoke('get_memory_store_status');
    durableAvailable = Boolean(status?.available);
  } catch {
    durableAvailable = false;
  }
  durableCheckAtMs = timestampMs() + (durableAvailable ? 60_000 : 15_000);
  return durableAvailable;
}

function messageToRecord(chatId, msg) {
  return {
    id: `chat-${chatId}-${msg.id}`,
    title: msg.role === 'user' ? `User: ${String(msg.content).slice(0, 60)}` : `Assistant: ${String(msg.content).slice(0, 60)}`,
    content: { value: msg.content, __governance: { chatId, role: msg.role, isError: msg.isError || false, msgId: msg.id } },
    category: CHAT_CATEGORY,
    sourceAgent: msg.role === 'user' ? 'shayan' : 'alphonso',
    source: `chat:${chatId}`,
    timestampMs: Number(msg.id > 1e12 ? msg.id : timestampMs()),
    confidence: TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.UNVERIFIED,
    projectReference: chatId,
    expiresAt: null,
    expiryRule: null
  };
}

function recordToMessage(record) {
  const gov = record.content?.__governance || {};
  return {
    id: gov.msgId || record.id,
    role: gov.role || 'assistant',
    content: record.content?.value ?? record.content ?? '',
    isError: Boolean(gov.isError)
  };
}

export function persistChatMessages(chatId, messages) {
  writeQueue = writeQueue.then(async () => {
    try {
      const available = await isDurableAvailable();
      if (!available) return;
      const records = messages.map((msg) => messageToRecord(chatId, msg));
      if (records.length === 0) return;
      await invoke('upsert_memory_records', { records });
    } catch {
      durableAvailable = false;
    }
  });
}

export async function loadChatMessages(chatId) {
  try {
    const available = await isDurableAvailable();
    if (!available) return null;
    const records = await invoke('list_memory_records', {
      filters: { category: CHAT_CATEGORY, projectReference: chatId }
    });
    if (!Array.isArray(records) || records.length === 0) return null;
    return records
      .sort((a, b) => Number(a.timestampMs || 0) - Number(b.timestampMs || 0))
      .map(recordToMessage);
  } catch {
    return null;
  }
}

export async function deleteChatMessages(chatId) {
  try {
    const available = await isDurableAvailable();
    if (!available) return;
    await invoke('delete_memory_records_by_source', { source: `chat:${chatId}` }).catch(() => {});
  } catch {
    // Best-effort — localStorage clear is always the fallback
  }
}
