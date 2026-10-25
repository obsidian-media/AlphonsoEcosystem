import { beforeEach, describe, expect, it } from 'vitest';
import { listSkillPacks } from '../services/skillPackService';
import { ALPHONSO_PROFILE } from '../agents/alphonso/alphonsoProfile';
import { HECTOR_PROFILE } from '../agents/hector/hectorProfile';
import { MARIA_PROFILE } from '../agents/maria/mariaProfile';
import { JOSE_PROFILE } from '../agents/jose/joseProfile';
import { MIYA_PROFILE } from '../agents/miya/miyaProfile';

beforeEach(() => {
  localStorage.clear();
});

describe('agent skill integration', () => {
  it('adds professional skill focus to the core agents', () => {
    expect(ALPHONSO_PROFILE.skillPackIds).toContain('pack.codex-professional-coding');
    expect(ALPHONSO_PROFILE.skillPackIds).toContain('pack.coding.full-stack');
    expect(ALPHONSO_PROFILE.skillFocus).toContain('Codex Professional Coding');
    expect(HECTOR_PROFILE.skillPackIds).toContain('pack.hector-professional-marketing');
    expect(HECTOR_PROFILE.skillPackIds).toContain('pack.hector-market-research');
    expect(HECTOR_PROFILE.skillPackIds).toContain('pack.hector-competitive-analysis');
    expect(HECTOR_PROFILE.skillPackIds).toContain('pack.hector-source-verification');
    expect(HECTOR_PROFILE.skillPackIds).toContain('pack.hector-rss-monitoring');
    expect(HECTOR_PROFILE.skillPackIds).toContain('pack.workflow.executing-plans');
    expect(HECTOR_PROFILE.skillFocus).toContain('Professional Marketing + Market Research + Competitive Analysis + Source Verification + RSS Monitoring + Execution Skills + GitHub Research');
    expect(MARIA_PROFILE.skillPackIds).toContain('pack.maria-audit-governance');
    expect(MARIA_PROFILE.skillPackIds).toContain('pack.maria-trust-verification');
    expect(MARIA_PROFILE.skillFocus).toContain('Audit Governance + Trust Verification');
    expect(MIYA_PROFILE.skillPackIds).toContain('pack.miya-runway-video-generation');
    expect(MIYA_PROFILE.skillPackIds).toContain('pack.miya-creative-image');
    expect(MIYA_PROFILE.skillPackIds).toContain('pack.miya-ui-ux-design');
    expect(MIYA_PROFILE.skillPackIds).toContain('pack.miya-brand-identity');
    expect(MIYA_PROFILE.skillPackIds).toContain('pack.miya-motion-graphics');
    expect(MIYA_PROFILE.skillFocus).toContain('Runway Video Generation + Creative Image + UI/UX Design + Brand Identity + Motion Graphics');
    expect(JOSE_PROFILE.skillPackIds).toContain('pack.jose-professional-orchestration');
    expect(JOSE_PROFILE.skillPackIds).toContain('pack.jose-task-routing');
    expect(JOSE_PROFILE.skillPackIds).toContain('pack.jose-approval-gating');
    expect(JOSE_PROFILE.skillPackIds).toContain('pack.jose-cross-agent-synthesis');
    expect(JOSE_PROFILE.skillPackIds).toContain('pack.jose-pipeline-governance');
    expect(JOSE_PROFILE.skillPackIds).toContain('pack.workflow.executing-plans');
    expect(JOSE_PROFILE.skillFocus).toContain('Professional Orchestration + Task Routing + Approval Gating + Cross-Agent Synthesis + Pipeline Governance');
  });

  it('seeds the new professional skill packs into the registry', () => {
    const packs = listSkillPacks();
    const ids = packs.map((pack) => pack.id);

    expect(ids).toContain('pack.codex-professional-coding');
    expect(ids).toContain('pack.hector-professional-marketing');
    expect(ids).toContain('pack.miya-runway-video-generation');
    expect(ids).toContain('pack.maria-audit-governance');
    expect(ids).toContain('pack.maria-trust-verification');
    expect(ids).toContain('pack.jose-professional-orchestration');
  });

  it('seeds the Miya/Hector/Jose skill-library taxonomy (Sprint 3)', () => {
    const packs = listSkillPacks();
    const ids = packs.map((pack) => pack.id);

    ['pack.miya-creative-image', 'pack.miya-ui-ux-design', 'pack.miya-brand-identity', 'pack.miya-motion-graphics'].forEach((id) => {
      expect(ids).toContain(id);
      expect(packs.find((p) => p.id === id).ownerAgent).toBe('miya');
    });
    ['pack.hector-market-research', 'pack.hector-competitive-analysis', 'pack.hector-source-verification', 'pack.hector-rss-monitoring'].forEach((id) => {
      expect(ids).toContain(id);
      expect(packs.find((p) => p.id === id).ownerAgent).toBe('hector');
    });
    ['pack.jose-task-routing', 'pack.jose-approval-gating', 'pack.jose-cross-agent-synthesis', 'pack.jose-pipeline-governance'].forEach((id) => {
      expect(ids).toContain(id);
      expect(packs.find((p) => p.id === id).ownerAgent).toBe('jose');
    });
  });

  it('seeds the full agent-workflows topic into the registry', () => {
    const packs = listSkillPacks();
    const workflowPacks = packs.filter((pack) => pack.category === 'agent_workflow');
    const ids = workflowPacks.map((pack) => pack.id);
    const expectedIds = [
      'pack.workflow.find-skills',
      'pack.workflow.agent-browser',
      'pack.workflow.skill-creator',
      'pack.workflow.brainstorming',
      'pack.workflow.browser-use',
      'pack.workflow.systematic-debugging',
      'pack.workflow.writing-plans',
      'pack.workflow.executing-plans',
      'pack.workflow.test-driven-development',
      'pack.workflow.requesting-code-review',
      'pack.workflow.subagent-driven-development',
      'pack.workflow.verification-before-completion',
      'pack.workflow.dispatching-parallel-agents',
      'pack.workflow.using-git-worktrees',
      'pack.workflow.finishing-a-development-branch',
      'pack.workflow.ralph-tui-prd',
      'pack.workflow.ralph-tui-create-beads',
      'pack.workflow.ralph-tui-create-json',
      'pack.workflow.ralph-wiggum',
      'pack.workflow.ralph-loop'
    ];

    expect(workflowPacks).toHaveLength(20);
    expectedIds.forEach((id) => {
      expect(ids).toContain(id);
    });
  });
});
