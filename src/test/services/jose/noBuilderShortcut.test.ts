// 2.11.0 QA (owner, 2026-11-01): "run workflow <name>" ran a Builder workflow whose steps had no
// code behind them. The Builder was archived; Jose plans such a request like any other.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../services/workflowBuilderService', () => ({
  listWorkflows: vi.fn(() => [{ id: 'wf-1', name: 'launch', nodes: [{ id: 'n1', type: 'action' }] }]),
}));
vi.mock('../../../services/workflowExecutionService', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  runVisualWorkflow: vi.fn(() => ({ ok: true, run: { id: 'run-1' } })),
}));

import { runPipelineShortcuts } from '../../../services/joseExecutionEngineService';
import { runVisualWorkflow } from '../../../services/workflowExecutionService';

describe('no Builder workflow shortcut', () => {
  it('"run workflow launch" is not run as a Builder workflow', async () => {
    const result = await runPipelineShortcuts({ commandText: 'run workflow launch' });
    expect(runVisualWorkflow).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
