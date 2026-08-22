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
  runVisualWorkflow: vi.fn().mockReturnValue({
    ok: true,
    run: { id: 'wf-run-123456', status: 'queued', progress: { totalStages: 1, completedStages: 0, blockedStages: 0 } }
  }),
  executeWorkflowRun: vi.fn().mockResolvedValue({
    ok: true,
    run: { id: 'wf-run-123456', status: 'completed', progress: { totalStages: 1, completedStages: 1, blockedStages: 0 } }
  }),
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
import { listWorkflows } from '../../services/workflowBuilderService';
import { runVisualWorkflow, executeWorkflowRun } from '../../services/workflowExecutionService';

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

  // Regression for a real QA finding (Q&A E2E Test.md N-4): clicking Run on
  // a workflow with real steps produced "no run, no error, no history, no
  // dead-letter entry" — root cause was runVisualWorkflow() only ever
  // creating a queued run record and never actually executing it.
  it('actually executes the run (not just queues it) when Run is clicked', async () => {
    vi.mocked(listWorkflows).mockReturnValue([
      {
        id: 'wf-1', name: 'Test Workflow', agentScope: 'any',
        nodes: [{ id: 'n1', type: 'trigger', label: 'Trigger', config: {} }],
        edges: []
      },
    ]);

    render(<WorkflowBuilderView />);
    fireEvent.click(screen.getByText('Test Workflow'));

    const runButton = await screen.findByRole('button', { name: /run/i });
    expect(runButton).not.toBeDisabled();
    fireEvent.click(runButton);

    await vi.waitFor(() => {
      expect(runVisualWorkflow).toHaveBeenCalledWith('wf-1', expect.objectContaining({ initiatedBy: 'user' }));
    });
    // The actual fix: executeWorkflowRun must be called with the queued
    // run's real id — not left as a queued-forever run with no follow-up.
    await vi.waitFor(() => {
      expect(executeWorkflowRun).toHaveBeenCalledWith('wf-run-123456');
    });
    expect(await screen.findByText(/run completed/i)).toBeInTheDocument();
  });

  it('surfaces a partial/blocked outcome instead of a silent success message', async () => {
    vi.mocked(listWorkflows).mockReturnValue([
      {
        id: 'wf-1', name: 'Test Workflow', agentScope: 'any',
        nodes: [{ id: 'n1', type: 'trigger', label: 'Trigger', config: {} }],
        edges: []
      },
    ]);
    vi.mocked(executeWorkflowRun).mockResolvedValue({
      ok: true,
      run: { id: 'wf-run-123456', status: 'partial', progress: { totalStages: 2, completedStages: 1, blockedStages: 1 } }
    });

    render(<WorkflowBuilderView />);
    fireEvent.click(screen.getByText('Test Workflow'));
    const runButton = await screen.findByRole('button', { name: /run/i });
    fireEvent.click(runButton);

    expect(await screen.findByText(/1 stage blocked/i)).toBeInTheDocument();
  });
});