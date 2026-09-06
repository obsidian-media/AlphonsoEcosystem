import { beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_MODES,
  getAgentMode,
  setAgentMode,
  isReadOnlyDefault,
  canExecuteAction,
  setExecutionApprovalState,
  getExecutionApprovalState
} from '../services/agentWorkshop/executionModeService';

beforeEach(() => {
  localStorage.clear();
});

describe('AGENT_MODES', () => {
  it('has proposal and execution values', () => {
    expect(AGENT_MODES.PROPOSAL).toBe('proposal');
    expect(AGENT_MODES.EXECUTION).toBe('execution');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(AGENT_MODES)).toBe(true);
  });
});

describe('getAgentMode', () => {
  it('defaults to proposal mode', () => {
    expect(getAgentMode()).toBe(AGENT_MODES.PROPOSAL);
  });

  it('returns execution when set', () => {
    setAgentMode(AGENT_MODES.EXECUTION);
    expect(getAgentMode()).toBe(AGENT_MODES.EXECUTION);
  });

  it('returns proposal for invalid values', () => {
    setAgentMode('invalid');
    expect(getAgentMode()).toBe(AGENT_MODES.PROPOSAL);
  });
});

describe('setAgentMode', () => {
  it('stores execution mode', () => {
    const result = setAgentMode(AGENT_MODES.EXECUTION);
    expect(result).toBe(AGENT_MODES.EXECUTION);
    expect(localStorage.getItem('alphonso_agent_execution_mode_v1')).toBe('execution');
  });

  it('stores proposal mode for any non-execution value', () => {
    const result = setAgentMode('something_else');
    expect(result).toBe(AGENT_MODES.PROPOSAL);
  });
});

describe('isReadOnlyDefault', () => {
  it('returns true when in proposal mode', () => {
    expect(isReadOnlyDefault()).toBe(true);
  });

  it('returns false when in execution mode', () => {
    setAgentMode(AGENT_MODES.EXECUTION);
    expect(isReadOnlyDefault()).toBe(false);
  });
});

describe('canExecuteAction', () => {
  it('denies when in proposal mode', () => {
    const result = canExecuteAction({ approved: true, audited: true, verified: true, dependenciesChecked: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Proposal Mode');
  });

  it('denies when not approved', () => {
    setAgentMode(AGENT_MODES.EXECUTION);
    const result = canExecuteAction({ approved: false, audited: true, verified: true, dependenciesChecked: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Approval');
  });

  it('denies when not audited', () => {
    setAgentMode(AGENT_MODES.EXECUTION);
    const result = canExecuteAction({ approved: true, audited: false, verified: true, dependenciesChecked: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Audit');
  });

  it('denies when not verified', () => {
    setAgentMode(AGENT_MODES.EXECUTION);
    const result = canExecuteAction({ approved: true, audited: true, verified: false, dependenciesChecked: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Verification');
  });

  it('denies when dependencies not checked', () => {
    setAgentMode(AGENT_MODES.EXECUTION);
    const result = canExecuteAction({ approved: true, audited: true, verified: true, dependenciesChecked: false });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Dependency');
  });

  it('allows when all gates pass', () => {
    setAgentMode(AGENT_MODES.EXECUTION);
    const result = canExecuteAction({ approved: true, audited: true, verified: true, dependenciesChecked: true });
    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('defaults all flags to false', () => {
    setAgentMode(AGENT_MODES.EXECUTION);
    const result = canExecuteAction();
    expect(result.ok).toBe(false);
  });
});

describe('setExecutionApprovalState / getExecutionApprovalState', () => {
  it('defaults to all false', () => {
    const state = getExecutionApprovalState();
    expect(state.approved).toBe(false);
    expect(state.audited).toBe(false);
    expect(state.verified).toBe(false);
    expect(state.dependenciesChecked).toBe(false);
    expect(state.updatedAt).toBeNull();
  });

  it('persists approval state', () => {
    setExecutionApprovalState({ approved: true, audited: true, verified: false, dependenciesChecked: false });
    const state = getExecutionApprovalState();
    expect(state.approved).toBe(true);
    expect(state.audited).toBe(true);
    expect(state.verified).toBe(false);
    expect(state.dependenciesChecked).toBe(false);
    expect(state.updatedAt).toBeTruthy();
  });

  it('coerces non-boolean values to boolean', () => {
    setExecutionApprovalState({ approved: 1, audited: 'yes', verified: null, dependenciesChecked: 0 });
    const state = getExecutionApprovalState();
    expect(state.approved).toBe(true);
    expect(state.audited).toBe(true);
    expect(state.verified).toBe(false);
    expect(state.dependenciesChecked).toBe(false);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('alphonso_execution_mode_approval_v1', '{invalid json');
    const state = getExecutionApprovalState();
    expect(state.approved).toBe(false);
    expect(state.updatedAt).toBeNull();
  });
});
