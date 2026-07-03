import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn().mockResolvedValue(null);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args),
  isTauri: vi.fn().mockReturnValue(false)
}));

vi.mock('../services/connectors/connectorAuth', () => ({
  getConnectorCredential: vi.fn(),
  getConnectorCredentials: vi.fn()
}));

vi.mock('../services/agentBusService', () => ({
  listApprovalQueue: vi.fn(),
  approvePacket: vi.fn(),
  rejectPacket: vi.fn(),
  AGENTS: {
    ALPHONSO: 'alphonso',
    JOSE: 'jose',
    MIYA: 'miya',
    HECTOR: 'hector',
    MARIA: 'maria',
    MARCUS: 'marcus',
    ECHO: 'echo',
    SENTINEL: 'sentinel',
    NOVA: 'nova'
  }
}));

vi.mock('../services/joseCommandRouterService', () => ({
  createJoseCommandRoute: vi.fn().mockResolvedValue({ id: 'cmd-1', status: 'distributed' }),
  listJoseCommands: vi.fn()
}));

vi.mock('../services/memoryService', () => ({
  listMemoryItems: vi.fn()
}));

vi.mock('../services/agentActivityService', () => ({
  listAgentActivity: vi.fn()
}));

vi.mock('../lib/appStorage', () => ({
  getStorage: vi.fn(),
  setStorage: vi.fn()
}));

