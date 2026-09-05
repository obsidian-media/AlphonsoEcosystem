import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));

vi.mock('../services/agentWorkshop/agentRunnerService', () => ({
  runProjectWorkshop: vi.fn()
}));
vi.mock('../services/audit/marcusAuditService', () => ({
  auditProjectPlan: vi.fn(() => ({ score: 100, findings: [] }))
}));
vi.mock('../services/hectorResearchService', () => ({
  createResearchBrief: vi.fn().mockResolvedValue({})
}));
vi.mock('../services/memory/ecosystemMemoryService', () => ({
  addMemoryItem: vi.fn()
}));
vi.mock('../services/agentWorkshop/traceabilityService', () => ({
  getTraceSummary: vi.fn(() => ({ stagesCovered: [], total: 0, pendingApprovals: 0, executed: 0, failed: 0 }))
}));
vi.mock('../services/agentWorkshop/diffProposalService', () => ({
  listDiffProposals: vi.fn(() => [])
}));
vi.mock('../services/agentWorkshop/workContractService', () => ({
  listWorkContracts: vi.fn(() => []),
  signWorkContract: vi.fn(),
  archiveWorkContract: vi.fn()
}));
vi.mock('../services/agentWorkshop/verificationChainService', () => ({
  listVerificationChains: vi.fn(() => [])
}));
vi.mock('../services/agentWorkshop/operationalModeService', () => ({
  OPERATIONAL_MODES: [],
  getOperationalMode: vi.fn(() => ({ id: 'balanced', emphasis: [] })),
  setOperationalMode: vi.fn(() => ({ id: 'balanced', emphasis: [] }))
}));
vi.mock('../services/agentWorkshop/executionModeService', () => ({
  AGENT_MODES: { PROPOSAL: 'proposal', EXECUTION: 'execution' },
  getAgentMode: vi.fn(() => 'proposal'),
  setAgentMode: vi.fn()
}));

vi.mock('../components/agents/AgentDock', () => ({ AgentDock: () => <div data-testid="agent-dock" /> }));
vi.mock('../components/agents/AgentProfilePanel', () => ({ AgentProfilePanel: () => <div data-testid="agent-profile" /> }));
vi.mock('../components/agents/AgentCapabilityMatrix', () => ({ AgentCapabilityMatrix: () => <div data-testid="agent-matrix" /> }));
vi.mock('../components/agentWorkshop/ProjectIntakePanel', () => ({
  ProjectIntakePanel: ({ intake, setIntake }) => (
    <input
      data-testid="project-name-input"
      value={intake.projectName}
      onChange={(e) => setIntake((cur) => ({ ...cur, projectName: e.target.value }))}
    />
  )
}));
vi.mock('../components/agentWorkshop/AgentAssignmentBoard', () => ({ AgentAssignmentBoard: () => <div data-testid="assignment-board" /> }));
vi.mock('../components/agentWorkshop/AgentOutputPanel', () => ({ AgentOutputPanel: () => <div data-testid="agent-output" /> }));
vi.mock('../components/agentWorkshop/ExecutionTimeline', () => ({ ExecutionTimeline: () => <div data-testid="execution-timeline" /> }));
vi.mock('../components/agentWorkshop/FinalExecutionPacket', () => ({ FinalExecutionPacket: () => <div data-testid="final-packet" /> }));
vi.mock('../components/projectExecution/ProjectRiskRegister', () => ({ ProjectRiskRegister: () => <div data-testid="risk-register" /> }));
vi.mock('../components/projectExecution/ProjectVerificationChecklist', () => ({ ProjectVerificationChecklist: () => <div data-testid="verification-checklist" /> }));
vi.mock('../components/projectExecution/ProjectRoadmap', () => ({ ProjectRoadmap: () => <div data-testid="roadmap" /> }));
vi.mock('../components/audit/MarcusAuditPanel', () => ({ MarcusAuditPanel: () => <div data-testid="marcus-audit" /> }));
vi.mock('../components/research/HectorResearchPanel', () => ({ HectorResearchPanel: () => <div data-testid="hector-research" /> }));
vi.mock('../components/agentWorkshop/SystemHealthPanel', () => ({ SystemHealthPanel: () => <div data-testid="system-health" /> }));

import { ProjectExecutionMode } from '../components/projectExecution/ProjectExecutionMode';
import { runProjectWorkshop as runProjectWorkshopImport } from '../services/agentWorkshop/agentRunnerService';
import { createApprovalRequest } from '../services/approval/approvalService';

const runProjectWorkshop = vi.mocked(runProjectWorkshopImport);

