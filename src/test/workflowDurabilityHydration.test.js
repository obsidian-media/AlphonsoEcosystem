import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('workflow durability hydration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('re-hydrates partial workflow runs with receipts and memory links after reload', async () => {
    const { listWorkflowOperations } = await import('../services/workflowOperationsRegistryService');
    const { approveWorkflowRun, executeWorkflowRun, getWorkflowRun, listWorkflowRunTimeline, startWorkflowRun } = await import('../services/workflowExecutionService');
    const { listWorkflowReceipts } = await import('../services/workflowReceiptService');
    const { listWorkflowMemory } = await import('../services/workflowMemoryService');

    const workflow = listWorkflowOperations().find((row) => row.id === 'wf-marketing-operations');
    expect(workflow).toBeTruthy();

    const started = startWorkflowRun(workflow.id, {
      triggerType: 'manual_command',
      input: 'Run a marketing operations smoke test.',
      zeroCostMode: false
    });
    expect(started.ok).toBe(true);

    approveWorkflowRun(started.run.id, 'test');
    const executed = executeWorkflowRun(started.run.id);
    expect(executed.ok).toBe(true);
    expect(['partial', 'completed']).toContain(executed.run.status);
    expect(executed.run.status).not.toBe('completed');
    expect(executed.run.progress.blockedStages).toBeGreaterThan(0);

    const receiptsBeforeReload = listWorkflowReceipts({ workflowRunId: started.run.id });
    const memoryBeforeReload = listWorkflowMemory(workflow.id, started.run.id);
    const timelineBeforeReload = listWorkflowRunTimeline(started.run.id);
    expect(receiptsBeforeReload.length).toBeGreaterThan(0);
    expect(memoryBeforeReload.length).toBeGreaterThan(0);
    expect(timelineBeforeReload.length).toBeGreaterThan(0);

    vi.resetModules();

    const reloadedExec = await import('../services/workflowExecutionService');
    const reloadedReceipts = await import('../services/workflowReceiptService');
    const reloadedMemory = await import('../services/workflowMemoryService');

    const reloadedRun = reloadedExec.getWorkflowRun(started.run.id);
    expect(reloadedRun).toBeTruthy();
    expect(reloadedRun.status).toBe('partial');
    expect(reloadedRun.progress.blockedStages).toBeGreaterThan(0);
    expect(reloadedRun.stages.some((stage) => ['setup_required', 'approval_required'].includes(stage.state))).toBe(true);
    expect(reloadedReceipts.listWorkflowReceipts({ workflowRunId: started.run.id }).length).toBeGreaterThan(0);
    expect(reloadedMemory.listWorkflowMemory(workflow.id, started.run.id).length).toBeGreaterThan(0);
    expect(reloadedExec.listWorkflowRunTimeline(started.run.id).length).toBeGreaterThan(0);
  });
});
