import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../services/agentBusService', () => ({
  AGENTS: {},
  createAgentPacket: vi.fn(),
  requestPacketRetry: vi.fn(),
  sendPacketToDeadLetter: vi.fn(),
  updatePacketStatus: vi.fn(),
}));
vi.mock('../../services/connectors/connectorRegistry.js', () => ({
  appendConnectorAudit: vi.fn(),
  requireConnectorReady: vi.fn(),
  verifyConnectorEnvironment: vi.fn(),
}));
vi.mock('../../services/jose/joseInbound', () => ({ answerOrPlan: vi.fn() }));

import { updatePacketStatus } from '../../services/agentBusService';
import { appendConnectorAudit } from '../../services/connectors/connectorRegistry.js';
import { answerOrPlan } from '../../services/jose/joseInbound';
import { sendConnectorMessageToJose } from '../../services/connectors/connectorPolling';

beforeEach(() => vi.clearAllMocks());

describe('a polled message goes to Jose (phase 6a)', () => {
  it('starts a request in the background and records its command when it ends', async () => {
    vi.mocked(answerOrPlan).mockResolvedValueOnce({ kind: 'started', done: Promise.resolve({ commandId: 'c1', requestId: 'jose-request-c1' }) });
    const outcome = await sendConnectorMessageToJose('telegram', 'pkt_1', 'Research the launch');
    expect(answerOrPlan).toHaveBeenCalledWith('Research the launch', { source: 'telegram', background: true });
    expect(outcome).toBe('started');
    expect(updatePacketStatus).toHaveBeenCalledWith('pkt_1', 'reported_to_jose', expect.objectContaining({ commandDistributedAtMs: expect.any(Number) }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(updatePacketStatus).toHaveBeenCalledWith('pkt_1', 'reported_to_jose', expect.objectContaining({ joseCommandId: 'c1', joseRequestId: 'jose-request-c1' }));
    expect(appendConnectorAudit).toHaveBeenCalledWith('telegram', 'jose_command_distributed', expect.objectContaining({ packetId: 'pkt_1', commandId: 'c1' }));
  });

  it('keeps a direct answer on the packet', async () => {
    vi.mocked(answerOrPlan).mockResolvedValueOnce({ kind: 'answer', text: 'Paris.' });
    expect(await sendConnectorMessageToJose('whatsapp', 'pkt_2', 'Capital of France?')).toBe('answered');
    expect(updatePacketStatus).toHaveBeenCalledWith('pkt_2', 'answered', expect.objectContaining({ answer: 'Paris.' }));
    expect(appendConnectorAudit).toHaveBeenCalledWith('whatsapp', 'jose_answered', { packetId: 'pkt_2' });
  });

  it('lets a failure reach the caller (which retries the packet)', async () => {
    vi.mocked(answerOrPlan).mockRejectedValueOnce(new Error('no model'));
    await expect(sendConnectorMessageToJose('telegram', 'pkt_3', 'x')).rejects.toThrow('no model');
  });
});
