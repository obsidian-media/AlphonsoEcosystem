import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
  isTauri: vi.fn().mockReturnValue(false)
}));

const RECEIPT_KEY = 'alphonso_orchestration_receipts_v1';

const {
  listOrchestrationReceipts,
  appendOrchestrationReceipt,
  ORCHESTRATION_RECEIPT_SCOPE
} = await import('../services/orchestrationReceiptService.ts');

describe('orchestrationReceiptService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('appendOrchestrationReceipt', () => {
    it('creates a receipt with correct fields', () => {
      const receipt = appendOrchestrationReceipt({
        workflowId: 'wf-1',
        commandId: 'cmd-1',
        packetId: 'pkt-1',
        eventType: 'packet_routed',
        status: 'recorded',
        agent: 'jose',
        connectorId: 'telegram',
        actionType: 'send_message',
        riskLevel: 'medium',
        approved: true,
        blocked: false,
        setupRequired: false,
        details: { channel: 'test' }
      });
      expect(receipt.id).toMatch(/^orx-/);
      expect(receipt.workflowId).toBe('wf-1');
      expect(receipt.commandId).toBe('cmd-1');
      expect(receipt.packetId).toBe('pkt-1');
      expect(receipt.eventType).toBe('packet_routed');
      expect(receipt.status).toBe('recorded');
      expect(receipt.agent).toBe('jose');
      expect(receipt.connectorId).toBe('telegram');
      expect(receipt.actionType).toBe('send_message');
      expect(receipt.riskLevel).toBe('medium');
      expect(receipt.approved).toBe(true);
      expect(receipt.blocked).toBe(false);
      expect(receipt.setupRequired).toBe(false);
      expect(receipt.details).toEqual({ channel: 'test' });
      expect(receipt.timestampMs).toBeGreaterThan(0);
    });

    it('defaults optional fields correctly', () => {
      const receipt = appendOrchestrationReceipt({ eventType: 'test' });
      expect(receipt.workflowId).toBeNull();
      expect(receipt.commandId).toBeNull();
      expect(receipt.packetId).toBeNull();
      expect(receipt.eventType).toBe('test');
      expect(receipt.status).toBe('recorded');
      expect(receipt.agent).toBe('jose');
      expect(receipt.connectorId).toBeNull();
      expect(receipt.actionType).toBeNull();
      expect(receipt.riskLevel).toBe('low');
      expect(receipt.approved).toBe(false);
      expect(receipt.blocked).toBe(false);
      expect(receipt.setupRequired).toBe(false);
      expect(receipt.details).toEqual({});
    });

    it('defaults eventType to event when not provided', () => {
      const receipt = appendOrchestrationReceipt({});
      expect(receipt.eventType).toBe('event');
    });

    it('persists to localStorage', () => {
      appendOrchestrationReceipt({ eventType: 'routed', workflowId: 'wf-1' });
      const raw = localStorage.getItem(RECEIPT_KEY);
      expect(raw).toBeTruthy();
      const receipts = JSON.parse(raw);
      expect(receipts).toHaveLength(1);
      expect(receipts[0].workflowId).toBe('wf-1');
    });

    it('stores multiple receipts', () => {
      appendOrchestrationReceipt({ eventType: 'e1', workflowId: 'wf-1' });
      appendOrchestrationReceipt({ eventType: 'e2', workflowId: 'wf-2' });
      const receipts = JSON.parse(localStorage.getItem(RECEIPT_KEY));
      expect(receipts).toHaveLength(2);
    });

    it('coerces approved and blocked to booleans', () => {
      const receipt = appendOrchestrationReceipt({ eventType: 'e', approved: 1, blocked: 'yes' });
      expect(typeof receipt.approved).toBe('boolean');
      expect(typeof receipt.blocked).toBe('boolean');
    });
  });

  describe('listOrchestrationReceipts', () => {
    it('returns empty array when no receipts exist', () => {
      const result = listOrchestrationReceipts();
      expect(result).toEqual([]);
    });

    it('returns receipts in reverse order (most recent first)', () => {
      appendOrchestrationReceipt({ eventType: 'e1', workflowId: 'wf-1' });
      appendOrchestrationReceipt({ eventType: 'e2', workflowId: 'wf-2' });
      const result = listOrchestrationReceipts();
      expect(result).toHaveLength(2);
      expect(result[0].eventType).toBe('e2');
      expect(result[1].eventType).toBe('e1');
    });

    it('filters by workflowId', () => {
      appendOrchestrationReceipt({ eventType: 'e1', workflowId: 'wf-1' });
      appendOrchestrationReceipt({ eventType: 'e2', workflowId: 'wf-2' });
      appendOrchestrationReceipt({ eventType: 'e3', workflowId: 'wf-1' });
      const result = listOrchestrationReceipts({ workflowId: 'wf-1' });
      expect(result).toHaveLength(2);
      result.forEach((r) => expect(r.workflowId).toBe('wf-1'));
    });

    it('filters by commandId', () => {
      appendOrchestrationReceipt({ eventType: 'e1', commandId: 'cmd-a' });
      appendOrchestrationReceipt({ eventType: 'e2', commandId: 'cmd-b' });
      const result = listOrchestrationReceipts({ commandId: 'cmd-a' });
      expect(result).toHaveLength(1);
      expect(result[0].commandId).toBe('cmd-a');
    });

    it('filters by agent', () => {
      appendOrchestrationReceipt({ eventType: 'e1', agent: 'jose' });
      appendOrchestrationReceipt({ eventType: 'e2', agent: 'alphonso' });
      const result = listOrchestrationReceipts({ agent: 'alphonso' });
      expect(result).toHaveLength(1);
      expect(result[0].agent).toBe('alphonso');
    });

    it('filters by status', () => {
      appendOrchestrationReceipt({ eventType: 'e1', status: 'recorded' });
      appendOrchestrationReceipt({ eventType: 'e2', status: 'confirmed' });
      const result = listOrchestrationReceipts({ status: 'confirmed' });
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('confirmed');
    });

    it('filters by eventType', () => {
      appendOrchestrationReceipt({ eventType: 'packet_routed' });
      appendOrchestrationReceipt({ eventType: 'packet_executed' });
      appendOrchestrationReceipt({ eventType: 'packet_routed' });
      const result = listOrchestrationReceipts({ eventType: 'packet_routed' });
      expect(result).toHaveLength(2);
    });

    it('combines multiple filters', () => {
      appendOrchestrationReceipt({ eventType: 'e1', workflowId: 'wf-1', agent: 'jose', status: 'recorded' });
      appendOrchestrationReceipt({ eventType: 'e2', workflowId: 'wf-1', agent: 'alphonso', status: 'confirmed' });
      appendOrchestrationReceipt({ eventType: 'e3', workflowId: 'wf-2', agent: 'jose', status: 'recorded' });
      const result = listOrchestrationReceipts({ workflowId: 'wf-1', agent: 'jose' });
      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('e1');
    });

    it('returns empty when filter matches nothing', () => {
      appendOrchestrationReceipt({ eventType: 'e1', workflowId: 'wf-1' });
      const result = listOrchestrationReceipts({ workflowId: 'nonexistent' });
      expect(result).toEqual([]);
    });
  });

  describe('persistence', () => {
    it('survives a read/write cycle', () => {
      appendOrchestrationReceipt({ eventType: 'e1', workflowId: 'wf-1', details: { nested: true } });
      appendOrchestrationReceipt({ eventType: 'e2', workflowId: 'wf-2', blocked: true });

      const stored = JSON.parse(localStorage.getItem(RECEIPT_KEY));
      expect(stored).toHaveLength(2);
      expect(stored[0].details).toEqual({ nested: true });
      expect(stored[1].blocked).toBe(true);
    });

    it('recovers from corrupt JSON gracefully', () => {
      localStorage.setItem(RECEIPT_KEY, 'not-json{{{');
      const result = listOrchestrationReceipts();
      expect(result).toEqual([]);
    });

    it('recovers from non-array stored value', () => {
      localStorage.setItem(RECEIPT_KEY, JSON.stringify({ not: 'array' }));
      const result = listOrchestrationReceipts();
      expect(result).toEqual([]);
    });

    it('caps stored receipts at 3000', () => {
      const many = Array.from({ length: 3001 }, (_, i) => ({
        id: `orx-old-${i}`,
        eventType: 'old',
        workflowId: `wf-${i}`
      }));
      localStorage.setItem(RECEIPT_KEY, JSON.stringify(many));

      appendOrchestrationReceipt({ eventType: 'new', workflowId: 'wf-new' });

      const stored = JSON.parse(localStorage.getItem(RECEIPT_KEY));
      expect(stored.length).toBeLessThanOrEqual(3000);
      expect(stored[stored.length - 1].eventType).toBe('new');
    });
  });

  describe('ORCHESTRATION_RECEIPT_SCOPE', () => {
    it('exports the correct scope constant', () => {
      expect(ORCHESTRATION_RECEIPT_SCOPE).toBe('orchestration_receipts_v1');
    });
  });
});
