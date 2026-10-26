// What a code step changes (agent phase 6): each file new or changed with a short before/after,
// each command rated by the existing risk check, and one line for the approval.
import { assessCommandRisk, deletesThings } from '../commandApprovalService';
import type { JoseEffect } from '../jose/joseEffects';
import type { CodeCommand, CodeFile, CodePreview } from './types';

const FIRST_DIFF_LINES = 6;
/** A memory guard for the line diff (cells of its table), not a limit on what is shown. */
const DIFF_CELL_LIMIT = 4_000_000;

/** A short, stable hash of a file's content (FNV-1a). */
export function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${text.length.toString(16)}-${h.toString(16)}`;
}

const lines = (text: string) => {
  const all = String(text).replace(/\r\n/g, '\n').split('\n');
  if (all.length && all[all.length - 1] === '') all.pop();
  return all;
};

/** The edit between two texts as "- old" / "+ new" lines, with the counts. */
function lineDiff(before: string[], after: string[]): { added: number; removed: number; ops: string[] } {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let endB = before.length;
  let endA = after.length;
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) { endB -= 1; endA -= 1; }
  const b = before.slice(start, endB);
  const a = after.slice(start, endA);
  if ((b.length + 1) * (a.length + 1) > DIFF_CELL_LIMIT) {
    return { added: a.length, removed: b.length, ops: [...b.map((l) => `- ${l}`), ...a.map((l) => `+ ${l}`)] };
  }
  const w = a.length + 1;
  const table = new Uint32Array((b.length + 1) * w);
  for (let i = b.length - 1; i >= 0; i -= 1) {
    for (let j = a.length - 1; j >= 0; j -= 1) {
      table[i * w + j] = b[i] === a[j] ? table[(i + 1) * w + j + 1] + 1 : Math.max(table[(i + 1) * w + j], table[i * w + j + 1]);
    }
  }
  const ops: string[] = [];
  let i = 0;
  let j = 0;
  while (i < b.length || j < a.length) {
    if (i < b.length && j < a.length && b[i] === a[j]) { i += 1; j += 1; }
    // A removal first where both keep the longest common part, so "- old" reads before "+ new".
    else if (i < b.length && (j >= a.length || table[(i + 1) * w + j] >= table[i * w + j + 1])) { ops.push(`- ${b[i]}`); i += 1; }
    else { ops.push(`+ ${a[j]}`); j += 1; }
  }
  const common = table[0];
  return { added: a.length - common, removed: b.length - common, ops };
}

export function classifyFile(path: string, content: string, before: string | null): CodeFile {
  if (before === null) {
    const added = lines(content).length;
    return { path, content, status: 'new', added, removed: 0, firstDiff: lines(content).slice(0, FIRST_DIFF_LINES).map((l) => `+ ${l}`) };
  }
  const diff = lineDiff(lines(before), lines(content));
  return {
    path, content, status: 'changed', before, beforeHash: contentHash(before),
    added: diff.added, removed: diff.removed, firstDiff: diff.ops.slice(0, FIRST_DIFF_LINES),
  };
}

export function classifyCommand(program: string, args: string[], why: string): CodeCommand {
  const list = (Array.isArray(args) ? args : []).map(String);
  const risk = assessCommandRisk(program, list);
  const prog = String(program || '').toLowerCase().replace(/\.(exe|cmd|bat)$/, '').split(/[\\/]/).pop() || '';
  return { program, args: list, why: String(why || ''), readOnly: risk.readOnly, level: risk.level, deletes: deletesThings(prog, list) };
}

/** What a prepared change needs your approval for. */
export function previewNeeds(p: CodePreview): JoseEffect[] {
  const needs: JoseEffect[] = [];
  if (p.files.some((f) => f.status === 'changed')) needs.push('change_project');
  if (p.commands.some((c) => !c.readOnly)) needs.push('run');
  if (p.commands.some((c) => c.deletes)) needs.push('delete');
  return needs;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const counts = (f: CodeFile) => [f.added ? `+${f.added}` : '', f.removed ? `−${f.removed}` : ''].filter(Boolean).join(' ');

/** "Change 2 files in shop (src/App.tsx +12 −3, …), add 1, then run: npm run test". */
export function describeCodeChange(p: CodePreview): string {
  const changed = p.files.filter((f) => f.status === 'changed');
  const added = p.files.filter((f) => f.status === 'new');
  const run = p.commands.map((c) => [c.program, ...c.args].join(' '));
  const parts: string[] = [];
  if (changed.length) {
    parts.push(`Change ${plural(changed.length, 'file')} in ${p.place.name} (${changed.map((f) => [f.path, counts(f)].filter(Boolean).join(' ')).join(', ')})`);
    if (added.length) parts.push(`add ${added.length}`);
  } else if (added.length) {
    parts.push(`Add ${plural(added.length, 'file')} in ${p.place.name} (${added.map((f) => f.path).join(', ')})`);
  }
  if (run.length) parts.push(`${parts.length ? 'then run' : `Run in ${p.place.name}`}: ${run.join(', ')}`);
  return parts.join(', ') || `Nothing to change in ${p.place.name}`;
}
