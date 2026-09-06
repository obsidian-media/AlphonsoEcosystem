import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../../services/workflowOperationsRegistryService', () => ({
  listWorkflowOperations: vi.fn(() => [])
}));
vi.mock('../../services/workflowExecutionService', () => ({
  approveWorkflowRun: vi.fn(),
  executeWorkflowRun: vi.fn(),
  listWorkflowRuns: vi.fn(() => []),
  listWorkflowRunTimeline: vi.fn(() => []),
  startWorkflowRun: vi.fn()
}));
vi.mock('../../services/workflowReceiptService', () => ({
  listWorkflowReceipts: vi.fn(() => [])
}));
vi.mock('../../services/workflowTelemetryService', () => ({
  listWorkflowTelemetry: vi.fn(() => []),
  summarizeWorkflowTelemetry: vi.fn(() => ({ totalRuns: 0 }))
}));
vi.mock('../../services/workflowMemoryService', () => ({
  listWorkflowMemory: vi.fn(() => [])
}));
vi.mock('../../services/workflowGovernanceService', () => ({
  getAgentWorkflowParticipation: vi.fn(() => ({})
  )
}));
vi.mock('../../services/agentContractService', () => ({
  AGENT_EXECUTION_CONTRACTS: { alphonso: { allowedActions: ['*'] } }
}));
vi.mock('../AgentAvatar', () => ({ AgentAvatar: vi.fn(() => null) }));

import { WorkflowOperationsDashboard } from '../../components/WorkflowOperationsDashboard';
import { listWorkflowOperations } from '../../services/workflowOperationsRegistryService';
import { listWorkflowRuns } from '../../services/workflowExecutionService';

describe('WorkflowOperationsDashboard', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders without crashing', () => {
    const { container } = render(<WorkflowOperationsDashboard settings={{}} />);
    expect(container).toBeTruthy();
  });

  it('renders with workflow operations', () => {
    (listWorkflowOperations as any).mockReturnValueOnce([
      { id: 'w1', name: 'Build release', status: 'ready' }
    ]);
    const { container } = render(<WorkflowOperationsDashboard settings={{}} />);
    expect(container).toBeTruthy();
  });

  it('renders with workflow runs', () => {
    (listWorkflowRuns as any).mockReturnValueOnce([
      { id: 'r1', workflowId: 'w1', status: 'running' }
    ]);
    const { container } = render(<WorkflowOperationsDashboard settings={{}} />);
    expect(container).toBeTruthy();
  });
});