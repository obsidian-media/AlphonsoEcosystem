import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scanForThreats, buildSentinelThreatPrompt, parseSentinelThreatResponse,
  buildSentinelFallbackAlert, startScheduledScans
} from '../../services/sentinelSecurityService';

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
  appendOrchestrationReceipt: vi.fn()
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
});
