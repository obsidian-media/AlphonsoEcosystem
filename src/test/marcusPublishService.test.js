import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MARCUS_PUBLISH_PLATFORMS,
  buildMarcusPublishPacket,
  executeMarcusPublish
} from '../services/marcusPublishService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../services/trustModel', () => ({
  timestampMs: vi.fn(() => Date.now()),
  TRUST_STATES: {
    VERIFIED: 'verified',
    FAILED: 'failed',
    TEMPORARY: 'temporary',
    UNVERIFIED: 'unverified',
    PENDING: 'pending'
  }
}));

vi.mock('../services/agentBusService', () => ({
  AGENTS: {
    MARCUS: 'marcus',
    JOSE: 'jose'
  },
  createAgentPacket: vi.fn((opts) => ({
    packetId: 'pkt-test-123',
    fromAgent: opts.fromAgent,
    toAgent: opts.toAgent,
    title: opts.title,
    packetType: opts.packetType,
    payload: opts.payload,
    requiresApproval: opts.requiresApproval,
    riskLevel: opts.riskLevel
  })),
  updatePacketStatus: vi.fn()
}));

vi.mock('../services/approval/approvalService', () => ({
  requireApproval: vi.fn(async () => ({ ok: true }))
}));

vi.mock('../services/orchestrationReceiptService', () => ({
  appendOrchestrationReceipt: vi.fn()
}));

vi.mock('../services/sessionIntelligenceService', () => ({
  appendSessionEvent: vi.fn()
}));

vi.mock('../services/metaPublishService', () => ({
  publishMetaContent: vi.fn(async () => ({ ok: true }))
}));

