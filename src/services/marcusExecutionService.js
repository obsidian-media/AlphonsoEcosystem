import { TRUST_STATES, timestampMs } from './trustModel';
import { pushMemoryItem } from './memoryService';
import { appendSessionEvent } from './sessionIntelligenceService';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';
import { auditProjectPlan, auditReleaseReadiness, generateRiskScore } from './audit/marcusAuditService';
import { executeMarcusPublish, MARCUS_PUBLISH_PLATFORMS } from './marcusPublishService';
import { getConnectorCredential } from './connectors/connectorAuth';
import { isConnectorAuthenticated } from './connectorRegistryService';

// ── Distribution target selector ─────────────────────────────────────────────

export function selectDistributionTarget(assignment) {
  const actionType = String(assignment?.actionType || '').toLowerCase();
  const payload = assignment?.payload || {};

  if (/github.*release|create.*release|upload.*asset/.test(actionType)) {
    return { type: 'github', action: 'release', platform: null };
  }
  if (/github.*issue/.test(actionType)) {
    return { type: 'github', action: 'issue', platform: null };
  }
  if (/github.*pr|pull.?request/.test(actionType)) {
    return { type: 'github', action: 'pr', platform: null };
  }
  if (/slack/.test(actionType)) {
    return { type: 'slack', action: 'message', platform: null };
  }
  if (/instagram|facebook|meta/.test(actionType)) {
    return { type: 'publish', action: 'publish', platform: /facebook/.test(actionType) ? 'facebook' : 'instagram' };
  }
  if (/youtube/.test(actionType)) {
    return { type: 'publish', action: 'publish', platform: 'youtube' };
  }
  if (/telegram/.test(actionType)) {
    return { type: 'publish', action: 'publish', platform: 'telegram' };
  }
  if (/whatsapp/.test(actionType)) {
    return { type: 'publish', action: 'publish', platform: 'whatsapp' };
  }
  if (/notion/.test(actionType)) {
    return { type: 'publish', action: 'publish', platform: 'notion' };
  }
  if (/clickup/.test(actionType)) {
    return { type: 'publish', action: 'publish', platform: 'clickup' };
  }

  // Infer from payload
  const platform = payload.platform || null;
  if (platform && MARCUS_PUBLISH_PLATFORMS.some((p) => p.id === platform)) {
    return { type: 'publish', action: 'publish', platform };
  }

  return { type: 'review', action: 'distribution_review', platform: null };
}

// ── GitHub execution ──────────────────────────────────────────────────────────

