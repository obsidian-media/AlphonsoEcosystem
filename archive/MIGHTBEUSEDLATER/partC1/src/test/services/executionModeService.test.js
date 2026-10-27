import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AGENT_MODES, getAgentMode, setAgentMode, isReadOnlyDefault,
  canExecuteAction, setExecutionApprovalState, getExecutionApprovalState
} from '../../services/agentWorkshop/executionModeService';

describe('executionModeService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('AGENT_MODES has PROPOSAL and EXECUTION', () => {
    expect(AGENT_MODES.PROPOSAL).toBe('proposal');
    expect(AGENT_MODES.EXECUTION).toBe('execution');
  });

  it('getAgentMode defaults to PROPOSAL', () => {
    expect(getAgentMode()).toBe('proposal');
  });

  it('setAgentMode stores EXECUTION mode', () => {
    const result = setAgentMode('execution');
    expect(result).toBe('execution');
    expect(getAgentMode()).toBe('execution');
  });

  it('setAgentMode falls back to PROPOSAL for invalid values', () => {
    expect(setAgentMode('invalid')).toBe('proposal');
    expect(setAgentMode(null)).toBe('proposal');
    expect(setAgentMode(undefined)).toBe('proposal');
  });

  it('isReadOnlyDefault returns true in PROPOSAL mode', () => {
    expect(isReadOnlyDefault()).toBe(true);
  });

  it('isReadOnlyDefault returns false in EXECUTION mode', () => {
    setAgentMode('execution');
    expect(isReadOnlyDefault()).toBe(false);
  });

  it('canExecuteAction rejects in PROPOSAL mode', () => {
    const result = canExecuteAction({ approved: true, audited: true, verified: true, dependenciesChecked: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Proposal Mode');
  });

  it('canExecuteAction rejects without approval in EXECUTION mode', () => {
    setAgentMode('execution');
    const result = canExecuteAction({ approved: false });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Approval');
  });

  it('canExecuteAction rejects without audit in EXECUTION mode', () => {
    setAgentMode('execution');
    const result = canExecuteAction({ approved: true, audited: false });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Audit');
  });

  it('canExecuteAction rejects without verification in EXECUTION mode', () => {
    setAgentMode('execution');
    const result = canExecuteAction({ approved: true, audited: true, verified: false });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Verification');
  });

  it('canExecuteAction rejects without dependency check in EXECUTION mode', () => {
    setAgentMode('execution');
    const result = canExecuteAction({ approved: true, audited: true, verified: true, dependenciesChecked: false });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Dependency');
  });

  it('canExecuteAction succeeds with all gates in EXECUTION mode', () => {
    setAgentMode('execution');
    const result = canExecuteAction({ approved: true, audited: true, verified: true, dependenciesChecked: true });
    expect(result.ok).toBe(true);
  });

  it('canExecuteAction defaults to all-false if no options', () => {
    setAgentMode('execution');
    const result = canExecuteAction();
    expect(result.ok).toBe(false);
  });

  it('setExecutionApprovalState stores state', () => {
    setExecutionApprovalState({ approved: true, audited: true, verified: true, dependenciesChecked: true });
    const state = getExecutionApprovalState();
    expect(state.approved).toBe(true);
    expect(state.audited).toBe(true);
    expect(state.verified).toBe(true);
    expect(state.dependenciesChecked).toBe(true);
    expect(state.updatedAt).toBeTruthy();
  });

  it('getExecutionApprovalState returns defaults when empty', () => {
    const state = getExecutionApprovalState();
    expect(state.approved).toBe(false);
    expect(state.audited).toBe(false);
    expect(state.verified).toBe(false);
    expect(state.dependenciesChecked).toBe(false);
    expect(state.updatedAt).toBeNull();
  });
});
