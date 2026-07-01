import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';


const mockInvoke = vi.fn().mockResolvedValue(null);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args),
  isTauri: vi.fn().mockReturnValue(false)
}));

vi.mock('../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: vi.fn().mockReturnValue(''),
  getConnectorCredentials: vi.fn()
}));

vi.mock('../../services/agentBusService', () => ({
  listApprovalQueue: vi.fn().mockReturnValue([]),
  approvePacket: vi.fn(),
  rejectPacket: vi.fn(),
  updatePacketStatus: vi.fn(),
  AGENTS: {
    ALPHONSO: 'alphonso', JOSE: 'jose', MIYA: 'miya', HECTOR: 'hector',
    MARIA: 'maria', MARCUS: 'marcus', ECHO: 'echo', SENTINEL: 'sentinel', NOVA: 'nova'
  }
}));

vi.mock('../../services/joseCommandRouterService', () => ({
  createJoseCommandRoute: vi.fn().mockResolvedValue({ id: 'cmd-1', status: 'distributed' }),
  listJoseCommands: vi.fn().mockReturnValue([])
}));

vi.mock('../../services/memoryService', () => ({
  listMemoryItems: vi.fn().mockReturnValue([])
}));

vi.mock('../../services/agentActivityService', () => ({
  listAgentActivity: vi.fn().mockReturnValue([])
}));

vi.mock('../../lib/appStorage', () => ({
  getStorage: vi.fn().mockReturnValue(null),
  setStorage: vi.fn()
}));

vi.mock('../../services/sentinelSecurityService', () => ({
  runQuickScan: vi.fn().mockResolvedValue({ threatLevel: 'clear', findings: [], summary: 'No issues found.' })
}));

vi.mock('../../services/novaAnalysisService', () => ({
  getOpportunityHistory: vi.fn().mockReturnValue([])
}));

vi.mock('../../services/orchestrationReceiptService', () => ({
  listOrchestrationReceipts: vi.fn().mockReturnValue([])
}));

vi.mock('../../agents/agentRegistry', () => ({
  listAgentProfiles: vi.fn().mockReturnValue([])
}));

