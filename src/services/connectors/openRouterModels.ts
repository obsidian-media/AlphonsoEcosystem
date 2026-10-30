// OpenRouter (2026-10-30): which free models the picker offers, and a test question before a
// chosen one is used. OpenRouter's free models come and go, so a model it no longer serves
// (404, or past its listed expiry) is shown as such and remembered. Free requests are scarce
// (50 a day before $10 of credit), so the test asks one model at a time, at most three, at
// most once a day per model, and never asks the router, which OpenRouter keeps serving.
import { OPENROUTER_CHOOSE_FREE, openRouterFailure, sendOpenRouterMessage, type OpenRouterModel } from './openRouterConnector';

export { OPENROUTER_CHOOSE_FREE };
export const OPENROUTER_CHOOSE_FREE_LABEL = 'Let OpenRouter choose a free model';
export const OPENROUTER_CHAT_LIMIT = "OpenRouter's free limit is reached. Try again later, or switch to another provider.";
export const OPENROUTER_FREE_PRIVACY = 'Free models are run by other companies through OpenRouter; some may keep what you send.';

const NOT_SERVED_KEY = 'alphonso_openrouter_models_not_served_v1';
const TESTED_KEY = 'alphonso_openrouter_tested_v1';
const KEEP_NOT_SERVED = 200;
const MAX_TRIES = 3;

export interface FreeModelChoice {
  id: string;
  label: string;
  served: boolean;
}

function readList(key: string): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(saved) ? saved.filter((m) => typeof m === 'string') : [];
  } catch {
    return [];
  }
}

/** Free models OpenRouter answered "not served" for, as remembered on this computer. */
export function openRouterModelsNotServed(): string[] {
  return readList(NOT_SERVED_KEY);
}

export function rememberNotServed(id: string): void {
  try {
    const all = [...openRouterModelsNotServed().filter((m) => m !== id), id].slice(-KEEP_NOT_SERVED);
    localStorage.setItem(NOT_SERVED_KEY, JSON.stringify(all));
  } catch {
    // Storage unavailable: the next test simply asks again.
  }
}

const today = () => new Date().toISOString().slice(0, 10);

function testedToday(id: string): boolean {
  try {
    return JSON.parse(localStorage.getItem(TESTED_KEY) || '{}')[id] === today();
  } catch {
    return false;
  }
}

function rememberTested(id: string): void {
  try {
    const saved = JSON.parse(localStorage.getItem(TESTED_KEY) || '{}');
    const kept = Object.fromEntries(Object.entries(saved && typeof saved === 'object' ? saved : {}).filter(([, day]) => day === today()));
    localStorage.setItem(TESTED_KEY, JSON.stringify({ ...kept, [id]: today() }));
  } catch {
    // Storage unavailable: the model is tested again next time.
  }
}

const contextLabel = (tokens: number) => (tokens > 0 ? ` (${Math.round(tokens / 1024)}k)` : '');

/** The router first, then OpenRouter's free models by name; never a paid model. */
export function freeModelChoices(models: OpenRouterModel[], nowMs: number): FreeModelChoice[] {
  const gone = new Set(openRouterModelsNotServed());
  const free = models.filter((m) => m.free && m.textOutput !== false && m.id !== OPENROUTER_CHOOSE_FREE).sort((a, b) => a.name.localeCompare(b.name));
  const choices: FreeModelChoice[] = [{ id: OPENROUTER_CHOOSE_FREE, label: OPENROUTER_CHOOSE_FREE_LABEL, served: true }];
  for (const m of free) {
    const served = !gone.has(m.id) && !(m.expiresAtMs !== null && m.expiresAtMs <= nowMs);
    choices.push({ id: m.id, label: `${m.name}${contextLabel(m.contextLength)}${served ? '' : ' (no longer served)'}`, served });
  }
  return choices;
}

/**
 * The first of the candidates that answers a short question. A model that answers with no
 * text (a thinking model cut short) still counts. Stops at a rate limit or a refused key
 * rather than spending more free requests, with the reason.
 */
export async function findWorkingOpenRouterModel(candidates: string[]): Promise<{ model: string | null; skipped: string[]; reason?: string }> {
  const gone = new Set(openRouterModelsNotServed());
  const skipped: string[] = [];
  let tries = 0;
  for (const id of candidates) {
    if (id === OPENROUTER_CHOOSE_FREE || testedToday(id)) return { model: id, skipped };
    if (gone.has(id)) continue;
    if (tries >= MAX_TRIES) break;
    tries += 1;
    const failure = openRouterFailure(await sendOpenRouterMessage([{ role: 'user', content: 'Reply with the word OK.' }], { model: id, maxTokens: 16, timeoutSecs: 20 }));
    if (!failure || failure.kind === 'no_text') {
      rememberTested(id);
      return { model: id, skipped };
    }
    if (failure.kind === 'not_served') {
      rememberNotServed(id);
      skipped.push(id);
      continue;
    }
    if (failure.kind === 'rate_limited' || failure.kind === 'key_refused') return { model: null, skipped, reason: failure.message };
    skipped.push(id);
  }
  return { model: null, skipped };
}
