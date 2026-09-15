import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../services/agentBusService', () => ({
  listAgentPackets: vi.fn(() => []),
  listPacketsByStatus: vi.fn(() => []),
  approvePacket: vi.fn(),
  rejectPacket: vi.fn()
}));
vi.mock('../../services/memoryService', () => ({ listMemoryItems: vi.fn(() => []) }));
vi.mock('../../services/durableMemoryService', () => ({
  getDurableMemoryStatus: vi.fn(() => ({ totalRecords: 0 })),
  getLastMemoryMigration: vi.fn(() => null),
  listDurableMemoryRecords: vi.fn(() => []),
  migrateLocalStorageMemoryToSqlite: vi.fn()
}));
vi.mock('../../services/miyaMemoryService', () => ({ listMiyaMemory: vi.fn(() => []) }));
vi.mock('../../services/sessionIntelligenceService', () => ({
  listSessionEvents: vi.fn(() => []),
  summarizeSession: vi.fn(() => ({ eventCount: 0 }))
}));
vi.mock('../../services/workflowBuilderService', () => ({ listWorkflows: vi.fn(() => []) }));
vi.mock('../../services/trustModel', () => ({
  TRUST_STATES: { VERIFIED: 'verified', UNVERIFIED: 'unverified', TEMPORARY: 'temporary' },
  trustColor: vi.fn(() => 'gray')
}));
vi.mock('../../services/workflowOperationsRegistryService', () => ({
  listWorkflowOperations: vi.fn(() => []),
  updateWorkflowOperationStatus: vi.fn()
}));
vi.mock('../../services/orchestrationReceiptService', () => ({ listOrchestrationReceipts: vi.fn(() => []) }));
vi.mock('../AgentAvatar', () => ({ AgentAvatar: vi.fn(() => null) }));
vi.mock('framer-motion', () => ({
  motion: { div: 'div', span: 'span' },
  AnimatePresence: vi.fn(({ children }) => children)
}));

import {
  TrustLayerPanel,
  ApprovalCenterPanel,
  MemoryConfidencePanel,
  EcosystemMapPanel,
  SessionIntelligencePanel,
  WorkflowOperationsPanel,
  PrivacyShieldPanel,
  OperatorModesPanel
} from '../../components/EcosystemMaturityPanels';

describe('EcosystemMaturityPanels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TrustLayerPanel', () => {
    it('renders without crashing', () => {
      const { container } = render(<TrustLayerPanel />);
      expect(container).toBeTruthy();
    });
    it('renders with verification logs', () => {
      render(<TrustLayerPanel verificationLogs={[{ id: 'log1', status: 'verified' }]} />);
      expect(screen.getByText(/Trust \/ Verification Layer/i)).toBeTruthy();
    });
    it('renders with ollama status', () => {
      render(<TrustLayerPanel ollamaStatus={{ label: 'Connected', trust: 'verified' }} />);
      expect(screen.getByText(/Trust \/ Verification Layer/i)).toBeTruthy();
    });
  });

  describe('ApprovalCenterPanel', () => {
    it('renders without crashing', () => {
      const { container } = render(<ApprovalCenterPanel />);
      expect(container).toBeTruthy();
    });
    it('renders with refresh callback', () => {
      render(<ApprovalCenterPanel onRefresh={vi.fn()} />);
      expect(screen.getByText(/Approval Center/i)).toBeTruthy();
    });
  });

  describe('MemoryConfidencePanel', () => {
    it('renders without crashing', () => {
      const { container } = render(<MemoryConfidencePanel />);
      expect(container).toBeTruthy();
    });
    it('shows memory confidence heading', () => {
      render(<MemoryConfidencePanel />);
      expect(screen.getByText(/Memory Confidence/i)).toBeTruthy();
    });
  });

  describe('EcosystemMapPanel', () => {
    it('renders without crashing', () => {
      const { container } = render(<EcosystemMapPanel />);
      expect(container).toBeTruthy();
    });
    it('renders with ollama status', () => {
      render(<EcosystemMapPanel ollamaStatus={{ label: 'Ready' }} />);
      expect(screen.getByText(/Ecosystem Map/i)).toBeTruthy();
    });
  });

  describe('SessionIntelligencePanel', () => {
    it('renders without crashing', () => {
      const { container } = render(<SessionIntelligencePanel />);
      expect(container).toBeTruthy();
    });
    it('shows session intelligence heading', () => {
      render(<SessionIntelligencePanel />);
      expect(screen.getByText(/Session Intelligence/i)).toBeTruthy();
    });
  });

  describe('WorkflowOperationsPanel', () => {
    it('renders without crashing', () => {
      const { container } = render(<WorkflowOperationsPanel />);
      expect(container).toBeTruthy();
    });
    it('shows workflow operations heading', () => {
      render(<WorkflowOperationsPanel />);
      expect(screen.getByText(/Workflow Operations/i)).toBeTruthy();
    });
  });

  describe('PrivacyShieldPanel', () => {
    it('renders without crashing', () => {
      const { container } = render(
        <PrivacyShieldPanel
          settings={{}}
          voiceStatus={{ state: 'idle' }}
          workspaceFoundation={{}}
        />
      );
      expect(container).toBeTruthy();
    });
    it('shows privacy shield heading', () => {
      render(
        <PrivacyShieldPanel
          settings={{}}
          voiceStatus={{ state: 'idle' }}
          workspaceFoundation={{}}
        />
      );
      expect(screen.getByText(/Privacy Shield/i)).toBeTruthy();
    });
  });

  describe('OperatorModesPanel', () => {
    it('renders without crashing', () => {
      const { container } = render(
        <OperatorModesPanel settings={{}} setSettings={vi.fn()} />
      );
      expect(container).toBeTruthy();
    });
    it('shows operator modes heading', () => {
      render(
        <OperatorModesPanel settings={{}} setSettings={vi.fn()} />
      );
      expect(screen.getByText(/Operator Modes/i)).toBeTruthy();
    });
  });
});
