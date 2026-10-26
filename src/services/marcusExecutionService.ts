import { getStepOutput } from './jose/joseStepOutputs';
import { getJoseRequest } from './jose/joseRequestStore';
import { TRUST_STATES, timestampMs } from './trustModel';
import { readDueMetrics } from './contentFactory/postMetrics';
import { pushMemoryItem } from './memoryService';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';
import { executeMarcusPublish } from './marcusPublishService';
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
import { redactText } from './sentinel/exactChecks';
import { prepareMarcusSend } from './marcus/prepareSend';
import { runMarcusSend } from './marcus/runSend';
import { checkReadiness } from './marcus/readiness';
import type { SendPreview, SendResult } from './marcus/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Assignment {
  stepId?: string;
  agent?: string;
  actionType?: string;
  effects?: string[];
  needs?: string[];
  payload?: Record<string, unknown>;
  commandId?: string;
  packetId?: string;
  workflowId?: string;
  [key: string]: unknown;
}

interface PriorOutputs {
  maria?: {
    schema?: { riskLevel?: string; approvalRequired?: boolean };
    artifacts?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** What Marcus's step records (agent phase 5): where it went, who approved and reviewed it. */
export interface MarcusRecord {
  kind: 'send';
  connector: string | null;
  target: string | null;
  sendKind: string | null;
  status: 'sent' | 'failed' | 'checked';
  link: string | null;
  platformId: string | null;
  approvedBy: 'you' | null;
  approvedAtMs: number | null;
  reviewedBy: string[];
  sentAtMs: number | null;
  confidenceLevel: string;
  /** Read by Jose's review loop (`judgeReview()`): `fix` only when the text was too long. */
  reviewVerdict: 'pass' | 'fix';
  findings?: string[];
}

interface MarcusResult {
  summary: string;
  resultState: string;
  resultUrl: string | null;
  artifacts: Array<Record<string, unknown>>;
  sources: never[];
  contractAction: string;
  schema: MarcusRecord;
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

// ── Maria's review ────────────────────────────────────────────────────────────

/**
 * Maria's review of the very work Marcus sends (agent phase 3): the Maria step that reviewed
 * one of the steps he needs, else a Maria step he needs (a plan review); null when none.
 */
export function mariaReviewFor(commandId: unknown, needs: string[] | undefined): PriorOutputs['maria'] | null {
  if (typeof commandId !== 'string' || !commandId) return null;
  const linked = new Set(needs || []);
  const steps = getJoseRequest(`jose-request-${commandId}`)?.steps || [];
  const reviewer = steps.find((s) => s.agent === 'maria' && s.reviewOf && linked.has(s.reviewOf))
    || steps.find((s) => s.agent === 'maria' && linked.has(s.stepId));
  if (!reviewer) return null;
  return (getStepOutput(commandId, reviewer.stepId) as unknown as PriorOutputs['maria']) || null;
}

// ── His step (agent phase 5) ──────────────────────────────────────────────────

const READ_ONLY = new Set(['distribution_readiness', 'distribution_review']);

/** The Maria and Sentinel steps that reviewed what he sends (or that he needs), finished. */
function reviewersOf(commandId: string, assignment: Assignment, sourceStepId: string | null): string[] {
  const steps = getJoseRequest(`jose-request-${commandId}`)?.steps || [];
  const needs = new Set(assignment.needs || []);
  return steps
    .filter((s) => (s.agent === 'maria' || s.agent === 'sentinel') && s.status === 'done'
      && ((sourceStepId && s.reviewOf === sourceStepId) || needs.has(s.stepId)))
    .map((s) => s.stepId);
}

function record(patch: Partial<MarcusRecord>): MarcusRecord {
  return {
    kind: 'send', connector: null, target: null, sendKind: null, status: 'failed', link: null, platformId: null,
    approvedBy: null, approvedAtMs: null, reviewedBy: [], sentAtMs: null, confidenceLevel: TRUST_STATES.FAILED, reviewVerdict: 'pass',
    ...patch,
  };
}

function result(summary: string, resultState: string, schema: MarcusRecord, actionType: string): MarcusResult {
  return { summary, resultState, resultUrl: schema.link, artifacts: [{ type: 'marcus_record', record: schema }], sources: [], contractAction: actionType, schema };
}

/**
 * Marcus's step. A readiness check reads and asks nothing; a send sends the preview prepared
 * before you approved it (or prepares one when called outside Jose's gate). `priorOutputs` is
 * kept for older callers and no longer used.
 */
export async function runMarcusDistribution(commandText: string, assignment: Assignment, _priorOutputs: PriorOutputs | null, options: Record<string, unknown> = {}): Promise<MarcusResult> {
  const actionType = String(assignment?.actionType || 'distribution_execution');
  const commandId = String(options.commandId || assignment?.commandId || '');
  const request = getJoseRequest(`jose-request-${commandId}`);
  const requestText = request?.text || String(commandText || '');

  if (READ_ONLY.has(actionType)) {
    const check = await checkReadiness(commandId, assignment, { text: requestText });
    return result(check.text, 'completed', record({ status: 'checked', confidenceLevel: TRUST_STATES.INFERRED }), actionType);
  }

  const stepId = String(assignment?.stepId || 'marcus');
  let preview: SendPreview | undefined = request?.steps.find((s) => s.stepId === stepId)?.sendPreview;
  if (!preview) {
    const prepared = await prepareMarcusSend(commandId, assignment as never, { text: requestText });
    if (prepared.ok === false) {
      if (prepared.outcome === 'setup') return result(prepared.reason, 'setup_required', record({}), actionType);
      if (prepared.outcome === 'fix') {
        return result(prepared.reason, 'completed', record({ status: 'checked', reviewVerdict: 'fix', findings: [prepared.reason], confidenceLevel: TRUST_STATES.INFERRED }), actionType);
      }
      return result(prepared.reason, 'failed', record({}), actionType);
    }
    preview = prepared.preview;
  }

  const startMs = timestampMs();
  const sent: SendResult = await runMarcusSend(commandId, stepId, preview);
  const reviewedBy = reviewersOf(commandId, assignment, preview.sourceStepId);
  const steps = request?.steps || [];
  const prefix = [
    reviewedBy.some((id) => steps.find((s) => s.stepId === id)?.agent === 'maria') ? 'Maria reviewed it.' : '',
    reviewedBy.some((id) => steps.find((s) => s.stepId === id)?.agent === 'sentinel') ? 'Sentinel checked it.' : '',
  ].filter(Boolean).join(' ');
  const schema = record({
    connector: preview.connector,
    target: preview.target,
    sendKind: preview.kind,
    status: sent.ok ? 'sent' : 'failed',
    link: sent.link || null,
    platformId: sent.platformId || null,
    approvedBy: 'you',
    approvedAtMs: startMs,
    reviewedBy,
    sentAtMs: sent.ok ? timestampMs() : null,
    // Verified only when the platform said it went out.
    confidenceLevel: sent.ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED,
  });

  if (sent.ok) {
    const firstLine = redactText(preview.text).split('\n').map((l) => l.trim()).find(Boolean) || '';
    pushMemoryItem({
      title: `Marcus: sent to ${preview.label} — ${firstLine.slice(0, 120)}`,
      category: 'orchestration_memory',
      content: { connector: preview.connector, target: preview.target, kind: preview.kind, link: schema.link, text: redactText(preview.text).slice(0, 2000) },
      source: 'marcus-execution-service',
      sourceAgent: 'marcus',
      confidence: schema.confidenceLevel,
      verificationState: schema.confidenceLevel,
    });
  }
  appendOrchestrationReceipt({
    workflowId: commandId || 'marcus_distribution',
    commandId: commandId || null,
    packetId: assignment?.packetId || null,
    eventType: sent.ok ? 'marcus_sent' : 'marcus_send_failed',
    status: sent.ok ? 'executed' : 'failed',
    agent: 'marcus',
    connectorId: preview.connector,
    actionType,
    riskLevel: 'high',
    approved: true,
    blocked: !sent.ok,
    setupRequired: false,
    details: { target: preview.target, kind: preview.kind, sentence: sent.sentence, durationMs: timestampMs() - startMs },
    confidence: schema.confidenceLevel,
    verificationState: schema.confidenceLevel,
  });

  return result([prefix, sent.sentence].filter(Boolean).join(' '), sent.ok ? 'completed' : 'failed', schema, actionType);
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
    void readDueMetrics().catch(() => undefined);
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
  // The posts' numbers at their checkpoints (phase 4a); a missed one is read once now.
  void readDueMetrics().catch(() => undefined);
  // Lessons after each 7-day reading (phase 4a); loaded lazily to keep the runner light.
  void import('./contentFactory/contentLearning').then((m) => m.startContentLearning()).catch(() => undefined);
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
