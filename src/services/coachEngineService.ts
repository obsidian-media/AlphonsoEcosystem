import { getAuditLog } from './agentAuditService';
import { getDeadLetterCount, getOldestDeadLetterTimestamp } from './orchestrationQueueService';
import { getPerformanceTrend } from './agentPerformanceService';
import { listOrchestrationReceipts } from './orchestrationReceiptService';
import { listAgentPackets, PACKET_KEY } from './agentBusService';
import { timestampMs } from './trustModel';
import { detectLowConfidence } from './boardroomFacilitatorService';
import { THREADS_KEY, MESSAGES_KEY } from './boardroomThreadService';
import { listConnectors } from './connectors/connectorRegistry';
import { listSkillPacks, getSkillPackLastInvoked } from './skillPackService';
import { getLicenseDenialLog } from './licenseService';

export type MessageStyle = 'direct' | 'balanced' | 'gentle';

export interface CoachSignal {
  id: string;
  severity: 'critical' | 'warning' | 'neutral' | 'positive';
  message: string;
  detectedAtMs: number;
}

const COOLDOWN_MS = 15 * 60 * 1000;
const lastFired: Record<string, number> = {};
export const COACH_STYLE_KEY = 'alphonso_coach_message_style_v1';

function msg(direct: string, balanced: string, gentle: string, style: MessageStyle): string {
  if (style === 'direct') return direct;
  if (style === 'gentle') return gentle;
  return balanced;
}

export function getCoachMessageStyle(): MessageStyle {
  try { 
    const stored = localStorage.getItem(COACH_STYLE_KEY);
    if (stored === 'direct' || stored === 'gentle') return stored;
  } catch { /* ignore */ }
  return 'balanced';
}

export function setCoachMessageStyle(style: MessageStyle): void {
  try { localStorage.setItem(COACH_STYLE_KEY, style); } catch { /* ignore */ }
}

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

export function detectApprovalTheater(style: MessageStyle = 'balanced'): CoachSignal | null {
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

  const d = `You've approved high-risk '${action}' ${count} times. Either pre-approve this category or tighten the review — the current pattern is bypassing safeguards.`;
  const b = `You've approved ${count} high-risk '${action}' actions recently despite the risk flag each time. Worth reviewing whether this category should just be pre-approved, or whether it needs a closer look.`;
  const g = `I noticed you've approved '${action}' ${count} times in high-risk situations. If these are routine enough that the risk check feels redundant, pre-approving the category might save you the extra step. Worth thinking about?`;

  return makeSignal('critical_override_pattern', 'critical', msg(d, b, g, style));
}

export function detectLateNightApproval(style: MessageStyle = 'balanced'): CoachSignal | null {
  const log = getAuditLog();
  if (log.length === 0) return null;

  const latest = log[log.length - 1];
  if (latest.outcome !== 'approved') return null;
  if (!latest.riskLevel || latest.riskLevel !== 'high') return null;

  const hour = new Date(latest.timestamp).getHours();
  if (hour < 0 || hour > 5) return null;
  if (!canFire('late_night_approval')) return null;

  const d = `High-risk approval at ${hour}am. Review it again when you're fresh — late-night decisions tend to look different in the morning.`;
  const b = `That was a high-risk approval at ${hour}am. No judgment — just flagging it in case a fresher look tomorrow changes anything.`;
  const g = `Just a heads-up — there was a high-risk approval at ${hour}am. Things often look different after some rest, so it might be worth taking another look tomorrow. No rush.`;

  return makeSignal('late_night_approval', 'warning', msg(d, b, g, style));
}

export function detectRepeatedPipelineFailure(style: MessageStyle = 'balanced'): CoachSignal | null {
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

      const d = `${agent} failed '${actionType}' ${count} times. Check its configuration or task input before retrying — same approach is unlikely to work.`;
      const b = `${agent} has failed '${actionType}' ${count} times in a row. Might be worth checking its skill pack or recent output before retrying again.`;
      const g = `${agent} has had some trouble with '${actionType}' recently (${count} attempts). A quick look at its skill pack or the task details might help before the next try.`;

      return makeSignal('repeated_pipeline_failure', 'warning', msg(d, b, g, style));
    }
  }
  return null;
}

