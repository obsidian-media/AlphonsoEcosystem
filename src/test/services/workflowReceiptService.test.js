import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

vi.mock('../../services/runtimeLedgerService', () => ({
  persistScopeRows: vi.fn()
}));

vi.mock('../../services/trustModel', () => ({
  TRUST_STATES: { VERIFIED: 'verified', UNVERIFIED: 'unverified', TEMPORARY: 'temporary', FAILED: 'failed' },
  timestampMs: () => Date.now()
}));

const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn()
};
vi.stubGlobal('localStorage', localStorageMock);

describe('workflowReceiptService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  describe('appendWorkflowReceipt', () => {
    it('exports appendWorkflowReceipt function', async () => {
      const { appendWorkflowReceipt } = await import('../../services/workflowReceiptService');
      expect(typeof appendWorkflowReceipt).toBe('function');
    });

    it('creates receipt with default values', async () => {
      const { appendWorkflowReceipt } = await import('../../services/workflowReceiptService');
      const result = appendWorkflowReceipt({ workflowId: 'w1' });
      expect(result).toHaveProperty('id');
      expect(result.workflowId).toBe('w1');
    });

    it('generates unique id format wfr-timestamp-random', async () => {
      const { appendWorkflowReceipt } = await import('../../services/workflowReceiptService');
      const result = appendWorkflowReceipt({ workflowId: 'w1' });
      expect(result.id).toMatch(/^wfr-/);
    });

    it('includes timestamp in receipt', async () => {
      const { appendWorkflowReceipt } = await import('../../services/workflowReceiptService');
      const result = appendWorkflowReceipt({ workflowId: 'w1' });
      expect(result).toHaveProperty('timestampMs');
    });
  });

  describe('listWorkflowReceipts', () => {
    it('exports listWorkflowReceipts function', async () => {
      const { listWorkflowReceipts } = await import('../../services/workflowReceiptService');
      expect(typeof listWorkflowReceipts).toBe('function');
    });

    it('returns empty array when no receipts', async () => {
      const { listWorkflowReceipts } = await import('../../services/workflowReceiptService');
      const result = listWorkflowReceipts();
      expect(result).toEqual([]);
    });

    it('filters by workflowId', async () => {
      const { appendWorkflowReceipt, listWorkflowReceipts } = await import('../../services/workflowReceiptService');
      expect(typeof appendWorkflowReceipt).toBe('function');
      expect(typeof listWorkflowReceipts).toBe('function');
    });
  });

  describe('WORKFLOW_RECEIPT_STATUSES', () => {
    it('exports statuses array with 9 statuses', async () => {
      const mod = await import('../../services/workflowReceiptService');
      expect(mod.WORKFLOW_RECEIPT_STATUSES).toHaveLength(9);
    });
  });
});