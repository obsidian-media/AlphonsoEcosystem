// Alphonso's code step (agent phase 6): which steps are code, and reading his one JSON answer.
import { CODE_TASK_PREFIXES } from '../jose/taskTypeMeanings';

export interface CodeAnswer {
  project?: string;
  title: string;
  plan: string;
  files: { path: string; content: string }[];
  commands: { program: string; args: string[]; why: string }[];
  questions: string[];
  read: string[];
}

export function isAlphonsoCodeStep(assignment: { agent?: string; actionType?: string } | null | undefined): boolean {
  const type = String(assignment?.actionType || '');
  return assignment?.agent === 'alphonso' && CODE_TASK_PREFIXES.some((prefix) => type.startsWith(prefix));
}

function readJson(raw: string): any {
  const text = String(raw || '').replace(/```(?:json)?/gi, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : []);

/** His answer, or null when it has neither files, nor files to read, nor questions. */
export function parseCodeAnswer(raw: string): CodeAnswer | null {
  const data = readJson(raw);
  if (!data || typeof data !== 'object') return null;
  const files = (Array.isArray(data.files) ? data.files : [])
    .filter((f: any) => f && typeof f.path === 'string' && f.path.trim() && typeof f.content === 'string')
    .map((f: any) => ({ path: f.path.trim(), content: f.content }));
  const commands = (Array.isArray(data.commands) ? data.commands : [])
    .filter((c: any) => c && typeof c.program === 'string' && c.program.trim())
    .map((c: any) => ({ program: c.program.trim(), args: strings(c.args), why: typeof c.why === 'string' ? c.why.trim() : '' }));
  const questions = strings(data.questions);
  const read = strings(data.read);
  if (!files.length && !questions.length && !read.length) return null;
  return {
    ...(typeof data.project === 'string' && data.project.trim() ? { project: data.project.trim() } : {}),
    title: typeof data.title === 'string' ? data.title.trim() : '',
    plan: typeof data.plan === 'string' ? data.plan.trim() : '',
    files, commands, questions, read,
  };
}
