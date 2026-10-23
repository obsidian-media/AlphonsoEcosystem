// What Jose tells you on Telegram (phase 5, owner 2026-10-23): a step that
// waits for you (Approve / Reject), a plan that waits (Run / Cancel), a
// request that finished or failed, and a review that asks you to decide; each
// kind can be switched off in Settings. A request cut off when the app closed
// is always sent, with Carry on. Built from the saved requests; a durable log
// keeps anything from being sent twice, also after a restart.
import { EFFECT_LABELS, type JoseEffect } from './joseEffects';
import { agentName } from './agentNames';
import type { JoseRequest } from './joseRequestStore';

export type JoseButtonAction = 'approve' | 'reject' | 'run' | 'cancel' | 'carry_on';

export interface JoseButton {
  text: string;
  action: JoseButtonAction;
  requestId: string;
  stepId?: string;
}

export interface JoseNotification {
  key: string;
  kind: 'step_waiting' | 'plan_waiting' | 'finished' | 'review_decision' | 'interrupted';
  text: string;
  buttons?: JoseButton[][];
}

export interface JoseTelegramSettings {
  stepWaiting: boolean;
  planWaiting: boolean;
  finished: boolean;
  reviewDecision: boolean;
  /** The older "N agent actions since your last check" summaries; off unless you switch them on (owner, 2026-10-23). */
  activitySummaries: boolean;
}

const SENT_KEY = 'alphonso_jose_telegram_sent_v1';
const SENT_KEPT = 500;
const BUTTONS_KEY = 'alphonso_jose_telegram_buttons_v1';
const BUTTONS_KEPT = 200;
const BUTTON_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REVIEW_DECISION = /still found problems after \d+ rounds/;

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full */ }
}

export function getJoseTelegramSettings(): JoseTelegramSettings {
  const saved = readJson<Record<string, any>>('alphonso_settings', {})?.joseTelegram || {};
  return {
    stepWaiting: saved.stepWaiting !== false,
    planWaiting: saved.planWaiting !== false,
    finished: saved.finished !== false,
    reviewDecision: saved.reviewDecision !== false,
    activitySummaries: saved.activitySummaries === true,
  };
}

function stepText(request: JoseRequest, step: JoseRequest['steps'][number]): string {
  const effects = (step.effects || []).filter((e) => e !== 'read').map((e) => EFFECT_LABELS[e as JoseEffect].toLowerCase());
  const what = cut(step.instruction || step.actionType, 300);
  const cost = Number.isFinite(step.costEstimateUsd) ? ` (about $${Number(step.costEstimateUsd).toFixed(2)})` : '';
  return `${agentName(step.agent)} wants to ${effects.join(', ') || 'do this'}: ${what}${cost}\nFor: ${cut(request.text, 200)}`;
}

