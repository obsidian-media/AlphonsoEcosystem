import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildMariaAuditPrompt,
  parseMariaAuditResponse,
  buildMariaFallbackAudit,
  runMariaGovernanceAudit
} from '../services/mariaAuditService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../services/memoryService', () => ({ pushMemoryItem: vi.fn() }));
vi.mock('../services/sessionIntelligenceService', () => ({ appendSessionEvent: vi.fn() }));
vi.mock('../services/orchestrationReceiptService', () => ({ appendOrchestrationReceipt: vi.fn() }));
vi.mock('../services/audit/marcusAuditService', () => ({
  generateRiskScore: vi.fn(() => ({ level: 'low', score: 1, factors: [] })),
  auditProjectPlan: vi.fn(() => ({ status: 'pass', items: [] }))
}));

const mockOllamaResponse = { response: JSON.stringify({ riskLevel: 'low', approvalRequired: false, policyFindings: ['No issues'], complianceNotes: ['Compliant'], summary: 'Looks good' }), done: true };

vi.mock('../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(async () => mockOllamaResponse)
}));

vi.mock('../services/connectorRegistryService', () => ({
  appendConnectorAudit: vi.fn()
}));

// ── buildMariaAuditPrompt ─────────────────────────────────────────────────────

describe('buildMariaAuditPrompt', () => {
  it('returns a non-empty string', () => {
    const p = buildMariaAuditPrompt('publish post', {});
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(50);
  });

  it('includes the command text in the prompt', () => {
    const p = buildMariaAuditPrompt('send to github', {});
    expect(p).toContain('send to github');
  });

  it('references JSON output format', () => {
    const p = buildMariaAuditPrompt('test', {});
    expect(p).toMatch(/json|riskLevel/i);
  });

  it('handles empty command text gracefully', () => {
    const p = buildMariaAuditPrompt('', {});
    expect(typeof p).toBe('string');
  });

  it('incorporates prior outputs when provided', () => {
    const p = buildMariaAuditPrompt('command', { hector: { summary: 'Research complete' } });
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(50);
  });
});

// ── parseMariaAuditResponse ───────────────────────────────────────────────────

describe('parseMariaAuditResponse', () => {
  it('parses valid JSON response', () => {
    const result = parseMariaAuditResponse(JSON.stringify({
      riskLevel: 'medium',
      approvalRequired: true,
      policyFindings: ['Finding 1'],
      complianceNotes: ['Note 1'],
      summary: 'Moderate risk'
    }));
    expect(result.riskLevel).toBe('medium');
    expect(result.approvalRequired).toBe(true);
    expect(result.policyFindings).toContain('Finding 1');
    expect(result.complianceNotes).toContain('Note 1');
    expect(result.summary).toBe('Moderate risk');
  });

  it('extracts JSON from text with prose around it', () => {
    const text = 'Here is my analysis: {"riskLevel":"low","approvalRequired":false,"policyFindings":[],"complianceNotes":[],"summary":"ok"} end';
    const result = parseMariaAuditResponse(text);
    expect(result.riskLevel).toBe('low');
  });

  it('defaults riskLevel to medium on parse failure', () => {
    const result = parseMariaAuditResponse('not json at all !!');
    expect(result.riskLevel).toBe('medium');
    expect(Array.isArray(result.policyFindings)).toBe(true);
    expect(Array.isArray(result.complianceNotes)).toBe(true);
  });

  it('coerces policyFindings to array when missing', () => {
    const result = parseMariaAuditResponse(JSON.stringify({ riskLevel: 'low' }));
    expect(Array.isArray(result.policyFindings)).toBe(true);
  });

  it('coerces complianceNotes to array when missing', () => {
    const result = parseMariaAuditResponse(JSON.stringify({ riskLevel: 'low' }));
    expect(Array.isArray(result.complianceNotes)).toBe(true);
  });

  it('handles critical risk level correctly', () => {
    const result = parseMariaAuditResponse(JSON.stringify({ riskLevel: 'critical', approvalRequired: true, policyFindings: [], complianceNotes: [], summary: 'critical' }));
    expect(result.riskLevel).toBe('critical');
    expect(result.approvalRequired).toBe(true);
  });
});

