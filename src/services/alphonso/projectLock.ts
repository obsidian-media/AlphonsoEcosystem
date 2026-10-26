// One request changes a project at a time (agent phase 6). A lock older than the longest a
// project request may run (JOSE_LIMITS.projectMs) is stale.
import { JOSE_LIMITS } from '../jose/stepGraph';

const LOCKS_KEY = 'alphonso_project_locks_v1';

interface Lock { requestId: string; sinceMs: number }

const key = (folder: string) => String(folder || '').trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

function read(): Record<string, Lock> {
  try { return JSON.parse(localStorage.getItem(LOCKS_KEY) || '{}') || {}; } catch { return {}; }
}

function write(locks: Record<string, Lock>): void {
  try { localStorage.setItem(LOCKS_KEY, JSON.stringify(locks)); } catch { /* storage full */ }
}

export function busyLine(name: string): string {
  return `Waiting: ${name} is busy with another request.`;
}

export function claimProject(folder: string, requestId: string, nowMs: number = Date.now()): { ok: true } | { ok: false; heldBy: string } {
  const locks = read();
  const held = locks[key(folder)];
  if (held && held.requestId !== requestId && nowMs - held.sinceMs <= JOSE_LIMITS.projectMs) return { ok: false, heldBy: held.requestId };
  locks[key(folder)] = { requestId, sinceMs: held?.requestId === requestId ? held.sinceMs : nowMs };
  write(locks);
  return { ok: true };
}

export function projectHolder(folder: string): string | null {
  return read()[key(folder)]?.requestId || null;
}

/** Frees the project; returns whether this request held it. */
export function releaseProject(folder: string, requestId: string): boolean {
  const locks = read();
  if (locks[key(folder)]?.requestId !== requestId) return false;
  delete locks[key(folder)];
  write(locks);
  return true;
}
