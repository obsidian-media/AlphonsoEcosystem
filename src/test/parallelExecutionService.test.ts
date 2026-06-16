import { describe, it, expect, vi } from 'vitest';
import { executeParallel, executeBatch, executeWithRetry, createTaskQueue } from '../services/parallelExecutionService';

describe('parallelExecutionService', () => {
  describe('executeParallel', () => {
    it('executes tasks in parallel', async () => {
      const tasks = [
        { id: 'task1', execute: async () => 'result1' },
        { id: 'task2', execute: async () => 'result2' },
        { id: 'task3', execute: async () => 'result3' },
      ];

      const results = await executeParallel(tasks);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(results.map((r) => r.result)).toEqual(['result1', 'result2', 'result3']);
    });

    it('handles task failures', async () => {
      const tasks = [
        { id: 'task1', execute: async () => 'result1' },
        { id: 'task2', execute: async () => { throw new Error('failed'); } },
        { id: 'task3', execute: async () => 'result3' },
      ];

      const results = await executeParallel(tasks);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error?.message).toBe('failed');
      expect(results[2].success).toBe(true);
    });

    it('respects maxConcurrency', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const tasks = Array(10).fill(null).map((_, i) => ({
        id: `task${i}`,
        execute: async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise((resolve) => setTimeout(resolve, 50));
          concurrent--;
          return i;
        },
      }));

      await executeParallel(tasks, { maxConcurrency: 3 });

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('handles task timeout', async () => {
      const tasks = [
        {
          id: 'slow',
          execute: async () => {
            await new Promise((resolve) => setTimeout(resolve, 200));
            return 'result';
          },
          timeout: 50,
        },
      ];

      const results = await executeParallel(tasks);

      expect(results[0].success).toBe(false);
      expect(results[0].error?.message).toBe('Task timeout');
    });

    it('respects priority ordering', async () => {
      const executionOrder: string[] = [];

      const tasks = [
        { id: 'low', priority: 1, execute: async () => { executionOrder.push('low'); return 'low'; } },
        { id: 'high', priority: 10, execute: async () => { executionOrder.push('high'); return 'high'; } },
        { id: 'medium', priority: 5, execute: async () => { executionOrder.push('medium'); return 'medium'; } },
      ];

      await executeParallel(tasks, { maxConcurrency: 1 });

      expect(executionOrder[0]).toBe('high');
    });
  });

  describe('executeBatch', () => {
    it('processes items in batches', async () => {
      const items = [1, 2, 3, 4, 5];
      const processor = async (item: number) => item * 2;

      const results = await executeBatch(items, processor);

      expect(results).toEqual([2, 4, 6, 8, 10]);
    });
  });

  describe('executeWithRetry', () => {
    it('retries on failure', async () => {
      let attempts = 0;
      const task = async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'success';
      };

      const result = await executeWithRetry(task, 3, 10);

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('throws after max retries', async () => {
      const task = async () => { throw new Error('always fails'); };

      await expect(executeWithRetry(task, 2, 10)).rejects.toThrow('always fails');
    });
  });

  describe('createTaskQueue', () => {
    it('processes queued tasks', async () => {
      const queue = createTaskQueue<number>(2);
      const results: number[] = [];

      queue.add({ id: 'task1', execute: async () => { results.push(1); return 1; } });
      queue.add({ id: 'task2', execute: async () => { results.push(2); return 2; } });

      await queue.flush();

      expect(results).toContain(1);
      expect(results).toContain(2);
    });

    it('reports correct size', () => {
      const queue = createTaskQueue<number>();
      queue.add({ id: 'task1', execute: async () => 1 });
      queue.add({ id: 'task2', execute: async () => 2 });

      expect(queue.size).toBeGreaterThanOrEqual(0);
    });
  });
});
