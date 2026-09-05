import { describe, expect, it } from 'vitest';
import { AGENT_WORKFLOW_SKILL_DEFS, AGENT_WORKFLOW_PACKS } from '../services/skillPackWorkflowData';
import { CORE_BASE_PACKS } from '../services/skillPackContentCore';

describe('AGENT_WORKFLOW_SKILL_DEFS', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(AGENT_WORKFLOW_SKILL_DEFS)).toBe(true);
    expect(AGENT_WORKFLOW_SKILL_DEFS.length).toBeGreaterThan(0);
  });

  it('every entry has id, name, description, permissions', () => {
    for (const skill of AGENT_WORKFLOW_SKILL_DEFS) {
      expect(skill.id).toBeTruthy();
      expect(skill.name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(Array.isArray(skill.permissions)).toBe(true);
    }
  });

  it('contains finding-skills pack', () => {
    expect(AGENT_WORKFLOW_SKILL_DEFS.find(s => s.id === 'pack.workflow.find-skills')).toBeDefined();
  });

  it('contains brainstorming pack', () => {
    expect(AGENT_WORKFLOW_SKILL_DEFS.find(s => s.id === 'pack.workflow.brainstorming')).toBeDefined();
  });

  it('contains TDD pack', () => {
    expect(AGENT_WORKFLOW_SKILL_DEFS.find(s => s.id === 'pack.workflow.test-driven-development')).toBeDefined();
  });
});

describe('AGENT_WORKFLOW_PACKS', () => {
  it('maps skill defs to packs with version and trust', () => {
    expect(AGENT_WORKFLOW_PACKS.length).toBe(AGENT_WORKFLOW_SKILL_DEFS.length);
    for (const pack of AGENT_WORKFLOW_PACKS) {
      expect(pack.version).toBe('1.0.0');
      expect(pack.enabled).toBe(true);
      expect(pack.trust).toBeDefined();
      expect(pack.source).toContain('skills.sh');
    }
  });
});

describe('CORE_BASE_PACKS', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(CORE_BASE_PACKS)).toBe(true);
    expect(CORE_BASE_PACKS.length).toBeGreaterThan(0);
  });

  it('every pack has required fields', () => {
    for (const pack of CORE_BASE_PACKS) {
      expect(pack.id).toBeTruthy();
      expect(pack.name).toBeTruthy();
      expect(pack.version).toBeTruthy();
      expect(typeof pack.enabled).toBe('boolean');
      expect(Array.isArray(pack.permissions)).toBe(true);
    }
  });

  it('includes marketing-core pack', () => {
    const pack = CORE_BASE_PACKS.find(p => p.id === 'pack.marketing-core');
    expect(pack).toBeDefined();
    expect(pack.permissions).toContain('memory.read');
  });

  it('includes developer-core pack', () => {
    const pack = CORE_BASE_PACKS.find(p => p.id === 'pack.developer-core');
    expect(pack).toBeDefined();
    expect(pack.permissions).toContain('workflows.write');
  });

  it('includes hector research packs', () => {
    const hectorPacks = CORE_BASE_PACKS.filter(p => p.ownerAgent === 'hector');
    expect(hectorPacks.length).toBeGreaterThan(5);
  });

  it('includes alphonso codex pack', () => {
    const pack = CORE_BASE_PACKS.find(p => p.id === 'pack.codex-professional-coding');
    expect(pack).toBeDefined();
    expect(pack.ownerAgent).toBe('alphonso');
  });
});
