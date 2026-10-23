// Folders and files for content-factory projects:
// <output folder>/<brand>/<project>/...
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { ContentBrand, ContentProject, StepId } from './contentTypes';

const WINDOWS_RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

/** A name that is safe as a folder on Windows, macOS and Linux. */
export function slugForFolder(name: string): string {
  let slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/[-.]+$/g, '');
  if (!slug) slug = 'untitled';
  if (WINDOWS_RESERVED.has(slug)) slug = `${slug}-folder`;
  return slug;
}

type BrandRef = Pick<ContentBrand, 'folderName'>;
type ProjectRef = Pick<ContentProject, 'folderName'>;

/** `<brand>/<project>`, relative to the output folder. */
export function projectRelativeDir(brand: BrandRef, project: ProjectRef): string {
  return `${brand.folderName}/${project.folderName}`;
}

/** The output folder chosen in Settings; nothing runs without one. */
export function requireOutputRoot(settings: { outputFolder?: string | null }): string {
  const root = String(settings?.outputFolder || '').trim();
  if (!root) throw new Error('Choose an output folder in Settings first.');
  return root;
}

function joinFolder(root: string, ...parts: string[]): string {
  const sep = root.includes('\\') || /^[a-zA-Z]:/.test(root) ? '\\' : '/';
  const trimmed = root.replace(/[\\/]+$/, '');
  return [trimmed, ...parts.flatMap((part) => part.split('/'))].join(sep);
}

export async function writeProjectFile(root: string, brand: BrandRef, project: ContentProject): Promise<void> {
  await invoke('write_workspace_text_file', {
    workspaceRoot: root,
    relativePath: `${projectRelativeDir(brand, project)}/project.json`,
    content: JSON.stringify(project, null, 2),
  });
}

/** Writes `<step>/v<version>.md` and returns its path relative to the output folder. */
export async function writeStepText(
  root: string, brand: BrandRef, project: ProjectRef, step: StepId, version: number, text: string,
): Promise<string> {
  const relativePath = `${projectRelativeDir(brand, project)}/${step}/v${version}.md`;
  await invoke('write_workspace_text_file', { workspaceRoot: root, relativePath, content: text });
  return relativePath;
}

/** Saves a PNG into `<project>/<subfolder>/` (created if missing) and returns its full path. */
export async function saveProjectImage(
  root: string, brand: BrandRef, project: ProjectRef, subfolder: string, filename: string, base64: string,
): Promise<string> {
  const folder = joinFolder(root, projectRelativeDir(brand, project), subfolder);
  const proof = await invoke<{ path?: string }>('save_image_to_folder', { base64Data: base64, filename, folder });
  return proof?.path || joinFolder(folder, filename);
}

const allowedMediaRoots = new Map<string, Promise<boolean>>();

/** Lets the window play video and audio from the output folder (asked once per folder). */
/** A file under the output folder as a full path on this computer (phase 3a: posting it). */
export function outputPath(root: string, relativePath: string): string {
  return joinFolder(root, relativePath);
}

export function allowMediaFolder(root: string): Promise<boolean> {
  const key = String(root || '').trim();
  if (!key) return Promise.resolve(false);
  if (!allowedMediaRoots.has(key)) {
    allowedMediaRoots.set(key, invoke('content_allow_media_folder', { folder: key }).then(() => true, () => {
      allowedMediaRoots.delete(key);
      return false;
    }));
  }
  return allowedMediaRoots.get(key) as Promise<boolean>;
}

/** A video or audio file in the output folder, as an address the app's players can load. */
export function mediaUrl(root: string, relativePath: string): string {
  return convertFileSrc(joinFolder(root, relativePath));
}

/** A saved picture, as a data URL to show in the app, or null. */
export async function loadProjectImage(root: string, relativePath: string): Promise<string | null> {
  try {
    const base64 = await invoke<string>('read_workspace_image', { workspaceRoot: root, relativePath });
    return base64 ? `data:image/png;base64,${base64}` : null;
  } catch {
    return null;
  }
}

export async function loadProjectFile(root: string, brand: BrandRef, folderName: string): Promise<ContentProject | null> {
  try {
    const proof = await invoke<{ content?: string }>('read_workspace_file', {
      workspaceRoot: root,
      relativePath: `${brand.folderName}/${folderName}/project.json`,
    });
    const parsed = JSON.parse(String(proof?.content || ''));
    return parsed && typeof parsed === 'object' ? (parsed as ContentProject) : null;
  } catch {
    return null;
  }
}
