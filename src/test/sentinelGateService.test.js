import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockGetAgentOutput = vi.fn(() => null);

vi.mock('../services/agentOutputStoreService', () => ({
  getAgentOutput: (...args) => mockGetAgentOutput(...args)
}));

import {
  evaluateRisk,
  checkSentinelAlerts,
  shouldBlock,
  getGateStatus
} from '../services/sentinelGateService';

describe('evaluateRisk', () => {
  it('returns empty result for empty assignments', () => {
    const result = evaluateRisk([]);
    expect(result.flagged).toHaveLength(0);
    expect(result.highRiskCount).toBe(0);
    expect(result.criticalCount).toBe(0);
  });

  it('returns empty result for null assignments', () => {
    const result = evaluateRisk(null);
    expect(result.flagged).toHaveLength(0);
    expect(result.highRiskCount).toBe(0);
    expect(result.criticalCount).toBe(0);
  });

  it('flags high-risk action types', () => {
    const assignments = [
      { agent: 'miya', actionType: 'external_publish', riskLevel: 'medium' }
    ];
    const result = evaluateRisk(assignments);
    expect(result.flagged).toHaveLength(1);
    expect(result.highRiskCount).toBe(1);
    expect(result.flagged[0].reasons[0]).toContain('external_publish');
  });

  it('flags high risk level', () => {
    const assignments = [
      { agent: 'marcus', actionType: 'distribution_execution', riskLevel: 'high' }
    ];
    const result = evaluateRisk(assignments);
    expect(result.flagged).toHaveLength(1);
    expect(result.highRiskCount).toBe(1);
    expect(result.flagged[0].reasons[0]).toContain('risk_level_elevated');
  });

  it('flags critical risk level', () => {
    const assignments = [
      { agent: 'alphonso', actionType: 'local_operation', riskLevel: 'critical' }
    ];
    const result = evaluateRisk(assignments);
    expect(result.flagged).toHaveLength(1);
    expect(result.highRiskCount).toBe(1);
    expect(result.criticalCount).toBe(1);
  });

  it('counts multiple reasons per assignment', () => {
    const assignments = [
      { agent: 'marcus', actionType: 'external_publish', riskLevel: 'high' }
    ];
    const result = evaluateRisk(assignments);
    expect(result.flagged[0].reasons).toHaveLength(2);
  });

  it('flags execute_command as critical', () => {
    const assignments = [
      { agent: 'hector', actionType: 'execute_command', riskLevel: 'high' }
    ];
    const result = evaluateRisk(assignments);
    expect(result.criticalCount).toBe(1);
  });

  it('does not flag low-risk assignments', () => {
    const assignments = [
      { agent: 'hector', actionType: 'research', riskLevel: 'low' }
    ];
    const result = evaluateRisk(assignments);
    expect(result.flagged).toHaveLength(0);
    expect(result.highRiskCount).toBe(0);
  });

  it('skips assignments without agent', () => {
    const assignments = [
      { actionType: 'external_publish', riskLevel: 'high' }
    ];
    const result = evaluateRisk(assignments);
    expect(result.flagged).toHaveLength(1);
    expect(result.flagged[0].agent).toBe('');
  });

  it('flags upload action type', () => {
    const assignments = [
      { agent: 'marcus', actionType: 'upload_media', riskLevel: 'medium' }
    ];
    const result = evaluateRisk(assignments);
    expect(result.flagged).toHaveLength(1);
  });

  it('flags post action type', () => {
    const assignments = [
      { agent: 'marcus', actionType: 'post_to_social', riskLevel: 'medium' }
    ];
    const result = evaluateRisk(assignments);
    expect(result.flagged).toHaveLength(1);
  });

  it('flags purchase action type', () => {
    const assignments = [
      { agent: 'alphonso', actionType: 'purchase_license', riskLevel: 'high' }
    ];
    const result = evaluateRisk(assignments);
    expect(result.flagged).toHaveLength(1);
  });

  it('counts multiple flagged assignments', () => {
    const assignments = [
      { agent: 'miya', actionType: 'external_publish', riskLevel: 'high' },
      { agent: 'marcus', actionType: 'purchase', riskLevel: 'critical' },
      { agent: 'hector', actionType: 'research', riskLevel: 'low' }
    ];
    const result = evaluateRisk(assignments);
    expect(result.flagged).toHaveLength(2);
    expect(result.highRiskCount).toBe(2);
    expect(result.criticalCount).toBe(1);
  });
});