export async function executeMarcusGitHubAction(commandText, assignment, options = {}) {
  const token = getConnectorCredential('github', 'GITHUB_TOKEN');
  const auth = isConnectorAuthenticated('github');

  if (!auth.ok || !token) {
    return {
      ok: false,
      error: 'GitHub connector not authenticated. Add GITHUB_TOKEN in Connector Setup.',
      setupRequired: true
    };
  }

  const actionType = String(assignment?.actionType || '').toLowerCase();
  const payload = assignment?.payload || {};

  // Dynamic import to avoid circular deps and keep connector tree-shakeable
  const github = await import('./connectors/githubConnector.js');
  const config = {
    token,
    owner: payload.owner || options.owner || '',
    repo: payload.repo || options.repo || ''
  };

  try {
    if (/create.*release|github.*release/.test(actionType)) {
      const release = await github.createRelease(config, {
        tagName: payload.tagName || `v${Date.now()}`,
        name: payload.name || String(commandText || '').slice(0, 100),
        body: payload.body || String(commandText || ''),
        draft: payload.draft ?? true,
        prerelease: payload.prerelease ?? false
      });
      return { ok: true, type: 'github_release', releaseId: release.id, url: release.htmlUrl || null, release };
    }

    if (/github.*issue|create.*issue/.test(actionType)) {
      const issue = await github.createIssue(config, {
        title: payload.title || String(commandText || '').slice(0, 140),
        body: payload.body || String(commandText || ''),
        labels: Array.isArray(payload.labels) ? payload.labels : [],
        assignees: Array.isArray(payload.assignees) ? payload.assignees : []
      });
      return { ok: true, type: 'github_issue', issueNumber: issue.number, url: issue.htmlUrl || null, issue };
    }

    // Default: list releases as a dry-run to confirm connectivity
    const releases = await github.listReleases(config);
    return { ok: true, type: 'github_list_releases', count: releases.length };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

// ── Slack execution ───────────────────────────────────────────────────────────

export async function executeMarcusSlackAction(commandText, assignment, options = {}) {
  const token = getConnectorCredential('slack', 'SLACK_BOT_TOKEN');
  const auth = isConnectorAuthenticated('slack');

  if (!auth.ok || !token) {
    return {
      ok: false,
      error: 'Slack connector not authenticated. Add SLACK_BOT_TOKEN in Connector Setup.',
      setupRequired: true
    };
  }

  const payload = assignment?.payload || {};
  const channel = payload.channel || options.channel || '#general';
  const text = payload.text || String(commandText || '').slice(0, 3000);

  const slack = await import('./connectors/slackConnector.js');
  const config = { token, defaultChannel: channel };

  try {
    const result = await slack.sendMessage(config, channel, text);
    return { ok: true, type: 'slack_message', channel, ts: result.ts || null };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

// ── Schema builder ────────────────────────────────────────────────────────────

export function buildMarcusExecutionRecord(result, assignment) {
  return {
    workflowId: assignment?.commandId || '',
    assignmentId: assignment?.packetId || '',
    connectorId: result?.platform || result?.type || 'none',
    approvedBy: 'maria-governance',
    status: result?.ok ? 'executed' : 'failed',
    resultUrl: result?.url || result?.release?.htmlUrl || null,
    summary: result?.ok
      ? `Marcus executed ${result.type || 'distribution'} successfully.`
      : `Marcus distribution failed: ${String(result?.error || 'unknown').slice(0, 200)}`,
    confidenceLevel: result?.ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED,
    verificationState: result?.ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED,
    executedAtMs: timestampMs()
  };
}

// ── Main entry ────────────────────────────────────────────────────────────────

export async function runMarcusDistribution(commandText, assignment, priorOutputs, options = {}) {
  const mariaOutput = priorOutputs?.maria;
  const startMs = timestampMs();

  // 1. Governance gate — Maria must not have flagged critical/high with approvalRequired
  const mariaRisk = String(mariaOutput?.schema?.riskLevel || mariaOutput?.artifacts?.find((a) => a.type === 'risk_assessment')?.riskLevel || 'unknown').toLowerCase();
  const mariaApprovalRequired = mariaOutput?.schema?.approvalRequired
    ?? mariaOutput?.artifacts?.find((a) => a.type === 'governance_audit')?.approvalRequired
    ?? true;

  if (!mariaOutput) {
    // Maria didn't run — run a quick deterministic audit inline
    const quickAudit = generateRiskScore({ commandText, actionType: assignment?.actionType });
    if (quickAudit.level === 'critical' || quickAudit.level === 'high') {
      return {
        summary: `Marcus blocked: no Maria governance approval found and risk assessed as ${quickAudit.level}. Run Maria audit first.`,
        resultState: 'pending_review',
        resultUrl: null,
        artifacts: [{ type: 'distribution_blocked', reason: 'no_governance_approval', quickRisk: quickAudit.level }],
        sources: [],
        contractAction: assignment?.actionType || 'distribution_execution'
      };
    }
  } else if (mariaApprovalRequired && (mariaRisk === 'critical' || mariaRisk === 'high')) {
    return {
      summary: `Marcus blocked: Maria governance audit requires approval (risk: ${mariaRisk}). Obtain operator approval before distribution.`,
      resultState: 'pending_review',
      resultUrl: null,
      artifacts: [
        { type: 'distribution_blocked', reason: 'governance_approval_required', mariaRisk },
        ...(mariaOutput?.artifacts || [])
      ],
      sources: [],
      contractAction: assignment?.actionType || 'distribution_execution'
    };
  }

  // 2. Select distribution target
  const target = selectDistributionTarget(assignment);

  // 3. Execute based on target type
  let execResult = null;

  if (target.type === 'github') {
    execResult = await executeMarcusGitHubAction(commandText, assignment, options);
  } else if (target.type === 'slack') {
    execResult = await executeMarcusSlackAction(commandText, assignment, options);
  } else if (target.type === 'publish' && target.platform) {
    const payload = assignment?.payload || {};
    const publishResult = await executeMarcusPublish({
      platform: target.platform,
      payload,
      commandId: assignment?.commandId || null,
      workflowId: assignment?.workflowId || null,
      preApproved: !mariaApprovalRequired
    });
    execResult = publishResult;
    execResult.type = `publish_${target.platform}`;
    execResult.platform = target.platform;
  } else {
    // No specific connector target — return review summary using existing audit services
    const auditReport = mariaOutput
      ? auditProjectPlan({ id: assignment?.commandId, projectName: String(commandText || '').slice(0, 80) })
      : auditReleaseReadiness({ id: assignment?.commandId, projectName: String(commandText || '').slice(0, 80) });
    execResult = {
      ok: true,
      type: 'distribution_review',
      platform: null,
      auditReport
    };
  }

  // 4. Build schema record
  const schema = buildMarcusExecutionRecord(execResult, assignment);

  // 5. Persist memory
  pushMemoryItem({
    title: `Marcus distribution: ${String(commandText || '').slice(0, 80)}`,
    category: 'orchestration_memory',
    content: {
      target,
      schema,
      mariaRisk,
      execOk: execResult?.ok ?? false
    },
    source: 'marcus-execution-service',
    sourceAgent: 'marcus',
    confidence: schema.confidenceLevel,
    verificationState: schema.verificationState
  });

  appendSessionEvent({
    category: 'distribution',
    title: execResult?.ok ? `Marcus executed ${target.type}` : `Marcus distribution failed`,
    details: { target, mariaRisk, ok: execResult?.ok ?? false, error: execResult?.error || null },
    agent: 'marcus',
    confidence: schema.confidenceLevel,
    verificationState: schema.verificationState
  });

  appendOrchestrationReceipt({
    workflowId: assignment?.commandId || 'marcus_distribution',
    commandId: assignment?.commandId || null,
    packetId: assignment?.packetId || null,
    eventType: execResult?.ok ? 'marcus_distribution_completed' : 'marcus_distribution_failed',
    status: execResult?.ok ? 'executed' : 'failed',
    agent: 'marcus',
    connectorId: target.platform || target.type || 'none',
    actionType: assignment?.actionType || 'distribution_execution',
    riskLevel: mariaRisk || 'medium',
    approved: !mariaApprovalRequired,
    blocked: !execResult?.ok,
    setupRequired: execResult?.setupRequired ?? false,
    details: { target, execResult, mariaRisk, durationMs: timestampMs() - startMs },
    confidence: schema.confidenceLevel,
    verificationState: schema.verificationState
  });

  const summaryParts = [
    mariaOutput ? `Governance cleared by Maria (risk: ${mariaRisk}).` : 'Quick governance check passed.',
    execResult?.ok
      ? `Marcus executed ${target.type} distribution successfully.${target.platform ? ` Platform: ${target.platform}.` : ''}`
      : `Marcus distribution failed: ${String(execResult?.error || 'unknown').slice(0, 150)}`,
    execResult?.setupRequired ? 'Connector setup required — add credentials in Connector Setup panel.' : ''
  ].filter(Boolean).join(' ');

  return {
    summary: summaryParts,
    resultState: execResult?.ok ? 'completed' : execResult?.setupRequired ? 'setup_required' : 'failed',
    resultUrl: schema.resultUrl,
    artifacts: [
      { type: 'distribution_execution', status: schema.status, target, connectorId: schema.connectorId },
      { type: 'marcus_execution_schema', schema },
      ...(mariaOutput?.artifacts || []),
      ...(execResult?.auditReport ? [{ type: 'audit_report', report: execResult.auditReport }] : [])
    ],
    sources: [],
    contractAction: assignment?.actionType || 'distribution_execution',
    schema
  };
}

// ── Scheduled Publishing ──────────────────────────────────────────────────────

const MARCUS_SCHEDULE_KEY = 'alphonso_marcus_schedule_v1';
const MARCUS_SCHEDULE_MAX = 100;

/** @typedef {{ id: string, content: string, platform: string, scheduledAt: number, agentId: string, createdAt: number, status: 'pending' | 'executed' | 'cancelled', executedAt?: number }} ScheduledPublish */

function _loadSchedule() {
  try {
    return JSON.parse(localStorage.getItem(MARCUS_SCHEDULE_KEY) || '[]');
  } catch {
    return [];
  }
}

function _saveSchedule(items) {
  try {
    localStorage.setItem(MARCUS_SCHEDULE_KEY, JSON.stringify(items.slice(-MARCUS_SCHEDULE_MAX)));
  } catch { /* ignore */ }
}

/**
 * Schedule a publish action for future execution.
 * @param {{ content: string, platform: string, scheduledAt: number, agentId: string }} params
 * @returns {ScheduledPublish} The created schedule entry
 */
export function schedulePublish({ content, platform, scheduledAt, agentId }) {
  const entry = {
    id: `marcus_sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    content: String(content || ''),
    platform: String(platform || ''),
    scheduledAt: Number(scheduledAt) || Date.now(),
    agentId: String(agentId || 'marcus'),
    createdAt: Date.now(),
    status: 'pending'
  };
  const items = _loadSchedule();
  items.push(entry);
  _saveSchedule(items);
  return entry;
}

/**
 * Get all scheduled publishes (all statuses).
 * @returns {ScheduledPublish[]}
 */
export function getScheduledPublishes() {
  return _loadSchedule();
}

/**
 * Cancel a scheduled publish by id.
 * @param {string} id
 * @returns {boolean} Whether the item was found and cancelled
 */
export function cancelScheduledPublish(id) {
  const items = _loadSchedule();
  const idx = items.findIndex((item) => item.id === id);
  if (idx === -1) return false;
  items[idx] = { ...items[idx], status: 'cancelled' };
  _saveSchedule(items);
  return true;
}

let _schedulerInterval = null;

/**
 * Start the scheduler — checks every `intervalMs` (default 60s) for pending
 * items past their `scheduledAt` time and calls `executeMarcusPublish` on them.
 * Safe to call multiple times — stops any previous interval first.
 * @param {number} [intervalMs=60000]
 */
export function startScheduler(intervalMs = 60_000) {
  stopScheduler();
  _schedulerInterval = setInterval(async () => {
    const now = Date.now();
    const items = _loadSchedule();
    let changed = false;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.status !== 'pending') continue;
      if (item.scheduledAt > now) continue;

      // Mark as executed optimistically before async call
      items[i] = { ...item, status: 'executed', executedAt: now };
      changed = true;

      try {
        await executeMarcusPublish({
          platform: item.platform,
          payload: { text: item.content, content: item.content },
          commandId: item.id,
          workflowId: `scheduler_${item.id}`,
          preApproved: false
        });
      } catch { /* best-effort; item is already marked executed */ }
    }

    if (changed) _saveSchedule(items);
  }, intervalMs);
}

/**
 * Stop the scheduler interval if running.
 */
export function stopScheduler() {
  if (_schedulerInterval !== null) {
    clearInterval(_schedulerInterval);
    _schedulerInterval = null;
  }
}
