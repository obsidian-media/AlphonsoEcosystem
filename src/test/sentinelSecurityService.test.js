import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scanForThreats,
  buildSentinelThreatPrompt,
  parseSentinelThreatResponse,
  buildSentinelFallbackAlert,
  runSentinelSecurityScan
} from '../services/sentinelSecurityService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../services/memoryService', () => ({ pushMemoryItem: vi.fn() }));
vi.mock('../services/sessionIntelligenceService', () => ({ appendSessionEvent: vi.fn() }));
vi.mock('../services/orchestrationReceiptService', () => ({ appendOrchestrationReceipt: vi.fn() }));
vi.mock('../services/missionRoomService', () => ({
  classifyMissionRoomRisk: vi.fn(() => ({ secretDetected: false, flags: [], approvalRequired: false })),
  redactMissionRoomSecrets: vi.fn((t) => t)
}));
vi.mock('../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(async () => ({
    response: JSON.stringify({
      severity: 'low',
      requiresApproval: false,
      findings: ['No threats detected'],
      recommendedAction: 'Proceed normally.',
      summary: 'Command appears safe.'
    }),
    done: true
  })),
  PREFERRED_MODEL: 'qwen2.5-coder:7b'
}));

// ── scanForThreats ────────────────────────────────────────────────────────────

describe('scanForThreats', () => {
  it('returns riskScore, severity, findings, blocked', () => {
    const result = scanForThreats('build a dashboard', {});
    expect(result).toHaveProperty('riskScore');
    expect(result).toHaveProperty('severity');
    expect(result).toHaveProperty('findings');
    expect(result).toHaveProperty('blocked');
  });

  it('gives low risk for benign command', () => {
    const result = scanForThreats('research latest AI trends', {});
    expect(result.riskScore).toBeLessThan(30);
    expect(result.severity).toBe('low');
    expect(result.blocked).toBe(false);
  });

  it('detects credential pattern and gives critical severity', () => {
    const result = scanForThreats('api_key: sk-abc123xyz', {});
    expect(result.riskScore).toBeGreaterThanOrEqual(40);
    expect(['critical', 'high']).toContain(result.severity);
  });

  it('detects destructive command', () => {
    const result = scanForThreats('rm -rf /var/data', {});
    expect(result.findings.some((f) => f.type === 'destructive_command')).toBe(true);
  });

  it('detects external publish action', () => {
    const result = scanForThreats('deploy to production now', {});
    expect(result.findings.some((f) => f.type === 'external_publish' || f.type === 'destructive_action')).toBe(true);
  });

  it('factors in failed prior agents', () => {
    const priorOutputs = { hector: { resultState: 'failed', summary: 'failed' } };
    const result = scanForThreats('simple task', priorOutputs);
    expect(result.findings.some((f) => f.type === 'prior_agent_failure')).toBe(true);
  });

  it('clamps riskScore to 100', () => {
    const result = scanForThreats('api_key: abc rm -rf delete destroy wipe publish deploy credential secret password token', {});
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });

  it('returns findings array', () => {
    const result = scanForThreats('anything', {});
    expect(Array.isArray(result.findings)).toBe(true);
  });

  it('blocks when secret detected by missionRoomService', async () => {
    const { classifyMissionRoomRisk } = await import('../services/missionRoomService');
    classifyMissionRoomRisk.mockReturnValueOnce({ secretDetected: true, flags: [], approvalRequired: true });
    const result = scanForThreats('some command with a hidden secret', {});
    expect(result.blocked).toBe(true);
  });
});

// ── buildSentinelThreatPrompt ─────────────────────────────────────────────────

describe('buildSentinelThreatPrompt', () => {
  it('returns a non-empty string', () => {
    const p = buildSentinelThreatPrompt('test command', {}, { findings: [], riskScore: 0 });
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(50);
  });

  it('includes the command text', () => {
    const p = buildSentinelThreatPrompt('deploy to prod', {}, { findings: [], riskScore: 20 });
    expect(p).toContain('deploy to prod');
  });

  it('references JSON output format', () => {
    const p = buildSentinelThreatPrompt('x', {}, { findings: [] });
    expect(p).toMatch(/json|severity/i);
  });

  it('includes findings count in prompt', () => {
    const scanResult = { findings: [{ type: 'destructive_command' }, { type: 'external_publish' }] };
    const p = buildSentinelThreatPrompt('x', {}, scanResult);
    expect(p).toContain('destructive_command');
  });
});

// ── parseSentinelThreatResponse ───────────────────────────────────────────────