describe('checkSentinelAlerts', () => {
  beforeEach(() => {
    mockGetAgentOutput.mockReset();
  });

  it('returns no alerts when no commandId', () => {
    const result = checkSentinelAlerts(null);
    expect(result.found).toBe(false);
    expect(result.alerts).toHaveLength(0);
  });

  it('returns no alerts when sentinel has no output', () => {
    mockGetAgentOutput.mockReturnValue(null);
    const result = checkSentinelAlerts('cmd-1');
    expect(result.found).toBe(false);
    expect(result.output).toBeNull();
  });

  it('detects blocked signal in summary', () => {
    mockGetAgentOutput.mockReturnValue({
      summary: 'Sentinel blocked the assignment due to violation of policy',
      resultState: 'completed',
      artifacts: []
    });
    const result = checkSentinelAlerts('cmd-1');
    expect(result.found).toBe(true);
    expect(result.alerts.length).toBeGreaterThanOrEqual(1);
    expect(result.alerts.some((a) => a.type === 'summary_signal')).toBe(true);
  });

  it('detects denied signal in summary', () => {
    mockGetAgentOutput.mockReturnValue({
      summary: 'Access denied for this action',
      resultState: 'completed',
      artifacts: []
    });
    const result = checkSentinelAlerts('cmd-1');
    expect(result.found).toBe(true);
  });

  it('detects violation signal in summary', () => {
    mockGetAgentOutput.mockReturnValue({
      summary: 'Policy violation detected in the request',
      resultState: 'completed',
      artifacts: []
    });
    const result = checkSentinelAlerts('cmd-1');
    expect(result.found).toBe(true);
  });

  it('detects blocked artifact status', () => {
    mockGetAgentOutput.mockReturnValue({
      summary: 'Sentinel review completed',
      resultState: 'completed',
      artifacts: [{ type: 'security_check', status: 'blocked' }]
    });
    const result = checkSentinelAlerts('cmd-1');
    expect(result.found).toBe(true);
    expect(result.alerts.some((a) => a.type === 'artifact_blocked')).toBe(true);
  });

  it('detects security_flag artifact', () => {
    mockGetAgentOutput.mockReturnValue({
      summary: 'Sentinel review completed',
      resultState: 'completed',
      artifacts: [{ type: 'security_monitor', status: 'flagged' }]
    });
    const result = checkSentinelAlerts('cmd-1');
    expect(result.found).toBe(true);
    expect(result.alerts.some((a) => a.type === 'security_flag')).toBe(true);
  });

  it('detects failed sentinel state', () => {
    mockGetAgentOutput.mockReturnValue({
      summary: 'Sentinel could not complete review',
      resultState: 'failed',
      artifacts: []
    });
    const result = checkSentinelAlerts('cmd-1');
    expect(result.found).toBe(true);
    expect(result.alerts.some((a) => a.type === 'sentinel_state')).toBe(true);
  });

  it('detects rejected sentinel state', () => {
    mockGetAgentOutput.mockReturnValue({
      summary: 'Sentinel review completed',
      resultState: 'rejected',
      artifacts: []
    });
    const result = checkSentinelAlerts('cmd-1');
    expect(result.found).toBe(true);
    expect(result.alerts.some((a) => a.type === 'sentinel_state')).toBe(true);
  });

  it('returns no alerts for clean sentinel output', () => {
    mockGetAgentOutput.mockReturnValue({
      summary: 'Sentinel completed safety review. All clear.',
      resultState: 'completed',
      artifacts: [{ type: 'security_check', status: 'passed' }]
    });
    const result = checkSentinelAlerts('cmd-1');
    expect(result.found).toBe(false);
    expect(result.alerts).toHaveLength(0);
  });

  it('returns the sentinel output object', () => {
    const output = {
      summary: 'Sentinel review completed',
      resultState: 'completed',
      artifacts: []
    };
    mockGetAgentOutput.mockReturnValue(output);
    const result = checkSentinelAlerts('cmd-1');
    expect(result.output).toBe(output);
  });

  it('detects data_exfiltration signal', () => {
    mockGetAgentOutput.mockReturnValue({
      summary: 'Potential data_exfiltration detected',
      resultState: 'completed',
      artifacts: []
    });
    const result = checkSentinelAlerts('cmd-1');
    expect(result.found).toBe(true);
  });

  it('detects unauthorized signal', () => {
    mockGetAgentOutput.mockReturnValue({
      summary: 'Unauthorized access attempt blocked',
      resultState: 'completed',
      artifacts: []
    });
    const result = checkSentinelAlerts('cmd-1');
    expect(result.found).toBe(true);
  });

  it('detects multiple signals in summary', () => {
    mockGetAgentOutput.mockReturnValue({
      summary: 'Sentinel blocked the action. Security breach detected. Violation of policy.',
      resultState: 'completed',
      artifacts: []
    });
    const result = checkSentinelAlerts('cmd-1');
    expect(result.found).toBe(true);
    expect(result.alerts.length).toBeGreaterThanOrEqual(2);
  });

  it('detects alert artifact status', () => {
    mockGetAgentOutput.mockReturnValue({
      summary: 'Sentinel review completed',
      resultState: 'completed',
      artifacts: [{ type: 'security_check', status: 'alert' }]
    });
    const result = checkSentinelAlerts('cmd-1');
    expect(result.found).toBe(true);
  });

  it('ignores non-blocked artifact statuses', () => {
    mockGetAgentOutput.mockReturnValue({
      summary: 'Sentinel review completed',
      resultState: 'completed',
      artifacts: [{ type: 'security_check', status: 'passed' }]
    });
    const result = checkSentinelAlerts('cmd-1');
    expect(result.found).toBe(false);
  });

  it('uses default agent name sentinel', () => {
    mockGetAgentOutput.mockReturnValue(null);
    checkSentinelAlerts('cmd-1');
    expect(mockGetAgentOutput).toHaveBeenCalledWith('cmd-1', 'sentinel');
  });

  it('supports custom agent name', () => {
    mockGetAgentOutput.mockReturnValue(null);
    checkSentinelAlerts('cmd-1', 'custom_agent');
    expect(mockGetAgentOutput).toHaveBeenCalledWith('cmd-1', 'custom_agent');
  });
});

