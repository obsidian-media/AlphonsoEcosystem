import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
const project: any = { id: 'p1', steps: { scenes: { status: 'done' } } };
vi.mock('../../../services/contentFactory/contentProjectService', () => ({ getProject: () => project }));

import { ensurePreview, readPiece, PREVIEW_PIECE_BYTES, FILE_GONE, NOT_READY } from '../../../services/phone/phonePreviews';

const ref = { projectId: 'p1', path: 'shop/p1/output/v1-16x9.mp4', kind: 'video' as const };

beforeEach(() => {
  invoke.mockReset();
  project.steps = { scenes: { status: 'done' } };
  localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:/Out' }));
});

describe('phone previews on the computer', () => {
  it('asks the backend once and counts the pieces', async () => {
    invoke.mockResolvedValue({ ok: true, path: 'shop/p1/output/phone-previews/a.mp4', bytes: 6_000_000, sha256: 'abc', mime: 'video/mp4' });
    const r = await ensurePreview(ref);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('content_phone_preview', { request: { workspaceRoot: 'D:/Out', relativePath: ref.path, kind: 'video' } });
    expect(PREVIEW_PIECE_BYTES).toBe(2.5 * 1024 * 1024);
    expect(r).toEqual({ ok: true, path: 'shop/p1/output/phone-previews/a.mp4', bytes: 6_000_000, sha256: 'abc', mime: 'video/mp4', pieces: 3 });
  });

  it('a missing file answers FILE_GONE', async () => {
    invoke.mockResolvedValue({ ok: false, reason: 'The file is no longer on your computer.' });
    expect(await ensurePreview(ref)).toEqual({ ok: false, reason: FILE_GONE });
  });

  it('a missing file while the project is still working answers NOT_READY', async () => {
    project.steps = { assemble: { status: 'running' } };
    invoke.mockResolvedValue({ ok: false, reason: 'The file is no longer on your computer.' });
    expect(await ensurePreview(ref)).toEqual({ ok: false, reason: NOT_READY });
  });

  it('says to choose an output folder when none is set', async () => {
    localStorage.setItem('alphonso_settings', '{}');
    const r = await ensurePreview(ref);
    expect(r.ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reads one piece by its index', async () => {
    invoke.mockResolvedValue({ ok: true, base64: 'QUJD' });
    expect(await readPiece('shop/p1/output/phone-previews/a.mp4', 2)).toBe('QUJD');
    expect(invoke).toHaveBeenCalledWith('content_read_file_part', {
      request: { workspaceRoot: 'D:/Out', relativePath: 'shop/p1/output/phone-previews/a.mp4', offset: 2 * PREVIEW_PIECE_BYTES, length: PREVIEW_PIECE_BYTES },
    });
  });
});
