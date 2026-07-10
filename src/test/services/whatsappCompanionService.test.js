import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mockSend = vi.fn().mockResolvedValue({ ok: true });
const mockPoll = vi.fn();

vi.mock('../../services/whatsappBrowserConnector', () => ({
  browserSendWhatsApp: (...args) => mockSend(...args),
  browserPollWhatsAppGateway: (...args) => mockPoll(...args)
}));

vi.mock('../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: vi.fn().mockReturnValue('')
}));

vi.mock('../../services/agentBusService', () => ({
  listApprovalQueue: vi.fn().mockReturnValue([]),
  approvePacket: vi.fn(),
  rejectPacket: vi.fn()
}));

vi.mock('../../services/agentActivityService', () => ({
  listAgentActivity: vi.fn().mockReturnValue([])
}));

vi.mock('../../services/joseCommandRouterService', () => ({
  listJoseCommands: vi.fn().mockReturnValue([]),
  createJoseCommandRoute: vi.fn().mockResolvedValue({ id: 'cmd-1', status: 'distributed' })
}));

vi.mock('../../agents/agentRegistry', () => ({
  listAgentProfiles: vi.fn().mockReturnValue([])
}));

vi.mock('../../lib/appStorage', () => ({
  getStorage: vi.fn().mockReturnValue(null),
  setStorage: vi.fn()
}));

