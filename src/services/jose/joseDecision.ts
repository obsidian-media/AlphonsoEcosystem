// Everything goes to Jose (owner): for each message he decides whether to
// answer directly or make a plan. Clear questions skip his model so most chat
// is as fast as before (owner, 2026-10-23). If his model fails, is too slow or
// answers something unusable, today's word rule decides.
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §4 step 2
import { generateAgentLlmResponse } from '../../lib/ollama';
import { isPlainQuestion, shouldRouteThroughJose } from '../../lib/chatUtils';
import { asksToCleanUpMemory, asksToForget, asksToRemember, parseJoseCommand } from '../joseCommandRouterService';
import { parseTeamRequest } from './teams';

export const DECISION_TIMEOUT_MS = 20000;

export interface JoseRouteDecision {
  route: 'direct' | 'plan';
  source: 'rule' | 'model' | 'fallback';
  reason: string;
}

const EXPLICIT_JOSE = /^(\/jose\b|ask\s+jose\b|jose[:\s])/i;

function fallback(text: string, why: string): JoseRouteDecision {
  return { route: shouldRouteThroughJose(text) ? 'plan' : 'direct', source: 'fallback', reason: why };
}

function readDecision(raw: string): { route: 'direct' | 'plan'; reason: string } | null {
  const text = String(raw || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (parsed?.route === 'direct' || parsed?.route === 'plan') {
      return { route: parsed.route, reason: typeof parsed.reason === 'string' ? parsed.reason : '' };
    }
  } catch { /* not JSON: the fallback decides */ }
  return null;
}

/** How many different kinds of work a message asks for: research, writing, a check, a send, code. */
// Asking for research by name is Hector's work: he searches and cites sources. Until 2.11.0 QA
// (owner, 2026-11-01) a small model answered "research the latest trends in AI agents" from memory.
const ASKS_FOR_RESEARCH = /^(?:(?:please|can you|could you|would you|pls)\s+)?(?:research|look\s+up|look\s+into|find\s+out|investigate|dig\s+into|search\s+(?:for|the\s+web))\b|\b(?:do|run|some)\s+research\b|\b(?:with|cite|citing|include)\s+(?:the\s+)?sources\b/i;

export function asksForResearch(text: string): boolean {
  return ASKS_FOR_RESEARCH.test(String(text || '').trim());
}

function kindsOfWork(text: string): number {
  const { intents } = parseJoseCommand(text);
  return [intents.research, intents.writing, intents.check, intents.publishing, intents.localExecution].filter(Boolean).length;
}

export async function decideJoseRoute(text: string, options: { history?: { role: string; content: string }[] } = {}): Promise<JoseRouteDecision> {
  const value = String(text || '').trim();
  if (EXPLICIT_JOSE.test(value)) return { route: 'plan', source: 'rule', reason: 'Asked Jose by name.' };
  // Agent roles Part C1: a team asked for by name runs its own steps.
  if (parseTeamRequest(value)) return { route: 'plan', source: 'rule', reason: 'A team asked for by name.' };
  // Agent phase 7: remembering, forgetting and tidying memory are Echo's steps.
  if (asksToRemember(value) || asksToForget(value) || asksToCleanUpMemory(value)) return { route: 'plan', source: 'rule', reason: 'A memory request: Echo does that.' };
  if (asksForResearch(value)) return { route: 'plan', source: 'rule', reason: 'Research asked for: Hector searches and cites sources.' };
  if (isPlainQuestion(value)) return { route: 'direct', source: 'rule', reason: 'A plain question.' };
  // QA batch 0: research, writing, a check, a send or code: two or more of them can't be one reply,
  // whatever the model thinks (a small model answered such a request in Chat).
  if (kindsOfWork(value) >= 2) return { route: 'plan', source: 'rule', reason: 'Several kinds of work.' };

  const recent = (options.history || []).slice(-4).map((m) => `${m.role}: ${String(m.content).slice(0, 300)}`).join('\n');
  const prompt = [
    'You are Jose, the orchestrator. Decide whether to answer this message directly, or to plan work for your agents.',
    'Answer directly for conversation, questions and anything one reply can do. Plan when something must be researched, written, made, built, checked or sent.',
    'Plan when the message asks to remember or forget something, or to clean up memory: Echo does that.',
    recent ? `Recent conversation:\n${recent}` : '',
    `Message: ${value}`,
    'Answer with JSON only: {"route": "direct" or "plan", "reason": "<short reason>"}',
  ].filter(Boolean).join('\n\n');

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve('timeout');
    }, DECISION_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([
      generateAgentLlmResponse('jose', { prompt, format: 'json', signal: controller.signal }),
      timeout,
    ]);
    if (result === 'timeout') return fallback(value, "Jose's model took too long to decide.");
    const decision = readDecision(String(result?.response || ''));
    return decision ? { ...decision, source: 'model' } : fallback(value, "Jose's model gave no clear decision.");
  } catch {
    return fallback(value, "Jose's model isn't available.");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
