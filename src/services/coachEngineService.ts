import { getAuditLog } from './agentAuditService';
import { getDeadLetterCount, getOldestDeadLetterTimestamp } from './orchestrationQueueService';
import { getPerformanceTrend } from './agentPerformanceService';
import { listOrchestrationReceipts } from './orchestrationReceiptService';
import { listAgentPackets } from './agentBusService';
import { timestampMs } from './trustModel';

export interface CoachSignal {
  id: string;
  severity: 'critical' | 'warning' | 'neutral' | 'positive';
  message: string;
  detectedAtMs: number;
}

const COOLDOWN_MS = 15 * 60 * 1000;
const lastFired: Record<string, number> = {};

function canFire(id: string): boolean {
  const now = Date.now();
  const last = lastFired[id] || 0;
  if (now - last < COOLDOWN_MS) return false;
  lastFired[id] = now;
  return true;
}

function makeSignal(id: string, severity: CoachSignal['severity'], message: string): CoachSignal {
  return { id, severity, message, detectedAtMs: timestampMs() };
}

export function detectApprovalTheater(): CoachSignal | null {
  const log = getAuditLog();
  if (log.length < 20) return null;

  const recent = log.slice(-20);
  const highRiskApproved = recent.filter(
    (e) => e.outcome === 'approved' && (e.riskLevel === 'high' || (e.mariaScore != null && e.mariaScore >= 70))
  );
  if (highRiskApproved.length < 5) return null;

  const actionCounts: Record<string, number> = {};
  for (const e of highRiskApproved) {
    actionCounts[e.action] = (actionCounts[e.action] || 0) + 1;
  }
  const repeatedAction = Object.entries(actionCounts).find(([, count]) => count >= 3);
  if (!repeatedAction) return null;

  const [action, count] = repeatedAction;
  if (!canFire('critical_override_pattern')) return null;

  return makeSignal(
    'critical_override_pattern',
    'critical',
    `You've approved ${count} high-risk '${action}' actions recently despite the risk flag each time. Worth reviewing whether this category should just be pre-approved, or whether it needs a closer look.`
  );
}

export function detectLateNightApproval(): CoachSignal | null {
  const log = getAuditLog();
  if (log.length === 0) return null;

  const latest = log[log.length - 1];
  if (latest.outcome !== 'approved') return null;
  if (!latest.riskLevel || latest.riskLevel !== 'high') return null;

  const hour = new Date(latest.timestamp).getHours();
  if (hour < 0 || hour > 5) return null;
  if (!canFire('late_night_approval')) return null;

  return makeSignal(
    'late_night_approval',
    'warning',
    `That was a high-risk approval at ${hour}am. No judgment — just flagging it in case a fresher look tomorrow changes anything.`
  );
}

export function detectRepeatedPipelineFailure(): CoachSignal | null {
  const receipts = listOrchestrationReceipts();
  if (receipts.length < 10) return null;

  const recent = receipts.slice(-10);
  const failuresByAgentAction: Record<string, number> = {};

  for (const r of recent) {
    if (r.status === 'failed' || r.blocked) {
      const key = `${r.agent}::${r.actionType || 'unknown'}`;
      failuresByAgentAction[key] = (failuresByAgentAction[key] || 0) + 1;
    }
  }

  for (const [key, count] of Object.entries(failuresByAgentAction)) {
    if (count >= 3) {
      const [agent, actionType] = key.split('::');
      if (!canFire('repeated_pipeline_failure')) return null;
      return makeSignal(
        'repeated_pipeline_failure',
        'warning',
        `${agent} has failed '${actionType}' ${count} times in a row. Might be worth checking its skill pack or recent output before retrying again.`
      );
    }
  }
  return null;
}

