import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/agentBusService', () => ({
  AGENTS: { JOSE: 'jose' },
  markPacketExecuted: vi.fn(),
  updatePacketStatus: vi.fn(),
}));
vi.mock('../services/connectorRegistryService', () => ({
  uploadYouTubeConnectorVideo: vi.fn(),
}));
vi.mock('../services/sessionIntelligenceService', () => ({
  appendSessionEvent: vi.fn(),
}));
vi.mock('../services/trustModel', () => ({
  TRUST_STATES: { PENDING: 'pending', VERIFIED: 'verified' },
}));
vi.mock('../services/orchestrationReceiptService', () => ({
  appendOrchestrationReceipt: vi.fn(),
}));
vi.mock('../services/approval/approvalService', () => ({
  requireApproval: vi.fn().mockResolvedValue({ approved: true }),
}));
vi.mock('../services/marcusPublishService', () => ({
  executeMarcusPublish: vi.fn().mockResolvedValue({ ok: true }),
}));

import { executeApprovedPacket } from '../services/packetExecutionService';
import { appendOrchestrationReceipt } from '../services/orchestrationReceiptService';
import { appendSessionEvent } from '../services/sessionIntelligenceService';

describe('executeApprovedPacket', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when packet is null', async () => {
    const result = await executeApprovedPacket(null);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('returns error when packet is not approved', async () => {
    const result = await executeApprovedPacket({ id: '1', status: 'pending', packetType: 'generic' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/must be approved/i);
  });

  it('executes generic packet and appends receipt', async () => {
    const packet = {
      id: 'p1',
      status: 'approved',
      packetType: 'generic',
      actionType: 'run_task',
      payload: { joseCommandId: 'cmd1' },
    };
    const result = await executeApprovedPacket(packet);
    expect(result).toBeTruthy();
    expect(appendOrchestrationReceipt).toHaveBeenCalled();
  });

  it('executes queued packet status', async () => {
    const packet = {
      id: 'p2',
      status: 'queued',
      packetType: 'generic',
      actionType: 'test',
      payload: {},
    };
    const result = await executeApprovedPacket(packet);
    expect(result).toBeTruthy();
  });
});
