import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../orchestrationReceiptService', () => ({
  appendOrchestrationReceipt: vi.fn()
}));

vi.mock('../trustModel', () => ({
  TRUST_STATES: { VERIFIED: 'verified', PENDING: 'pending' }
}));

const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn()
};
vi.stubGlobal('localStorage', localStorageMock);

const {
  requiresApproval,
  getApprovalReason,
  createApprovalRequest,
  requireApproval,
  approveRequest,
  rejectRequest,
  listPendingApprovals,
  listAllApprovals
} = await import('../../services/approval/approvalService');

describe('approvalService', () => {
  beforeEach(() => {
    localStorageMock.getItem.mockReturnValue(null);
    vi.clearAllMocks();
  });

  describe('requiresApproval', () => {
    it('returns true for file_write action', () => {
      expect(requiresApproval('file_write')).toBe(true);
    });

    it('returns true for terminal_command action', () => {
      expect(requiresApproval('terminal_command')).toBe(true);
    });

    it('returns true for deployment action', () => {
      expect(requiresApproval('deployment')).toBe(true);
    });

    it('returns false for unknown action', () => {
      expect(requiresApproval('unknown')).toBe(false);
    });

    it('handles null/undefined gracefully', () => {
      expect(requiresApproval(null)).toBe(false);
      expect(requiresApproval(undefined)).toBe(false);
    });
  });

  describe('getApprovalReason', () => {
    it('returns specific reason for known action types', () => {
      expect(getApprovalReason('file_write')).toContain('supervision');
      expect(getApprovalReason('terminal_command')).toContain('runtime');
    });

    it('returns default reason for unknown action', () => {
      expect(getApprovalReason('unknown')).toContain('supervision');
    });
  });

  describe('createApprovalRequest', () => {
    it('creates approval with default values', () => {
      const mockSetItem = vi.fn();
      localStorageMock.setItem.mockImplementation(mockSetItem);
      const request = createApprovalRequest({ actionType: 'file_write' });
      expect(request.status).toBe('pending');
      expect(request.actionType).toBe('file_write');
      expect(request.id).toMatch(/^approval-/);
    });

    it('accepts custom riskLevel', () => {
      localStorageMock.setItem.mockImplementation(() => {});
      const request = createApprovalRequest({ actionType: 'file_write', riskLevel: 'high' });
      expect(request.riskLevel).toBe('high');
    });
  });

  describe('requireApproval', () => {
    it('returns ok=true when approved flag is set', async () => {
      const result = await requireApproval({ actionType: 'file_write', approved: true });
      expect(result.ok).toBe(true);
      expect(result.success).toBe(true);
    });

    it('returns ok=false with approval request when not approved', async () => {
      localStorageMock.setItem.mockImplementation(() => {});
      const result = await requireApproval({ actionType: 'file_write', approved: false });
      expect(result.ok).toBe(false);
      expect(result.required).toBe(true);
      expect(result.approval).toBeDefined();
    });

    it('skips approval for non-approval actions', async () => {
      const result = await requireApproval({ actionType: 'unknown', approved: false });
      expect(result.ok).toBe(true);
      expect(result.required).toBe(false);
    });
  });

  describe('approveRequest/rejectRequest', () => {
    it('approveRequest marks approval as approved', () => {
      localStorageMock.setItem.mockImplementation(() => {});
      localStorageMock.getItem.mockReturnValue(JSON.stringify([{ id: 'test-123', status: 'pending' }]));
      const result = approveRequest('test-123');
      expect(result.status).toBe('approved');
    });

    it('rejectRequest marks approval as rejected', () => {
      localStorageMock.setItem.mockImplementation(() => {});
      localStorageMock.getItem.mockReturnValue(JSON.stringify([{ id: 'test-456', status: 'pending' }]));
      const result = rejectRequest('test-456');
      expect(result.status).toBe('rejected');
    });
  });

  describe('listPendingApprovals', () => {
    it('returns empty array when no approvals', () => {
      localStorageMock.getItem.mockReturnValue(null);
      const pending = listPendingApprovals();
      expect(pending).toEqual([]);
    });

    it('filters to pending status only', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify([
        { id: 'a', status: 'pending' },
        { id: 'b', status: 'approved' }
      ]));
      const pending = listPendingApprovals();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('a');
    });
  });
});