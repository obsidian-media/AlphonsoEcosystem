// The built-in skills (agent roles Part B, 2026-10-25).
import { describe, it, expect } from 'vitest';
import { listSkills, refusedSkills, skillsForTask, contentAsk } from '../../../services/skills/skillLibrary';
import { JOSE_TEMPLATES } from '../../../services/jose/joseTemplates';
import { STEP_AGENTS } from '../../../services/contentFactory/contentStepAgents';
import { WORKFLOW_STEP_TASK } from '../../../services/workflowRegistryService';
import { ACTION_EFFECTS } from '../../../services/jose/joseEffects';
import { ownerOf } from '../../../services/jose/agentPermissionTable';
import asks from './fixtures/contentAsks.json';

const WORKERS = ['alphonso', 'miya', 'hector', 'nova', 'maria', 'sentinel', 'marcus', 'echo'];

describe('built-in skills', () => {
  it('every built-in skill passes the check', () => {
    expect(refusedSkills().filter((r) => r.source === 'built_in')).toEqual([]);
  });

  it('each agent but Jose has 3 or more skills, Jose none', () => {
    for (const agent of WORKERS) expect(listSkills(agent).length, agent).toBeGreaterThanOrEqual(3);
    expect(listSkills('jose')).toEqual([]);
  });

  it('every action type the templates, the content factory and the workflows use has a skill of its owner', () => {
    const types = new Set<string>();
    for (const t of JOSE_TEMPLATES) for (const s of t.steps) types.add(s.actionType);
    for (const list of Object.values(STEP_AGENTS)) for (const e of list) types.add(e.actionType);
    for (const t of Object.values(WORKFLOW_STEP_TASK)) types.add(t);
    for (const t of Object.keys(ACTION_EFFECTS)) types.add(t);
    const missing = [...types].filter((type) => {
      const owner = ownerOf(type);
      return owner && owner !== 'jose' && skillsForTask(owner, type).length === 0;
    });
    expect(missing).toEqual([]);
  });

  it('names are unique within each agent', () => {
    for (const agent of WORKERS) {
      const names = listSkills(agent).map((s) => s.name);
      expect(new Set(names).size, agent).toBe(names.length);
    }
  });

  it("each content action's skill body is its ask, word for word", () => {
    for (const [type, ask] of Object.entries(asks as Record<string, string>)) expect(contentAsk(type), type).toBe(ask);
    expect(contentAsk('creative_nothing')).toBeNull();
  });
});
