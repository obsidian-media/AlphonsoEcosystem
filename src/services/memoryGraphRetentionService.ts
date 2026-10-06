import { invoke } from '@tauri-apps/api/core';
import { appendAgentActivity } from './agentActivityService';
import { listAllThreadMessages } from './boardroomThreadService';
import { hydrateFromDurable, listMemory } from './unifiedMemoryService';

/**
 * Memory knowledge graph -- Phase 4 (governance): retention + pruning policy.
 * Design: docs/superpowers/specs/2026-10-06-memory-knowledge-graph-phase4-governance-design.md
 *
 * Echo owns the retention vocabulary (permanent / standard_180d / ephemeral_7d,
 * see echoMemoryService.ts); this file turns it into the plain numbers and id
 * lists the Rust `memory_graph_prune` command executes. It only ever touches
 * graph rows, never the memory items themselves.
 */

export const GRAPH_RETENTION = {
  nodeWindowDays: {
    receipt: 90,
    packet: 90,
    boardroom_message: 180,
    research_report: 180,
    source: 180
  } as Record<string, number>,
  inferredEdgeDays: 30,
  protectAccessedDays: 14,
  maxRemoveFraction: 0.5,
  ephemeralDays: 7,
  standardDays: 180
} as const;

export interface PruneReport {
  dryRun: boolean;
  aborted: boolean;
  abortReason: string | null;
  totalNodes: number;
  totalEdges: number;
  nodesRemoved: number;
  edgesRemoved: number;
  protectedNodes: number;
  withinWindowNodes: number;
  removedByType: Record<string, number>;
}

interface MemoryItemRetention {
  refId: string;
  days: number | null;
}

const AUTO_KEY = 'alphonso_memory_graph_autocleanup_v1';
const LAST_PREVIEW_KEY = 'alphonso_memory_graph_last_preview_v1';
const LAST_AUTO_RUN_KEY = 'alphonso_memory_graph_last_autorun_v1';
const DAY_MS = 86_400_000;
// A real cleanup must follow a Preview that is not stale and did not abort.
const PREVIEW_VALID_MS = 30 * 60 * 1000;

function readNumber(key: string): number {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable: preview gating then fails closed (no recent preview)
  }
}

interface MemoryItemLike {
  id?: string;
  retentionPolicy?: string;
  content?: unknown;
}

/** Echo stores its classified policy inside content; other writers use the top-level field. */
export function resolveItemRetentionDays(item: MemoryItemLike): number | null {
  const nested =
    item.content && typeof item.content === 'object'
      ? (item.content as { retentionPolicy?: string }).retentionPolicy
      : undefined;
  const policy = nested || item.retentionPolicy;
  if (policy === 'permanent') return null;
  if (policy === 'ephemeral_7d') return GRAPH_RETENTION.ephemeralDays;
  return GRAPH_RETENTION.standardDays;
}

async function liveMemoryItems(): Promise<MemoryItemRetention[]> {
  // Pull durable-only rows into the local view first so a row that exists only
  // in SQLite is not mistaken for a deleted item (and its node pruned as an orphan).
  try {
    await hydrateFromDurable();
  } catch {
    // listMemory below still reflects the local view
  }
  const rows = listMemory() as MemoryItemLike[];
  return rows
    .filter((r): r is MemoryItemLike & { id: string } => typeof r?.id === 'string')
    .map((r) => ({ refId: r.id, days: resolveItemRetentionDays(r) }));
}

/** Threads that escalated or that the user acknowledged/confirmed keep every message. */
export function protectedBoardroomMessageIds(): string[] {
  try {
    const messages = listAllThreadMessages();
    const keepThreads = new Set(
      messages
        .filter((m) => m.kind === 'escalation' || m.acknowledged || m.confirmed)
        .map((m) => m.threadId)
    );
    return messages.filter((m) => keepThreads.has(m.threadId)).map((m) => m.id);
  } catch {
    return [];
  }
}

async function runPrune(dryRun: boolean): Promise<PruneReport | null> {
  const memoryItems = await liveMemoryItems();
  try {
    const report = await invoke<PruneReport>('memory_graph_prune', {
      policy: {
        nodeWindowDays: GRAPH_RETENTION.nodeWindowDays,
        // No items at all usually means storage was unreadable, not that every
        // memory was deleted -- send null so Rust protects memory_item nodes.
        memoryItems: memoryItems.length > 0 ? memoryItems : null,
        protectedRefIds: protectedBoardroomMessageIds(),
        inferredEdgeDays: GRAPH_RETENTION.inferredEdgeDays,
        protectAccessedDays: GRAPH_RETENTION.protectAccessedDays,
        maxRemoveFraction: GRAPH_RETENTION.maxRemoveFraction,
        dryRun
      }
    });
    return report ?? null;
  } catch {
    return null;
  }
}

/** Dry run: reports exactly what a cleanup would remove and deletes nothing. */
export async function previewMemoryGraphCleanup(): Promise<PruneReport | null> {
  const report = await runPrune(true);
  if (report && !report.aborted) {
    writeValue(LAST_PREVIEW_KEY, String(Date.now()));
  }
  return report;
}

export type CleanupRefusal = 'preview_required';

/**
 * Real cleanup. Refuses unless a non-aborted Preview ran in the last 30
 * minutes, so nobody can delete without having seen the report first.
 */
export async function runMemoryGraphCleanup(): Promise<PruneReport | { refused: CleanupRefusal } | null> {
  if (Date.now() - readNumber(LAST_PREVIEW_KEY) > PREVIEW_VALID_MS) {
    return { refused: 'preview_required' };
  }
  const report = await runPrune(false);
  if (report) recordCleanup(report, 'manual');
  return report;
}

function recordCleanup(report: PruneReport, via: 'manual' | 'scheduled'): void {
  // Counts only -- never graph or memory content.
  try {
    appendAgentActivity({
      agent: 'echo',
      action: 'memory graph cleanup',
      detail: report.aborted
        ? `aborted (${via}): ${report.abortReason ?? 'guard'}`
        : `pruned ${report.nodesRemoved} nodes / ${report.edgesRemoved} edges (${via})`
    });
  } catch {
    // audit is best-effort
  }
}

export function isAutoCleanupEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Off by default; turning it on requires that a Preview has been run at least once. */
export function setAutoCleanupEnabled(enabled: boolean): boolean {
  if (enabled && readNumber(LAST_PREVIEW_KEY) === 0) return false;
  writeValue(AUTO_KEY, enabled ? 'true' : 'false');
  return true;
}

/**
 * Called after each scheduled inference pass. Runs at most once per 24 hours,
 * and only when the user opted in. The 50% guard in Rust still applies.
 */
export async function runScheduledCleanupIfDue(now: number = Date.now()): Promise<PruneReport | null> {
  if (!isAutoCleanupEnabled()) return null;
  if (now - readNumber(LAST_AUTO_RUN_KEY) < DAY_MS) return null;
  writeValue(LAST_AUTO_RUN_KEY, String(now));
  const report = await runPrune(false);
  if (report) recordCleanup(report, 'scheduled');
  return report;
}