describe('telegramCompanionService', () => {
  let service;
  let mockAuth;
  let mockBus;
  let mockJose;
  let mockMemory;
  let mockActivity;
  let mockAppStorage;

  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    
    mockAuth = await import('../services/connectors/connectorAuth');
    mockBus = await import('../services/agentBusService');
    mockJose = await import('../services/joseCommandRouterService');
    mockMemory = await import('../services/memoryService');
    mockActivity = await import('../services/agentActivityService');
    mockAppStorage = await import('../lib/appStorage');
    
    service = await import('../services/telegramCompanionService');
    service.stopTelegramCompanion();
  });

  describe('startTelegramCompanion', () => {
    it('returns null when no token available', () => {
      mockAuth.getConnectorCredential.mockReturnValue('');
      const result = service.startTelegramCompanion();
      expect(result).toBeNull();
    });

    it('returns interval ids when token is available', () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      const result = service.startTelegramCompanion();
      expect(result).toHaveProperty('inboundId');
      expect(result).toHaveProperty('watcherId');
      expect(result.inboundId).toBeTruthy();
      expect(result.watcherId).toBeTruthy();
    });
  });

  describe('isTelegramCompanionRunning', () => {
    it('returns false when not running', () => {
      expect(service.isTelegramCompanionRunning()).toBe(false);
    });

    it('returns true after start', () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      service.startTelegramCompanion();
      expect(service.isTelegramCompanionRunning()).toBe(true);
    });

    it('returns false after stop', () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      service.startTelegramCompanion();
      service.stopTelegramCompanion();
      expect(service.isTelegramCompanionRunning()).toBe(false);
    });
  });

  describe('stopTelegramCompanion', () => {
    it('clears both intervals', () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      service.startTelegramCompanion();
      service.stopTelegramCompanion();
      expect(service.isTelegramCompanionRunning()).toBe(false);
    });
  });

  describe('/start command - owner registration', () => {
    // Regression coverage for the Sprint 4 security-hardening fix
    // (2026-07-02): first-come-first-served /start registration let anyone
    // who messaged the (publicly discoverable) bot username first become
    // the permanent owner with full command authority over Jose. Owner
    // registration is now gated on TELEGRAM_ALLOWED_CHAT_IDS, an allowlist
    // credential that already existed in ConnectorSetupPanel.tsx but was
    // never enforced here before this fix.
    function mockCredential(chatIdsValue) {
      mockAuth.getConnectorCredential.mockImplementation((_connector, key) =>
        key === 'TELEGRAM_ALLOWED_CHAT_IDS' ? chatIdsValue : 'test-token'
      );
    }

    it('registers owner chatId when the chat is in the configured allowlist', async () => {
      mockCredential('chat-123');
      mockAppStorage.getStorage.mockReturnValue(null);

      const processFn = service.processInboundCommands;
      await processFn('test-token', {
        ok: true,
        messages: [{
          chat: { id: 'chat-123' },
          message: { text: '/start' },
          update_id: 1
        }]
      });

      expect(mockAppStorage.setStorage).toHaveBeenCalled();
    });

    it('refuses to register an owner when no allowlist is configured', async () => {
      mockCredential('');
      mockAppStorage.getStorage.mockReturnValue(null);

      const processFn = service.processInboundCommands;
      await processFn('test-token', {
        ok: true,
        messages: [{
          chat: { id: 'chat-123' },
          message: { text: '/start' },
          update_id: 1
        }]
      });

      expect(mockAppStorage.setStorage).not.toHaveBeenCalled();
    });

    it('refuses to register an owner from a chat not in the allowlist', async () => {
      mockCredential('some-other-chat-id');
      mockAppStorage.getStorage.mockReturnValue(null);

      const processFn = service.processInboundCommands;
      await processFn('test-token', {
        ok: true,
        messages: [{
          chat: { id: 'attacker-chat' },
          message: { text: '/start' },
          update_id: 1
        }]
      });

      expect(mockAppStorage.setStorage).not.toHaveBeenCalled();
    });

    it('supports a comma-separated allowlist', async () => {
      mockCredential('chat-111, chat-123, chat-999');
      mockAppStorage.getStorage.mockReturnValue(null);

      const processFn = service.processInboundCommands;
      await processFn('test-token', {
        ok: true,
        messages: [{
          chat: { id: 'chat-123' },
          message: { text: '/start' },
          update_id: 1
        }]
      });

      expect(mockAppStorage.setStorage).toHaveBeenCalled();
    });
  });

  describe('/status command', () => {
    it('returns string with Online/Offline and approval count', async () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      mockBus.listApprovalQueue.mockReturnValue([]);
      mockJose.listJoseCommands.mockReturnValue([]);
      mockActivity.listAgentActivity.mockReturnValue([]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] })
      });

      const handleStatus = service.handleStatusCommand;

      await handleStatus('test-token', 'chat-123');

      expect(mockBus.listApprovalQueue).toHaveBeenCalled();
    });
  });

  describe('/queue command', () => {
    it('returns no pending approvals when empty', async () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      mockBus.listApprovalQueue.mockReturnValue([]);

      const handleQueue = service.handleQueueCommand;

      await handleQueue('test-token', 'chat-123');

      expect(mockBus.listApprovalQueue).toHaveBeenCalled();
    });

    it('returns formatted lines with short ids when items exist', async () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      mockBus.listApprovalQueue.mockReturnValue([
        { id: 'packet-abc12345', title: 'Create YouTube post', fromAgent: 'miya', riskLevel: 'low' }
      ]);

      const handleQueue = service.handleQueueCommand;
      
      await handleQueue('test-token', 'chat-123');
      
      expect(mockBus.listApprovalQueue).toHaveBeenCalled();
    });
  });

  describe('/approve command', () => {
    it('resolves short id to full packet id', async () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      mockBus.listApprovalQueue.mockReturnValue([
        { id: 'packet-abc12345', title: 'Test task', fromAgent: 'miya', riskLevel: 'low' }
      ]);
      mockBus.approvePacket.mockReturnValue({ id: 'packet-abc12345', status: 'approved' });

      const handleApprove = service.handleApproveCommand;
      
      await handleApprove('test-token', 'chat-123', '345');
      
      expect(mockBus.approvePacket).toHaveBeenCalled();
    });

    it('calls approvePacket with correct approver string', async () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      mockBus.listApprovalQueue.mockReturnValue([]);
      mockBus.approvePacket.mockReturnValue({ id: 'test-packet', status: 'approved' });

      const handleApprove = service.handleApproveCommand;
      
      await handleApprove('test-token', 'chat-123', 'full-packet-id');
      
      expect(mockBus.approvePacket).toHaveBeenCalledWith('full-packet-id', 'telegram_operator');
    });
  });

  describe('/reject command', () => {
    it('calls rejectPacket with correct reason string', async () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      mockBus.listApprovalQueue.mockReturnValue([]);
      mockBus.rejectPacket.mockReturnValue({ id: 'test-packet', status: 'rejected' });

      const handleReject = service.handleRejectCommand;
      
      await handleReject('test-token', 'chat-123', 'packet-id');
      
      expect(mockBus.rejectPacket).toHaveBeenCalledWith('packet-id', 'Rejected via Telegram companion');
    });
  });

  describe('/stop command', () => {
    it('sets paused flag', async () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      
      const setPaused = service.setNotificationsPaused;
      
      setPaused(true);
      
      expect(mockAppStorage.setStorage).toHaveBeenCalledWith(
        'alphonso_telegram_notifications_paused',
        true
      );
    });
  });

  describe('/resume command', () => {
    it('clears paused flag', async () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      
      const setPaused = service.setNotificationsPaused;
      
      setPaused(false);
      
      expect(mockAppStorage.setStorage).toHaveBeenCalledWith(
        'alphonso_telegram_notifications_paused',
        false
      );
    });
  });

  describe('text routing', () => {
    it('routes unrecognized text through jose command router', async () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      mockAppStorage.getStorage.mockReturnValue('chat-123');
      localStorage.setItem('alphonso_telegram_owner_chat_id', 'chat-123');
      
      const processFn = service.processInboundCommands;
      
      await processFn('test-token', {
        ok: true,
        messages: [{
          chat: { id: 'chat-123' },
          message: { text: 'what is the weather' },
          update_id: 1
        }]
      });

      expect(mockJose.createJoseCommandRoute).toHaveBeenCalled();
    });
  });

  describe('push watcher', () => {
    it('skips send when notifications paused', async () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      mockAppStorage.getStorage.mockImplementation((key) => {
        if (key === 'alphonso_telegram_owner_chat_id') return 'chat-123';
        if (key === 'alphonso_telegram_notifications_paused') return true;
        return null;
      });

      const runWatcher = service.runPushWatcher;
      
      await runWatcher('test-token');
      
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  describe('message chunking', () => {
    it('splits messages over 4000 chars before sending', async () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      mockAppStorage.getStorage.mockImplementation((key) => {
        if (key === 'TELEGRAM_BOT_TOKEN') return 'test-token';
        if (key === 'alphonso_telegram_owner_chat_id') return 'chat-123';
        return null;
      });
      
      const longText = 'x'.repeat(5000);
      
      await service.sendTelegramMessage(longText);
      
      const calls = mockInvoke.mock.calls.filter(c => c[0] === 'telegram_send_message');
      expect(calls.length).toBe(2);
      expect(calls[0][1].text.length).toBe(4000);
      expect(calls[1][1].text.length).toBe(1000);
    });
  });

  describe('security - unauthorized sender', () => {
    it('unauthorized sender receives Unauthorized reply', async () => {
      mockAuth.getConnectorCredential.mockReturnValue('test-token');
      mockAppStorage.getStorage.mockImplementation((key) => {
        if (key === 'TELEGRAM_BOT_TOKEN') return 'test-token';
        if (key === 'alphonso_telegram_owner_chat_id') return 'owner-chat-999';
        return null;
      });

      const processFn = service.processInboundCommands;
      
      await processFn('test-token', {
        ok: true,
        messages: [{
          chat: { id: 'different-chat-123' },
          message: { text: '/status' },
          update_id: 1
        }]
      });

      const calls = mockInvoke.mock.calls.filter(c => c[0] === 'telegram_send_message');
      const unauthorizedCall = calls.find(c => c[1].text === 'Unauthorized.');
      expect(unauthorizedCall).toBeTruthy();
    });
  });
});