import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks } from '../services/skillPackService';
import { JOSE_PROFILE } from '../agents/jose/joseProfile';

const JOSE_PACK_IDS = [
  'pack.jose-professional-orchestration',
  'pack.jose-task-routing',
  'pack.jose-approval-gating',
  'pack.jose-cross-agent-synthesis',
  'pack.jose-pipeline-governance',
  'pack.workflow.executing-plans',
  'pack.jose-workflow-design',
  'pack.jose-strategic-planning',
  'pack.jose-dependency-mapping',
  'pack.jose-agent-coordination',
  'pack.jose-parallel-orchestration',
  'pack.jose-task-prioritization',
  'pack.jose-risk-assessment',
  'pack.jose-quality-gates',
  'pack.jose-compliance-checks',
  'pack.jose-progress-tracking',
  'pack.jose-status-reporting',
  'pack.jose-performance-metrics',
  'pack.jose-workflow-optimization',
  'pack.jose-bottleneck-detection',
  'pack.jose-continuous-improvement',
  'pack.jose-stakeholder-communication'
];

beforeEach(() => {
  localStorage.clear();
});

describe('Jose skill packs', () => {
  it('has all 22 Jose skill packs in the registry', () => {
    const packs = listSkillPacks();
    const ids = packs.map((pack) => pack.id);

    JOSE_PACK_IDS.forEach((id) => {
      expect(ids).toContain(id);
    });
  });

  it('seeds exactly 21 Jose-owned packs (20 new + 1 workflow)', () => {
    const packs = listSkillPacks();
    const josePacks = packs.filter((pack) => pack.ownerAgent === 'jose');
    expect(josePacks).toHaveLength(21);
  });

  it('has valid manifest structure for all new Jose packs', () => {
    const packs = listSkillPacks();

    const newPacks = JOSE_PACK_IDS.filter(
      (id) => !['pack.jose-professional-orchestration', 'pack.jose-task-routing', 'pack.jose-approval-gating', 'pack.jose-cross-agent-synthesis', 'pack.jose-pipeline-governance', 'pack.workflow.executing-plans'].includes(id)
    );

    newPacks.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      expect(pack.id).toBe(id);
      expect(typeof pack.name).toBe('string');
      expect(pack.name.length).toBeGreaterThan(0);
      expect(pack.version).toBe('1.0.0');
      expect(pack.enabled).toBe(true);
      expect(Array.isArray(pack.permissions)).toBe(true);
      expect(pack.permissions.length).toBeGreaterThan(0);
      expect(pack.category).toBe('agent_skill');
      expect(pack.ownerAgent).toBe('jose');
      expect(pack.trust).toBeDefined();
    });
  });

  it('has exampleTasks for all new Jose packs', () => {
    const packs = listSkillPacks();

    const newPacks = JOSE_PACK_IDS.filter(
      (id) => !['pack.jose-professional-orchestration', 'pack.jose-task-routing', 'pack.jose-approval-gating', 'pack.jose-cross-agent-synthesis', 'pack.jose-pipeline-governance', 'pack.workflow.executing-plans'].includes(id)
    );

    newPacks.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      expect(pack).toBeDefined();
      expect(Array.isArray(pack.exampleTasks)).toBe(true);
      expect(pack.exampleTasks.length).toBeGreaterThanOrEqual(2);
      pack.exampleTasks.forEach((task) => {
        expect(typeof task).toBe('string');
        expect(task.length).toBeGreaterThan(0);
      });
    });
  });

  it('all Jose pack IDs are in the profile skillPackIds', () => {
    JOSE_PACK_IDS.forEach((id) => {
      expect(JOSE_PROFILE.skillPackIds).toContain(id);
    });
  });

  it('profile skillPackIds has exactly 22 entries (6 existing + 16 new)', () => {
    expect(JOSE_PROFILE.skillPackIds).toHaveLength(22);
  });

  it('has no duplicate pack IDs', () => {
    const packs = listSkillPacks();
    const josePacks = packs.filter((pack) => pack.ownerAgent === 'jose');
    const ids = josePacks.map((p) => p.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids.length).toBe(uniqueIds.length);
  });
});

describe('Jose skill pack permissions', () => {
  it('all permissions use allowed prefixes (task_routing., approval_gating., cross_agent_synthesis., execution_tracking., workflows., agent_report.)', () => {
    const packs = listSkillPacks();
    const allowedPrefixes = ['task_routing.', 'approval_gating.', 'cross_agent_synthesis.', 'execution_tracking.', 'workflows.', 'agent_report.'];

    const newPacks = JOSE_PACK_IDS.filter(
      (id) => !['pack.jose-professional-orchestration', 'pack.jose-task-routing', 'pack.jose-approval-gating', 'pack.jose-cross-agent-synthesis', 'pack.jose-pipeline-governance', 'pack.workflow.executing-plans'].includes(id)
    );

    newPacks.forEach((id) => {
      const pack = packs.find((p) => p.id === id);
      pack.permissions.forEach((permission) => {
        const matches = allowedPrefixes.some((prefix) => permission.startsWith(prefix));
        expect(matches).toBe(true);
      });
    });
  });

  it('workflow design packs have correct permissions', () => {
    const packs = listSkillPacks();

    const workflowDesign = packs.find((p) => p.id === 'pack.jose-workflow-design');
    expect(workflowDesign.permissions).toContain('workflows.design');
    expect(workflowDesign.permissions).toContain('workflows.plan');
    expect(workflowDesign.permissions).toContain('workflows.decompose');

    const strategicPlanning = packs.find((p) => p.id === 'pack.jose-strategic-planning');
    expect(strategicPlanning.permissions).toContain('workflows.strategic');
    expect(strategicPlanning.permissions).toContain('workflows.long_term');
    expect(strategicPlanning.permissions).toContain('workflows.roadmap');
  });

  it('agent coordination packs have correct permissions', () => {
    const packs = listSkillPacks();

    const agentCoordination = packs.find((p) => p.id === 'pack.jose-agent-coordination');
    expect(agentCoordination.permissions).toContain('task_routing.coordinate');
    expect(agentCoordination.permissions).toContain('task_routing.delegate');
    expect(agentCoordination.permissions).toContain('task_routing.monitor');

    const parallelOrchestration = packs.find((p) => p.id === 'pack.jose-parallel-orchestration');
    expect(parallelOrchestration.permissions).toContain('task_routing.parallel');
    expect(parallelOrchestration.permissions).toContain('task_routing.concurrent');
    expect(parallelOrchestration.permissions).toContain('execution_tracking.parallel');
  });

  it('governance packs have correct permissions', () => {
    const packs = listSkillPacks();

    const riskAssessment = packs.find((p) => p.id === 'pack.jose-risk-assessment');
    expect(riskAssessment.permissions).toContain('approval_gating.risk');
    expect(riskAssessment.permissions).toContain('approval_gating.assess');
    expect(riskAssessment.permissions).toContain('approval_gating.classify');

    const qualityGates = packs.find((p) => p.id === 'pack.jose-quality-gates');
    expect(qualityGates.permissions).toContain('approval_gating.quality');
    expect(qualityGates.permissions).toContain('approval_gating.verify');
    expect(qualityGates.permissions).toContain('approval_gating.validate');
  });
});
