import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectApprovalTheater,
  detectLateNightApproval,
  detectRepeatedPipelineFailure,
  detectDeadLetterGraveyard,
  detectConfidenceDecay,
  detectApprovalRubberStamp,
  detectLongUnbrokenSession,
  runCoachDetectors,
  resetCoachCooldowns
} from '../services/coachEngineService';
import { logApprovalEvent, clearAuditLog, getAuditLog } from '../services/agentAuditService';
import { getDeadLetterCount, getOldestDeadLetterTimestamp } from '../services/orchestrationQueueService';
import { getPerformanceTrend } from '../services/agentPerformanceService';
import { listOrchestrationReceipts } from '../services/orchestrationReceiptService';
import { listAgentPackets } from '../services/agentBusService';
import { timestampMs } from '../services/trustModel';

const originalDateNow = Date.now;

function clearAllCoachData() {
  clearAuditLog();
  localStorage.removeItem('alphonso_agent_bus_packets_v1');
  localStorage.removeItem('alphonso_agent_performance_snapshots_v1');
  localStorage.removeItem('alphonso_orchestration_receipts_v1');
  localStorage.removeItem('alphonso_session_start_ts');
}

beforeEach(() => {
  vi.useFakeTimers();
  resetCoachCooldowns();
  clearAllCoachData();
  vi.setSystemTime(new Date());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('coachEngineService', () => {
  describe('detectApprovalTheater', () => {
    it('returns null when audit log has fewer than 20 entries', () => {
      for (let i = 0; i < 10; i++) {
        logApprovalEvent(`pkt-${i}`, 'jose', 'publish_post', 'approved', 'high', 85);
      }
      expect(detectApprovalTheater()).toBeNull();
    });

    it('returns null when fewer than 5 high-risk approvals in last 20', () => {
      for (let i = 0; i < 20; i++) {
        logApprovalEvent(`pkt-${i}`, 'jose', 'read', 'approved', 'low', 20);
      }
      logApprovalEvent('pkt-20', 'jose', 'publish_post', 'approved', 'high', 85);
      expect(detectApprovalTheater()).toBeNull();
    });

    it('fires when 5+ high-risk approvals of same action in last 20', () => {
      for (let i = 0; i < 20; i++) {
        logApprovalEvent(`pkt-${i}`, 'jose', 'read', 'approved', 'low', 20);
      }
      for (let i = 0; i < 5; i++) {
        logApprovalEvent(`pkt-high-${i}`, 'jose', 'publish_post', 'approved', 'high', 85);
      }
      const signal = detectApprovalTheater();
      expect(signal).not.toBeNull();
      expect(signal.id).toBe('critical_override_pattern');
      expect(signal.severity).toBe('critical');
      expect(signal.message).toContain('publish_post');
    });

    it('respects cooldown - does not fire twice within 15 min', () => {
      for (let i = 0; i < 20; i++) {
        logApprovalEvent(`pkt-${i}`, 'jose', 'read', 'approved', 'low', 20);
      }
      for (let i = 0; i < 5; i++) {
        logApprovalEvent(`pkt-high-${i}`, 'jose', 'publish_post', 'approved', 'high', 85);
      }
      detectApprovalTheater();
      expect(detectApprovalTheater()).toBeNull();
    });

    it('uses mariaScore >= 70 as high-risk indicator when riskLevel missing', () => {
      for (let i = 0; i < 20; i++) {
        logApprovalEvent(`pkt-${i}`, 'jose', 'read', 'approved', 'medium', 30);
      }
      for (let i = 0; i < 5; i++) {
        logApprovalEvent(`pkt-high-${i}`, 'jose', 'publish_post', 'approved', 'medium', 85);
      }
      const signal = detectApprovalTheater();
      expect(signal).not.toBeNull();
      expect(signal.id).toBe('critical_override_pattern');
    });
  });

  describe('detectLateNightApproval', () => {
    it('returns null when log is empty', () => {
      expect(detectLateNightApproval()).toBeNull();
    });

    it('returns null when latest outcome is not approved', () => {
      logApprovalEvent('pkt-1', 'jose', 'publish_post', 'denied', 'high', 85);
      expect(detectLateNightApproval()).toBeNull();
    });

    it('returns null when riskLevel is not high', () => {
      logApprovalEvent('pkt-1', 'jose', 'publish_post', 'approved', 'medium', 50);
      expect(detectLateNightApproval()).toBeNull();
    });

    it('fires when latest approved high-risk at 2am', () => {
      const ts = new Date();
      ts.setHours(2, 0, 0, 0);
      localStorage.setItem('alphonso_approval_audit_v1', JSON.stringify([{
        packetId: 'pkt-1', agent: 'jose', action: 'publish_post', outcome: 'approved', timestamp: ts.getTime(), riskLevel: 'high', mariaScore: 85
      }]));
      const signal = detectLateNightApproval();
      expect(signal).not.toBeNull();
      expect(signal.id).toBe('late_night_approval');
      expect(signal.severity).toBe('warning');
      expect(signal.message).toContain('2am');
    });

    it('does not fire at 6am', () => {
      const ts = new Date();
      ts.setHours(6, 0, 0, 0);
      localStorage.setItem('alphonso_approval_audit_v1', JSON.stringify([{
        packetId: 'pkt-1', agent: 'jose', action: 'publish_post', outcome: 'approved', timestamp: ts.getTime(), riskLevel: 'high', mariaScore: 85
      }]));
      expect(detectLateNightApproval()).toBeNull();
    });

    it('respects cooldown', () => {
      const ts = new Date();
      ts.setHours(2, 0, 0, 0);
      localStorage.setItem('alphonso_approval_audit_v1', JSON.stringify([{
        packetId: 'pkt-1', agent: 'jose', action: 'publish_post', outcome: 'approved', timestamp: ts.getTime(), riskLevel: 'high', mariaScore: 85
      }]));
      detectLateNightApproval();
      expect(detectLateNightApproval()).toBeNull();
    });
  });

  describe('detectRepeatedPipelineFailure', () => {
    it('returns null when fewer than 10 receipts', () => {
      expect(detectRepeatedPipelineFailure()).toBeNull();
    });

    it('fires when same agent+action fails 3+ times in last 10', () => {
      // Manually populate localStorage with receipts
      const receipts = [];
      for (let i = 0; i < 10; i++) {
        receipts.push({
          id: `receipt-${i}`,
          status: 'completed',
          agent: 'alphonso',
          actionType: 'test',
          timestampMs: timestampMs() - i * 1000
        });
      }
      for (let i = 0; i < 3; i++) {
        receipts[i] = {
          id: `receipt-fail-${i}`,
          status: 'failed',
          agent: 'hector',
          actionType: 'research',
          blocked: false,
          timestampMs: timestampMs() - i * 1000
        };
      }
      localStorage.setItem('alphonso_orchestration_receipts_v1', JSON.stringify(receipts));
      const signal = detectRepeatedPipelineFailure();
      expect(signal).not.toBeNull();
      expect(signal.id).toBe('repeated_pipeline_failure');
      expect(signal.message).toContain('hector');
      expect(signal.message).toContain('research');
    });

    it('respects cooldown', () => {
      const receipts = [];
      for (let i = 0; i < 10; i++) {
        receipts.push({
          id: `receipt-${i}`,
          status: 'completed',
          agent: 'alphonso',
          actionType: 'test',
          timestampMs: timestampMs() - i * 1000
        });
      }
      for (let i = 0; i < 3; i++) {
        receipts[i] = {
          id: `receipt-fail-${i}`,
          status: 'failed',
          agent: 'hector',
          actionType: 'research',
          blocked: false,
          timestampMs: timestampMs() - i * 1000
        };
      }
      localStorage.setItem('alphonso_orchestration_receipts_v1', JSON.stringify(receipts));
      detectRepeatedPipelineFailure();
      expect(detectRepeatedPipelineFailure()).toBeNull();
    });
  });

  describe('detectDeadLetterGraveyard', () => {
    it('returns null when no dead letters', () => {
      expect(detectDeadLetterGraveyard()).toBeNull();
    });

    it('fires warning when 5+ dead letters', () => {
      const packets = [];
      for (let i = 0; i < 5; i++) {
        packets.push({ status: 'dead_letter', createdAtMs: timestampMs() - i * 3600000 });
      }
      localStorage.setItem('alphonso_agent_bus_packets_v1', JSON.stringify(packets));
      const signal = detectDeadLetterGraveyard();
      expect(signal).not.toBeNull();
      expect(signal.id).toBe('dead_letter_graveyard');
      expect(signal.severity).toBe('warning');
      expect(signal.message).toContain('5');
    });

    it('fires neutral when oldest > 48h even if count < 5', () => {
      const oldTs = new Date(timestampMs() - 49 * 3600000).toISOString();
      const packets = [{ status: 'dead_letter', createdAtMs: new Date(oldTs).getTime() }];
      localStorage.setItem('alphonso_agent_bus_packets_v1', JSON.stringify(packets));
      const signal = detectDeadLetterGraveyard();
      expect(signal).not.toBeNull();
      expect(signal.severity).toBe('neutral');
    });

    it('respects cooldown', () => {
      const packets = [];
      for (let i = 0; i < 5; i++) {
        packets.push({ status: 'dead_letter', createdAtMs: timestampMs() - i * 3600000 });
      }
      localStorage.setItem('alphonso_agent_bus_packets_v1', JSON.stringify(packets));
      detectDeadLetterGraveyard();
      expect(detectDeadLetterGraveyard()).toBeNull();
    });
  });

  describe('detectConfidenceDecay', () => {
    it('returns null when trend data insufficient', () => {
      expect(detectConfidenceDecay()).toBeNull();
    });

    it('fires when success rate drops >= 25pp with min 5 executions', () => {
      const ts = timestampMs();
      const snapshots = [
        { id: 'snap-1', timestampMs: ts - 30 * 86400000, summary: { overallSuccessRate: 80, totalExecutions: 10 } },
        { id: 'snap-2', timestampMs: ts - 15 * 86400000, summary: { overallSuccessRate: 50, totalExecutions: 10 } }
      ];
      localStorage.setItem('alphonso_agent_performance_snapshots_v1', JSON.stringify(snapshots));
      const signal = detectConfidenceDecay();
      expect(signal).not.toBeNull();
      expect(signal.id).toBe('confidence_decay');
      expect(signal.message).toContain("alphonso's");
    });

    it('does not fire when drop < 25pp', () => {
      const ts = timestampMs();
      const snapshots = [
        { id: 'snap-1', timestampMs: ts - 30 * 86400000, summary: { overallSuccessRate: 80, totalExecutions: 10 } },
        { id: 'snap-2', timestampMs: ts - 15 * 86400000, summary: { overallSuccessRate: 60, totalExecutions: 10 } }
      ];
      localStorage.setItem('alphonso_agent_performance_snapshots_v1', JSON.stringify(snapshots));
      expect(detectConfidenceDecay()).toBeNull();
    });

    it('does not fire when sample size < 5', () => {
      const ts = timestampMs();
      const snapshots = [
        { id: 'snap-1', timestampMs: ts - 30 * 86400000, summary: { overallSuccessRate: 80, totalExecutions: 10 } },
        { id: 'snap-2', timestampMs: ts - 15 * 86400000, summary: { overallSuccessRate: 50, totalExecutions: 3 } }
      ];
      localStorage.setItem('alphonso_agent_performance_snapshots_v1', JSON.stringify(snapshots));
      expect(detectConfidenceDecay()).toBeNull();
    });

    it('respects cooldown', () => {
      const ts = timestampMs();
      const snapshots = [
        { id: 'snap-1', timestampMs: ts - 30 * 86400000, summary: { overallSuccessRate: 80, totalExecutions: 10 } },
        { id: 'snap-2', timestampMs: ts - 15 * 86400000, summary: { overallSuccessRate: 50, totalExecutions: 10 } }
      ];
      localStorage.setItem('alphonso_agent_performance_snapshots_v1', JSON.stringify(snapshots));
      detectConfidenceDecay();
      expect(detectConfidenceDecay()).toBeNull();
    });
  });

  describe('detectApprovalRubberStamp', () => {
    it('returns null when fewer than 4 approvals', () => {
      logApprovalEvent('pkt-1', 'jose', 'read', 'approved');
      expect(detectApprovalRubberStamp()).toBeNull();
    });

    it('fires when 4 approvals within 3s each', () => {
      const base = timestampMs();
      const entries = [
        { packetId: 'pkt-1', agent: 'jose', action: 'read', outcome: 'approved', timestamp: base, riskLevel: 'low', mariaScore: null },
        { packetId: 'pkt-2', agent: 'jose', action: 'read', outcome: 'approved', timestamp: base + 1000, riskLevel: 'low', mariaScore: null },
        { packetId: 'pkt-3', agent: 'jose', action: 'read', outcome: 'approved', timestamp: base + 2000, riskLevel: 'low', mariaScore: null },
        { packetId: 'pkt-4', agent: 'jose', action: 'read', outcome: 'approved', timestamp: base + 2500, riskLevel: 'low', mariaScore: null }
      ];
      localStorage.setItem('alphonso_approval_audit_v1', JSON.stringify(entries));
      const signal = detectApprovalRubberStamp();
      expect(signal).not.toBeNull();
      expect(signal.id).toBe('approval_rubber_stamp');
      expect(signal.severity).toBe('warning');
    });

    it('does not fire when gap >= 3s between any', () => {
      const base = timestampMs();
      const entries = [
        { packetId: 'pkt-1', agent: 'jose', action: 'read', outcome: 'approved', timestamp: base, riskLevel: 'low', mariaScore: null },
        { packetId: 'pkt-2', agent: 'jose', action: 'read', outcome: 'approved', timestamp: base + 4000, riskLevel: 'low', mariaScore: null },
        { packetId: 'pkt-3', agent: 'jose', action: 'read', outcome: 'approved', timestamp: base + 5000, riskLevel: 'low', mariaScore: null },
        { packetId: 'pkt-4', agent: 'jose', action: 'read', outcome: 'approved', timestamp: base + 6000, riskLevel: 'low', mariaScore: null }
      ];
      localStorage.setItem('alphonso_approval_audit_v1', JSON.stringify(entries));
      expect(detectApprovalRubberStamp()).toBeNull();
    });

    it('respects cooldown', () => {
      const base = timestampMs();
      const entries = [
        { packetId: 'pkt-1', agent: 'jose', action: 'read', outcome: 'approved', timestamp: base, riskLevel: 'low', mariaScore: null },
        { packetId: 'pkt-2', agent: 'jose', action: 'read', outcome: 'approved', timestamp: base + 1000, riskLevel: 'low', mariaScore: null },
        { packetId: 'pkt-3', agent: 'jose', action: 'read', outcome: 'approved', timestamp: base + 2000, riskLevel: 'low', mariaScore: null },
        { packetId: 'pkt-4', agent: 'jose', action: 'read', outcome: 'approved', timestamp: base + 2500, riskLevel: 'low', mariaScore: null }
      ];
      localStorage.setItem('alphonso_approval_audit_v1', JSON.stringify(entries));
      detectApprovalRubberStamp();
      expect(detectApprovalRubberStamp()).toBeNull();
    });
  });

  describe('detectLongUnbrokenSession', () => {
    it('returns null when session < 90 min', () => {
      localStorage.setItem('alphonso_session_start_ts', String(timestampMs() - 30 * 60000));
      expect(detectLongUnbrokenSession()).toBeNull();
    });

    it('fires neutral when session >= 90 min', () => {
      localStorage.setItem('alphonso_session_start_ts', String(timestampMs() - 100 * 60000));
      const signal = detectLongUnbrokenSession();
      expect(signal).not.toBeNull();
      expect(signal.id).toBe('long_unbroken_session');
      expect(signal.severity).toBe('neutral');
      expect(signal.message).toContain('100');
    });

    it('initializes session start if missing', () => {
      localStorage.removeItem('alphonso_session_start_ts');
      expect(detectLongUnbrokenSession()).toBeNull();
      expect(localStorage.getItem('alphonso_session_start_ts')).not.toBeNull();
    });

    it('respects cooldown', () => {
      localStorage.setItem('alphonso_session_start_ts', String(timestampMs() - 100 * 60000));
      detectLongUnbrokenSession();
      expect(detectLongUnbrokenSession()).toBeNull();
    });
  });

  describe('runCoachDetectors', () => {
    it('returns first firing detector in priority order', () => {
      for (let i = 0; i < 20; i++) {
        logApprovalEvent(`pkt-${i}`, 'jose', 'read', 'approved', 'low', 20);
      }
      for (let i = 0; i < 5; i++) {
        logApprovalEvent(`pkt-high-${i}`, 'jose', 'publish_post', 'approved', 'high', 85);
      }
      const signal = runCoachDetectors();
      expect(signal).not.toBeNull();
      expect(signal.id).toBe('critical_override_pattern');
    });

    it('returns null when no detectors fire', () => {
      clearAllCoachData();
      expect(runCoachDetectors()).toBeNull();
    });
  });

  describe('resetCoachCooldowns', () => {
    it('allows detectors to fire again after reset', () => {
      const base = timestampMs();
      logApprovalEvent('pkt-1', 'jose', 'read', 'approved', 'low', null, base);
      logApprovalEvent('pkt-2', 'jose', 'read', 'approved', 'low', null, base + 1000);
      logApprovalEvent('pkt-3', 'jose', 'read', 'approved', 'low', null, base + 2000);
      logApprovalEvent('pkt-4', 'jose', 'read', 'approved', 'low', null, base + 2500);
      detectApprovalRubberStamp();
      expect(detectApprovalRubberStamp()).toBeNull();
      resetCoachCooldowns();
      expect(detectApprovalRubberStamp()).not.toBeNull();
    });
  });
});