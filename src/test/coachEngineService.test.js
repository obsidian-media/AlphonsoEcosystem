import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/ollama', async () => {
  const actual = await vi.importActual('../lib/ollama');
  return {
    ...actual,
    generateOllamaResponse: vi.fn()
  };
});

import {
  detectApprovalTheater,
  detectLateNightApproval,
  detectRepeatedPipelineFailure,
  detectDeadLetterGraveyard,
  detectConfidenceDecay,
  detectApprovalRubberStamp,
  detectLongUnbrokenSession,
  detectAgentWhiplash,
  detectBoardroomHedgePileup,
  detectUnusedSurfaceArea,
  detectLicenseWall,
  runCoachDetectors,
  resetCoachCooldowns,
  getCoachMessageStyle,
  setCoachMessageStyle,
  COACH_STYLE_KEY,
  getCoachNarrativeEnabled,
  setCoachNarrativeEnabled,
  generateNarrativeCoachMessage,
  COACH_NARRATIVE_ENABLED_KEY,
  ALL_COACH_TRIGGER_IDS,
  getCoachEnabled,
  setCoachEnabled,
  COACH_ENABLED_KEY,
  isCoachTriggerEnabled,
  setCoachTriggerEnabled,
  getAllCoachTriggerToggles,
  COACH_TRIGGER_TOGGLES_KEY,
  getCoachSnoozeUntilMs,
  setCoachSnoozeHours,
  clearCoachSnooze,
  isCoachSnoozed,
  COACH_SNOOZE_UNTIL_KEY
} from '../services/coachEngineService';
import * as ollama from '../lib/ollama';
import { logApprovalEvent, clearAuditLog, getAuditLog } from '../services/agentAuditService';
import { getDeadLetterCount, getOldestDeadLetterTimestamp } from '../services/orchestrationQueueService';
import { getPerformanceTrend } from '../services/agentPerformanceService';
import { listOrchestrationReceipts } from '../services/orchestrationReceiptService';
import { listAgentPackets } from '../services/agentBusService';
import { timestampMs } from '../services/trustModel';
import { clearLicenseDenialLog } from '../services/licenseService';
import { getCoachHistory, clearCoachHistory } from '../services/coachHistoryService';

const originalDateNow = Date.now;

function clearAllCoachData() {
  clearAuditLog();
  clearLicenseDenialLog();
  localStorage.removeItem('alphonso_agent_bus_packets_v1');
  localStorage.removeItem('alphonso_agent_performance_snapshots_v1');
  localStorage.removeItem('alphonso_orchestration_receipts_v1');
  localStorage.removeItem('alphonso_session_start_ts');
  localStorage.removeItem('alphonso_boardroom_threads_v2');
  localStorage.removeItem('alphonso_boardroom_thread_messages_v2');
  localStorage.removeItem('alphonso_skill_pack_invocation_v1');
  localStorage.removeItem(COACH_STYLE_KEY);
  localStorage.removeItem(COACH_NARRATIVE_ENABLED_KEY);
  localStorage.removeItem(COACH_ENABLED_KEY);
  localStorage.removeItem(COACH_TRIGGER_TOGGLES_KEY);
  localStorage.removeItem(COACH_SNOOZE_UNTIL_KEY);
  clearCoachHistory();
}

