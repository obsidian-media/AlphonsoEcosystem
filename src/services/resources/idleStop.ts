// Resource manager (2026-10-30): each tool's idle time, the idle stop, and the
// watcher that reads memory while the app is open (main window only).
//
// Idle times are per tool (`alphonso_tool_idle_v1`), "Never" (null) one of the
// choices. Defaults (design §5.3): ComfyUI 15 minutes; everything else Never
// (Voice OS, n8n, ChromaDB, web UIs you open to use). The Ollama program is
// never stopped by the timer; Ollama unloads its own models (keep_alive).
// Only a tool Alphonso started and no step is using is stopped. A tool never
// used counts its idle time from when the watcher first saw it running.
import { stopTool } from '../runtimeManagerService';
import { readResources, type ResourceState } from './resourceState';
import { anyInUse, isInUse, lastUsedAt, usageRecord } from './toolUse';

export const DEFAULT_IDLE_MINUTES: Record<string, number | null> = { comfyui: 15 };
export const FAST_POLL_MS = 3000;
export const SLOW_POLL_MS = 30000;

const IDLE_KEY = 'alphonso_tool_idle_v1';
const MIN = 60_000;

function savedIdle(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(localStorage.getItem(IDLE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getIdleMinutes(tool: string): number | null {
  const all = savedIdle();
  if (tool in all) {
    const value = all[tool];
    if (value === null) return null;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return DEFAULT_IDLE_MINUTES[tool] ?? null;
}

export function setIdleMinutes(tool: string, minutes: number | null): void {
  const all = savedIdle();
  all[tool] = minutes === null ? null : Math.max(1, Math.round(minutes));
  try { localStorage.setItem(IDLE_KEY, JSON.stringify(all)); } catch { /* unavailable */ }
}

const firstSeen = new Map<string, number>();

/** Stops the tools Alphonso started that have sat idle past their time; returns those stopped. */
export async function idleTick(state: ResourceState, nowMs: number): Promise<string[]> {
  const stopped: string[] = [];
  for (const thing of state.loaded) {
    if (thing.kind !== 'tool' || thing.startedBy !== 'alphonso' || thing.name === 'ollama') continue;
    if (thing.inUse || isInUse(thing.name)) continue;
    const minutes = getIdleMinutes(thing.name);
    if (minutes === null) continue;
    if (!firstSeen.has(thing.name)) firstSeen.set(thing.name, nowMs);
    const since = lastUsedAt(thing.name) ?? firstSeen.get(thing.name)!;
    if (nowMs - since < minutes * MIN) continue;
    try {
      const result = await stopTool(thing.name);
      if (result?.ok) {
        stopped.push(thing.name);
        firstSeen.delete(thing.name);
      }
    } catch { /* tried again next reading */ }
  }
  return stopped;
}

type Listener = (state: ResourceState) => void;
const listeners = new Set<Listener>();
let latest: ResourceState | null = null;
let watchers = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export function latestResources(): ResourceState | null {
  return latest;
}

export function onResources(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

async function readOnce(): Promise<void> {
  try {
    const state = await readResources(usageRecord());
    latest = state;
    for (const listener of [...listeners]) {
      try { listener(state); } catch { /* a screen's problem, not the watcher's */ }
    }
    await idleTick(state, Date.now());
  } catch { /* read again next time */ }
}

function schedule(delayMs: number): void {
  timer = setTimeout(async () => {
    timer = null;
    await readOnce();
    if (watchers > 0) schedule(anyInUse() ? FAST_POLL_MS : SLOW_POLL_MS);
  }, delayMs);
}

/** Reads memory every 3 s while a step uses a tool, else every 30 s. One watcher however often started. */
export function startResourceWatcher(): () => void {
  watchers += 1;
  if (watchers === 1) schedule(0);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    watchers -= 1;
    if (watchers === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

export function resetIdleStopForTests(): void {
  firstSeen.clear();
  listeners.clear();
  latest = null;
  watchers = 0;
  if (timer) clearTimeout(timer);
  timer = null;
}
