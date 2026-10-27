// Echo's cleanup sets (agent phase 7): what he proposed and what you chose. No model here,
// so the Telegram notifications can read a set.
import { randomId } from '../../lib/randomId';

export interface CleanupProposal {
  id: string;
  kind: 'merge' | 'replace' | 'contradiction' | 'drop' | 'promote';
  ids: string[];
  text?: string;
  keep?: string;
  reason: string;
}

export interface CleanupSet {
  id: string;
  atMs: number;
  requestId?: string;
  /** The waiting step that proposed it, so Settings can apply it through that step. */
  stepId?: string;
  proposals: CleanupProposal[];
  status: 'open' | 'applied' | 'dismissed';
  applied?: number;
  /** The old notes were offered in this set. */
  withNotes?: boolean;
}

export const CLEANUP_KEY = 'alphonso_echo_cleanup_v1';

function readSets(): CleanupSet[] {
  try { const v = JSON.parse(localStorage.getItem(CLEANUP_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeSets(sets: CleanupSet[]): void {
  try { localStorage.setItem(CLEANUP_KEY, JSON.stringify(sets.slice(-20))); } catch { /* storage full */ }
}

export function getCleanup(id: string): CleanupSet | null {
  return readSets().find((s) => s.id === id) || null;
}
export function openCleanup(): CleanupSet | null {
  return readSets().filter((s) => s.status === 'open').sort((a, b) => b.atMs - a.atMs)[0] || null;
}
export function saveCleanupSet(input: Omit<CleanupSet, 'id' | 'atMs' | 'status'>): CleanupSet {
  const set: CleanupSet = { ...input, id: randomId('cleanup'), atMs: Date.now(), status: 'open' };
  writeSets([...readSets(), set]);
  return set;
}
export function finishCleanup(id: string, patch: Partial<CleanupSet>): void {
  writeSets(readSets().map((s) => (s.id === id ? { ...s, ...patch } : s)));
}