describe('shouldBlock', () => {
  it('returns not blocked for null assignment', () => {
    const result = shouldBlock(null, {});
    expect(result.blocked).toBe(false);
  });

  it('returns not blocked for low-risk assignment', () => {
    const result = shouldBlock(
      { agent: 'miya', actionType: 'creative_package', riskLevel: 'low' },
      { summary: 'blocked', artifacts: [] }
    );
    expect(result.blocked).toBe(false);
  });

  it('returns not blocked for medium-risk assignment', () => {
    const result = shouldBlock(
      { agent: 'miya', actionType: 'creative_package', riskLevel: 'medium' },
      { summary: 'blocked', artifacts: [] }
    );
    expect(result.blocked).toBe(false);
  });

  it('returns not blocked when no sentinel output', () => {
    const result = shouldBlock(
      { agent: 'miya', actionType: 'creative_package', riskLevel: 'high' },
      null
    );
    expect(result.blocked).toBe(false);
  });

  it('returns not blocked when sentinel has no alerts', () => {
    const result = shouldBlock(
      { agent: 'marcus', actionType: 'distribution', riskLevel: 'high' },
      { summary: 'All clear', resultState: 'completed', artifacts: [] }
    );
    expect(result.blocked).toBe(false);
  });

  it('blocks high-risk assignment when sentinel has blocked signal', () => {
    const result = shouldBlock(
      { agent: 'marcus', actionType: 'external_publish', riskLevel: 'high' },
      { summary: 'Sentinel blocked the action', resultState: 'completed', artifacts: [] }
    );
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('marcus');
    expect(result.reason).toContain('external_publish');
  });

  it('blocks critical-risk assignment when sentinel has blocked signal', () => {
    const result = shouldBlock(
      { agent: 'alphonso', actionType: 'execute_command', riskLevel: 'critical' },
      { summary: 'Sentinel blocked execute_command', resultState: 'completed', artifacts: [] }
    );
    expect(result.blocked).toBe(true);
  });

  it('blocks when sentinel artifact is blocked', () => {
    const result = shouldBlock(
      { agent: 'miya', actionType: 'external_publish', riskLevel: 'high' },
      {
        summary: 'Review completed',
        resultState: 'completed',
        artifacts: [{ type: 'security_check', status: 'blocked' }]
      }
    );
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('artifact_blocked');
  });

  it('does not block when sentinel only has sentinel_state alert', () => {
    const result = shouldBlock(
      { agent: 'marcus', actionType: 'external_publish', riskLevel: 'high' },
      { summary: 'Review completed', resultState: 'failed', artifacts: [] }
    );
    expect(result.blocked).toBe(false);
  });

  it('returns reason string with agent and action info', () => {
    const result = shouldBlock(
      { agent: 'marcus', actionType: 'external_publish', riskLevel: 'critical' },
      { summary: 'Sentinel denied the request', resultState: 'completed', artifacts: [] }
    );
    expect(result.blocked).toBe(true);
    expect(result.reason).toBeTruthy();
  });
});

