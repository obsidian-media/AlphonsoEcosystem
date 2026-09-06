import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../services/trustModel', () => ({
  TRUST_STATES: { TEMPORARY: 'temporary', UNVERIFIED: 'unverified' },
  timestampMs: () => Date.now()
}));
vi.mock('../../services/runtimeLedgerService', () => ({
  persistScopeRows: vi.fn()
}));

import { listRepoAudits, getLastRepoAudit, runRepoAudit, summarizeRepoAudit } from '../../services/repoAuditService';
import { invoke } from '@tauri-apps/api/core';

describe('repoAuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('listRepoAudits', () => {
    it('returns empty array when no audits stored', () => {
      expect(listRepoAudits()).toEqual([]);
    });
    it('returns stored audits', () => {
      const report = { id: 'test', findings: [], overallStatus: 'verified', trust: 'unverified' };
      localStorage.setItem('alphonso_repo_audits_v1', JSON.stringify([report]));
      const audits = listRepoAudits();
      expect(audits.length).toBe(1);
      expect(audits[0].id).toBe('test');
    });
    it('returns empty array for invalid JSON', () => {
      localStorage.setItem('alphonso_repo_audits_v1', 'not-json');
      expect(listRepoAudits()).toEqual([]);
    });
  });

  describe('getLastRepoAudit', () => {
    it('returns null when no audits', () => {
      expect(getLastRepoAudit()).toBeNull();
    });
    it('returns most recent audit', () => {
      const reports = [
        { id: 'first', findings: [], overallStatus: 'verified', trust: 'unverified', generatedAtMs: 100 },
        { id: 'second', findings: [], overallStatus: 'partial', trust: 'unverified', generatedAtMs: 200 }
      ];
      localStorage.setItem('alphonso_repo_audits_v1', JSON.stringify(reports));
      expect(getLastRepoAudit()?.id).toBe('first');
    });
  });

  describe('summarizeRepoAudit', () => {
    it('returns unknown status for null report', () => {
      const summary = summarizeRepoAudit(null);
      expect(summary.status).toBe('unknown');
      expect(summary.filesScanned).toBe(0);
      expect(summary.blockerCount).toBe(0);
    });
    it('summarizes a report correctly', () => {
      const report = {
        filesScanned: 100, blockedCount: 2, partialCount: 3,
        needsSetupCount: 1, issueCount: 5, todoCount: 4, overallStatus: 'partial'
      };
      const summary = summarizeRepoAudit(report as any);
      expect(summary.filesScanned).toBe(100);
      expect(summary.blockerCount).toBe(2);
      expect(summary.partialCount).toBe(3);
      expect(summary.needsSetupCount).toBe(1);
      expect(summary.issueCount).toBe(5);
      expect(summary.todoCount).toBe(4);
      expect(summary.status).toBe('partial');
    });
    it('handles missing fields gracefully', () => {
      const summary = summarizeRepoAudit({} as any);
      expect(summary.filesScanned).toBe(0);
      expect(summary.status).toBe('unknown');
    });
  });

  describe('runRepoAudit', () => {
    it('invokes scan_workspace_readiness and returns normalized report', async () => {
      (invoke as any).mockResolvedValueOnce({
        findings: [
          { path: 'foo.ts', lineNumber: 1, kind: 'placeholder', priority: 'P0', severity: 'High', message: 'bad' }
        ],
        filesScanned: 10, generatedAtMs: 1000, root: '/test'
      });
      const report = await runRepoAudit({ root: '/test' });
      expect(report.findings.length).toBe(1);
      expect(report.blockedCount).toBe(1);
      expect(report.overallStatus).toBe('failed');
      expect(report.filesScanned).toBe(10);
      // A permissive mock resolving any invoke() call would pass even if the
      // wrong command or args were sent -- assert the real contract.
      expect(invoke).toHaveBeenCalledWith('scan_workspace_readiness', {
        root: '/test', maxFiles: 1200, maxFindings: 240
      });
    });
    it('returns report with defaults when scan is null', async () => {
      (invoke as any).mockResolvedValueOnce(null);
      const report = await runRepoAudit({});
      expect(report.findings).toEqual([]);
      expect(report.overallStatus).toBe('verified');
    });
    it('persists report to localStorage', async () => {
      (invoke as any).mockResolvedValueOnce({ filesScanned: 5, generatedAtMs: 100 });
      await runRepoAudit({});
      const stored = JSON.parse(localStorage.getItem('alphonso_repo_audits_v1') || '[]');
      expect(stored.length).toBe(1);
    });
    it('caps stored reports at 20', async () => {
      const reports = Array.from({ length: 20 }, (_, i) => ({
        id: `old-${i}`, findings: [], overallStatus: 'verified', trust: 'unverified', generatedAtMs: i
      }));
      localStorage.setItem('alphonso_repo_audits_v1', JSON.stringify(reports));
      (invoke as any).mockResolvedValueOnce({ filesScanned: 1, generatedAtMs: 999 });
      await runRepoAudit({});
      const stored = JSON.parse(localStorage.getItem('alphonso_repo_audits_v1') || '[]');
      expect(stored.length).toBe(20);
    });
    it('sorts findings by priority (P0 first)', async () => {
      (invoke as any).mockResolvedValueOnce({
        findings: [
          { path: 'a.ts', priority: 'P2', kind: 'other', severity: 'Low', message: '' },
          { path: 'b.ts', priority: 'P0', kind: 'other', severity: 'High', message: '' },
          { path: 'c.ts', priority: 'P1', kind: 'other', severity: 'Medium', message: '' }
        ],
        filesScanned: 3, generatedAtMs: 100
      });
      const report = await runRepoAudit({});
      expect(report.findings[0].priority).toBe('P0');
      expect(report.findings[1].priority).toBe('P1');
      expect(report.findings[2].priority).toBe('P2');
    });
    it('normalizes snake_case finding fields', async () => {
      (invoke as any).mockResolvedValueOnce({
        findings: [
          { path: 'x.ts', line_number: 42, kind: 'todo', priority: 'P2', severity: 'Low', message: 'fix me' }
        ],
        filesScanned: 1, generatedAtMs: 100
      });
      const report = await runRepoAudit({});
      expect(report.findings[0].lineNumber).toBe(42);
    });
  });
});
