import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../services/agentActivityService', () => ({ appendAgentActivity: vi.fn() }));
vi.mock('../services/boardroomThreadService', () => ({ listAllThreadMessages: vi.fn(() => []) }));
vi.mock('../services/unifiedMemoryService', () => ({
  hydrateFromDurable: vi.fn().mockResolvedValue([]),
  listMemory: vi.fn(() => [])
}));

import { invoke } from '@tauri-apps/api/core';
import { appendAgentActivity } from '../services/agentActivityService';
import { listAllThreadMessages } from '../services/boardroomThreadService';
import { hydrateFromDurable, listMemory } from '../services/unifiedMemoryService';
import {
  GRAPH_RETENTION,
  isAutoCleanupEnabled,
  previewMemoryGraphCleanup,
  protectedBoardroomMessageIds,
  resolveItemRetentionDays,
  runMemoryGraphCleanup,
  runScheduledCleanupIfDue,
  setAutoCleanupEnabled
} from '../services/memoryGraphRetentionService';

const report = (over = {}) => ({
  dryRun: true,
  aborted: false,
  abortReason: null,
  totalNodes: 10,
  totalEdges: 12,
  nodesRemoved: 2,
  edgesRemoved: 3,
  protectedNodes: 1,
  withinWindowNodes: 7,
  removedByType: { receipt: 2 },
  ...over
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(listMemory).mockReturnValue([]);
  vi.mocked(listAllThreadMessages).mockReturnValue([]);
});

describe('resolveItemRetentionDays', () => {
  it('maps Echo policies to days, permanent to null', () => {
    expect(resolveItemRetentionDays({ retentionPolicy: 'permanent' })).toBeNull();
    expect(resolveItemRetentionDays({ retentionPolicy: 'ephemeral_7d' })).toBe(7);
    expect(resolveItemRetentionDays({ retentionPolicy: 'standard_180d' })).toBe(180);
    expect(resolveItemRetentionDays({})).toBe(180);
  });

  it("reads Echo's nested content.retentionPolicy over the top-level default", () => {
    expect(
      resolveItemRetentionDays({ retentionPolicy: 'standard', content: { retentionPolicy: 'permanent' } })
    ).toBeNull();
  });
});

describe('protectedBoardroomMessageIds', () => {
  it('keeps every message of a thread that escalated or was acknowledged', () => {
    vi.mocked(listAllThreadMessages).mockReturnValue([
      { id: 'm1', threadId: 't1', kind: 'message', acknowledged: false, confirmed: false },
      { id: 'm2', threadId: 't1', kind: 'escalation', acknowledged: false, confirmed: false },
      { id: 'm3', threadId: 't2', kind: 'message', acknowledged: false, confirmed: false },
      { id: 'm4', threadId: 't3', kind: 'message', acknowledged: true, confirmed: false }
    ] as never);
    expect(protectedBoardroomMessageIds().sort()).toEqual(['m1', 'm2', 'm4']);
  });
});

describe('previewMemoryGraphCleanup', () => {
  it('is a dry run carrying the policy numbers, live items and protected refs', async () => {
    vi.mocked(listMemory).mockReturnValue([
      { id: 'a', retentionPolicy: 'permanent' },
      { id: 'b', retentionPolicy: 'ephemeral_7d' }
    ] as never);
    vi.mocked(invoke).mockResolvedValue(report());
    const r = await previewMemoryGraphCleanup();
    expect(r?.dryRun).toBe(true);
    expect(hydrateFromDurable).toHaveBeenCalled();
    const [cmd, args] = vi.mocked(invoke).mock.calls[0] as [string, { policy: Record<string, unknown> }];
    expect(cmd).toBe('memory_graph_prune');
    expect(args.policy.dryRun).toBe(true);
    expect(args.policy.inferredEdgeDays).toBe(GRAPH_RETENTION.inferredEdgeDays);
    expect(args.policy.memoryItems).toEqual([
      { refId: 'a', days: null },
      { refId: 'b', days: 7 }
    ]);
  });

  it('sends null memoryItems when none can be listed so Rust protects memory nodes', async () => {
    vi.mocked(invoke).mockResolvedValue(report());
    await previewMemoryGraphCleanup();
    const args = vi.mocked(invoke).mock.calls[0][1] as { policy: { memoryItems: unknown } };
    expect(args.policy.memoryItems).toBeNull();
  });

  it('returns null instead of throwing when the backend is unavailable', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('no tauri'));
    expect(await previewMemoryGraphCleanup()).toBeNull();
  });
});

describe('runMemoryGraphCleanup', () => {
  it('refuses to delete until a Preview has run', async () => {
    const r = await runMemoryGraphCleanup();
    expect(r).toEqual({ refused: 'preview_required' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('refuses after an aborted preview', async () => {
    vi.mocked(invoke).mockResolvedValue(report({ aborted: true, abortReason: 'guard' }));
    await previewMemoryGraphCleanup();
    vi.mocked(invoke).mockClear();
    expect(await runMemoryGraphCleanup()).toEqual({ refused: 'preview_required' });
  });

  it('runs a real prune after a good preview and logs counts only', async () => {
    vi.mocked(invoke).mockResolvedValue(report());
    await previewMemoryGraphCleanup();
    vi.mocked(invoke).mockResolvedValue(report({ dryRun: false }));
    const r = await runMemoryGraphCleanup();
    expect(r).toMatchObject({ dryRun: false });
    const args = vi.mocked(invoke).mock.calls.at(-1)![1] as { policy: { dryRun: boolean } };
    expect(args.policy.dryRun).toBe(false);
    expect(appendAgentActivity).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'echo', detail: 'pruned 2 nodes / 3 edges (manual)' })
    );
  });

  it('refuses when the preview is stale', async () => {
    vi.mocked(invoke).mockResolvedValue(report());
    await previewMemoryGraphCleanup();
    const realNow = Date.now;
    Date.now = () => realNow() + 31 * 60 * 1000;
    try {
      expect(await runMemoryGraphCleanup()).toEqual({ refused: 'preview_required' });
    } finally {
      Date.now = realNow;
    }
  });
});

describe('automatic cleanup', () => {
  it('is off by default and cannot be enabled before a Preview', () => {
    expect(isAutoCleanupEnabled()).toBe(false);
    expect(setAutoCleanupEnabled(true)).toBe(false);
    expect(isAutoCleanupEnabled()).toBe(false);
  });

  it('does nothing when disabled', async () => {
    expect(await runScheduledCleanupIfDue()).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('runs at most once per 24 hours once enabled', async () => {
    vi.mocked(invoke).mockResolvedValue(report());
    await previewMemoryGraphCleanup();
    expect(setAutoCleanupEnabled(true)).toBe(true);
    vi.mocked(invoke).mockClear();
    vi.mocked(invoke).mockResolvedValue(report({ dryRun: false }));
    const t0 = Date.now();
    expect(await runScheduledCleanupIfDue(t0)).not.toBeNull();
    expect(await runScheduledCleanupIfDue(t0 + 3_600_000)).toBeNull();
    expect(await runScheduledCleanupIfDue(t0 + 25 * 3_600_000)).not.toBeNull();
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(appendAgentActivity).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.stringContaining('(scheduled)') })
    );
  });
});
