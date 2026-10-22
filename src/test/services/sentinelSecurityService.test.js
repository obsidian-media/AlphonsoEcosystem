import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scanForThreats, buildSentinelThreatPrompt, parseSentinelThreatResponse,
  buildSentinelFallbackAlert, startScheduledScans, scanRecentActivity
} from '../../services/sentinelSecurityService';
import { listOrchestrationReceipts } from '../../services/orchestrationReceiptService';
import { listAgentActivity } from '../../services/agentActivityService';

vi.mock('../../services/trustModel', () => ({
  TRUST_STATES: { VERIFIED: 'verified', INFERRED: 'inferred', TEMPORARY: 'temporary', PENDING: 'pending', UNVERIFIED: 'unverified', FAILED: 'failed' },
  timestampMs: vi.fn(() => Date.now())
}));

vi.mock('../../services/memoryService', () => ({
  pushMemoryItem: vi.fn()
}));

vi.mock('../../services/sessionIntelligenceService', () => ({
  appendSessionEvent: vi.fn()
}));

vi.mock('../../services/orchestrationReceiptService', () => ({
  appendOrchestrationReceipt: vi.fn(),
  listOrchestrationReceipts: vi.fn(() => [])
}));

vi.mock('../../services/agentActivityService', () => ({
  listAgentActivity: vi.fn(() => [])
}));

vi.mock('../../services/missionRoomService', () => ({
  classifyMissionRoomRisk: vi.fn(() => ({ secretDetected: false })),
  redactMissionRoomSecrets: vi.fn((text) => text)
}));

describe('sentinelSecurityService', () => {
  describe('scanForThreats', () => {
    it('returns low risk for clean input', () => {
      const result = scanForThreats('hello world', {});
      expect(result.severity).toBe('low');
      expect(result.riskScore).toBe(0);
    });

    it('detects credential patterns', () => {
      const result = scanForThreats('api_key = secret123', {});
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it('detects destructive commands', () => {
      const result = scanForThreats('rm -rf /', {});
      expect(result.findings.some(f => f.type === 'destructive_command')).toBe(true);
    });

    it('blocks high risk scores', () => {
      const result = scanForThreats('api_key=secret rm -rf / eval bad stuff sudo hack', {});
      expect(result.blocked).toBe(true);
    });

    it('adds risk for failed prior agents', () => {
      const result = scanForThreats('test', { agent1: { resultState: 'failed' } });
      expect(result.riskScore).toBeGreaterThan(0);
    });
  });

  describe('buildSentinelThreatPrompt', () => {
    it('returns a prompt with command and scan findings', () => {
      const prompt = buildSentinelThreatPrompt('test', {}, { findings: [{ type: 'test' }] });
      expect(prompt).toContain('Sentinel');
      expect(prompt).toContain('test');
    });
  });

  describe('parseSentinelThreatResponse', () => {
    it('parses valid JSON', () => {
      const json = JSON.stringify({ severity: 'high', requiresApproval: true, findings: ['bad'], recommendedAction: 'block', summary: 'threat found' });
      const result = parseSentinelThreatResponse(json);
      expect(result.severity).toBe('high');
      expect(result.requiresApproval).toBe(true);
    });

    it('returns defaults for invalid JSON', () => {
      const result = parseSentinelThreatResponse('not json');
      expect(result.severity).toBe('medium');
      expect(result.requiresApproval).toBe(true);
    });
  });

  describe('buildSentinelFallbackAlert', () => {
    it('creates fallback alert', () => {
      const alert = buildSentinelFallbackAlert('test', { severity: 'low', blocked: false, findings: [], riskScore: 10 });
      expect(alert.severity).toBe('low');
      expect(alert.requiresApproval).toBe(false);
    });

    it('blocks when scan is blocked', () => {
      const alert = buildSentinelFallbackAlert('test', { severity: 'critical', blocked: true, findings: [], riskScore: 80 });
      expect(alert.requiresApproval).toBe(true);
    });
  });

  describe('startScheduledScans', () => {
    it('returns cleanup function', () => {
      const cleanup = startScheduledScans(1000, () => {});
      expect(typeof cleanup).toBe('function');
      cleanup();
    });
  });

  // QA 2026-10-22 (Bug 71): the sidebar's quick scan scanned '' and so always
  // said all clear. It now scans the last week's agent work.
  describe('scanRecentActivity', () => {
    it("finds a credential in the last week's work and ignores older work", () => {
      const now = Date.now();
      listOrchestrationReceipts.mockReturnValue([
        { id: 'r1', agent: 'jose', eventType: 'executed', status: 'completed', timestampMs: now - 1000, details: { summary: 'Saved config with api_key = secret123' } },
        { id: 'r2', agent: 'miya', eventType: 'executed', status: 'completed', timestampMs: now - 30 * 86_400_000, details: { summary: 'old password = hunter2' } },
      ]);
      listAgentActivity.mockReturnValue([{ agent: 'hector', action: 'research', detail: 'read three sources', ts: now - 500 }]);
      const result = scanRecentActivity(7);
      expect(result.itemsScanned).toBe(2);
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it('reports nothing scanned when there is no recent work', () => {
      listOrchestrationReceipts.mockReturnValue([]);
      listAgentActivity.mockReturnValue([]);
      const result = scanRecentActivity(7);
      expect(result.itemsScanned).toBe(0);
      expect(result.findings).toEqual([]);
    });
  });
});
