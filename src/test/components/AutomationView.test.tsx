import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../../services/workflowBuilderService', () => ({
  createWorkflow: vi.fn(),
  listWorkflows: vi.fn(() => [])
}));
vi.mock('../../services/workflowReceiptService', () => ({
  listWorkflowReceipts: vi.fn(() => [])
}));
vi.mock('../../services/workflowOperationsRegistryService', () => ({
  listWorkflowOperations: vi.fn(() => []),
  updateWorkflowOperationStatus: vi.fn()
}));
vi.mock('../../services/joseSchedulerService', () => ({
  createSchedule: vi.fn(),
  listSchedules: vi.fn(() => []),
  saveSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  SCHEDULE_PRESETS: { HOURLY: { id: 'hourly', label: 'Hourly', intervalMs: 3600000 } }
}));
vi.mock('../WorkflowBuilderView', () => ({ WorkflowBuilderView: vi.fn(() => null) }));
vi.mock('../DeadLetterQueueView', () => ({ DeadLetterQueueView: vi.fn(() => null) }));

import { AutomationView } from '../../components/AutomationView';
import { listSchedules } from '../../services/joseSchedulerService';

describe('AutomationView', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders without crashing', () => {
    const { container } = render(<AutomationView />);
    expect(container).toBeTruthy();
  });

  it('renders with schedules', () => {
    (listSchedules as any).mockReturnValueOnce([
      { id: 's1', name: 'Daily digest', presetId: 'hourly', enabled: true, intervalMs: 3600000 }
    ]);
    const { container } = render(<AutomationView />);
    expect(container).toBeTruthy();
  });
});