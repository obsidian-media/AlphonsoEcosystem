// What Jose tells you on Telegram (phase 5, owner 2026-10-23): a step that
// waits for you (Approve / Reject), a plan that waits (Run / Cancel), a
// request that finished or failed, and a review that asks you to decide; each
// kind can be switched off in Settings. A request cut off when the app closed
// is always sent, with Carry on. Built from the saved requests; a durable log
// keeps anything from being sent twice, also after a restart.
import { describeSend } from '../marcus/describeSend';
import { describeOutsideCall } from '../marcus/outsideCall';
import { describeCodeChange } from '../alphonso/changeSet';
import { getCleanup as readCleanupSet } from '../echo/cleanupStore';
import { EFFECT_LABELS, type JoseEffect } from './joseEffects';
import { agentName } from './agentNames';
import { describeHermesApproval } from '../hermes/hermesConstants';
import type { JoseRequest } from './joseRequestStore';

export type JoseButtonAction = 'approve' | 'reject' | 'run' | 'cancel' | 'carry_on' | 'cancel_request' | 'pick_project' | 'pick_forget' | 'apply_cleanup' | 'dismiss_cleanup';

export interface JoseButton {
  text: string;
  action: JoseButtonAction;
  requestId: string;
  stepId?: string;
  /** "Which project" (agent phase 6): the project this button picks. */
  project?: string;
  /** Echo's "Which one should I forget?" (agent phase 7): the decision this button picks. */
  decisionId?: string;
}

export interface JoseNotification {
  key: string;
  kind: 'step_waiting' | 'plan_waiting' | 'finished' | 'review_decision' | 'interrupted' | 'setup_needed' | 'memory_wait';
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
  if (step.waitFor) return `${agentName(step.agent)}'s next step waits for you: ${cut(step.waitFor, 300)}\nFor: ${cut(request.text, 200)}`;
  // A prepared Marcus send says exactly what goes where (agent phase 5).
  if (step.sendPreview) return `${agentName(step.agent)} wants to: ${cut(describeSend(step.sendPreview), 600)}
For: ${cut(request.text, 200)}`;
  // A prepared outside-tool call says exactly what it does (2026-10-30).
  if (step.outsideCall) return `${agentName(step.agent)} wants to: ${cut(describeOutsideCall(step.outsideCall), 600)}
For: ${cut(request.text, 200)}`;
  // A prepared Alphonso change says exactly what changes and runs (agent phase 6).
  if (step.codePreview) return `${agentName(step.agent)} wants to: ${cut(describeCodeChange(step.codePreview), 600)}
For: ${cut(request.text, 200)}`;
  const effects = (step.effects || []).filter((e) => e !== 'read').map((e) => EFFECT_LABELS[e as JoseEffect].toLowerCase());
  const what = cut(step.instruction || step.actionType, 300);
  const cost = Number.isFinite(step.costEstimateUsd) ? ` (about $${Number(step.costEstimateUsd).toFixed(2)})` : '';
  return `${agentName(step.agent)} wants to ${effects.join(', ') || 'do this'}: ${what}${cost}\nFor: ${cut(request.text, 200)}`;
}

/** The notifications not yet sent, for the kinds that are switched on. Pure. */
/** A step waiting for memory longer than this is told once (resource manager, 2026-10-30). */
export const MEMORY_WAIT_NOTICE_MS = 10 * 60_000;

