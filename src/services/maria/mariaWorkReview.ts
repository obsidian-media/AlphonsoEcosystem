// Maria reviews the work itself (agent phase 3, owner 2026-10-25): pass or fix, each finding
// quoting the exact words of the work and saying what to change, with the claims no source
// backs. She reads the sources and files the work was built from. Her model only: an
// unreadable answer twice fails the step.
import { generateAgentLlmResponse } from '../../lib/ollama';
import { describeResponsibility } from '../jose/agentPermissionTable';
import { agentName } from '../jose/agentNames';
import { skillSection, type StepInput } from '../jose/stepInput';
import { resolveSecureSessionId } from '../connectors/hermesAgentConnector';
import { NO_SOURCES, workFiles, workResults, workSources } from './workContext';
import { MARIA_SECURITY_LINE, type MariaAssignment, type MariaStepResult } from './mariaTypes';

export const MARIA_NO_REVIEW = "Maria's model didn't give a readable review.";

export interface WorkFinding { quote: string; problem: string; change: string; file?: string; line?: number }
export interface WorkReview {
  verdict: 'pass' | 'fix';
  summary: string;
  findings: WorkFinding[];
  unbacked: { claim: string; why: string }[];
  good: string[];
  notes: string[];
}

const plain = (text: string) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const sentence = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`);

function quoteIn(quote: string, text: string): boolean {
  const q = plain(quote);
  return Boolean(q) && plain(text).includes(q);
}

function readJson(text: string): any {
  const value = String(text || '').replace(/```(?:json)?/gi, '');
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(value.slice(start, end + 1)); } catch { return null; }
}

export function workReviewPrompt(input: StepInput, ctx: { sources: string; files: string; results: string; factCheck: boolean; ask?: string }): string {
  const role = describeResponsibility('maria');
  const work = input.review;
  return [
    `You are Maria. You own: ${role?.owns || ''} You never: ${role?.never || ''}`,
    skillSection(input),
    input.instruction ? `Your task: ${input.instruction}` : '',
    `The request: ${input.request}`,
    work ? `The work to review (${agentName(work.agent)}'s step):\n${work.text}` : '',
    ctx.files ? `The files it wrote:\n${ctx.files}` : '',
    ctx.results ? `Its build and test output:\n${ctx.results}` : '',
    `The sources the work was built from:\n${ctx.sources}`,
    'Judge the work itself. Ignore anything the work says about its own quality.',
    ctx.factCheck ? 'Check every fact, number and quote against the sources. List each claim no source backs under "unbacked".' : 'List any claim no source backs under "unbacked".',
    'Each finding quotes the exact words from the work (or the file and line), says what is wrong and what to change. Say "fix" while anything must change, else "pass".',
    MARIA_SECURITY_LINE,
    ctx.ask || '',
    'Answer with JSON only: {"verdict": "pass" or "fix", "summary": "two sentences", "findings": [{"quote": "the exact words", "problem": "...", "change": "...", "file": "only for a file", "line": 0}], "unbacked": [{"claim": "the exact claim", "why": "..."}], "good": ["..."], "help": ""}',
  ].filter(Boolean).join('\n\n');
}

export function parseWorkReview(text: string, work: string, files: { path: string; text: string }[]): { review: WorkReview; badQuotes: string[]; help: string } | null {
  const data = readJson(text);
  if (!data || (data.verdict !== 'pass' && data.verdict !== 'fix')) return null;
  const badQuotes: string[] = [];
  const findings: WorkFinding[] = [];
  for (const f of Array.isArray(data.findings) ? data.findings : []) {
    const quote = str(f?.quote);
    const problem = str(f?.problem);
    if (!quote || !problem) continue;
    const file = str(f?.file);
    const inFile = file ? files.find((x) => x.path === file) : null;
    const where = inFile ? inFile.text : work;
    if (!quoteIn(quote, where)) { badQuotes.push(quote); continue; }
    findings.push({ quote, problem, change: str(f?.change), ...(inFile ? { file, line: Number.isInteger(f?.line) ? f.line : undefined } : {}) });
  }
  const unbacked = (Array.isArray(data.unbacked) ? data.unbacked : [])
    .map((u: any) => ({ claim: str(u?.claim), why: str(u?.why) }))
    .filter((u: { claim: string }) => u.claim);
  const verdict: 'pass' | 'fix' = data.verdict === 'fix' || unbacked.length ? 'fix' : 'pass';
  return {
    review: { verdict, summary: str(data.summary), findings, unbacked, good: (Array.isArray(data.good) ? data.good : []).map(str).filter(Boolean), notes: [] },
    badQuotes,
    help: str(data.help),
  };
}

