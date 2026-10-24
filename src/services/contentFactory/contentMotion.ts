// A scene's (or a mini Short part's) motion (content factory phase 4c): a Higgsfield preset, a
// clip recorded with the camera, or a video file chosen in a dialog the backend opens. Clips
// are saved as `<project>/motion/<scene>-v<n>.mp4` (at most 10 seconds, never over a file) and
// nothing leaves this computer until an approved clips step uses them.
import { invoke } from '@tauri-apps/api/core';
import { getBrand } from './contentBrandService';
import { chosenVersionOf, getProject, setSceneMotion, setShortPartMotion } from './contentProjectService';
import { projectRelativeDir, requireOutputRoot } from './contentProjectFiles';
import type { ContentProject, SceneMotion } from './contentTypes';

type Settings = { outputFolder?: string | null };

export const MOTION_CAMERA_REFUSED = "Alphonso couldn't use the camera. Allow it in Windows Settings → Privacy → Camera, or choose a file.";
export const MOTION_MAX_SECONDS = 10;

type SceneRow = { id: string; motion?: SceneMotion; motionSuggested?: boolean };

function scenesOf(project: ContentProject): SceneRow[] {
  return (chosenVersionOf(project, 'scenes')?.output as { miya?: { scenes?: SceneRow[] } } | undefined)?.miya?.scenes || [];
}

export function sceneMotion(project: ContentProject, sceneId: string): SceneMotion | null {
  return scenesOf(project).find((s) => s.id === sceneId)?.motion || null;
}

/** The next free version number for a motion clip (v1, v2, …). */
function nextVersion(motion: SceneMotion | null): number {
  const current = motion?.path || '';
  const n = Number(/-v(\d+)\.mp4$/.exec(current)?.[1] || 0);
  return n + 1;
}

type ClipInput = { base64: string } | { choose: true };
type ClipResult = { ok: boolean; path?: string; reason?: string };

/** A mini Short part's motion (phase 4c). */
export function shortPartMotion(project: ContentProject, shortId: string, partIndex: number): SceneMotion | null {
  const shorts = (chosenVersionOf(project, 'shorts')?.output as { miya?: { shorts?: { id: string; parts?: { motion?: SceneMotion }[] }[] } } | undefined)?.miya?.shorts;
  return shorts?.find((s) => s.id === shortId)?.parts?.[partIndex]?.motion || null;
}

/** Saves a recording (base64 WebM) or a chosen file as the scene's motion; the scene keeps it only when saved. */
export async function saveMotionClip(projectId: string, sceneId: string, input: ClipInput, settings: Settings): Promise<ClipResult> {
  const project = getProject(projectId);
  return saveClip(projectId, `${sceneId}-v${project ? nextVersion(sceneMotion(project, sceneId)) : 1}`, input, settings,
    (motion) => setSceneMotion(projectId, sceneId, motion));
}

/** The same for a mini Short's part (`motion/<short>-p<n>-v<m>.mp4`). */
export async function saveShortPartMotionClip(projectId: string, shortId: string, partIndex: number, input: ClipInput, settings: Settings): Promise<ClipResult> {
  const project = getProject(projectId);
  return saveClip(projectId, `${shortId}-p${partIndex + 1}-v${project ? nextVersion(shortPartMotion(project, shortId, partIndex)) : 1}`, input, settings,
    (motion) => setShortPartMotion(projectId, shortId, partIndex, motion));
}

async function saveClip(projectId: string, stem: string, input: ClipInput, settings: Settings, keep: (motion: SceneMotion) => void): Promise<ClipResult> {
  const project = getProject(projectId);
  const brand = project ? getBrand(project.brandId) : null;
  if (!project || !brand) return { ok: false, reason: 'That project no longer exists.' };
  const root = requireOutputRoot(settings);
  const outPath = `${projectRelativeDir(brand, project)}/motion/${stem}.mp4`;
  const answer = await invoke<{ ok?: boolean; path?: string; reason?: string; cancelled?: boolean }>('content_save_motion_clip', {
    request: { workspaceRoot: root, outPath, ...('base64' in input ? { base64: input.base64 } : { choose: true }) },
  }).catch(() => ({ ok: false, reason: 'The clip could not be saved.' } as { ok: boolean; reason: string; cancelled?: boolean }));
  if (answer?.cancelled) return { ok: false };
  if (!answer?.ok) return { ok: false, reason: answer?.reason || 'The clip could not be saved.' };
  keep({ source: 'base64' in input ? 'recorded' : 'file', path: outPath });
  return { ok: true, path: outPath };
}