describe('parseSentinelThreatResponse', () => {
  it('parses valid JSON', () => {
    const text = JSON.stringify({ severity: 'high', requiresApproval: true, findings: ['Issue 1'], recommendedAction: 'Block', summary: 'Dangerous' });
    const result = parseSentinelThreatResponse(text);
    expect(result.severity).toBe('high');
    expect(result.requiresApproval).toBe(true);
    expect(result.findings).toContain('Issue 1');
  });

  it('extracts JSON from surrounding prose', () => {
    const text = 'Analysis: {"severity":"low","requiresApproval":false,"findings":[],"recommendedAction":"ok","summary":"clear"} done';
    const result = parseSentinelThreatResponse(text);
    expect(result.severity).toBe('low');
  });

  it('defaults to medium severity on parse failure', () => {
    const result = parseSentinelThreatResponse('not json');
    expect(result.severity).toBe('medium');
    expect(result.requiresApproval).toBe(true);
  });

  it('coerces findings to array', () => {
    const result = parseSentinelThreatResponse(JSON.stringify({ severity: 'low' }));
    expect(Array.isArray(result.findings)).toBe(true);
  });

  it('normalizes unknown severity to medium', () => {
    const result = parseSentinelThreatResponse(JSON.stringify({ severity: 'unknown_level' }));
    expect(result.severity).toBe('medium');
  });
});

// ── buildSentinelFallbackAlert ────────────────────────────────────────────────

describe('buildSentinelFallbackAlert', () => {
  it('returns requiresApproval true when blocked', () => {
    const result = buildSentinelFallbackAlert('cmd', { blocked: true, severity: 'critical', findings: [], riskScore: 90 });
    expect(result.requiresApproval).toBe(true);
  });

  it('returns requiresApproval false for safe scan', () => {
    const result = buildSentinelFallbackAlert('cmd', { blocked: false, severity: 'low', findings: [], riskScore: 5 });
    expect(result.requiresApproval).toBe(false);
  });

  it('maps findings to strings', () => {
    const scanResult = { blocked: false, severity: 'medium', riskScore: 25, findings: [{ severity: 'medium', type: 'external_publish', detail: 'publish detected' }] };
    const result = buildSentinelFallbackAlert('cmd', scanResult);
    expect(result.findings.length).toBe(1);
    expect(typeof result.findings[0]).toBe('string');
  });

  it('includes a summary string', () => {
    const result = buildSentinelFallbackAlert('cmd', { blocked: false, severity: 'low', findings: [], riskScore: 5 });
    expect(typeof result.summary).toBe('string');
  });
});

// ── runSentinelSecurityScan ───────────────────────────────────────────────────

describe('runSentinelSecurityScan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns summary string', async () => {
    const result = await runSentinelSecurityScan('build a feature', {}, {});
    expect(typeof result.summary).toBe('string');
  });

  it('returns artifacts array', async () => {
    const result = await runSentinelSecurityScan('build a feature', {}, {});
    expect(Array.isArray(result.artifacts)).toBe(true);
  });

  it('includes security_assessment artifact', async () => {
    const result = await runSentinelSecurityScan('build', {}, {});
    const types = result.artifacts.map((a) => a.type);
    expect(types).toContain('security_assessment');
  });

  it('includes sentinel_alert_schema artifact', async () => {
    const result = await runSentinelSecurityScan('build', {}, {});
    const types = result.artifacts.map((a) => a.type);
    expect(types).toContain('sentinel_alert_schema');
  });

  it('schema includes alertId', async () => {
    const result = await runSentinelSecurityScan('build', {}, {});
    const schemaArtifact = result.artifacts.find((a) => a.type === 'sentinel_alert_schema');
    expect(schemaArtifact?.schema).toHaveProperty('alertId');
  });

  it('schema includes severity', async () => {
    const result = await runSentinelSecurityScan('build', {}, {});
    const schemaArtifact = result.artifacts.find((a) => a.type === 'sentinel_alert_schema');
    expect(schemaArtifact?.schema).toHaveProperty('severity');
  });

  it('returns pending_review when blocked', async () => {
    const { classifyMissionRoomRisk } = await import('../services/missionRoomService');
    classifyMissionRoomRisk.mockReturnValueOnce({ secretDetected: true, flags: [], approvalRequired: true });
    const result = await runSentinelSecurityScan('api_key: sk-abc123', {}, {});
    expect(result.resultState).toBe('pending_review');
  });

  it('returns completed for safe command', async () => {
    const result = await runSentinelSecurityScan('write a blog post about cats', {}, {});
    expect(result.resultState).toBe('completed');
  });

  it('uses fallback when Ollama throws', async () => {
    const { generateOllamaResponse } = await import('../lib/ollama');
    generateOllamaResponse.mockRejectedValueOnce(new Error('Ollama offline'));
    const result = await runSentinelSecurityScan('test', {}, {});
    expect(result).toHaveProperty('summary');
  });

  it('handles null assignment gracefully', async () => {
    const result = await runSentinelSecurityScan('test', null, {});
    expect(result).toHaveProperty('summary');
  });
});
