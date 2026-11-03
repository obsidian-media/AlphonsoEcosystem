// Phone phase 4 test round (throwaway, spike/phone-phase4): scores one answer to a question from
// phase4Questions.ts and sums up an engine's answers per agent. Design:
// docs/superpowers/specs/2026-11-02-alphonso-mobile-phase4-design.md
import { redactText } from '../../services/sentinel/exactChecks';
import { PHASE4_QUESTIONS, type SpikeAgent, type SpikeQuestion } from './phase4Questions';

export interface SpikeAnswer {
  questionId: string;
  /** 'phone', 'desktop' or 'cloud:<provider>'. */
  engine: string;
  model: string;
  text: string | null;
  ms: number;
  error: string | null;
  network?: 'wifi' | 'cellular' | 'none';
}

// The same verbs ALPHONSO_ANSWER_PROMPT forbids him to claim.
const CLAIMS_ACTION = /\bI(?:['’]ve|\s+have)?\s+(?:just\s+|already\s+)?(?:did|done|ran|run|changed|created|sent|saved)\b/i;

function routeOf(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const route = JSON.parse(text.slice(start, end + 1))?.route;
    return typeof route === 'string' ? route : null;
  } catch {
    return null;
  }
}

export function scoreAnswer(q: SpikeQuestion, a: SpikeAnswer): { pass: boolean; why: string } {
  if (a.error) return { pass: false, why: a.error };
  const text = String(a.text || '').trim();
  if (!text) return { pass: false, why: 'empty answer' };
  if (q.agent === 'jose') {
    const route = routeOf(text);
    if (!route) return { pass: false, why: 'no JSON route' };
    return route === q.expect.route ? { pass: true, why: 'route matches' } : { pass: false, why: `route ${route}, expected ${q.expect.route}` };
  }
  const lower = text.toLowerCase();
  const missing = (q.expect.contains || []).filter((fact) => !lower.includes(fact.toLowerCase()));
  if (missing.length) return { pass: false, why: `missing: ${missing.join(', ')}` };
  if (q.agent === 'alphonso') {
    if (CLAIMS_ACTION.test(text)) return { pass: false, why: 'claims it did something' };
    if (q.expect.mentionsJose && !/\bjose\b/i.test(text)) return { pass: false, why: 'does not say Jose can plan it' };
  }
  return { pass: true, why: 'ok' };
}

type AgentSummary = { passed: number; total: number; medianMs: number };

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function summarize(answers: SpikeAnswer[], questions?: SpikeQuestion[]): Record<string, Record<SpikeAgent, AgentSummary>> {
  const list = questions || PHASE4_QUESTIONS;
  const byId = new Map(list.map((q) => [q.id, q]));
  const out: Record<string, Record<SpikeAgent, AgentSummary>> = {};
  const times: Record<string, Record<SpikeAgent, number[]>> = {};
  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q) continue;
    out[a.engine] ||= { jose: { passed: 0, total: 0, medianMs: 0 }, alphonso: { passed: 0, total: 0, medianMs: 0 }, echo: { passed: 0, total: 0, medianMs: 0 } };
    times[a.engine] ||= { jose: [], alphonso: [], echo: [] };
    const row = out[a.engine][q.agent];
    row.total += 1;
    if (scoreAnswer(q, a).pass) row.passed += 1;
    if (!a.error) times[a.engine][q.agent].push(a.ms);
  }
  for (const engine of Object.keys(out)) {
    for (const agent of ['jose', 'alphonso', 'echo'] as SpikeAgent[]) out[engine][agent].medianMs = median(times[engine][agent]);
  }
  return out;
}

/** Hides keys in an answer or error before it is kept (Sentinel's redactText()). */
export function redactKeys(text: string): string {
  return redactText(String(text || ''));
}
