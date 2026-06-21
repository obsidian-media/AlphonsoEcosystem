import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  selectDistributionTarget,
  buildMarcusExecutionRecord,
  runMarcusDistribution
} from '../services/marcusExecutionService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../services/memoryService', () => ({ pushMemoryItem: vi.fn() }));
vi.mock('../services/sessionIntelligenceService', () => ({ appendSessionEvent: vi.fn() }));
vi.mock('../services/orchestrationReceiptService', () => ({ appendOrchestrationReceipt: vi.fn() }));
vi.mock('../services/audit/marcusAuditService', () => ({
  generateRiskScore: vi.fn(() => ({ level: 'low', score: 1, factors: [] })),
  auditProjectPlan: vi.fn(() => ({ status: 'pass', items: [] })),
  auditReleaseReadiness: vi.fn(() => ({ status: 'pass', items: [] }))
}));
vi.mock('../services/marcusPublishService', () => ({
  executeMarcusPublish: vi.fn(async () => ({ ok: true, platform: 'telegram', type: 'publish_telegram' })),
  MARCUS_PUBLISH_PLATFORMS: [
    { id: 'telegram' }, { id: 'instagram' }, { id: 'facebook' }, { id: 'youtube' }, { id: 'notion' }, { id: 'clickup' }
  ]
}));
vi.mock('../services/connectors/connectorAuth', () => ({
  getConnectorCredential: vi.fn((connectorId, key) => {
    if (connectorId === 'github' && key === 'GITHUB_TOKEN') return 'ghp_fake_token';
    if (connectorId === 'slack' && key === 'SLACK_BOT_TOKEN') return 'xoxb-fake-token';
    return null;
  })
}));
vi.mock('../services/connectorRegistryService', () => ({
  isConnectorAuthenticated: vi.fn(() => ({ ok: true })),
  appendConnectorAudit: vi.fn()
}));

// ── selectDistributionTarget ──────────────────────────────────────────────────

describe('selectDistributionTarget', () => {
  it('returns github release target for github release action', () => {
    const target = selectDistributionTarget({ actionType: 'create_github_release' });
    expect(target.type).toBe('github');
    expect(target.action).toBe('release');
  });

  it('returns github issue target for github issue action', () => {
    const target = selectDistributionTarget({ actionType: 'github_issue_create' });
    expect(target.type).toBe('github');
    expect(target.action).toBe('issue');
  });

  it('returns slack target for slack action', () => {
    const target = selectDistributionTarget({ actionType: 'slack_message_send' });
    expect(target.type).toBe('slack');
  });

  it('returns publish/instagram for instagram action', () => {
    const target = selectDistributionTarget({ actionType: 'post_instagram' });
    expect(target.type).toBe('publish');
    expect(target.platform).toBe('instagram');
  });

  it('returns publish/youtube for youtube action', () => {
    const target = selectDistributionTarget({ actionType: 'upload_youtube_video' });
    expect(target.type).toBe('publish');
    expect(target.platform).toBe('youtube');
  });

  it('returns publish/telegram for telegram action', () => {
    const target = selectDistributionTarget({ actionType: 'send_telegram_notification' });
    expect(target.type).toBe('publish');
    expect(target.platform).toBe('telegram');
  });

  it('returns review type for unknown action', () => {
    const target = selectDistributionTarget({ actionType: 'do_something_unknown' });
    expect(target.type).toBe('review');
  });

  it('handles null assignment gracefully', () => {
    const target = selectDistributionTarget(null);
    expect(target).toHaveProperty('type');
  });

  it('infers from payload.platform when action is generic', () => {
    const target = selectDistributionTarget({ actionType: 'publish_content', payload: { platform: 'notion' } });
    expect(target.platform).toBe('notion');
  });
});

// ── buildMarcusExecutionRecord ────────────────────────────────────────────────

