// The content factory's phone calls (phone app, phase 2). Each maps to the function the
// computer's own Miya Studio or Calendar uses; a phone gets nothing the computer lacks.
import { mediaOffered, type MediaRef } from './contentMirror';
import { ensurePreview, readPiece, PREVIEW_PIECE_BYTES } from './phonePreviews';
import { previewFits } from './phoneLink';

type Args = Record<string, unknown>;

export const NOT_OFFERED = "That file isn't one this project offers.";

/** Said when previews would pass the relay's daily allowance (keeping room for approvals and chat). */
export function previewLimitLine(resetsAtMs: number | null): string {
  if (resetsAtMs == null) return "Today's limit for previews is used up; try again tomorrow.";
  const at = new Date(resetsAtMs);
  const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return `Today's limit for previews is used up; it resets at ${hhmm}.`;
}

/** The sealed characters a piece of `raw` bytes becomes: base64 inside the message, sealed, then base64 again. */
function sealedChars(raw: number): number {
  return Math.ceil(((Math.ceil(raw / 3) * 4 + 512) * 4) / 3);
}

function mediaRef(value: unknown): MediaRef | null {
  const v = value as Partial<MediaRef> | null;
  if (!v || typeof v !== 'object') return null;
  if (typeof v.projectId !== 'string' || typeof v.path !== 'string') return null;
  if (v.kind !== 'video' && v.kind !== 'picture') return null;
  return { projectId: v.projectId, path: v.path, kind: v.kind };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type PreviewPiece = { mime: string; bytes: number; sha256: string; pieces: number; piece?: number; data?: string; pieceSha256?: string };

/** `media.preview`: `{ ref, info: true }` gives the size and hash; `{ ref, piece }` one piece of
 *  the phone-sized copy, with the SHA-256 of its text so the phone can spot a damaged piece. */
export async function mediaPreview(args: Args): Promise<PreviewPiece> {
  const ref = mediaRef(args.ref);
  if (!ref || !mediaOffered(ref)) throw new Error(NOT_OFFERED);
  const piece = Number(args.piece);
  const info = await ensurePreview(ref);
  if (info.ok === false) throw new Error(info.reason);
  if (args.info === true) return { mime: info.mime, bytes: info.bytes, sha256: info.sha256, pieces: info.pieces };
  if (!Number.isInteger(piece) || piece < 0 || piece >= info.pieces) throw new Error('That piece of the preview does not exist.');
  const raw = Math.min(PREVIEW_PIECE_BYTES, info.bytes - piece * PREVIEW_PIECE_BYTES);
  const fits = previewFits(sealedChars(raw));
  if (fits.ok === false) throw new Error(previewLimitLine(fits.resetsAtMs));
  const data = await readPiece(info.path, piece);
  return { mime: info.mime, bytes: info.bytes, sha256: info.sha256, pieces: info.pieces, piece, data, pieceSha256: await sha256Hex(data) };
}
