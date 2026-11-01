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
import type { ContentProject, StepId } from '../contentFactory/contentTypes';
import { versionMedia, type MediaRef } from './contentMirror';

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

// ---- "Ready to check" (phase 2) -------------------------------------------------------
// A picture or video step that finishes a new version tells the phone once, with a small
// still when the sealed push stays under PUSH_STILL_LIMIT (Apple and Google allow 4 KB).
export const PHONE_READY_SENT_KEY = 'alphonso_phone_ready_sent_v1';
export const PUSH_STILL_LIMIT = 3000;
const READY_STEPS: StepId[] = ['scenes', 'thumbnail', 'carousel', 'clips', 'assemble', 'shorts'];

/** About how many characters a notice takes once sealed (nonce, tag, base64). */
export function sealedNoticeChars(n: PhoneNotification): number {
  const raw = new TextEncoder().encode(JSON.stringify({ id: 'n-0000000000000-00000000', kind: 'notice', notification: n })).length + 40;
  return Math.ceil((raw * 4) / 3);
}

type Ready = { notice: PhoneNotification; media: MediaRef };

/** Each picture or video step's newest version, as a notice and the file for its still. Pure. */
export function readyToCheck(projects: ContentProject[]): Ready[] {
  const out: Ready[] = [];
  for (const project of projects) {
    for (const step of READY_STEPS) {
      const state = project.steps?.[step];
      if (!state || !['done', 'needs_approval', 'approved'].includes(state.status)) continue;
      const latest = [...(state.versions || [])].sort((a, b) => b.version - a.version)[0];
      if (!latest) continue;
      const media = versionMedia(project, latest.output);
      const first = media.find((m) => m.kind === 'video') || media[0];
      if (!first) continue;
      const body = first.kind === 'video'
        ? `Miya's video for ${project.name} is ready to check`
        : `Miya's pictures for ${project.name} are ready to check`;
      out.push({
        notice: { key: `ready:${project.id}:${step}:${latest.version}`, title: 'Ready to check', body: redactText(body), requestId: `project:${project.id}`, actions: ['open'] },
        media: first,
      });
    }
  }
  return out;
}

/** The notice with its still, or without it when the push would be too large. */
export function withStill(notice: PhoneNotification, still: string | null): PhoneNotification {
  if (!still) return notice;
  const full = { ...notice, still };
  return sealedNoticeChars(full) < PUSH_STILL_LIMIT ? full : notice;
}

function readReady(): string[] | null {
  try { const raw = localStorage.getItem(PHONE_READY_SENT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeReady(keys: string[]): void {
  try { localStorage.setItem(PHONE_READY_SENT_KEY, JSON.stringify(keys.slice(-SENT_KEPT))); } catch { /* full */ }
}

async function defaultProjects(): Promise<ContentProject[]> {
  const { listProjects } = await import('../contentFactory/contentProjectService');
  return listProjects();
}
async function defaultStill(ref: MediaRef): Promise<string | null> {
  const { makeStill } = await import('./phonePreviews');
  return makeStill(ref);
}

/** Watch the requests and push what's new. The first start counts what's there as sent. */
export function startPhoneNotifications(deps: {
  push: (n: PhoneNotification) => void;
  requests?: () => JoseRequest[];
  projects?: () => ContentProject[] | Promise<ContentProject[]>;
  still?: (ref: MediaRef) => Promise<string | null>;
  intervalMs?: number;
  now?: () => number;
}): () => void {
  const requests = deps.requests ?? listJoseRequests;
  const projects = deps.projects ?? defaultProjects;
  const still = deps.still ?? defaultStill;
  const now = deps.now ?? (() => Date.now());
  if (readSent() === null) {
    const all = collectJoseNotifications(requests(), new Set(), { stepWaiting: true, planWaiting: true, finished: true, reviewDecision: true, activitySummaries: false }, now());
    writeSent(all.map((n) => n.key));
  }
  // Ready to check: what is already there counts as sent the first time (its own log, so
  // phones paired before phase 2 aren't told about every project at once).
  const checkReady = async () => {
    let ready: Ready[];
    try { ready = readyToCheck(await projects()); } catch { return; }
    const sent = readReady();
    if (sent === null) { writeReady(ready.map((r) => r.notice.key)); return; }
    const fresh = ready.filter((r) => !sent.includes(r.notice.key));
    if (fresh.length === 0) return;
    writeReady([...sent, ...fresh.map((r) => r.notice.key)]);
    for (const r of fresh) deps.push(withStill(r.notice, await still(r.media).catch(() => null)));
  };
  const check = () => {
    void checkReady();
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
