// Phone-sized previews (phone app, phase 2): the computer makes a small copy of a picture
// or video (content_phone_preview: about 480p video with sound, pictures at most 1080
// pixels) and the phone fetches it in pieces that fit the relay's 4 MB message limit.
// Full quality never leaves the computer.
import { invoke } from '@tauri-apps/api/core';
import { getProject } from '../contentFactory/contentProjectService';
import { requireOutputRoot } from '../contentFactory/contentProjectFiles';
import type { MediaRef } from './contentMirror';

/** Raw bytes per piece; base64 grows a piece by a third, so a message stays under 4 MB. */
export const PREVIEW_PIECE_BYTES = 2.5 * 1024 * 1024;
export const FILE_GONE = 'The file is no longer on your computer.';
export const NOT_READY = 'Not ready yet: the computer is still making it.';

export type PreviewInfo = { ok: true; path: string; bytes: number; sha256: string; mime: string; pieces: number };
export type PreviewResult = PreviewInfo | { ok: false; reason: string };

function outputRoot(): string {
  let settings: { outputFolder?: string | null } = {};
  try { settings = JSON.parse(localStorage.getItem('alphonso_settings') || '{}') || {}; } catch { /* use none */ }
  return requireOutputRoot(settings);
}

function projectWorking(projectId: string): boolean {
  const steps = getProject(projectId)?.steps || {};
  return Object.values(steps).some((s: any) => s?.status === 'running');
}

/** Makes (or reuses) the preview of one offered file. */
/** A notification's still of a picture or video (base64 JPEG), or null when it can't be made. */
export async function makeStill(ref: MediaRef): Promise<string | null> {
  try {
    const root = outputRoot();
    const r = await invoke<{ ok: boolean; base64?: string }>('content_phone_still', { request: { workspaceRoot: root, relativePath: ref.path } });
    return r?.ok && r.base64 ? r.base64 : null;
  } catch {
    return null;
  }
}

export async function ensurePreview(ref: MediaRef): Promise<PreviewResult> {
  let root: string;
  try { root = outputRoot(); } catch (e) { return { ok: false, reason: e instanceof Error ? e.message : String(e) }; }
  const r = await invoke<{ ok: boolean; path?: string; bytes?: number; sha256?: string; mime?: string; reason?: string }>(
    'content_phone_preview', { request: { workspaceRoot: root, relativePath: ref.path, kind: ref.kind } },
  );
  if (!r?.ok || !r.path || typeof r.bytes !== 'number' || !r.sha256 || !r.mime) {
    const reason = r?.reason || FILE_GONE;
    if (reason === FILE_GONE && projectWorking(ref.projectId)) return { ok: false, reason: NOT_READY };
    return { ok: false, reason };
  }
  return { ok: true, path: r.path, bytes: r.bytes, sha256: r.sha256, mime: r.mime, pieces: Math.max(1, Math.ceil(r.bytes / PREVIEW_PIECE_BYTES)) };
}

/** One piece of a preview, as base64. */
export async function readPiece(path: string, index: number): Promise<string> {
  const r = await invoke<{ ok: boolean; base64?: string; reason?: string }>('content_read_file_part', {
    request: { workspaceRoot: outputRoot(), relativePath: path, offset: index * PREVIEW_PIECE_BYTES, length: PREVIEW_PIECE_BYTES },
  });
  if (!r?.ok || typeof r.base64 !== 'string') throw new Error(r?.reason || FILE_GONE);
  return r.base64;
}