describe('buildMarcusExecutionRecord', () => {
  it('returns a record with workflowId', () => {
    const record = buildMarcusExecutionRecord({ ok: true, type: 'github_release', url: 'http://example.com' }, { commandId: 'cmd1', packetId: 'pkt1' });
    expect(record).toHaveProperty('workflowId');
  });

  it('returns status executed when ok', () => {
    const record = buildMarcusExecutionRecord({ ok: true, type: 'github_release' }, {});
    expect(record.status).toBe('executed');
  });

  it('returns status failed when not ok', () => {
    const record = buildMarcusExecutionRecord({ ok: false, error: 'connector error' }, {});
    expect(record.status).toBe('failed');
  });

  it('returns resultUrl from url field', () => {
    const record = buildMarcusExecutionRecord({ ok: true, url: 'https://github.com/release/1' }, {});
    expect(record.resultUrl).toBe('https://github.com/release/1');
  });

  it('returns summary string', () => {
    const record = buildMarcusExecutionRecord({ ok: true, type: 'slack_message' }, {});
    expect(typeof record.summary).toBe('string');
  });

  it('includes executedAtMs timestamp', () => {
    const record = buildMarcusExecutionRecord({ ok: true }, {});
    expect(typeof record.executedAtMs).toBe('number');
    expect(record.executedAtMs).toBeGreaterThan(0);
  });

  it('includes approvedBy: maria-governance', () => {
    const record = buildMarcusExecutionRecord({ ok: true }, {});
    expect(record.approvedBy).toBe('maria-governance');
  });
});

// ── runMarcusDistribution ─────────────────────────────────────────────────────

describe('runMarcusDistribution', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns summary string', async () => {
    const result = await runMarcusDistribution('publish release', { actionType: 'slack_notify' }, {});
    expect(typeof result.summary).toBe('string');
  });

  it('returns artifacts array', async () => {
    const result = await runMarcusDistribution('publish', { actionType: 'slack_notify' }, {});
    expect(Array.isArray(result.artifacts)).toBe(true);
  });

  it('blocks execution when maria flags critical with approvalRequired', async () => {
    const mariaOutput = {
      schema: { riskLevel: 'critical', approvalRequired: true },
      artifacts: [{ type: 'governance_audit', riskLevel: 'critical', approvalRequired: true }]
    };
    const result = await runMarcusDistribution('dangerous action', { actionType: 'delete_all' }, { maria: mariaOutput });
    expect(result.resultState).toBe('pending_review');
    expect(result.summary).toMatch(/blocked|approval/i);
  });

  it('blocks when no maria output and quick risk is critical', async () => {
    const { generateRiskScore } = await import('../services/audit/marcusAuditService');
    generateRiskScore.mockReturnValueOnce({ level: 'critical', score: 10, factors: ['delete all'] });
    const result = await runMarcusDistribution('delete everything', { actionType: 'delete_all' }, {});
    expect(result.resultState).toBe('pending_review');
  });

  it('proceeds when maria clears as low risk', async () => {
    const mariaOutput = {
      schema: { riskLevel: 'low', approvalRequired: false },
      artifacts: []
    };
    const result = await runMarcusDistribution('send telegram update', { actionType: 'send_telegram_notification', payload: { platform: 'telegram' } }, { maria: mariaOutput });
    expect(result.resultState).not.toBe('pending_review');
  });

  it('returns contractAction field', async () => {
    const result = await runMarcusDistribution('action', { actionType: 'slack_notify' }, {});
    expect(result).toHaveProperty('contractAction');
  });

  it('returns distribution_execution artifact type', async () => {
    const mariaOutput = { schema: { riskLevel: 'low', approvalRequired: false }, artifacts: [] };
    const result = await runMarcusDistribution('notify', { actionType: 'slack_message_send' }, { maria: mariaOutput });
    const types = result.artifacts.map((a) => a.type);
    expect(types).toContain('distribution_execution');
  });

  it('returns marcus_execution_schema artifact when executed', async () => {
    const mariaOutput = { schema: { riskLevel: 'low', approvalRequired: false }, artifacts: [] };
    const result = await runMarcusDistribution('notify', { actionType: 'slack_message_send' }, { maria: mariaOutput });
    const types = result.artifacts.map((a) => a.type);
    expect(types).toContain('marcus_execution_schema');
  });

  it('handles null priorOutputs gracefully', async () => {
    const result = await runMarcusDistribution('action', { actionType: 'review' }, null);
    expect(result).toHaveProperty('summary');
  });
});