export function collectJoseNotifications(requests: JoseRequest[], sent: Set<string>, settings: JoseTelegramSettings, nowMs: number = Date.now()): JoseNotification[] {
  const out: JoseNotification[] = [];
  const add = (notification: JoseNotification) => { if (!sent.has(notification.key)) out.push(notification); };
  for (const request of requests) {
    if (settings.stepWaiting) {
      for (const step of request.steps.filter((s) => s.waitingFor && typeof s.waitingSinceMs === 'number')) {
        const waited = nowMs - (step.waitingSinceMs as number);
        if (waited <= MEMORY_WAIT_NOTICE_MS) continue;
        add({
          key: `memwait:${request.id}:${step.stepId}`,
          kind: 'memory_wait',
          text: `${agentName(step.agent)}'s step has waited ${Math.floor(waited / 60_000)} minutes. ${step.waitingFor}`,
        });
      }
      // A Hermes run asking to do something (Hermes gateway, 2026-10-30): its request keeps running.
      for (const step of request.status === 'running' ? request.steps.filter((s) => s.status === 'waiting_approval' && s.hermesApproval) : []) {
        const approval = step.hermesApproval as NonNullable<typeof step.hermesApproval>;
        add({
          key: `${request.id}:hermes:${step.stepId}:${approval.runId}`,
          kind: 'step_waiting',
          text: `${cut(describeHermesApproval({ agent: step.agent, ...approval }), 600)}\nFor: ${cut(request.text, 200)}`,
          buttons: [[
            { text: 'Approve', action: 'approve', requestId: request.id, stepId: step.stepId },
            { text: 'Reject', action: 'reject', requestId: request.id, stepId: step.stepId },
          ]],
        });
      }
    }
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
    if (request.status === 'waiting_setup') {
      for (const s of request.steps.filter((x) => x.status === 'setup_needed')) {
        // Echo's "Which one should I forget?" (agent phase 7): one button per decision.
        if (Array.isArray((s as any).decisionChoices) && (s as any).decisionChoices.length) {
          add({
            key: `${request.id}:forget:${s.stepId}:${request.updatedAtMs}`,
            kind: 'setup_needed',
            text: `${agentName(s.agent)} asks: ${cut(String(s.error || ''), 300)}\nFor: ${cut(request.text, 200)}`,
            buttons: [(s as any).decisionChoices.map((c: { id: string; text: string }) => ({ text: cut(c.text, 40), action: 'pick_forget' as const, requestId: request.id, stepId: s.stepId, decisionId: c.id }))],
          });
          continue;
        }
        // Echo's cleanup (agent phase 7): Apply all / Not now.
        if ((s as any).cleanupSetId) {
          const set = readCleanupSet(String((s as any).cleanupSetId));
          add({
            key: `${request.id}:cleanup:${s.stepId}:${request.updatedAtMs}`,
            kind: 'setup_needed',
            text: `Echo proposes ${set?.proposals?.length ?? 0} changes to memory: ${(set?.proposals || []).slice(0, 3).map((p: { reason: string }) => p.reason).join(' ')}`.trim(),
            buttons: [[
              { text: 'Apply all', action: 'apply_cleanup', requestId: request.id, stepId: s.stepId },
              { text: 'Not now', action: 'dismiss_cleanup', requestId: request.id, stepId: s.stepId },
            ]],
          });
          continue;
        }
        // "Which project" (agent phase 6): one button per project.
        if (Array.isArray(s.projectChoices) && s.projectChoices.length) {
          add({
            key: `${request.id}:project:${s.stepId}:${request.updatedAtMs}`,
            kind: 'setup_needed',
            text: `${agentName(s.agent)} asks: ${cut(String(s.error || ''), 300)}\nFor: ${cut(request.text, 200)}`,
            buttons: [s.projectChoices.map((project) => ({ text: project, action: 'pick_project' as const, requestId: request.id, stepId: s.stepId, project }))],
          });
          continue;
        }
        add({
          key: `${request.id}:setup:${s.stepId}:${request.updatedAtMs}`,
          kind: 'setup_needed',
          text: `${agentName(s.agent)} needs something set up: ${cut(String(s.error || ''), 300)}`,
          buttons: [[{ text: 'Carry on', action: 'carry_on', requestId: request.id }, { text: 'Cancel', action: 'cancel_request', requestId: request.id }]],
        });
      }
    }
    if (request.status === 'interrupted') {
      add({
        key: `${request.id}:interrupted:${request.updatedAtMs}`,
        kind: 'interrupted',
        text: `Cut off when the app closed: ${cut(request.text, 200)}`,
        buttons: [[{ text: 'Carry on', action: 'carry_on', requestId: request.id }, { text: 'Cancel', action: 'cancel_request', requestId: request.id }]],
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

type SavedButton = { action: JoseButtonAction; requestId: string; stepId?: string; project?: string; decisionId?: string; atMs: number };

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
  saved[token] = { action: button.action, requestId: button.requestId, ...(button.stepId ? { stepId: button.stepId } : {}), ...(button.project ? { project: button.project } : {}), ...(button.decisionId ? { decisionId: button.decisionId } : {}), atMs: Date.now() };
  const kept = Object.entries(saved).sort((a, b) => b[1].atMs - a[1].atMs).slice(0, BUTTONS_KEPT);
  writeJson(BUTTONS_KEY, Object.fromEntries(kept));
  return token;
}

/** What a pressed button means, or null when it is unknown or older than 7 days. */
export function readButtonToken(data: string, nowMs: number = Date.now()): { action: JoseButtonAction; requestId: string; stepId?: string; project?: string; decisionId?: string } | null {
  if (!/^j:[A-Za-z0-9]{8}$/.test(String(data || ''))) return null;
  const saved = readJson<Record<string, SavedButton>>(BUTTONS_KEY, {})[data];
  if (!saved || nowMs - saved.atMs > BUTTON_TTL_MS) return null;
  return { action: saved.action, requestId: saved.requestId, ...(saved.stepId ? { stepId: saved.stepId } : {}), ...(saved.project ? { project: saved.project } : {}), ...(saved.decisionId ? { decisionId: saved.decisionId } : {}) };
}
