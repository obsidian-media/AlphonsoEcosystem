import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../../services/agentBusService', () => ({
  AGENTS: { ALPHONSO: 'alphonso', JOSE: 'jose' },
  approvePacket: vi.fn(),
  canExecutePacket: vi.fn(() => false),
  createAgentPacket: vi.fn(),
  listAgentPackets: vi.fn(() => []),
  listApprovalQueue: vi.fn(() => []),
  rejectPacket: vi.fn(),
  updatePacketStatus: vi.fn()
}));
vi.mock('../../services/memoryService', () => ({ listMemoryItems: vi.fn(() => []) }));
vi.mock('../../services/miyaMemoryService', () => ({ listMiyaMemory: vi.fn(() => []) }));
vi.mock('../../services/workflowBuilderService', () => ({ listWorkflows: vi.fn(() => []) }));
vi.mock('../../services/sessionIntelligenceService', () => ({
  appendSessionEvent: vi.fn(),
  listSessionEvents: vi.fn(() => [])
}));
vi.mock('../../services/resourceCostService', () => ({
  summarizeResourceUsage: vi.fn(() => ({ totalTokens: 0, totalCost: 0 }))
}));
vi.mock('../../services/orchestrationGovernanceService', () => ({
  listGovernanceDecisions: vi.fn(() => []),
  recordGovernanceDecision: vi.fn(),
  summarizeAgentWorkload: vi.fn(() => [])
}));
vi.mock('../../services/joseCommandRouterService', () => ({
  confirmJoseCommand: vi.fn(),
  createAgentReportToJose: vi.fn(),
  createJoseCommandRoute: vi.fn(),
  getJoseWorkflowObservability: vi.fn(() => null),
  listJoseCommands: vi.fn(() => []),
  listJoseDeadLetters: vi.fn(() => []),
  runJoseRetrySweep: vi.fn()
}));
vi.mock('../../services/packetExecutionService', () => ({
  executeApprovedPacket: vi.fn()
}));
vi.mock('../../services/trustModel', () => ({
  TRUST_STATES: { VERIFIED: 'verified', UNVERIFIED: 'unverified', TEMPORARY: 'temporary' }
}));
vi.mock('../../services/connectorRegistryService', () => ({
  isConnectorAuthenticated: vi.fn(() => false),
  listConnectorAudit: vi.fn(() => []),
  pollWhatsAppConnector: vi.fn()
}));
vi.mock('../../services/orchestrationQueueService', () => ({
  getOrchestrationQueueSnapshot: vi.fn(() => ({ queued: 0, active: 0, deadLetters: 0 })),
  listOrchestrationQueueTransitions: vi.fn(() => []),
  replayPacketFromDeadLetter: vi.fn()
}));
vi.mock('../AgentAvatar', () => ({ AgentAvatar: vi.fn(() => null) }));
vi.mock('../JoseTaskQueue', () => ({ JoseTaskQueue: vi.fn(() => null) }));
vi.mock('../WhatsAppInboxPanel', () => ({ WhatsAppInboxPanel: vi.fn(() => null) }));
vi.mock('../OrchestratorQueueView', () => ({ OrchestratorQueueView: vi.fn(() => null) }));
vi.mock('framer-motion', () => ({
  motion: { div: 'div', span: 'span', section: 'section', p: 'p', li: 'li', button: 'button' },
  AnimatePresence: vi.fn(({ children }) => children)
}));

import { OrchestratorView } from '../../components/OrchestratorView';

function makeProps(overrides = {}) {
  return {
    settings: {},
    ollamaStatus: { state: 'disconnected', label: 'Disconnected', trust: 'unverified' },
    onJoseStateChange: vi.fn(),
    ...overrides
  };
}

describe('OrchestratorView', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders without crashing', () => {
    const { container } = render(<OrchestratorView {...makeProps()} />);
    expect(container).toBeTruthy();
  });

  it('renders with connected ollama', () => {
    const { container } = render(
      <OrchestratorView {...makeProps()} ollamaStatus={{ state: 'connected', label: 'Connected', trust: 'verified' }} />
    );
    expect(container).toBeTruthy();
  });

  it('renders with empty orchestration state', () => {
    const { container } = render(<OrchestratorView {...makeProps()} />);
    expect(container.querySelectorAll('div').length).toBeGreaterThan(0);
  });
});