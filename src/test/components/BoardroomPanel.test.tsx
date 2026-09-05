import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../lib/ollama', () => ({
  checkOllamaConnection: vi.fn(async () => ({ connected: false })),
  generateWithOllama: vi.fn(async () => ''),
  listOllamaModels: vi.fn(async () => [])
}));

vi.mock('../../services/batchOrchestratorService', () => ({
  createProjectGoal: vi.fn(async () => ({ id: 'g1' })),
  getActiveGoal: vi.fn(() => null),
  listGoals: vi.fn(() => []),
  updateGoal: vi.fn(),
  completeGoal: vi.fn(),
  generateBatch: vi.fn(async () => ({ id: 'b1' })),
  advanceToNextBatch: vi.fn(),
  listBatches: vi.fn(() => []),
  getActiveBatch: vi.fn(() => null),
  getBatchProgress: vi.fn(() => ({ completed: 0, total: 0 })),
  getGoalProgress: vi.fn(() => ({ completed: 0, total: 0 })),
  updateTaskStatus: vi.fn(),
  executeBatch: vi.fn(),
  getGoalById: vi.fn(() => null)
}));

vi.mock('../../services/projectDirectoryService', () => ({
  setProjectDirectory: vi.fn(),
  getProjectDirectoryPath: vi.fn(() => '/test/project')
}));

vi.mock('framer-motion', () => ({
  motion: { div: 'div', span: 'span' },
  AnimatePresence: vi.fn(({ children }) => children)
}));

import BoardroomPanel from '../../components/BoardroomPanel';
import { listGoals, getActiveGoal, listBatches } from '../../services/batchOrchestratorService';
import { getProjectDirectoryPath } from '../../services/projectDirectoryService';

describe('BoardroomPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders without crashing', () => {
    const { container } = render(<BoardroomPanel />);
    expect(container).toBeTruthy();
  });

  it('shows boardroom heading', () => {
    render(<BoardroomPanel />);
    expect(screen.getByText(/Boardroom/i)).toBeTruthy();
  });

  it('renders with no active goal', () => {
    render(<BoardroomPanel />);
    expect(screen.getByText(/Boardroom/i)).toBeTruthy();
  });

  it('renders with goals list', () => {
    (listGoals as any).mockReturnValueOnce([
      { id: 'g1', title: 'Test Goal', status: 'active', createdAtMs: Date.now() }
    ]);
    render(<BoardroomPanel />);
    expect(screen.getByText(/Boardroom/i)).toBeTruthy();
  });

  it('renders with active goal', () => {
    (getActiveGoal as any).mockReturnValueOnce({
      id: 'g1', title: 'Active Goal', status: 'active', createdAtMs: Date.now()
    });
    (listBatches as any).mockReturnValueOnce([
      { id: 'b1', goalId: 'g1', batchIndex: 0, status: 'completed', taskCount: 3, completedCount: 3 }
    ]);
    render(<BoardroomPanel />);
    expect(screen.getByText(/Boardroom/i)).toBeTruthy();
  });

  it('renders with project directory set', () => {
    (getProjectDirectoryPath as any).mockReturnValueOnce('/my/project');
    render(<BoardroomPanel />);
    expect(screen.getByText(/Boardroom/i)).toBeTruthy();
  });
});
