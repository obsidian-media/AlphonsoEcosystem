// Work → Projects (agent roles Part C1): a project is what you want built; each Start is one
// real Jose request from the "Build an app" template, which Jose adapts. Nothing is simulated.
import { randomId } from '../../lib/randomId';

export interface ProjectIntake {
  name: string;
  description: string;
  stack: string;
  deadline: string;
  type: string;
  features: string;
  constraints: string;
  risks: string;
  priority: 'low' | 'medium' | 'high';
}

export interface SavedProject {
  id: string;
  name: string;
  intake: ProjectIntake;
  runs: { requestId: string; atMs: number }[];
  createdAtMs: number;
}

const KEY = 'alphonso_projects_v2';
const KEEP = 50;
export const PROJECT_TEMPLATE = 'build_app';
export const PROJECT_NEEDS_TEXT = 'Give the project a name and a description first.';
export const PROJECT_NOT_FOUND = 'That project is no longer saved.';

function readAll(): SavedProject[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeAll(list: SavedProject[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, KEEP))); } catch { /* storage full */ }
}

/** The request Jose gets: what to build, then each filled field on its own line. */
export function intakeText(intake: ProjectIntake): string {
  const clean = (v: unknown) => String(v || '').trim();
  const lines = [`Build ${clean(intake.name)}: ${clean(intake.description).replace(/[.\s]+$/, '')}.`];
  const fields: Array<[string, unknown]> = [
    ['Stack', intake.stack], ['Features', intake.features], ['Must not', intake.constraints],
    ['Risks', intake.risks], ['Deadline', intake.deadline], ['Priority', intake.priority],
  ];
  for (const [label, value] of fields) if (clean(value)) lines.push(`${label}: ${clean(value)}`);
  return lines.join('\n');
}

export function listProjects(): SavedProject[] {
  return readAll();
}

export function getProject(id: string): SavedProject | null {
  return readAll().find((p) => p.id === id) || null;
}

export function saveProject(intake: ProjectIntake, id?: string): SavedProject {
  const all = readAll();
  const existing = id ? all.find((p) => p.id === id) : undefined;
  const project: SavedProject = existing
    ? { ...existing, name: intake.name.trim(), intake }
    : { id: randomId('project'), name: intake.name.trim(), intake, runs: [], createdAtMs: Date.now() };
  writeAll([project, ...all.filter((p) => p.id !== project.id)]);
  return project;
}

export function deleteProject(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id));
}

/** One real request; the run is kept on the project when Jose accepted it. */
export async function startProject(id: string, opts: { settings?: any } = {}): Promise<{ ok: boolean; requestId?: string; reason?: string }> {
  const project = getProject(id);
  if (!project) return { ok: false, reason: PROJECT_NOT_FOUND };
  if (!project.intake.name.trim() || !project.intake.description.trim()) return { ok: false, reason: PROJECT_NEEDS_TEXT };
  const { submitToJose } = await import('../jose/submitToJose');
  const result: any = await submitToJose({
    text: intakeText(project.intake),
    source: 'user',
    templateId: PROJECT_TEMPLATE,
    ...(opts.settings?.endpoint ? { endpoint: opts.settings.endpoint } : {}),
    ...(typeof opts.settings?.zeroCostMode === 'boolean' ? { zeroCostMode: opts.settings.zeroCostMode } : {}),
  });
  const requestId = typeof result?.requestId === 'string' ? result.requestId : '';
  if (!requestId || result?.ok === false && !result?.waitingForPlan) {
    return { ok: false, reason: String(result?.reason || 'Jose could not start this project.') };
  }
  const latest = getProject(id);
  if (latest) writeAll(readAll().map((p) => (p.id === id ? { ...p, runs: [...p.runs, { requestId, atMs: Date.now() }] } : p)));
  return { ok: true, requestId };
}