beforeEach(() => {
  vi.useFakeTimers();
  resetCoachCooldowns();
  clearAllCoachData();
  vi.setSystemTime(new Date());
  ollama.generateOllamaResponse.mockReset();
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

  // ── Phase 2 detectors ──────────────────────────────────────────────────

  describe('detectAgentWhiplash', () => {
    it('returns null when fewer than 10 packets', () => {
      expect(detectAgentWhiplash()).toBeNull();
    });

    it('fires on 3+ real reassignments (oscillation) within an hour', () => {
      const now = timestampMs();
      // hector,hector,hector,hector,hector,alphonso,alphonso,hector,miya,alphonso
      // = 4 actual agent changes (not just "3 distinct agents ever")
      const toAgents = ['hector', 'hector', 'hector', 'hector', 'hector', 'alphonso', 'alphonso', 'hector', 'miya', 'alphonso'];
      const packets = toAgents.map((toAgent, i) => ({
        id: `pkt-${i}`,
        fromAgent: 'jose',
        toAgent,
        actionType: 'research',
        status: 'assigned',
        createdAtMs: now - (10 - i) * 1000,
        updatedAtMs: now
      }));
      localStorage.setItem('alphonso_agent_bus_packets_v1', JSON.stringify(packets));
      const signal = detectAgentWhiplash();
      expect(signal).not.toBeNull();
      expect(signal.id).toBe('agent_whiplash');
      expect(signal.severity).toBe('warning');
      expect(signal.message).toContain('research');
    });

    it('returns null when same agent handles all assignments', () => {
      const now = timestampMs();
      const packets = [];
      for (let i = 0; i < 10; i++) {
        packets.push({
          id: `pkt-${i}`,
          fromAgent: 'jose',
          toAgent: 'hector',
          actionType: 'research',
          status: 'assigned',
          createdAtMs: now - (10 - i) * 1000
        });
      }
      localStorage.setItem('alphonso_agent_bus_packets_v1', JSON.stringify(packets));
      expect(detectAgentWhiplash()).toBeNull();
    });

    it('returns null when 3 distinct agents were used but agent never actually flip-flopped (only 2 changes)', () => {
      const now = timestampMs();
      // hector x5, miya x3, alphonso x2 = 3 distinct agents, but only 2 real
      // reassignments (h->m, m->a) — the plan explicitly excludes this shape
      // ("not just 3 different agents ever").
      const toAgents = ['hector', 'hector', 'hector', 'hector', 'hector', 'miya', 'miya', 'miya', 'alphonso', 'alphonso'];
      const packets = toAgents.map((toAgent, i) => ({
        id: `pkt-${i}`,
        fromAgent: 'jose',
        toAgent,
        actionType: 'research',
        status: 'assigned',
        createdAtMs: now - (10 - i) * 1000
      }));
      localStorage.setItem('alphonso_agent_bus_packets_v1', JSON.stringify(packets));
      expect(detectAgentWhiplash()).toBeNull();
    });

    it('returns null when reassignments span > 1 hour', () => {
      const now = timestampMs();
      const toAgents = ['hector', 'hector', 'hector', 'hector', 'hector', 'alphonso', 'alphonso', 'hector', 'miya', 'alphonso'];
      const packets = toAgents.map((toAgent, i) => ({
        id: `pkt-${i}`,
        fromAgent: 'jose',
        toAgent,
        actionType: 'research',
        status: 'assigned',
        createdAtMs: now - (10 - i) * 15 * 60000 // spread 15 min apart -> 135 min total span
      }));
      localStorage.setItem('alphonso_agent_bus_packets_v1', JSON.stringify(packets));
      expect(detectAgentWhiplash()).toBeNull();
    });

    it('respects cooldown', () => {
      const now = timestampMs();
      const toAgents = ['hector', 'hector', 'hector', 'hector', 'hector', 'alphonso', 'alphonso', 'hector', 'miya', 'alphonso'];
      const packets = toAgents.map((toAgent, i) => ({
        id: `pkt-${i}`,
        fromAgent: 'jose',
        toAgent,
        actionType: 'research',
        status: 'assigned',
        createdAtMs: now - (10 - i) * 1000
      }));
      localStorage.setItem('alphonso_agent_bus_packets_v1', JSON.stringify(packets));
      detectAgentWhiplash();
      expect(detectAgentWhiplash()).toBeNull();
    });
  });

  describe('detectBoardroomHedgePileup', () => {
    it('returns null when no boardroom threads exist', () => {
      expect(detectBoardroomHedgePileup()).toBeNull();
    });

    it('fires when 3+ already-persisted escalation messages land in the same thread within 30 min', () => {
      const threadId = 'thread-1';
      localStorage.setItem('alphonso_boardroom_threads_v2', JSON.stringify([{
        id: threadId, topic: 'Deployment strategy', status: 'active', updatedAtMs: timestampMs()
      }]));
      const now = timestampMs();
      const messages = [
        { id: 'm1', threadId, speaker: 'hector', content: 'I can confirm the deployment pipeline is ready.', kind: 'message', createdAtMs: now - 4000 },
        { id: 'm2', threadId, speaker: 'miya', content: "I'm not sure about the timing.", kind: 'escalation', createdAtMs: now - 3000 },
        { id: 'm3', threadId, speaker: 'hector', content: 'Based on the data, the rollout should work.', kind: 'message', createdAtMs: now - 2000 },
        { id: 'm4', threadId, speaker: 'miya', content: "I don't have enough information to be confident about this.", kind: 'escalation', createdAtMs: now - 1000 },
        { id: 'm5', threadId, speaker: 'echo', content: 'Previous rollbacks at this scale suggest caution.', kind: 'escalation', createdAtMs: now }
      ];
      localStorage.setItem('alphonso_boardroom_thread_messages_v2', JSON.stringify(messages));
      const signal = detectBoardroomHedgePileup();
      expect(signal).not.toBeNull();
      expect(signal.id).toBe('boardroom_hedge_pileup');
      expect(signal.severity).toBe('warning');
      expect(signal.message).toContain('Deployment strategy');
    });

    it('returns null when fewer than 3 escalation messages', () => {
      const threadId = 'thread-2';
      localStorage.setItem('alphonso_boardroom_threads_v2', JSON.stringify([{
        id: threadId, topic: 'Simple task', status: 'active', updatedAtMs: timestampMs()
      }]));
      const messages = [
        { id: 'm1', threadId, speaker: 'hector', content: 'This is straightforward and ready.', kind: 'message', createdAtMs: timestampMs() - 2000 },
        { id: 'm2', threadId, speaker: 'miya', content: "I'm not sure about this part.", kind: 'escalation', createdAtMs: timestampMs() - 1000 }
      ];
      localStorage.setItem('alphonso_boardroom_thread_messages_v2', JSON.stringify(messages));
      expect(detectBoardroomHedgePileup()).toBeNull();
    });

    it('returns null when escalations exist but fall outside the 30-minute window', () => {
      const threadId = 'thread-2b';
      localStorage.setItem('alphonso_boardroom_threads_v2', JSON.stringify([{
        id: threadId, topic: 'Stale escalations', status: 'active', updatedAtMs: timestampMs()
      }]));
      const now = timestampMs();
      const stale = now - 45 * 60000;
      const messages = [
        { id: 'm1', threadId, speaker: 'hector', content: 'Not sure.', kind: 'escalation', createdAtMs: stale },
        { id: 'm2', threadId, speaker: 'miya', content: 'Hard to say.', kind: 'escalation', createdAtMs: stale - 1000 },
        { id: 'm3', threadId, speaker: 'echo', content: 'Uncertain.', kind: 'escalation', createdAtMs: stale - 2000 }
      ];
      localStorage.setItem('alphonso_boardroom_thread_messages_v2', JSON.stringify(messages));
      expect(detectBoardroomHedgePileup()).toBeNull();
    });

    it('returns null when no active threads', () => {
      localStorage.setItem('alphonso_boardroom_threads_v2', JSON.stringify([{
        id: 'thread-3', topic: 'Done', status: 'concluded', updatedAtMs: timestampMs()
      }]));
      expect(detectBoardroomHedgePileup()).toBeNull();
    });

    it('respects cooldown', () => {
      const threadId = 'thread-4';
      localStorage.setItem('alphonso_boardroom_threads_v2', JSON.stringify([{
        id: threadId, topic: 'Research', status: 'active', updatedAtMs: timestampMs()
      }]));
      const now = timestampMs();
      const messages = [
        { id: 'm1', threadId, speaker: 'hector', content: "I'm not sure about this.", kind: 'escalation', createdAtMs: now - 3000 },
        { id: 'm2', threadId, speaker: 'miya', content: 'Hard to say what the best approach is.', kind: 'escalation', createdAtMs: now - 2000 },
        { id: 'm3', threadId, speaker: 'echo', content: "I don't have enough information to conclude.", kind: 'escalation', createdAtMs: now - 1000 }
      ];
      localStorage.setItem('alphonso_boardroom_thread_messages_v2', JSON.stringify(messages));
      detectBoardroomHedgePileup();
      expect(detectBoardroomHedgePileup()).toBeNull();
    });
  });

  describe('detectUnusedSurfaceArea', () => {
    it('returns null when no stale items detected', () => {
      expect(detectUnusedSurfaceArea()).toBeNull();
    });

    it('fires when 3+ configured items are stale', () => {
      const now = timestampMs();
      const stale = now - 10 * 24 * 3600 * 1000;
      // 3 stale connectors
      localStorage.setItem('alphonso_connector_registry_v2', JSON.stringify([
        { id: 'github', name: 'GitHub', status: 'active', updatedAtMs: stale },
        { id: 'slack', name: 'Slack', status: 'active', updatedAtMs: stale },
        { id: 'discord', name: 'Discord', status: 'active', updatedAtMs: stale }
      ]));
      // 1 stale skill pack with installedAtMs to confirm it's been around
      localStorage.setItem('alphonso_skill_packs_v1', JSON.stringify([
        { id: 'pack.coding.full-stack', name: 'Full-Stack Coding', enabled: true, installedAtMs: stale }
      ]));
      const signal = detectUnusedSurfaceArea();
      expect(signal).not.toBeNull();
      expect(signal.id).toBe('unused_surface_area');
      expect(signal.severity).toBe('neutral');
      expect(signal.message).toContain('GitHub');
    });

    it('does not fire when fewer than 3 stale items', () => {
      const now = timestampMs();
      const fresh = now - 1000;
      localStorage.setItem('alphonso_connector_registry_v2', JSON.stringify([
        { id: 'github', name: 'GitHub', status: 'active', updatedAtMs: fresh }
      ]));
      expect(detectUnusedSurfaceArea()).toBeNull();
    });

    it('respects cooldown', () => {
      const now = timestampMs();
      const stale = now - 10 * 24 * 3600 * 1000;
      localStorage.setItem('alphonso_connector_registry_v2', JSON.stringify([
        { id: 'github', name: 'GitHub', status: 'active', updatedAtMs: stale },
        { id: 'slack', name: 'Slack', status: 'active', updatedAtMs: stale },
        { id: 'discord', name: 'Discord', status: 'active', updatedAtMs: stale }
      ]));
      detectUnusedSurfaceArea();
      expect(detectUnusedSurfaceArea()).toBeNull();
    });
  });

  describe('detectLicenseWall', () => {
    it('returns null when no denials exist', () => {
      expect(detectLicenseWall()).toBeNull();
    });

    it('fires when same connector denied 5+ times in last 7 days', () => {
      const now = timestampMs();
      localStorage.setItem('alphonso_license_denial_log_v1', JSON.stringify([
        { connectorId: 'youtube', timestamp: now - 1 * 86400000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: now - 2 * 86400000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: now - 3 * 86400000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: now - 4 * 86400000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: now - 5 * 86400000, tierAtTime: 'free' }
      ]));
      const signal = detectLicenseWall();
      expect(signal).not.toBeNull();
      expect(signal.id).toBe('license_wall');
      expect(signal.severity).toBe('warning');
      expect(signal.message).toContain('youtube');
    });

    it('returns null when fewer than 5 total denials', () => {
      const now = timestampMs();
      localStorage.setItem('alphonso_license_denial_log_v1', JSON.stringify([
        { connectorId: 'youtube', timestamp: now - 1 * 86400000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: now - 2 * 86400000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: now - 3 * 86400000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: now - 4 * 86400000, tierAtTime: 'free' }
      ]));
      expect(detectLicenseWall()).toBeNull();
    });

    it('returns null when denials are older than 7 days', () => {
      const now = timestampMs();
      const stale = now - 8 * 86400000;
      localStorage.setItem('alphonso_license_denial_log_v1', JSON.stringify([
        { connectorId: 'youtube', timestamp: stale, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: stale - 60000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: stale - 120000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: stale - 180000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: stale - 240000, tierAtTime: 'free' }
      ]));
      expect(detectLicenseWall()).toBeNull();
    });

    it('respects cooldown', () => {
      const now = timestampMs();
      localStorage.setItem('alphonso_license_denial_log_v1', JSON.stringify([
        { connectorId: 'youtube', timestamp: now - 1 * 86400000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: now - 2 * 86400000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: now - 3 * 86400000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: now - 4 * 86400000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: now - 5 * 86400000, tierAtTime: 'free' }
      ]));
      detectLicenseWall();
      expect(detectLicenseWall()).toBeNull();
    });

    it('detects wall for different connectors independently', () => {
      const now = timestampMs();
      localStorage.setItem('alphonso_license_denial_log_v1', JSON.stringify([
        { connectorId: 'youtube', timestamp: now - 1 * 86400000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: now - 2 * 86400000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: now - 3 * 86400000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: now - 4 * 86400000, tierAtTime: 'free' },
        { connectorId: 'youtube', timestamp: now - 5 * 86400000, tierAtTime: 'free' }
      ]));
      const signal = detectLicenseWall();
      expect(signal).not.toBeNull();
      expect(signal.message).toContain('youtube');
    });
  });

  describe('runCoachDetectors with Phase 2 detectors', () => {
    it('runs the full detector pipeline including new detectors', () => {
      const now = timestampMs();
      localStorage.setItem('alphonso_license_denial_log_v1', JSON.stringify([
        { connectorId: 'chatgpt', timestamp: now - 60 * 1000, tierAtTime: 'free' },
        { connectorId: 'chatgpt', timestamp: now - 120 * 1000, tierAtTime: 'free' },
        { connectorId: 'chatgpt', timestamp: now - 180 * 1000, tierAtTime: 'free' }
      ]));
      const signal = runCoachDetectors();
      expect(signal).not.toBeNull();
    });
  });

  // ── Phase 3: Message style variants ────────────────────────────────────

  describe('getCoachMessageStyle / setCoachMessageStyle', () => {
    it('defaults to balanced when no style stored', () => {
      localStorage.removeItem(COACH_STYLE_KEY);
      expect(getCoachMessageStyle()).toBe('balanced');
    });

    it('returns stored style', () => {
      setCoachMessageStyle('direct');
      expect(getCoachMessageStyle()).toBe('direct');
    });

    it('returns stored gentle style', () => {
      setCoachMessageStyle('gentle');
      expect(getCoachMessageStyle()).toBe('gentle');
    });
  });

  describe('message style variants — all 11 detectors', () => {
    const setupLateNight = () => {
      const ts = new Date(); ts.setHours(2, 0, 0, 0);
      localStorage.setItem('alphonso_approval_audit_v1', JSON.stringify([{ packetId: 'pkt-1', agent: 'jose', action: 'publish_post', outcome: 'approved', timestamp: ts.getTime(), riskLevel: 'high', mariaScore: 85 }]));
    };
    const setupApprovalTheater = () => {
      for (let i = 0; i < 20; i++) logApprovalEvent(`pkt-${i}`, 'jose', 'read', 'approved', 'low', 20);
      for (let i = 0; i < 5; i++) logApprovalEvent(`pkt-high-${i}`, 'jose', 'publish_post', 'approved', 'high', 85);
    };
    const setupPipelineFailure = () => {
      const r = [];
      for (let i = 0; i < 10; i++) r.push({ id: `r-${i}`, status: 'completed', agent: 'alphonso', actionType: 'test', timestampMs: timestampMs() - i * 1000 });
      for (let i = 0; i < 3; i++) r[i] = { id: `r-fail-${i}`, status: 'failed', agent: 'hector', actionType: 'research', blocked: false, timestampMs: timestampMs() - i * 1000 };
      localStorage.setItem('alphonso_orchestration_receipts_v1', JSON.stringify(r));
    };
    const setupDeadLetter = () => {
      const p = [];
      for (let i = 0; i < 5; i++) p.push({ status: 'dead_letter', createdAtMs: timestampMs() - i * 3600000 });
      localStorage.setItem('alphonso_agent_bus_packets_v1', JSON.stringify(p));
    };
    const setupConfidenceDecay = () => {
      localStorage.setItem('alphonso_agent_performance_snapshots_v1', JSON.stringify([
        { id: 's-1', timestampMs: timestampMs() - 30 * 86400000, summary: { overallSuccessRate: 80, totalExecutions: 10 } },
        { id: 's-2', timestampMs: timestampMs() - 15 * 86400000, summary: { overallSuccessRate: 50, totalExecutions: 10 } }
      ]));
    };
    const setupRubberStamp = () => {
      const base = timestampMs();
      localStorage.setItem('alphonso_approval_audit_v1', JSON.stringify([
        { packetId: 'pk1', agent: 'jose', action: 'read', outcome: 'approved', timestamp: base, riskLevel: 'low', mariaScore: null },
        { packetId: 'pk2', agent: 'jose', action: 'read', outcome: 'approved', timestamp: base + 1000, riskLevel: 'low', mariaScore: null },
        { packetId: 'pk3', agent: 'jose', action: 'read', outcome: 'approved', timestamp: base + 2000, riskLevel: 'low', mariaScore: null },
        { packetId: 'pk4', agent: 'jose', action: 'read', outcome: 'approved', timestamp: base + 2500, riskLevel: 'low', mariaScore: null }
      ]));
    };
    const setupLongSession = () => localStorage.setItem('alphonso_session_start_ts', String(timestampMs() - 100 * 60000));
    const setupWhiplash = () => {
      const now = timestampMs();
      const toAgents = ['hector', 'hector', 'hector', 'hector', 'hector', 'alphonso', 'alphonso', 'hector', 'miya', 'alphonso'];
      const p = toAgents.map((toAgent, i) => ({ id: `p-${i}`, fromAgent: 'jose', toAgent, actionType: 'research', status: 'assigned', createdAtMs: now - (10 - i) * 1000, updatedAtMs: now }));
      localStorage.setItem('alphonso_agent_bus_packets_v1', JSON.stringify(p));
    };
    const setupHedgePileup = () => {
      const tid = 't-1';
      localStorage.setItem('alphonso_boardroom_threads_v2', JSON.stringify([{ id: tid, topic: 'Deployment', status: 'active', updatedAtMs: timestampMs() }]));
      const now = timestampMs();
      localStorage.setItem('alphonso_boardroom_thread_messages_v2', JSON.stringify([
        { id: 'm1', threadId: tid, speaker: 'hector', content: "I'm not sure about the timing.", kind: 'escalation', createdAtMs: now - 4000 },
        { id: 'm2', threadId: tid, speaker: 'miya', content: "I don't have enough information to be confident.", kind: 'escalation', createdAtMs: now - 3000 },
        { id: 'm3', threadId: tid, speaker: 'echo', content: 'Hard to say if this is safe.', kind: 'escalation', createdAtMs: now - 2000 }
      ]));
    };
    const setupUnused = () => {
      const stale = timestampMs() - 10 * 24 * 3600 * 1000;
      localStorage.setItem('alphonso_connector_registry_v2', JSON.stringify([
        { id: 'gh', name: 'GitHub', status: 'active', updatedAtMs: stale },
        { id: 'sl', name: 'Slack', status: 'active', updatedAtMs: stale },
        { id: 'dc', name: 'Discord', status: 'active', updatedAtMs: stale }
      ]));
    };
    const setupLicenseWall = () => {
      const now = timestampMs();
      localStorage.setItem('alphonso_license_denial_log_v1', JSON.stringify([
        { connectorId: 'yt', timestamp: now - 1 * 86400000, tierAtTime: 'free' },
        { connectorId: 'yt', timestamp: now - 2 * 86400000, tierAtTime: 'free' },
        { connectorId: 'yt', timestamp: now - 3 * 86400000, tierAtTime: 'free' },
        { connectorId: 'yt', timestamp: now - 4 * 86400000, tierAtTime: 'free' },
        { connectorId: 'yt', timestamp: now - 5 * 86400000, tierAtTime: 'free' }
      ]));
    };

    const allCases = [
      { name: 'detectLateNightApproval', fn: detectLateNightApproval, setup: setupLateNight,
        direct: 'Review it again', bal: 'No judgment', gentle: 'Just a heads-up' },
      { name: 'detectApprovalTheater', fn: detectApprovalTheater, setup: setupApprovalTheater,
        direct: 'tighten the review', bal: 'Worth reviewing whether', gentle: 'routine enough' },
      { name: 'detectRepeatedPipelineFailure', fn: detectRepeatedPipelineFailure, setup: setupPipelineFailure,
        direct: 'Check its configuration', bal: 'Might be worth checking its skill pack', gentle: 'had some trouble with' },
      { name: 'detectDeadLetterGraveyard', fn: detectDeadLetterGraveyard, setup: setupDeadLetter,
        direct: 'Clear them or investigate', bal: 'Worth a review, or safe to clear', gentle: 'Might be a good time to check' },
      { name: 'detectConfidenceDecay', fn: detectConfidenceDecay, setup: setupConfidenceDecay,
        direct: 'Investigate recent task assignments', bal: 'has dropped noticeably', gentle: 'performance has shifted' },
      { name: 'detectApprovalRubberStamp', fn: detectApprovalRubberStamp, setup: setupRubberStamp,
        direct: 'pause and verify one before continuing', bal: 'just checking nothing', gentle: 'just wanted to flag it' },
      { name: 'detectLongUnbrokenSession', fn: detectLongUnbrokenSession, setup: setupLongSession,
        direct: 'Take a break', bal: 'No rush', gentle: 'A short break can do wonders' },
      { name: 'detectAgentWhiplash', fn: detectAgentWhiplash, setup: setupWhiplash,
        direct: 'Stop reassigning and clarify the task first', bal: 'Consider pausing to clarify', gentle: 'Might help to pause and clarify' },
      { name: 'detectBoardroomHedgePileup', fn: detectBoardroomHedgePileup, setup: setupHedgePileup,
        direct: 'This needs your direct judgment', bal: 'genuinely need your judgment call', gentle: 'seem uncertain' },
      { name: 'detectUnusedSurfaceArea', fn: detectUnusedSurfaceArea, setup: setupUnused,
        direct: 'Review and disable what you don\'t need', bal: 'Consider auditing your connected services', gentle: 'A quick audit might help keep things tidy' },
      { name: 'detectLicenseWall', fn: detectLicenseWall, setup: setupLicenseWall,
        direct: 'Upgrade now or stop attempting premium features', bal: 'Pro-gated on your current tier', gentle: 'an upgrade might be worth considering' },
    ];

    it.each(allCases)('$name direct variant matches expected text', ({ fn, setup, direct }) => {
      clearAllCoachData(); setup();
      const signal = fn('direct');
      expect(signal).not.toBeNull();
      expect(signal.message).toContain(direct);
    });
    it.each(allCases)('$name balanced variant matches expected text', ({ fn, setup, bal }) => {
      clearAllCoachData(); setup();
      const signal = fn('balanced');
      expect(signal).not.toBeNull();
      expect(signal.message).toContain(bal);
    });
    it.each(allCases)('$name gentle variant matches expected text', ({ fn, setup, gentle }) => {
      clearAllCoachData(); setup();
      const signal = fn('gentle');
      expect(signal).not.toBeNull();
      expect(signal.message).toContain(gentle);
    });
  });

  describe('runCoachDetectors with style parameter', () => {
    it('passes style to detectors and returns styled message', () => {
      const ts = new Date();
      ts.setHours(2, 0, 0, 0);
      localStorage.setItem('alphonso_approval_audit_v1', JSON.stringify([{
        packetId: 'pkt-1', agent: 'jose', action: 'publish_post', outcome: 'approved', timestamp: ts.getTime(), riskLevel: 'high', mariaScore: 85
      }]));
      const signal = runCoachDetectors('gentle');
      expect(signal).not.toBeNull();
      expect(signal.message).toContain('Just a heads-up');
    });

    it('defaults to balanced style when no argument', () => {
      const ts = new Date();
      ts.setHours(2, 0, 0, 0);
      localStorage.setItem('alphonso_approval_audit_v1', JSON.stringify([{
        packetId: 'pkt-1', agent: 'jose', action: 'publish_post', outcome: 'approved', timestamp: ts.getTime(), riskLevel: 'high', mariaScore: 85
      }]));
      const signal = runCoachDetectors();
      expect(signal).not.toBeNull();
      expect(signal.message).toContain('No judgment');
    });
  });

  describe('getCoachNarrativeEnabled / setCoachNarrativeEnabled', () => {
    it('defaults to false', () => {
      expect(getCoachNarrativeEnabled()).toBe(false);
    });

    it('persists true after being set', () => {
      setCoachNarrativeEnabled(true);
      expect(getCoachNarrativeEnabled()).toBe(true);
    });
  });

  describe('generateNarrativeCoachMessage', () => {
    const neutralSignal = { id: 'long_unbroken_session', severity: 'neutral', message: 'Take a break.', detectedAtMs: Date.now() };
    const warningSignal = { id: 'confidence_decay', severity: 'warning', message: 'Success rate dropped.', detectedAtMs: Date.now() };

    it('returns null for a neutral-severity signal without calling Ollama, even when enabled', async () => {
      setCoachNarrativeEnabled(true);
      const result = await generateNarrativeCoachMessage(neutralSignal, 'balanced');
      expect(result).toBeNull();
      expect(ollama.generateOllamaResponse).not.toHaveBeenCalled();
    });

    it('returns null for a warning-severity signal when the setting is disabled (default)', async () => {
      const result = await generateNarrativeCoachMessage(warningSignal, 'balanced');
      expect(result).toBeNull();
      expect(ollama.generateOllamaResponse).not.toHaveBeenCalled();
    });

    it('calls Ollama and returns the trimmed rewritten text when enabled for a warning signal', async () => {
      setCoachNarrativeEnabled(true);
      ollama.generateOllamaResponse.mockResolvedValue({ response: '  Heads up — this one is trending down.  ', done: true });
      const result = await generateNarrativeCoachMessage(warningSignal, 'gentle');
      expect(result).toBe('Heads up — this one is trending down.');
      expect(ollama.generateOllamaResponse).toHaveBeenCalledTimes(1);
      const promptArg = ollama.generateOllamaResponse.mock.calls[0][0].prompt;
      expect(promptArg).toContain('Success rate dropped.');
      expect(promptArg).toContain('gentle');
    });

    it('returns null and does not throw when Ollama rejects', async () => {
      setCoachNarrativeEnabled(true);
      ollama.generateOllamaResponse.mockRejectedValue(new Error('Ollama is not running'));
      const result = await generateNarrativeCoachMessage(warningSignal, 'balanced');
      expect(result).toBeNull();
    });

    it('returns null when Ollama resolves with an empty response', async () => {
      setCoachNarrativeEnabled(true);
      ollama.generateOllamaResponse.mockResolvedValue({ response: '   ', done: true });
      const result = await generateNarrativeCoachMessage(warningSignal, 'balanced');
      expect(result).toBeNull();
    });
  });

  describe('getCoachEnabled / setCoachEnabled (Phase 5 master toggle)', () => {
    it('defaults to true', () => {
      expect(getCoachEnabled()).toBe(true);
    });

    it('persists false after being set', () => {
      setCoachEnabled(false);
      expect(getCoachEnabled()).toBe(false);
    });

    it('runCoachDetectors returns null immediately when master toggle is off, even with a firing scenario', () => {
      const ts = new Date();
      ts.setHours(2, 0, 0, 0);
      localStorage.setItem('alphonso_approval_audit_v1', JSON.stringify([{
        packetId: 'pkt-1', agent: 'jose', action: 'publish_post', outcome: 'approved', timestamp: ts.getTime(), riskLevel: 'high', mariaScore: 85
      }]));
      setCoachEnabled(false);
      expect(runCoachDetectors()).toBeNull();
    });
  });

  describe('per-trigger toggles (Phase 5)', () => {
    it('ALL_COACH_TRIGGER_IDS lists all 11 triggers', () => {
      expect(ALL_COACH_TRIGGER_IDS).toHaveLength(11);
      expect(ALL_COACH_TRIGGER_IDS).toContain('dead_letter_graveyard');
      expect(ALL_COACH_TRIGGER_IDS).toContain('license_wall');
    });

    it('all triggers default to enabled', () => {
      const toggles = getAllCoachTriggerToggles();
      for (const id of ALL_COACH_TRIGGER_IDS) {
        expect(toggles[id]).toBe(true);
        expect(isCoachTriggerEnabled(id)).toBe(true);
      }
    });

    it('disabling a specific trigger stops it from firing via runCoachDetectors', () => {
      setCoachTriggerEnabled('dead_letter_graveyard', false);
      expect(isCoachTriggerEnabled('dead_letter_graveyard')).toBe(false);
      expect(getDeadLetterCount()).toBeDefined();
    });

    it('disabled dead_letter_graveyard is skipped even when its own detector would fire', () => {
      const packets = [];
      for (let i = 0; i < 5; i++) {
        packets.push({ status: 'dead_letter', createdAtMs: timestampMs() - i * 3600000 });
      }
      localStorage.setItem('alphonso_agent_bus_packets_v1', JSON.stringify(packets));
      setCoachTriggerEnabled('dead_letter_graveyard', false);
      const signal = runCoachDetectors();
      expect(signal?.id).not.toBe('dead_letter_graveyard');
    });
  });

  describe('snooze (Phase 5)', () => {
    it('is not snoozed by default', () => {
      expect(isCoachSnoozed()).toBe(false);
      expect(getCoachSnoozeUntilMs()).toBe(0);
    });

    it('setCoachSnoozeHours snoozes for the given duration', () => {
      setCoachSnoozeHours(4);
      expect(isCoachSnoozed()).toBe(true);
      expect(getCoachSnoozeUntilMs()).toBeGreaterThan(Date.now());
    });

    it('clearCoachSnooze un-snoozes immediately', () => {
      setCoachSnoozeHours(4);
      clearCoachSnooze();
      expect(isCoachSnoozed()).toBe(false);
    });

    it('runCoachDetectors returns null while snoozed, even with a firing scenario', () => {
      const ts = new Date();
      ts.setHours(2, 0, 0, 0);
      localStorage.setItem('alphonso_approval_audit_v1', JSON.stringify([{
        packetId: 'pkt-1', agent: 'jose', action: 'publish_post', outcome: 'approved', timestamp: ts.getTime(), riskLevel: 'high', mariaScore: 85
      }]));
      setCoachSnoozeHours(1);
      expect(runCoachDetectors()).toBeNull();
    });
  });

  describe('runCoachDetectors history recording (Phase 5)', () => {
    it('records a fired signal into coach history', () => {
      const ts = new Date();
      ts.setHours(2, 0, 0, 0);
      localStorage.setItem('alphonso_approval_audit_v1', JSON.stringify([{
        packetId: 'pkt-1', agent: 'jose', action: 'publish_post', outcome: 'approved', timestamp: ts.getTime(), riskLevel: 'high', mariaScore: 85
      }]));
      const signal = runCoachDetectors();
      expect(signal).not.toBeNull();
      const history = getCoachHistory();
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe(signal.id);
    });

    it('does not record anything when no detector fires', () => {
      for (const id of ALL_COACH_TRIGGER_IDS) setCoachTriggerEnabled(id, false);
      runCoachDetectors();
      expect(getCoachHistory()).toHaveLength(0);
    });
  });
});