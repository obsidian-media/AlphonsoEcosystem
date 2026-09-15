import { durableGet, durableSet } from '../lib/durableStore';

const STORAGE_KEY = 'alphonso_dismissed_attention_items_v1';

// Mirrors agentAuditService.ts's log/get/clear shape exactly — a flat
// durable-backed list, here of dismissed AttentionItem ids rather than
// audit entries. An id stays dismissed until the underlying condition
// changes (a genuinely new id is generated upstream by
// attentionAggregatorService.ts) — this service itself has no concept of
// "the same problem recurring", it only tracks exact id strings.
function readDismissed(): string[] {
  try {
    const raw = durableGet(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function dismissAttentionItem(id: string): void {
  const dismissed = readDismissed();
  if (!dismissed.includes(id)) {
    dismissed.push(id);
    durableSet(STORAGE_KEY, JSON.stringify(dismissed));
  }
}

export function isAttentionItemDismissed(id: string): boolean {
  return readDismissed().includes(id);
}

export function clearDismissedAttentionItems(): void {
  durableSet(STORAGE_KEY, JSON.stringify([]));
}
