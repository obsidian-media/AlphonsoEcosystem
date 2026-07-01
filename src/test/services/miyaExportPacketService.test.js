import { describe, it, expect, vi } from 'vitest';
import { buildMiyaExportPacket, createMiyaExportHandoffPacket } from '../../services/miyaExportPacketService';

vi.mock('../../services/agentBusService', () => ({
  AGENTS: { MIYA: 'miya', JOSE: 'jose' },
  createAgentPacket: vi.fn((data) => ({ ...data, packetId: 'test-packet' }))
}));

vi.mock('../../services/trustModel', () => ({
  TRUST_STATES: { TEMPORARY: 'temporary', UNVERIFIED: 'unverified' },
  timestampMs: vi.fn(() => Date.now())
}));

describe('miyaExportPacketService', () => {
  describe('buildMiyaExportPacket', () => {
    it('creates export packet with defaults', () => {
      const packet = buildMiyaExportPacket({ exportType: 'image', title: 'Test' });
      expect(packet.exportVersion).toBe('1.0.0');
      expect(packet.exportType).toBe('image');
      expect(packet.title).toBe('Test');
      expect(packet.privacyStatus).toBe('private');
      expect(packet.metadata.sourceAgent).toBe('miya');
    });

    it('filters falsy artifactPaths', () => {
      const packet = buildMiyaExportPacket({
        exportType: 'video',
        title: 'Test',
        artifactPaths: ['path1', null, 'path2', undefined]
      });
      expect(packet.artifactPaths).toEqual(['path1', 'path2']);
    });

    it('uses default title when not provided', () => {
      const packet = buildMiyaExportPacket({ exportType: 'image' });
      expect(packet.title).toBe('Untitled export');
    });
  });

  describe('createMiyaExportHandoffPacket', () => {
    it('creates handoff packet', () => {
      const packet = createMiyaExportHandoffPacket({ title: 'Export test' }, { source: 'test' });
      expect(packet.fromAgent).toBe('miya');
      expect(packet.toAgent).toBe('jose');
      expect(packet.packetType).toBe('miya_export_handoff');
      expect(packet.requiresApproval).toBe(true);
    });

    it('uses defaults for options', () => {
      const packet = createMiyaExportHandoffPacket({ title: 'Test' });
      expect(packet.riskLevel).toBe('medium');
      expect(packet.actionType).toBe('creative_export_handoff');
    });
  });
});
