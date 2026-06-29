import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/durableStore', () => ({
  durableGet: vi.fn(() => null),
  durableSet: vi.fn(),
  durableRemove: vi.fn(),
}));

vi.mock('../../services/agentBusService', () => ({
  sendAgentMessage: vi.fn()
}));

import { delegate, getTaskStatus, updateTaskResult, listActiveTasks, listTasksByAgent } from '../../services/a2aProtocolService';

describe('a2aProtocolService', () => {
  const storage = {};
  const localStorageMock = {
    getItem: vi.fn((k) => storage[k] ?? null),
    setItem: vi.fn((k, v) => { storage[k] = v; }),
    removeItem: vi.fn((k) => { delete storage[k]; }),
  };

  beforeEach(() => {
    Object.keys(storage).forEach(k => delete storage[k]);
    vi.stubGlobal('localStorage', localStorageMock);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01'));
  });

  describe('delegate', () => {
    it('creates task with delegate ID', () => {
      const task = delegate('jose', 'hector', 'research task', { workspaceId: 'ws-1' });
      expect(task.delegateId).toMatch(/^a2a_/);
      expect(task.fromAgent).toBe('jose');
      expect(task.toAgent).toBe('hector');
      expect(task.status).toBe('pending');
    });

    it('includes context and requirements', () => {
      const task = delegate('jose', 'miya', 'design', {}, { capabilities: ['ui'] });
      expect(task.context).toEqual({});
      expect(task.requirements).toEqual({ capabilities: ['ui'] });
    });

    it('adds log entry on creation', () => {
      const task = delegate('alphonso', 'echo', 'archive', {});
      expect(task.logs.length).toBeGreaterThan(0);
    });
  });

  describe('getTaskStatus', () => {
    it('returns null for non-existent task', () => {
      expect(getTaskStatus('nonexistent')).toBeNull();
    });

    it('returns task for existing delegate ID', () => {
      const created = delegate('jose', 'hector', 'task', {});
      const result = getTaskStatus(created.delegateId);
      expect(result).not.toBeNull();
      expect(result?.delegateId).toBe(created.delegateId);
    });
  });

  describe('updateTaskResult', () => {
    it('updates task with result', () => {
      const task = delegate('jose', 'miya', 'task', {});
      updateTaskResult(task.delegateId, { done: true }, ['completed']);
      const updated = getTaskStatus(task.delegateId);
      expect(updated?.status).toBe('completed');
      expect(updated?.result).toEqual({ done: true });
    });

    it('marks as failed on error', () => {
      const task = delegate('jose', 'alphonso', 'task', {});
      updateTaskResult(task.delegateId, null, [], 'error message');
      const updated = getTaskStatus(task.delegateId);
      expect(updated?.status).toBe('failed');
    });
  });

  describe('listActiveTasks', () => {
    it('returns pending and running tasks', () => {
      delegate('jose', 'hector', 'task1', {});
      delegate('jose', 'miya', 'task2', {});
      const active = listActiveTasks();
      expect(active.length).toBe(2);
    });

    it('excludes completed tasks', () => {
      const task = delegate('jose', 'alphonso', 'task', {});
      updateTaskResult(task.delegateId, {}, [], undefined);
      expect(listActiveTasks().length).toBe(0);
    });
  });

  describe('listTasksByAgent', () => {
    it('returns tasks where agent is sender or receiver', () => {
      delegate('jose', 'hector', 'task1', {});
      delegate('miya', 'jose', 'task2', {});
      const joseTasks = listTasksByAgent('jose');
      expect(joseTasks.length).toBe(2);
    });

    it('returns empty for agent with no tasks', () => {
      expect(listTasksByAgent('unknown')).toEqual([]);
    });
  });
});