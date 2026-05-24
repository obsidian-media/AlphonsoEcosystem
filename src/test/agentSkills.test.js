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
    expect(ALPHONSO_PROFILE.skillFocus).toBe('OpenAI Codex Professional Coding Skill');
    expect(HECTOR_PROFILE.skillPackIds).toContain('pack.hector-professional-marketing');
    expect(HECTOR_PROFILE.skillPackIds).toContain('pack.workflow.executing-plans');
    expect(HECTOR_PROFILE.skillFocus).toBe('Professional Marketing Skill + Execution Skill');
    expect(MARIA_PROFILE.skillPackIds).toContain('pack.maria-audit-governance');
    expect(MARIA_PROFILE.skillPackIds).toContain('pack.maria-trust-verification');
    expect(MARIA_PROFILE.skillFocus).toBe('Audit Governance Skill + Trust Verification Skill');
    expect(MIYA_PROFILE.skillPackIds).toContain('pack.miya-runway-video-generation');
    expect(MIYA_PROFILE.skillFocus).toBe('Runway Video Generation Skill');
    expect(JOSE_PROFILE.skillPackIds).toContain('pack.jose-professional-orchestration');
    expect(JOSE_PROFILE.skillPackIds).toContain('pack.workflow.executing-plans');
    expect(JOSE_PROFILE.skillFocus).toBe('Professional Orchestration Skill');
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
