import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../agents/shared/agentOutputSchemas', () => ({
  createAgentOutput: vi.fn((type, data) => ({ ...data, outputType: type })),
  AgentOutputTypes: {
    PROJECT_BREAKDOWN: 'project_breakdown',
    RESEARCH_REPORT: 'research_report',
    UI_PROPOSAL: 'ui_proposal',
    CODE_PROPOSAL: 'code_proposal',
    AUDIT_REPORT: 'audit_report',
    AGENT_TASK_PACKET: 'agent_task_packet'
  }
}));

vi.mock('../services/agentWorkshop/diffProposalService', () => ({
  createDiffProposal: vi.fn((data) => ({ id: `diff_${Date.now()}`, ...data }))
}));

vi.mock('../services/agentWorkshop/traceabilityService', () => ({
  appendTraceEvent: vi.fn()
}));

vi.mock('../services/agentWorkshop/executionModeService', () => ({
  canExecuteAction: vi.fn(() => ({ ok: true, reason: null })),
  getExecutionApprovalState: vi.fn(() => ({ approved: false, audited: false, verified: false, dependenciesChecked: false })),
  getAgentMode: vi.fn(() => 'proposal'),
  AGENT_MODES: { PROPOSAL: 'proposal', EXECUTION: 'execution' }
}));

vi.mock('../services/approval/approvalService', () => ({
  createApprovalRequest: vi.fn((data) => ({ id: `approval_${Date.now()}`, ...data }))
}));

vi.mock('../services/memory/ecosystemMemoryService', () => ({
  addFailureMemory: vi.fn(),
  addMemoryItem: vi.fn()
}));

vi.mock('../services/agentWorkshop/workContractService', () => ({
  createWorkContractDraft: vi.fn((data) => ({ id: `contract_${Date.now()}`, ...data }))
}));

vi.mock('../services/agentWorkshop/verificationChainService', () => ({
  createDefaultCrossVerificationChain: vi.fn((data) => ({ id: `chain_${Date.now()}`, ...data }))
}));

vi.mock('../services/agentWorkshop/contextEngineeringService', () => ({
  buildAgentScopedContexts: vi.fn((data) => ({ contexts: true, ...data }))
}));

vi.mock('../services/projectExecution/projectDnaService', () => ({
  createProjectDNA: vi.fn((data) => ({ id: `dna_${Date.now()}`, ...data }))
}));

vi.mock('../services/agentWorkshop/aiReviewPolicyService', () => ({
  evaluateAiReviewRequirement: vi.fn(() => ({ passes: true, blockers: [] }))
}));

vi.mock('../services/agentWorkshop/joseOrchestrationService', () => ({
  createJoseCoordinationReport: vi.fn(() => ({ id: 'report_1' })),
  produceApprovalGates: vi.fn(() => [{ id: 'gate_1', actionType: 'external_posting', riskLevel: 'high', reason: 'test gate' }]),
  produceExecutionSequence: vi.fn(() => ['step1', 'step2']),
  receiveProjectIntake: vi.fn((input) => ({
    id: `proj_${Date.now()}`,
    projectName: input.projectName || 'Test Project',
    projectDescription: input.description || '',
    stack: input.stack || 'React',
    constraints: input.constraints || [],
    ...input
  })),
  routeProjectTasks: vi.fn(() => [
    { id: 'task_1', title: 'maria task: design', riskLevel: 'medium', requiresApproval: false },
    { id: 'task_2', title: 'alphonso task: implement', riskLevel: 'high', requiresApproval: true }
  ])
}));

import {
  runAgentTask,
  collectAgentOutputs,
  synthesizeAgentOutputs,
  createFinalExecutionPacket,
  runProjectWorkshop
} from '../services/agentWorkshop/agentRunnerService';
import { appendTraceEvent } from '../services/agentWorkshop/traceabilityService';
import { addFailureMemory, addMemoryItem } from '../services/memory/ecosystemMemoryService';
import { getAgentMode, canExecuteAction } from '../services/agentWorkshop/executionModeService';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('runAgentTask', () => {
  it('creates output for known agent', () => {
    const result = runAgentTask('maria', {
      id: 'task_1',
      projectId: 'proj_1',
      title: 'Design task',
      riskLevel: 'medium',
      requiresApproval: false
    });
    expect(result.agentId).toBe('maria');
    expect(result.summary).toContain('Requirements');
    expect(result.traceId).toBeTruthy();
    expect(result.proposalId).toBeTruthy();
  });

  it('creates output for maria', () => {
    const result = runAgentTask('maria', { id: 't1', projectId: 'p1', title: 'design' });
    expect(result.summary).toContain('Requirements');
  });

  it('creates output for hector', () => {
    const result = runAgentTask('hector', { id: 't1', projectId: 'p1', title: 'research' });
    expect(result.summary).toContain('Research');
  });

  it('creates output for alphonso', () => {
    const result = runAgentTask('alphonso', { id: 't1', projectId: 'p1', title: 'implement' });
    expect(result.summary).toContain('Implementation');
  });

  it('creates output for marcus', () => {
    const result = runAgentTask('marcus', { id: 't1', projectId: 'p1', title: 'audit' });
    expect(result.summary).toContain('Audit');
  });

  it('creates generic output for unknown agent', () => {
    const result = runAgentTask('unknown', { id: 't1', projectId: 'p1', title: 'do stuff' });
    expect(result.summary).toContain('Generic');
  });

  it('appends trace events', () => {
    runAgentTask('maria', { id: 't1', projectId: 'p1', title: 'design' });
    expect(appendTraceEvent).toHaveBeenCalledTimes(2);
  });

  it('uses provided traceId', () => {
    const result = runAgentTask('maria', {
      id: 't1', projectId: 'p1', title: 'design', traceId: 'custom-trace'
    });
    expect(result.traceId).toBe('custom-trace');
  });
});

