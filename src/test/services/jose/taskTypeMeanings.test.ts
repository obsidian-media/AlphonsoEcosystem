// Jose's model sees each task type with a plain meaning (agent phase 1, 2026-10-25).
import { describe, it, expect } from 'vitest';
import { TASK_TYPE_MEANINGS, taskTypesFor, planningMenu } from '../../../services/jose/taskTypeMeanings';
import { JOSE_TEMPLATES } from '../../../services/jose/joseTemplates';
import { STEP_AGENTS } from '../../../services/contentFactory/contentStepAgents';
import { WORKFLOW_STEP_TASK } from '../../../services/workflowRegistryService';
import { ACTION_EFFECTS } from '../../../services/jose/joseEffects';
import { ownerOf } from '../../../services/jose/agentPermissionTable';
import { listSkills } from '../../../services/skills/skillLibrary';

const SPLITTER_TYPES = ['assistant_answer', 'creative_package', 'distribution_execution', 'distribution_readiness', 'governance_audit', 'local_operation', 'memory_preservation', 'opportunity_analysis', 'research', 'security_monitor'];

describe('task types with meanings', () => {
  it('every action type in use has a meaning', () => {
    const used = new Set<string>(SPLITTER_TYPES);
    for (const t of JOSE_TEMPLATES) for (const s of t.steps) used.add(s.actionType);
    for (const list of Object.values(STEP_AGENTS)) for (const e of list) used.add(e.actionType);
    for (const t of Object.values(WORKFLOW_STEP_TASK)) used.add(t);
    for (const t of Object.keys(ACTION_EFFECTS)) used.add(t);
    for (const s of listSkills()) for (const t of s.taskTypes) used.add(t);
    const missing = [...used].filter((t) => ownerOf(t) && ownerOf(t) !== 'jose' && !TASK_TYPE_MEANINGS[t]);
    expect(missing).toEqual([]);
  });

  it('every meaning belongs to an agent who owns it', () => {
    for (const type of Object.keys(TASK_TYPE_MEANINGS)) expect(ownerOf(type), type).not.toBeNull();
  });

  it("lists an agent's own types only", () => {
    const alphonso = taskTypesFor('alphonso').map((t) => t.type);
    expect(alphonso).toContain('assistant_write');
    expect(alphonso).not.toContain('creative_script');
    expect(taskTypesFor('jose')).toEqual([]);
  });

  it('the planning menu gives each agent its jobs with meanings', () => {
    const menu = planningMenu();
    const alphonso = menu.split('\n\n').find((block) => block.startsWith('alphonso owns:'));
    expect(alphonso).toContain('\n- assistant_write: ');
    expect(menu).toContain('- research_report: ');
    expect(menu).not.toContain('Task types starting with');
    expect(menu).not.toMatch(/^jose owns/m);
  });
});
