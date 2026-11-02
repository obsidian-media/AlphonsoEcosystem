// What the phone sees of the content factory (phone app, phase 2): the most recent
// projects, the brands' names and the Calendar. Each project lists the pictures and videos
// its versions name (`media`); the phone may ask for a preview of those files and no other
// (`mediaOffered()`), so a crafted path never reaches the computer's disk.
import { listProjects, getProject } from '../contentFactory/contentProjectService';
import { listBrands } from '../contentFactory/contentBrandService';
import { listCalendarItems, type CalendarItem } from '../contentFactory/calendarItems';
import type { ContentProject } from '../contentFactory/contentTypes';

export const CONTENT_PROJECTS = 20;

/** A picture or video a project offers, by its path relative to the output folder. */
export type MediaRef = { projectId: string; path: string; kind: 'video' | 'picture' };
export type PhoneProject = ContentProject & { media: MediaRef[] };

const PICTURE = /\.(png|jpe?g|webp)$/i;
const VIDEO = /\.(mp4|mov|m4v|webm)$/i;

function isRelativeMediaPath(value: string): boolean {
  if (!value.includes('/') || value.startsWith('/') || value.includes(':') || value.includes('\\')) return false;
  if (value.split('/').some((part) => part === '..' || part === '')) return false;
  return PICTURE.test(value) || VIDEO.test(value);
}

function collect(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') { if (isRelativeMediaPath(value)) into.add(value); return; }
  if (Array.isArray(value)) { for (const v of value) collect(v, into); return; }
  if (value && typeof value === 'object') for (const v of Object.values(value)) collect(v, into);
}

/** The pictures and videos one version of a step names (phase 2: "ready to check"). */
export function versionMedia(project: ContentProject, output: unknown): MediaRef[] {
  const paths = new Set<string>();
  collect(output, paths);
  return [...paths].map((path) => ({ projectId: project.id, path, kind: VIDEO.test(path) ? 'video' : 'picture' }));
}

/** Every picture and video the project's versions and posts name. */
export function projectMedia(project: ContentProject): MediaRef[] {
  const paths = new Set<string>();
  for (const state of Object.values(project.steps || {})) for (const v of state?.versions || []) collect(v.output, paths);
  collect(project.posts || [], paths);
  return [...paths].map((path) => ({ projectId: project.id, path, kind: VIDEO.test(path) ? 'video' : 'picture' }));
}

export function contentMirrorData(nowMs: number): { projects: PhoneProject[]; brands: { id: string; name: string }[]; calendar: CalendarItem[] } {
  const projects = listProjects()
    .slice()
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
    .slice(0, CONTENT_PROJECTS)
    .map((p) => ({ ...p, media: projectMedia(p) }));
  return {
    projects,
    brands: listBrands().map((b) => ({ id: b.id, name: b.name })),
    calendar: listCalendarItems(nowMs),
  };
}

/** True only for a file the project lists, of that kind. */
export function mediaOffered(ref: MediaRef): boolean {
  const project = getProject(ref.projectId);
  if (!project) return false;
  return projectMedia(project).some((m) => m.path === ref.path && m.kind === ref.kind);
}
