// Finding the decisions that matter (agent phase 7): a ranked text search over the decision
// records (no model call), plus ChromaDB's meaning-based matches when it is running, and the
// standing preferences for a step's kind of work.
import { addMemoryToChroma, isChromaHealthy, semanticSearchMemory } from '../chromaDbService';
import { ECHO_LIMITS, listDecisions, activePreferences, type Decision, type Surface } from './decisions';

const STOP_WORDS = new Set(['what', 'when', 'where', 'which', 'with', 'that', 'this', 'about', 'from', 'have', 'they', 'them', 'there', 'their', 'your', 'were', 'will', 'would', 'should', 'could', 'into', 'than', 'then', 'also', 'just', 'like', 'make', 'write', 'tell', 'please']);

/** A word's stem, so "launching", "launched" and "launches" meet "launch". */
function stem(word: string): string {
  for (const suffix of ['ing', 'ed', 'es', 's', 'ly']) {
    if (word.length - suffix.length >= 4 && word.endsWith(suffix)) return word.slice(0, -suffix.length);
  }
  return word;
}

/** Whether ChromaDB runs, checked at most once a minute and never waited for: a search uses the
 *  last answer and starts a new check in the background (each check can wait 1.5 s; found in CI). */
const CHROMA_CHECK_MS = 60_000;
let chromaCheck: { atMs: number; running: boolean; pending: boolean } | null = null;
function chromaRunning(): Promise<boolean> {
  if (!chromaCheck || (!chromaCheck.pending && Date.now() - chromaCheck.atMs > CHROMA_CHECK_MS)) {
    const check = { atMs: Date.now(), running: chromaCheck?.running ?? false, pending: true };
    chromaCheck = check;
    isChromaHealthy().catch(() => false).then((running) => { check.running = running; check.pending = false; check.atMs = Date.now(); });
  }
  return Promise.resolve(chromaCheck.running);
}
export function resetChromaCheckForTests(): void { chromaCheck = null; }

/** The words that carry a decision's meaning: numbers and prices always, other words over three letters. */
export function contentWords(text: string): Set<string> {
  return new Set(String(text || '').toLowerCase().split(/[^a-z0-9$€£]+/)
    .filter((w) => /\d/.test(w) || (w.length > 3 && !STOP_WORDS.has(w)))
    .map(stem));
}

/** Two decisions that say the same thing in other words ("The launch …" / "Our launch …"). */
export const NEAR_REPEAT = 0.75;
export function nearlySame(a: string, b: string): boolean {
  const x = contentWords(a);
  const y = contentWords(b);
  if (!x.size || !y.size) return false;
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / new Set([...x, ...y]).size >= NEAR_REPEAT;
}

function stems(text: string): Set<string> {
  return new Set(String(text || '').toLowerCase().split(/[^a-z0-9$€£]+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
    .map(stem));
}

function score(d: Decision, query: Set<string>): number {
  const topics = stems(d.topics.join(' '));
  const body = stems(`${d.text} ${d.why || ''}`);
  let total = 0;
  for (const word of query) {
    if (topics.has(word)) total += 3;
    if (body.has(word)) total += 1;
  }
  return total;
}

/** The decisions that match a question or a step, best first. */
export async function searchDecisions(query: string, opts: { limit?: number; status?: 'active' | 'all' } = {}): Promise<Decision[]> {
  const limit = opts.limit ?? ECHO_LIMITS.recallMax;
  const pool = listDecisions({ status: opts.status === 'all' ? 'all' : 'active' });
  const words = stems(query);
  const found = pool
    .map((d) => ({ d, s: score(d, words) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.d.atMs - a.d.atMs)
    .map((x) => x.d);
  try {
    if (await chromaRunning()) {
      const byId = new Map(pool.map((d) => [d.id, d]));
      for (const hit of (await semanticSearchMemory(query, limit)) || []) {
        const d = byId.get(hit.id);
        if (d && !found.includes(d)) found.push(d);
      }
    }
  } catch { /* the text search stands on its own */ }
  return found.slice(0, limit);
}

/** Sends a decision to ChromaDB for meaning-based search; never throws. */
export function indexDecision(d: Decision): void {
  void Promise.resolve(addMemoryToChroma({ id: d.id, title: d.topics.join(', ') || d.kind, content: d.text, category: `decision_${d.kind}`, sourceAgent: 'echo', timestampMs: d.atMs } as never)).catch(() => undefined);
}

function applies(pref: Decision, agent?: string, actionType?: string): boolean {
  const to = pref.appliesTo || [];
  if (to.includes('all')) return true;
  if (agent && to.includes(agent)) return true;
  return Boolean(actionType && to.some((prefix) => actionType.startsWith(prefix)));
}

/** What a step gets: the preferences for its kind of work, then the decisions that match it. */
export async function decisionsFor(text: string, opts: { agent?: string; actionType?: string; large?: boolean } = {}): Promise<Decision[]> {
  const prefs = activePreferences().filter((p) => applies(p, opts.agent, opts.actionType));
  const matches = (await searchDecisions(text, { limit: ECHO_LIMITS.perStep })).filter((d) => d.kind !== 'preference' && !prefs.includes(d));
  return [...prefs, ...matches];
}

const SURFACE_NAMES: Record<Surface, string> = {
  chat: 'Chat', telegram: 'Telegram', whatsapp: 'WhatsApp', phone: 'Phone', schedule: 'Schedule', boardroom: 'Boardroom',
  miya: 'Miya Studio', project_execution: 'Project Execution', settings: 'Settings', other: 'Other',
};

export function surfaceName(surface: Surface): string {
  return SURFACE_NAMES[surface] || 'Other';
}

export function decisionLine(d: Decision): string {
  const label = d.kind === 'preference' ? 'Preference' : d.kind === 'rejection' ? 'You turned down' : 'Decided';
  const day = new Date(d.atMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${label} ${day} (${surfaceName(d.source.surface)}): ${d.text}${d.why ? ` — because ${d.why}` : ''}`;
}

/** For a direct answer (Chat, channels): "Decisions you saved:" with what matters, or ''. */
export async function answerDecisionsBlock(text: string): Promise<string> {
  const lines = decisionsText(await decisionsFor(text, { agent: 'alphonso', actionType: 'assistant_answer' }));
  return lines ? `Decisions you saved:\n${lines}` : '';
}

/** The block a step's input carries, cut at ECHO_LIMITS.stepChars (largeStepChars for large models). */
export function decisionsText(list: Decision[], large = false): string {
  const limit = large ? ECHO_LIMITS.largeStepChars : ECHO_LIMITS.stepChars;
  const lines: string[] = [];
  let used = 0;
  for (const d of list) {
    const line = decisionLine(d);
    if (used + line.length + 1 > limit) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}
