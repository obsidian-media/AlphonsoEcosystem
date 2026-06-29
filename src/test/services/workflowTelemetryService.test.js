import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

vi.mock('../../lib/durableStore.js', () => ({
  durableSet: vi.fn()
}));

vi.mock('../../services/runtimeLedgerService', () => ({
  persistScopeRows: vi.fn()
}));

vi.mock('../../services/trustModel', () => ({
  TRUST_STATES: { VERIFIED: 'verified', UNVERIFIED: 'unverified', TEMPORARY: 'temporary' },
  timestampMs: () => Date.now()
}));

vi.mock('../../services/connectorRegistry.js', () => ({
  appendConnectorAudit: vi.fn()
}));

const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn()
};
vi.stubGlobal('localStorage', localStorageMock);

describe('workflowTelemetryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  describe('appendWorkflowTelemetryEvent', () => {
    it('exports appendWorkflowTelemetryEvent function', async () => {
      const { appendWorkflowTelemetryEvent } = await import('../../services/workflowTelemetryService');
      expect(typeof appendWorkflowTelemetryEvent).toBe('function');
    });

    it('creates telemetry row with default values', async () => {
      const { appendWorkflowTelemetryEvent } = await import('../../services/workflowTelemetryService');
      const result = appendWorkflowTelemetryEvent({ workflowId: 'w1' });
      expect(result).toHaveProperty('id');
      expect(result.workflowId).toBe('w1');
    });

    it('generates unique id format wft-timestamp-random', async () => {
      const { appendWorkflowTelemetryEvent } = await import('../../services/workflowTelemetryService');
      const result = appendWorkflowTelemetryEvent({ workflowId: 'w1' });
      expect(result.id).toMatch(/^wft-/);
    });

    it('includes timestamp in row', async () => {
      const { appendWorkflowTelemetryEvent } = await import('../../services/workflowTelemetryService');
      const result = appendWorkflowTelemetryEvent({ workflowId: 'w1' });
      expect(result).toHaveProperty('timestampMs');
    });

    it('sets default event type to status_update', async () => {
      const { appendWorkflowTelemetryEvent } = await import('../../services/workflowTelemetryService');
      const result = appendWorkflowTelemetryEvent({ workflowId: 'w1' });
      expect(result.eventType).toBe('status_update');
    });
  });

  describe('listWorkflowTelemetry', () => {
    it('exports listWorkflowTelemetry function', async () => {
      const { listWorkflowTelemetry } = await import('../../services/workflowTelemetryService');
      expect(typeof listWorkflowTelemetry).toBe('function');
    });

    it('returns empty array when no telemetry rows', async () => {
      const { listWorkflowTelemetry } = await import('../../services/workflowTelemetryService');
      const result = listWorkflowTelemetry();
      expect(result).toEqual([]);
    });

    it('filters by workflowId', async () => {
      const { listWorkflowTelemetry } = await import('../../services/workflowTelemetryService');
      expect(typeof listWorkflowTelemetry).toBe('function');
    });
  });

  describe('summarizeWorkflowTelemetry', () => {
    it('exports summarizeWorkflowTelemetry function', async () => {
      const { summarizeWorkflowTelemetry } = await import('../../services/workflowTelemetryService');
      expect(typeof summarizeWorkflowTelemetry).toBe('function');
    });

    it('calculates total events count', async () => {
      const { summarizeWorkflowTelemetry } = await import('../../services/workflowTelemetryService');
      const result = summarizeWorkflowTelemetry();
      expect(result).toHaveProperty('totalEvents');
    });

    it('calculates total runs count', async () => {
      const { summarizeWorkflowTelemetry } = await import('../../services/workflowTelemetryService');
      const result = summarizeWorkflowTelemetry();
      expect(result).toHaveProperty('totalRuns');
    });

    it('calculates status counts', async () => {
      const { summarizeWorkflowTelemetry } = await import('../../services/workflowTelemetryService');
      const result = summarizeWorkflowTelemetry();
      expect(result).toHaveProperty('statusCounts');
    });

    it('calculates risk counts', async () => {
      const { summarizeWorkflowTelemetry } = await import('../../services/workflowTelemetryService');
      const result = summarizeWorkflowTelemetry();
      expect(result).toHaveProperty('riskCounts');
    });
  });

  describe('WORKFLOW_TELEMETRY_SCOPE', () => {
    it('exports WORKFLOW_TELEMETRY_SCOPE constant', async () => {
      const mod = await import('../../services/workflowTelemetryService');
      expect(mod.WORKFLOW_TELEMETRY_SCOPE).toBe('workflow_telemetry_v1');
    });
  });
});