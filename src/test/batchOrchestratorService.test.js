import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/ollama', () => ({
  generateOllamaResponse: vi.fn().mockResolvedValue({ response: '' }),
  fetchOllamaModels: vi.fn().mockRejectedValue(new Error('Ollama not running')),
  PREFERRED_MODEL: 'llama3.2:3b',
  normalizeEndpoint: vi.fn((e) => e || 'http://localhost:11434'),
  DEFAULT_OLLAMA_ENDPOINT: 'http://localhost:11434'
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({}),
  isTauri: vi.fn().mockReturnValue(false)
}));

const STORAGE_KEY_GOALS = 'alphonso_boardroom_goals_v1';
const STORAGE_KEY_BATCHES = 'alphonso_boardroom_batches_v1';

function localStorageReset() {
  localStorage.removeItem(STORAGE_KEY_GOALS);
  localStorage.removeItem(STORAGE_KEY_BATCHES);
}

describe('batchOrchestratorService', () => {
  beforeEach(() => {
    localStorageReset();
    vi.resetModules();
  });

  async function loadService() {
    return await import('../services/batchOrchestratorService.js');
  }

  describe('createProjectGoal', () => {
    it('creates a goal with correct fields', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Build a SaaS dashboard', 'Analytics platform');
      expect(goal.id).toMatch(/^goal-/);
      expect(goal.goal).toBe('Build a SaaS dashboard');
      expect(goal.description).toBe('Analytics platform');
      expect(goal.status).toBe('active');
      expect(goal.currentBatchNumber).toBe(0);
      expect(goal.totalTasksCompleted).toBe(0);
      expect(goal.totalTasksCreated).toBe(0);
    });

    it('pauses existing active goal when creating new one', async () => {
      const svc = await loadService();
      const g1 = svc.createProjectGoal('First goal');
      expect(g1.status).toBe('active');
      const g2 = svc.createProjectGoal('Second goal');
      expect(g2.status).toBe('active');
      const updated = svc.getActiveGoal();
      expect(updated.id).toBe(g2.id);
      const goals = svc.listGoals();
      const first = goals.find((g) => g.id === g1.id);
      expect(first.status).toBe('paused');
    });
  });

  describe('getActiveGoal / listGoals / updateGoal', () => {
    it('returns null when no active goal', async () => {
      const svc = await loadService();
      expect(svc.getActiveGoal()).toBeNull();
    });

    it('returns the active goal', async () => {
      const svc = await loadService();
      svc.createProjectGoal('Test goal');
      const active = svc.getActiveGoal();
      expect(active).not.toBeNull();
      expect(active.goal).toBe('Test goal');
    });

    it('lists goals in reverse order', async () => {
      const svc = await loadService();
      svc.createProjectGoal('Goal A');
      svc.createProjectGoal('Goal B');
      const goals = svc.listGoals();
      expect(goals.length).toBe(2);
      expect(goals[0].goal).toBe('Goal B');
      expect(goals[1].goal).toBe('Goal A');
    });

    it('updates goal fields', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Original');
      const updated = svc.updateGoal(goal.id, { goal: 'Updated', description: 'New desc' });
      expect(updated.goal).toBe('Updated');
      expect(updated.description).toBe('New desc');
    });

    it('returns null for non-existent goal update', async () => {
      const svc = await loadService();
      expect(svc.updateGoal('nonexistent', { goal: 'X' })).toBeNull();
    });
  });

  describe('generateBatchRuleBased', () => {
    it('returns tasks for dashboard template', async () => {
      const svc = await loadService();
      const tasks = svc.generateBatchRuleBased('Build a SaaS analytics dashboard');
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.length).toBe(10);
      tasks.forEach((t) => {
        expect(t.id).toMatch(/^task-/);
        expect(t.title).toBeTruthy();
        expect(['hector', 'maria', 'miya', 'alphonso', 'marcus', 'jose', 'nova', 'echo', 'sentinel']).toContain(t.agent);
        expect(['low', 'medium', 'high', 'urgent']).toContain(t.priority);
        expect(t.status).toBe('pending');
      });
    });

    it('returns tasks for api template', async () => {
      const svc = await loadService();
      const tasks = svc.generateBatchRuleBased('Build a REST API backend');
      expect(tasks.length).toBe(8);
      const agents = tasks.map((t) => t.agent);
      expect(agents).toContain('maria');
      expect(agents).toContain('alphonso');
    });

    it('returns tasks for mobile template', async () => {
      const svc = await loadService();
      const tasks = svc.generateBatchRuleBased('Build a React Native mobile app');
      expect(tasks.length).toBe(8);
    });

    it('returns tasks for content template', async () => {
      const svc = await loadService();
      const tasks = svc.generateBatchRuleBased('Create a social media marketing campaign');
      expect(tasks.length).toBe(8);
    });

    it('returns general template for unrecognized goal', async () => {
      const svc = await loadService();
      const tasks = svc.generateBatchRuleBased('Do something completely unique');
      expect(tasks.length).toBe(7);
    });
  });

  describe('generateBatch', () => {
    it('creates a batch with rule-based fallback when Ollama unavailable', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Build a dashboard');
      const batch = await svc.generateBatch(goal.id);
      expect(batch.id).toMatch(/^batch-/);
      expect(batch.batchNumber).toBe(1);
      expect(batch.tasks.length).toBe(10);
      expect(batch.generationMode).toBe('rule_based');
      expect(batch.status).toBe('active');
      expect(batch.goalId).toBe(goal.id);
    });

    it('increments batch number on subsequent generations', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Build an API');
      await svc.generateBatch(goal.id);
      const batch2 = await svc.generateBatch(goal.id);
      expect(batch2.batchNumber).toBe(2);
    });

    it('throws for non-existent goal', async () => {
      const svc = await loadService();
      await expect(svc.generateBatch('nonexistent')).rejects.toThrow('Goal nonexistent not found');
    });

    it('updates goal currentBatchNumber', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Test');
      await svc.generateBatch(goal.id);
      const updated = svc.getActiveGoal();
      expect(updated.currentBatchNumber).toBe(1);
    });
  });

  describe('getBatch / listBatches / getActiveBatch', () => {
    it('retrieves a batch by goal and number', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Test');
      await svc.generateBatch(goal.id);
      const batch = svc.getBatch(goal.id, 1);
      expect(batch).not.toBeNull();
      expect(batch.batchNumber).toBe(1);
    });

    it('lists batches sorted by batch number descending', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Test');
      await svc.generateBatch(goal.id);
      await svc.generateBatch(goal.id);
      const batches = svc.listBatches(goal.id);
      expect(batches.length).toBe(2);
      expect(batches[0].batchNumber).toBe(2);
      expect(batches[1].batchNumber).toBe(1);
    });

    it('returns active batch', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Test');
      await svc.generateBatch(goal.id);
      const active = svc.getActiveBatch(goal.id);
      expect(active).not.toBeNull();
      expect(active.status).toBe('active');
    });

    it('returns null when no active batch', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Test');
      expect(svc.getActiveBatch(goal.id)).toBeNull();
    });
  });

  describe('updateTaskStatus', () => {
    it('updates task status to completed', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Test');
      const batch = await svc.generateBatch(goal.id);
      const taskId = batch.tasks[0].id;
      const updated = svc.updateTaskStatus(taskId, 'completed');
      expect(updated.status).toBe('completed');
      expect(updated.completedAtMs).toBeTypeOf('number');
    });

    it('stores artifacts on completion', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Test');
      const batch = await svc.generateBatch(goal.id);
      const taskId = batch.tasks[0].id;
      const updated = svc.updateTaskStatus(taskId, 'completed', [{ type: 'file', path: '/src/test.js' }]);
      expect(updated.artifacts.length).toBe(1);
      expect(updated.artifacts[0].path).toBe('/src/test.js');
    });

    it('marks batch as completed when all tasks done', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Test');
      const batch = await svc.generateBatch(goal.id);
      for (const task of batch.tasks) {
        svc.updateTaskStatus(task.id, 'completed');
      }
      const updatedBatch = svc.getBatch(goal.id, 1);
      expect(updatedBatch.status).toBe('completed');
      expect(updatedBatch.completedAtMs).toBeTypeOf('number');
    });

    it('marks batch completed even with failed tasks', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Test');
      const batch = await svc.generateBatch(goal.id);
      svc.updateTaskStatus(batch.tasks[0].id, 'completed');
      svc.updateTaskStatus(batch.tasks[1].id, 'failed');
      for (let i = 2; i < batch.tasks.length; i++) {
        svc.updateTaskStatus(batch.tasks[i].id, 'completed');
      }
      const updatedBatch = svc.getBatch(goal.id, 1);
      expect(updatedBatch.status).toBe('completed');
    });

    it('updates goal totalTasksCompleted', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Test');
      const batch = await svc.generateBatch(goal.id);
      svc.updateTaskStatus(batch.tasks[0].id, 'completed');
      svc.updateTaskStatus(batch.tasks[1].id, 'completed');
      const updated = svc.getActiveGoal();
      expect(updated.totalTasksCompleted).toBe(2);
    });

    it('returns null for non-existent task', async () => {
      const svc = await loadService();
      expect(svc.updateTaskStatus('nonexistent', 'completed')).toBeNull();
    });
  });

  describe('getBatchProgress', () => {
    it('computes correct progress', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Test');
      const batch = await svc.generateBatch(goal.id);
      svc.updateTaskStatus(batch.tasks[0].id, 'completed');
      svc.updateTaskStatus(batch.tasks[1].id, 'completed');
      svc.updateTaskStatus(batch.tasks[2].id, 'in_progress');
      const progress = svc.getBatchProgress(goal.id, 1);
      expect(progress.total).toBe(batch.tasks.length);
      expect(progress.completed).toBe(2);
      expect(progress.inProgress).toBe(1);
      expect(progress.pending).toBe(batch.tasks.length - 3);
      expect(progress.percent).toBe(Math.round((2 / batch.tasks.length) * 100));
    });

    it('returns zero progress for empty batch', async () => {
      const svc = await loadService();
      const progress = svc.getBatchProgress('nonexistent', 1);
      expect(progress.total).toBe(0);
      expect(progress.percent).toBe(0);
    });
  });

  describe('isBatchComplete', () => {
    it('returns false when tasks are pending', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Test');
      await svc.generateBatch(goal.id);
      expect(svc.isBatchComplete(goal.id, 1)).toBe(false);
    });

    it('returns true when all tasks completed', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Test');
      const batch = await svc.generateBatch(goal.id);
      for (const t of batch.tasks) svc.updateTaskStatus(t.id, 'completed');
      expect(svc.isBatchComplete(goal.id, 1)).toBe(true);
    });
  });

  describe('advanceToNextBatch', () => {
    it('creates next batch when current is complete', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Test');
      const batch1 = await svc.generateBatch(goal.id);
      for (const t of batch1.tasks) svc.updateTaskStatus(t.id, 'completed');
      const batch2 = await svc.advanceToNextBatch(goal.id);
      expect(batch2.batchNumber).toBe(2);
    });

    it('throws when current batch is still active', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Test');
      await svc.generateBatch(goal.id);
      await expect(svc.advanceToNextBatch(goal.id)).rejects.toThrow('Current batch is still active');
    });
  });

  describe('completeGoal', () => {
    it('sets goal status to completed', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Test');
      svc.completeGoal(goal.id);
      const updated = svc.getActiveGoal();
      expect(updated).toBeNull();
      const goals = svc.listGoals();
      expect(goals[0].status).toBe('completed');
    });
  });

  describe('persistence', () => {
    it('data survives re-read from localStorage', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Persistent goal');
      await svc.generateBatch(goal.id);
      const reloaded = svc.getActiveGoal();
      expect(reloaded).not.toBeNull();
      expect(reloaded.goal).toBe('Persistent goal');
      const batches = svc.listBatches(reloaded.id);
      expect(batches.length).toBe(1);
    });
  });

  describe('getGoalProgress', () => {
    it('aggregates across multiple batches', async () => {
      const svc = await loadService();
      const goal = svc.createProjectGoal('Test');
      const b1 = await svc.generateBatch(goal.id);
      for (const t of b1.tasks) svc.updateTaskStatus(t.id, 'completed');
      const b2 = await svc.generateBatch(goal.id);
      svc.updateTaskStatus(b2.tasks[0].id, 'completed');
      const progress = svc.getGoalProgress(goal.id);
      expect(progress.total).toBe(b1.tasks.length + b2.tasks.length);
      expect(progress.completed).toBe(b1.tasks.length + 1);
      expect(progress.batchCount).toBe(2);
    });
  });
});
