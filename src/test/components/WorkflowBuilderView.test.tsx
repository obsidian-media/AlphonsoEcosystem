import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../services/workflowBuilderService', () => ({
  WORKFLOW_NODE_LIBRARY: [
    { type: 'trigger', label: 'Trigger' },
    { type: 'action', label: 'Action' },
    { type: 'notification', label: 'Notification' },
  ],
  listWorkflows: vi.fn().mockReturnValue([
    { id: 'wf-1', name: 'Test Workflow', nodes: [], edges: [], agentScope: 'any' },
  ]),
  createWorkflow: vi.fn().mockImplementation((name: string) => ({
    id: 'wf-new', name, nodes: [], edges: [], agentScope: 'any',
  })),
  updateWorkflow: vi.fn().mockResolvedValue(undefined),
  addWorkflowNode: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/workflowExecutionService', () => ({
  runVisualWorkflow: vi.fn().mockResolvedValue({ runId: 'run-123456' }),
}));

vi.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="chevron-down">v</span>,
  ChevronRight: () => <span data-testid="chevron-right">&gt;</span>,
  ChevronUp: () => <span data-testid="chevron-up">^</span>,
  Plus: () => <span data-testid="plus">+</span>,
  Trash2: () => <span data-testid="trash">x</span>,
  Save: () => <span data-testid="save">S</span>,
  GitBranch: () => <span data-testid="git-branch">B</span>,
  Play: () => <span data-testid="play">P</span>,
  Loader2: () => <span data-testid="loader">L</span>,
  CheckCircle2: () => <span data-testid="check-circle">OK</span>,
  XCircle: () => <span data-testid="x-circle">X</span>,
}));

import { WorkflowBuilderView } from '../../components/WorkflowBuilderView';

describe('WorkflowBuilderView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<WorkflowBuilderView />);
    expect(container.firstChild).toBeTruthy();
  });

  it('shows the workflow list sidebar', () => {
    render(<WorkflowBuilderView />);
    expect(screen.getByText('Test Workflow')).toBeTruthy();
  });

  it('creates a new workflow', () => {
    render(<WorkflowBuilderView />);
    const input = screen.getByPlaceholderText('New workflow name');
    fireEvent.change(input, { target: { value: 'My New WF' } });
    const createBtn = screen.getByText('+').closest('button');
    if (createBtn) fireEvent.click(createBtn);
  });

  it('shows empty state when no workflow selected', () => {
    render(<WorkflowBuilderView />);
    expect(screen.getByText('Select or create a workflow')).toBeTruthy();
  });
});