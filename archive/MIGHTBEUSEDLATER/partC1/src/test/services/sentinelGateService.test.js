import { describe, it, expect, vi } from 'vitest';
import { evaluateRisk, checkSentinelAlerts, shouldBlock, getGateStatus } from '../../services/sentinelGateService';

vi.mock('../../services/agentOutputStoreService', () => ({
  getAgentOutput: vi.fn((commandId, agent) => {
    if (commandId === 'blocked-cmd') {
      return { summary: 'Blocked due to security breach', resultState: 'completed', artifacts: [{ type: 'security_assessment', status: 'blocked' }] };
    }
    if (commandId === 'clear-cmd') {
      return { summary: 'All clear', resultState: 'completed', artifacts: [] };
    }
    if (commandId === 'failed-cmd') {
      return { summary: 'Analysis failed', resultState: 'failed', artifacts: [] };
    }
    return null;
  })
}));

describe('sentinelGateService', () => {
  describe('evaluateRisk', () => {
    it('returns empty for no assignments', () => {
      const result = evaluateRisk([]);
      expect(result.flagged.length).toBe(0);
    });

    it('flags high risk actions', () => {
      const result = evaluateRisk([{ actionType: 'external_publish', riskLevel: 'high', agent: 'marcus' }]);
      expect(result.highRiskCount).toBe(1);
      expect(result.flagged.length).toBe(1);
    });

    it('flags critical risk level', () => {
      const result = evaluateRisk([{ actionType: 'execute_command', riskLevel: 'critical', agent: 'alphonso' }]);
      expect(result.criticalCount).toBe(1);
    });

    it('does not flag low risk', () => {
      const result = evaluateRisk([{ actionType: 'memory_preservation', riskLevel: 'low', agent: 'echo' }]);
      expect(result.flagged.length).toBe(0);
    });
  });

  describe('checkSentinelAlerts', () => {
    it('returns found=false for no command', () => {
      const result = checkSentinelAlerts(null);
      expect(result.found).toBe(false);
    });

    it('returns found=false for unknown command', () => {
      const result = checkSentinelAlerts('unknown');
      expect(result.found).toBe(false);
    });

    it('detects blocked alerts', () => {
      const result = checkSentinelAlerts('blocked-cmd');
      expect(result.found).toBe(true);
      expect(result.alerts.some(a => a.type === 'artifact_blocked')).toBe(true);
    });

    it('detects failed state', () => {
      const result = checkSentinelAlerts('failed-cmd');
      expect(result.found).toBe(true);
      expect(result.alerts.some(a => a.type === 'sentinel_state')).toBe(true);
    });
  });

  describe('shouldBlock', () => {
    it('does not block low risk', () => {
      const result = shouldBlock({ riskLevel: 'low' }, { summary: 'test' });
      expect(result.blocked).toBe(false);
    });

    it('does not block without sentinel output', () => {
      const result = shouldBlock({ riskLevel: 'high' }, null);
      expect(result.blocked).toBe(false);
    });

    it('blocks when sentinel has blocked artifacts', () => {
      const result = shouldBlock(
        { riskLevel: 'high', actionType: 'execute_command', agent: 'alphonso' },
        { summary: 'blocked', artifacts: [{ status: 'blocked' }], resultState: 'completed' }
      );
      expect(result.blocked).toBe(true);
    });

    it('blocks on summary signal', () => {
      const result = shouldBlock(
        { riskLevel: 'critical', actionType: 'deploy', agent: 'marcus' },
        { summary: 'security_breach detected', artifacts: [], resultState: 'completed' }
      );
      expect(result.blocked).toBe(true);
    });
  });

  describe('getGateStatus', () => {
    it('returns no_command for null commandId', () => {
      const result = getGateStatus(null);
      expect(result.status).toBe('no_command');
    });

    it('returns no_sentinel_output for unknown command', () => {
      const result = getGateStatus('unknown');
      expect(result.status).toBe('no_sentinel_output');
    });

    it('returns blocked for flagged command', () => {
      const result = getGateStatus('blocked-cmd');
      expect(result.status).toBe('blocked');
      expect(result.blocked).toBe(true);
    });

    it('returns clear for clean command', () => {
      const result = getGateStatus('clear-cmd');
      expect(result.status).toBe('clear');
      expect(result.blocked).toBe(false);
    });
  });
});
