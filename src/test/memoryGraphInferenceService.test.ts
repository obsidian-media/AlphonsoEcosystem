import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../services/memoryGraphService', () => ({
  listAllNodes: vi.fn(),
  inferEdges: vi.fn()
}));

import { listAllNodes, inferEdges } from '../services/memoryGraphService';
import {
  runScheduledInferencePass,
  startMemoryGraphInferenceScheduler,
  stopMemoryGraphInferenceScheduler
} from '../services/memoryGraphInferenceService';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  stopMemoryGraphInferenceScheduler();
  vi.useRealTimers();
});

describe('runScheduledInferencePass', () => {
  it('does nothing when there are no nodes', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([]);
    await runScheduledInferencePass();
    expect(inferEdges).not.toHaveBeenCalled();
  });

  it('calls inferEdges with a batch capped at 20 node ids and cap 20', async () => {
    const nodes = Array.from({ length: 30 }, (_, i) => ({
      id: `node-${i}`,
      nodeType: 'memory_item',
      refId: `${i}`,
      createdAtMs: i
    }));
    vi.mocked(listAllNodes).mockResolvedValue(nodes);
    vi.mocked(inferEdges).mockResolvedValue([]);

    await runScheduledInferencePass();

    expect(inferEdges).toHaveBeenCalledTimes(1);
    const [scopeArg, capArg] = vi.mocked(inferEdges).mock.calls[0];
    expect(scopeArg).toHaveLength(20);
    expect(capArg).toBe(20);
    for (const id of scopeArg) {
      expect(nodes.some((n) => n.id === id)).toBe(true);
    }
  });

  it('fetches all 500 nodes to sample from', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([]);
    await runScheduledInferencePass();
    expect(listAllNodes).toHaveBeenCalledWith(500);
  });
});

describe('startMemoryGraphInferenceScheduler / stopMemoryGraphInferenceScheduler', () => {
  it('does not throw when stopped without starting', () => {
    expect(() => stopMemoryGraphInferenceScheduler()).not.toThrow();
  });

  it('runs a pass on the configured interval', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([]);
    startMemoryGraphInferenceScheduler(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(listAllNodes).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(listAllNodes).toHaveBeenCalledTimes(2);
  });

  it('does not schedule a second interval if already running', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([]);
    startMemoryGraphInferenceScheduler(1000);
    startMemoryGraphInferenceScheduler(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(listAllNodes).toHaveBeenCalledTimes(1);
  });

  it('stops firing after stopMemoryGraphInferenceScheduler', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([]);
    startMemoryGraphInferenceScheduler(1000);
    stopMemoryGraphInferenceScheduler();
    await vi.advanceTimersByTimeAsync(5000);
    expect(listAllNodes).not.toHaveBeenCalled();
  });

  it('defaults to a 30-minute interval when none is given', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([]);
    startMemoryGraphInferenceScheduler();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000 - 1);
    expect(listAllNodes).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(listAllNodes).toHaveBeenCalledTimes(1);
  });
});