/** The notifications not yet sent, for the kinds that are switched on. Pure. */
export function collectJoseNotifications(requests: JoseRequest[], sent: Set<string>, settings: JoseTelegramSettings): JoseNotification[] {
  const out: JoseNotification[] = [];
  const add = (notification: JoseNotification) => { if (!sent.has(notification.key)) out.push(notification); };
  for (const request of requests) {
    if (request.status === 'waiting_approval' && settings.stepWaiting) {
      for (const step of request.steps.filter((s) => s.status === 'waiting_approval')) {
        add({
          key: `${request.id}:step_waiting:${step.stepId}:${step.startedAtMs || ''}`,
          kind: 'step_waiting',
          text: stepText(request, step),
          buttons: [[
            { text: 'Approve', action: 'approve', requestId: request.id, stepId: step.stepId },
            { text: 'Reject', action: 'reject', requestId: request.id, stepId: step.stepId },
          ]],
        });
      }
    }
    if (request.status === 'waiting_plan_approval' && settings.planWaiting) {
      const lines = request.steps.map((s, i) => `${i + 1}. ${agentName(s.agent)}: ${cut(s.instruction || s.actionType, 120)}`);
      add({
        key: `${request.id}:plan_waiting:${request.createdAtMs}`,
        kind: 'plan_waiting',
        text: [`Jose's plan for: ${cut(request.text, 200)}`, ...lines].join('\n'),
        buttons: [[
          { text: 'Run this plan', action: 'run', requestId: request.id },
          { text: 'Cancel', action: 'cancel', requestId: request.id },
        ]],
      });
    }
    // Not for each content-factory step: those are steps of a project, not your requests.
    if ((request.status === 'done' || request.status === 'failed') && settings.finished && request.source !== 'content-factory') {
      const error = request.steps.find((s) => s.status === 'failed' && s.error)?.error;
      add({
        key: `${request.id}:finished:${request.status}`,
        kind: 'finished',
        text: request.status === 'done'
          ? `Done: ${cut(request.text, 200)}`
          : `Failed: ${cut(request.text, 200)}${error ? ` — ${cut(error, 200)}` : ''}`,
      });
    }
    if (settings.reviewDecision) {
      for (const entry of (request.changeLog || []).filter((c) => REVIEW_DECISION.test(c.text))) {
        add({ key: `${request.id}:review:${entry.atMs}`, kind: 'review_decision', text: `${cut(request.text, 120)}: ${cut(entry.text, 600)}` });
      }
    }
    if (request.status === 'interrupted') {
      add({
        key: `${request.id}:interrupted:${request.updatedAtMs}`,
        kind: 'interrupted',
        text: `Cut off when the app closed: ${cut(request.text, 200)}`,
        buttons: [[{ text: 'Carry on', action: 'carry_on', requestId: request.id }]],
      });
    }
  }
  return out;
}

export function sentKeys(): Set<string> {
  return new Set(readJson<string[]>(SENT_KEY, []));
}

export function wasSent(key: string): boolean {
  return sentKeys().has(key);
}

export function markSent(key: string): void {
  const keys = readJson<string[]>(SENT_KEY, []).filter((k) => k !== key);
  keys.push(key);
  writeJson(SENT_KEY, keys.slice(-SENT_KEPT));
}

/**
 * The first time (no log yet): count everything already there as sent, so
 * switching Telegram on doesn't send the whole history. True when it seeded.
 */
export function seedSentLog(requests: JoseRequest[]): boolean {
  if (localStorage.getItem(SENT_KEY) !== null) return false;
  const all = { stepWaiting: true, planWaiting: true, finished: true, reviewDecision: true, activitySummaries: false };
  writeJson(SENT_KEY, collectJoseNotifications(requests, new Set(), all).map((n) => n.key).slice(-SENT_KEPT));
  return true;
}

type SavedButton = { action: JoseButtonAction; requestId: string; stepId?: string; atMs: number };

function randomCode(length: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => letters[b % letters.length]).join('');
}

/** A short code for a button's data (Telegram allows 64 bytes), saved for 7 days. */
export function buttonToken(button: JoseButton): string {
  const saved = readJson<Record<string, SavedButton>>(BUTTONS_KEY, {});
  const token = `j:${randomCode(8)}`;
  saved[token] = { action: button.action, requestId: button.requestId, ...(button.stepId ? { stepId: button.stepId } : {}), atMs: Date.now() };
  const kept = Object.entries(saved).sort((a, b) => b[1].atMs - a[1].atMs).slice(0, BUTTONS_KEPT);
  writeJson(BUTTONS_KEY, Object.fromEntries(kept));
  return token;
}

/** What a pressed button means, or null when it is unknown or older than 7 days. */
export function readButtonToken(data: string, nowMs: number = Date.now()): { action: JoseButtonAction; requestId: string; stepId?: string } | null {
  if (!/^j:[A-Za-z0-9]{8}$/.test(String(data || ''))) return null;
  const saved = readJson<Record<string, SavedButton>>(BUTTONS_KEY, {})[data];
  if (!saved || nowMs - saved.atMs > BUTTON_TTL_MS) return null;
  return { action: saved.action, requestId: saved.requestId, ...(saved.stepId ? { stepId: saved.stepId } : {}) };
}
