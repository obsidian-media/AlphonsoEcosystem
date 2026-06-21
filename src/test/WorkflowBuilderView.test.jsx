import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Module-level state for mockWorkflows so createWorkflow can mutate it across calls
let mockWorkflows = [];

vi.mock('../services/workflowBuilderService', () => ({
  listWorkflows: vi.fn(() => [...mockWorkflows]),
  createWorkflow: vi.fn((name) => {
    const wf = { id: `wf-${Date.now()}`, name, nodes: [], edges: [] };
    mockWorkflows.push(wf);
    return wf;
  }),
  updateWorkflow: vi.fn(),
  addWorkflowNode: vi.fn((wfId, type) => ({ id: 'node-1', type })),
  WORKFLOW_NODE_LIBRARY: [
    { id: 'trigger', label: 'Trigger', type: 'trigger', description: 'Start the workflow', category: 'control' },
    { id: 'action', label: 'Action', type: 'action', description: 'Execute an action', category: 'execution' },
    { id: 'condition', label: 'Condition', type: 'condition', description: 'Branch logic', category: 'control' },
  ]
}));

import { WorkflowBuilderView } from '../components/WorkflowBuilderView.jsx';
import { listWorkflows, createWorkflow } from '../services/workflowBuilderService';

describe('WorkflowBuilderView', () => {
  beforeEach(() => {
    mockWorkflows = [];
    listWorkflows.mockClear();
    createWorkflow.mockClear();
    // Reset implementations after clearing
    listWorkflows.mockImplementation(() => [...mockWorkflows]);
    createWorkflow.mockImplementation((name) => {
      const wf = { id: `wf-${Date.now()}`, name, nodes: [], edges: [] };
      mockWorkflows.push(wf);
      return wf;
    });
  });

  it('renders without crash', () => {
    const { container } = render(<WorkflowBuilderView />);
    expect(container).toBeTruthy();
  });

  it('shows "No workflows yet" empty state when no workflows', () => {
    render(<WorkflowBuilderView />);
    expect(screen.getByText(/No workflows yet/i)).toBeTruthy();
  });

  it('shows "Workflows (0)" count in sidebar', () => {
    render(<WorkflowBuilderView />);
    expect(screen.getByText(/Workflows \(0\)/i)).toBeTruthy();
  });

  it('input field for new workflow name exists', () => {
    render(<WorkflowBuilderView />);
    const input = screen.getByPlaceholderText(/New workflow name/i);
    expect(input).toBeTruthy();
  });

  it('clicking + button with a name calls createWorkflow', () => {
    render(<WorkflowBuilderView />);
    const input = screen.getByPlaceholderText(/New workflow name/i);
    fireEvent.change(input, { target: { value: 'My Workflow' } });
    // The + button is the only button in the sidebar create row
    const plusBtn = screen.getByRole('button', { name: '' });
    // Find button by querying all buttons and picking the one with Plus icon (no text)
    const allButtons = screen.getAllByRole('button');
    // The create button is disabled when empty — after typing it should be enabled
    const createBtn = allButtons.find(btn => !btn.disabled && btn.querySelector('svg'));
    fireEvent.click(createBtn || allButtons[0]);
    expect(createWorkflow).toHaveBeenCalledWith('My Workflow');
  });

  it('pressing Enter in input creates workflow', () => {
    render(<WorkflowBuilderView />);
    const input = screen.getByPlaceholderText(/New workflow name/i);
    fireEvent.change(input, { target: { value: 'Enter Workflow' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(createWorkflow).toHaveBeenCalledWith('Enter Workflow');
  });

  it('right panel shows "Select or create a workflow" empty state', () => {
    render(<WorkflowBuilderView />);
    expect(screen.getByText(/Select or create a workflow/i)).toBeTruthy();
  });
});
