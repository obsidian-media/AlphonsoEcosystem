import { describe, it, expect } from 'vitest';
import {
  WORKFLOWS, listWorkflows, getWorkflow, WORKFLOW_EXECUTION_SCOPE
} from '../../services/workflowRegistryService';

describe('workflowRegistryService', () => {
  it('WORKFLOWS is an object with 25+ workflows', () => {
    expect(typeof WORKFLOWS).toBe('object');
    expect(Object.keys(WORKFLOWS).length).toBeGreaterThanOrEqual(25);
  });

  it('each workflow has required fields', () => {
    for (const [key, wf] of Object.entries(WORKFLOWS)) {
      expect(wf.id).toBe(key);
      expect(typeof wf.name).toBe('string');
      expect(typeof wf.purpose).toBe('string');
      expect(Array.isArray(wf.chain)).toBe(true);
      expect(wf.chain.length).toBeGreaterThan(0);
      expect(Array.isArray(wf.tasks)).toBe(true);
      expect(Array.isArray(wf.outputs)).toBe(true);
    }
  });

  it('listWorkflows returns array of all workflows', () => {
    const list = listWorkflows();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(25);
  });

  it('getWorkflow returns workflow by id', () => {
    const wf = getWorkflow('WF_AI_SELF_DEV');
    expect(wf).toBeDefined();
    expect(wf.name).toBe('AI Self-Development');
  });

  it('getWorkflow returns null for unknown id', () => {
    expect(getWorkflow('WF_NONEXISTENT')).toBeNull();
    expect(getWorkflow('')).toBeNull();
  });

  it('known workflow IDs are present', () => {
    const expected = [
      'WF_AI_SELF_DEV', 'WF_PRODUCT_DEV', 'WF_REVENUE_GEN',
      'WF_CONTENT_EMPIRE', 'WF_OPPORTUNITY_RADAR', 'WF_PERSONAL_COS',
      'WF_LEARNING_MASTERY', 'WF_ECOSYSTEM_EXPANSION', 'WF_MARKETING_OPS',
      'WF_SOCIAL_MEDIA_OPS', 'WF_YOUTUBE_CHANNEL', 'WF_STARTUP_LAUNCH',
      'WF_EXECUTIVE_CMD'
    ];
    expected.forEach(id => expect(getWorkflow(id)).not.toBeNull());
  });

  it('WORKFLOW_EXECUTION_SCOPE is a string', () => {
    expect(typeof WORKFLOW_EXECUTION_SCOPE).toBe('string');
    expect(WORKFLOW_EXECUTION_SCOPE).toBe('workflow_execution_v1');
  });
});
