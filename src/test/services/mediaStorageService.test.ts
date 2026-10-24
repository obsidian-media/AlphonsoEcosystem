// Phase 3c: the user's own storage, used only to hand a file to a platform by a link.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const invoke = vi.fn();
const creds: Record<string, string> = {};
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: (_id: string, key: string) => creds[key] || '',
}));

import { storageConfigured, stageFile, removeStaged, cleanOldStaged, testStorage, stagedKey } from '../../services/mediaStorageService';

function setUp() {
  Object.assign(creds, {
    STORAGE_ENDPOINT: 'r2.example.com', STORAGE_REGION: 'auto', STORAGE_BUCKET: 'media',
    STORAGE_ACCESS_KEY: 'ak', STORAGE_SECRET_KEY: 'sk', STORAGE_PATH_STYLE: 'true',
  });
}
const config = { endpoint: 'r2.example.com', region: 'auto', bucket: 'media', accessKey: 'ak', secretKey: 'sk', pathStyle: true };

beforeEach(() => {
  invoke.mockReset();
  for (const k of Object.keys(creds)) delete creds[k];
});

describe('stageFile', () => {
  it('without storage says so, and sends nothing', async () => {
    expect(await storageConfigured()).toBe(false);
    expect(await stageFile('D:/out', 'b/p/output/v1.mp4')).toEqual({ ok: false, reason: 'No storage is set up.' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('passes the saved keys and returns the link', async () => {
    setUp();
    invoke.mockResolvedValue({ ok: true, url: 'https://link', key: 'k' });
    const result = await stageFile('D:/out', 'b/p/output/v1.mp4', new Date(2026, 9, 24).getTime());
    expect(result).toEqual({ ok: true, url: 'https://link', key: expect.stringMatching(/^alphonso-staged\/2026-10-24\/[a-z0-9]{8}-v1\.mp4$/) });
    expect(invoke).toHaveBeenCalledWith('storage_put_file', {
      config, workspaceRoot: 'D:/out', relativePath: 'b/p/output/v1.mp4', key: result.key,
    });
  });

  it('passes a refusal on', async () => {
    setUp();
    invoke.mockResolvedValue({ ok: false, key: 'k', reason: 'Your storage refused the upload (403 AccessDenied).' });
    expect(await stageFile('D:/out', 'x.png')).toEqual({ ok: false, reason: 'Your storage refused the upload (403 AccessDenied).' });
  });
});

it('stagedKey keeps only a safe file name', () => {
  expect(stagedKey('a/b/My clip (1).mp4', new Date(2026, 0, 2).getTime())).toMatch(/^alphonso-staged\/2026-01-02\/[a-z0-9]{8}-My-clip-1-.mp4$/);
});

it('removeStaged never throws', async () => {
  setUp();
  invoke.mockRejectedValue(new Error('offline'));
  await expect(removeStaged('alphonso-staged/x')).resolves.toBeUndefined();
});

it('cleanOldStaged deletes only files older than a day', async () => {
  setUp();
  const now = new Date('2026-10-24T12:00:00Z').getTime();
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'storage_list_staged') {
      return [
        { key: 'alphonso-staged/old.mp4', lastModified: '2026-10-23T11:00:00.000Z' },
        { key: 'alphonso-staged/new.mp4', lastModified: '2026-10-24T11:00:00.000Z' },
        { key: 'alphonso-staged/unknown.mp4', lastModified: '' },
      ];
    }
    return { ok: true };
  });
  expect(await cleanOldStaged(now)).toBe(1);
  expect(invoke).toHaveBeenCalledWith('storage_delete', { config, key: 'alphonso-staged/old.mp4' });
  expect(invoke).not.toHaveBeenCalledWith('storage_delete', expect.objectContaining({ key: 'alphonso-staged/new.mp4' }));
});

it('cleanOldStaged does nothing without storage', async () => {
  expect(await cleanOldStaged(Date.now())).toBe(0);
  expect(invoke).not.toHaveBeenCalled();
});

it('testStorage passes the result of each part on', async () => {
  setUp();
  const parts = { upload: { ok: true }, link: { ok: false, reason: 'The link did not open the file (403).' }, delete: { ok: true } };
  invoke.mockResolvedValue(parts);
  expect(await testStorage()).toEqual(parts);
  expect(invoke).toHaveBeenCalledWith('storage_test', { config });
});
