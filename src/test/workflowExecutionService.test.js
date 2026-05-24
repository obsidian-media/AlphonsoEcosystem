import { beforeEach, describe, expect, it } from 'vitest';
import { listWorkflowOperations } from '../services/workflowOperationsRegistryService';
import { executeWorkflowRun, listWorkflowRunTimeline, startWorkflowRun } from '../services/workflowExecutionService';
import { listWorkflowReceipts } from '../services/workflowReceiptService';

describe('workflowExecutionService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates setup-required or approval-gated run with receipts-friendly status', () => {
    const wf = listWorkflowOperations().find((row) => row.id === 'wf-marketing-operations');
    const run = startWorkflowRun(wf.id, {
      triggerType: 'manual_command',
      input: 'Run a growth campaign.',
      zeroCostMode: true
    });
    expect(run.ok).toBe(true);
    expect(['approval_required', 'setup_required', 'queued', 'blocked']).toContain(run.run.status);
    expect(run.run.workflowId).toBe('wf-marketing-operations');

    const receipts = listWorkflowReceipts({ workflowRunId: run.run.id });
    expect(receipts.length).toBeGreaterThan(0);
    expect(['approval_required', 'setup_required', 'blocked', 'queued']).toContain(receipts[0].status);
  });

  it('executes low-risk learning run and creates timeline', () => {
    const wf = listWorkflowOperations().find((row) => row.id === 'wf-learning-skill-development');
    const started = startWorkflowRun(wf.id, {
      triggerType: 'manual_command',
      input: 'Create a learning plan for Rust.'
    });
    const result = executeWorkflowRun(started.run.id);
    expect(result.ok).toBe(true);
    expect(['completed', 'partial']).toContain(result.run.status);
    const timeline = listWorkflowRunTimeline(started.run.id);
    expect(timeline.length).toBeGreaterThan(0);
  });
});
