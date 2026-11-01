import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

vi.mock('../components/teams/TeamsPage', () => ({
  TeamsPage: () => <div data-testid="teams-page" />
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
    const tabs = ['Overview', 'Queue', 'Skills', 'Timeline', 'Teams', 'Advanced'];
    tabs.forEach((tab) => {
      expect(screen.getByText(tab)).toBeDefined();
    });
  });

  it('switches to the Teams tab', async () => {
    render(<EcosystemHub {...defaultProps} />);
    fireEvent.click(screen.getByText('Teams'));
    await waitFor(() => expect(screen.getByTestId('teams-page')).toBeDefined(), { timeout: 3000 });
  });

  it('switches to Queue tab', async () => {
    render(<EcosystemHub {...defaultProps} />);
    fireEvent.click(screen.getByText('Queue'));
    await waitFor(() => expect(screen.getByText('Handoff Queue')).toBeDefined(), { timeout: 3000 });
  });

  it('switches to Skills tab', async () => {
    render(<EcosystemHub {...defaultProps} />);
    fireEvent.click(screen.getByText('Skills'));
    await waitFor(() => expect(screen.getByText('Agent Skills')).toBeDefined(), { timeout: 3000 });
  });

  // 2.11.0 QA (owner, 2026-11-01): Builder workflows and the canned operations did nothing real.
  it('the Timeline tab shows the session timeline, with no way to make a Builder workflow', async () => {
    render(<EcosystemHub {...defaultProps} />);
    fireEvent.click(screen.getByText('Timeline'));
    await waitFor(() => expect(screen.getByText(/Session Timeline \(24h\)/)).toBeDefined(), { timeout: 3000 });
    expect(screen.queryByText('Create')).toBeNull();
    expect(screen.queryByText('Workflows')).toBeNull();
  });

  it('switches to Advanced tab, without the operations dashboard', () => {
    render(<EcosystemHub {...defaultProps} />);
    fireEvent.click(screen.getByText('Advanced'));
    expect(screen.getByTestId('maturity-gate')).toBeDefined();
    expect(screen.queryByText(/Workflow Operations/)).toBeNull();
  });

  it('opens directly on the Pairings tab when initialTab is "pairings" (sidebar Agent Pairing entry)', () => {
    render(<EcosystemHub {...defaultProps} initialTab="pairings" />);
    expect(screen.getByTestId('teams-page')).toBeDefined();
  });

  it('opens directly on the Advanced (maturity) tab when initialTab is "advanced" (sidebar Maturity entry)', () => {
    render(<EcosystemHub {...defaultProps} initialTab="advanced" />);
    expect(screen.getByTestId('maturity-gate')).toBeDefined();
    expect(screen.getByTestId('production-readiness')).toBeDefined();
    expect(screen.getByTestId('self-development')).toBeDefined();
    expect(screen.queryByTestId('teams-page')).toBeNull();
  });

  it('renders overview by default', () => {
    render(<EcosystemHub {...defaultProps} />);
    expect(screen.getByTestId('maturity-gate')).toBeDefined();
  });
});