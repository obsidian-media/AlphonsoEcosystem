import { TRUST_STATES, timestampMs } from './trustModel';
import { pushMemoryItem } from './memoryService';
import { appendSessionEvent } from './sessionIntelligenceService';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';
import { auditProjectPlan, auditReleaseReadiness, generateRiskScore } from './audit/marcusAuditService';
import { executeMarcusPublish, MARCUS_PUBLISH_PLATFORMS } from './marcusPublishService';
import { getConnectorCredential } from './connectors/connectorAuth';
import { isConnectorAuthenticated } from './connectorRegistryService';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Assignment {
  actionType?: string;
  payload?: Record<string, unknown>;
  commandId?: string;
  packetId?: string;
  workflowId?: string;
  [key: string]: unknown;
}

interface DistributionTarget {
  type: string;
  action: string;
  platform: string | null;
}

interface ExecutionResult {
  ok: boolean;
  type?: string;
  platform?: string | null;
  error?: string;
  setupRequired?: boolean;
  url?: string | null;
  release?: { htmlUrl?: string; [key: string]: unknown };
  id?: string;
  htmlUrl?: string;
  number?: number;
  ts?: string | null;
  data?: unknown;
  auditReport?: unknown;
  count?: number;
  [key: string]: unknown;
}

interface MarcusExecutionRecord {
  workflowId: string;
  assignmentId: string;
  connectorId: string;
  approvedBy: string;
  status: string;
  resultUrl: string | null;
  summary: string;
  confidenceLevel: string;
  verificationState: string;
  executedAtMs: number;
}