describe('whatsappCompanionService', () => {
  let service;
  let mockAuth;
  let mockBus;
  let mockJose;
  let mockAppStorage;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth = await import('../../services/connectors/connectorAuth');
    mockBus = await import('../../services/agentBusService');
    mockJose = await import('../../services/joseCommandRouterService');
    mockAppStorage = await import('../../lib/appStorage');
    service = await import('../../services/whatsappCompanionService');
    service.stopWhatsAppCompanion();
  });

  afterEach(() => {
    service.stopWhatsAppCompanion();
  });

  describe('companion lifecycle', () => {
    it('returns null when access token is missing', () => {
      mockAuth.getConnectorCredential.mockReturnValue('');
      expect(service.startWhatsAppCompanion()).toBeNull();
    });

    it('returns null when gateway drain URL is missing', () => {
      mockAuth.getConnectorCredential.mockImplementation((_c, key) => key === 'WHATSAPP_ACCESS_TOKEN' ? 'token' : '');
      expect(service.startWhatsAppCompanion()).toBeNull();
    });

    it('starts polling when both token and drain URL are configured', () => {
      mockAuth.getConnectorCredential.mockReturnValue('configured-value');
      const id = service.startWhatsAppCompanion();
      expect(id).toBeTruthy();
      expect(service.isWhatsAppCompanionRunning()).toBe(true);
    });

    it('stopWhatsAppCompanion is idempotent', () => {
      service.stopWhatsAppCompanion();
      service.stopWhatsAppCompanion();
      expect(service.isWhatsAppCompanionRunning()).toBe(false);
    });
  });

  describe('owner pairing gate', () => {
    it('blocks pairing when no allowlist is configured', async () => {
      mockAuth.getConnectorCredential.mockReturnValue('');
      await service.processInboundWhatsAppMessages([{ fromId: '15551234567', text: '/start', messageId: 'm1' }]);
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('Pairing blocked')
      }));
    });

    it('rejects a number not on the allowlist', async () => {
      mockAuth.getConnectorCredential.mockImplementation((_c, key) => key === 'WHATSAPP_ALLOWED_NUMBERS' ? '15550000000' : '');
      await service.processInboundWhatsAppMessages([{ fromId: '15551234567', text: '/start', messageId: 'm1' }]);
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('Unauthorized')
      }));
    });

    it('registers owner on /start when number is allowlisted', async () => {
      mockAuth.getConnectorCredential.mockImplementation((_c, key) => key === 'WHATSAPP_ALLOWED_NUMBERS' ? '15551234567' : '');
      await service.processInboundWhatsAppMessages([{ fromId: '15551234567', text: '/start', messageId: 'm1' }]);
      expect(mockAppStorage.setStorage).toHaveBeenCalledWith('alphonso_whatsapp_owner_number', '15551234567');
    });

    it('rejects messages from a non-owner number once owner is registered', async () => {
      mockAppStorage.getStorage.mockReturnValue('15551234567');
      await service.processInboundWhatsAppMessages([{ fromId: '15559999999', text: '/status', messageId: 'm1' }]);
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        to: '15559999999',
        text: 'Unauthorized.'
      }));
    });
  });

  describe('command routing (owner authenticated)', () => {
    beforeEach(() => {
      mockAppStorage.getStorage.mockReturnValue('15551234567');
    });

    it('routes /status to a real status reply', async () => {
      await service.processInboundWhatsAppMessages([{ fromId: '15551234567', text: '/status', messageId: 'm1' }]);
      expect(mockBus.listApprovalQueue).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('Alphonso Status') }));
    });

    it('routes /queue and lists real pending approvals', async () => {
      mockBus.listApprovalQueue.mockReturnValue([
        { id: 'packet-abc12345', title: 'Test task', fromAgent: 'miya', riskLevel: 'low' }
      ]);
      await service.processInboundWhatsAppMessages([{ fromId: '15551234567', text: '/queue', messageId: 'm1' }]);
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('Test task') }));
    });

    it('/approve resolves a short id to the real packet and calls approvePacket', async () => {
      mockBus.listApprovalQueue.mockReturnValue([
        { id: 'packet-abc12345', title: 'Test task', fromAgent: 'miya', riskLevel: 'low' }
      ]);
      await service.processInboundWhatsAppMessages([{ fromId: '15551234567', text: '/approve abc12345', messageId: 'm1' }]);
      expect(mockBus.approvePacket).toHaveBeenCalledWith('packet-abc12345', 'whatsapp_operator');
    });

    it('/reject calls rejectPacket with a real reason', async () => {
      mockBus.listApprovalQueue.mockReturnValue([
        { id: 'packet-abc12345', title: 'Test task', fromAgent: 'miya', riskLevel: 'low' }
      ]);
      await service.processInboundWhatsAppMessages([{ fromId: '15551234567', text: '/reject abc12345', messageId: 'm1' }]);
      expect(mockBus.rejectPacket).toHaveBeenCalledWith('packet-abc12345', 'Rejected via WhatsApp companion');
    });

    it('routes plain text to the real Jose command router', async () => {
      await service.processInboundWhatsAppMessages([{ fromId: '15551234567', text: 'what is the status', messageId: 'm1' }]);
      expect(mockJose.createJoseCommandRoute).toHaveBeenCalledWith(expect.objectContaining({
        commandText: 'what is the status',
        source: 'whatsapp'
      }));
    });

    it('processes every message in a batch, not just the first', async () => {
      mockBus.listApprovalQueue.mockReturnValue([]);
      await service.processInboundWhatsAppMessages([
        { fromId: '15551234567', text: '/ping', messageId: 'm1' },
        { fromId: '15551234567', text: '/queue', messageId: 'm2' },
        { fromId: '15551234567', text: 'route this', messageId: 'm3' }
      ]);
      expect(mockBus.listApprovalQueue).toHaveBeenCalled();
      expect(mockJose.createJoseCommandRoute).toHaveBeenCalledWith(expect.objectContaining({ commandText: 'route this' }));
      const pingReply = mockSend.mock.calls.find((c) => String(c[0]?.text || '').includes('Pong'));
      expect(pingReply).toBeTruthy();
    });

    it('does not reprocess a message with an already-seen messageId', async () => {
      await service.processInboundWhatsAppMessages([{ fromId: '15551234567', text: '/ping', messageId: 'dup-1' }]);
      mockSend.mockClear();
      await service.processInboundWhatsAppMessages([{ fromId: '15551234567', text: '/ping', messageId: 'dup-1' }]);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
