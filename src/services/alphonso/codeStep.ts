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
  /** What another agent should provide first (agent phase 6): the step ends with a HELP line. */
  help?: string;
}

export function isAlphonsoCodeStep(assignment: { agent?: string; actionType?: string; contentStep?: unknown } | null | undefined): boolean {
  const type = String(assignment?.actionType || '');
  // A content-factory step runs through the factory's own executor.
  if (assignment?.contentStep) return false;
  return assignment?.agent === 'alphonso' && CODE_TASK_PREFIXES.some((prefix) => type.startsWith(prefix));
}

function readJson(raw: string): any {
  const text = String(raw || '').replace(/```(?:json)?/gi, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

/** What a model writes for "no command". */
const NO_COMMAND = new Set(['none', 'null', 'n/a', 'na', '-', 'nothing']);
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
    .map((c: any) => {
      // "npm test" written as the program: its first word is the program, the rest go first in args.
      const [program, ...more] = c.program.trim().split(/\s+/);
      return { program, args: [...more, ...strings(c.args)], why: typeof c.why === 'string' ? c.why.trim() : '' };
    })
    .filter((c: any) => !NO_COMMAND.has(c.program.toLowerCase()));
  const questions = strings(data.questions);
  const read = strings(data.read);
  const help = typeof data.help === 'string' ? data.help.trim() : '';
  if (!files.length && !commands.length && !questions.length && !read.length && !help) return null;
  return {
    ...(typeof data.project === 'string' && data.project.trim() ? { project: data.project.trim() } : {}),
    title: typeof data.title === 'string' ? data.title.trim() : '',
    plan: typeof data.plan === 'string' ? data.plan.trim() : '',
    files, commands, questions, read,
    ...(help ? { help } : {}),
  };
}
