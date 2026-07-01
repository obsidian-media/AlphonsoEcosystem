import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/durableStore', () => ({
  durableGet: vi.fn(() => null),
  durableSet: vi.fn(),
}));

vi.mock('../../services/runtimeLedgerService', () => ({
  persistScopeRows: vi.fn(),
}));

vi.mock('../../services/toolNotificationDispatcher', () => ({
  dispatchReceiptNotifications: vi.fn().mockResolvedValue(undefined),
}));

import { executeParallel, executeBatch, executeWithRetry, createTaskQueue } from '../../services/parallelExecutionService';

describe('parallelExecutionService', () => {
  describe('executeParallel', () => {
    it('executes all tasks and returns results', async () => {
      const tasks = [
        { id: 't1', execute: async () => 'a' },
        { id: 't2', execute: async () => 'b' },
        { id: 't3', execute: async () => 'c' },
      ];
      const results = await executeParallel(tasks);
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('returns results in task order', async () => {
      const tasks = [
        { id: 't1', execute: async () => 1 },
        { id: 't2', execute: async () => 2 },
      ];
      const results = await executeParallel(tasks);
      expect(results[0].id).toBe('t1');
      expect(results[1].id).toBe('t2');
      expect(results[0].result).toBe(1);
      expect(results[1].result).toBe(2);
    });

    it('handles task failures gracefully', async () => {
      const tasks = [
        { id: 't1', execute: async () => 'ok' },
        { id: 't2', execute: async () => { throw new Error('fail'); } },
      ];
      const results = await executeParallel(tasks);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error?.message).toBe('fail');
    });

    it('respects maxConcurrency', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;
      const tasks = Array.from({ length: 10 }, (_, i) => ({
        id: `t${i}`,
        execute: async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise(r => setTimeout(r, 10));
          concurrent--;
          return i;
        },
      }));
      await executeParallel(tasks, { maxConcurrency: 2 });
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('stops on failFast when a task fails', async () => {
      const results = await executeParallel([
        { id: 't1', execute: async () => { throw new Error('boom'); } },
        { id: 't2', execute: async () => 'ok' },
      ], { failFast: true, maxConcurrency: 1 });
      expect(results[0].success).toBe(false);
      // With failFast + maxConcurrency:1, t2 should not execute
      expect(results).toHaveLength(1);
    });

    it('sorts tasks by priority', async () => {
      const order: string[] = [];
      const tasks = [
        { id: 'low', execute: async () => { order.push('low'); return 1; }, priority: 1 },
        { id: 'high', execute: async () => { order.push('high'); return 2; }, priority: 10 },
        { id: 'med', execute: async () => { order.push('med'); return 3; }, priority: 5 },
      ];
      await executeParallel(tasks, { maxConcurrency: 1 });
      expect(order).toEqual(['high', 'med', 'low']);
    });

    it('returns durationMs for each result', async () => {
      const tasks = [{ id: 't1', execute: async () => 'ok' }];
      const results = await executeParallel(tasks);
      expect(typeof results[0].durationMs).toBe('number');
      expect(results[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns empty array for empty input', async () => {
      const results = await executeParallel([]);
      expect(results).toEqual([]);
    });
  });

  describe('executeBatch', () => {
    it('processes all items', async () => {
      const items = [1, 2, 3];
      const results = await executeBatch(items, async (item) => item * 2);
      expect(results).toEqual([2, 4, 6]);
    });

    it('returns null for failed items', async () => {
      const items = [1, 2, 3];
      const results = await executeBatch(items, async (item) => {
        if (item === 2) throw new Error('fail');
        return item;
      });
      expect(results).toEqual([1, null, 3]);
    });
  });

  describe('executeWithRetry', () => {
    it('returns on first success', async () => {
      let attempts = 0;
      const result = await executeWithRetry(async () => {
        attempts++;
        return 'ok';
      }, 3, 10);
      expect(result).toBe('ok');
      expect(attempts).toBe(1);
    });

    it('retries on failure then succeeds', async () => {
      let attempts = 0;
      const result = await executeWithRetry(async () => {
        attempts++;
        if (attempts < 3) throw new Error('not yet');
        return 'done';
      }, 3, 10);
      expect(result).toBe('done');
      expect(attempts).toBe(3);
    });

    it('throws after all retries exhausted', async () => {
      await expect(
        executeWithRetry(async () => {
          throw new Error('always fails');
        }, 2, 10)
      ).rejects.toThrow('always fails');
    });
  });

  describe('createTaskQueue', () => {
    it('starts with size 0', () => {
      const queue = createTaskQueue();
      expect(queue.size).toBe(0);
    });

    it('adds tasks to queue', async () => {
      const queue = createTaskQueue(1);
      // Use a task that blocks so queue doesn't drain immediately
      let resolve: () => void;
      const blocker = new Promise<void>(r => { resolve = r; });
      queue.add({ id: 't1', execute: async () => { await blocker; return 1; } });
      // Give processQueue a tick to start
      await new Promise(r => setTimeout(r, 5));
      expect(queue.size).toBe(0); // task was picked up by worker
      resolve!();
    });

    it('flushes all tasks', async () => {
      const results: number[] = [];
      const queue = createTaskQueue(2);
      queue.add({ id: 't1', execute: async () => { results.push(1); return 1; } });
      queue.add({ id: 't2', execute: async () => { results.push(2); return 2; } });
      queue.add({ id: 't3', execute: async () => { results.push(3); return 3; } });
      await queue.flush();
      expect(results).toHaveLength(3);
    });
  });
});
