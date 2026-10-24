import { TRUST_STATES, timestampMs } from './trustModel';
import { pushMemoryItem } from './memoryService';
import { appendSessionEvent } from './sessionIntelligenceService';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';
import { auditProjectPlan, auditReleaseReadiness, generateRiskScore } from './audit/marcusAuditService';
import { executeMarcusPublish, MARCUS_PUBLISH_PLATFORMS } from './marcusPublishService';
import { getConnectorCredential } from './connectors/connectorAuth';
import { isConnectorAuthenticated } from './connectorRegistryService';
import { publishPost } from './contentFactory/publishPost';
import { contentAppSettings } from './contentFactory/contentStepRecorder';
import { getProject } from './contentFactory/contentProjectService';
import { updatePost } from './contentFactory/contentPosts';
import { appendNotification } from './notificationService';
import { listProjects } from './contentFactory/contentProjectService';
import { signInWarnings } from './contentFactory/signInExpiry';
import { checkDailyLimit } from './contentFactory/dailyLimits';
import { BY_HAND_REMINDER } from './contentFactory/readyToPost';
import { SIGN_IN_NAME } from './contentFactory/signInExpiry';
import type { PostPlatform, PostStatus } from './contentFactory/contentTypes';
import { randomHex } from '../lib/randomId';

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
  /** `posting`: claimed and being sent; `check`: the app closed mid-send; `ask`: more than 7 days late. */
  status: 'pending' | 'executed' | 'cancelled' | 'posting' | 'done' | 'failed' | 'check' | 'ask';
  executedAt?: number;
  /** Phase 3a: a project's post (sent through publishPost), or a reminder. Missing = text, as before. */
  kind?: 'text' | 'content_post' | 'reminder';
  projectId?: string;
  postId?: string;
  /** A reminder's text. */
  message?: string;
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
    // Keep every item still to go out (or being sent, or waiting for you); trim only finished ones.
    const open = (i: ScheduledPublish) => i.status === 'pending' || i.status === 'posting' || i.status === 'ask';
    const finishedRoom = Math.max(0, MARCUS_SCHEDULE_MAX - items.filter(open).length);
    const finished = items.filter((i) => !open(i));
    const keep = new Set(finished.slice(finished.length - finishedRoom));
    localStorage.setItem(MARCUS_SCHEDULE_KEY, JSON.stringify(items.filter((i) => open(i) || keep.has(i))));
  } catch { /* ignore */ }
}

/**
 * Schedule a publish action for future execution.
 */
