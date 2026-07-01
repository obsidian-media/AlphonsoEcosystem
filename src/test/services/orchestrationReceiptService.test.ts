import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockDurableGet = vi.fn(() => null);
const mockDurableSet = vi.fn();
vi.mock('../../lib/durableStore', () => ({
  durableGet: (...args) => mockDurableGet(...args),
  durableSet: (...args) => mockDurableSet(...args),
}));

vi.mock('../../services/runtimeLedgerService', () => ({
  persistScopeRows: vi.fn(),
}));

vi.mock('../../services/toolNotificationDispatcher', () => ({
  dispatchReceiptNotifications: vi.fn().mockResolvedValue(undefined),
}));

import {
  listOrchestrationReceipts,
  appendOrchestrationReceipt,
  ORCHESTRATION_RECEIPT_SCOPE
} from '../../services/orchestrationReceiptService';

describe('orchestrationReceiptService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDurableGet.mockReturnValue(null);
  });

  describe('appendOrchestrationReceipt', () => {
    it('creates receipt with generated id', () => {
      const receipt = appendOrchestrationReceipt({ eventType: 'test' });
      expect(receipt.id).toMatch(/^orx-/);
      expect(receipt.eventType).toBe('test');
    });

    it('uses provided fields', () => {
      const receipt = appendOrchestrationReceipt({
        eventType: 'command_executed',
        status: 'success',
        agent: 'hector',
        connectorId: 'telegram',
        riskLevel: 'medium',
        approved: true,
      });
      expect(receipt.eventType).toBe('command_executed');
      expect(receipt.status).toBe('success');
      expect(receipt.agent).toBe('hector');
      expect(receipt.connectorId).toBe('telegram');
      expect(receipt.riskLevel).toBe('medium');
      expect(receipt.approved).toBe(true);
    });

    it('uses defaults for optional fields', () => {
      const receipt = appendOrchestrationReceipt({ eventType: 'event' });
      expect(receipt.status).toBe('recorded');
      expect(receipt.agent).toBe('jose');
      expect(receipt.riskLevel).toBe('low');
      expect(receipt.approved).toBe(false);
      expect(receipt.blocked).toBe(false);
      expect(receipt.setupRequired).toBe(false);
      expect(receipt.details).toEqual({});
    });

    it('persists receipt via durableSet', () => {
      appendOrchestrationReceipt({ eventType: 'test' });
      expect(mockDurableSet).toHaveBeenCalledWith(
        'alphonso_orchestration_receipts_v1',
        expect.any(String)
      );
    });

    it('generates numeric timestampMs', () => {
      const receipt = appendOrchestrationReceipt({ eventType: 'test' });
      expect(typeof receipt.timestampMs).toBe('number');
      expect(receipt.timestampMs).toBeGreaterThan(0);
    });

    it('generates unique ids for each receipt', () => {
      const r1 = appendOrchestrationReceipt({ eventType: 'test' });
      const r2 = appendOrchestrationReceipt({ eventType: 'test' });
      expect(r1.id).not.toBe(r2.id);
    });
  });

  describe('listOrchestrationReceipts', () => {
    it('returns empty array when no receipts', () => {
      mockDurableGet.mockReturnValue(null);
      expect(listOrchestrationReceipts()).toEqual([]);
    });

    it('returns receipts in reverse chronological order', () => {
      const receipts = [
        { id: 'orx-1', eventType: 'a', timestampMs: 100 },
        { id: 'orx-2', eventType: 'b', timestampMs: 200 },
      ];
      mockDurableGet.mockReturnValue(JSON.stringify(receipts));
      const result = listOrchestrationReceipts();
      expect(result[0].id).toBe('orx-2');
      expect(result[1].id).toBe('orx-1');
    });

    it('filters by agent', () => {
      const receipts = [
        { id: 'orx-1', agent: 'jose', eventType: 'a' },
        { id: 'orx-2', agent: 'hector', eventType: 'b' },
      ];
      mockDurableGet.mockReturnValue(JSON.stringify(receipts));
      const result = listOrchestrationReceipts({ agent: 'hector' });
      expect(result).toHaveLength(1);
      expect(result[0].agent).toBe('hector');
    });

    it('filters by status', () => {
      const receipts = [
        { id: 'orx-1', status: 'success', eventType: 'a' },
        { id: 'orx-2', status: 'failed', eventType: 'b' },
      ];
      mockDurableGet.mockReturnValue(JSON.stringify(receipts));
      const result = listOrchestrationReceipts({ status: 'failed' });
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('failed');
    });

    it('filters by eventType', () => {
      const receipts = [
        { id: 'orx-1', eventType: 'command_executed' },
        { id: 'orx-2', eventType: 'workflow_completed' },
      ];
      mockDurableGet.mockReturnValue(JSON.stringify(receipts));
      const result = listOrchestrationReceipts({ eventType: 'workflow_completed' });
      expect(result).toHaveLength(1);
    });

    it('returns empty on corrupt JSON', () => {
      mockDurableGet.mockReturnValue('not-json');
      expect(listOrchestrationReceipts()).toEqual([]);
    });

    it('returns empty when stored value is not an array', () => {
      mockDurableGet.mockReturnValue(JSON.stringify({ not: 'array' }));
      expect(listOrchestrationReceipts()).toEqual([]);
    });
  });

  describe('ORCHESTRATION_RECEIPT_SCOPE', () => {
    it('has correct scope value', () => {
      expect(ORCHESTRATION_RECEIPT_SCOPE).toBe('orchestration_receipts_v1');
    });
  });
});
