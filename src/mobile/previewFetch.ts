// Fetching a preview on the phone (phone app, phase 2). The computer sends a phone-sized
// copy in pieces (media.preview); each piece is checked against its own hash and fetched
// again once if it arrived damaged, and the whole file against its SHA-256 before it is
// shown. On mobile data a preview over 20 MB says its size and asks first. Previews are
// kept on the phone until their post goes out or is rejected (prunePreviews).
import type { MediaRef } from '../services/phone/contentMirror';

export const PREVIEW_ASK_BYTES = 20 * 1024 * 1024;
export const NOT_WHOLE = "The preview didn't arrive whole. Try again.";
export const NOT_LOADED = 'Not loaded on mobile data.';

export interface PreviewStore {
  get(key: string): Promise<string | null>;
  put(key: string, bytes: Uint8Array, mime: string): Promise<string>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

type CallResult = { ok: boolean; value?: unknown; error?: string };
type Info = { mime: string; bytes: number; sha256: string; pieces: number };
type Piece = Info & { piece: number; data: string; pieceSha256: string };

export interface FetchDeps {
  call(name: 'media.preview', args: unknown): Promise<CallResult>;
  store: PreviewStore;
  network(): Promise<'wifi' | 'cellular' | 'none'>;
  confirm(bytes: number): Promise<boolean>;
}

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The file name a preview is kept under on the phone. */
export function previewKey(ref: MediaRef): Promise<string> {
  return sha256Hex(`${ref.projectId}|${ref.path}`);
}

export function previewSizeLine(bytes: number, kind: MediaRef['kind']): string {
  return `This ${kind} is ${Math.round(bytes / (1024 * 1024))} MB. Load it on mobile data?`;
}

function fromBase64(text: string): Uint8Array {
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export async function fetchPreview(ref: MediaRef, deps: FetchDeps): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  const key = await previewKey(ref);
  const cached = await deps.store.get(key);
  if (cached) return { ok: true, url: cached };

  const head = await deps.call('media.preview', { ref, info: true });
  if (!head.ok) return { ok: false, reason: head.error || NOT_WHOLE };
  const info = head.value as Info;
  if ((await deps.network()) === 'cellular' && info.bytes > PREVIEW_ASK_BYTES && !(await deps.confirm(info.bytes))) {
    return { ok: false, reason: NOT_LOADED };
  }

  const parts: Uint8Array[] = [];
  for (let i = 0; i < info.pieces; i += 1) {
    let part: Uint8Array | null = null;
    for (let attempt = 0; attempt < 2 && !part; attempt += 1) {
      const r = await deps.call('media.preview', { ref, piece: i });
      if (!r.ok) return { ok: false, reason: r.error || NOT_WHOLE };
      const p = r.value as Piece;
      if (p.sha256 !== info.sha256) return { ok: false, reason: NOT_WHOLE };
      if ((await sha256Hex(p.data)) === p.pieceSha256) part = fromBase64(p.data);
    }
    if (!part) return { ok: false, reason: NOT_WHOLE };
    parts.push(part);
  }
  const whole = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { whole.set(p, at); at += p.length; }
  if ((await sha256Hex(whole)) !== info.sha256) return { ok: false, reason: NOT_WHOLE };
  return { ok: true, url: await deps.store.put(key, whole, info.mime) };
}

/** Removes previews whose keys are not in `keep` (their post went out or was rejected). */
export async function prunePreviews(store: PreviewStore, keep: Set<string>): Promise<void> {
  for (const key of await store.keys()) if (!keep.has(key)) await store.remove(key);
}
