import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPreview, prunePreviews, previewKey, previewSizeLine, PREVIEW_ASK_BYTES, type PreviewStore } from '../../mobile/previewFetch';

const ref = { projectId: 'p1', path: 'shop/p1/output/v1.mp4', kind: 'video' as const };

async function hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const d = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

// A 7-byte "video" sent in pieces of 3, 3 and 1 bytes.
const FILE = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);
const PIECES = [FILE.slice(0, 3), FILE.slice(3, 6), FILE.slice(6)];

function memoryStore(): PreviewStore & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    async get(key) { return files.has(key) ? `blob:${key}` : null; },
    async put(key, bytes) { files.set(key, bytes); return `blob:${key}`; },
    async remove(key) { files.delete(key); },
    async keys() { return [...files.keys()]; },
  };
}

let sha: string;
let bytes = 7;
const call = vi.fn();
function phoneCall(damageOnce: number | null = null) {
  let damaged = false;
  call.mockImplementation(async (_name: string, args: any) => {
    if (args.info) return { ok: true, value: { mime: 'video/mp4', bytes, sha256: sha, pieces: 3 } };
    const data = b64(PIECES[args.piece]);
    const sent = args.piece === damageOnce && !damaged ? (damaged = true, b64(new Uint8Array([9, 9, 9]))) : data;
    return { ok: true, value: { mime: 'video/mp4', bytes, sha256: sha, pieces: 3, piece: args.piece, data: sent, pieceSha256: await hex(data) } };
  });
}

beforeEach(async () => { call.mockReset(); sha = await hex(FILE); bytes = 7; });

describe('fetching a preview on the phone', () => {
  it('pieces are put together and the SHA-256 is checked before it plays', async () => {
    phoneCall();
    const store = memoryStore();
    const r = await fetchPreview(ref, { call, store, network: async () => 'wifi', confirm: async () => true });
    expect(r).toEqual({ ok: true, url: `blob:${await previewKey(ref)}` });
    expect([...store.files.get(await previewKey(ref))!]).toEqual([...FILE]);
    expect(call).toHaveBeenCalledWith('media.preview', { ref, info: true });
    expect(call).toHaveBeenCalledWith('media.preview', { ref, piece: 2 });
  });

  it('a piece that arrives corrupted is fetched again and the hash is checked', async () => {
    phoneCall(1);
    const r = await fetchPreview(ref, { call, store: memoryStore(), network: async () => 'wifi', confirm: async () => true });
    expect(r.ok).toBe(true);
    expect(call.mock.calls.filter(([, a]) => a.piece === 1)).toHaveLength(2);
  });

  it('a whole file whose hash is wrong is not shown', async () => {
    phoneCall();
    sha = 'not-the-hash';
    const store = memoryStore();
    const r = await fetchPreview(ref, { call, store, network: async () => 'wifi', confirm: async () => true });
    expect(r).toEqual({ ok: false, reason: "The preview didn't arrive whole. Try again." });
    expect(store.files.size).toBe(0);
  });

  it('on mobile data a preview over 20 MB asks first, and No loads nothing', async () => {
    phoneCall();
    bytes = 34 * 1024 * 1024;
    const confirm = vi.fn(async () => false);
    const r = await fetchPreview(ref, { call, store: memoryStore(), network: async () => 'cellular', confirm });
    expect(PREVIEW_ASK_BYTES).toBe(20 * 1024 * 1024);
    expect(confirm).toHaveBeenCalledWith(34 * 1024 * 1024);
    expect(r.ok).toBe(false);
    expect(call.mock.calls.every(([, a]) => a.info === true)).toBe(true);
    expect(previewSizeLine(34 * 1024 * 1024, 'video')).toBe('This video is 34 MB. Load it on mobile data?');
  });

  it('on Wi-Fi it loads without asking', async () => {
    phoneCall();
    bytes = 34 * 1024 * 1024;
    const confirm = vi.fn(async () => false);
    bytes = 7;
    await fetchPreview(ref, { call, store: memoryStore(), network: async () => 'wifi', confirm });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('a cached preview is shown without any call', async () => {
    const store = memoryStore();
    store.files.set(await previewKey(ref), FILE);
    const r = await fetchPreview(ref, { call, store, network: async () => 'cellular', confirm: async () => false });
    expect(r).toEqual({ ok: true, url: `blob:${await previewKey(ref)}` });
    expect(call).not.toHaveBeenCalled();
  });

  it("the computer's refusal is passed on in its words", async () => {
    call.mockResolvedValue({ ok: false, error: "Today's limit for previews is used up; try again tomorrow." });
    const r = await fetchPreview(ref, { call, store: memoryStore(), network: async () => 'wifi', confirm: async () => true });
    expect(r).toEqual({ ok: false, reason: "Today's limit for previews is used up; try again tomorrow." });
  });

  it('prunePreviews removes what is no longer waiting', async () => {
    const store = memoryStore();
    store.files.set('a', FILE); store.files.set('b', FILE);
    await prunePreviews(store, new Set(['b']));
    expect([...store.files.keys()]).toEqual(['b']);
  });
});
