// What Maria reads (agent phase 3, owner 2026-10-25: "everything the work was built from"):
// the reviewed step and the steps it needed, up to three steps back; the first research
// step's numbered sources among them; the files a step wrote and its build and test output.
import { getJoseRequest } from '../jose/joseRequestStore';
import { getStepOutput } from '../jose/joseStepOutputs';

export const NO_SOURCES = 'No earlier step used sources.';
export const FILE_LIMITS = { eachChars: 6000, totalChars: 20000 };

export interface WorkSource { n: number; title: string; url: string; label: string; excerpt: string }
export interface WorkFile { path: string; text: string; cut: number }

/** The step and what it was built from, nearest first, `depth` steps back at most. */
export function workSteps(commandId: string, stepId: string, depth = 3): string[] {
  const request = getJoseRequest(`jose-request-${commandId}`);
  const needsOf = (id: string): string[] => request?.steps.find((s) => s.stepId === id)?.needs || [];
  const order: string[] = [stepId];
  let frontier = [stepId];
  for (let level = 0; level < depth && frontier.length; level += 1) {
    const next = frontier.flatMap(needsOf).filter((id) => !order.includes(id));
    order.push(...new Set(next));
    frontier = [...new Set(next)];
  }
  return order;
}

/** The first research step's numbered sources among the work's steps. */
export function workSources(commandId: string, stepId: string): WorkSource[] {
  for (const id of workSteps(commandId, stepId)) {
    const sources = (getStepOutput(commandId, id) as any)?.schema?.sources;
    if (Array.isArray(sources) && sources.length) return sources as WorkSource[];
  }
  return [];
}

function cutText(text: string, room: number): WorkFile['text'] {
  return text.slice(0, Math.max(0, room));
}

/** The files a step wrote, read from the project, 6,000 characters each and 20,000 in all. */
export async function workFiles(commandId: string, stepId: string, workspaceRoot: string): Promise<WorkFile[]> {
  const artifacts: any[] = ((getStepOutput(commandId, stepId) as any)?.artifacts || []);
  const paths = [...new Set(artifacts.map((a) => String(a?.relativePath || a?.path || '')).filter(Boolean))];
  if (!paths.length || !workspaceRoot) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  const files: WorkFile[] = [];
  let used = 0;
  for (const path of paths) {
    const room = Math.min(FILE_LIMITS.eachChars, FILE_LIMITS.totalChars - used);
    if (room <= 0) break;
    try {
      const proof: any = await invoke('read_workspace_file', { workspaceRoot, relativePath: path });
      const content = typeof proof?.content === 'string' ? proof.content : '';
      const text = cutText(content, room);
      used += text.length;
      files.push({ path, text, cut: content.length - text.length });
    } catch {
      files.push({ path, text: '', cut: 0 });
    }
  }
  return files;
}

/** The build and test output a step recorded (its validation artifacts). */
export function workResults(commandId: string, stepId: string): string {
  const artifacts: any[] = ((getStepOutput(commandId, stepId) as any)?.artifacts || []);
  const lines: string[] = [];
  for (const a of artifacts) {
    const type = String(a?.type || '');
    if (!/validation/.test(type)) continue;
    if (/passed/.test(type)) lines.push(`${type.replace(/_/g, ' ')}${a.projectType ? ` (${a.projectType})` : ''}`);
    for (const e of Array.isArray(a?.errors) ? a.errors : []) lines.push(`${e?.label || 'check'}: ${String(e?.output || '').slice(0, 1500)}`);
  }
  return lines.join('\n');
}