export function schedulePublish({ content, platform, scheduledAt, agentId }: { content: string; platform: string; scheduledAt: number; agentId: string }): ScheduledPublish {
  const entry: ScheduledPublish = {
    id: `marcus_sched_${Date.now()}_${randomHex(6)}`,
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

// ── Posts (content factory phase 3a) ──────────────────────────────────────────

const PLATFORM_NAMES: Record<string, string> = { youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook' };
const platformName = (platform: string) => PLATFORM_NAMES[platform] || platform;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A post this late when the app starts asks before it goes out. */
const ASK_AFTER_LATE_MS = 7 * DAY_MS;
/** Later than this counts as "late" in the note (the runner checks every minute). */
const LATE_NOTE_AFTER_MS = 5 * 60 * 1000;

function newItem(patch: Partial<ScheduledPublish> & { platform: string; scheduledAt: number }): ScheduledPublish {
  return {
    id: `marcus_sched_${Date.now()}_${randomHex(6)}`,
    content: '',
    agentId: 'marcus',
    createdAt: Date.now(),
    status: 'pending',
    ...patch,
  };
}

/** Schedules a project's post; scheduling the same post again moves it. */
export function scheduleContentPost({ projectId, postId, platform, scheduledAt }: { projectId: string; postId: string; platform: PostPlatform; scheduledAt: number }): ScheduledPublish {
  const items = _loadSchedule();
  const existing = items.find((i) => i.kind === 'content_post' && i.postId === postId && (i.status === 'pending' || i.status === 'ask'));
  if (existing) {
    existing.scheduledAt = scheduledAt;
    existing.status = 'pending';
    _saveSchedule(items);
    return existing;
  }
  const item = newItem({ kind: 'content_post', projectId, postId, platform, scheduledAt });
  _saveSchedule([...items, item]);
  return item;
}

/** A reminder at a post's time (a YouTube video the channel keeps private: make it public). */
export function scheduleContentReminder({ projectId, postId, scheduledAt, message }: { projectId: string; postId: string; scheduledAt: number; message: string }): ScheduledPublish {
  const item = newItem({ kind: 'reminder', projectId, postId, platform: 'youtube', scheduledAt, message });
  _saveSchedule([..._loadSchedule(), item]);
  return item;
}

/** Cancels a post's pending send or reminder. */
export function cancelScheduledContentPost(postId: string): boolean {
  const items = _loadSchedule();
  let changed = false;
  for (const item of items) {
    if (item.postId === postId && (item.status === 'pending' || item.status === 'ask')) {
      item.status = 'cancelled';
      changed = true;
    }
  }
  if (changed) _saveSchedule(items);
  return changed;
}

/** Moves a pending item (a text send, phase 3b) to a new time; false when it is not pending. */
export function rescheduleScheduledPublish(id: string, scheduledAt: number): boolean {
  const items = _loadSchedule();
  const item = items.find((i) => i.id === id && i.status === 'pending');
  if (!item) return false;
  item.scheduledAt = scheduledAt;
  _saveSchedule(items);
  return true;
}

/** "Post it now" for a post that waited because it was more than 7 days late. */
export function postOverdueNow(postId: string, nowMs = Date.now()): boolean {
  const items = _loadSchedule();
  const item = items.find((i) => i.postId === postId && i.status === 'ask');
  if (!item) return false;
  item.status = 'pending';
  item.scheduledAt = nowMs;
  _saveSchedule(items);
  if (item.projectId) updatePost(item.projectId, postId, { status: 'scheduled', reason: undefined });
  return true;
}

async function tell(type: 'success' | 'error' | 'info', title: string, message: string): Promise<void> {
  try { appendNotification({ type, title, message }); } catch { /* storage full */ }
  // Telegram, when it is set up and paired (otherwise this quietly does nothing).
  try {
    const telegram = await import('./telegramCompanionService');
    await telegram.sendTelegramMessage(`${title}\n${message}`);
  } catch { /* not set up, or offline */ }
}

function setPost(item: ScheduledPublish, patch: { status: PostStatus; link?: string; platformId?: string; reason?: string; sentAtMs?: number; folder?: string }): void {
  if (!item.projectId || !item.postId) return;
  // Only what the post keeps (a result's setupRequired is for the screen, not the post).
  const { status, link, platformId, reason, sentAtMs, folder } = patch;
  const kept = Object.fromEntries(Object.entries({ status, link, platformId, reason, sentAtMs, folder }).filter(([, v]) => v !== undefined));
  try { updatePost(item.projectId, item.postId, kept); } catch { /* the project was deleted */ }
}

/**
 * At app start: a post cut off while it was being sent becomes "check" (it may have gone
 * out; never send it again blindly), and a post more than 7 days late waits for you.
 */
export function recoverScheduledPublishes(nowMs = Date.now()): void {
  const items = _loadSchedule();
  let changed = false;
  for (const item of items) {
    if (item.kind !== 'content_post') continue;
    if (item.status === 'posting') {
      item.status = 'check';
      changed = true;
      const where = platformName(item.platform);
      const reason = `Alphonso closed while this was being posted to ${where}, so it may or may not have gone out. Check ${where} before posting it again.`;
      setPost(item, { status: 'check', reason });
      void tell('error', `Check your ${where} post`, reason);
    } else if (item.status === 'pending' && nowMs - item.scheduledAt > ASK_AFTER_LATE_MS) {
      item.status = 'ask';
      changed = true;
      const due = new Date(item.scheduledAt).toLocaleString();
      setPost(item, { status: 'ask', reason: `This was due on ${due}, more than 7 days ago, while Alphonso was closed. Post it now or cancel it.` });
    }
  }
  if (changed) _saveSchedule(items);
}

async function sendContentPost(item: ScheduledPublish, nowMs: number): Promise<void> {
  const project = item.projectId ? getProject(item.projectId) : null;
  const post = project?.posts?.find((p) => p.id === item.postId);
  const items = _loadSchedule();
  const mine = items.find((i) => i.id === item.id);
  if (!post || post.status === 'cancelled') {
    if (mine) { mine.status = 'cancelled'; _saveSchedule(items); }
    return;
  }
  const late = nowMs - item.scheduledAt > LATE_NOTE_AFTER_MS;
  // Over the platform's daily limit (phase 3b): wait, and try again when there is room.
  const limit = await checkDailyLimit(post, nowMs);
  if (!limit.ok) {
    setPost(item, { status: 'over_limit', reason: limit.reason });
    const later = _loadSchedule();
    const again = later.find((i) => i.id === item.id);
    if (again) { again.status = 'pending'; again.scheduledAt = limit.retryAtMs as number; _saveSchedule(later); }
    return;
  }
  const result = await publishPost(post, contentAppSettings(), nowMs);
  setPost(item, { ...result, ...(result.status === 'posted' || result.status === 'scheduled' ? { sentAtMs: nowMs } : {}) });
  const after = _loadSchedule();
  const done = after.find((i) => i.id === item.id);
  if (done) {
    done.status = result.status === 'failed' ? 'failed' : 'done';
    done.executedAt = nowMs;
    _saveSchedule(after);
  }
  const where = platformName(post.platform);
  const lateNote = late ? ` It went out late: Alphonso was closed at ${new Date(item.scheduledAt).toLocaleString()}.` : '';
  if (result.status === 'posted' || result.status === 'scheduled') {
    await tell('success', `${result.status === 'posted' ? 'Posted on' : 'Scheduled on'} ${where}: ${post.title}`, `${result.link || ''}${lateNote}`.trim());
  } else if (result.status === 'by_hand' && result.folder) {
    // Phase 3c: no storage for a post that needs a link; its files and caption are saved.
    await tell('info', `Post by hand on ${where}: ${post.title}`, `${BY_HAND_REMINDER(post, result.folder)}${lateNote}`);
  } else {
    await tell('error', `Not posted on ${where}: ${post.title}`, `${result.reason || 'It failed.'}${lateNote}`);
  }
}

let _running = false;

/**
 * One pass of the runner: sends everything due. Each item is claimed and saved before
 * anything is sent, so two passes (or a crash) never send it twice.
 */
export async function runScheduledPublishes(nowMs = Date.now()): Promise<void> {
  if (_running) return;
  _running = true;
  try {
    const items = _loadSchedule();
    const due = items.filter((i) => i.status === 'pending' && i.scheduledAt <= nowMs);
    for (const item of due) {
      item.status = item.kind === 'content_post' ? 'posting' : item.kind === 'reminder' ? 'done' : 'executed';
      item.executedAt = nowMs;
    }
    if (due.length) _saveSchedule(items);
    for (const item of due) {
      if (item.kind === 'content_post') {
        setPost(item, { status: 'posting' });
        try { await sendContentPost(item, nowMs); } catch { /* sendContentPost never throws; keep the loop going */ }
      } else if (item.kind === 'reminder') {
        await tell('info', 'Time to publish on YouTube', item.message || '');
      } else {
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
    }
  } finally {
    _running = false;
  }
}

let _schedulerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the scheduler — checks every `intervalMs` (default 60s) for items past their
 * time. Safe to call multiple times — stops any previous interval first.
 */
export function startScheduler(intervalMs: number = 60_000): void {
  stopScheduler();
  _schedulerInterval = setInterval(() => {
    void runScheduledPublishes();
    void checkSignIns().catch(() => undefined);
  }, intervalMs);
}

const SIGN_IN_CHECKED_KEY = 'alphonso_sign_in_checked_v1';

/**
 * Once a day (phase 3b): warns when the YouTube or Meta sign-in runs out soon, has run out,
 * or posts are due after it, in the app and on Telegram.
 */
export async function checkSignIns(nowMs = Date.now()): Promise<void> {
  const d = new Date(nowMs);
  const today = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  try { if (localStorage.getItem(SIGN_IN_CHECKED_KEY) === today) return; localStorage.setItem(SIGN_IN_CHECKED_KEY, today); } catch { return; }
  // Instagram Login's token is renewed when under 10 days are left (phase 3c).
  try {
    const { refreshInstagramIfDue } = await import('./signInService');
    await refreshInstagramIfDue(nowMs);
  } catch { /* warned below if it runs out */ }
  const posts = listProjects().flatMap((p) => p.posts || []);
  for (const warning of await signInWarnings(nowMs, posts)) {
    await tell(warning.expiresAtMs <= nowMs ? 'error' : 'info', `${SIGN_IN_NAME[warning.service]} sign-in`, warning.message);
  }
}

/** At app start (phase 3a): recover, send what is due now, then check every minute. */
export function startPostScheduler(): void {
  recoverScheduledPublishes();
  void runScheduledPublishes();
  void checkSignIns().catch(() => undefined);
  startScheduler();
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
