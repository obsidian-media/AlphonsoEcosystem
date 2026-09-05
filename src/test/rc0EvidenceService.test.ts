import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../services/workspaceArtifactService', () => ({
  writeWorkspaceArtifact: vi.fn().mockResolvedValue({ ok: true, path: 'test/path' }),
  writeHandoffArtifact: vi.fn().mockResolvedValue({ ok: true, path: 'test/handoff' })
}));

describe('rc0EvidenceService', () => {
  let service;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = await import('../services/rc0EvidenceService');
  });

  describe('writeRc0EvidencePackage', () => {
    const baseArgs = {
      workspaceRoot: '/test/root',
      cycle: {
        generatedAtMs: 1700000000000,
        root: '/test/root',
        overallState: 'passed',
        auditReport: { filesScanned: 42 },
        auditSummary: { blockerCount: 1, partialCount: 2, needsSetupCount: 3 },
        readinessSummary: { partialCount: 2, needsSetupCount: 3 },
        packets: [
          {
            id: 'pkt-1', title: 'Test Packet', priority: 'P0', riskLevel: 'high',
            files: ['src/a.ts'], currentIssue: 'broken', recommendedChange: 'fix it',
            testCommands: ['npm test'], expectedProof: 'tests pass',
            needsSetupDependencies: ['node'], rollbackNote: 'revert'
          }
        ]
      },
      readinessReport: {
        readinessRows: [
          { id: 'r1', state: 'ok', kind: 'connector', name: 'Telegram', configured: 'yes' }
        ],
        durabilityRows: [{ id: 'workflow_durability', state: 'ok' }],
        workflowSummary: { runs: 5, receipts: 3, orchestrationReceipts: 2 },
        liveBlockers: [],
        releaseState: { state: 'ready', missing: null }
      },
      workspaceValidation: { ok: true, root: '/test/root' }
    };

    it('returns evidence package with expected fields', async () => {
      const result = await service.writeRc0EvidencePackage(baseArgs);
      expect(result.runtime).toBe('native_tauri');
      expect(result.workspaceRoot).toBe('/test/root');
      expect(result.workspaceRootValid).toBe(true);
      expect(result.filesScanned).toBe(42);
      expect(result.p0Count).toBe(1);
      expect(result.p1Count).toBe(2);
      expect(result.p2Count).toBe(3);
      expect(result.topPackets.length).toBe(1);
      expect(result.topPackets[0].id).toBe('pkt-1');
    });

    it('writes workspace and handoff artifacts', async () => {
      const { writeWorkspaceArtifact, writeHandoffArtifact } = await import('../services/workspaceArtifactService');
      await service.writeRc0EvidencePackage(baseArgs);
      expect(writeHandoffArtifact).toHaveBeenCalled();
      expect(writeWorkspaceArtifact).toHaveBeenCalled();
    });

    it('returns export paths', async () => {
      const result = await service.writeRc0EvidencePackage(baseArgs);
      expect(result.exportPaths.length).toBeGreaterThan(0);
      expect(result.exportPaths.some(p => p.includes('PROOF'))).toBe(true);
    });

    it('handles failed cycle state', async () => {
      const args = {
        ...baseArgs,
        cycle: { ...baseArgs.cycle, overallState: 'failed' }
      };
      const result = await service.writeRc0EvidencePackage(args);
      expect(result.scanStatus).toBe('failed');
    });

    it('handles invalid workspace validation', async () => {
      const args = {
        ...baseArgs,
        workspaceValidation: { ok: false, error: 'invalid root' }
      };
      const result = await service.writeRc0EvidencePackage(args);
      expect(result.workspaceRootValid).toBe(false);
    });

    it('handles empty packets', async () => {
      const args = {
        ...baseArgs,
        cycle: { ...baseArgs.cycle, packets: [] }
      };
      const result = await service.writeRc0EvidencePackage(args);
      expect(result.topPackets.length).toBe(0);
    });

    it('handles null readiness report', async () => {
      const args = { ...baseArgs, readinessReport: null };
      const result = await service.writeRc0EvidencePackage(args);
      expect(result).toBeDefined();
    });

    it('handles verification results', async () => {
      const args = {
        ...baseArgs,
        verificationResults: { testOk: true, buildOk: true, tauriOk: true, releaseUpdaterOk: false }
      };
      const result = await service.writeRc0EvidencePackage(args);
      expect(result).toBeDefined();
    });

    it('handles export error in cycle', async () => {
      const args = {
        ...baseArgs,
        cycle: { ...baseArgs.cycle, exportError: 'write failed' }
      };
      const result = await service.writeRc0EvidencePackage(args);
      expect(result).toBeDefined();
    });
  });
});