// ── buildMariaFallbackAudit ───────────────────────────────────────────────────

describe('buildMariaFallbackAudit', () => {
  it('returns a result with riskLevel field', () => {
    const result = buildMariaFallbackAudit('test command', {}, {});
    expect(result).toHaveProperty('riskLevel');
  });

  it('returns approvalRequired field', () => {
    const result = buildMariaFallbackAudit('test command', {}, {});
    expect(result).toHaveProperty('approvalRequired');
  });

  it('returns policyFindings as array', () => {
    const result = buildMariaFallbackAudit('test command', {}, {});
    expect(Array.isArray(result.policyFindings)).toBe(true);
  });

  it('returns complianceNotes as array', () => {
    const result = buildMariaFallbackAudit('test command', {}, {});
    expect(Array.isArray(result.complianceNotes)).toBe(true);
  });

  it('returns a summary string', () => {
    const result = buildMariaFallbackAudit('publish release', {}, {});
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('includes confidenceLevel field', () => {
    const result = buildMariaFallbackAudit('test', {}, {});
    expect(result).toHaveProperty('confidenceLevel');
  });
});

// ── runMariaGovernanceAudit ───────────────────────────────────────────────────

describe('runMariaGovernanceAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a result with summary', async () => {
    const result = await runMariaGovernanceAudit('review project plan', {}, {});
    expect(result).toHaveProperty('summary');
    expect(typeof result.summary).toBe('string');
  });

  it('returns artifacts array', async () => {
    const result = await runMariaGovernanceAudit('review', {}, {});
    expect(Array.isArray(result.artifacts)).toBe(true);
  });

  it('includes governance_audit artifact type', async () => {
    const result = await runMariaGovernanceAudit('review', {}, {});
    const types = result.artifacts.map((a) => a.type);
    expect(types).toContain('governance_audit');
  });

  it('includes maria_audit_schema artifact type', async () => {
    const result = await runMariaGovernanceAudit('review', {}, {});
    const types = result.artifacts.map((a) => a.type);
    expect(types).toContain('maria_audit_schema');
  });

  it('returns contractAction field', async () => {
    const result = await runMariaGovernanceAudit('review', { actionType: 'publish' }, {});
    expect(result).toHaveProperty('contractAction');
  });

  it('returns resultState field', async () => {
    const result = await runMariaGovernanceAudit('review', {}, {});
    expect(result).toHaveProperty('resultState');
  });

  it('uses fallback when Ollama throws', async () => {
    const { generateOllamaResponse } = await import('../lib/ollama');
    generateOllamaResponse.mockRejectedValueOnce(new Error('Ollama offline'));
    const result = await runMariaGovernanceAudit('review', {}, {});
    expect(result).toHaveProperty('summary');
    expect(Array.isArray(result.artifacts)).toBe(true);
  });

  it('handles empty assignment gracefully', async () => {
    const result = await runMariaGovernanceAudit('', null, {});
    expect(result).toHaveProperty('summary');
  });

  it('schema includes riskLevel', async () => {
    const result = await runMariaGovernanceAudit('review', {}, {});
    const schemaArtifact = result.artifacts.find((a) => a.type === 'maria_audit_schema');
    expect(schemaArtifact?.schema).toHaveProperty('riskLevel');
  });

  it('schema includes approvalRequired', async () => {
    const result = await runMariaGovernanceAudit('review', {}, {});
    const schemaArtifact = result.artifacts.find((a) => a.type === 'maria_audit_schema');
    expect(schemaArtifact?.schema).toHaveProperty('approvalRequired');
  });
});
