import { describe, it, expect } from 'vitest';
import {
  AGENT_PERMISSION_TABLE,
  isTaskTypeAllowed,
  isEffectAllowed,
  describeAgentPermissions,
} from '../../../services/jose/agentPermissionTable';
import { AGENT_EXECUTION_CONTRACTS, validateAgentExecutionContract } from '../../../services/agentContractService';

describe('agentPermissionTable', () => {
  it('covers all 9 agents', () => {
    expect(Object.keys(AGENT_PERMISSION_TABLE).sort()).toEqual(['alphonso', 'echo', 'hector', 'jose', 'marcus', 'maria', 'miya', 'nova', 'sentinel']);
  });

  it('lets more agents create their own files, but only Alphonso runs things', () => {
    expect(isEffectAllowed('miya', 'write_own_work')).toBe(true);
    expect(isEffectAllowed('miya', 'run')).toBe(false);
    expect(isEffectAllowed('alphonso', 'run')).toBe(true);
    expect(isEffectAllowed('jose', 'run')).toBe(false);
    expect(isEffectAllowed('alphonso', 'change_project')).toBe(true);
    expect(isEffectAllowed('hector', 'change_project')).toBe(false);
  });

  it('only Marcus publishes', () => {
    expect(isEffectAllowed('marcus', 'publish_or_send')).toBe(true);
    expect(isEffectAllowed('hector', 'publish_or_send')).toBe(false);
  });

  it('separates Sentinel\'s security audits from Maria\'s quality audits', () => {
    expect(isTaskTypeAllowed('sentinel', 'security_audit_scan')).toBe(true);
    expect(isTaskTypeAllowed('maria', 'audit_content_quality')).toBe(true);
    expect(AGENT_EXECUTION_CONTRACTS.maria.allowedActionPrefixes).toContain('audit_');
  });

  it('builds the contracts from the table', () => {
    expect(AGENT_EXECUTION_CONTRACTS.hector.allowedActionPrefixes).toEqual(AGENT_PERMISSION_TABLE.hector.taskTypes);
  });

  it('describes each agent in plain words for the displays', () => {
    const hector = describeAgentPermissions('hector');
    expect(hector.blocked.join(' ')).toMatch(/Run code and commands/);
    expect(describeAgentPermissions('alphonso').approvalRequired.join(' ')).toMatch(/Run code and commands/);
  });
});

describe('contracts check effects, not words, when a task declares them', () => {
  it('passes a read-only task whose text mentions publishing', () => {
    const gate = validateAgentExecutionContract({ toAgent: 'nova', actionType: 'analysis_x', commandPreview: 'nothing is published or posted', effects: ['read'] } as never);
    expect(gate.ok).toBe(true);
  });

  it('refuses an effect the agent may not have', () => {
    const gate = validateAgentExecutionContract({ toAgent: 'miya', actionType: 'creative_x', commandPreview: '', effects: ['run'] } as never);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/Run code and commands/);
  });

  it('keeps the word check for older tasks that declare no effects', () => {
    const gate = validateAgentExecutionContract({ toAgent: 'nova', actionType: 'analysis_x', commandPreview: 'publish the post' } as never);
    expect(gate.ok).toBe(false);
  });
});
