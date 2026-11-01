// The content factory's phone calls (phone app, phase 2). Each maps to the function the
// computer's own Miya Studio or Calendar uses; a phone gets nothing the computer lacks.
import { mediaOffered, type MediaRef } from './contentMirror';
import { ensurePreview, readPiece } from './phonePreviews';

type Args = Record<string, unknown>;

export const NOT_OFFERED = "That file isn't one this project offers.";

function mediaRef(value: unknown): MediaRef | null {
  const v = value as Partial<MediaRef> | null;
  if (!v || typeof v !== 'object') return null;
  if (typeof v.projectId !== 'string' || typeof v.path !== 'string') return null;
  if (v.kind !== 'video' && v.kind !== 'picture') return null;
  return { projectId: v.projectId, path: v.path, kind: v.kind };
}

/** `media.preview`: one piece of a phone-sized copy of an offered picture or video. */
export async function mediaPreview(args: Args): Promise<{ mime: string; bytes: number; sha256: string; pieces: number; piece: number; data: string }> {
  const ref = mediaRef(args.ref);
  if (!ref || !mediaOffered(ref)) throw new Error(NOT_OFFERED);
  const piece = Number(args.piece);
  const info = await ensurePreview(ref);
  if (info.ok === false) throw new Error(info.reason);
  if (!Number.isInteger(piece) || piece < 0 || piece >= info.pieces) throw new Error('That piece of the preview does not exist.');
  const data = await readPiece(info.path, piece);
  return { mime: info.mime, bytes: info.bytes, sha256: info.sha256, pieces: info.pieces, piece, data };
}