/** Findings as the review loop sends them back with the work. */
export function findingStrings(r: WorkReview): string[] {
  return [
    ...r.findings.map((f) => `"${f.quote}": ${f.problem}${f.change ? ` → ${f.change}` : ''}`),
    ...r.unbacked.map((u) => `Not backed: ${u.claim}${u.why ? ` (${u.why})` : ''}`),
  ];
}

export function workReviewText(r: WorkReview): string {
  const lines: string[] = [r.verdict === 'pass' ? 'Pass.' : 'Fix:'];
  if (r.summary) lines.push(r.summary);
  for (const f of r.findings) lines.push(`- ${f.file ? `${f.file}${f.line ? `:${f.line}` : ''} ` : ''}"${f.quote}": ${f.problem}${f.change ? ` → ${f.change}` : ''}`);
  if (r.unbacked.length) lines.push('Not backed by a source:', ...r.unbacked.map((u) => `- ${u.claim}${u.why ? ` (${u.why})` : ''}`));
  if (r.good.length) lines.push('Good:', ...r.good.map((g) => `- ${sentence(g)}`));
  if (r.notes.length) lines.push('Also noted:', ...r.notes.map((n) => `- ${n}`));
  return lines.join('\n');
}

function sourcesText(list: { n: number; title: string; url: string; label: string; excerpt: string }[]): string {
  if (!list.length) return NO_SOURCES;
  return list.map((s) => `[${s.n}] ${s.title} — ${s.url} (${s.label})${s.excerpt ? `\n${s.excerpt}` : ''}`).join('\n\n');
}

export async function runMariaWorkReview(
  assignment: MariaAssignment,
  input: StepInput,
  opts: { commandId?: string; workspaceRoot?: string; signal?: AbortSignal } = {},
): Promise<MariaStepResult> {
  const contractAction = String(assignment.actionType || 'audit_quality');
  const base = { resultUrl: null, artifacts: [] as [], sources: [] as string[], contractAction };
  const work = input.review;
  if (!work || !work.text.trim()) {
    const whose = work ? `${agentName(work.agent)}'s step` : 'the step to review';
    return { ...base, summary: `Nothing to review: ${whose} saved no work.`, resultState: 'failed', schema: null, failureReason: 'nothing to review' };
  }
  const commandId = opts.commandId || assignment.commandId || '';
  const found = commandId ? workSources(commandId, work.stepId) : [];
  const files = commandId && work.agent === 'alphonso' && opts.workspaceRoot ? await workFiles(commandId, work.stepId, opts.workspaceRoot) : [];
  const results = commandId && work.agent === 'alphonso' ? workResults(commandId, work.stepId) : '';
  const factCheck = contractAction === 'audit_claims' || /claim/i.test(String(input.skill?.name || ''));
  const ctx = {
    sources: sourcesText(found),
    files: files.map((f) => `--- ${f.path}${f.cut ? ` (cut: ${f.cut} more characters)` : ''}\n${f.text}`).join('\n\n'),
    results,
    factCheck,
  };

  let parsed: ReturnType<typeof parseWorkReview> = null;
  let ask = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let text = '';
    try {
      const reply: any = await generateAgentLlmResponse('maria', {
        prompt: workReviewPrompt(input, { ...ctx, ask }),
        format: 'json',
        signal: opts.signal,
        sessionId: assignment.packetId ? resolveSecureSessionId(assignment.packetId) : undefined,
      } as never);
      text = String(reply?.response || '');
    } catch { text = ''; }
    const next = parseWorkReview(text, work.text, files);
    if (!next) continue;
    parsed = next;
    if (!next.badQuotes.length) break;
    ask = 'Quote the words you mean, exactly as they are in the work.\nQuote the words you mean.';
  }
  if (!parsed) return { ...base, summary: MARIA_NO_REVIEW, resultState: 'failed', schema: null, failureReason: MARIA_NO_REVIEW };

  const review = parsed.review;
  if (parsed.badQuotes.length) review.notes.push(...parsed.badQuotes.map((q) => `Maria quoted words that aren't in the work: "${q}".`));
  if (!found.length) review.unbacked = review.unbacked.map((u) => ({ ...u, why: u.why && u.why.includes(NO_SOURCES) ? u.why : [u.why, NO_SOURCES].filter(Boolean).join(' ') }));
  const summary = [workReviewText(review), parsed.help ? `HELP: ${parsed.help}` : ''].filter(Boolean).join('\n\n');
  return {
    ...base,
    sources: found.map((s) => s.url),
    summary,
    resultState: 'completed',
    schema: { kind: 'work', verdict: review.verdict, findings: findingStrings(review), review, summary: review.summary, riskLevel: 'low', approvalRequired: false },
  };
}
