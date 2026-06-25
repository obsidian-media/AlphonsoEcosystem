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
    const executed = await executeWorkflowRun(started.run.id);
    expect(executed.ok).toBe(true);
    expect(['partial', 'completed']).toContain(executed.run.status);
    expect(executed.run.status).toBe('completed');

    const receiptsBeforeReload = listWorkflowReceipts({ workflowRunId: started.run.id });
    const memoryBeforeReload = listWorkflowMemory(workflow.id, started.run.id);
    const timelineBeforeReload = listWorkflowRunTimeline(started.run.id);
    expect(receiptsBeforeReload.length).toBeGreaterThan(0);
    expect(Array.isArray(memoryBeforeReload)).toBe(true);
    expect(timelineBeforeReload.length).toBeGreaterThan(0);

    vi.resetModules();

    const reloadedExec = await import('../services/workflowExecutionService');
    const reloadedReceipts = await import('../services/workflowReceiptService');
    const reloadedMemory = await import('../services/workflowMemoryService');

    const reloadedRun = reloadedExec.getWorkflowRun(started.run.id);
    expect(reloadedRun).toBeTruthy();
    expect(['partial', 'completed']).toContain(reloadedRun.status);
    expect(typeof reloadedRun.progress.blockedStages).toBe('number');
    expect(Array.isArray(reloadedRun.stages)).toBe(true);
    expect(reloadedReceipts.listWorkflowReceipts({ workflowRunId: started.run.id }).length).toBeGreaterThan(0);
    expect(Array.isArray(reloadedMemory.listWorkflowMemory(workflow.id, started.run.id))).toBe(true);
    expect(reloadedExec.listWorkflowRunTimeline(started.run.id).length).toBeGreaterThan(0);
  });
});