// The component only ever consumes this as `Record<string, unknown>` (cast at its
// own call site), so the mock doesn't need to satisfy agentRunnerService's real,
// much wider inferred return shape -- cast through unknown to match the mocked
// import's type instead of reproducing that whole shape here.
function makeWorkshopResult(traceId): ReturnType<typeof runProjectWorkshopImport> {
  return {
    traceId,
    project: { id: 'proj-1', projectName: 'Test Project' },
    packets: [],
    outputs: [],
    sequence: [],
    approvalGates: [],
    finalPacket: { summary: 'Packet ready.' },
    projectDna: {},
    aiReviewGate: { passes: true, blockers: [] }
  } as unknown as ReturnType<typeof runProjectWorkshopImport>;
}

// Reproduces agentRunnerService's real side effect (creating one ApprovalRequest
// per gate, tagged with this run's traceId) at the point runProjectWorkshop would
// have done it -- before the component's own post-computation gate check runs.
function mockWorkshop(traceId, gateSpecs) {
  runProjectWorkshop.mockImplementation(() => {
    gateSpecs.forEach((spec) => createApprovalRequest({ ...spec, metadata: { traceId } }));
    return makeWorkshopResult(traceId);
  });
}

// AnimatePresence (mode="wait") delays mounting the next tab's content until the
// previous tab's exit transition completes, which takes real wall-clock time even
// in jsdom -- so each tab switch needs an async wait, not an immediate query.
async function generatePacket() {
  fireEvent.change(screen.getByTestId('project-name-input'), { target: { value: 'Test Project' } });
  fireEvent.click(screen.getByRole('button', { name: /Continue to Execution/i }));
  const generateBtn = await screen.findByRole('button', { name: 'Generate' });
  fireEvent.click(generateBtn);
}

describe('ProjectExecutionMode — approval gate', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('routes to the Approval tab (not Results) after Generate when gates are pending, and disables Results', async () => {
    mockWorkshop('trace-1', [{ actionType: 'file_write', riskLevel: 'high', reason: 'Prevent unsupervised writes.' }]);
    render(<ProjectExecutionMode />);
    await generatePacket();

    expect(await screen.findByText('1 item awaiting approval')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Results' })).toBeDisabled();
  });

  it('does not navigate to Results when the disabled Results tab is clicked directly', async () => {
    mockWorkshop('trace-2', [{ actionType: 'deployment', riskLevel: 'critical', reason: 'Needs approval.' }]);
    render(<ProjectExecutionMode />);
    await generatePacket();
    await screen.findByText('1 item awaiting approval');

    fireEvent.click(screen.getByRole('button', { name: 'Results' }));
    expect(screen.queryByText('No execution packet yet.')).toBeNull();
    expect(screen.getByText('1 item awaiting approval')).toBeTruthy();
  });

  it('enables and reveals Results with the full packet once every gate is approved', async () => {
    mockWorkshop('trace-3', [{ actionType: 'file_write', riskLevel: 'high', reason: 'Needs approval.' }]);
    render(<ProjectExecutionMode />);
    await generatePacket();
    await screen.findByText('1 item awaiting approval');

    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    expect(await screen.findByTestId('final-packet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Results' })).not.toBeDisabled();
    expect(screen.queryByText(/BLOCKED/i)).toBeNull();
  });

  it('shows a blocked banner in Results when a gate is denied', async () => {
    mockWorkshop('trace-4', [{ actionType: 'deployment', riskLevel: 'critical', reason: 'Needs approval.' }]);
    render(<ProjectExecutionMode />);
    await generatePacket();
    await screen.findByText('1 item awaiting approval');

    fireEvent.click(screen.getByRole('button', { name: /Deny/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    expect(await screen.findByText(/BLOCKED — one or more approval gates were denied/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Results' })).not.toBeDisabled();
  });

  it('no longer renders the Setup-tab approval/audit/verification/dependencies toggle group', () => {
    runProjectWorkshop.mockReturnValue(makeWorkshopResult('trace-5'));
    render(<ProjectExecutionMode />);
    expect(screen.queryByText(/Dependencies/i)).toBeNull();
    expect(screen.queryByText(/Verification/i)).toBeNull();
    expect(screen.queryByText(/^Audit/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Proposal' })).toBeTruthy();
    // Two "Execution" buttons are expected: the top-nav Execution tab and the
    // Proposal/Execution mode toggle -- both must survive the toggle-group removal.
    expect(screen.getAllByRole('button', { name: 'Execution' }).length).toBe(2);
  });

  it('no longer renders an Approval Gates card in Results', async () => {
    mockWorkshop('trace-6', []);
    render(<ProjectExecutionMode />);
    await generatePacket();

    expect(await screen.findByTestId('final-packet')).toBeTruthy();
    expect(screen.queryByText('Approval Gates')).toBeNull();
  });
});