interface PriorOutputs {
  maria?: {
    schema?: { riskLevel?: string; approvalRequired?: boolean };
    artifacts?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface MarcusResult {
  summary: string;
  resultState: string;
  resultUrl: string | null;
  artifacts: Array<Record<string, unknown>>;
  sources: never[];
  contractAction: string;
  schema: MarcusExecutionRecord;
}

interface AuditReport {
  [key: string]: unknown;
}

interface QuickAudit {
  level: string;
  [key: string]: unknown;
}

interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

interface SlackConfig {
  token: string;
  defaultChannel: string;
}

interface PublishParams {
  platform: string;
  payload: Record<string, unknown>;
  commandId?: string | null;
  workflowId?: string | null;
  preApproved?: boolean;
}

/** @typedef {{ id: string, content: string, platform: string, scheduledAt: number, agentId: string, createdAt: number, status: 'pending' | 'executed' | 'cancelled', executedAt?: number }} ScheduledPublish */
interface ScheduledPublish {
  id: string;
  content: string;
  platform: string;
  scheduledAt: number;
  agentId: string;
  createdAt: number;
  status: 'pending' | 'executed' | 'cancelled';
  executedAt?: number;
}

interface PublishResult {
  ok: boolean;
  type?: string;
  platform?: string;
  error?: string;
  [key: string]: unknown;
}

// ── Distribution target selector ─────────────────────────────────────────────

export function selectDistributionTarget(assignment: Assignment): DistributionTarget {
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
  if (/n8n|workflow.*trigger|automation.*trigger/.test(actionType)) {
    return { type: 'n8n', action: 'trigger_webhook', platform: null };
  }

  // Infer from payload
  const platform = (payload.platform as string) || null;
  if (platform && MARCUS_PUBLISH_PLATFORMS.some((p: { id: string }) => p.id === platform)) {
    return { type: 'publish', action: 'publish', platform };
  }

  return { type: 'review', action: 'distribution_review', platform: null };
}

// ── GitHub execution ──────────────────────────────────────────────────────────

export async function executeMarcusGitHubAction(commandText: string, assignment: Assignment, options: Record<string, unknown> = {}): Promise<ExecutionResult> {
  const token = getConnectorCredential('github', 'GITHUB_TOKEN') as string | null;
  const auth = isConnectorAuthenticated('github') as { ok: boolean };

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
  const github = await import('./connectors/githubConnector');
  const config: GitHubConfig = {
    token,
    owner: (payload.owner as string) || (options.owner as string) || '',
    repo: (payload.repo as string) || (options.repo as string) || ''
  };

  try {
    if (/create.*release|github.*release/.test(actionType)) {
      const release = await github.createRelease(
        config,
        (payload.tagName as string) || `v${Date.now()}`,
        (payload.name as string) || String(commandText || '').slice(0, 100),
        (payload.body as string) || String(commandText || ''),
        (payload.draft as boolean) ?? true,
        (payload.prerelease as boolean) ?? false
      );
      return { ok: true, type: 'github_release', releaseId: release.id, url: null, release: release as unknown as Record<string, unknown> };
    }

    if (/github.*issue|create.*issue/.test(actionType)) {
      const issue = await github.createIssue(
        config,
        (payload.title as string) || String(commandText || '').slice(0, 140),
        (payload.body as string) || String(commandText || ''),
        Array.isArray(payload.labels) ? payload.labels as string[] : []
      );
      return { ok: true, type: 'github_issue', issueNumber: issue.number, url: null, issue: issue as unknown as Record<string, unknown> };
    }

    // Default: list releases as a dry-run to confirm connectivity
    const releases = await github.listReleases(config);
    return { ok: true, type: 'github_list_releases', count: releases.length };
  } catch (error: unknown) {
    return { ok: false, error: String((error as Error)?.message || error) };
  }
}

// ── Slack execution ───────────────────────────────────────────────────────────

export async function executeMarcusSlackAction(commandText: string, assignment: Assignment, options: Record<string, unknown> = {}): Promise<ExecutionResult> {
  const token = getConnectorCredential('slack', 'SLACK_BOT_TOKEN') as string | null;
  const auth = isConnectorAuthenticated('slack') as { ok: boolean };

  if (!auth.ok || !token) {
    return {
      ok: false,
      error: 'Slack connector not authenticated. Add SLACK_BOT_TOKEN in Connector Setup.',
      setupRequired: true
    };
  }

  const payload = assignment?.payload || {};
  const channel = (payload.channel as string) || (options.channel as string) || '#general';
  const text = (payload.text as string) || String(commandText || '').slice(0, 3000);

  const slack = await import('./connectors/slackConnector');
  const config: SlackConfig = { token, defaultChannel: channel };

  try {
    const result = await slack.sendMessage(config, channel, text);
    return { ok: true, type: 'slack_message', channel, ts: (result as { ts?: string })?.ts || null };
  } catch (error: unknown) {
    return { ok: false, error: String((error as Error)?.message || error) };
  }
}

// ── n8n execution ────────────────────────────────────────────────────────────

export async function executeMarcusN8nAction(commandText: string, assignment: Assignment, options: Record<string, unknown> = {}): Promise<ExecutionResult> {
  const token = getConnectorCredential('n8n', 'N8N_BASE_URL') as string | null;
  const auth = isConnectorAuthenticated('n8n') as { ok: boolean };

  if (!auth.ok || !token) {
    return {
      ok: false,
      error: 'n8n connector not authenticated. Add N8N_BASE_URL in Connector Setup.',
      setupRequired: true
    };
  }

  const payload = assignment?.payload || {};
  const webhookPath = (payload.webhookPath as string) || (options.webhookPath as string) || 'default';

  const n8n = await import('./connectors/n8nConnector');

  try {
    const result = await n8n.triggerN8nWebhook(webhookPath, {
      commandText: String(commandText || '').slice(0, 2000),
      assignment,
      ...payload
    }) as { ok: boolean; data?: unknown; error?: string };
    return { ok: result.ok, type: 'n8n_webhook', webhookPath, data: result.data, error: result.error };
  } catch (error: unknown) {
    return { ok: false, error: String((error as Error)?.message || error) };
  }
}

// ── Schema builder ────────────────────────────────────────────────────────────

export function buildMarcusExecutionRecord(result: ExecutionResult, assignment: Assignment): MarcusExecutionRecord {
  return {
    workflowId: assignment?.commandId || '',
    assignmentId: assignment?.packetId || '',
    connectorId: (result?.platform as string) || result?.type || 'none',
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

export async function runMarcusDistribution(commandText: string, assignment: Assignment, priorOutputs: PriorOutputs | null, options: Record<string, unknown> = {}): Promise<MarcusResult> {
  const mariaOutput = priorOutputs?.maria;
  const startMs = timestampMs();

  // 1. Governance gate — Maria must not have flagged critical/high with approvalRequired
  const mariaRisk = String(mariaOutput?.schema?.riskLevel || mariaOutput?.artifacts?.find((a) => a.type === 'risk_assessment')?.riskLevel || 'unknown').toLowerCase();
  const mariaApprovalRequired = mariaOutput?.schema?.approvalRequired
    ?? mariaOutput?.artifacts?.find((a) => a.type === 'governance_audit')?.approvalRequired as boolean
    ?? true;

  if (!mariaOutput) {
    // Maria didn't run — run a quick deterministic audit inline
    const quickAudit = generateRiskScore({ commandText, actionType: assignment?.actionType }) as QuickAudit;
    if (quickAudit.level === 'critical' || quickAudit.level === 'high') {
      return {
        summary: `Marcus blocked: no Maria governance approval found and risk assessed as ${quickAudit.level}. Run Maria audit first.`,
        resultState: 'pending_review',
        resultUrl: null,
        artifacts: [{ type: 'distribution_blocked', reason: 'no_governance_approval', quickRisk: quickAudit.level }],
        sources: [],
        contractAction: assignment?.actionType || 'distribution_execution',
        schema: buildMarcusExecutionRecord({ ok: false }, assignment)
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
      contractAction: assignment?.actionType || 'distribution_execution',
      schema: buildMarcusExecutionRecord({ ok: false }, assignment)
    };
  }

  // 2. Select distribution target
  const target = selectDistributionTarget(assignment);

  // 3. Execute based on target type
  let execResult: ExecutionResult = { ok: false };

  if (target.type === 'github') {
    execResult = await executeMarcusGitHubAction(commandText, assignment, options);
  } else if (target.type === 'slack') {
    execResult = await executeMarcusSlackAction(commandText, assignment, options);
  } else if (target.type === 'n8n') {
    execResult = await executeMarcusN8nAction(commandText, assignment, options);
  } else if (target.type === 'publish' && target.platform) {
    const payload = assignment?.payload || {};
    const publishResult = await executeMarcusPublish({
      platform: target.platform,
      payload,
      commandId: assignment?.commandId || null,
      workflowId: assignment?.workflowId || null,
      preApproved: !mariaApprovalRequired
    }) as PublishResult;
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

function _loadSchedule(): ScheduledPublish[] {
  try {
    return JSON.parse(localStorage.getItem(MARCUS_SCHEDULE_KEY) || '[]') as ScheduledPublish[];
  } catch {
    return [];
  }
}

function _saveSchedule(items: ScheduledPublish[]): void {
  try {
    localStorage.setItem(MARCUS_SCHEDULE_KEY, JSON.stringify(items.slice(-MARCUS_SCHEDULE_MAX)));
  } catch { /* ignore */ }
}

/**
 * Schedule a publish action for future execution.
 */
export function schedulePublish({ content, platform, scheduledAt, agentId }: { content: string; platform: string; scheduledAt: number; agentId: string }): ScheduledPublish {
  const entry: ScheduledPublish = {
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
 */
export function getScheduledPublishes(): ScheduledPublish[] {
  return _loadSchedule();
}

/**
 * Cancel a scheduled publish by id.
 */
export function cancelScheduledPublish(id: string): boolean {
  const items = _loadSchedule();
  const idx = items.findIndex((item) => item.id === id);
  if (idx === -1) return false;
  items[idx] = { ...items[idx], status: 'cancelled' };
  _saveSchedule(items);
  return true;
}

let _schedulerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the scheduler — checks every `intervalMs` (default 60s) for pending
 * items past their `scheduledAt` time and calls `executeMarcusPublish` on them.
 * Safe to call multiple times — stops any previous interval first.
 */
export function startScheduler(intervalMs: number = 60_000): void {
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
export function stopScheduler(): void {
  if (_schedulerInterval !== null) {
    clearInterval(_schedulerInterval);
    _schedulerInterval = null;
  }
}