describe('getGateStatus', () => {
  beforeEach(() => {
    mockGetAgentOutput.mockReset();
  });

  it('returns no_command for null commandId', () => {
    const result = getGateStatus(null);
    expect(result.status).toBe('no_command');
    expect(result.blocked).toBe(false);
    expect(result.sentinelPresent).toBe(false);
  });

  it('returns no_sentinel_output when sentinel has no output', () => {
    mockGetAgentOutput.mockReturnValue(null);
    const result = getGateStatus('cmd-1');
    expect(result.status).toBe('no_sentinel_output');
    expect(result.blocked).toBe(false);
    expect(result.sentinelPresent).toBe(false);
  });

  it('returns clear when sentinel output has no alerts', () => {
    mockGetAgentOutput.mockReturnValue({
      summary: 'Sentinel completed safety review. All clear.',
      resultState: 'completed',
      artifacts: []
    });
    const result = getGateStatus('cmd-1');
    expect(result.status).toBe('clear');
    expect(result.blocked).toBe(false);
    expect(result.sentinelPresent).toBe(true);
    expect(result.alertCount).toBe(0);
  });

  it('returns blocked when sentinel output has alerts', () => {
    mockGetAgentOutput.mockReturnValue({
      summary: 'Sentinel blocked the assignment',
      resultState: 'completed',
      artifacts: []
    });
    const result = getGateStatus('cmd-1');
    expect(result.status).toBe('blocked');
    expect(result.blocked).toBe(true);
    expect(result.sentinelPresent).toBe(true);
    expect(result.alertCount).toBeGreaterThan(0);
  });

  it('returns alert details', () => {
    mockGetAgentOutput.mockReturnValue({
      summary: 'Sentinel blocked the assignment. Violation detected.',
      resultState: 'completed',
      artifacts: []
    });
    const result = getGateStatus('cmd-1');
    expect(result.alerts).toBeDefined();
    expect(Array.isArray(result.alerts)).toBe(true);
    expect(result.alerts.length).toBeGreaterThanOrEqual(1);
  });
});
