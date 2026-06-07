import { getAgentOutput } from './agentOutputStoreService';

const HIGH_RISK_ACTIONS = [
  'external_publish',
  'purchase',
  'execute_command',
  'filesystem_write',
  'upload',
  'post'
];

const CRITICAL_RISK_SIGNALS = [
  'blocked',
  'denied',
  'violation',
  'unauthorized',
  'critical_risk',
  'security_breach',
  'data_exfiltration'
];

export function evaluateRisk(assignments) {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return { flagged: [], highRiskCount: 0, criticalCount: 0 };
  }
  const flagged = [];
  let highRiskCount = 0;
  let criticalCount = 0;

  for (const assignment of assignments) {
    const action = String(assignment?.actionType || '').toLowerCase();
    const risk = String(assignment?.riskLevel || '').toLowerCase();
    const agent = String(assignment?.agent || '').toLowerCase();
    const reasons = [];

    const isHighRiskAction = HIGH_RISK_ACTIONS.some((prefix) => action.startsWith(prefix) || action.includes(prefix));
    const isHighRiskLevel = risk === 'high' || risk === 'critical';

    if (isHighRiskAction) {
      reasons.push(`action_matches_high_risk_pattern: ${action}`);
    }
    if (isHighRiskLevel) {
      reasons.push(`risk_level_elevated: ${risk}`);
    }

    if (reasons.length > 0) {
      flagged.push({
        agent,
        actionType: assignment.actionType,
        riskLevel: assignment.riskLevel || 'unknown',
        reasons
      });
      highRiskCount += 1;
      if (risk === 'critical' || reasons.some((r) => r.includes('execute_command') || r.includes('filesystem_write'))) {
        criticalCount += 1;
      }
    }
  }

  return { flagged, highRiskCount, criticalCount };
}

export function checkSentinelAlerts(commandId, agentName = 'sentinel') {
  if (!commandId) {
    return { found: false, alerts: [], output: null };
  }
  const sentinelOutput = getAgentOutput(commandId, agentName);
  if (!sentinelOutput) {
    return { found: false, alerts: [], output: null };
  }

  const alerts = [];
  const summary = String(sentinelOutput.summary || '').toLowerCase();
  const artifacts = Array.isArray(sentinelOutput.artifacts) ? sentinelOutput.artifacts : [];
  const resultState = String(sentinelOutput.resultState || '').toLowerCase();

  for (const signal of CRITICAL_RISK_SIGNALS) {
    if (summary.includes(signal)) {
      alerts.push({ type: 'summary_signal', signal });
    }
  }

  for (const artifact of artifacts) {
    const status = String(artifact?.status || '').toLowerCase();
    const type = String(artifact?.type || '').toLowerCase();
    if (status === 'blocked' || status === 'denied' || status === 'violation') {
      alerts.push({ type: 'artifact_blocked', artifactType: type, status });
    }
    if (type.includes('security') && (status === 'flagged' || status === 'alert')) {
      alerts.push({ type: 'security_flag', artifactType: type, status });
    }
  }

  if (resultState === 'failed' || resultState === 'rejected') {
    alerts.push({ type: 'sentinel_state', state: resultState });
  }

  return {
    found: alerts.length > 0,
    alerts,
    output: sentinelOutput
  };
}

export function shouldBlock(assignment, sentinelOutput) {
  if (!assignment) {
    return { blocked: false, reason: '' };
  }

  const risk = String(assignment?.riskLevel || '').toLowerCase();
  const action = String(assignment?.actionType || '').toLowerCase();
  const agent = String(assignment?.agent || '').toLowerCase();

  if (risk !== 'high' && risk !== 'critical') {
    return { blocked: false, reason: '' };
  }

  if (!sentinelOutput) {
    return { blocked: false, reason: '' };
  }

  const summary = String(sentinelOutput.summary || '').toLowerCase();
  const artifacts = Array.isArray(sentinelOutput.artifacts) ? sentinelOutput.artifacts : [];
  const resultState = String(sentinelOutput.resultState || '').toLowerCase();

  const alerts = [];
  for (const signal of CRITICAL_RISK_SIGNALS) {
    if (summary.includes(signal)) {
      alerts.push({ type: 'summary_signal', signal });
    }
  }
  for (const artifact of artifacts) {
    const status = String(artifact?.status || '').toLowerCase();
    const type = String(artifact?.type || '').toLowerCase();
    if (status === 'blocked' || status === 'denied' || status === 'violation') {
      alerts.push({ type: 'artifact_blocked', artifactType: type, status });
    }
    if (type.includes('security') && (status === 'flagged' || status === 'alert')) {
      alerts.push({ type: 'security_flag', artifactType: type, status });
    }
  }
  if (resultState === 'failed' || resultState === 'rejected') {
    alerts.push({ type: 'sentinel_state', state: resultState });
  }

  const blockedBySignal = alerts.some(
    (alert) => alert.type === 'summary_signal' || alert.type === 'artifact_blocked'
  );

  if (blockedBySignal) {
    const firstAlert = alerts[0];
    return {
      blocked: true,
      reason: `Sentinel flagged risk for ${agent} (${action}): ${firstAlert.type} — ${firstAlert.signal || firstAlert.status || firstAlert.state}`
    };
  }

  return { blocked: false, reason: '' };
}

export function getGateStatus(commandId) {
  if (!commandId) {
    return { status: 'no_command', blocked: false, alertCount: 0, sentinelPresent: false };
  }

  const sentinelOutput = getAgentOutput(commandId, 'sentinel');
  if (!sentinelOutput) {
    return { status: 'no_sentinel_output', blocked: false, alertCount: 0, sentinelPresent: false };
  }

  const sentinelAlerts = checkSentinelAlerts(commandId);

  return {
    status: sentinelAlerts.found ? 'blocked' : 'clear',
    blocked: sentinelAlerts.found,
    alertCount: sentinelAlerts.alerts.length,
    sentinelPresent: true,
    alerts: sentinelAlerts.alerts
  };
}
