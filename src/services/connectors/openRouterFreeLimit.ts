// OpenRouter (2026-10-30): when OpenRouter's free daily limit runs out, a step never just
// fails. Settings → Approvals → "When OpenRouter's free limit runs out" (`openRouterFreeLimit`):
// 'local' (default) carries the step on with this computer's model and says so; 'paid' fails
// the step with FREE_LIMIT_PAID so Jose's paid retry offers a paid OpenRouter model, which asks
// with its cost. 'paid' works only when paid models are allowed with OpenRouter as the paid
// choice; otherwise it behaves as 'local'. The per-minute limit (20 a minute) is told apart
// from the daily one by reading the free requests left.
import {
  forgetOpenRouterKeyInfo,
  getOpenRouterKeyInfo,
  openRouterFailure,
  sendOpenRouterMessage,
  type OpenRouterAnswer,
  type OpenRouterMessage,
} from './openRouterConnector';
import { getPaidModelSettings, paidModelAvailable } from '../jose/joseSpend';

export const FREE_LIMIT_LOCAL = (model: string) => `OpenRouter's free limit for today is used up; this step ran on ${model} on this computer.`;
export const FREE_LIMIT_PAID = "OpenRouter's free limit for today is used up. Jose will ask to finish this step with a paid OpenRouter model.";
export const FREE_LIMIT_NO_LOCAL = "OpenRouter's free limit for today is used up, and no model on this computer can take over. Start Ollama with a chat model, then Carry on.";
export const OPENROUTER_BUSY = 'OpenRouter is busy. Try again in a minute.';

const SETTINGS_KEY = 'alphonso_settings';
const USED_KEY = 'alphonso_openrouter_free_limit_v1';
const DEFAULT_WAIT_SECS = 20;
const MAX_WAIT_SECS = 60;

export type FreeLimitChoice = 'local' | 'paid';
export type FreeOutcome = { kind: 'answer'; content: string; model: string } | { kind: 'local' };

let wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export function setWaitForTests(fn: (ms: number) => Promise<void>): void {
  wait = fn;
}

export function getFreeLimitChoice(): FreeLimitChoice {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')?.openRouterFreeLimit === 'paid' ? 'paid' : 'local';
  } catch {
    return 'local';
  }
}

export function nextMidnightUtc(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** Until when the free limit is used up, or null when free requests may be left. */
export function freeLimitUsedUntil(nowMs: number): number | null {
  try {
    const until = Number(JSON.parse(localStorage.getItem(USED_KEY) || '{}')?.untilMs);
    return Number.isFinite(until) && until > nowMs ? until : null;
  } catch {
    return null;
  }
}

export function markFreeLimitUsed(untilMs: number): void {
  try {
    localStorage.setItem(USED_KEY, JSON.stringify({ untilMs }));
  } catch {
    // Storage unavailable: OpenRouter is simply asked again next time.
  }
}

// What a step's model did, kept per agent until the engine takes it after the step
// (the same per-agent pattern as withAgentModel).
const notes = new Map<string, string[]>();
const setupNeeded = new Map<string, string>();

export function noteModel(agentId: string, text: string): void {
  notes.set(agentId, [...(notes.get(agentId) || []), text]);
}

export function takeModelNotes(agentId: string): string[] {
  const taken = notes.get(agentId) || [];
  notes.delete(agentId);
  return taken;
}

/** The step can't go on until something is set up (the engine makes it wait with Carry on). */
export function markSetupNeeded(agentId: string, reason: string): void {
  setupNeeded.set(agentId, reason);
}

export function takeSetupNeeded(agentId: string): string | null {
  const reason = setupNeeded.get(agentId) ?? null;
  setupNeeded.delete(agentId);
  return reason;
}

/** After the free limit is used up: carry on here, or ask for a paid OpenRouter model. */
function afterLimit(agentId: string): FreeOutcome {
  const paidOpenRouter = String(getPaidModelSettings().provider) === 'openrouter' && paidModelAvailable().ok;
  if (getFreeLimitChoice() === 'paid' && paidOpenRouter) {
    noteModel(agentId, FREE_LIMIT_PAID);
    throw new Error(FREE_LIMIT_PAID);
  }
  return { kind: 'local' };
}

const answered = (result: OpenRouterAnswer): FreeOutcome => ({ kind: 'answer', content: result.content, model: result.model });

/**
 * A free OpenRouter model's answer, or { kind: 'local' } when the step should run on this
 * computer's model instead. Throws FREE_LIMIT_PAID (the paid retry follows), OPENROUTER_BUSY,
 * or OpenRouter's own reason.
 */
export async function askOpenRouterFree(agentId: string, messages: OpenRouterMessage[], model: string, nowMs = Date.now()): Promise<FreeOutcome> {
  if (freeLimitUsedUntil(nowMs)) return afterLimit(agentId);
  const first = await sendOpenRouterMessage(messages, { model });
  const failure = openRouterFailure(first);
  if (!failure) return answered(first as OpenRouterAnswer);
  if (failure.kind !== 'rate_limited') throw new Error(failure.message);

  if (!failure.providerLimited) {
    forgetOpenRouterKeyInfo();
    const info = await getOpenRouterKeyInfo();
    if (!info || info.freeRemaining <= 0) {
      markFreeLimitUsed(failure.resetMs && failure.resetMs > nowMs ? failure.resetMs : nextMidnightUtc(nowMs));
      return afterLimit(agentId);
    }
  }
  // The per-minute limit, or the model's own provider busy: wait once and ask again.
  await wait(Math.min(failure.retryAfterSecs ?? DEFAULT_WAIT_SECS, MAX_WAIT_SECS) * 1000);
  const second = await sendOpenRouterMessage(messages, { model });
  const again = openRouterFailure(second);
  if (!again) return answered(second as OpenRouterAnswer);
  throw new Error(again.kind === 'rate_limited' ? OPENROUTER_BUSY : again.message);
}
