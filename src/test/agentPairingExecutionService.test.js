import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null)
}));

const {
  executeAgentPairing,
  rejectAgentPairing,
  listPairingEvents
} = await import('../services/agentPairingExecutionService.js');

const { AGENT_PAIRINGS_V1 } = await import('../services/agentPairingConstants.js');

const EVENT_KEY = 'alphonso_pairing_events_v1';
const PACKET_KEY = 'alphonso_agent_bus_packets_v1';

describe('agentPairingExecutionService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('executeAgentPairing', () => {
    it('returns error for unknown pairing ID', () => {
      const result = executeAgentPairing('bogus->route');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Unknown pairing.');
    });

    it('creates and executes a valid MIYA_COMFYUI pairing', () => {
      const result = executeAgentPairing(AGENT_PAIRINGS_V1.MIYA_COMFYUI, { prompt: 'test' });
      expect(result.ok).toBe(true);
      expect(result.pairingId).toBe('miya->comfyui');
      expect(result.packetId).toMatch(/^packet-/);
      expect(result.route.type).toBe('generation_request');
      expect(result.status).toBe('executed');
    });

    it('creates and executes a valid JOSE_MIYA pairing', () => {
      const result = executeAgentPairing(AGENT_PAIRINGS_V1.JOSE_MIYA, { task: 'delegate' });
      expect(result.ok).toBe(true);
      expect(result.pairingId).toBe('jose->miya');
      expect(result.route.from).toBe('jose');
      expect(result.route.to).toBe('miya');
    });

    it('creates and executes a valid MIYA_MARIA pairing', () => {
      const result = executeAgentPairing(AGENT_PAIRINGS_V1.MIYA_MARIA, { content: 'test' });
      expect(result.ok).toBe(true);
      expect(result.route.type).toBe('content_handoff');
    });

    it('creates and executes a valid MARIA_JOSE pairing', () => {
      const result = executeAgentPairing(AGENT_PAIRINGS_V1.MARIA_JOSE, { status: 'ok' });
      expect(result.ok).toBe(true);
      expect(result.route.type).toBe('status_report');
    });

    it('auto-approves all pairings', () => {
      const result = executeAgentPairing(AGENT_PAIRINGS_V1.MIYA_COMFYUI, {});
      expect(result.ok).toBe(true);
      const packets = JSON.parse(localStorage.getItem(PACKET_KEY) || '[]');
      const packet = packets.find((p) => p.id === result.packetId);
      expect(packet.status).toBe('executed');
    });

    it('writes packet to localStorage', () => {
      const before = JSON.parse(localStorage.getItem(PACKET_KEY) || '[]').length;
      executeAgentPairing(AGENT_PAIRINGS_V1.MIYA_COMFYUI, { prompt: 'x' });
      const after = JSON.parse(localStorage.getItem(PACKET_KEY) || '[]').length;
      expect(after).toBe(before + 1);
    });

    it('logs pairing event on creation', () => {
      executeAgentPairing(AGENT_PAIRINGS_V1.JOSE_MIYA, {});
      const events = JSON.parse(localStorage.getItem(EVENT_KEY) || '[]');
      expect(events.length).toBeGreaterThan(0);
      const creationEvent = events.find((e) => e.status === 'packet_created');
      expect(creationEvent).toBeDefined();
      expect(creationEvent.pairingId).toBe('jose->miya');
    });

    it('logs auto_approved event', () => {
      executeAgentPairing(AGENT_PAIRINGS_V1.MIYA_MARIA, {});
      const events = JSON.parse(localStorage.getItem(EVENT_KEY) || '[]');
      const approvedEvent = events.find((e) => e.status === 'auto_approved');
      expect(approvedEvent).toBeDefined();
    });

    it('logs executed event', () => {
      executeAgentPairing(AGENT_PAIRINGS_V1.MARIA_JOSE, {});
      const events = JSON.parse(localStorage.getItem(EVENT_KEY) || '[]');
      const executedEvent = events.find((e) => e.status === 'executed');
      expect(executedEvent).toBeDefined();
    });

    it('includes context in execution result via packet', () => {
      const ctx = { prompt: 'hello', seed: 42 };
      const result = executeAgentPairing(AGENT_PAIRINGS_V1.MIYA_COMFYUI, ctx);
      const packets = JSON.parse(localStorage.getItem(PACKET_KEY) || '[]');
      const packet = packets.find((p) => p.id === result.packetId);
      expect(packet.executionResult.input).toEqual(ctx);
    });
  });

  describe('rejectAgentPairing', () => {
    it('returns error when no pending pairing found', () => {
      const result = rejectAgentPairing('nonexistent');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('No pending pairing packet found.');
    });
  });

  describe('listPairingEvents', () => {
    it('returns empty array when no events exist', () => {
      expect(listPairingEvents()).toEqual([]);
    });

    it('returns events after execution', () => {
      executeAgentPairing(AGENT_PAIRINGS_V1.MIYA_COMFYUI, {});
      const events = listPairingEvents();
      expect(events.length).toBe(3);
    });

    it('respects limit parameter', () => {
      executeAgentPairing(AGENT_PAIRINGS_V1.MIYA_COMFYUI, {});
      executeAgentPairing(AGENT_PAIRINGS_V1.JOSE_MIYA, {});
      const events = listPairingEvents(2);
      expect(events.length).toBeLessThanOrEqual(2);
    });

    it('storage cap enforced on write (200 max)', () => {
      for (let i = 0; i < 210; i++) {
        executeAgentPairing(AGENT_PAIRINGS_V1.MIYA_COMFYUI, { i });
      }
      const raw = localStorage.getItem(EVENT_KEY);
      const events = JSON.parse(raw || '[]');
      expect(events.length).toBeLessThanOrEqual(200);
    });
  });
});