describe('telegramCompanionService', () => {
  let service;
  let mockAuth;
  let mockBus;
  let mockJose;
  let mockAppStorage;

  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();

    mockAuth = await import('../../services/connectors/connectorAuth');
    mockBus = await import('../../services/agentBusService');
    mockJose = await import('../../services/joseCommandRouterService');
    mockAppStorage = await import('../../lib/appStorage');

    service = await import('../../services/telegramCompanionService');
    service.stopTelegramCompanion();
  });

  afterEach(() => {
    service.stopTelegramCompanion();
  });

  describe('companion lifecycle', () => {
    it('returns null when no token available', () => {
      mockAuth.getConnectorCredential.mockReturnValue('');
      expect(service.startTelegramCompanion()).toBeNull();
    });

    it('returns interval ids when token is available', () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      const result = service.startTelegramCompanion();
      expect(result).toHaveProperty('inboundId');
      expect(result).toHaveProperty('watcherId');
    });

    it('returns existing ids if already running', () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      const first = service.startTelegramCompanion();
      const second = service.startTelegramCompanion();
      expect(second.inboundId).toBe(first.inboundId);
    });

    it('isTelegramCompanionRunning reflects state correctly', () => {
      expect(service.isTelegramCompanionRunning()).toBe(false);
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      service.startTelegramCompanion();
      expect(service.isTelegramCompanionRunning()).toBe(true);
      service.stopTelegramCompanion();
      expect(service.isTelegramCompanionRunning()).toBe(false);
    });

    it('stopTelegramCompanion is idempotent', () => {
      service.stopTelegramCompanion();
      service.stopTelegramCompanion();
      expect(service.isTelegramCompanionRunning()).toBe(false);
    });
  });

  describe('owner registration flow', () => {
    it('registers owner chatId on /start when no owner exists', async () => {
      mockAppStorage.getStorage.mockReturnValue(null);

      await service.processInboundCommands('test-token', {
        ok: true,
        messages: [{ chat: { id: 'chat-123' }, message: { text: '/start' }, update_id: 1 }]
      });

      expect(mockAppStorage.setStorage).toHaveBeenCalledWith('alphonso_telegram_owner_chat_id', 'chat-123');
    });

    it('prompts /start when no owner and command is not /start', async () => {
      mockAppStorage.getStorage.mockReturnValue(null);

      await service.processInboundCommands('test-token', {
        ok: true,
        messages: [{ chat: { id: 'chat-123' }, message: { text: '/status' }, update_id: 1 }]
      });

      const calls = mockInvoke.mock.calls.filter(c => c[0] === 'telegram_send_message');
      const startPrompt = calls.find(c => c[1].text.includes('/start to register'));
      expect(startPrompt).toBeTruthy();
    });

    it('rejects /start when owner already registered', async () => {
      mockAppStorage.getStorage.mockImplementation((key) => {
        if (key === 'alphonso_telegram_owner_chat_id') return 'existing-owner';
        return null;
      });

      await service.processInboundCommands('test-token', {
        ok: true,
        messages: [{ chat: { id: 'existing-owner' }, message: { text: '/start' }, update_id: 1 }]
      });

      const calls = mockInvoke.mock.calls.filter(c => c[0] === 'telegram_send_message');
      const alreadyRegistered = calls.find(c => c[1].text.includes('already registered'));
      expect(alreadyRegistered).toBeTruthy();
    });

    it('rejects unauthorized senders', async () => {
      mockAppStorage.getStorage.mockImplementation((key) => {
        if (key === 'alphonso_telegram_owner_chat_id') return 'owner-999';
        return null;
      });

      await service.processInboundCommands('test-token', {
        ok: true,
        messages: [{ chat: { id: 'other-chat' }, message: { text: '/status' }, update_id: 1 }]
      });

      const calls = mockInvoke.mock.calls.filter(c => c[0] === 'telegram_send_message');
      const unauthorized = calls.find(c => c[1].text === 'Unauthorized.');
      expect(unauthorized).toBeTruthy();
    });
  });

  describe('command routing', () => {
    beforeEach(() => {
      mockAppStorage.getStorage.mockImplementation((key) => {
        if (key === 'alphonso_telegram_owner_chat_id') return 'owner-chat';
        return null;
      });
    });

    it('routes /status to handleStatusCommand', async () => {
      mockBus.listApprovalQueue.mockReturnValue([]);
      mockJose.listJoseCommands.mockReturnValue([]);
      const { listAgentActivity } = await import('../../services/agentActivityService');
      listAgentActivity.mockReturnValue([]);

      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

      await service.processInboundCommands('test-token', {
        ok: true,
        messages: [{ chat: { id: 'owner-chat' }, message: { text: '/status' }, update_id: 1 }]
      });

      expect(mockBus.listApprovalQueue).toHaveBeenCalled();
    });

    it('routes /queue to handleQueueCommand', async () => {
      await service.processInboundCommands('test-token', {
        ok: true,
        messages: [{ chat: { id: 'owner-chat' }, message: { text: '/queue' }, update_id: 1 }]
      });

      expect(mockBus.listApprovalQueue).toHaveBeenCalled();
    });

    it('routes /help to handleHelpCommand', async () => {
      await service.processInboundCommands('test-token', {
        ok: true,
        messages: [{ chat: { id: 'owner-chat' }, message: { text: '/help' }, update_id: 1 }]
      });

      const calls = mockInvoke.mock.calls.filter(c => c[0] === 'telegram_send_message');
      expect(calls[0][1].text).toContain('/ask');
    });

    it('routes /ping to handlePingCommand', async () => {
      await service.processInboundCommands('test-token', {
        ok: true,
        messages: [{ chat: { id: 'owner-chat' }, message: { text: '/ping' }, update_id: 1 }]
      });

      const calls = mockInvoke.mock.calls.filter(c => c[0] === 'telegram_send_message');
      expect(calls[0][1].text).toContain('Pong');
    });

    it('routes /ask with argument to jose command router', async () => {
      await service.processInboundCommands('test-token', {
        ok: true,
        messages: [{ chat: { id: 'owner-chat' }, message: { text: '/ask what is the status' }, update_id: 1 }]
      });

      expect(mockJose.createJoseCommandRoute).toHaveBeenCalled();
    });

    it('routes plain text to jose command router', async () => {
      await service.processInboundCommands('test-token', {
        ok: true,
        messages: [{ chat: { id: 'owner-chat' }, message: { text: 'hello there' }, update_id: 1 }]
      });

      expect(mockJose.createJoseCommandRoute).toHaveBeenCalled();
    });
  });

  describe('approve/reject commands', () => {
    beforeEach(() => {
      mockAppStorage.getStorage.mockImplementation((key) => {
        if (key === 'alphonso_telegram_owner_chat_id') return 'owner-chat';
        return null;
      });
    });

    it('approves packet with telegram_operator approver', async () => {
      mockBus.listApprovalQueue.mockReturnValue([
        { id: 'packet-abc12345', title: 'Task', fromAgent: 'miya', riskLevel: 'low' }
      ]);

      await service.handleApproveCommand('test-token', 'owner-chat', 'abc12345');

      expect(mockBus.approvePacket).toHaveBeenCalledWith('packet-abc12345', 'telegram_operator');
    });

    it('rejects packet with correct reason', async () => {
      mockBus.listApprovalQueue.mockReturnValue([
        { id: 'packet-xyz99999', title: 'Task', fromAgent: 'hector', riskLevel: 'medium' }
      ]);

      await service.handleRejectCommand('test-token', 'owner-chat', 'xyz99999');

      expect(mockBus.rejectPacket).toHaveBeenCalledWith('packet-xyz99999', 'Rejected via Telegram companion');
    });
  });

  describe('notifications pause/resume', () => {
    it('setNotificationsPaused(true) sets paused flag', () => {
      service.setNotificationsPaused(true);
      expect(mockAppStorage.setStorage).toHaveBeenCalledWith('alphonso_telegram_notifications_paused', true);
    });

    it('setNotificationsPaused(false) clears paused flag', () => {
      service.setNotificationsPaused(false);
      expect(mockAppStorage.setStorage).toHaveBeenCalledWith('alphonso_telegram_notifications_paused', false);
    });
  });

  describe('push watcher behavior', () => {
    it('skips when notifications paused', async () => {
      mockAppStorage.getStorage.mockImplementation((key) => {
        if (key === 'alphonso_telegram_owner_chat_id') return 'chat-123';
        if (key === 'alphonso_telegram_notifications_paused') return true;
        return null;
      });

      await service.runPushWatcher('test-token');
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('skips when no owner chat id', async () => {
      mockAppStorage.getStorage.mockImplementation((key) => {
        if (key === 'alphonso_telegram_notifications_paused') return false;
        return null;
      });

      await service.runPushWatcher('test-token');
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('skips when token is empty', async () => {
      await service.runPushWatcher('');
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  describe('message chunking', () => {
    it('splits messages over 4000 chars', async () => {
      mockAppStorage.getStorage.mockImplementation((key) => {
        if (key === 'alphonso_telegram_owner_chat_id') return 'chat-123';
        return null;
      });

      await service.sendTelegramMessage('x'.repeat(5000));

      const calls = mockInvoke.mock.calls.filter(c => c[0] === 'telegram_send_message');
      expect(calls.length).toBe(2);
      expect(calls[0][1].text.length).toBe(4000);
      expect(calls[1][1].text.length).toBe(1000);
    });

    it('sends single chunk for short messages', async () => {
      mockAppStorage.getStorage.mockImplementation((key) => {
        if (key === 'alphonso_telegram_owner_chat_id') return 'chat-123';
        return null;
      });

      await service.sendTelegramMessage('Short');

      const calls = mockInvoke.mock.calls.filter(c => c[0] === 'telegram_send_message');
      expect(calls.length).toBe(1);
      expect(calls[0][1].text).toBe('Short');
    });
  });

  describe('sendTelegramMessage guard', () => {
    it('returns not_configured when no token', async () => {
      mockAuth.getConnectorCredential.mockReturnValue('');
      const result = await service.sendTelegramMessage('hello');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('not_configured');
    });

    it('returns not_configured when no owner chat id', async () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      mockAppStorage.getStorage.mockReturnValue(null);
      const result = await service.sendTelegramMessage('hello');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('not_configured');
    });
  });

  describe('processInboundCommands edge cases', () => {
    it('does nothing when updates is null', async () => {
      await service.processInboundCommands('test-token', null);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('does nothing when updates.ok is false', async () => {
      await service.processInboundCommands('test-token', { ok: false });
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('handles empty messages array', async () => {
      await service.processInboundCommands('test-token', { ok: true, messages: [] });
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('skips messages with empty text', async () => {
      mockAppStorage.getStorage.mockImplementation((key) => {
        if (key === 'alphonso_telegram_owner_chat_id') return 'chat-123';
        return null;
      });

      await service.processInboundCommands('test-token', {
        ok: true,
        messages: [{ chat: { id: 'chat-123' }, message: { text: '' }, update_id: 1 }]
      });

      expect(mockJose.createJoseCommandRoute).not.toHaveBeenCalled();
    });
  });

  describe('handleAgentsCommand', () => {
    it('lists agent profiles with active indicators', async () => {
      const { listAgentProfiles } = await import('../../agents/agentRegistry');
      const { listAgentActivity } = await import('../../services/agentActivityService');
      listAgentProfiles.mockReturnValue([
        { id: 'alphonso', name: 'Alphonso', role: 'Local operator' },
        { id: 'jose', name: 'Jose', role: 'Orchestrator' }
      ]);
      listAgentActivity.mockReturnValue([]);

      await service.handleAgentsCommand('test-token', 'chat-123');

      const calls = mockInvoke.mock.calls.filter(c => c[0] === 'telegram_send_message');
      expect(calls[0][1].text).toContain('Alphonso');
      expect(calls[0][1].text).toContain('Jose');
    });
  });

  describe('handleScanCommand', () => {
    it('runs Sentinel scan and reports clear', async () => {
      const { runQuickScan } = await import('../../services/sentinelSecurityService');
      runQuickScan.mockResolvedValue({ threatLevel: 'clear', findings: [], summary: 'All clear.' });

      await service.handleScanCommand('test-token', 'chat-123');

      const calls = mockInvoke.mock.calls.filter(c => c[0] === 'telegram_send_message');
      const scanMsg = calls.find(c => c[1].text.includes('Sentinel Scan'));
      expect(scanMsg).toBeTruthy();
      expect(scanMsg[1].text).toContain('clear');
    });
  });

  describe('handleFilesCommand', () => {
    it('returns desktop-only message when Tauri unavailable', async () => {
      await service.handleFilesCommand('test-token', 'chat-123');
      const calls = mockInvoke.mock.calls.filter(c => c[0] === 'telegram_send_message');
      expect(calls[0][1].text).toContain('desktop');
    });
  });

  describe('handleNovaCommand', () => {
    it('sends no-history message when empty', async () => {
      const { getOpportunityHistory } = await import('../../services/novaAnalysisService');
      getOpportunityHistory.mockReturnValue([]);

      await service.handleNovaCommand('test-token', 'chat-123');

      const calls = mockInvoke.mock.calls.filter(c => c[0] === 'telegram_send_message');
      expect(calls[0][1].text).toContain('No Nova analysis');
    });
  });

  describe('handleReportCommand', () => {
    it('generates full report with all sections', async () => {
      mockBus.listApprovalQueue.mockReturnValue([]);
      mockJose.listJoseCommands.mockReturnValue([]);
      const { listAgentActivity } = await import('../../services/agentActivityService');
      listAgentActivity.mockReturnValue([]);

      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

      await service.handleReportCommand('test-token', 'chat-123');

      const calls = mockInvoke.mock.calls.filter(c => c[0] === 'telegram_send_message');
      expect(calls[0][1].text).toContain('Alphonso Report');
      expect(calls[0][1].text).toContain('Queue');
      expect(calls[0][1].text).toContain('Activity');
    });
  });

  describe('/receipts command via processInboundCommands', () => {
    it('routes /receipts to handler', async () => {
      mockAppStorage.getStorage.mockImplementation((key) => {
        if (key === 'alphonso_telegram_owner_chat_id') return 'owner-chat';
        return null;
      });

      const { listOrchestrationReceipts } = await import('../../services/orchestrationReceiptService');
      listOrchestrationReceipts.mockReturnValue([]);

      await service.processInboundCommands('test-token', {
        ok: true,
        messages: [{ chat: { id: 'owner-chat' }, message: { text: '/receipts' }, update_id: 1 }]
      });

      expect(listOrchestrationReceipts).toHaveBeenCalled();
    });
  });
});
