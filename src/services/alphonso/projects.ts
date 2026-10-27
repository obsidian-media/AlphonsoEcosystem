// Alphonso's projects (agent phase 6, owner 2026-10-26): folders you list in Settings → Agents.
// He works in one at a time; small new code goes in a scratch folder under the output folder.
import { slugForFolder } from '../contentFactory/contentProjectFiles';
import { agentName } from '../jose/agentNames';

export interface AlphonsoProject { name: string; folder: string }

export interface WorkPlace {
  kind: 'project' | 'new';
  name: string;
  /** Where commands run. */
  folder: string;
  /** Files are written to `root` + `prefix` + their path (a new scratch folder doesn't exist yet). */
  root: string;
  prefix: string;
}

export const NEEDS_OUTPUT_FOLDER = 'Set the output folder in Settings → General so Alphonso has somewhere to put new code.';
export const NO_PROJECT = "Add a project in Settings → Agents → Alphonso's projects.";
/** A reading skill with no folder to read from (agent roles Part C2). */
export const NAME_A_PROJECT = "Name one of your projects in Settings → Agents → Alphonso's projects, or the file's project in the request.";

const PROJECTS_KEY = 'alphonso_code_projects_v1';

function settings(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem('alphonso_settings') || '{}') || {}; } catch { return {}; }
}

function lastSegment(folder: string): string {
  const parts = String(folder).replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || folder;
}

/** The listed projects; the old Workspace Root becomes the first one, once. */
export function listProjects(): AlphonsoProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (raw !== null) {
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list.filter((p) => p && p.name && p.folder).map((p) => ({ name: String(p.name), folder: String(p.folder) })) : [];
    }
  } catch { /* unreadable: start again */ }
  const root = String(settings().workspaceRoot || '').trim();
  const list = root ? [{ name: lastSegment(root), folder: root }] : [];
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(list)); } catch { /* storage full */ }
  return list;
}

export function saveProjects(list: AlphonsoProject[]): { ok: true } | { ok: false; reason: string } {
  const clean = list.map((p) => ({ name: String(p.name || '').trim(), folder: String(p.folder || '').trim() }));
  if (clean.some((p) => !p.name || !p.folder)) return { ok: false, reason: 'Every project needs a name and a folder.' };
  const seen = new Set<string>();
  for (const p of clean) {
    const key = p.name.toLowerCase();
    if (seen.has(key)) return { ok: false, reason: `A project named ${p.name} is already listed.` };
    seen.add(key);
  }
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(clean)); } catch { return { ok: false, reason: 'Projects could not be saved.' }; }
  return { ok: true };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A listed project the request names as a whole word; the longest name wins. */
export function projectNamedIn(request: string, list: AlphonsoProject[] = listProjects()): AlphonsoProject | null {
  const text = String(request || '');
  const hits = list.filter((p) => new RegExp(`(^|[^\\w-])${escape(p.name)}(?=$|[^\\w-])`, 'i').test(text));
  return hits.sort((a, b) => b.name.length - a.name.length)[0] || null;
}

/** A new scratch folder: `<output folder>/<agent name>/<slug>/`, `-2` … when taken. */
export function scratchPlace(title: string, existing: string[]): WorkPlace | { ok: false; reason: string } {
  const root = String(settings().outputFolder || '').trim();
  if (!root) return { ok: false, reason: NEEDS_OUTPUT_FOLDER };
  const base = slugForFolder(title);
  const taken = new Set(existing.map((e) => e.toLowerCase()));
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${base}-${n}`;
  const prefix = `${agentName('alphonso')}/${name}/`;
  return { kind: 'new', name, folder: `${root.replace(/[\\/]+$/, '')}/${prefix.replace(/\/$/, '')}`, root, prefix };
}

/** A listed project as a place to work. */
export function projectPlace(project: AlphonsoProject): WorkPlace {
  return { kind: 'project', name: project.name, folder: project.folder, root: project.folder, prefix: '' };
}

/** Settings → Agents → "Model for Alphonso's code"; null = the same as Alphonso. */
export function getCodeModel(): string | null {
  const model = String(settings().alphonsoCodeModel || '').trim();
  return model || null;
}