export function detectDeadLetterGraveyard(style: MessageStyle = 'balanced'): CoachSignal | null {
  const count = getDeadLetterCount();
  const oldestTs = getOldestDeadLetterTimestamp();

  if (count < 5 && !oldestTs) return null;

  let message = '';
  if (count >= 5 && oldestTs) {
    const oldestDate = new Date(oldestTs);
    const hoursAgo = Math.floor((Date.now() - oldestDate.getTime()) / 36e5);
    const timeStr = hoursAgo >= 48 ? `${Math.floor(hoursAgo / 24)} days ago` : `${hoursAgo} hours ago`;

    const d = `${count} tasks stuck in the dead-letter queue since ${timeStr}. Clear them or investigate — stale items accumulate silently.`;
    const b = `${count} items sitting in the dead-letter queue, oldest from ${timeStr}. Worth a review, or safe to clear?`;
    const g = `There are ${count} items in the dead-letter queue, the oldest dating back ${timeStr}. Might be a good time to check whether they need attention or can be safely cleared.`;

    message = msg(d, b, g, style);
  } else if (count >= 5) {
    const d = `${count} tasks stuck in the dead-letter queue. Clear them or investigate before the backlog grows.`;
    const b = `${count} items sitting in the dead-letter queue. Worth a review, or safe to clear?`;
    const g = `Just a heads-up — ${count} items have landed in the dead-letter queue. Might be nothing, but worth a quick check.`;

    message = msg(d, b, g, style);
  } else if (oldestTs) {
    const oldestDate = new Date(oldestTs);
    const hoursAgo = Math.floor((Date.now() - oldestDate.getTime()) / 36e5);
    const timeStr = hoursAgo >= 48 ? `${Math.floor(hoursAgo / 24)} days ago` : `${hoursAgo} hours ago`;

    const d = `Dead-letter queue has items from ${timeStr} that haven't been addressed.`;
    const b = `Dead-letter queue has items, oldest from ${timeStr}. Worth a review?`;
    const g = `Some items in the dead-letter queue date back ${timeStr}. Just a heads-up in case something slipped through.`;

    message = msg(d, b, g, style);
  }

  if (!canFire('dead_letter_graveyard')) return null;
  return makeSignal('dead_letter_graveyard', count >= 5 ? 'warning' : 'neutral', message);
}

export function detectConfidenceDecay(style: MessageStyle = 'balanced'): CoachSignal | null {
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

      const d = `${agent}'s success rate dropped from ${Math.round(earlierRate)}% to ${Math.round(recentRate)}% over 30 days. Investigate recent task assignments or skill pack changes.`;
      const b = `${agent}'s success rate has dropped noticeably over the last 30 days (${Math.round(earlierRate)}% → ${Math.round(recentRate)}%). Might be worth a look at recent tasks or its skill pack.`;
      const g = `${agent}'s performance has shifted over the past month (from ${Math.round(earlierRate)}% to ${Math.round(recentRate)}% success rate). Could be worth checking recent task assignments whenever you have a moment.`;

      return makeSignal('confidence_decay', 'warning', msg(d, b, g, style));
    }
  }
  return null;
}

export function detectApprovalRubberStamp(style: MessageStyle = 'balanced'): CoachSignal | null {
  const log = getAuditLog();
  if (log.length < 4) return null;

  const recentApprovals = log.filter((e) => e.outcome === 'approved').slice(-4);
  if (recentApprovals.length < 4) return null;

  for (let i = 1; i < recentApprovals.length; i++) {
    const diff = recentApprovals[i].timestamp - recentApprovals[i - 1].timestamp;
    if (diff >= 3000) return null;
  }

  if (!canFire('approval_rubber_stamp')) return null;

  const d = `Last ${recentApprovals.length} approvals took under 3s each. You're approving faster than you can read — pause and verify one before continuing.`;
  const b = `The last ${recentApprovals.length} approvals went through in under 3s each. If that's a batch of things you already reviewed, ignore this — just checking nothing's getting rubber-stamped.`;
  const g = `I noticed the last ${recentApprovals.length} approvals were really quick (under 3s each). If you've already reviewed those decisions, no concern — just wanted to flag it in case you meant to take a closer look.`;

  return makeSignal('approval_rubber_stamp', 'warning', msg(d, b, g, style));
}

