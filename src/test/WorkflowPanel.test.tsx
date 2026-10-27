// Jose phase 7: the Workflows panel's Run goes through Jose (a request on the board).
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/workflowRegistryService', () => ({
  listWorkflows: () => [{ id: 'WF_X', name: 'Product Development', purpose: 'Build products.', chain: ['jose', 'hector'] }],
  runWorkflow: vi.fn(async () => ({ ok: true, workflowId: 'WF_X', requestId: 'jose-request-c1', commandId: 'c1' })),
  executeWorkflowTasks: vi.fn(async () => ({ ok: true })),
}));

import { WorkflowPanel } from '../components/WorkflowPanel';
import { runWorkflow, executeWorkflowTasks } from '../services/workflowRegistryService';

describe('WorkflowPanel', () => {
  it("Run asks Jose to run the workflow's agents and says where to follow it", async () => {
    render(<WorkflowPanel onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    await waitFor(() => expect(runWorkflow).toHaveBeenCalledWith('WF_X', { source: 'workflow_panel' }));
    expect(executeWorkflowTasks).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Done: see it on the board.')).toBeTruthy());
  });
});
