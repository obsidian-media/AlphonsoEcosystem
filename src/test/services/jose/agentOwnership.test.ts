// One owner per kind of work (agent roles Part A, owner 2026-10-24).
import { describe, it, expect } from 'vitest';
import {
  AGENT_PERMISSION_TABLE,
  taskTypePartAllowed,
  isTaskTypeAllowed,
  ownerOf,
  describeResponsibility,
  responsibilityLines,
} from '../../../services/jose/agentPermissionTable';
import { ACTION_EFFECTS } from '../../../services/jose/joseEffects';
import { JOSE_TEMPLATES } from '../../../services/jose/joseTemplates';
import { STEP_AGENTS } from '../../../services/contentFactory/contentStepAgents';
import { WORKFLOW_STEP_TASK } from '../../../services/workflowRegistryService';
import { MARCUS_PROFILE } from '../../../agents/marcus/marcusProfile';

const agents = Object.keys(AGENT_PERMISSION_TABLE);

describe('one owner per kind of work', () => {
  it('no task-type prefix belongs to two agents', () => {
    const clashes: string[] = [];
    for (const a of agents) {
      for (const prefix of AGENT_PERMISSION_TABLE[a].taskTypes) {
        if (prefix === 'agent_report') continue;
        for (const b of agents) {
          if (b === a) continue;
          const { taskTypes, blockedTaskTypes } = AGENT_PERMISSION_TABLE[b];
          if (taskTypePartAllowed(prefix, taskTypes, blockedTaskTypes)) clashes.push(`${prefix}: ${a} and ${b}`);
        }
      }
    }
    expect(clashes).toEqual([]);
  });

  it('every known action type has exactly one owner, the one the step gives it', () => {
    for (const type of Object.keys(ACTION_EFFECTS)) expect(ownerOf(type), type).not.toBeNull();
    for (const template of JOSE_TEMPLATES) {
      for (const step of template.steps) expect(ownerOf(step.actionType), `${template.id}/${step.stepId}`).toBe(step.agent);
    }
    for (const [step, list] of Object.entries(STEP_AGENTS)) {
      for (const entry of list) expect(ownerOf(entry.actionType), `content ${step}`).toBe(entry.agent);
    }
    for (const [agent, type] of Object.entries(WORKFLOW_STEP_TASK)) expect(ownerOf(type), `workflow ${agent}`).toBe(agent);
  });

  it('follows the owner map', () => {
    expect(ownerOf('assistant_answer')).toBe('alphonso');
    expect(ownerOf('creative_assemble_video')).toBe('miya');
    expect(ownerOf('design_ui')).toBe('miya');
    expect(ownerOf('distribution_readiness')).toBe('marcus');
    expect(ownerOf('outreach_call')).toBe('marcus');
    expect(ownerOf('risk_review')).toBe('maria');
    expect(ownerOf('remote_message_route')).toBe('jose');
    expect(ownerOf('orchestration_plan')).toBe('jose');
    expect(ownerOf('agent_report')).toBeNull();
    expect(isTaskTypeAllowed('alphonso', 'orchestration_plan')).toBe(false);
    expect(isTaskTypeAllowed('miya', 'orchestration_plan')).toBe(false);
    expect(isTaskTypeAllowed('jose', 'research_review')).toBe(false);
  });

  it('says what each agent owns and never does', () => {
    expect(describeResponsibility('jose')?.never).toMatch(/writing, research or reviews/);
    for (const agent of agents) expect(describeResponsibility(agent)?.owns, agent).toBeTruthy();
    expect(describeResponsibility('nobody')).toBeNull();
    expect(responsibilityLines()).toHaveLength(9);
  });

  it("Marcus's profile no longer claims security or risk work", () => {
    expect(MARCUS_PROFILE.skillFocus).not.toMatch(/Security Audit|Risk Detection/);
  });

  // Agent phase 5: his profile is distribution only; audits and risk registers are Maria's.
  it('Marcus does distribution only', () => {
    expect(MARCUS_PROFILE.allowedActions).not.toContain('generate_audit_report');
    expect(MARCUS_PROFILE.allowedActions).not.toContain('generate_risk_register');
    expect(JSON.stringify(MARCUS_PROFILE)).not.toMatch(/risk-first|fraud risk|AuditReport|RiskReport/i);
  });
});