vi.mock('../services/connectorRegistryService', () => ({
  sendTelegramConnectorMessage: vi.fn(async () => ({ ok: true })),
  sendWhatsAppConnectorMessage: vi.fn(async () => ({ ok: true })),
  sendNotionConnectorEntry: vi.fn(async () => ({ ok: true })),
  sendClickUpConnectorTask: vi.fn(async () => ({ ok: true })),
  uploadYouTubeConnectorVideo: vi.fn(async () => ({ ok: true }))
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── MARCUS_PUBLISH_PLATFORMS ──────────────────────────────────────────────────

describe('MARCUS_PUBLISH_PLATFORMS', () => {
  it('exports an array of platform configs', () => {
    expect(Array.isArray(MARCUS_PUBLISH_PLATFORMS)).toBe(true);
    expect(MARCUS_PUBLISH_PLATFORMS.length).toBeGreaterThan(0);
  });

  it('each platform has id, label, connector, fields', () => {
    for (const p of MARCUS_PUBLISH_PLATFORMS) {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('label');
      expect(p).toHaveProperty('connector');
      expect(Array.isArray(p.fields)).toBe(true);
    }
  });

  it('includes instagram, facebook, youtube, telegram, whatsapp, notion, clickup', () => {
    const ids = MARCUS_PUBLISH_PLATFORMS.map((p) => p.id);
    expect(ids).toContain('instagram');
    expect(ids).toContain('youtube');
    expect(ids).toContain('telegram');
    expect(ids).toContain('whatsapp');
    expect(ids).toContain('notion');
    expect(ids).toContain('clickup');
  });
});

// ── buildMarcusPublishPacket ──────────────────────────────────────────────────

describe('buildMarcusPublishPacket', () => {
  it('creates a packet with correct packetType', () => {
    const packet = buildMarcusPublishPacket({
      platform: 'telegram',
      payload: { chatId: '123', text: 'Hello' }
    });
    expect(packet.packetType).toBe('marcus_publish_handoff');
  });

  it('packet requires approval and has high risk level', () => {
    const packet = buildMarcusPublishPacket({
      platform: 'instagram',
      payload: { caption: 'Test post', imageUrl: 'https://img.com/a.jpg' }
    });
    expect(packet.requiresApproval).toBe(true);
    expect(packet.riskLevel).toBe('high');
  });

  it('packet fromAgent is marcus and toAgent is jose', () => {
    const packet = buildMarcusPublishPacket({
      platform: 'telegram',
      payload: { chatId: '123', text: 'msg' }
    });
    expect(packet.fromAgent).toBe('marcus');
    expect(packet.toAgent).toBe('jose');
  });

  it('includes platform and payload in packet payload', () => {
    const packet = buildMarcusPublishPacket({
      platform: 'whatsapp',
      payload: { to: '+1234567890', text: 'Hello World' }
    });
    expect(packet.payload.platform).toBe('whatsapp');
    expect(packet.payload.to).toBe('+1234567890');
  });

  it('title includes platform name', () => {
    const packet = buildMarcusPublishPacket({
      platform: 'notion',
      payload: { title: 'My Note', content: 'Content here' }
    });
    expect(packet.title).toContain('notion');
  });
});

// ── executeMarcusPublish ──────────────────────────────────────────────────────

describe('executeMarcusPublish', () => {
  it('returns ok:true for telegram platform with approval', async () => {
    const result = await executeMarcusPublish({
      platform: 'telegram',
      payload: { chatId: '123', text: 'Hello from Marcus' },
      preApproved: true
    });
    expect(result.ok).toBe(true);
    expect(result.platform).toBe('telegram');
  });

  it('calls sendTelegramConnectorMessage for telegram', async () => {
    const { sendTelegramConnectorMessage } = await import('../services/connectorRegistryService');
    await executeMarcusPublish({
      platform: 'telegram',
      payload: { chatId: 'abc', text: 'test' },
      preApproved: true
    });
    expect(sendTelegramConnectorMessage).toHaveBeenCalledWith('abc', 'test', expect.any(Object));
  });

  it('calls sendWhatsAppConnectorMessage for whatsapp', async () => {
    const { sendWhatsAppConnectorMessage } = await import('../services/connectorRegistryService');
    await executeMarcusPublish({
      platform: 'whatsapp',
      payload: { to: '+1234567890', text: 'WA msg' },
      preApproved: true
    });
    expect(sendWhatsAppConnectorMessage).toHaveBeenCalledWith('+1234567890', 'WA msg', expect.any(Object));
  });

  it('calls publishMetaContent for instagram', async () => {
    const { publishMetaContent } = await import('../services/metaPublishService');
    await executeMarcusPublish({
      platform: 'instagram',
      payload: { caption: 'Check this out!', imageUrl: 'https://img.com/x.jpg' },
      preApproved: true
    });
    expect(publishMetaContent).toHaveBeenCalled();
  });

  it('returns ok:false and denial reason when approval is rejected', async () => {
    const { requireApproval } = await import('../services/approval/approvalService');
    requireApproval.mockResolvedValueOnce({ ok: false, reason: 'Rejected by policy' });

    const result = await executeMarcusPublish({
      platform: 'telegram',
      payload: { chatId: '123', text: 'blocked' },
      preApproved: false
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/denied|Rejected|policy/i);
  });

  it('returns ok:false for unsupported platform', async () => {
    const result = await executeMarcusPublish({
      platform: 'unsupported_xyz',
      payload: {},
      preApproved: true
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unsupported/i);
  });

  it('calls sendNotionConnectorEntry for notion', async () => {
    const { sendNotionConnectorEntry } = await import('../services/connectorRegistryService');
    await executeMarcusPublish({
      platform: 'notion',
      payload: { title: 'Note', content: 'Body', parentPageId: 'page-123' },
      preApproved: true
    });
    expect(sendNotionConnectorEntry).toHaveBeenCalledWith(
      { title: 'Note', content: 'Body', parentPageId: 'page-123' },
      expect.any(Object)
    );
  });

  it('calls sendClickUpConnectorTask for clickup', async () => {
    const { sendClickUpConnectorTask } = await import('../services/connectorRegistryService');
    await executeMarcusPublish({
      platform: 'clickup',
      payload: { title: 'Task', content: 'Details', listId: 'list-456' },
      preApproved: true
    });
    expect(sendClickUpConnectorTask).toHaveBeenCalledWith(
      { title: 'Task', content: 'Details', listId: 'list-456' },
      expect.any(Object)
    );
  });

  it('appends orchestration receipt on success', async () => {
    const { appendOrchestrationReceipt } = await import('../services/orchestrationReceiptService');
    await executeMarcusPublish({
      platform: 'telegram',
      payload: { chatId: '123', text: 'test' },
      preApproved: true
    });
    expect(appendOrchestrationReceipt).toHaveBeenCalled();
  });
});