export function detectLongUnbrokenSession(style: MessageStyle = 'balanced'): CoachSignal | null {
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

  const d = `You've been at this for ${minutes} minutes straight. Take a break — you'll make better decisions after one.`;
  const b = `You've been actively driving Alphonso for over ${minutes} minutes straight. No rush — just a nudge to take a break if it's a good moment.`;
  const g = `It's been ${minutes} minutes since you started your session. A short break can do wonders for focus — whenever it feels right.`;

  return makeSignal('long_unbroken_session', 'neutral', msg(d, b, g, style));
}

// ── Phase 2 detectors ──────────────────────────────────────────────────

export function detectAgentWhiplash(style: MessageStyle = 'balanced'): CoachSignal | null {
  let packets: any[] = [];
  try { packets = JSON.parse(localStorage.getItem(PACKET_KEY) || '[]'); } catch { return null; }
  if (packets.length < 10) return null;

  const recent = packets.slice(-20);
  const actionAgentMap: Record<string, { agent: string; timeMs: number }[]> = {};

  for (const pkt of recent) {
    if (!pkt.actionType || !pkt.toAgent) continue;
    if (!actionAgentMap[pkt.actionType]) actionAgentMap[pkt.actionType] = [];
    actionAgentMap[pkt.actionType].push({ agent: pkt.toAgent, timeMs: pkt.createdAtMs || pkt.updatedAtMs || 0 });
  }

  for (const [actionType, assignments] of Object.entries(actionAgentMap)) {
    if (assignments.length < 3) continue;
    const uniqueAgents = [...new Set(assignments.map((a) => a.agent))];
    if (uniqueAgents.length >= 3) {
      const spanMs = (assignments[assignments.length - 1]?.timeMs || 0) - (assignments[0]?.timeMs || 0);
      if (spanMs < 60000) {
        if (!canFire('agent_whiplash')) return null;

        const d = `'${actionType}' bounced between ${uniqueAgents.join(', ')} ${assignments.length} times in ${Math.round(spanMs / 1000)}s. Stop reassigning and clarify the task first.`;
        const b = `'${actionType}' got bounced between ${uniqueAgents.join(', ')} — ${assignments.length} reassignments in under ${Math.round(spanMs / 1000)}s. Consider pausing to clarify the task definition before routing again.`;
        const g = `I've noticed '${actionType}' has been passed between ${uniqueAgents.join(', ')} a few times in the last ${Math.round(spanMs / 1000)}s. Might help to pause and clarify the task before assigning it again.`;

        return makeSignal('agent_whiplash', 'warning', msg(d, b, g, style));
      }
    }
  }
  return null;
}

export function detectBoardroomHedgePileup(style: MessageStyle = 'balanced'): CoachSignal | null {
  let threads: any[] = [];
  try { threads = JSON.parse(localStorage.getItem(THREADS_KEY) || '[]'); } catch { return null; }
  const activeThreads = threads.filter((t) => t.status === 'active');
  if (activeThreads.length === 0) return null;

  const newestThread = activeThreads.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0))[0];
  if (!newestThread) return null;

  let allMessages: any[] = [];
  try { allMessages = JSON.parse(localStorage.getItem(MESSAGES_KEY) || '[]'); } catch { return null; }
  const threadMessages = allMessages
    .filter((m) => m.threadId === newestThread.id && (m.kind === 'message' || m.kind === 'response'))
    .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));

  const recentMessages = threadMessages.slice(-10);
  const hedgeMessages = recentMessages.filter((m) => detectLowConfidence(m.content || ''));

  if (hedgeMessages.length >= 3) {
    if (!canFire('boardroom_hedge_pileup')) return null;

    const d = `${hedgeMessages.length} agents expressed low confidence in the '${newestThread.topic}' thread. This needs your direct judgment — agents are guessing, not deciding.`;
    const b = `${hedgeMessages.length} messages in the current Boardroom thread ('${newestThread.topic}') contain low-confidence language. The thread might need more context or a facilitator nudge.`;
    const g = `Some participants in the '${newestThread.topic}' Boardroom thread seem uncertain (${hedgeMessages.length} messages with hedged language). A bit more context or a direct decision from you might help move things forward.`;

    return makeSignal('boardroom_hedge_pileup', 'warning', msg(d, b, g, style));
  }
  return null;
}

