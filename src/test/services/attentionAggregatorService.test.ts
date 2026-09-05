import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/agentBusService', () => ({
  listApprovalQueue: vi.fn(),
  approvePacket: vi.fn(),
  rejectPacket: vi.fn(),
}));
vi.mock('../../services/approval/approvalService.js', () => ({
  listPendingApprovals: vi.fn(),
  approveRequest: vi.fn(),
  rejectRequest: vi.fn(),
}));
vi.mock('../../services/coachHistoryService', () => ({
  getCoachHistory: vi.fn(),
}));
vi.mock('../../services/connectorCircuitBreakerService', () => ({
  getAll: vi.fn(),
  isOpen: vi.fn(),
}));
vi.mock('../../services/connectors/connectorRegistry.js', () => ({
  DEFAULT_CONNECTORS: [{ id: 'github', name: 'GitHub' }, { id: 'telegram', name: 'Telegram Bridge' }],
}));

import { listApprovalQueue, approvePacket, rejectPacket } from '../../services/agentBusService';
import { listPendingApprovals, approveRequest, rejectRequest } from '../../services/approval/approvalService.js';
import { getCoachHistory } from '../../services/coachHistoryService';
import { getAll, isOpen } from '../../services/connectorCircuitBreakerService';
import { getAttentionItems } from '../../services/attentionAggregatorService';

describe('attentionAggregatorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listApprovalQueue as any).mockReturnValue([]);
    (listPendingApprovals as any).mockReturnValue([]);
    (getCoachHistory as any).mockReturnValue([]);
    (getAll as any).mockReturnValue({});
    (isOpen as any).mockReturnValue(false);
  });

  it('normalizes an agentBusService approval with a real riskLevel passthrough', async () => {
    (listApprovalQueue as any).mockReturnValue([
      { id: 'pkt-1', title: 'Publish draft to Slack', riskLevel: 'high', createdAtMs: 1000 },
    ]);
    const items = await getAttentionItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'approval-chat-pkt-1',
      source: 'approval-chat',
      severity: 'high',
      title: 'Publish draft to Slack',
      timestamp: 1000,
      actionable: true,
    });
  });

  it('wires onApprove/onReject for an agentBusService item to the real packet functions', async () => {
    (listApprovalQueue as any).mockReturnValue([
      { id: 'pkt-1', title: 'Publish draft to Slack', riskLevel: 'high', createdAtMs: 1000 },
    ]);
    const items = await getAttentionItems();
    items[0].onApprove!();
    expect(approvePacket).toHaveBeenCalledWith('pkt-1');
    items[0].onReject!();
    expect(rejectPacket).toHaveBeenCalledWith('pkt-1');
  });

  it('normalizes an approvalService.js approval, parsing its ISO createdAt into an epoch-ms timestamp', async () => {
    (listPendingApprovals as any).mockReturnValue([
      { id: 'approval-2', riskLevel: 'medium', actionType: 'deployment', reason: 'Deployment changes live environments.', summary: 'Deploy v2.7.1', createdAt: '2026-09-05T12:00:00.000Z' },
    ]);
    const items = await getAttentionItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'approval-project-approval-2',
      source: 'approval-project',
      severity: 'medium',
      title: 'Deploy v2.7.1',
      actionable: true,
    });
    expect(items[0].timestamp).toBe(Date.parse('2026-09-05T12:00:00.000Z'));
  });

  it('wires onApprove/onReject for an approvalService.js item to the real request functions', async () => {
    (listPendingApprovals as any).mockReturnValue([
      { id: 'approval-2', riskLevel: 'medium', actionType: 'deployment', reason: 'r', summary: 'Deploy v2.7.1', createdAt: '2026-09-05T12:00:00.000Z' },
    ]);
    const items = await getAttentionItems();
    items[0].onApprove!();
    expect(approveRequest).toHaveBeenCalledWith('approval-2');
    items[0].onReject!();
    expect(rejectRequest).toHaveBeenCalledWith('approval-2');
  });

  it('maps a Coach critical signal to critical severity, non-actionable', async () => {
    (getCoachHistory as any).mockReturnValue([
      { id: 'coach-1', severity: 'critical', message: 'Repeated pipeline failure detected', detectedAtMs: 2000 },
    ]);
    const items = await getAttentionItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'coach-coach-1',
      source: 'coach',
      severity: 'critical',
      title: 'Repeated pipeline failure detected',
      timestamp: 2000,
      actionable: false,
    });
    expect(items[0].onApprove).toBeUndefined();
  });

  it('maps a Coach warning signal to medium severity (not a native match, documented mapping)', async () => {
    (getCoachHistory as any).mockReturnValue([
      { id: 'coach-2', severity: 'warning', message: 'Approval theater detected', detectedAtMs: 2000 },
    ]);
    const items = await getAttentionItems();
    expect(items[0].severity).toBe('medium');
  });

  it('only includes a connector whose circuit is actually open, using DEFAULT_CONNECTORS for its display name', async () => {
    (getAll as any).mockReturnValue({
      github: { state: 'open', failures: 5, lastFailure: 3000 },
      telegram: { state: 'closed', failures: 0, lastFailure: null },
    });
    (isOpen as any).mockImplementation((id: string) => id === 'github');
    const items = await getAttentionItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'connector-github',
      source: 'connector',
      severity: 'medium',
      title: 'GitHub',
      timestamp: 3000,
      actionable: false,
    });
  });

  it('sorts by severity first (critical > high > medium > low), then by timestamp descending within a tier', async () => {
    (listApprovalQueue as any).mockReturnValue([
      { id: 'low-old', title: 'Low, old', riskLevel: 'low', createdAtMs: 100 },
      { id: 'high-new', title: 'High, new', riskLevel: 'high', createdAtMs: 500 },
    ]);
    (getCoachHistory as any).mockReturnValue([
      { id: 'crit-1', severity: 'critical', message: 'Critical', detectedAtMs: 200 },
    ]);
    const items = await getAttentionItems();
    expect(items.map((i) => i.id)).toEqual([
      'coach-crit-1',
      'approval-chat-high-new',
      'approval-chat-low-old',
    ]);
  });

  it('isolates a failing source — one source throwing does not prevent the other 3 sources from returning items', async () => {
    (listApprovalQueue as any).mockImplementation(() => {
      throw new Error('agentBusService is down');
    });
    (getCoachHistory as any).mockReturnValue([
      { id: 'coach-1', severity: 'critical', message: 'Still works', detectedAtMs: 1000 },
    ]);
    const items = await getAttentionItems();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('coach-coach-1');
  });

  it('returns an empty array when all 4 sources have nothing', async () => {
    const items = await getAttentionItems();
    expect(items).toEqual([]);
  });
});
