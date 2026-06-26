import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
  isTauri: vi.fn().mockReturnValue(false)
}));

vi.mock('../services/agentBusService', () => ({
  listAgentPackets: vi.fn().mockReturnValue([]),
  listApprovalQueue: vi.fn().mockReturnValue([]),
  approvePacket: vi.fn(),
  rejectPacket: vi.fn(),
  markPacketExecuted: vi.fn(),
  addPacketReference: vi.fn()
}));

vi.mock('../services/skillPackService', () => ({
  listSkillPacks: vi.fn().mockReturnValue([]),
  listSkillPackAudit: vi.fn().mockReturnValue([]),
  installSkillPack: vi.fn(),
  uninstallSkillPack: vi.fn(),
  setSkillPackEnabled: vi.fn(),
  validateSkillPackManifest: vi.fn().mockReturnValue({ valid: true })
}));

vi.mock('../services/workflowBuilderService', () => ({
  listWorkflows: vi.fn().mockReturnValue([]),
  createWorkflow: vi.fn().mockReturnValue({ id: 'wf-1', name: 'test', nodes: [], edges: [] }),
  addWorkflowNode: vi.fn().mockReturnValue({ nodes: [] }),
  addWorkflowEdge: vi.fn(),
  WORKFLOW_NODE_LIBRARY: []
}));

vi.mock('../services/sessionIntelligenceService', () => ({
  summarizeSession: vi.fn().mockReturnValue({ totalEvents: 0, warnings: [] }),
  listSessionEvents: vi.fn().mockReturnValue([]),
  appendSessionEvent: vi.fn()
}));

vi.mock('../services/resourceCostService', () => ({
  summarizeResourceUsage: vi.fn().mockReturnValue({ points: 0, avgTokenEstimate: 0 }),
  listResourceSnapshots: vi.fn().mockReturnValue([]),
  collectResourceSnapshot: vi.fn()
}));

vi.mock('../services/localMarketplaceService', () => ({
  listMarketplaceItems: vi.fn().mockReturnValue([]),
  setMarketplaceItemStatus: vi.fn()
}));

vi.mock('../services/recoveryService', () => ({
  listSnapshots: vi.fn().mockReturnValue([])
}));

vi.mock('../components/ProductionReadinessPanel', () => ({
  ProductionReadinessPanel: () => <div data-testid="production-readiness" />
}));

vi.mock('../components/SelfDevelopmentPanel', () => ({
  SelfDevelopmentPanel: () => <div data-testid="self-development" />
}));

vi.mock('../components/EcosystemMaturityPanelsGate', () => ({
  EcosystemMaturityPanelsGate: () => <div data-testid="maturity-gate" />
}));

vi.mock('../components/AgentPairingView', () => ({
  AgentPairingView: () => <div data-testid="agent-pairing" />
}));

vi.mock('../components/WorkflowOperationsDashboard', () => ({
  WorkflowOperationsDashboard: () => <div data-testid="workflow-ops" />
}));

import { EcosystemHub } from '../components/EcosystemHub';

const defaultProps = {
  settings: { selectedModel: 'llama3' },
  setSettings: vi.fn(),
  ollamaStatus: { state: 'connected' },
  verificationLogs: [],
  voiceStatus: { state: 'idle' },
  workspaceFoundation: {},
  updateCheckState: { state: 'idle' },
  nativeSelfDevProof: null,
  setNativeSelfDevProof: vi.fn(),
  nativeProofHooks: {}
};

describe('EcosystemHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<EcosystemHub {...defaultProps} />);
    expect(screen.getByText('Agent Ecosystem')).toBeDefined();
  });

  it('renders all tabs', () => {
    render(<EcosystemHub {...defaultProps} />);
    const tabs = ['Overview', 'Queue', 'Skills', 'Workflows', 'Pairings', 'Advanced'];
    tabs.forEach((tab) => {
      expect(screen.getByText(tab)).toBeDefined();
    });
  });

  it('switches to Pairings tab', () => {
    render(<EcosystemHub {...defaultProps} />);
    fireEvent.click(screen.getByText('Pairings'));
    expect(screen.getByTestId('agent-pairing')).toBeDefined();
  });

  it('switches to Queue tab', () => {
    render(<EcosystemHub {...defaultProps} />);
    fireEvent.click(screen.getByText('Queue'));
    expect(screen.getByText('Handoff Queue')).toBeDefined();
  });

  it('switches to Skills tab', () => {
    render(<EcosystemHub {...defaultProps} />);
    fireEvent.click(screen.getByText('Skills'));
    expect(screen.getByText('Skill Pack System')).toBeDefined();
  });

  it('switches to Workflows tab', () => {
    render(<EcosystemHub {...defaultProps} />);
    fireEvent.click(screen.getByText('Workflows'));
    expect(screen.getByText('Workflows')).toBeDefined();
  });

  it('switches to Advanced tab', () => {
    render(<EcosystemHub {...defaultProps} />);
    fireEvent.click(screen.getByText('Advanced'));
    expect(screen.getByTestId('maturity-gate')).toBeDefined();
  });

  it('renders overview by default', () => {
    render(<EcosystemHub {...defaultProps} />);
    expect(screen.getByTestId('maturity-gate')).toBeDefined();
  });
});