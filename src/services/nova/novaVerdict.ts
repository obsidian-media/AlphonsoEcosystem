// Nova's ranked verdict (agent phase 2, owner 2026-10-25): every option in order with
// why, value / effort / risk in words and the sources that support it; what to do first;
// what would change her mind. Her model judges; no keyword scores, no fallback numbers.
import { skillSection, stepInputText, type StepInput } from '../jose/stepInput';

export type Level = 'high' | 'medium' | 'low';

export interface VerdictOption {
  name: string;
  rank: number;
  why: string;
  value: Level;
  effort: Level;
  risk: Level;
  sources: number[];
  notJudged?: true;
}

export interface NovaVerdict {
  doFirst: string;
  options: VerdictOption[];
  wouldChange: string;
  /** Only when there is exactly one option. */
  score?: number;
  fromRequestOnly: boolean;
}

const LEVELS: Level[] = ['high', 'medium', 'low'];
const MAX_OPTIONS = 8;
const MAX_OPTION_CHARS = 80;
const CHOOSING_VERB = /\b(?:do|choose|pick|start|try|launch|focus on|go with|invest in)\s+(.+)$/i;
const SPLIT = /\s*,\s*(?:or\s+|and\s+)?|\s+or\s+|\s+and\s+/i;
const STOP = new Set(['the', 'a', 'an', 'of', 'for', 'and', 'or', 'with', 'from', 'that', 'this', 'your', 'our']);

function clean(item: string): string {
  return item.replace(/^\s*(?:or|and)\s+/i, '').replace(/^[\s\-*•\d.)]+/, '').replace(/[\s.?!;:]+$/, '').trim();
}

function asList(items: string[]): string[] {
  const list = items.map(clean).filter(Boolean);
  if (list.length < 2 || list.length > MAX_OPTIONS || list.some((i) => i.length > MAX_OPTION_CHARS)) return [];
  return list;
}

/** The options a request names: a list after a colon, a bulleted list, or "start A or B?". */
export function namedOptions(text: string): string[] {
  const value = String(text || '').replace(/^\s*\/jose\s+/i, '');
  const bullets = value.split('\n').filter((l) => /^\s*(?:[-*•]|\d+[.)])\s+\S/.test(l));
  if (bullets.length >= 2) return asList(bullets);
  const question = value.includes('?') ? value.slice(0, value.indexOf('?')) : '';
  const colon = value.lastIndexOf(':', question ? value.indexOf('?') : value.length);
  if (colon >= 0) return asList(value.slice(colon + 1, question ? value.indexOf('?') : undefined).split('\n')[0].split(SPLIT));
  if (!question) return [];
  const chosen = question.match(CHOOSING_VERB);
  return chosen ? asList(chosen[1].split(SPLIT)) : [];
}

/** A request that weighs options in ordinary sentences ("torn between A and B, which is better?"). */
const CHOICE_WORD = /\b(or|between|which|whether|versus|vs)\b/i;
const MAX_FOUND_OPTIONS = 6;

/** The options a request names in any wording (agent roles Part C2): a list as `namedOptions()` reads
 *  it, else, when the request has a choice word, her model's reading, keeping only options in the
 *  request's own words. */
export async function findOptions(text: string, ask: (prompt: string) => Promise<string>): Promise<string[]> {
  const listed = namedOptions(text);
  if (listed.length) return listed;
  const request = String(text || '').replace(/^\s*\/jose\s+/i, '');
  if (!CHOICE_WORD.test(request)) return [];
  let raw = '';
  try {
    raw = await ask([
      'You are Nova. List the options this request asks you to choose between, each in the request\'s own words. No options of your own.',
      `Request: ${request}`,
      'Answer with JSON only: {"options": ["...", "..."]}; an empty list when it names no options.',
    ].join('\n\n'));
  } catch {
    return [];
  }
  let options: unknown = [];
  try { options = JSON.parse((/\{[\s\S]*\}/.exec(raw) || ['{}'])[0])?.options; } catch { return []; }
  if (!Array.isArray(options)) return [];
  const lower = request.toLowerCase();
  const kept = options.map((o) => String(o || '').trim()).filter((o) => o && lower.includes(o.toLowerCase()));
  return kept.length >= 2 && kept.length <= MAX_FOUND_OPTIONS ? kept : [];
}

function stems(text: string): string[] {
  return String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 5));
}

/** Named options the verdict doesn't rank (matched by a shared word). */
export function missingOptions(verdict: NovaVerdict, named: string[]): string[] {
  const ranked = new Set(verdict.options.flatMap((o) => stems(o.name)));
  return named.filter((n) => !stems(n).some((s) => ranked.has(s)));
}

