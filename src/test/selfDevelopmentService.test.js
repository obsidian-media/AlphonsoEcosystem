import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock, runRepoAuditMock, collectProductionReadinessSnapshotMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  runRepoAuditMock: vi.fn(),
  collectProductionReadinessSnapshotMock: vi.fn()
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock
}));

vi.mock('../services/repoAuditService', () => ({
  getLastRepoAudit: vi.fn(() => null),
  runRepoAudit: runRepoAuditMock,
  summarizeRepoAudit: vi.fn((report) => ({
    blockerCount: report?.findings?.filter((finding) => finding.priority === 'P0').length || 0,
    partialCount: report?.findings?.filter((finding) => finding.priority === 'P1').length || 0,
    needsSetupCount: report?.findings?.filter((finding) => finding.kind === 'setup_required').length || 0,
    issueCount: report?.findings?.filter((finding) => finding.kind === 'placeholder').length || 0
  }))
}));

vi.mock('../services/workspaceRootService', () => ({
  validateWorkspaceRoot: vi.fn(async (root) => ({
    ok: true,
    root: root || 'C:/workspace',
    status: 'ready',
    error: null
  })),
  getDefaultWorkspaceRoot: vi.fn(() => 'C:/workspace')
}));

vi.mock('../services/productionReadinessService', () => ({
  collectProductionReadinessSnapshot: collectProductionReadinessSnapshotMock,
  summarizeProductionReadiness: vi.fn((report) => ({
    overallState: report?.overallState || 'unknown',
    blockerCount: 1,
    issueCount: 1,
    needsSetupCount: 1
  }))
}));

import { getLastSelfDevelopmentCycle, listSelfDevelopmentCycles, runSelfDevelopmentCycle } from '../services/selfDevelopmentService';

describe('selfDevelopmentService', () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    runRepoAuditMock.mockReset();
    collectProductionReadinessSnapshotMock.mockReset();
    invokeMock.mockResolvedValue({});
    runRepoAuditMock.mockResolvedValue({
      id: 'repo-audit-1',
      findings: [
        {
          id: 'finding-1',
          path: 'src/components/SelfDevelopmentPanel.jsx',
          lineNumber: 12,
          surface: 'ui',
          kind: 'placeholder',
          priority: 'P1',
          message: 'Replace placeholder state with audited state.'
        },
        {
          id: 'finding-2',
          path: 'src-tauri/src/lib.rs',
          lineNumber: 5019,
          surface: 'release',
          kind: 'setup_required',
          priority: 'P0',
          message: 'Updater release needs a real hosted manifest.'
        }
      ]
    });
    collectProductionReadinessSnapshotMock.mockResolvedValue({
      overallState: 'partial',
      releaseState: { state: 'setup_required', evidence: 'missing updater signing key' },
      workflowSummary: { runs: 2, receipts: 4 },
      repoAuditSummary: { blockerCount: 1, issueCount: 1, needsSetupCount: 1 }
    });
  });

  it('stores a durable cycle and packet bundle', async () => {
    const cycle = await runSelfDevelopmentCycle({
      root: 'C:/Users/Shaya/OneDrive/Desktop/ALPHONSO/FILES/local-agent-ui-v2',
      settings: { workspaceRoot: 'C:/Users/Shaya/OneDrive/Desktop/ALPHONSO/FILES/local-agent-ui-v2' },
      updateCheckState: { configured: false },
      verificationLogs: [],
      workspaceFoundation: {}
    });

    expect(cycle.overallState).toBe('partial');
    expect(cycle.packets).toHaveLength(2);
    expect(listSelfDevelopmentCycles()).toHaveLength(1);
    expect(getLastSelfDevelopmentCycle()?.packets?.[0]?.title).toContain('Codex Packet');
    expect(runRepoAuditMock).toHaveBeenCalledTimes(1);
    expect(collectProductionReadinessSnapshotMock).toHaveBeenCalledTimes(1);
  });
});
