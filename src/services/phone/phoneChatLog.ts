// The conversation from the phone, kept on the computer (phone app, phase 1): what was
// asked from the phone and what Alphonso answered. The phone shows it; the mirror sends
// it. The last PHONE_CHAT_LIMIT messages are kept.
import { randomId } from '../../lib/randomId';

export const PHONE_CHAT_KEY = 'alphonso_phone_chat_v1';
export const PHONE_CHAT_LIMIT = 200;

export interface PhoneChatMessage { id: string; role: 'user' | 'assistant'; text: string; atMs: number; requestId?: string }

const listeners = new Set<() => void>();

export function listPhoneChat(): PhoneChatMessage[] {
  try {
    const v = JSON.parse(localStorage.getItem(PHONE_CHAT_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function appendPhoneChat(message: Omit<PhoneChatMessage, 'id' | 'atMs'> & { id?: string; atMs?: number }): PhoneChatMessage {
  const full: PhoneChatMessage = { id: message.id || randomId('pc-msg'), atMs: message.atMs ?? Date.now(), role: message.role, text: message.text, ...(message.requestId ? { requestId: message.requestId } : {}) };
  localStorage.setItem(PHONE_CHAT_KEY, JSON.stringify([...listPhoneChat(), full].slice(-PHONE_CHAT_LIMIT)));
  for (const listener of listeners) listener();
  return full;
}

export function onPhoneChatChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
