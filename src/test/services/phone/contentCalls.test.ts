import { describe, it, expect, vi, beforeEach } from 'vitest';

const offered = vi.fn();
const ensurePreview = vi.fn();
const readPiece = vi.fn();
vi.mock('../../../services/phone/contentMirror', () => ({ mediaOffered: (r: unknown) => offered(r), contentMirrorData: () => ({}) }));
vi.mock('../../../services/phone/phonePreviews', () => ({
  ensurePreview: (r: unknown) => ensurePreview(r),
  readPiece: (p: string, i: number) => readPiece(p, i),
}));

import { mediaPreview } from '../../../services/phone/contentCalls';

const ref = { projectId: 'p1', path: 'shop/p1/output/v1.mp4', kind: 'video' };

beforeEach(() => {
  offered.mockReset().mockReturnValue(true);
  ensurePreview.mockReset().mockResolvedValue({ ok: true, path: 'shop/p1/output/phone-previews/a.mp4', bytes: 6_000_000, sha256: 'abc', mime: 'video/mp4', pieces: 3 });
  readPiece.mockReset().mockResolvedValue('QUJD');
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
});