export function detectDeadLetterGraveyard(): CoachSignal | null {
  const count = getDeadLetterCount();
  const oldestTs = getOldestDeadLetterTimestamp();

  if (count < 5 && !oldestTs) return null;

  let message = '';
  if (count >= 5 && oldestTs) {
    const oldestDate = new Date(oldestTs);
    const hoursAgo = Math.floor((Date.now() - oldestDate.getTime()) / 36e5);
    const timeStr = hoursAgo >= 48 ? `${Math.floor(hoursAgo / 24)} days ago` : `${hoursAgo} hours ago`;
    message = `${count} items sitting in the dead-letter queue, oldest from ${timeStr}. Worth a review, or safe to clear?`;
  } else if (count >= 5) {
    message = `${count} items sitting in the dead-letter queue. Worth a review, or safe to clear?`;
  } else if (oldestTs) {
    const oldestDate = new Date(oldestTs);
    const hoursAgo = Math.floor((Date.now() - oldestDate.getTime()) / 36e5);
    const timeStr = hoursAgo >= 48 ? `${Math.floor(hoursAgo / 24)} days ago` : `${hoursAgo} hours ago`;
    message = `Dead-letter queue has items, oldest from ${timeStr}. Worth a review?`;
  }

  if (!canFire('dead_letter_graveyard')) return null;
  return makeSignal('dead_letter_graveyard', count >= 5 ? 'warning' : 'neutral', message);
}

export function detectConfidenceDecay(): CoachSignal | null {
  const agents = ['alphonso', 'jose', 'hector', 'miya', 'maria', 'marcus', 'echo', 'sentinel', 'nova'];

  for (const agent of agents) {
    const trend = getPerformanceTrend(agent, 30);
    if (!trend.ok || trend.trend.length < 2) continue;

    const recent = trend.trend.slice(-1)[0];
    const earlier = trend.trend[0];
    if (!recent || !earlier) continue;

    const recentRate = recent.overallSuccessRate || 0;
    const earlierRate = earlier.overallSuccessRate || 0;
    const drop = earlierRate - recentRate;

    if (drop >= 25 && (recent.totalExecutions || 0) >= 5) {
      if (!canFire('confidence_decay')) return null;
      return makeSignal(
        'confidence_decay',
        'warning',
        `${agent}'s success rate has dropped noticeably over the last 30 days (${Math.round(earlierRate)}% → ${Math.round(recentRate)}%). Might be worth a look at recent tasks or its skill pack.`
      );
    }
  }
  return null;
}

export function detectApprovalRubberStamp(): CoachSignal | null {
  const log = getAuditLog();
  if (log.length < 4) return null;

  const recentApprovals = log.filter((e) => e.outcome === 'approved').slice(-4);
  if (recentApprovals.length < 4) return null;

  for (let i = 1; i < recentApprovals.length; i++) {
    const diff = recentApprovals[i].timestamp - recentApprovals[i - 1].timestamp;
    if (diff >= 3000) return null;
  }

  if (!canFire('approval_rubber_stamp')) return null;
  return makeSignal(
    'approval_rubber_stamp',
    'warning',
    `The last ${recentApprovals.length} approvals went through in under 3s each. If that's a batch of things you already reviewed, ignore this — just checking nothing's getting rubber-stamped.`
  );
}

export function detectLongUnbrokenSession(): CoachSignal | null {
  const sessionStartKey = 'alphonso_session_start_ts';
  let startTs = Number(localStorage.getItem(sessionStartKey) || '0');

  if (!startTs) {
    startTs = Date.now();
    localStorage.setItem(sessionStartKey, String(startTs));
    return null;
  }

  const minutes = Math.floor((Date.now() - startTs) / 60000);
  if (minutes < 90) return null;
  if (!canFire('long_unbroken_session')) return null;

  return makeSignal(
    'long_unbroken_session',
    'neutral',
    `You've been actively driving Alphonso for over ${minutes} minutes straight. No rush — just a nudge to take a break if it's a good moment.`
  );
}

const DETECTORS = [
  detectApprovalTheater,
  detectLateNightApproval,
  detectRepeatedPipelineFailure,
  detectConfidenceDecay,
  detectApprovalRubberStamp,
  detectDeadLetterGraveyard,
  detectLongUnbrokenSession,
];

export function runCoachDetectors(): CoachSignal | null {
  for (const detect of DETECTORS) {
    const signal = detect();
    if (signal) return signal;
  }
  return null;
}

export function resetCoachCooldowns(): void {
  for (const key of Object.keys(lastFired)) {
    delete lastFired[key];
  }
}