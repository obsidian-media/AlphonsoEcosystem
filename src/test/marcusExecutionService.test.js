import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
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

  // Agent phase 5: no keyword audit, no guessed channel, and no "approved by Maria" she didn't give.
  it('Marcus uses no keyword score, audit or guessed target', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/services/marcusExecutionService.ts', 'utf8');
    for (const gone of ['generateRiskScore', 'auditProjectPlan', 'auditReleaseReadiness', 'selectDistributionTarget', "'#general'", 'maria-governance']) expect(src).not.toContain(gone);
  });
});
