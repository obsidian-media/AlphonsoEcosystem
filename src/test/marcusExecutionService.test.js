import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  selectDistributionTarget,
  buildMarcusExecutionRecord,
  runMarcusDistribution,
  executeMarcusGitHubAction,
  executeMarcusSlackAction,
  executeMarcusN8nAction,
  schedulePublish,
  getScheduledPublishes,
  cancelScheduledPublish,
  startScheduler,
  stopScheduler
} from '../services/marcusExecutionService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../services/memoryService', () => ({ pushMemoryItem: vi.fn() }));
vi.mock('../services/contentFactory/postMetrics', () => ({ readDueMetrics: vi.fn(async () => 0) }));
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

  // Agent phase 3: Maria's approval already made the step wait for you (her hold), so Marcus
  // doesn't block again on his own; and no keyword score stands in when she didn't review.
  it("doesn't block on his own when Maria flagged high risk (her hold already asked you)", async () => {
    const mariaOutput = { schema: { riskLevel: 'critical', approvalRequired: true }, artifacts: [] };
    const result = await runMarcusDistribution('dangerous action', { actionType: 'delete_all' }, { maria: mariaOutput });
    expect(result.summary).not.toMatch(/Marcus blocked/);
  });

  it('uses no keyword score when Maria did not review', async () => {
    const { generateRiskScore } = await import('../services/audit/marcusAuditService');
    generateRiskScore.mockClear();
    const result = await runMarcusDistribution('delete everything', { actionType: 'delete_all' }, {});
    expect(generateRiskScore).not.toHaveBeenCalled();
    expect(result.summary).not.toMatch(/Marcus blocked/);
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

// ── executeMarcusGitHubAction ──────────────────────────────────────────────

describe('executeMarcusGitHubAction', () => {
  it('returns setupRequired when GitHub NOT authenticated', async () => {
    const { getConnectorCredential } = await import('../services/connectors/connectorAuth');
    vi.mocked(getConnectorCredential).mockReturnValueOnce(null);
    const result = await executeMarcusGitHubAction('test', { actionType: 'github_issue_create' });
    expect(result.ok).toBe(false);
    expect(result.setupRequired).toBe(true);
  });
});

// ── executeMarcusSlackAction ───────────────────────────────────────────────

describe('executeMarcusSlackAction', () => {
  it('returns setupRequired when Slack NOT authenticated', async () => {
    const { getConnectorCredential } = await import('../services/connectors/connectorAuth');
    vi.mocked(getConnectorCredential).mockReturnValueOnce(null);
    const result = await executeMarcusSlackAction('test', {});
    expect(result.ok).toBe(false);
    expect(result.setupRequired).toBe(true);
  });
});

// ── executeMarcusN8nAction ─────────────────────────────────────────────────

describe('executeMarcusN8nAction', () => {
  it('returns setupRequired when n8n NOT authenticated', async () => {
    const result = await executeMarcusN8nAction('test', {});
    expect(result.ok).toBe(false);
    expect(result.setupRequired).toBe(true);
  });
});

// ── Schedule CRUD ──────────────────────────────────────────────────────────

describe('schedulePublish', () => {
  beforeEach(() => { localStorage.clear(); });

  it('returns an entry with id, status pending', () => {
    const entry = schedulePublish({ content: 'Hello', platform: 'telegram', scheduledAt: Date.now() + 60000, agentId: 'marcus' });
    expect(entry).toHaveProperty('id');
    expect(entry.status).toBe('pending');
    expect(entry.platform).toBe('telegram');
    expect(entry.content).toBe('Hello');
  });

  it('defaults agentId to marcus when not provided', () => {
    const entry = schedulePublish({ content: 'test', platform: 'slack', scheduledAt: Date.now() + 60000 });
    expect(entry.agentId).toBe('marcus');
  });
});

describe('getScheduledPublishes', () => {
  beforeEach(() => { localStorage.clear(); });

  it('returns empty array when no schedules exist', () => {
    expect(getScheduledPublishes()).toEqual([]);
  });

  it('returns previously scheduled publishes', () => {
    schedulePublish({ content: 'A', platform: 'telegram', scheduledAt: Date.now() + 60000, agentId: 'marcus' });
    schedulePublish({ content: 'B', platform: 'slack', scheduledAt: Date.now() + 60000, agentId: 'marcus' });
    const list = getScheduledPublishes();
    expect(list.length).toBe(2);
  });
});

describe('cancelScheduledPublish', () => {
  beforeEach(() => { localStorage.clear(); });

  it('returns false for non-existent id', () => {
    expect(cancelScheduledPublish('nonexistent')).toBe(false);
  });

  it('cancels an existing scheduled publish', () => {
    const entry = schedulePublish({ content: 'test', platform: 'telegram', scheduledAt: Date.now() + 60000, agentId: 'marcus' });
    const result = cancelScheduledPublish(entry.id);
    expect(result).toBe(true);
    const updated = getScheduledPublishes().find((e) => e.id === entry.id);
    expect(updated.status).toBe('cancelled');
  });
});

// ── Scheduler start/stop ───────────────────────────────────────────────────

describe('startScheduler / stopScheduler', () => {
  afterEach(() => { stopScheduler(); });

  it('startScheduler does not throw', () => {
    expect(() => startScheduler(100)).not.toThrow();
  });

  it('stopScheduler does not throw when no scheduler is running', () => {
    expect(() => stopScheduler()).not.toThrow();
  });

  it('stopScheduler can be called after startScheduler', () => {
    startScheduler(100);
    expect(() => stopScheduler()).not.toThrow();
  });
});

// Phase 4a: the runner reads the posts' numbers that are due.
describe('post numbers in the runner', () => {
  it('reads due numbers at start and every minute', async () => {
    vi.useFakeTimers();
    const { readDueMetrics } = await import('../services/contentFactory/postMetrics');
    const { startPostScheduler, stopScheduler } = await import('../services/marcusExecutionService');
    vi.mocked(readDueMetrics).mockClear();
    startPostScheduler();
    expect(readDueMetrics).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(readDueMetrics).toHaveBeenCalledTimes(2);
    stopScheduler();
    vi.useRealTimers();
  });
});

// Agent phase 3: Marcus reads Maria's review of the very work he sends, and no keyword score.
describe("Marcus and Maria's review", () => {
  it('Marcus reads the review of the work he sends, not another', async () => {
    const { mariaReviewFor } = await import('../services/marcusExecutionService');
    const { createJoseRequest } = await import('../services/jose/joseRequestStore');
    const { setStepOutput } = await import('../services/jose/joseStepOutputs');
    localStorage.clear();
    createJoseRequest({ commandId: 'cm1', source: 'user', text: 't', kind: 'normal', steps: [
      { stepId: 'post', agent: 'alphonso', actionType: 'assistant_write', effects: ['read'], needs: [] },
      { stepId: 'check', agent: 'maria', actionType: 'audit_quality', effects: ['read'], needs: ['post'], reviewOf: 'post' },
      { stepId: 'other', agent: 'maria', actionType: 'governance_audit', effects: ['read'], needs: [] },
      { stepId: 'marcus', agent: 'marcus', actionType: 'distribution_slack', effects: ['publish_or_send'], needs: ['post', 'check'] },
    ] });
    setStepOutput('cm1', 'check', 'maria', { summary: 'Pass.', schema: { kind: 'work', verdict: 'pass', riskLevel: 'low', approvalRequired: false } });
    setStepOutput('cm1', 'other', 'maria', { summary: 'Risk: high.', schema: { kind: 'plan', riskLevel: 'high', approvalRequired: true } });
    expect(mariaReviewFor('cm1', ['post', 'check'])?.schema?.verdict).toBe('pass');
    expect(mariaReviewFor('cm1', ['nothing'])).toBeNull();
  });

  it('Marcus uses no keyword score', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/services/marcusExecutionService.ts', 'utf8')).not.toContain('generateRiskScore');
  });
});
