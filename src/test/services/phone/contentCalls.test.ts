import { describe, it, expect, vi, beforeEach } from 'vitest';

const offered = vi.fn();
const ensurePreview = vi.fn();
const readPiece = vi.fn();
vi.mock('../../../services/phone/contentMirror', () => ({ mediaOffered: (r: unknown) => offered(r), contentMirrorData: () => ({}) }));
vi.mock('../../../services/phone/phonePreviews', () => ({
  ensurePreview: (r: unknown) => ensurePreview(r),
  readPiece: (p: string, i: number) => readPiece(p, i),
  PREVIEW_PIECE_BYTES: 2.5 * 1024 * 1024,
}));

const previewFits = vi.fn();
vi.mock('../../../services/phone/phoneLink', () => ({ previewFits: (c: number) => previewFits(c) }));

import { mediaPreview, previewLimitLine } from '../../../services/phone/contentCalls';

const ref = { projectId: 'p1', path: 'shop/p1/output/v1.mp4', kind: 'video' };

beforeEach(() => {
  offered.mockReset().mockReturnValue(true);
  ensurePreview.mockReset().mockResolvedValue({ ok: true, path: 'shop/p1/output/phone-previews/a.mp4', bytes: 6_000_000, sha256: 'abc', mime: 'video/mp4', pieces: 3 });
  readPiece.mockReset().mockResolvedValue('QUJD');
  previewFits.mockReset().mockReturnValue({ ok: true });
});

describe('media.preview', () => {
  it("a listed video's piece 0 comes with the size, hash and piece count", async () => {
    expect(await mediaPreview({ ref, piece: 0 })).toEqual({ mime: 'video/mp4', bytes: 6_000_000, sha256: 'abc', pieces: 3, piece: 0, data: 'QUJD' });
    expect(readPiece).toHaveBeenCalledWith('shop/p1/output/phone-previews/a.mp4', 0);
  });

  it('a path that is not a listed media file of a mirrored project is refused', async () => {
    offered.mockReturnValue(false);
    await expect(mediaPreview({ ref: { ...ref, path: '../secrets.mp4' }, piece: 0 })).rejects.toThrow();
    expect(ensurePreview).not.toHaveBeenCalled();
    expect(readPiece).not.toHaveBeenCalled();
  });

  it('a piece past the last is refused', async () => {
    await expect(mediaPreview({ ref, piece: 3 })).rejects.toThrow();
    await expect(mediaPreview({ ref, piece: -1 })).rejects.toThrow();
    expect(readPiece).not.toHaveBeenCalled();
  });

  it('a preview that could not be made says why', async () => {
    ensurePreview.mockResolvedValue({ ok: false, reason: 'Not ready yet: the computer is still making it.' });
    await expect(mediaPreview({ ref, piece: 0 })).rejects.toThrow('Not ready yet');
  });

  it('a malformed reference is refused before anything is read', async () => {
    await expect(mediaPreview({ ref: { projectId: 'p1', path: 5, kind: 'video' }, piece: 0 })).rejects.toThrow();
    await expect(mediaPreview({ ref: { ...ref, kind: 'audio' }, piece: 0 })).rejects.toThrow();
    expect(offered).not.toHaveBeenCalled();
  });

  it("a piece that would pass the relay's daily limit is refused in plain words before it is read", async () => {
    previewFits.mockReturnValue({ ok: false, resetsAtMs: new Date(2026, 10, 2, 14, 5).getTime() });
    await expect(mediaPreview({ ref, piece: 0 })).rejects.toThrow("Today's limit for previews is used up; it resets at 14:05.");
    expect(readPiece).not.toHaveBeenCalled();
    expect(previewFits.mock.calls[0][0]).toBeGreaterThan(2.5 * 1024 * 1024 * 4 / 3);
  });

  it('the last, smaller piece is measured by its own size', async () => {
    await mediaPreview({ ref, piece: 2 });
    const lastPiece = 6_000_000 - 2 * 2.5 * 1024 * 1024;
    expect(previewFits.mock.calls[0][0]).toBeLessThan(lastPiece * 2);
    expect(previewLimitLine(null)).toBe("Today's limit for previews is used up; try again tomorrow.");
  });
});
