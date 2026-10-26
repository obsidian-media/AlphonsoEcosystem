// Nova's saved verdicts (agent phase 2, owner 2026-10-25): what /nova and Settings show,
// instead of a "trend" of one number per day over unrelated things.
import { durableGet, durableSet } from '../../lib/durableStore';

export interface SavedVerdict {
  about: string;
  doFirst: string;
  requestId: string | null;
  commandId: string | null;
  atMs: number;
  text: string;
}

const KEY = 'alphonso_nova_verdicts_v1';
const KEPT = 30;
export const NO_VERDICTS = 'No verdicts yet: ask Jose something like "which of these should I do first?"';

function readAll(): SavedVerdict[] {
  try {
    const parsed = JSON.parse(durableGet(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const part = text.slice(0, max);
  const space = part.lastIndexOf(' ');
  return (space > max * 0.6 ? part.slice(0, space) : part).trim();
}

export function saveVerdict(v: SavedVerdict): void {
  const all = [{ ...v, about: cut(String(v.about || ''), 80) }, ...readAll()].slice(0, KEPT);
  try { durableSet(KEY, JSON.stringify(all)); } catch { /* storage full or unavailable: the verdict is still in the request */ }
}

export function listVerdicts(limit = 5): SavedVerdict[] {
  return readAll().slice(0, limit);
}

export function verdictForCommand(commandId: string): SavedVerdict | null {
  if (!commandId) return null;
  return readAll().find((v) => v.commandId === commandId) || null;
}

/** /nova's message and Settings' list: what each was about, what to do first, and when. */
export function verdictsText(list: SavedVerdict[]): string {
  if (!list.length) return NO_VERDICTS;
  const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return list.map((v, i) => `${i + 1}. ${v.about}: do first ${v.doFirst} (${day(v.atMs)})`).join('\n');
}
