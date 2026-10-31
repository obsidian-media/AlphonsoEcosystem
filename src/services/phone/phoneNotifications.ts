// Notifications on a paired phone (phone app, phase 1): the same moments Telegram is told
// about (collectJoseNotifications), with their own sent log. A step that spends, sends or
// publishes, or deletes (LOCKED_EFFECTS) is never approved from a notification: it only
// opens the app, where Face ID / fingerprint confirms. Answers from a notification are
// ordinary phone calls, so a request that already moved on runs nothing ("Already done.").
import { listJoseRequests, onRequestStatusChange, type JoseRequest } from '../jose/joseRequestStore';
import { collectJoseNotifications, type JoseNotification, type JoseTelegramSettings } from '../jose/joseTelegram';
import { LOCKED_EFFECTS } from '../jose/joseEffects';
import { redactText } from '../sentinel/exactChecks';
import type { PhoneNotification } from './phoneProtocol';

export const PHONE_NOTIFY_SENT_KEY = 'alphonso_phone_notifications_sent_v1';
const SENT_KEPT = 500;
const CHECK_EVERY_MS = 30_000;

const TITLES: Record<JoseNotification['kind'], string> = {
  step_waiting: 'Waiting for you',
  plan_waiting: 'Plan waiting',
  finished: 'Finished',
  review_decision: 'Review needs you',
  interrupted: 'Cut off',
  setup_needed: 'Needs setting up',
  memory_wait: 'Waiting for memory',
};

/** Which kinds the phone is told about (Settings → Phones); all on unless switched off. */
export function phoneNotifySettings(): JoseTelegramSettings {
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(localStorage.getItem('alphonso_settings') || '{}')?.phoneNotify || {}; } catch { /* defaults */ }
  const on = (k: string) => saved[k] !== false;
  return { stepWaiting: on('stepWaiting'), planWaiting: on('planWaiting'), finished: on('finished'), reviewDecision: on('reviewDecision'), activitySummaries: false };
}

function toPhone(n: JoseNotification, requests: JoseRequest[]): PhoneNotification {
  const button = n.buttons?.flat().find((b) => b.requestId);
  const requestId = button?.requestId || (n.key.startsWith('memwait:') ? n.key.split(':')[1] : n.key.split(':')[0]);
  const stepId = n.buttons?.flat().find((b) => b.action === 'approve')?.stepId;
  let actions: PhoneNotification['actions'] = ['open'];
  if (n.kind === 'step_waiting' && stepId) {
    const step = requests.find((r) => r.id === requestId)?.steps.find((s) => s.stepId === stepId);
    const locked = (step?.effects || []).some((e) => LOCKED_EFFECTS.includes(e));
    if (!locked && !step?.hermesApproval) actions = ['approve', 'reject', 'open'];
  }
  return { key: n.key, title: TITLES[n.kind], body: redactText(n.text), requestId, ...(stepId ? { stepId } : {}), actions };
}

/** What to tell the phones now, skipping keys already sent. Pure. */
export function phoneNotificationsFor(requests: JoseRequest[], sent: Set<string>, nowMs: number = Date.now()): PhoneNotification[] {
  return collectJoseNotifications(requests, sent, phoneNotifySettings(), nowMs).map((n) => toPhone(n, requests));
}

function readSent(): string[] | null {
  try { const raw = localStorage.getItem(PHONE_NOTIFY_SENT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeSent(keys: string[]): void {
  try { localStorage.setItem(PHONE_NOTIFY_SENT_KEY, JSON.stringify(keys.slice(-SENT_KEPT))); } catch { /* full */ }
}

/** Watch the requests and push what's new. The first start counts what's there as sent. */
export function startPhoneNotifications(deps: { push: (n: PhoneNotification) => void; requests?: () => JoseRequest[]; intervalMs?: number; now?: () => number }): () => void {
  const requests = deps.requests ?? listJoseRequests;
  const now = deps.now ?? (() => Date.now());
  if (readSent() === null) {
    const all = collectJoseNotifications(requests(), new Set(), { stepWaiting: true, planWaiting: true, finished: true, reviewDecision: true, activitySummaries: false }, now());
    writeSent(all.map((n) => n.key));
  }
  const check = () => {
    const sent = readSent() || [];
    const fresh = phoneNotificationsFor(requests(), new Set(sent), now());
    if (fresh.length === 0) return;
    writeSent([...sent, ...fresh.map((n) => n.key)]);
    for (const n of fresh) deps.push(n);
  };
  check();
  const off = deps.requests ? () => {} : onRequestStatusChange(() => check());
  const timer = deps.intervalMs === 0 ? null : setInterval(check, deps.intervalMs ?? CHECK_EVERY_MS);
  return () => { off(); if (timer) clearInterval(timer); };
}
