import { describe, expect, it } from 'vitest';
import { SKILL_WORKFLOW_GUIDANCE, SHARED_AGENT_SKILL_PACK_IDS } from '../services/skillPackGuidance';

describe('SKILL_WORKFLOW_GUIDANCE', () => {
  it('exports a non-empty object', () => {
    expect(typeof SKILL_WORKFLOW_GUIDANCE).toBe('object');
    expect(Object.keys(SKILL_WORKFLOW_GUIDANCE).length).toBeGreaterThan(0);
  });

  it('every entry has guidance and steps', () => {
    for (const [id, entry] of Object.entries(SKILL_WORKFLOW_GUIDANCE)) {
      expect(entry.guidance, `${id} missing guidance`).toBeTruthy();
      expect(Array.isArray(entry.steps), `${id} steps not array`).toBe(true);
      expect(entry.steps.length, `${id} steps empty`).toBeGreaterThan(0);
    }
  });

  it('contains codex-professional-coding pack', () => {
    expect(SKILL_WORKFLOW_GUIDANCE['pack.codex-professional-coding']).toBeDefined();
    expect(SKILL_WORKFLOW_GUIDANCE['pack.codex-professional-coding'].guidance).toContain('code review');
  });

  it('contains workflow packs', () => {
    expect(SKILL_WORKFLOW_GUIDANCE['pack.workflow.test-driven-development']).toBeDefined();
    expect(SKILL_WORKFLOW_GUIDANCE['pack.workflow.brainstorming']).toBeDefined();
    expect(SKILL_WORKFLOW_GUIDANCE['pack.workflow.systematic-debugging']).toBeDefined();
  });

  it('contains hector packs', () => {
    expect(SKILL_WORKFLOW_GUIDANCE['pack.hector-market-research']).toBeDefined();
    expect(SKILL_WORKFLOW_GUIDANCE['pack.hector-competitive-analysis']).toBeDefined();
  });

  it('contains jose packs', () => {
    expect(SKILL_WORKFLOW_GUIDANCE['pack.jose-task-routing']).toBeDefined();
    expect(SKILL_WORKFLOW_GUIDANCE['pack.jose-pipeline-governance']).toBeDefined();
  });

  it('contains marcus packs', () => {
    expect(SKILL_WORKFLOW_GUIDANCE['pack.marcus-github-releases']).toBeDefined();
    expect(SKILL_WORKFLOW_GUIDANCE['pack.marcus-release-readiness']).toBeDefined();
  });

  it('contains miya packs', () => {
    expect(SKILL_WORKFLOW_GUIDANCE['pack.miya-creative-image']).toBeDefined();
    expect(SKILL_WORKFLOW_GUIDANCE['pack.miya-ui-ux-design']).toBeDefined();
  });

  it('contains sentinel packs', () => {
    expect(SKILL_WORKFLOW_GUIDANCE['pack.sentinel-secret-hygiene']).toBeDefined();
  });

  it('contains echo packs', () => {
    expect(SKILL_WORKFLOW_GUIDANCE['pack.echo-decision-capture']).toBeDefined();
  });

  it('contains nova packs', () => {
    expect(SKILL_WORKFLOW_GUIDANCE['pack.nova-market-analysis']).toBeDefined();
  });

  it('contains alphonso packs', () => {
    expect(SKILL_WORKFLOW_GUIDANCE['pack.alphonso-typescript-mastery']).toBeDefined();
    expect(SKILL_WORKFLOW_GUIDANCE['pack.alphonso-rust-operations']).toBeDefined();
  });
});

describe('SHARED_AGENT_SKILL_PACK_IDS', () => {
  it('exports shared packs for jose, hector, marcus', () => {
    expect(SHARED_AGENT_SKILL_PACK_IDS.jose).toContain('pack.workflow.executing-plans');
    expect(SHARED_AGENT_SKILL_PACK_IDS.hector).toContain('pack.workflow.executing-plans');
    expect(SHARED_AGENT_SKILL_PACK_IDS.marcus).toContain('pack.workflow.executing-plans');
  });

  it('does not share packs for alphonso', () => {
    expect(SHARED_AGENT_SKILL_PACK_IDS.alphonso).toBeUndefined();
  });
});
