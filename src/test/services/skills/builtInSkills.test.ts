// The built-in skills (agent roles Part B, 2026-10-25).
import { describe, it, expect } from 'vitest';
import { listSkills, refusedSkills, skillsForTask, contentAsk } from '../../../services/skills/skillLibrary';
import { JOSE_TEMPLATES } from '../../../services/jose/joseTemplates';
import { STEP_AGENTS } from '../../../services/contentFactory/contentStepAgents';
import { WORKFLOW_STEP_TASK } from '../../../services/workflowRegistryService';
import { ACTION_EFFECTS, inferEffects } from '../../../services/jose/joseEffects';
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

  // Agent roles Part C2: 18 more skills, and the kinds of work they need.
  // Outside tools (2026-10-30) add Marcus's "Use an outside tool".
  it('has the 18 skills Part C2 adds and the outside-tool skill, 61 in all', () => {
    expect(listSkills().length).toBe(61);
    expect(listSkills().some((x) => x.agent === 'marcus' && x.taskTypes.includes('distribution_outside_tool'))).toBe(true);
  });

  it.each([
    ['alphonso', 'local_operation', 'Fix a bug from an error'],
    ['alphonso', 'local_operation', 'Write tests'],
    ['alphonso', 'local_operation', 'API and tool integration'],
    ['alphonso', 'local_operation', 'Plan and build a feature'],
    ['alphonso', 'assistant_explain_code', 'Explain code'],
    ['alphonso', 'assistant_summarize', 'Summarise a document'],
    ['hector', 'research_compare', 'Compare products and prices'],
    ['hector', 'research_people', 'Find companies or people'],
    ['nova', 'analysis_pros_cons', 'Pros and cons'],
    ['nova', 'analysis_pricing', 'Pricing'],
    ['maria', 'audit_code', 'Review code'],
    ['maria', 'audit_brand_voice', 'Brand voice check'],
    ['sentinel', 'security_dependencies', 'Dependency check'],
    ['sentinel', 'security_personal_data', 'Personal-data check'],
    ['marcus', 'distribution_newsletter', 'Email newsletter'],
    ['marcus', 'distribution_execution', 'Follow-up reminder'],
    ['echo', 'memory_digest', 'Weekly decisions digest'],
    ['echo', 'memory_recall', 'Project memory summary'],
  ])('%s does "%s" work with the skill "%s"', (agent, task, name) => {
    expect(ownerOf(task)).toBe(agent);
    expect(skillsForTask(agent, task).map((s) => s.name)).toContain(name);
  });

  it('the new kinds of work only read, except the newsletter, which sends', () => {
    for (const t of ['assistant_explain_code', 'assistant_summarize', 'research_compare', 'research_people', 'analysis_pros_cons',
      'analysis_pricing', 'audit_code', 'audit_brand_voice', 'security_dependencies', 'security_personal_data', 'memory_digest']) {
      expect(inferEffects(t), t).toEqual(['read']);
    }
    expect(inferEffects('distribution_newsletter')).toEqual(['publish_or_send']);
  });

  it("each content action's skill body is its ask, word for word", () => {
    for (const [type, ask] of Object.entries(asks as Record<string, string>)) expect(contentAsk(type), type).toBe(ask);
    expect(contentAsk('creative_nothing')).toBeNull();
  });
});
