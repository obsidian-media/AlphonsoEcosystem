// Phase 4c: characters on the brand — made-up or a real person (with permission), 5–20 pictures.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const saved: Record<string, string> = {};
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === 'kv_set' || cmd === 'kv_get') return null;
    if (cmd === 'save_image_to_folder') { saved[`${args.folder}\\${args.filename}`] = args.base64Data; return { path: `${args.folder}\\${args.filename}` }; }
    if (cmd === 'delete_workspace_file' || cmd === 'higgsfield_delete_request') return { ok: true };
    throw new Error(`unexpected command ${cmd}`);
  }),
}));
vi.mock('../../../services/connectors/connectorImageGenerators', () => ({
  generateComfyUiImage: vi.fn(async () => ({ ok: true, previewBase64: 'PIC' })),
  getComfyUiEndpoint: vi.fn(() => 'http://127.0.0.1:8188'),
}));

import { invoke } from '@tauri-apps/api/core';
import { generateComfyUiImage } from '../../../services/connectors/connectorImageGenerators';
import { getBrand, saveBrand } from '../../../services/contentFactory/contentBrandService';
import {
  addCharacter, updateCharacter, deleteCharacter, setMainCharacter, setPermission, addCharacterPictures,
  removeCharacterPicture, makeCharacterPictures, characterUsable,
} from '../../../services/contentFactory/contentCharacters';

const settings = { outputFolder: 'D:\\Content' };
const pics = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `p${i}.png`, base64: `B${i}` }));

beforeEach(() => {
  localStorage.clear();
  for (const k of Object.keys(saved)) delete saved[k];
  vi.clearAllMocks();
});

describe('characters on the brand', () => {
  it('are added, changed, made the main one and deleted with their pictures', async () => {
    const brand = saveBrand({ name: 'Learn' });
    const c = addCharacter(brand.id, { name: 'Ana', kind: 'made_up', description: 'a cheerful teacher with red glasses' });
    updateCharacter(brand.id, c.id, { name: 'Ana Rose' });
    setMainCharacter(brand.id, c.id);
    expect(getBrand(brand.id)!.characters![0]).toMatchObject({ name: 'Ana Rose', kind: 'made_up', pictures: [] });
    expect(getBrand(brand.id)!.mainCharacterId).toBe(c.id);
    await addCharacterPictures(brand.id, c.id, pics(2), settings);
    const kept = getBrand(brand.id)!.characters![0].pictures;
    expect(kept).toHaveLength(2);
    expect(kept[0]).toMatch(new RegExp(`^${brand.folderName}/characters/${c.id}/`));
    await deleteCharacter(brand.id, c.id, settings);
    expect(getBrand(brand.id)!.characters).toEqual([]);
    expect(getBrand(brand.id)!.mainCharacterId).toBeUndefined();
    expect(vi.mocked(invoke).mock.calls.filter((call) => call[0] === 'delete_workspace_file')).toHaveLength(2);
  });

  it('deleting a trained character asks Higgsfield to delete it too', async () => {
    const brand = saveBrand({ name: 'Learn' });
    const c = addCharacter(brand.id, { name: 'Ana', kind: 'made_up', description: 'x' });
    updateCharacter(brand.id, c.id, { higgsfield: { status: 'ready', characterId: 's-1', requestId: 'req-t' } });
    await deleteCharacter(brand.id, c.id, settings);
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('higgsfield_delete_request', expect.objectContaining({ requestId: 'req-t' }));
  });

  it('pictures are never saved over each other', async () => {
    const brand = saveBrand({ name: 'Learn' });
    const c = addCharacter(brand.id, { name: 'Ana', kind: 'made_up', description: 'x' });
    await addCharacterPictures(brand.id, c.id, [{ name: 'a.png', base64: 'A' }], settings);
    await addCharacterPictures(brand.id, c.id, [{ name: 'a.png', base64: 'B' }], settings);
    const kept = getBrand(brand.id)!.characters![0].pictures;
    expect(new Set(kept).size).toBe(2);
    removeCharacterPicture(brand.id, c.id, kept[0]);
    expect(getBrand(brand.id)!.characters![0].pictures).toEqual([kept[1]]);
  });

  it('a real person needs the permission tick, with its date, and 5 pictures', async () => {
    const brand = saveBrand({ name: 'Me' });
    const c = addCharacter(brand.id, { name: 'Shay', kind: 'real_person', description: 'the creator' });
    await addCharacterPictures(brand.id, c.id, pics(4), settings);
    expect(characterUsable(getBrand(brand.id)!.characters![0])).toEqual({ ok: false, reason: 'Tick that this is you or that you have permission first.' });
    setPermission(brand.id, c.id, true);
    const ticked = getBrand(brand.id)!.characters![0];
    expect(typeof ticked.permission?.atMs).toBe('number');
    expect(characterUsable(ticked)).toEqual({ ok: false, reason: 'Add at least 5 pictures.' });
    await addCharacterPictures(brand.id, c.id, pics(1), settings);
    expect(characterUsable(getBrand(brand.id)!.characters![0])).toEqual({ ok: true });
    setPermission(brand.id, c.id, false);
    expect(getBrand(brand.id)!.characters![0].permission).toBeUndefined();
  });

  it('Miya makes 8 pictures of a made-up character with ComfyUI', async () => {
    const brand = saveBrand({ name: 'Learn' });
    const c = addCharacter(brand.id, { name: 'Ana', kind: 'made_up', description: 'a cheerful teacher with red glasses' });
    const made = await makeCharacterPictures(brand.id, c.id, settings);
    expect(made).toEqual({ made: 8, failed: 0 });
    expect(generateComfyUiImage).toHaveBeenCalledTimes(8);
    expect(vi.mocked(generateComfyUiImage).mock.calls[0][0].prompt).toContain('a cheerful teacher with red glasses');
    const kept = getBrand(brand.id)!.characters![0].pictures;
    expect(kept).toHaveLength(8);
    expect(kept[0]).toMatch(/\/miya-1-[0-9a-f]{4}\.png$/);
  });

  it('Miya makes pictures only for a made-up character', async () => {
    const brand = saveBrand({ name: 'Me' });
    const c = addCharacter(brand.id, { name: 'Shay', kind: 'real_person', description: 'x' });
    await expect(makeCharacterPictures(brand.id, c.id, settings)).rejects.toThrow('Add your own photos for a real person.');
  });
});