/** The verdict with each missing option listed last as "not judged". */
export function withNotJudged(verdict: NovaVerdict, missing: string[]): NovaVerdict {
  const extra = missing.map((name, i) => ({ name, rank: verdict.options.length + i + 1, why: '', value: 'medium' as Level, effort: 'medium' as Level, risk: 'medium' as Level, sources: [], notJudged: true as const }));
  return { ...verdict, options: [...verdict.options, ...extra] };
}

export function novaVerdictPrompt(input: StepInput, opts: { sourceCount: number; mayAskForHelp: boolean; leftOut?: string[]; named?: string[] }): string {
  const named = opts.named ?? namedOptions(input.request);
  return [
    skillSection(input),
    'You are Nova. Judge only what you were given: the request and the earlier steps below. Do not look for new facts.',
    `The request: ${input.request}`,
    input.instruction ? `Your step: ${input.instruction}` : '',
    named.length ? `The options named: ${named.join('; ')}.` : '',
    stepInputText({ ...input, skill: null }),
    opts.sourceCount ? `Cite the earlier steps' sources by their numbers (1 to ${opts.sourceCount}).` : 'There are no sources: judge from the request.',
    'Rank every option. For each: why, its value, effort and risk as high, medium or low, and the numbers of the sources that support it.',
    opts.leftOut?.length ? `You left out: ${opts.leftOut.join(', ')}. Rank every option.` : '',
    opts.mayAskForHelp ? 'If you have nothing to judge (no options and no findings), answer only with one line: HELP: research <what you need>.' : '',
    'Answer with JSON only: {"doFirst": "...", "options": [{"name": "...", "rank": 1, "why": "...", "value": "high", "effort": "low", "risk": "low", "sources": [1]}], "wouldChange": "...", "score": "0-100, only when there is one option"}',
  ].filter(Boolean).join('\n\n');
}

function readJson(text: string): any {
  const value = String(text || '').replace(/```(?:json)?/gi, '');
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(value.slice(start, end + 1)); } catch { return null; }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const level = (v: unknown): Level => (LEVELS.includes(str(v).toLowerCase() as Level) ? (str(v).toLowerCase() as Level) : 'medium');

export function parseNovaVerdict(text: string, opts: { sourceCount: number; fromRequestOnly: boolean }): NovaVerdict | null {
  const data = readJson(text);
  const raw: any[] = Array.isArray(data?.options) ? data.options : [];
  const valid = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= opts.sourceCount;
  const options = raw
    .map((o, i) => ({
      name: str(o?.name),
      rank: Number.isFinite(Number(o?.rank)) ? Number(o.rank) : i + 1,
      why: str(o?.why),
      value: level(o?.value),
      effort: level(o?.effort),
      risk: level(o?.risk),
      sources: [...new Set((Array.isArray(o?.sources) ? o.sources : []).filter(valid))] as number[],
    }))
    .filter((o) => o.name)
    .sort((a, b) => a.rank - b.rank)
    .map((o, i) => ({ ...o, rank: i + 1 }));
  if (!options.length) return null;
  const score = Number(data?.score);
  return {
    doFirst: str(data?.doFirst) || options[0].name,
    options,
    wouldChange: str(data?.wouldChange),
    ...(options.length === 1 && data?.score !== undefined && Number.isFinite(score) ? { score: Math.round(Math.min(100, Math.max(0, score))) } : {}),
    fromRequestOnly: opts.fromRequestOnly,
  };
}

const sentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

/** The hand-over: what the next step, the board and Chat show. */
export function verdictText(v: NovaVerdict): string {
  const lines: string[] = [];
  if (v.fromRequestOnly) lines.push('Judged from your request only.');
  lines.push(`What to do first: ${sentence(v.doFirst)}`, '');
  for (const o of v.options) {
    if (o.notJudged) { lines.push(`${o.rank}. ${o.name}: not judged.`); continue; }
    const cites = o.sources.length ? ` ${o.sources.map((n) => `[${n}]`).join('')}` : '';
    lines.push(`${o.rank}. ${o.name}: ${o.why ? `${sentence(o.why)} ` : ''}Value ${o.value}, effort ${o.effort}, risk ${o.risk}.${cites}`);
  }
  if (v.score !== undefined) lines.push(`Score: ${v.score}/100.`);
  if (v.wouldChange) lines.push('', `Would change this: ${sentence(v.wouldChange)}`);
  return lines.join('\n');
}