describe('collectAgentOutputs', () => {
  it('filters out falsy values', () => {
    const outputs = [{ id: 1 }, null, { id: 2 }, undefined, { id: 3 }];
    expect(collectAgentOutputs(outputs)).toHaveLength(3);
  });

  it('returns empty for empty input', () => {
    expect(collectAgentOutputs([])).toEqual([]);
  });
});

describe('synthesizeAgentOutputs', () => {
  it('groups outputs by agent', () => {
    const outputs = [
      { agentId: 'maria', riskLevel: 'medium' },
      { agentId: 'maria', riskLevel: 'low' },
      { agentId: 'alphonso', riskLevel: 'high' }
    ];
    const result = synthesizeAgentOutputs(outputs);
    expect(result.totalOutputs).toBe(3);
    expect(result.byAgent.maria).toHaveLength(2);
    expect(result.byAgent.alphonso).toHaveLength(1);
  });

  it('counts high-risk outputs', () => {
    const outputs = [
      { agentId: 'a', riskLevel: 'high' },
      { agentId: 'b', riskLevel: 'critical' },
      { agentId: 'c', riskLevel: 'medium' }
    ];
    expect(synthesizeAgentOutputs(outputs).highRiskCount).toBe(2);
  });

  it('handles empty outputs', () => {
    const result = synthesizeAgentOutputs([]);
    expect(result.totalOutputs).toBe(0);
    expect(result.highRiskCount).toBe(0);
  });
});

describe('createFinalExecutionPacket', () => {
  it('creates final packet from outputs', () => {
    const project = { id: 'proj_1', projectName: 'Test Project' };
    const outputs = [
      { agentId: 'maria', riskLevel: 'medium', summary: 'design done' },
      { agentId: 'alphonso', riskLevel: 'high', summary: 'impl done' }
    ];
    const gates = [{ id: 'g1' }];
    const sequence = ['step1'];
    const packet = createFinalExecutionPacket(project, outputs, gates, sequence);
    expect(packet.agentId).toBe('jose');
    expect(packet.riskLevel).toBe('high');
    expect(packet.requiresApproval).toBe(true);
    expect(packet.proposedChanges).toHaveLength(3);
  });

  it('sets medium risk when no high-risk outputs', () => {
    const project = { id: 'p1', projectName: 'Low Risk' };
    const outputs = [{ agentId: 'a', riskLevel: 'medium' }];
    const packet = createFinalExecutionPacket(project, outputs, [], []);
    expect(packet.riskLevel).toBe('medium');
  });
});

describe('runProjectWorkshop', () => {
  it('runs full workshop pipeline', () => {
    const result = runProjectWorkshop({
      projectName: 'Test App',
      description: 'A test application',
      stack: 'React',
      constraints: []
    });
    expect(result.project).toBeTruthy();
    expect(result.traceId).toBeTruthy();
    expect(result.mode).toBe('proposal');
    expect(result.packets).toHaveLength(2);
    expect(result.outputs).toHaveLength(2);
    expect(result.sequence).toEqual(['step1', 'step2']);
    expect(result.approvalGates).toHaveLength(1);
    expect(result.approvalRequests).toHaveLength(1);
    expect(result.workContracts).toBeTruthy();
    expect(result.verificationChain).toBeTruthy();
    expect(result.scopedContexts).toBeTruthy();
    expect(result.projectDna).toBeTruthy();
    expect(result.coordinationReport).toBeTruthy();
    expect(result.finalPacket).toBeTruthy();
  });

  it('records failure memory when execution blocked', () => {
    canExecuteAction.mockReturnValueOnce({ ok: false, reason: 'gates not met' });
    getAgentMode.mockReturnValueOnce('execution');
    runProjectWorkshop({ projectName: 'Blocked App' });
    expect(addFailureMemory).toHaveBeenCalledWith(
      expect.objectContaining({ failureType: 'execution_blocked' })
    );
  });

  it('records failure memory when AI review fails', async () => {
    const aiReview = await import('../services/agentWorkshop/aiReviewPolicyService');
    aiReview.evaluateAiReviewRequirement.mockReturnValueOnce({ passes: false, blockers: ['needs human review'] });
    runProjectWorkshop({ projectName: 'AI Review Fail' });
    expect(addFailureMemory).toHaveBeenCalledWith(
      expect.objectContaining({ failureType: 'ai_review_required' })
    );
  });

  it('records decision memory', () => {
    runProjectWorkshop({ projectName: 'Memory Test' });
    expect(addMemoryItem).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'decision_memory' })
    );
  });
});