export function detectUnusedSurfaceArea(style: MessageStyle = 'balanced'): CoachSignal | null {
  const STALE_DAYS = 7;
  const STALE_MS = STALE_DAYS * 24 * 3600 * 1000;
  const now = Date.now();
  const results: string[] = [];

  let connectors: any[] = [];
  try { connectors = listConnectors(); } catch { /* ignore */ }
  const configuredActive = connectors.filter((c) => c.status === 'active' || c.status === 'foundation_only');
  for (const c of configuredActive) {
    const lastUse = c.updatedAtMs || 0;
    if (lastUse > 0 && now - lastUse > STALE_MS) {
      results.push(`connector '${c.name || c.id}'`);
    }
  }

  let packs: any[] = [];
  try { packs = listSkillPacks(); } catch { /* ignore */ }
  const enabledPacks = packs.filter((p) => p.enabled !== false);
  for (const p of enabledPacks) {
    const lastInvoked = getSkillPackLastInvoked(p.id);
    if (!lastInvoked) {
      if (p.installedAtMs && now - p.installedAtMs > STALE_MS) {
        results.push(`skill pack '${p.name || p.id}' (never invoked)`);
      }
    } else if (now - lastInvoked > STALE_MS) {
      results.push(`skill pack '${p.name || p.id}'`);
    }
  }

  if (results.length >= 3) {
    if (!canFire('unused_surface_area')) return null;

    const d = `${results.length} configured resources show no recent use. Review and disable what you don't need: ${results.slice(0, 5).join(', ')}${results.length > 5 ? ` +${results.length - 5} more` : ''}.`;
    const b = `${results.length} configured items show no recent use: ${results.slice(0, 5).join(', ')}${results.length > 5 ? `, and ${results.length - 5} more` : ''}. Consider auditing your connected services and skill packs.`;
    const g = `There are ${results.length} items you've set up that haven't been used lately (${results.slice(0, 5).join(', ')}${results.length > 5 ? ` and ${results.length - 5} others` : ''}). A quick audit might help keep things tidy.`;

    return makeSignal('unused_surface_area', 'neutral', msg(d, b, g, style));
  }
  return null;
}

export function detectLicenseWall(style: MessageStyle = 'balanced'): CoachSignal | null {
  const log = getLicenseDenialLog();
  if (log.length < 3) return null;

  const ONE_HOUR_MS = 3600000;
  const now = Date.now();
  const recent = log.filter((e) => now - e.timestamp < ONE_HOUR_MS);
  if (recent.length < 3) return null;

  const denialCounts: Record<string, number> = {};
  for (const e of recent) {
    denialCounts[e.connectorId] = (denialCounts[e.connectorId] || 0) + 1;
  }

  for (const [connectorId, count] of Object.entries(denialCounts)) {
    if (count >= 3) {
      if (!canFire('license_wall')) return null;

      const d = `'${connectorId}' blocked ${count} times in the last hour by your license tier. Upgrade now or stop attempting premium features.`;
      const b = `'${connectorId}' has been blocked ${count} times in the last hour by your current license tier. If you need this connector regularly, consider upgrading your license.`;
      const g = `It looks like '${connectorId}' was blocked ${count} times this past hour because of your current plan. If it's something you use often, an upgrade might be worth considering.`;

      return makeSignal('license_wall', 'warning', msg(d, b, g, style));
    }
  }
  return null;
}

// ── Detector registration ──────────────────────────────────────────────

const DETECTORS: ((style?: MessageStyle) => CoachSignal | null)[] = [
  detectApprovalTheater,
  detectLateNightApproval,
  detectRepeatedPipelineFailure,
  detectConfidenceDecay,
  detectApprovalRubberStamp,
  detectDeadLetterGraveyard,
  detectLongUnbrokenSession,
  detectAgentWhiplash,
  detectBoardroomHedgePileup,
  detectUnusedSurfaceArea,
  detectLicenseWall,
];

export function runCoachDetectors(style?: MessageStyle): CoachSignal | null {
  const resolvedStyle = style ?? getCoachMessageStyle();
  for (const detect of DETECTORS) {
    const signal = detect(resolvedStyle);
    if (signal) return signal;
  }
  return null;
}

export function resetCoachCooldowns(): void {
  for (const key of Object.keys(lastFired)) {
    delete lastFired[key];
  }
}
